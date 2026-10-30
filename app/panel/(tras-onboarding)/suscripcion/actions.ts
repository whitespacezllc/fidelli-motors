"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
// ⚠ `sesionParaEscribir()` NO SIRVE ACÁ, y es el único lugar del panel
// donde eso es cierto: esa función rebota a /panel a los tenants
// suspendidos, y un tenant suspendido es exactamente el que más necesita
// esta pantalla. Cortarle el acceso al pago al que está suspendido POR
// FALTA DE PAGO sería el bucle más absurdo que podríamos construir.
//
// Esta acción tampoco "solo lee" —crea una orden—, así que no entra en la
// excepción que la regla contempla. Por eso la guarda va escrita a mano
// abajo, explícita y completa: sesión, rol owner y tenant.
// eslint-disable-next-line no-restricted-imports
import { obtenerSesion } from "@/lib/auth/session";
import { crearClienteAdmin } from "@/lib/supabase/admin";
import {
  aliasDe,
  aliasDeOrden,
  crearOrdenDePago,
  cvuDe,
  ErrorCresium,
  esAliasTomado,
} from "@/lib/cresium/cliente";
import {
  conIntentos,
  estadoEfectivo,
  estadoEfectivoDedicado,
  externalIdDedicado,
  periodoHastaDeLaOrden,
} from "@/lib/cresium/orden";
import { hoyISO } from "@/lib/fechas";
import { MESES_DEL_PERIODO, type Periodo } from "@/lib/fidelli/plan";

export type EstadoOrden = { error?: string; ok?: boolean };

const PERIODOS_VALIDOS: Periodo[] = ["mensual", "semestral", "anual"];

// ⚠ SON DOS PANTALLAS Y LAS DOS MUESTRAN LA ORDEN. Desde el sprint del
// onboarding, `PantallaPago` también se monta en /panel/onboarding (la
// cuarta pantalla). Revalidar solo /panel/suscripcion dejaba al dueño que
// generó la cuenta DESDE EL ONBOARDING mirando la pantalla vieja, sin el
// CVU que acababa de pedir.
function revalidarPantallasDePago() {
  revalidatePath("/panel/suscripcion");
  revalidatePath("/panel/onboarding");
}

// ============================================================
// Crear la orden de pago
//
// ⚠ SE ELIGE PERÍODO, NUNCA PLAN. Cambiar de Basic a Pro es una
// conversación de venta por WhatsApp, a propósito: una pantalla que
// resuelve sola un upgrade se pierde la conversación que lo hace durar.
//
// ⚠ ESTA ACCIÓN MUEVE PLATA DE VERDAD. Crea un CVU real en Cresium que
// puede recibir transferencias reales, y no hay entorno de pruebas donde
// ensayarlo (ver lib/cresium/cliente.ts). Las pruebas van contra el doble
// local (scripts/doble-cresium.mjs); la regresión de la orden es
// scripts/regresion-cresium-orden.mjs.
// ============================================================
export async function crearOrden(
  _prev: EstadoOrden,
  formData: FormData,
): Promise<EstadoOrden> {
  const sesion = await obtenerSesion();
  if (!sesion?.lubricentroId) redirect("/login");
  if (sesion.rol !== "owner") redirect("/panel");
  const lubricentroId = sesion.lubricentroId;

  // ⚠ PERO LA SUSPENSIÓN MANUAL SÍ SE RECHAZA. `activo = false` lo apagó
  // Fidelli y pagar no lo levanta: emitirle un CVU es invitarlo a
  // transferir para nada (hallazgo #5 de la verificación del 26/09). La
  // orden que tuviera viva ya la cerró la base al apagarlo (trigger
  // cerrar_ordenes_al_suspender); acá no se le abre otra. El suspendido
  // POR RELOJ pasa: para él esta acción es la salida.
  if (!sesion.lubricentroActivo) {
    return { error: "Tu cuenta está suspendida por Fidelli. Escribinos y lo resolvemos." };
  }

  const periodo = String(formData.get("periodo") ?? "");
  if (!PERIODOS_VALIDOS.includes(periodo as Periodo)) {
    return { error: "Elegí un período para renovar." };
  }

  // El monto lo calcula LA BASE, nunca el formulario: el período es lo
  // único que viaja desde el cliente. Si el monto viniera del form,
  // cualquiera podría pagar $1 y quedar al día.
  //
  // ⚠ Y SE CALCULA PARA EL PERÍODO ELEGIDO, no para el contratado. La
  // primera versión llamaba a `monto_de_renovacion()`, que usa el período
  // que el tenant YA tiene: alguien que elegía anual se llevaba doce meses
  // de suscripción al precio de uno. Se vio probando el flujo completo
  // contra el doble — la orden quedó en $71.750 con vencimiento a 2027.
  const supabase = crearClienteAdmin();

  const { data: sub } = await supabase
    .from("suscripciones")
    .select("id, vencimiento")
    .eq("lubricentro_id", sesion.lubricentroId)
    .order("inicio", { ascending: false })
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (!sub) return { error: "No encontramos tu suscripción. Escribinos y lo vemos." };

  // El alias FIJO del tenant, si tiene. Null —que hoy es el caso de los 17—
  // significa "todavía no se le asignó", y entonces se sigue derivando de
  // la orden como siempre. El corte es este dato y nada más.
  const { data: tenant } = await supabase
    .from("lubricentros")
    .select("cresium_alias, cresium_cvu, cresium_deposit_address_id")
    .eq("id", lubricentroId)
    .maybeSingle();

  // El período se aplica sobre el vencimiento actual, no sobre hoy: pagar
  // tres días antes no puede regalarle al tenant tres días menos.
  const { data: montoCrudo, error: errMonto } = await supabase.rpc("monto_de_renovacion_en", {
    p_lubricentro: sesion.lubricentroId,
    p_periodo: periodo as Periodo,
  });

  if (errMonto || !montoCrudo) {
    return { error: "No pudimos calcular el monto. Probá de nuevo en un momento." };
  }

  const monto = Number((montoCrudo as { total?: number }).total);
  if (!Number.isFinite(monto) || monto <= 0) {
    // Un tenant con 100% de descuento no tiene nada que pagar, y no
    // debería haber llegado hasta acá. Se lo dice, no se lo manda a
    // transferir cero pesos.
    return { error: "Tu plan no tiene nada por cobrar. Si creés que es un error, escribinos." };
  }

  // ⚠ HASTA CUÁNDO COMPRA: `greatest(vencimiento, hoy) + período`, y no
  // `vencimiento + período` como hasta el 26/09. Las dos mitades son de
  // Santiago: el que paga DENTRO del ciclo no gana días (el período se
  // apoya en el vencimiento), y el que paga DESPUÉS de vencido compra un
  // período ENTERO desde hoy. Con la cuenta vieja, un tenant vencido el
  // 01/10, suspendido el 09/10 y pagando el 20/11 compraba hasta el 01/11
  // —ya pasado—: pagaba y seguía suspendido. La regla vive en
  // lib/cresium/orden.ts (pura, con su regresión); la base la acompaña con
  // `greatest(v_venc, v_hasta)` al acreditar (R36d). El "hoy" es el del
  // negocio (hora argentina), nunca el del proceso.
  const hastaISO = periodoHastaDeLaOrden(
    sub.vencimiento,
    hoyISO(),
    MESES_DEL_PERIODO[periodo as Periodo],
  );

  // ============================================================
  // LA CUENTA FIJA (20261031100000): la orden es NUESTRA
  //
  // El tenant con su CVU dedicado no le pide nada a Cresium para renovar.
  // Lo que «Quiero pagar» deja es una fila interna con el período que
  // eligió y el monto que vio: la pantalla le muestra su cuenta de siempre
  // con ese monto, y el webhook acredita por monto exacto cuando entre.
  // Si ya hay una orden interna viva de ESE período con el monto de hoy,
  // se reusa; una vieja con otro monto (cambió el precio) se cierra.
  // ============================================================
  if (tenant?.cresium_cvu && tenant.cresium_alias && tenant.cresium_deposit_address_id) {
    const { data: internas } = await supabase
      .from("cresium_ordenes")
      .select("id, external_id, estado, monto, periodo")
      .eq("suscripcion_id", sub.id)
      .not("deposit_address_id", "is", null)
      .in("estado", ["NOT_PAID", "PARTIAL"])
      .order("created_at", { ascending: false });

    const delPeriodo = (internas ?? []).filter((o) => o.periodo === periodo);
    const vivaConElMonto = delPeriodo.find(
      (o) => estadoEfectivoDedicado(o.estado, Number(o.monto), monto) !== "EXPIRED",
    );
    if (vivaConElMonto) {
      revalidarPantallasDePago();
      return { ok: true };
    }
    // Las del mismo período con el monto viejo ya no representan nada.
    const viejas = delPeriodo.map((o) => o.id);
    if (viejas.length > 0) {
      await supabase
        .from("cresium_ordenes")
        .update({ estado: "CERRADA", actualizado_at: new Date().toISOString() })
        .in("id", viejas);
    }
    // La referencia lleva el número de intento por el unique de la tabla
    // (regla 20), aunque acá nada se queme: contar las que ya existen con
    // esa base alcanza.
    const { count } = await supabase
      .from("cresium_ordenes")
      .select("id", { count: "exact", head: true })
      .like("external_id", `cvu:${sub.id}:${hastaISO}%`);
    const { error: errInterna } = await supabase.from("cresium_ordenes").insert({
      lubricentro_id: lubricentroId,
      suscripcion_id: sub.id,
      external_id: externalIdDedicado(sub.id, hastaISO, (count ?? 0) + 1),
      periodo: periodo as Periodo,
      periodo_hasta: hastaISO,
      monto,
      alias: tenant.cresium_alias,
      cvu: tenant.cresium_cvu,
      deposit_address_id: tenant.cresium_deposit_address_id,
      estado: "NOT_PAID",
    });
    if (errInterna) {
      console.error(`[cresium] no se pudo registrar la orden interna del tenant ${lubricentroId}: ${errInterna.message}`);
      return { error: "No pudimos registrar tu elección. Probá de nuevo en un momento." };
    }
    revalidarPantallasDePago();
    return { ok: true };
  }

  // ---------- Sin cuenta fija todavía: el pago único de siempre ----------
  const { data: externalId } = await supabase.rpc("cresium_external_id", {
    p_suscripcion: sub.id,
    p_hasta: hastaISO,
  });

  if (!externalId) return { error: "No pudimos armar la referencia del pago." };

  // ¿Ya hay una orden VIVA para esta renovación? Se reusa. Emitir un CVU
  // nuevo cada vez que alguien vuelve a la pantalla dejaría al dueño con
  // dos CVUs distintos copiados y la plata en el que ya no miramos.
  //
  // "Viva" = sin pagar y sin vencer. Una orden vencida no se reusa: su CVU
  // está dado de baja y transferirle no acredita nada — y como nadie nos
  // avisa del vencimiento, se calcula (`estadoEfectivo`), no se lee. Una
  // PAID tampoco: esa renovación ya se cobró, lo que corresponde es la
  // siguiente.
  const { data: previas } = await supabase
    .from("cresium_ordenes")
    .select("id, external_id, estado, created_at")
    .eq("suscripcion_id", sub.id)
    .eq("periodo_hasta", hastaISO)
    .order("created_at", { ascending: false });

  const viva = (previas ?? []).find((o) => {
    const estado = estadoEfectivo(o.estado, o.created_at);
    return estado === "NOT_PAID" || estado === "PARTIAL";
  });
  if (viva) {
    revalidarPantallasDePago();
    return { ok: true };
  }

  // ⚠ EL externalId ES ÚNICO EN CRESIUM PARA SIEMPRE, también después de
  // PAID o EXPIRED (la historia completa, en lib/cresium/orden.ts). Por eso
  // la referencia lleva un NÚMERO DE INTENTO: `sub:hasta` la primera vez,
  // `sub:hasta:2` la segunda, y así.
  //
  // El punto de partida es lo que sabemos localmente; y si Cresium igual
  // dice "ya existe" (una fila borrada, una drift), se sube el número y se
  // reintenta, hasta cinco veces. Cinco es un límite para no colgar la
  // pantalla, no una expectativa: en la práctica alcanza con el primero.
  const externalIdBase = String(externalId);
  const intentoInicial = (previas?.length ?? 0) + 1;

  const resultado = await conIntentos(
    externalIdBase,
    intentoInicial,
    async (externalIdIntento, intento) => {
      // El alias fijo si lo tiene, el derivado si no. Misma interfaz para
      // los dos caminos: acá no hay un `if` de negocio, hay un dato.
      // Siempre el alias derivado: el alias fijo del tenant es el de su
      // CVU dedicado, y pedirlo para un pago único chocaría con él.
      const alias = aliasDeOrden(sesion.lubricentroNombre ?? "taller", externalIdIntento);
      const orden = await crearOrdenDePago({
        externalId: externalIdIntento,
        monto,
        alias,
        titulo: `Fidelli Motors · ${sesion.lubricentroNombre ?? "suscripción"}`,
        descripcion: `Renovación hasta el ${hastaISO}`,
        metadata: {
          lubricentro: lubricentroId,
          suscripcion: sub.id,
          periodo,
          intento: String(intento),
        },
      });
      return { orden, alias };
    },
    // Solo este error justifica reintentar con otro número. Se busca el
    // CÓDIGO y no el status: en producción llegó como 400 —no el 409 que
    // uno escribiría—, y el día que lo muevan el reintento tiene que
    // seguir disparándose.
    //
    // ⚠ Y NO SE AGREGA EL ALIAS TOMADO ACÁ, aunque el reintento sea
    // justamente donde va a aparecer. Con el alias DERIVADO el problema no
    // existe: cada intento pide uno distinto. Con un alias FIJO, el intento
    // `:2` pide EL MISMO que el `:1`, así que si Cresium contesta que está
    // tomado, insistir pide exactamente lo mismo otra vez y el bucle se
    // gasta los cinco intentos para nada. Se maneja abajo, con un mensaje
    // propio.
    (e) => e instanceof ErrorCresium && e.cuerpo.includes("EXISTING_EXTERNAL_ID"),
  );

  if (!resultado.ok) {
    if (!(resultado.error instanceof ErrorCresium)) throw resultado.error;
    console.error(`[cresium] no se pudo crear la orden ${resultado.externalId}: ${resultado.error.message}`);

    // El alias fijo tomado es un caso aparte y no se le puede pedir al
    // dueño que "pruebe de nuevo": probar de nuevo pide el mismo alias.
    // Hoy no puede pasar —nadie tiene alias asignado— y está escrito para
    // el día que sí, porque es el único error de esta pantalla que ninguna
    // acción del dueño resuelve.
    if (esAliasTomado(resultado.error)) {
      console.error(`[cresium] el alias derivado de ${resultado.externalId} está tomado en Cresium`);
    }

    return {
      error:
        "No pudimos generar la cuenta para transferir. Probá de nuevo en un momento; " +
        "si sigue igual, escribinos y lo resolvemos por WhatsApp.",
    };
  }

  if (resultado.intento > intentoInicial) {
    // Queda en el log a propósito: es la huella de una fila borrada o de
    // una drift entre nuestra tabla y Cresium, y conviene verla.
    console.warn(`[cresium] ${externalIdBase} ya existía en Cresium; la orden salió como ${resultado.externalId}`);
  }

  const { orden, alias } = resultado.valor;

  // Lo que se guarda es lo que CRESIUM confirmó, no lo que pedimos. Con el
  // alias derivado de un hash daba igual; con uno elegido a mano no: si
  // Cresium lo normaliza, la pantalla mostraría el nuestro y el banco
  // esperaría el de ellos. Si no lo devuelve, se queda el que pedimos.
  const aliasConfirmado = aliasDe(orden) ?? alias;

  await supabase.from("cresium_ordenes").insert({
    lubricentro_id: lubricentroId,
    suscripcion_id: sub.id,
    external_id: resultado.externalId,
    periodo: periodo as Periodo,
    periodo_hasta: hastaISO,
    monto,
    alias: aliasConfirmado,
    cvu: cvuDe(orden),
    orden_id: orden.paymentOrder?.id ?? null,
    estado: orden.paymentOrder?.status ?? "NOT_PAID",
  });

  revalidarPantallasDePago();
  return { ok: true };
}

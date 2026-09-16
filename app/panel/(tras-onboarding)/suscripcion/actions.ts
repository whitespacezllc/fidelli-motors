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
import { aliasDeOrden, crearOrdenDePago, cvuDe, ErrorCresium } from "@/lib/cresium/cliente";
import { conIntentos, estadoEfectivo } from "@/lib/cresium/orden";
import { MESES_DEL_PERIODO, type Periodo } from "@/lib/fidelli/plan";

export type EstadoOrden = { error?: string; ok?: boolean };

const PERIODOS_VALIDOS: Periodo[] = ["mensual", "semestral", "anual"];

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

  const desde = new Date(sub.vencimiento + "T00:00:00");
  const hasta = new Date(desde);
  hasta.setMonth(hasta.getMonth() + MESES_DEL_PERIODO[periodo as Periodo]);
  const hastaISO = hasta.toISOString().slice(0, 10);

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
    revalidatePath("/panel/suscripcion");
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
    (e) => e instanceof ErrorCresium && e.cuerpo.includes("EXISTING_EXTERNAL_ID"),
  );

  if (!resultado.ok) {
    if (!(resultado.error instanceof ErrorCresium)) throw resultado.error;
    console.error(`[cresium] no se pudo crear la orden ${resultado.externalId}: ${resultado.error.message}`);
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
  await supabase.from("cresium_ordenes").insert({
    lubricentro_id: lubricentroId,
    suscripcion_id: sub.id,
    external_id: resultado.externalId,
    periodo: periodo as Periodo,
    periodo_hasta: hastaISO,
    monto,
    alias,
    cvu: cvuDe(orden),
    orden_id: orden.paymentOrder?.id ?? null,
    estado: orden.paymentOrder?.status ?? "NOT_PAID",
  });

  revalidatePath("/panel/suscripcion");
  return { ok: true };
}

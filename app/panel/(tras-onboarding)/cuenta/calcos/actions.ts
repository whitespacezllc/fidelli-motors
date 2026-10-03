"use server";

import { revalidatePath } from "next/cache";
import { sesionParaEscribir } from "@/lib/auth/session";
import { generarOrdenDelPedido } from "@/lib/pedidos-calcos/orden";
import { crearClienteAdmin } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";

// ============================================================
// Mi cuenta → Calcos: pedir y pagar
//
// Tres acciones, y las tres pasan por `sesionParaEscribir()`: un lubricentro
// suspendido lee su historial, pero no pide ni corrige.
//
//   · pedirCalcos()            — «Confirmar y pagar»: crea el pedido y le
//                                genera la cuenta para transferir.
//   · generarCuentaDelPedido() — «Reintentar»: el pedido ya existe y Cresium
//                                falló al crearle la cuenta (o la que tenía
//                                se cerró).
//   · declararRecuento()       — «Contá y corregí»: cuántas calcos le quedan
//                                (PR 3). Al final del archivo.
//
// ⚠ DEL FORMULARIO VIAJA QUÉ SE PIDE, NUNCA CUÁNTO SALE. El pack, el
// rediseño y la entrega; los montos los congela `crear_encargo_calcos()` con
// el catálogo de ese momento, y la orden de Cresium se emite por el monto
// que quedó escrito en el pedido.
//
// ⚠ SON DOS PASOS Y EL ORDEN IMPORTA: primero el pedido (una transacción en
// Postgres), después la cuenta (una llamada HTTP a Cresium). No se pueden
// hacer atómicos. Si falla el segundo, el pedido queda sin pagar y sin
// cuenta, y la pantalla ofrece Reintentar: lo que el dueño armó no se
// pierde. Al revés quedaría una cuenta viva en Cresium sin pedido.
// ============================================================

export type EstadoPedido = { ok?: boolean; error?: string };

const RUTA = "/panel/cuenta/calcos";

const SIN_CONEXION =
  "Se cortó la conexión a internet. No cierres ni recargues esta pantalla: lo que armaste sigue acá. Cuando vuelva la señal, tocá Confirmar y pagar de nuevo.";

const MENSAJES: Record<string, string> = {
  pack_invalido: "Ese pack ya no está disponible. Recargá la pantalla y elegí de nuevo.",
  extra_no_disponible: "Esa opción ya no está disponible. Recargá la pantalla y armá el pedido de nuevo.",
  entrega_invalida: "Elegí cómo querés recibirlo: retiro o envío a domicilio.",
  envio_sin_direccion:
    "Para el envío a domicilio necesitamos la dirección y un teléfono de contacto. Ejemplo: Av. Belgrano 480, Alta Gracia.",
  tenant_suspendido: "Con la cuenta suspendida no se pueden pedir calcos.",
};

function traducir(mensaje: string): string {
  if (/fetch|network|conexión|ECONNREFUSED/i.test(mensaje)) return SIN_CONEXION;
  for (const [clave, texto] of Object.entries(MENSAJES)) {
    if (mensaje.includes(clave)) return texto;
  }
  return "No se pudo guardar el pedido. Probá de nuevo en un momento.";
}

function revalidar() {
  revalidatePath(RUTA);
  revalidatePath("/panel/cuenta");
}

// ============================================================
// «Confirmar y pagar»
// ============================================================
export async function pedirCalcos(
  _prev: EstadoPedido,
  formData: FormData,
): Promise<EstadoPedido> {
  const sesion = await sesionParaEscribir();

  const texto = (nombre: string) => String(formData.get(nombre) ?? "").trim();
  const pack = texto("pack");
  const rediseno = texto("rediseno") === "si";
  const entrega = texto("entrega");
  const conEnvio = entrega === "envio";

  if (!pack) return { error: "Elegí cuántos calcos querés." };
  if (entrega !== "retiro" && entrega !== "envio") return { error: MENSAJES.entrega_invalida };
  if (conEnvio && (!texto("direccion") || !texto("telefono"))) {
    return { error: MENSAJES.envio_sin_direccion };
  }

  // El que vuelve a pedir con un pedido de más de siete días sin pagar: ese
  // ya venció, pero el que lo marca vencido es el cierre diario, una vez por
  // día. Se vence acá (solo los de este tenant) para que no tenga que
  // esperar a la medianoche para pedir de nuevo.
  const admin = crearClienteAdmin();
  await admin.rpc("vencer_encargos_calcos", { p_lubricentro_id: sesion.lubricentroId });

  // El pedido lo crea la puerta con LA SESIÓN del owner: el tenant sale de
  // ahí, no de un parámetro.
  const supabase = await createClient();
  const { data: encargoId, error } = await supabase.rpc("crear_encargo_calcos", {
    p_pack: pack,
    p_rediseno: rediseno,
    p_rediseno_pedido: rediseno ? texto("rediseno_pedido") || undefined : undefined,
    p_entrega: entrega,
    // La dirección viaja solo con envío: el retiro se coordina por WhatsApp.
    p_direccion: conEnvio ? texto("direccion") : undefined,
    p_codigo_postal: conEnvio ? texto("codigo_postal") || undefined : undefined,
    p_telefono: conEnvio ? texto("telefono") : undefined,
  });

  if (error) {
    // Ya había uno sin pagar (dos pestañas, doble toque): no es un error,
    // la pantalla muestra ESE con su alias.
    if (error.message.includes("ya_hay_pendiente")) {
      revalidar();
      return { ok: true };
    }
    return { error: traducir(error.message) };
  }

  // La cuenta para transferir. Si Cresium falla, no se le dice «error»: el
  // pedido está guardado y la pantalla que sigue ofrece Reintentar.
  await generarOrdenDelPedido({
    encargoId: String(encargoId),
    lubricentroId: sesion.lubricentroId,
    lubricentroNombre: sesion.lubricentroNombre,
  });

  revalidar();
  return { ok: true };
}

// ============================================================
// «Reintentar»: la cuenta de un pedido que ya existe
// ============================================================
// Sin parámetros: no lee nada del formulario. El pedido es el que el tenant
// tiene sin pagar, y eso lo dice la base, no el navegador.
export async function generarCuentaDelPedido(): Promise<EstadoPedido> {
  const sesion = await sesionParaEscribir();

  // El pedido sin pagar del tenant: hay a lo sumo uno (índice único), y el
  // RLS no le deja ver el de nadie más.
  const supabase = await createClient();
  const { data: pedido } = await supabase
    .from("encargos_calcos")
    .select("id")
    .eq("estado", "pendiente_pago")
    .maybeSingle();

  // Ya no está sin pagar (se acreditó, venció o lo cancelamos): la pantalla
  // se vuelve a dibujar con lo que haya.
  if (!pedido) {
    revalidar();
    return { ok: true };
  }

  const orden = await generarOrdenDelPedido({
    encargoId: pedido.id,
    lubricentroId: sesion.lubricentroId,
    lubricentroNombre: sesion.lubricentroNombre,
  });

  revalidar();
  if (!orden.ok) {
    return {
      error:
        "No pudimos generar la cuenta para transferir. Probá de nuevo en un momento; " +
        "si sigue igual, escribinos y lo resolvemos por WhatsApp.",
    };
  }
  return { ok: true };
}

// ============================================================
// «Contá y corregí»: el recuento
// ============================================================
// El dueño cuenta las calcos que tiene y las declara: desde ese momento la
// estimación parte de ahí (`stock_calcos()`). Del formulario viaja UN
// número; el lubricentro lo pone la puerta de la base, de la sesión.

export type EstadoRecuento = { ok?: boolean; error?: string };

const MENSAJES_RECUENTO: Record<string, string> = {
  cantidad_invalida: "Escribí cuántas calcos te quedan, en números. Ejemplo: 80.",
  sin_entregas: "Todavía no te entregamos calcos: no hay nada que contar.",
};

export async function declararRecuento(
  _prev: EstadoRecuento,
  formData: FormData,
): Promise<EstadoRecuento> {
  await sesionParaEscribir();

  const crudo = String(formData.get("cantidad") ?? "").trim();
  if (!/^\d{1,6}$/.test(crudo)) return { error: MENSAJES_RECUENTO.cantidad_invalida };

  const supabase = await createClient();
  const { error } = await supabase.rpc("declarar_recuento_calcos", { p_cantidad: Number(crudo) });
  if (error) {
    if (/fetch|network|conexión|ECONNREFUSED/i.test(error.message)) {
      return {
        error:
          "Se cortó la conexión a internet. No cierres ni recargues esta pantalla. Cuando vuelva la señal, tocá Guardar de nuevo.",
      };
    }
    for (const [clave, texto] of Object.entries(MENSAJES_RECUENTO)) {
      if (error.message.includes(clave)) return { error: texto };
    }
    return { error: "No se pudo guardar el recuento. Probá de nuevo en un momento." };
  }

  // El número cambia en Mi cuenta → Calcos y puede prender (o apagar) el
  // aviso del Inicio.
  revalidatePath(RUTA);
  revalidatePath("/panel");
  return { ok: true };
}

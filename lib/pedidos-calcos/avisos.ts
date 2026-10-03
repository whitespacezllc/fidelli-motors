import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/database.types";
import { TIEMPO_DE_ENVIO, TIEMPO_DE_PRODUCCION } from "@/lib/calcos";
import { emailPagoAcreditado, emailPedidoDespachado } from "@/lib/email/calcos";
import { enviarEmail } from "@/lib/email/resend";
import { SITIO_URL } from "@/lib/seo";

// ============================================================
// EL AVISO POR MAIL DE UN PEDIDO DE CALCOS
//
// Dos avisos por pedido, cada uno UNA vez: «recibimos tu pago» (`pago`) y
// «salió / está listo» (`envio`). Van al mail del owner, el de registro.
//
// EL ORDEN IMPORTA: primero se RECLAMA el aviso en la base
// (reclamar_mail_encargo_calcos: un update con `is null`, atómico) y recién
// el que se lleva el `true` manda el mail. Cresium puede entregar el mismo
// depósito hasta cinco veces: las cinco pasan por acá y una sola manda. Si
// el envío falla, el aviso se SUELTA para que la próxima entrega —o el
// próximo intento de la acción— pueda mandarlo.
//
// Nunca tira: lo llama `after()`, después de que la respuesta ya salió, y
// un mail que no sale no puede convertir un cobro acreditado en un error.
// Lo que pasó queda en el log.
//
// El cliente entra por parámetro: la clave de servicio en el webhook (no
// hay usuario) y la sesión del superadmin en la acción de /fidelli. Los dos
// leen lo mismo: el pedido (columnas que cualquier sesión puede leer), el
// nombre del lubricentro y el mail del owner.
// ============================================================

export type TipoDeAviso = "pago" | "envio";
export type ResultadoDelAviso = "enviado" | "ya_enviado" | "sin_destinatario" | "fallo";

const ENLACE = `${SITIO_URL}/panel/cuenta/calcos`;

export async function avisarPorMail(
  supabase: SupabaseClient<Database>,
  encargoId: string,
  tipo: TipoDeAviso,
): Promise<ResultadoDelAviso> {
  try {
    const { data: pedido } = await supabase
      .from("encargos_calcos")
      .select("id, lubricentro_id, numero, cantidad, entrega, transportista, seguimiento")
      .eq("id", encargoId)
      .maybeSingle();
    if (!pedido) {
      console.error(`[calcos/aviso] el pedido ${encargoId} no existe: no se manda el mail de ${tipo}`);
      return "fallo";
    }

    const [{ data: lubricentro }, { data: owner }] = await Promise.all([
      supabase.from("lubricentros").select("nombre").eq("id", pedido.lubricentro_id).maybeSingle(),
      // El owner más viejo, el de registro: el mismo que reciben los mails
      // de cobranza (avisos_pendientes()).
      supabase
        .from("usuarios")
        .select("email")
        .eq("lubricentro_id", pedido.lubricentro_id)
        .eq("rol", "owner")
        .order("created_at")
        .limit(1)
        .maybeSingle(),
    ]);

    // Sin owner no hay a quién avisarle. No se reclama: el día que tenga
    // owner, un reintento puede mandarlo.
    if (!owner?.email) {
      console.warn(`[calcos/aviso] el pedido #${pedido.numero} no tiene owner con mail: sin aviso de ${tipo}`);
      return "sin_destinatario";
    }

    const { data: mio, error } = await supabase.rpc("reclamar_mail_encargo_calcos", {
      p_id: encargoId,
      p_tipo: tipo,
    });
    if (error) {
      console.error(`[calcos/aviso] no se pudo reclamar el mail de ${tipo} del pedido #${pedido.numero}: ${error.message}`);
      return "fallo";
    }
    if (!mio) return "ya_enviado";

    const base = {
      nombre: lubricentro?.nombre ?? "tu lubricentro",
      numero: pedido.numero,
      cantidad: pedido.cantidad,
      enlace: ENLACE,
    };
    const mail =
      tipo === "pago"
        ? emailPagoAcreditado({ ...base, tiempoDeProduccion: TIEMPO_DE_PRODUCCION })
        : emailPedidoDespachado({
            ...base,
            entrega: pedido.entrega === "envio" ? "envio" : "retiro",
            transportista: pedido.transportista,
            seguimiento: pedido.seguimiento,
            tiempoDeEnvio: TIEMPO_DE_ENVIO,
          });

    let motivo: string;
    try {
      const envio = await enviarEmail({
        para: owner.email,
        asunto: mail.asunto,
        html: mail.html,
        text: mail.text,
      });
      if (envio.ok) return "enviado";
      motivo = envio.motivo;
    } catch (e) {
      motivo = e instanceof Error ? e.message : String(e);
    }

    // No salió: se suelta, para que el próximo intento pueda mandarlo.
    console.error(`[calcos/aviso] el mail de ${tipo} del pedido #${pedido.numero} no salió: ${motivo}`);
    await supabase.rpc("soltar_mail_encargo_calcos", { p_id: encargoId, p_tipo: tipo });
    return "fallo";
  } catch (e) {
    console.error(`[calcos/aviso] el aviso de ${tipo} del pedido ${encargoId} falló: ${e instanceof Error ? e.message : e}`);
    return "fallo";
  }
}

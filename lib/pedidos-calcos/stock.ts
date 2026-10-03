import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/database.types";
import { emailStockDeCalcos } from "@/lib/email/calcos";
import { enviarEmail } from "@/lib/email/resend";
import { SITIO_URL } from "@/lib/seo";
import { fraseDelAviso } from "@/lib/stock-calcos";

// ============================================================
// LOS DOS MAILS DEL STOCK DE CALCOS — por el cron de las 9:00
//
// Los manda la misma ruta que los avisos de cobranza
// (/api/fidelli/avisos-cobranza), con su guarda y su clave de servicio.
// Acá no hay ruta ni guarda: es la mitad de calcos de esa corrida.
//
//   · LA DECISIÓN ES DE LA BASE: `avisos_calcos_pendientes()` devuelve, por
//     tenant, el mail más avanzado que corresponde hoy y no se mandó en este
//     ciclo de entrega (calcos_4_semanas · calcos_1_semana). Ya dejó afuera
//     al que imprime por su cuenta, al que tiene un pedido abierto, al
//     suspendido y al demo. Acá no se re-decide nada.
//   · LA FRASE ES LA DEL INICIO (`fraseDelAviso`): el mail dice lo que el
//     panel le dice ese día.
//   · LA EVIDENCIA, DESPUÉS de que Resend confirma: una fila en
//     `emails_calcos` por (tenant, escalón, ciclo). Si Resend falla no hay
//     fila y la corrida de mañana reintenta sola.
//
// Nunca tira: un problema acá no puede cortar los avisos de cobranza, que
// corren antes. Lo que pasó va en el resultado y en el log.
// ============================================================

const RUTA = "fidelli/avisos-cobranza · calcos";
const ENLACE = `${SITIO_URL}/panel/cuenta/calcos`;

type Enviado = { slug: string; tipo: string; destinatario: string; resend_id: string };
type Fallido = { slug: string; tipo: string; motivo: string };

export type AvisosDeStock = {
  pendientes: number;
  enviados: Enviado[];
  fallidos: Fallido[];
  /** La decisión falló entera: no se mandó nada. */
  error?: string;
};

export async function mandarAvisosDeStock(
  admin: SupabaseClient<Database>,
  simular: boolean,
): Promise<AvisosDeStock> {
  const enviados: Enviado[] = [];
  const fallidos: Fallido[] = [];

  const { data: pendientes, error } = await admin.rpc("avisos_calcos_pendientes");
  if (error) {
    console.error(`[${RUTA}] avisos_calcos_pendientes() falló: ${error.message}`);
    return { pendientes: 0, enviados, fallidos, error: error.message };
  }

  for (const a of pendientes ?? []) {
    if (a.tipo !== "calcos_4_semanas" && a.tipo !== "calcos_1_semana") {
      fallidos.push({ slug: a.slug, tipo: a.tipo, motivo: `sin plantilla para ${a.tipo}` });
      continue;
    }
    if (!a.destinatario) {
      fallidos.push({ slug: a.slug, tipo: a.tipo, motivo: "el tenant no tiene owner con email" });
      continue;
    }

    const email = emailStockDeCalcos({
      nombre: a.nombre,
      tipo: a.tipo,
      frase: fraseDelAviso({
        stock: Number(a.stock_estimado),
        semanas: a.semanas_cobertura == null ? null : Number(a.semanas_cobertura),
      }),
      enlace: ENLACE,
    });

    if (simular) {
      enviados.push({ slug: a.slug, tipo: a.tipo, destinatario: a.destinatario, resend_id: "(simulado)" });
      continue;
    }

    try {
      const envio = await enviarEmail({
        para: a.destinatario,
        asunto: email.asunto,
        html: email.html,
        text: email.text,
      });
      if (!envio.ok) {
        console.error(`[${RUTA}] ${a.slug} ${a.tipo} no se mandó: ${envio.motivo}`);
        fallidos.push({ slug: a.slug, tipo: a.tipo, motivo: envio.motivo });
        continue;
      }

      // Si esto falla el mail ya salió: se dice a los gritos, porque mañana
      // se mandaría otra vez.
      const { error: errInsert } = await admin.from("emails_calcos").insert({
        lubricentro_id: a.lubricentro_id,
        tipo: a.tipo,
        entrega_ref: a.entrega_ref,
        destinatario: a.destinatario,
        resend_id: envio.id,
        stock_estimado: a.stock_estimado,
        semanas_cobertura: a.semanas_cobertura,
      });
      if (errInsert) {
        console.error(
          `[${RUTA}] ${a.slug} ${a.tipo} SE MANDÓ (${envio.id}) PERO NO QUEDÓ REGISTRADO: ${errInsert.message}. Mañana se manda otra vez.`,
        );
        fallidos.push({ slug: a.slug, tipo: a.tipo, motivo: `mandado (${envio.id}) pero sin registrar: ${errInsert.message}` });
        continue;
      }

      enviados.push({ slug: a.slug, tipo: a.tipo, destinatario: a.destinatario, resend_id: envio.id });
    } catch (e) {
      const motivo = e instanceof Error ? e.message : String(e);
      console.error(`[${RUTA}] ${a.slug} ${a.tipo} falló: ${motivo}`);
      fallidos.push({ slug: a.slug, tipo: a.tipo, motivo });
    }
  }

  return { pendientes: pendientes?.length ?? 0, enviados, fallidos };
}

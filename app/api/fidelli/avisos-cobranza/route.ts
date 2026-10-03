import { NextResponse } from "next/server";
import { crearClienteAdmin } from "@/lib/supabase/admin";
import { rechazoDelCron } from "@/lib/cron/guarda";
import { hoyISO } from "@/lib/fechas";
import { claveDeEmail, emailDeCobranza, type DatosEmail } from "@/lib/email/cobranza";
import { enviarEmail, motivoSinResend, remitente } from "@/lib/email/resend";
import { mandarAvisosDeStock } from "@/lib/pedidos-calcos/stock";
import { urlWhatsappSoporte } from "@/lib/config";
import { SITIO_URL } from "@/lib/seo";

// ============================================================
// LOS AVISOS DE COBRANZA — el segundo cron de Vercel
//
// vercel.json lo llama todos los días a las 12:00 UTC = 9:00 de Argentina:
// un email de cobranza a las 3 de la mañana se lee con otra cara. Es
// hermano de /api/fidelli/cierre-diario y va SEPARADO a propósito: si uno
// falla, el otro corre.
//
//   1 · La MISMA guarda: `Authorization: Bearer $CRON_SECRET` o nada
//       (lib/cron/guarda.ts).
//   2 · Sin RESEND_API_KEY: 500 con el motivo, antes de decidir nada. No
//       un 200 con cero enviados.
//   3 · LA DECISIÓN ES DE LA BASE: `avisos_pendientes()` devuelve, por
//       tenant, el email más avanzado que corresponde hoy y no se mandó
//       para este vencimiento. Acá no se re-decide nada: se manda uno por
//       uno, se inserta en `emails_cobranza` con cada confirmación de
//       Resend, y se devuelve el resumen. Un tenant que falla no corta el
//       loop; su email queda pendiente y la corrida de mañana lo reintenta.
//   4 · Corre con la clave de servicio (crearClienteAdmin): no hay usuario
//       detrás, y `avisos_pendientes()` solo está grantada a service_role.
//
//   5 · Y DESPUÉS, LOS DOS MAILS DEL STOCK DE CALCOS (PR 3 de calcos): «te
//       quedan calcos para pocas semanas» y «te estás quedando sin calcos».
//       Misma corrida, misma guarda, otra decisión de la base
//       (`avisos_calcos_pendientes()`) y otro registro (`emails_calcos`).
//       Van al final y no cortan nada: si esa mitad falla, los de cobranza
//       ya salieron y la respuesta lo dice en `calcos.error`.
//
// `?simular=1` devuelve lo que se mandaría, sin mandar ni insertar: para
// mirar la lista antes de la primera corrida real. Vale para las dos
// mitades.
// ============================================================

export const dynamic = "force-dynamic";

const RUTA = "fidelli/avisos-cobranza";

type Enviado = { slug: string; tipo: string; voz: string; destinatario: string; resend_id: string };
type Fallido = { slug: string; tipo: string; voz: string; motivo: string };

export async function GET(request: Request) {
  const rechazo = rechazoDelCron(request, RUTA);
  if (rechazo) return rechazo;

  const simular = new URL(request.url).searchParams.get("simular") === "1";

  const sinResend = motivoSinResend();
  if (sinResend && !simular) {
    console.error(`[${RUTA}] ${sinResend}: no se manda nada`);
    return NextResponse.json({ error: "misconfigured", motivo: sinResend }, { status: 500 });
  }

  const admin = crearClienteAdmin();
  const { data: pendientes, error } = await admin.rpc("avisos_pendientes");
  if (error) {
    console.error(`[${RUTA}] avisos_pendientes() falló: ${error.message}`);
    return NextResponse.json({ error: "la decisión falló", detalle: error.message }, { status: 500 });
  }

  const hoy = hoyISO();
  const enlaces = { pagar: `${SITIO_URL}/panel/suscripcion`, whatsapp: urlWhatsappSoporte() };
  const enviados: Enviado[] = [];
  const fallidos: Fallido[] = [];

  for (const a of pendientes ?? []) {
    const clave = claveDeEmail(a.tipo, a.voz);
    if (!clave) {
      fallidos.push({ slug: a.slug, tipo: a.tipo, voz: a.voz, motivo: `sin plantilla para ${a.tipo}:${a.voz}` });
      continue;
    }
    if (!a.destinatario) {
      fallidos.push({ slug: a.slug, tipo: a.tipo, voz: a.voz, motivo: "el tenant no tiene owner con email" });
      continue;
    }

    const datos: DatosEmail = {
      nombre: a.nombre,
      plan: a.plan_nombre ?? "—",
      monto: a.voz === "trial" ? null : Number(a.monto),
      periodo: a.periodo,
      vencimiento: a.vencimiento,
      dias: a.dias,
      corta: a.corta,
      alias: a.alias,
      enlaces,
    };
    const email = emailDeCobranza(clave, datos);

    if (simular) {
      enviados.push({ slug: a.slug, tipo: a.tipo, voz: a.voz, destinatario: a.destinatario, resend_id: "(simulado)" });
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
        console.error(`[${RUTA}] ${a.slug} ${a.tipo}:${a.voz} no se mandó: ${envio.motivo}`);
        fallidos.push({ slug: a.slug, tipo: a.tipo, voz: a.voz, motivo: envio.motivo });
        continue;
      }

      // La evidencia, DESPUÉS de la confirmación y con su id. Si esto falla
      // el email ya salió: se dice a los gritos, porque mañana se mandaría
      // otra vez.
      const { error: errInsert } = await admin.from("emails_cobranza").insert({
        lubricentro_id: a.lubricentro_id,
        tipo: a.tipo,
        voz: a.voz,
        vencimiento: a.vencimiento,
        destinatario: a.destinatario,
        resend_id: envio.id,
      });
      if (errInsert) {
        console.error(
          `[${RUTA}] ${a.slug} ${a.tipo}:${a.voz} SE MANDÓ (${envio.id}) PERO NO QUEDÓ REGISTRADO: ${errInsert.message}. Mañana se manda otra vez.`,
        );
        fallidos.push({ slug: a.slug, tipo: a.tipo, voz: a.voz, motivo: `mandado (${envio.id}) pero sin registrar: ${errInsert.message}` });
        continue;
      }

      enviados.push({ slug: a.slug, tipo: a.tipo, voz: a.voz, destinatario: a.destinatario, resend_id: envio.id });
    } catch (e) {
      const motivo = e instanceof Error ? e.message : String(e);
      console.error(`[${RUTA}] ${a.slug} ${a.tipo}:${a.voz} falló: ${motivo}`);
      fallidos.push({ slug: a.slug, tipo: a.tipo, voz: a.voz, motivo });
    }
  }

  // Los mails del stock de calcos. No tira nunca.
  const calcos = await mandarAvisosDeStock(admin, simular);

  console.log(
    `[${RUTA}] ${hoy}${simular ? " (simulado)" : ""}: ${pendientes?.length ?? 0} pendientes · ${enviados.length} enviados · ${fallidos.length} fallidos · calcos: ${calcos.error ? `falló (${calcos.error})` : `${calcos.pendientes} pendientes, ${calcos.enviados.length} enviados, ${calcos.fallidos.length} fallidos`} · desde ${remitente()}`,
  );

  return NextResponse.json({
    fecha: hoy,
    simulado: simular,
    remitente: remitente(),
    pendientes: pendientes?.length ?? 0,
    enviados,
    fallidos,
    calcos,
  });
}

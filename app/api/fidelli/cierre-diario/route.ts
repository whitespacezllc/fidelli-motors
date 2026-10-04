import { NextResponse } from "next/server";
import { crearClienteAdmin } from "@/lib/supabase/admin";
import { rechazoDelCron } from "@/lib/cron/guarda";
import { hoyISO } from "@/lib/fechas";
import { sumarDias } from "@/lib/fidelli/plan";

// ============================================================
// EL CIERRE DIARIO — el cron de Vercel (docs/METRICAS.md § 4)
//
// vercel.json lo llama todos los días a las 03:10 UTC = 00:10 hora
// argentina. Cierra AYER (hora argentina): tipo de cambio del día, la foto
// de cada tenant y la de la plataforma, vía cerrar_dia(), que es
// idempotente — si el día ya está cerrado, no toca nada.
//
//   1 · Vercel manda `Authorization: Bearer $CRON_SECRET` solo. Sin ese
//       header exacto: 401 y no se toca la base. Sin CRON_SECRET en el
//       entorno: 500, para que se note en el primer intento. La guarda
//       vive en lib/cron/guarda.ts y es la misma que la de los avisos de
//       cobranza (/api/fidelli/avisos-cobranza).
//   2 · EL TIPO DE CAMBIO NUNCA SE INVENTA. Se pide la cotización oficial
//       del día a dolarapi.com; si falla, se repite la última conocida con
//       fuente = 'repetido', y queda registrado así. Si tampoco hay una
//       anterior, no hay cierre (502) y lo dice.
//   3 · Corre con la clave de servicio (crearClienteAdmin): no hay usuario
//       detrás, y cerrar_dia() solo está grantada a service_role.
//   4 · Y vence los pedidos de calcos que llevan más de siete días sin
//       pagar (vencer_encargos_calcos, también solo de service_role).
//   5 · Y barre los archivos del bucket `adjuntos` que quedaron sin fila
//       (adjuntos_huerfanos, también solo de service_role): la subida que
//       no pasó la validación, el adjunto que se quitó y cuyo archivo no
//       se pudo borrar, los de un trabajo que ya no existe. Por la API de
//       Storage: desde SQL no se pueden borrar.
// ============================================================

export const dynamic = "force-dynamic";

const FUENTE_OFICIAL = "https://dolarapi.com/v1/dolares/oficial";
const FORMATO_FECHA = /^\d{4}-\d{2}-\d{2}$/;

type Cotizacion = { compra: number | null; venta: number; fuente: string };

function rechazar(motivo: string, status: number, cuerpo: Record<string, unknown>) {
  // El motivo va al log del servidor, no al cuerpo: mismo criterio que el
  // webhook de Cresium.
  console.error(`[fidelli/cierre-diario] ${motivo}`);
  return NextResponse.json(cuerpo, { status });
}

// La cotización oficial de hoy. A las 00:10 el mercado está cerrado, así
// que es la de ayer, que es la que se cierra.
async function cotizacionOficial(): Promise<Cotizacion | null> {
  const ctrl = new AbortController();
  const timeout = setTimeout(() => ctrl.abort(), 10_000);
  try {
    const r = await fetch(FUENTE_OFICIAL, {
      signal: ctrl.signal,
      cache: "no-store",
      headers: { accept: "application/json" },
    });
    if (!r.ok) return null;
    const j = (await r.json()) as { compra?: unknown; venta?: unknown };
    const venta = Number(j.venta);
    const compra = Number(j.compra);
    if (!Number.isFinite(venta) || venta <= 0) return null;
    return {
      compra: Number.isFinite(compra) && compra > 0 ? compra : null,
      venta,
      fuente: "dolarapi.com/oficial",
    };
  } catch {
    return null;
  } finally {
    clearTimeout(timeout);
  }
}

export async function GET(request: Request) {
  const rechazo = rechazoDelCron(request, "fidelli/cierre-diario");
  if (rechazo) return rechazo;

  // La fecha: ayer en hora argentina, o la pedida (solo días que ya pasaron).
  const hoy = hoyISO();
  const pedida = new URL(request.url).searchParams.get("fecha");
  let fecha = sumarDias(hoy, -1);
  if (pedida !== null) {
    if (!FORMATO_FECHA.test(pedida) || pedida >= hoy) {
      return rechazar(`fecha inválida: ${pedida}`, 400, {
        error: "fecha inválida: tiene que ser YYYY-MM-DD y anterior a hoy (hora argentina)",
      });
    }
    fecha = pedida;
  }

  const admin = crearClienteAdmin();

  // ---------- Los pedidos de calcos sin pagar vencen a los siete días ----------
  // (PR 2 de calcos.) Va ANTES del tipo de cambio y no depende de él: si
  // hoy no hay cotización y el día no cierra, los pedidos vencen igual. Es
  // idempotente —corre en cada disparo, también en uno con `?fecha=`— y un
  // error acá no corta el cierre: queda en el log y en la respuesta.
  const { data: calcosVencidos, error: errorCalcos } = await admin.rpc("vencer_encargos_calcos");
  if (errorCalcos) {
    console.error(`[fidelli/cierre-diario] no se pudieron vencer los pedidos de calcos: ${errorCalcos.message}`);
  }

  // ---------- Los adjuntos sin fila se barren ----------
  // Igual que lo de arriba: antes del tipo de cambio, idempotente, y un
  // error acá no corta el cierre. La lista ya excluye lo subido en el
  // último día (la subida en vuelo). Si quedaran más de 500, siguen mañana.
  let adjuntosBarridos: number | null = 0;
  const { data: huerfanos, error: errorHuerfanos } = await admin.rpc("adjuntos_huerfanos");
  if (errorHuerfanos) {
    adjuntosBarridos = null;
    console.error(`[fidelli/cierre-diario] no se pudieron listar los adjuntos sin fila: ${errorHuerfanos.message}`);
  } else if (huerfanos && huerfanos.length > 0) {
    const { data: borrados, error: errorBarrido } = await admin.storage
      .from("adjuntos")
      .remove(huerfanos);
    if (errorBarrido) {
      adjuntosBarridos = null;
      console.error(`[fidelli/cierre-diario] no se pudieron barrer los adjuntos sin fila: ${errorBarrido.message}`);
    } else {
      adjuntosBarridos = borrados?.length ?? 0;
    }
  }

  // El tipo de cambio: el del día, o el último conocido como 'repetido'.
  let tc = await cotizacionOficial();
  if (!tc) {
    console.warn(`[fidelli/cierre-diario] ${fecha}: sin cotización oficial, se repite la última conocida`);
    const { data: previo, error } = await admin.rpc("tc_vigente", {
      p_fecha: sumarDias(fecha, -1),
    });
    if (error || !previo?.venta) {
      return rechazar(
        `sin tipo de cambio para ${fecha} y sin uno anterior (${error?.message ?? "sin filas"})`,
        502,
        { error: "sin tipo de cambio: no se cerró el día" },
      );
    }
    tc = { compra: previo.compra, venta: Number(previo.venta), fuente: "repetido" };
  }

  const { data: resultado, error } = await admin.rpc("cerrar_dia", {
    p_fecha: fecha,
    p_tc_venta: tc.venta,
    p_tc_compra: tc.compra ?? undefined,
    p_fuente: tc.fuente,
  });

  if (error) {
    return rechazar(`cerrar_dia(${fecha}) falló: ${error.message}`, 500, {
      error: "el cierre falló",
      detalle: error.message,
    });
  }

  // Lo que quedó, para el log y para quien lo dispare a mano.
  const [{ data: dia }, { count }] = await Promise.all([
    admin.from("snapshots_diarios").select("*").eq("fecha", fecha).maybeSingle(),
    admin
      .from("snapshots_tenant_diarios")
      .select("lubricentro_id", { count: "exact", head: true })
      .eq("fecha", fecha),
  ]);

  console.log(
    `[fidelli/cierre-diario] ${fecha}: ${resultado} · tc venta ${tc.venta} (${tc.fuente}) · ${count ?? 0} tenants · ${calcosVencidos ?? "?"} pedidos de calcos vencidos · ${adjuntosBarridos ?? "?"} adjuntos sin fila barridos`,
  );

  return NextResponse.json({
    fecha,
    resultado,
    tipo_cambio: tc,
    tenants: count ?? 0,
    calcos_vencidos: errorCalcos ? null : (calcosVencidos ?? 0),
    adjuntos_barridos: adjuntosBarridos,
    snapshot: dia,
  });
}

import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { formatearFecha, formatearHora } from "@/lib/fechas";
import { describirEvento, type EventoHistorial, type TipoEvento } from "@/lib/fidelli/historial";
import type { Tenant } from "./tipos";

const POR_PAGINA = 30;

type Fila = {
  id: string;
  tipo: TipoEvento;
  ocurrido_at: string;
  antes: unknown;
  despues: unknown;
  motivo: string | null;
  origen_evento: string;
  actor: string | null;
  usuarios: { nombre: string } | null;
};

// ============================================================
// La pestaña Historial: tenant_eventos de este lubricentro, lo más nuevo
// arriba, treinta por página, cada evento como una oración con quién y
// cuándo (hora argentina). Es el libro de novedades del bloque MÉTRICAS 1
// leído por una persona; no se edita ni se borra.
//
// El filtro por tenant es lo único que aísla: el superadmin lee toda la
// tabla y el RLS no recorta.
// ============================================================
export async function TabHistorial({
  tenant,
  pagina,
}: {
  tenant: Tenant;
  pagina: number;
}) {
  const supabase = await createClient();

  const desde = (pagina - 1) * POR_PAGINA;
  const { data, count } = await supabase
    .from("tenant_eventos")
    .select("id, tipo, ocurrido_at, antes, despues, motivo, origen_evento, actor, usuarios!actor(nombre)", {
      count: "exact",
    })
    .eq("lubricentro_id", tenant.id)
    .order("ocurrido_at", { ascending: false })
    .order("created_at", { ascending: false })
    .range(desde, desde + POR_PAGINA - 1);

  const filas = (data ?? []) as unknown as Fila[];
  const total = count ?? 0;

  // El backfill (20260922205000) dejó el actor en null y guardó quién
  // registró el pago o el cambio adentro de `despues`: se resuelven esos
  // nombres en una sola consulta más, para no decir «Sistema» donde fue
  // una persona.
  const idsPendientes = new Set<string>();
  for (const f of filas) {
    if (f.actor) continue;
    const d = (f.despues ?? {}) as Record<string, unknown>;
    for (const clave of ["registrado_por", "cambiado_por"]) {
      if (typeof d[clave] === "string") idsPendientes.add(d[clave] as string);
    }
  }
  const nombres = new Map<string, string>();
  if (idsPendientes.size > 0) {
    const { data: usuarios } = await supabase
      .from("usuarios")
      .select("id, nombre")
      .in("id", [...idsPendientes]);
    for (const u of usuarios ?? []) nombres.set(u.id, u.nombre);
  }

  const eventos: EventoHistorial[] = filas.map((f) => {
    const d = (f.despues ?? {}) as Record<string, unknown>;
    const autorBackfill =
      typeof d.registrado_por === "string"
        ? nombres.get(d.registrado_por)
        : typeof d.cambiado_por === "string"
          ? nombres.get(d.cambiado_por)
          : undefined;
    return {
      id: f.id,
      tipo: f.tipo,
      ocurrido_at: f.ocurrido_at,
      antes: f.antes,
      despues: f.despues,
      motivo: f.motivo,
      origen_evento: f.origen_evento,
      actorNombre: f.usuarios?.nombre ?? autorBackfill ?? null,
    };
  });

  return (
    <section className="surface-card overflow-hidden">
      <div className="flex flex-wrap items-baseline justify-between gap-2 border-b border-line px-4.5 py-3">
        <h2 className="font-brand text-ui font-bold tracking-[0.04em] text-ink-60 uppercase">
          Historial
        </h2>
        <p className="text-label text-ink-40 tabular-nums">
          {total} {total === 1 ? "evento" : "eventos"} · no se edita ni se borra
        </p>
      </div>

      {eventos.length === 0 ? (
        <p className="px-4.5 py-6 text-ui text-ink-60">
          {pagina > 1
            ? "No hay más eventos en esta página."
            : "Todavía no hay ningún evento registrado para este lubricentro."}
        </p>
      ) : (
        <ol className="divide-y divide-line">
          {eventos.map((e) => {
            const linea = describirEvento(e);
            return (
              <li
                key={e.id}
                className="flex flex-col gap-0.5 px-4.5 py-3 sm:flex-row sm:items-baseline sm:gap-4"
              >
                <span className="shrink-0 text-label text-ink-40 tabular-nums sm:w-32">
                  {formatearFecha(e.ocurrido_at)} {formatearHora(e.ocurrido_at)}
                </span>
                <div className="min-w-0 flex-1">
                  <p className="text-ui font-semibold text-ink">{linea.titulo}</p>
                  {linea.detalle && <p className="text-ui text-ink-60">{linea.detalle}</p>}
                </div>
                <span className="shrink-0 text-label text-ink-40">{linea.actor}</span>
              </li>
            );
          })}
        </ol>
      )}

      <Paginacion tenantId={tenant.id} total={total} pagina={pagina} />
    </section>
  );
}

function Paginacion({
  tenantId,
  total,
  pagina,
}: {
  tenantId: string;
  total: number;
  pagina: number;
}) {
  const paginas = Math.max(1, Math.ceil(total / POR_PAGINA));
  if (paginas <= 1) return null;

  const base = `/fidelli/${tenantId}?tab=historial`;
  const clase =
    "inline-flex min-h-9 items-center rounded-md border border-line bg-base px-3 text-ui font-semibold text-ink hover:bg-surface";

  return (
    <div className="flex flex-wrap items-center justify-between gap-3 border-t border-line px-4.5 py-3">
      <p className="text-label text-ink-60 tabular-nums">
        página {pagina} de {paginas}
      </p>
      <div className="flex gap-2">
        {pagina > 1 && (
          <Link href={`${base}&pagina=${pagina - 1}`} className={clase}>
            Más nuevos
          </Link>
        )}
        {pagina < paginas && (
          <Link href={`${base}&pagina=${pagina + 1}`} className={clase}>
            Más viejos
          </Link>
        )}
      </div>
    </div>
  );
}

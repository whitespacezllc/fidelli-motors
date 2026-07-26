import Link from "next/link";
import { formatearFecha } from "@/lib/fechas";
import {
  BadgeSuscripcion,
  BadgeDescuento,
  BadgeSinSuscripcion,
} from "@/components/fidelli/badges";
import { PESTANAS, type Pestana, type SuscripcionVigente, type Tenant } from "./tipos";

// Cabecera + pestañas. Las pestañas son enlaces con ?tab=, no estado local:
// así se puede pasar por WhatsApp el link a la pestaña que importa —"mirá
// los services de este tipo"— en vez de explicar dónde hay que hacer clic.
export function CabeceraTenant({
  tenant,
  suscripcion,
  pestana,
}: {
  tenant: Tenant;
  suscripcion: SuscripcionVigente | null;
  pestana: Pestana;
}) {
  return (
    <div className="mb-6">
      <Link
        href="/fidelli"
        className="mb-3 inline-flex min-h-8 items-center text-label font-semibold text-ink-60 hover:text-ink"
      >
        ← Lubricentros
      </Link>

      <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
        <h1 className="font-brand text-h2 font-bold text-ink">{tenant.nombre}</h1>

        {suscripcion ? (
          <>
            <BadgeSuscripcion
              estado={suscripcion.estado}
              periodo={suscripcion.periodo}
              vencimiento={suscripcion.vencimiento}
            />
            <BadgeDescuento pct={suscripcion.descuento_pct} />
          </>
        ) : (
          <BadgeSinSuscripcion />
        )}

        {!tenant.activo && (
          <span className="rounded-sm border border-line bg-surface px-2 py-0.5 text-label font-semibold tracking-[0.04em] text-ink-40 uppercase">
            suspendido
          </span>
        )}
      </div>

      <p className="mt-1 text-ui text-ink-60">
        alta: {formatearFecha(tenant.created_at)} ·{" "}
        <span className="text-ink-40">/{tenant.slug}</span>
      </p>

      <nav
        aria-label="Secciones de la ficha"
        className="mt-5 flex gap-1 overflow-x-auto border-b border-line"
      >
        {PESTANAS.map((p) => {
          const activa = p.clave === pestana;
          return (
            <Link
              key={p.clave}
              href={`/fidelli/${tenant.id}?tab=${p.clave}`}
              aria-current={activa ? "page" : undefined}
              className={`-mb-px flex h-10 shrink-0 items-center border-b-2 px-3 text-ui transition-colors ${
                activa
                  ? "border-ink font-semibold text-ink"
                  : "border-transparent text-ink-60 hover:text-ink"
              }`}
            >
              {p.nombre}
            </Link>
          );
        })}
      </nav>
    </div>
  );
}

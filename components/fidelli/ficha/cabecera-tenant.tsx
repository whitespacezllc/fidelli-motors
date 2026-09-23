import Link from "next/link";
import { formatearFecha } from "@/lib/fechas";
import { ETIQUETA_ORIGEN, ETIQUETA_ORIGEN_CORTA } from "@/lib/fidelli/eventos";
import {
  BadgeSuscripcion,
  BadgeDescuento,
  BadgeSinSuscripcion,
} from "@/components/fidelli/badges";
import { Chip } from "@/components/fidelli/chip";
import { CeldaOwner } from "@/components/fidelli/celda-owner";
import { DialogEditar, type DatosEdicion } from "@/components/fidelli/dialog-editar";
import type { EstadoOwner, PlanCompleto } from "@/components/fidelli/tipos";
import { PESTANAS, type Pestana, type SuscripcionVigente, type Tenant } from "./tipos";

const CLASE_EDITAR =
  "inline-flex h-9 items-center rounded-md border border-line bg-base px-3 text-ui font-semibold text-ink hover:bg-surface";
const CLASE_CHIP_ORIGEN =
  "inline-flex items-center gap-1 rounded-sm border border-line bg-surface px-1.5 py-px text-label font-semibold text-ink-60 hover:text-ink";

// Cabecera + pestañas. Las pestañas son enlaces con ?tab=, no estado local:
// así se puede pasar por WhatsApp el link a la pestaña que importa —"mirá
// los services de este tipo"— en vez de explicar dónde hay que hacer clic.
//
// Desde el bloque MÉTRICAS 2 la cabecera dice también de dónde vino el
// tenant (el origen) y cómo está su owner, con las acciones de invitar o
// reenviar acá —antes vivían en la tabla del listado. Desde el bloque 3
// tiene el botón «Editar», que abre EL MISMO dialog de la fila del listado
// (components/fidelli/dialog-editar.tsx), y el chip «Sin origen» lo abre
// también.
export function CabeceraTenant({
  tenant,
  suscripcion,
  pestana,
  estadoOwner,
  planes,
}: {
  tenant: Tenant;
  suscripcion: SuscripcionVigente | null;
  pestana: Pestana;
  estadoOwner: EstadoOwner;
  planes: PlanCompleto[];
}) {
  const datos: DatosEdicion = {
    id: tenant.id,
    nombre: tenant.nombre,
    slug: tenant.slug,
    calcos_entregadas: tenant.calcos_entregadas,
    plan_id: suscripcion?.plan?.id ?? null,
    sub_periodo: suscripcion?.periodo ?? null,
    sub_descuento_pct: suscripcion?.descuento_pct ?? 0,
    sub_vencimiento: suscripcion?.vencimiento ?? null,
  };
  const origen = { origen: tenant.origen, detalle: tenant.origen_detalle };

  return (
    <div className="mb-6">
      <Link
        href="/fidelli/lubricentros"
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

        {/* El origen (docs/METRICAS.md § 1). Sin origen, el chip abre el
            dialog Editar, que es donde se carga. */}
        {tenant.origen ? (
          <Chip
            tono="neutro"
            title={`${ETIQUETA_ORIGEN[tenant.origen]}${tenant.origen_detalle ? ` · ${tenant.origen_detalle}` : ""}`}
          >
            {ETIQUETA_ORIGEN_CORTA[tenant.origen]}
            {tenant.origen_detalle ? ` · ${tenant.origen_detalle}` : ""}
          </Chip>
        ) : (
          <DialogEditar
            datos={datos}
            planes={planes}
            origen={origen}
            triggerClassName={CLASE_CHIP_ORIGEN}
            trigger={
              <>
                Sin origen
                <span className="font-normal underline underline-offset-2">cargar</span>
              </>
            }
          />
        )}

        <span className="ml-auto">
          <DialogEditar datos={datos} planes={planes} origen={origen} triggerClassName={CLASE_EDITAR} />
        </span>
      </div>

      <p className="mt-1 text-ui text-ink-60">
        alta: {formatearFecha(tenant.created_at)} ·{" "}
        <span className="text-ink-40">/{tenant.slug}</span>
      </p>

      <div className="mt-2 flex flex-wrap items-start gap-x-2 text-ui">
        <span className="leading-6 text-ink-60">Owner:</span>
        <CeldaOwner lubricentroId={tenant.id} nombre={tenant.nombre} estado={estadoOwner} />
      </div>

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

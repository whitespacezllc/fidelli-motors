import type { Metadata } from "next";
import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { EstadoVacio } from "@/components/ui/estado-vacio";
import { IconoLubricentro } from "@/components/iconos";
import { TablaLubricentros } from "@/components/fidelli/tabla-lubricentros";
import { BotonAlta } from "@/components/fidelli/boton-alta";
import { esAtencion } from "@/lib/fidelli/atencion";
import { calcularTotales } from "@/lib/fidelli/totales";
import { FranjaTotales } from "@/components/fidelli/franja-totales";
import {
  Pulso,
  esGranularidad,
  type Granularidad,
  type PuntoPulso,
} from "@/components/fidelli/pulso";
import type { PlanCompleto } from "@/components/fidelli/tipos";

export const metadata: Metadata = { title: "Lubricentros — Fidelli Motors" };

export default async function PaginaLubricentros({
  searchParams,
}: {
  searchParams: Promise<{ atencion?: string; pulso?: string }>;
}) {
  const { atencion, pulso } = await searchParams;
  const soloAtencion = atencion === "1";
  // Semanal por defecto: con pocos datos es el que mejor se lee —bastantes
  // puntos para ser una curva, sin el diente de sierra de los domingos.
  const granularidad: Granularidad = esGranularidad(pulso) ? pulso : "semana";

  const supabase = await createClient();

  // Una consulta por pantalla: listado_lubricentros() ya trae la suscripción
  // vigente, la actividad del mes, el estado del owner y —desde el aviso de
  // vencimiento— qué atención necesita cada tenant, si ya se le avisó en
  // este ciclo y a qué número escribirle. Viene ordenada con lo urgente
  // arriba: el ORDER BY no puede depender de algo que se calcule acá.
  const [{ data: filas }, { data: planes }, { data: plataforma }] = await Promise.all([
    supabase.rpc("listado_lubricentros"),
    supabase
      .from("planes")
      .select("id, nombre, precio_mensual, descuento_semestral_pct, descuento_anual_pct")
      .eq("activo", true)
      .order("nombre"),
    // Lo único de toda esta superficie que NO se filtra por tenant: son
    // los números de la plataforma entera y sumarlos es el punto.
    supabase.rpc("metricas_plataforma", { p_granularidad: granularidad }),
  ]);

  const lubricentros = filas ?? [];
  const catalogo = (planes ?? []) as PlanCompleto[];

  const metricas = (plataforma ?? {}) as {
    services_mes?: number;
    acumulado?: number;
    serie?: PuntoPulso[];
  };
  // La franja sale de las filas que ya trajimos: el MRR necesita el precio
  // del plan y los dos descuentos, y listado_lubricentros() los devuelve.
  // Una consulta menos y una sola versión de la cadena de descuentos.
  const totales = calcularTotales(lubricentros);

  const necesitanAtencion = lubricentros.filter((l) => esAtencion(l.atencion));
  const sinAvisar = necesitanAtencion.filter((l) => !l.contactado).length;
  const visibles = soloAtencion ? necesitanAtencion : lubricentros;

  return (
    <div>
      <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
        <h1 className="font-brand text-h2 font-bold text-ink">Lubricentros</h1>
        {lubricentros.length > 0 && <BotonAlta />}
      </div>

      {lubricentros.length === 0 ? (
        <EstadoVacio
          icono={<IconoLubricentro className="size-6" />}
          titulo="Todavía no hay ningún lubricentro"
          descripcion="Acá van a aparecer todos los clientes de la plataforma con su suscripción, su actividad del mes y el estado de su owner. Empezá dando de alta el primero."
        >
          <BotonAlta etiqueta="+ Dar de alta el primero" />
        </EstadoVacio>
      ) : (
        <>
          <FranjaTotales
            totales={totales}
            servicesMes={metricas.services_mes ?? 0}
          />

          <Pulso
            serie={metricas.serie ?? []}
            acumulado={metricas.acumulado ?? 0}
            granularidad={granularidad}
            soloAtencion={soloAtencion}
          />

          <Filtro
            soloAtencion={soloAtencion}
            granularidad={granularidad}
            cuantos={necesitanAtencion.length}
            sinAvisar={sinAvisar}
          />

          {visibles.length === 0 ? (
            // Sin trabajo pendiente se celebra, no se informa un vacío.
            <div className="surface-card border-success bg-success-soft px-6 py-9 text-center">
              <p className="font-brand text-body font-bold text-success">
                Estás al día
              </p>
              <p className="mx-auto mt-1.5 max-w-md text-ui text-ink-60">
                Ningún trial ni ninguna suscripción vence en los próximos días,
                y no hay nada vencido sin cobrar.
              </p>
            </div>
          ) : (
            <TablaLubricentros filas={visibles} planes={catalogo} />
          )}
        </>
      )}
    </div>
  );
}

// Dos enlaces y no un select: el estado queda en la URL, así el filtro se
// puede compartir y sobrevive al refresh que hace cada aviso registrado.
function Filtro({
  soloAtencion,
  granularidad,
  cuantos,
  sinAvisar,
}: {
  soloAtencion: boolean;
  granularidad: Granularidad;
  cuantos: number;
  sinAvisar: number;
}) {
  const base =
    "flex h-9 items-center gap-2 rounded-md px-3 text-ui transition-colors";

  // Los dos filtros de la pantalla viven en la misma URL: cambiar uno no
  // puede pisar el otro. Semanal es el default, así que no se escribe.
  const sufijoPulso = granularidad === "semana" ? "" : `&pulso=${granularidad}`;

  return (
    <div className="mb-4 flex flex-wrap items-center gap-2">
      <Link
        href={`/fidelli${sufijoPulso ? `?${sufijoPulso.slice(1)}` : ""}`}
        aria-current={!soloAtencion ? "page" : undefined}
        className={
          soloAtencion
            ? `${base} border border-line bg-base text-ink-60 hover:bg-surface`
            : `${base} bg-ink font-semibold text-base`
        }
      >
        Todos
      </Link>

      <Link
        href={`/fidelli?atencion=1${sufijoPulso}`}
        aria-current={soloAtencion ? "page" : undefined}
        className={
          soloAtencion
            ? `${base} bg-ink font-semibold text-base`
            : `${base} border border-line bg-base text-ink-60 hover:bg-surface`
        }
      >
        Necesitan atención
        <span
          className={`rounded-sm px-1.5 py-px text-label font-semibold ${
            cuantos === 0
              ? "bg-surface text-ink-40"
              : soloAtencion
                ? "bg-base text-ink"
                : "bg-overdue-soft text-overdue"
          }`}
        >
          {cuantos}
        </span>
      </Link>

      {sinAvisar > 0 && (
        <span className="text-ui text-ink-60">
          {sinAvisar === 1
            ? "1 sin avisar todavía"
            : `${sinAvisar} sin avisar todavía`}
        </span>
      )}
    </div>
  );
}

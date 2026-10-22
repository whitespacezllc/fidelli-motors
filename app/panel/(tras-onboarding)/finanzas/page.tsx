import type { Metadata } from "next";
import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { obtenerSesion, featureHabilitada, panelSuspendido } from "@/lib/auth/session";
import { BloqueoPlan } from "@/components/panel/bloqueo-plan";
import { CabeceraSeccion } from "@/components/panel/cabecera-seccion";
import { EstadoVacio } from "@/components/ui/estado-vacio";
import { clasesBoton } from "@/components/ui/boton";
import { AccionBloqueada } from "@/components/panel/bloqueo-suspension";
import { formatearFecha } from "@/lib/fechas";
import { formatearPesos } from "@/lib/presupuestos";
import { MEDIOS_PAGO, ETIQUETA_MEDIO, type PuntoCaja } from "@/lib/finanzas";
import { esVistaPanel, type VistaPanel } from "@/lib/series";
import { TabsFinanzas } from "@/components/finanzas/tabs-finanzas";
import { GraficoCaja } from "@/components/finanzas/grafico-caja";
import { BotonExportar } from "@/components/panel/boton-exportar";

export const metadata: Metadata = { title: "Finanzas" };

const POR_PAGINA = 50;

type Periodo = { ingresos: number; egresos: number };
type Arqueo = Record<string, { ingresos: number; egresos: number }>;

// "El día": la caja del lubricentro. Entró / salió / queda de hoy, semana y
// mes; el arqueo por medio de hoy; y el detalle de movimientos.
export default async function PaginaFinanzas({
  searchParams,
}: {
  searchParams: Promise<{ pagina?: string; vista?: string }>;
}) {
  const sesion = await obtenerSesion();
  if (!featureHabilitada(sesion, "finanzas")) {
    return <BloqueoPlan funcion="Finanzas" />;
  }

  const params = await searchParams;
  const pagina = Math.max(1, Number(params.pagina) || 1);
  // Mensual por defecto, como el gráfico del Inicio.
  const vistaInicial: VistaPanel = esVistaPanel(params.vista) ? params.vista : "mes";
  const suspendido = await panelSuspendido();
  const supabase = await createClient();

  const [resumenRes, serieRes, listaRes] = await Promise.all([
    supabase.rpc("resumen_caja"),
    supabase.rpc("serie_caja"),
    supabase
      .from("vista_movimientos_caja")
      .select("id, tipo, fecha, concepto, monto, medio, sucursal_nombre", { count: "exact" })
      .order("fecha", { ascending: false })
      .order("created_at", { ascending: false })
      .range((pagina - 1) * POR_PAGINA, pagina * POR_PAGINA - 1),
  ]);

  const serieCruda = (serieRes.data ?? {}) as Partial<Record<VistaPanel, PuntoCaja[]>>;
  const series: Record<VistaPanel, PuntoCaja[]> = {
    semana: serieCruda.semana ?? [],
    mes: serieCruda.mes ?? [],
    trimestre: serieCruda.trimestre ?? [],
    anio: serieCruda.anio ?? [],
  };
  const haySerie = Object.values(series).some((s) => s.length > 0);

  const resumen = (resumenRes.data ?? {}) as {
    hoy?: Periodo;
    semana?: Periodo;
    mes?: Periodo;
    arqueo_hoy?: Arqueo;
  };

  const periodo = (p?: Periodo) => {
    const ingresos = Number(p?.ingresos ?? 0);
    const egresos = Number(p?.egresos ?? 0);
    return { ingresos, egresos, neto: ingresos - egresos };
  };

  const tarjetas = [
    { titulo: "Hoy", ...periodo(resumen.hoy) },
    { titulo: "Esta semana", ...periodo(resumen.semana) },
    { titulo: "Este mes", ...periodo(resumen.mes) },
  ];

  const arqueo = resumen.arqueo_hoy ?? {};
  const arqueoMedios = MEDIOS_PAGO.map((m) => {
    const ingresos = Number(arqueo[m]?.ingresos ?? 0);
    const egresos = Number(arqueo[m]?.egresos ?? 0);
    return { medio: m, neto: ingresos - egresos, movido: ingresos + egresos };
  });
  const hayArqueo = arqueoMedios.some((a) => a.movido > 0);

  const filas = (listaRes.data ?? []).map((m) => ({
    id: m.id as string,
    tipo: m.tipo as "ingreso" | "egreso",
    fecha: m.fecha as string,
    concepto: m.concepto as string,
    monto: Number(m.monto),
    medio: m.medio as string,
    sucursal: (m.sucursal_nombre as string) ?? "",
  }));

  const total = listaRes.count ?? 0;
  const paginas = Math.max(1, Math.ceil(total / POR_PAGINA));

  return (
    <div>
      <CabeceraSeccion titulo="Finanzas">
        <div className="flex flex-wrap items-center gap-2.5">
          {/* Exportar lee, así que va aun suspendido. */}
          <BotonExportar url="/panel/finanzas/exportar" cantidad={total} filtrando={false} />
          {suspendido ? (
            <AccionBloqueada etiqueta="+ Nuevo ingreso" />
          ) : (
            <>
              <Link href="/panel/finanzas/nuevo-egreso" className={clasesBoton("secundario", "md")}>
                + Egreso
              </Link>
              <Link href="/panel/finanzas/nuevo" className={clasesBoton("primario", "md")}>
                + Ingreso
              </Link>
            </>
          )}
        </div>
      </CabeceraSeccion>

      <TabsFinanzas activa="dia" />

      {/* El día de un vistazo: lo que queda (entró − salió), grande; entró y
          salió, chicos. */}
      <div className="mb-4 grid gap-3 sm:grid-cols-3">
        {tarjetas.map((t) => (
          <div key={t.titulo} className="surface-card px-5 py-4">
            <p className="text-label font-semibold tracking-[0.06em] text-ink-60 uppercase">
              {t.titulo}
            </p>
            <p className="mt-1 font-brand text-h3 font-bold text-ink tabular-nums">
              {formatearPesos(t.neto)}
            </p>
            <p className="mt-1 text-label text-ink-60 tabular-nums">
              Entró {formatearPesos(t.ingresos)} · Salió {formatearPesos(t.egresos)}
            </p>
          </div>
        ))}
      </div>

      {/* Arqueo de hoy: neto por medio. El efectivo neto es lo que tendría
          que haber en el cajón. */}
      {hayArqueo && (
        <div className="surface-card mb-5 px-5 py-4">
          <p className="mb-3 text-label font-semibold tracking-[0.06em] text-ink-60 uppercase">
            Arqueo de hoy
          </p>
          <div className="grid gap-3 sm:grid-cols-4">
            {arqueoMedios.map((a) => (
              <div key={a.medio}>
                <p className="text-label text-ink-60">{ETIQUETA_MEDIO[a.medio]}</p>
                <p className="font-brand text-body font-bold text-ink tabular-nums">
                  {formatearPesos(a.neto)}
                </p>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* La evolución de la caja: ingresos / egresos / neto por período. */}
      {haySerie && <GraficoCaja series={series} vistaInicial={vistaInicial} />}

      {filas.length > 0 ? (
        <>
          <ul className="surface-card px-4 sm:px-5">
            {filas.map((m) => (
              <li
                key={`${m.tipo}-${m.id}`}
                className="flex flex-wrap items-center gap-x-4 gap-y-1 border-b border-line py-3 last:border-b-0 lg:grid lg:grid-cols-[7.5rem_1fr_7rem_7rem_8rem] lg:gap-x-4"
              >
                <span className="order-2 text-label text-ink-60 tabular-nums lg:order-none lg:text-ui">
                  {formatearFecha(m.fecha)}
                </span>
                <span className="order-1 w-full truncate text-ui text-ink lg:order-none lg:w-auto">
                  {m.concepto}
                </span>
                <span className="order-4 text-label text-ink-60 lg:order-none lg:text-ui">
                  {ETIQUETA_MEDIO[m.medio as keyof typeof ETIQUETA_MEDIO] ?? m.medio}
                </span>
                <span className="order-5 hidden text-label text-ink-60 lg:order-none lg:inline lg:text-ui">
                  {m.sucursal}
                </span>
                <span
                  className={`order-3 ml-auto text-ui font-semibold tabular-nums lg:order-none lg:ml-0 lg:text-right ${
                    m.tipo === "egreso" ? "text-ink-60" : "text-ink"
                  }`}
                >
                  {m.tipo === "egreso" ? "− " : ""}
                  {formatearPesos(m.monto)}
                </span>
              </li>
            ))}
          </ul>

          {paginas > 1 && (
            <nav aria-label="Paginación" className="mt-4 flex items-center justify-between gap-4">
              {pagina > 1 ? (
                <Link
                  href={`/panel/finanzas?pagina=${pagina - 1}`}
                  className={clasesBoton("secundario", "md")}
                >
                  ← Anteriores
                </Link>
              ) : (
                <span />
              )}
              <span className="text-ui text-ink-60 tabular-nums">
                Página {pagina} de {paginas} · {total} movimientos
              </span>
              {pagina < paginas ? (
                <Link
                  href={`/panel/finanzas?pagina=${pagina + 1}`}
                  className={clasesBoton("secundario", "md")}
                >
                  Siguientes →
                </Link>
              ) : (
                <span />
              )}
            </nav>
          )}
        </>
      ) : (
        <EstadoVacio
          titulo="Todavía no registraste movimientos"
          descripcion="Cargá lo que entra y lo que sale, y mirá de un vistazo cuánto te queda hoy, esta semana y este mes. También podés marcar un presupuesto como cobrado."
        >
          {!suspendido && (
            <Link href="/panel/finanzas/nuevo" className={clasesBoton("secundario", "md")}>
              Registrar el primero
            </Link>
          )}
        </EstadoVacio>
      )}
    </div>
  );
}

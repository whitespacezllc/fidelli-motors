import type { Metadata } from "next";
import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { panelSuspendido } from "@/lib/auth/session";
import { clasesBoton } from "@/components/ui/boton";
import { CabeceraSeccion } from "@/components/panel/cabecera-seccion";
import {
  Checklist,
  estaCompleto,
  type EstadoChecklist,
} from "@/components/inicio/checklist";
import { Dashboard, type DatosInicio } from "@/components/inicio/dashboard";
import { FiltroSucursal } from "@/components/inicio/filtro-sucursal";
import { formatearDiaLargo, hoyISO } from "@/lib/fechas";
import {
  esVistaPanel,
  type PuntoSerie,
  type VistaPanel,
} from "@/lib/series";

export const metadata: Metadata = { title: "Inicio" };

type Resumen = DatosInicio & { checklist: EstadoChecklist };

export default async function PaginaInicio({
  searchParams,
}: {
  searchParams: Promise<{ sucursal?: string; vista?: string }>;
}) {
  const { sucursal, vista } = await searchParams;
  // Mensual por defecto: es la vista que ya existía y la que mejor lee un
  // negocio con meses de historia. El guard valida lo que venga en la URL.
  const vistaInicial: VistaPanel = esVistaPanel(vista) ? vista : "mes";
  const supabase = await createClient();

  // Una sola consulta para toda la pantalla —métricas, landing, gráfico,
  // retención y últimos services— más la lista de sucursales del filtro,
  // que es chica y va en paralelo. El resumen se arma en Postgres: ocho
  // agregados en ocho viajes sería el error a evitar.
  const [resumenRes, sucursalesRes, stockBajoRes] = await Promise.all([
    supabase.rpc("resumen_inicio", { p_sucursal_id: sucursal || undefined }),
    supabase
      .from("sucursales")
      .select("id, nombre")
      .eq("activa", true)
      .order("nombre"),
    // El aviso que hace que el stock sirva: sin esto es tipeo muerto.
    // Va aparte de resumen_inicio a propósito — es una consulta chica en
    // paralelo, y evita reescribir por cuarta vez la función más tocada
    // del schema.
    supabase.rpc("stock_bajo", { p_limite: 8 }),
  ]);

  const crudo = resumenRes.data as (Omit<Resumen, "series"> & {
    series?: Partial<Record<VistaPanel, PuntoSerie[]>>;
  }) | null;
  const sucursales = sucursalesRes.data ?? [];

  // Las cuatro series, con piso vacío cada una. El `?? []` no es
  // paranoia de tipos: desacopla el orden de despliegue. Si el front
  // nuevo llega antes que la migración —una ventana real entre el deploy
  // de Vercel y el `db push`—, `series` no existe y `series[vista]` tira
  // un TypeError que se lleva puesto el Inicio de TODOS los tenants. Con
  // el piso, el gráfico muestra su estado vacío y el resto de la pantalla
  // sigue en pie. Es la misma defensa que ya tiene el Pulso de /fidelli.
  const resumen: Resumen | null = crudo && {
    ...crudo,
    series: {
      semana: crudo.series?.semana ?? [],
      mes: crudo.series?.mes ?? [],
      trimestre: crudo.series?.trimestre ?? [],
      anio: crudo.series?.anio ?? [],
    },
  };

  // El "hoy" del negocio (hora argentina), no el del proceso Node — en
  // Vercel esto corre en UTC y a la noche se iba al día siguiente.
  const hoy = hoyISO();

  if (!resumen) {
    return (
      <div>
        <CabeceraSeccion titulo="Inicio" />
        <p className="text-ui text-ink-60">
          No pudimos traer el resumen. Recargá la pantalla en un momento.
        </p>
      </div>
    );
  }

  // Mientras el lubricentro esté a medio configurar, el checklist ocupa el
  // lugar del dashboard. Cuando los cuatro pasos están hechos desaparece
  // solo, sin celebración: simplemente ya no está.
  if (!estaCompleto(resumen.checklist)) {
    return (
      <Checklist
        estado={resumen.checklist}
        suspendido={await panelSuspendido()}
      />
    );
  }

  const nombreSucursal = sucursales.find((s) => s.id === sucursal)?.nombre;

  return (
    <div>
      <CabeceraSeccion titulo="Inicio">
        <div className="flex items-center gap-2.5">
          <FiltroSucursal sucursales={sucursales} actual={sucursal} />
          {/* El único botón primario de la pantalla */}
          <Link
            href="/panel/services/nuevo"
            className={clasesBoton("primario", "md")}
          >
            + Nuevo service
          </Link>
        </div>
      </CabeceraSeccion>

      <p className="-mt-3 mb-5 text-ui text-ink-40 tabular-nums">
        {formatearDiaLargo(hoy)}
        {nombreSucursal && ` · ${nombreSucursal}`}
      </p>

      <Dashboard
        datos={resumen}
        hoy={hoy}
        vista={vistaInicial}
        stockBajo={(stockBajoRes.data ?? []).map((p) => ({
          id: p.producto_id ?? "",
          nombre: p.nombre ?? "",
          marca: p.marca,
          stock: Number(p.stock),
          minimo: Number(p.stock_minimo),
          unidad: p.unidad === "litro" ? "L" : "u.",
        }))}
      />
    </div>
  );
}

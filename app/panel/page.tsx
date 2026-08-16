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
import { esVistaPanel, type VistaPanel } from "@/lib/series";

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
  const [resumenRes, sucursalesRes] = await Promise.all([
    supabase.rpc("resumen_inicio", { p_sucursal_id: sucursal || undefined }),
    supabase
      .from("sucursales")
      .select("id, nombre")
      .eq("activa", true)
      .order("nombre"),
  ]);

  const resumen = resumenRes.data as Resumen | null;
  const sucursales = sucursalesRes.data ?? [];

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

      <Dashboard datos={resumen} hoy={hoy} vista={vistaInicial} />
    </div>
  );
}

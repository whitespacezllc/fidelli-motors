import type { Metadata } from "next";
import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { clasesBoton } from "@/components/ui/boton";
import { CabeceraSeccion } from "@/components/panel/cabecera-seccion";
import {
  Checklist,
  estaCompleto,
  type EstadoChecklist,
} from "@/components/inicio/checklist";
import { Dashboard, type DatosInicio } from "@/components/inicio/dashboard";
import { formatearDiaLargo } from "@/lib/fechas";

export const metadata: Metadata = { title: "Inicio — Fidelli Motors" };

type Resumen = DatosInicio & { checklist: EstadoChecklist };

export default async function PaginaInicio() {
  const supabase = await createClient();

  // Una sola consulta para toda la pantalla: el resumen se arma en Postgres.
  const { data } = await supabase.rpc("resumen_inicio");
  const resumen = data as Resumen | null;

  const ahora = new Date();
  const hoy = `${ahora.getFullYear()}-${String(ahora.getMonth() + 1).padStart(2, "0")}-${String(ahora.getDate()).padStart(2, "0")}`;

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
    return <Checklist estado={resumen.checklist} />;
  }

  return (
    <div>
      <CabeceraSeccion titulo="Inicio">
        {/* El único botón primario de la pantalla */}
        <Link
          href="/panel/services/nuevo"
          className={clasesBoton("primario", "md")}
        >
          + Nuevo service
        </Link>
      </CabeceraSeccion>

      <p className="-mt-3 mb-5 text-ui text-ink-40 tabular-nums">
        {formatearDiaLargo(hoy)}
      </p>

      <Dashboard datos={resumen} hoy={hoy} />
    </div>
  );
}

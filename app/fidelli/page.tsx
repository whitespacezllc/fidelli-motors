import type { Metadata } from "next";
import { createClient } from "@/lib/supabase/server";
import { EstadoVacio } from "@/components/ui/estado-vacio";
import { IconoLubricentro } from "@/components/iconos";
import { TablaLubricentros } from "@/components/fidelli/tabla-lubricentros";
import { BotonAlta } from "@/components/fidelli/boton-alta";
import type { PlanCompleto } from "@/components/fidelli/tipos";

export const metadata: Metadata = { title: "Lubricentros — Fidelli Motors" };

export default async function PaginaLubricentros() {
  const supabase = await createClient();

  // Una consulta por pantalla: listado_lubricentros() ya trae la suscripción
  // vigente, la actividad del mes y el estado del owner de cada tenant.
  // Los planes van aparte porque los necesitan los formularios, no la tabla.
  const [{ data: filas }, { data: planes }] = await Promise.all([
    supabase.rpc("listado_lubricentros"),
    supabase
      .from("planes")
      .select("id, nombre, precio_mensual, descuento_semestral_pct, descuento_anual_pct")
      .eq("activo", true)
      .order("nombre"),
  ]);

  const lubricentros = filas ?? [];
  const catalogo = (planes ?? []) as PlanCompleto[];

  return (
    <div>
      <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
        <h1 className="font-brand text-h2 font-bold text-ink">Lubricentros</h1>
        {lubricentros.length > 0 && <BotonAlta />}
      </div>

      {/*
        Acá va la franja de totales —activos, MRR normalizado, services del
        mes, trials en curso— que es de la tarea de métricas generales.
        El espacio queda reservado a propósito: entra entre el título y la
        tabla, sin mover nada de lo que ya está.
      */}

      {lubricentros.length === 0 ? (
        <EstadoVacio
          icono={<IconoLubricentro className="size-6" />}
          titulo="Todavía no hay ningún lubricentro"
          descripcion="Acá van a aparecer todos los clientes de la plataforma con su suscripción, su actividad del mes y el estado de su owner. Empezá dando de alta el primero."
        >
          <BotonAlta etiqueta="+ Dar de alta el primero" />
        </EstadoVacio>
      ) : (
        <TablaLubricentros filas={lubricentros} planes={catalogo} />
      )}
    </div>
  );
}

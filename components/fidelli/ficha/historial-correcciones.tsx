import { createClient } from "@/lib/supabase/server";
import { PanelFicha } from "./panel-dato";
import { formatearFechaHora } from "@/lib/fechas";

// El libro de visitas de las correcciones de patente de este lubricentro.
//
// Solo aparece si hubo alguna: una sección vacía que diga "sin
// correcciones" sería ruido en una pantalla que ya tiene mucho. Y aparece
// entero, sin paginar — si un lubricentro acumula tantas correcciones como
// para necesitar paginado, eso ya es la señal, no la tabla.
export async function HistorialCorrecciones({
  lubricentroId,
}: {
  lubricentroId: string;
}) {
  const supabase = await createClient();

  // La policy ya limita a superadmin, pero el filtro por tenant va igual y
  // explícito: es la disciplina invertida de /fidelli — sin él, acá se
  // mezclarían las correcciones de toda la plataforma.
  const { data } = await supabase
    .from("correcciones_patente")
    .select(
      "id, patente_anterior, patente_nueva, motivo, created_at, usuarios(nombre)",
    )
    .eq("lubricentro_id", lubricentroId)
    .order("created_at", { ascending: false });

  const correcciones = data ?? [];
  if (correcciones.length === 0) return null;

  return (
    <PanelFicha titulo="Correcciones de patente">
      <p className="mb-3 text-ui text-ink-60">
        Las patentes que corregimos nosotros pasada la ventana de 72 horas.
        Este registro no se edita ni se borra.
      </p>

      <ul className="flex flex-col gap-2.5">
        {correcciones.map((c) => (
          <li
            key={c.id}
            className="rounded-md border border-line bg-surface px-3.5 py-3"
          >
            <div className="flex flex-wrap items-baseline gap-x-2 gap-y-1">
              <span className="plate text-ui text-ink-40 line-through">
                {c.patente_anterior}
              </span>
              <span aria-hidden className="text-ink-40">
                →
              </span>
              <span className="plate text-ui font-semibold text-ink">
                {c.patente_nueva}
              </span>
              <span className="ml-auto text-label whitespace-nowrap text-ink-40 tabular-nums">
                {formatearFechaHora(c.created_at)}
                {c.usuarios?.nombre && ` · ${c.usuarios.nombre}`}
              </span>
            </div>
            <p className="mt-1.5 text-ui leading-relaxed text-ink-60">
              {c.motivo}
            </p>
          </li>
        ))}
      </ul>
    </PanelFicha>
  );
}

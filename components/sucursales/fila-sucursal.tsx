import { FilaListado } from "@/components/ui/fila-listado";
import { DialogSucursal } from "@/components/sucursales/dialog-sucursal";
import { ToggleActiva } from "@/components/sucursales/toggle-activa";

type Sucursal = {
  id: string;
  nombre: string;
  direccion: string | null;
  telefono: string | null;
  activa: boolean;
};

export function FilaSucursal({ sucursal }: { sucursal: Sucursal }) {
  const detalle = [sucursal.direccion, sucursal.telefono]
    .filter(Boolean)
    .join(" · ");

  return (
    <FilaListado
      acciones={
        <>
          <DialogSucursal sucursal={sucursal} />
          <ToggleActiva
            id={sucursal.id}
            nombre={sucursal.nombre}
            activa={sucursal.activa}
          />
        </>
      }
    >
      <p
        className={`flex items-center gap-2 font-brand text-body font-bold ${
          sucursal.activa ? "text-ink" : "text-ink-40"
        }`}
      >
        <span className="truncate">{sucursal.nombre}</span>
        {!sucursal.activa && (
          // Estado en badge gris del sistema — el rojo es acción, no estado.
          <span className="shrink-0 rounded-sm border border-line px-1.5 py-0.5 font-ui text-label font-semibold tracking-[0.06em] text-ink-60 uppercase">
            Inactiva
          </span>
        )}
      </p>
      {detalle && (
        <p
          className={`mt-0.5 truncate text-ui ${
            sucursal.activa ? "text-ink-60" : "text-ink-40"
          }`}
        >
          {detalle}
        </p>
      )}
    </FilaListado>
  );
}

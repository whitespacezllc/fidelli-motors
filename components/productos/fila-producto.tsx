import { FilaListado } from "@/components/ui/fila-listado";
import { ToggleEstado } from "@/components/ui/toggle-estado";
import { DialogProducto } from "@/components/productos/dialog-producto";
import { AccionBloqueada } from "@/components/panel/bloqueo-suspension";
import { toggleProducto } from "@/app/panel/productos/actions";
import type { CategoriaProducto } from "@/lib/categorias";

type Producto = {
  id: string;
  categoria: CategoriaProducto;
  nombre: string;
  marca: string | null;
  activo: boolean;
};

export function FilaProducto({
  producto,
  suspendido = false,
}: {
  producto: Producto;
  suspendido?: boolean;
}) {
  return (
    <FilaListado
      acciones={
        // Ver el comentario de FilaSucursal: apagado y con el motivo, no dos
        // controles que rebotan.
        suspendido ? (
          <AccionBloqueada etiqueta="Editar" />
        ) : (
          <>
            <DialogProducto producto={producto} />
            <ToggleEstado
              id={producto.id}
              activo={producto.activo}
              etiqueta={producto.nombre}
              accion={toggleProducto}
            />
          </>
        )
      }
    >
      <p
        className={`flex items-center gap-2 font-brand text-body font-bold ${
          producto.activo ? "text-ink" : "text-ink-40"
        }`}
      >
        <span className="truncate">{producto.nombre}</span>
        {!producto.activo && (
          // Estado en badge gris del sistema — el rojo es acción, no estado.
          <span className="shrink-0 rounded-sm border border-line px-1.5 py-0.5 font-ui text-label font-semibold tracking-[0.06em] text-ink-60 uppercase">
            Inactivo
          </span>
        )}
      </p>
      {producto.marca && (
        <p
          className={`mt-0.5 truncate text-ui ${
            producto.activo ? "text-ink-60" : "text-ink-40"
          }`}
        >
          {producto.marca}
        </p>
      )}
    </FilaListado>
  );
}

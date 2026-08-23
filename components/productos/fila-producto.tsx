import { FilaListado } from "@/components/ui/fila-listado";
import { ToggleEstado } from "@/components/ui/toggle-estado";
import { DialogProducto } from "@/components/productos/dialog-producto";
import { AccionBloqueada } from "@/components/panel/bloqueo-suspension";
import { toggleProducto } from "@/app/panel/productos/actions";
import type { Categoria } from "@/lib/categorias";
import { formatearPesos } from "@/lib/presupuestos";

type Producto = {
  id: string;
  categoria: string;
  nombre: string;
  marca: string | null;
  activo: boolean;
  precio_venta: number | null;
  stock: number | null;
  stock_minimo: number | null;
  unidad: string;
  litros_sugeridos?: number | null;
};

export function FilaProducto({
  producto,
  categorias,
  suspendido = false,
}: {
  producto: Producto;
  categorias: Categoria[];
  suspendido?: boolean;
}) {
  const bajoMinimo =
    producto.stock != null &&
    producto.stock_minimo != null &&
    producto.stock <= producto.stock_minimo;
  const abreviatura = producto.unidad === "litro" ? "L" : "u.";
  return (
    <FilaListado
      acciones={
        // Ver el comentario de FilaSucursal: apagado y con el motivo, no dos
        // controles que rebotan.
        suspendido ? (
          <AccionBloqueada etiqueta="Editar" />
        ) : (
          <>
            <DialogProducto
              producto={{ ...producto, litros_sugeridos: producto.litros_sugeridos ?? null }}
              categorias={categorias}
            />
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
      {(producto.marca ||
        producto.precio_venta != null ||
        producto.stock != null) && (
        <p
          className={`mt-0.5 flex flex-wrap items-center gap-x-2.5 gap-y-0.5 text-ui tabular-nums ${
            producto.activo ? "text-ink-60" : "text-ink-40"
          }`}
        >
          {producto.marca && <span className="truncate">{producto.marca}</span>}
          {producto.precio_venta != null && (
            <span className="font-semibold text-ink">
              {formatearPesos(producto.precio_venta)}
            </span>
          )}
          {producto.stock != null && (
            <span className={bajoMinimo ? "font-semibold text-overdue" : ""}>
              stock {producto.stock} {abreviatura}
              {producto.stock_minimo != null && ` · mín ${producto.stock_minimo}`}
            </span>
          )}
        </p>
      )}
    </FilaListado>
  );
}

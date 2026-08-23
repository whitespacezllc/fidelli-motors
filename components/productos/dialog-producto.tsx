"use client";

import { useActionState, useEffect, useState } from "react";
import { Dialog, DialogTrigger, DialogContenido } from "@/components/ui/dialog";
import { Boton, clasesBoton } from "@/components/ui/boton";
import type { Categoria } from "@/lib/categorias";
import {
  crearProducto,
  editarProducto,
  type EstadoProducto,
} from "@/app/panel/productos/actions";

type Producto = {
  id: string;
  categoria: string;
  nombre: string;
  marca: string | null;
  precio_venta: number | null;
  stock: number | null;
  stock_minimo: number | null;
  unidad: string;
  litros_sugeridos: number | null;
};

const ESTADO_INICIAL: EstadoProducto = {};

const CLASE_CAMPO =
  "h-12 w-full rounded-md border border-line bg-base px-3.5 text-body text-ink placeholder:text-ink-40";
const CLASE_LABEL =
  "mb-1.5 block text-label font-semibold tracking-[0.06em] text-ink-60 uppercase";

function FormularioProducto({
  producto,
  categorias,
  alGuardar,
}: {
  producto?: Producto;
  categorias: Categoria[];
  alGuardar: () => void;
}) {
  const [estado, accion, pendiente] = useActionState(
    producto ? editarProducto : crearProducto,
    ESTADO_INICIAL,
  );
  const [sinConexion, setSinConexion] = useState(false);
  const [unidad, setUnidad] = useState(producto?.unidad ?? "unidad");
  // El stock es OPCIONAL de verdad: apagado, los campos ni existen.
  const [llevaStock, setLlevaStock] = useState(producto?.stock != null);

  useEffect(() => {
    if (estado.ok) alGuardar();
  }, [estado.ok, alGuardar]);

  const error = sinConexion
    ? "Estás sin conexión a internet. No cierres esta ventana: lo que cargaste sigue acá. Cuando vuelva la señal, tocá Guardar de nuevo."
    : estado.error;

  return (
    <form
      action={accion}
      onSubmit={(e) => {
        if (!navigator.onLine) {
          e.preventDefault();
          setSinConexion(true);
        } else {
          setSinConexion(false);
        }
      }}
      className="flex flex-col gap-4"
    >
      {error && (
        <p
          role="alert"
          className="rounded-md bg-overdue-soft px-3.5 py-3 text-ui text-overdue"
        >
          {error}
        </p>
      )}

      {producto && <input type="hidden" name="id" value={producto.id} />}

      {/* Las categorías del catálogo global: se muestran todas, no
          escondidas en un dropdown. Radios de verdad para teclado y lector. */}
      <fieldset>
        <legend className={CLASE_LABEL}>Categoría</legend>
        <div className="flex flex-wrap gap-2">
          {categorias.map((c, i) => (
            <label
              key={c.valor}
              className="cursor-pointer rounded-md border border-line px-3.5 py-2.5 text-ui text-ink-60 transition-colors has-checked:border-ink has-checked:bg-ink has-checked:font-semibold has-checked:text-white"
            >
              <input
                type="radio"
                name="categoria"
                value={c.valor}
                required
                defaultChecked={
                  producto ? producto.categoria === c.valor : i === 0
                }
                className="sr-only"
              />
              {c.singular}
            </label>
          ))}
        </div>
      </fieldset>

      <div>
        <label htmlFor="nombre" className={CLASE_LABEL}>
          Nombre
        </label>
        <input
          id="nombre"
          name="nombre"
          required
          minLength={2}
          defaultValue={producto?.nombre}
          className={CLASE_CAMPO}
        />
      </div>

      <div>
        <label htmlFor="marca" className={CLASE_LABEL}>
          Marca <span className="text-ink-40 normal-case">(opcional)</span>
        </label>
        <input
          id="marca"
          name="marca"
          defaultValue={producto?.marca ?? ""}
          className={CLASE_CAMPO}
        />
      </div>

      {/* Precio y unidad. Nulables: sin precio, el producto funciona
          idéntico a siempre. SIN COSTO — esa frontera no se cruza. */}
      <div className="grid grid-cols-2 gap-3">
        <div>
          <label htmlFor="precio_venta" className={CLASE_LABEL}>
            Precio de venta{" "}
            <span className="text-ink-40 normal-case">(opcional)</span>
          </label>
          <div className="relative">
            <span className="pointer-events-none absolute inset-y-0 left-3.5 flex items-center text-body text-ink-40">
              $
            </span>
            <input
              id="precio_venta"
              name="precio_venta"
              inputMode="decimal"
              defaultValue={producto?.precio_venta ?? ""}
              className={`${CLASE_CAMPO} pl-8 text-right tabular-nums`}
            />
          </div>
        </div>
        <div>
          <label htmlFor="unidad" className={CLASE_LABEL}>
            Se mide en
          </label>
          <select
            id="unidad"
            name="unidad"
            value={unidad}
            onChange={(e) => setUnidad(e.target.value)}
            className={`${CLASE_CAMPO} cursor-pointer`}
          >
            <option value="unidad">Unidades</option>
            <option value="litro">Litros</option>
          </select>
        </div>
      </div>

      {/* El stock, detrás de un interruptor: NULO significa "no llevo
          stock" y el que no lo usa no ve nada de esto molestando. */}
      <label className="flex min-h-11 cursor-pointer items-center gap-3">
        <input
          type="checkbox"
          name="lleva_stock"
          checked={llevaStock}
          onChange={() => setLlevaStock((v) => !v)}
          className="size-5 shrink-0 cursor-pointer accent-ink"
        />
        <span className="text-body text-ink">Llevo stock de este producto</span>
      </label>

      {llevaStock && (
        <div className="grid grid-cols-2 gap-3 rounded-md border border-line bg-surface/60 p-3">
          <div>
            <label htmlFor="stock" className={CLASE_LABEL}>
              Stock actual
            </label>
            <input
              id="stock"
              name="stock"
              inputMode="decimal"
              defaultValue={producto?.stock ?? ""}
              className={`${CLASE_CAMPO} tabular-nums`}
            />
            <p className="mt-1 text-label text-ink-60">
              En {unidad === "litro" ? "litros" : "unidades"}. El ajuste es
              editar este número.
            </p>
          </div>
          <div>
            <label htmlFor="stock_minimo" className={CLASE_LABEL}>
              Avisar debajo de
            </label>
            <input
              id="stock_minimo"
              name="stock_minimo"
              inputMode="decimal"
              defaultValue={producto?.stock_minimo ?? ""}
              className={`${CLASE_CAMPO} tabular-nums`}
            />
            <p className="mt-1 text-label text-ink-60">
              En o debajo de esto, aparece en Inicio.
            </p>
          </div>
          {unidad === "litro" && (
            <div className="col-span-2">
              <label htmlFor="litros_sugeridos" className={CLASE_LABEL}>
                Litros por service{" "}
                <span className="text-ink-40 normal-case">(sugerido)</span>
              </label>
              <input
                id="litros_sugeridos"
                name="litros_sugeridos"
                inputMode="decimal"
                defaultValue={producto?.litros_sugeridos ?? ""}
                placeholder="4"
                className={`${CLASE_CAMPO} max-w-[120px] tabular-nums`}
              />
              <p className="mt-1 text-label text-ink-60">
                El cartón lo precarga solo: en el caso normal el mecánico no
                toca nada. Vacío = el stock no se mueve.
              </p>
            </div>
          )}
        </div>
      )}

      <Boton type="submit" tam="lg" disabled={pendiente} className="mt-1 w-full">
        {pendiente ? "Guardando…" : "Guardar"}
      </Boton>
    </form>
  );
}

// Un solo dialog para crear y editar: cambia el título y la action.
export function DialogProducto({
  producto,
  categorias,
  etiquetaTrigger,
}: {
  producto?: Producto;
  categorias: Categoria[];
  etiquetaTrigger?: string;
}) {
  const [abierto, setAbierto] = useState(false);

  return (
    <Dialog open={abierto} onOpenChange={setAbierto}>
      {producto ? (
        <DialogTrigger className={clasesBoton("secundario", "md")}>
          Editar
        </DialogTrigger>
      ) : (
        <DialogTrigger className={clasesBoton("primario", "md")}>
          {etiquetaTrigger ?? "+ Nuevo producto"}
        </DialogTrigger>
      )}
      <DialogContenido titulo={producto ? "Editar producto" : "Nuevo producto"}>
        <FormularioProducto
          producto={producto}
          categorias={categorias}
          alGuardar={() => setAbierto(false)}
        />
      </DialogContenido>
    </Dialog>
  );
}

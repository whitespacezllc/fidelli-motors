"use client";

import { useActionState, useEffect, useState } from "react";
import { Dialog, DialogTrigger, DialogContenido } from "@/components/ui/dialog";
import { Boton, clasesBoton } from "@/components/ui/boton";
import { CATEGORIAS, type CategoriaProducto } from "@/lib/categorias";
import {
  crearProducto,
  editarProducto,
  type EstadoProducto,
} from "@/app/panel/productos/actions";

type Producto = {
  id: string;
  categoria: CategoriaProducto;
  nombre: string;
  marca: string | null;
};

const ESTADO_INICIAL: EstadoProducto = {};

const CLASE_CAMPO =
  "h-12 w-full rounded-md border border-line bg-base px-3.5 text-body text-ink placeholder:text-ink-40";
const CLASE_LABEL =
  "mb-1.5 block text-label font-semibold tracking-[0.06em] text-ink-60 uppercase";

function FormularioProducto({
  producto,
  alGuardar,
}: {
  producto?: Producto;
  alGuardar: () => void;
}) {
  const [estado, accion, pendiente] = useActionState(
    producto ? editarProducto : crearProducto,
    ESTADO_INICIAL,
  );
  const [sinConexion, setSinConexion] = useState(false);

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

      {/* Cinco opciones de uso diario: se muestran todas, no escondidas en un
          dropdown. Radios de verdad para que funcione con teclado y lector. */}
      <fieldset>
        <legend className={CLASE_LABEL}>Categoría</legend>
        <div className="flex flex-wrap gap-2">
          {CATEGORIAS.map((c, i) => (
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

      <Boton type="submit" tam="lg" disabled={pendiente} className="mt-1 w-full">
        {pendiente ? "Guardando…" : "Guardar"}
      </Boton>
    </form>
  );
}

// Un solo dialog para crear y editar: cambia el título y la action.
export function DialogProducto({
  producto,
  etiquetaTrigger,
}: {
  producto?: Producto;
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
          alGuardar={() => setAbierto(false)}
        />
      </DialogContenido>
    </Dialog>
  );
}

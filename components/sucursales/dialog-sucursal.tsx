"use client";

import { useActionState, useEffect, useState } from "react";
import { Dialog, DialogTrigger, DialogContenido } from "@/components/ui/dialog";
import { Boton, clasesBoton } from "@/components/ui/boton";
import {
  crearSucursal,
  editarSucursal,
  type EstadoSucursal,
} from "@/app/panel/sucursales/actions";

type Sucursal = {
  id: string;
  nombre: string;
  direccion: string | null;
  telefono: string | null;
};

const ESTADO_INICIAL: EstadoSucursal = {};

const CLASE_CAMPO =
  "h-12 w-full rounded-md border border-line bg-base px-3.5 text-body text-ink placeholder:text-ink-40";
const CLASE_LABEL =
  "mb-1.5 block text-label font-semibold tracking-[0.06em] text-ink-60 uppercase";

function FormularioSucursal({
  sucursal,
  alGuardar,
}: {
  sucursal?: Sucursal;
  alGuardar: () => void;
}) {
  const [estado, accion, pendiente] = useActionState(
    sucursal ? editarSucursal : crearSucursal,
    ESTADO_INICIAL,
  );
  const [sinConexion, setSinConexion] = useState(false);

  // Guardado OK: el dialog se cierra y la lista ya quedó revalidada.
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

      {sucursal && <input type="hidden" name="id" value={sucursal.id} />}

      <div>
        <label htmlFor="nombre" className={CLASE_LABEL}>
          Nombre
        </label>
        <input
          id="nombre"
          name="nombre"
          required
          minLength={2}
          defaultValue={sucursal?.nombre}
          placeholder="Casa Central"
          className={CLASE_CAMPO}
        />
      </div>

      <div>
        <label htmlFor="direccion" className={CLASE_LABEL}>
          Dirección <span className="normal-case text-ink-40">(opcional)</span>
        </label>
        <input
          id="direccion"
          name="direccion"
          defaultValue={sucursal?.direccion ?? ""}
          placeholder="Av. San Martín 2450"
          className={CLASE_CAMPO}
        />
      </div>

      <div>
        <label htmlFor="telefono" className={CLASE_LABEL}>
          Teléfono <span className="normal-case text-ink-40">(opcional)</span>
        </label>
        <input
          id="telefono"
          name="telefono"
          type="tel"
          defaultValue={sucursal?.telefono ?? ""}
          placeholder="351 555 4120"
          className={CLASE_CAMPO}
        />
      </div>

      {/* Ancho completo = ancho fijo: el texto puede cambiar sin mover nada. */}
      <Boton type="submit" tam="lg" disabled={pendiente} className="mt-1 w-full">
        {pendiente ? "Guardando…" : "Guardar"}
      </Boton>
    </form>
  );
}

// Un solo dialog para crear y editar: cambia el título y la action.
export function DialogSucursal({
  sucursal,
  etiquetaTrigger,
}: {
  sucursal?: Sucursal;
  etiquetaTrigger?: string;
}) {
  const [abierto, setAbierto] = useState(false);

  return (
    <Dialog open={abierto} onOpenChange={setAbierto}>
      {sucursal ? (
        <DialogTrigger className={clasesBoton("secundario", "md")}>
          Editar
        </DialogTrigger>
      ) : (
        <DialogTrigger className={clasesBoton("primario", "md")}>
          {etiquetaTrigger ?? "+ Nueva sucursal"}
        </DialogTrigger>
      )}
      <DialogContenido titulo={sucursal ? "Editar sucursal" : "Nueva sucursal"}>
        <FormularioSucursal
          sucursal={sucursal}
          alGuardar={() => setAbierto(false)}
        />
      </DialogContenido>
    </Dialog>
  );
}

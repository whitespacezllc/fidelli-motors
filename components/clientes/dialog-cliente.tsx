"use client";

import { useActionState, useEffect, useState } from "react";
import { Dialog, DialogTrigger, DialogContenido } from "@/components/ui/dialog";
import { Boton, clasesBoton } from "@/components/ui/boton";
import {
  crearCliente,
  editarCliente,
  type EstadoCliente,
} from "@/app/panel/clientes/actions";

type Cliente = {
  id: string;
  nombre: string;
  telefono: string;
  email: string | null;
};

const ESTADO_INICIAL: EstadoCliente = {};

const CLASE_CAMPO =
  "h-12 w-full rounded-md border border-line bg-base px-3.5 text-body text-ink placeholder:text-ink-40";
const CLASE_LABEL =
  "mb-1.5 block text-label font-semibold tracking-[0.06em] text-ink-60 uppercase";

function FormularioCliente({
  cliente,
  alGuardar,
}: {
  cliente?: Cliente;
  alGuardar: () => void;
}) {
  const [estado, accion, pendiente] = useActionState(
    cliente ? editarCliente : crearCliente,
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

      {cliente && <input type="hidden" name="id" value={cliente.id} />}

      <div>
        <label htmlFor="nombre" className={CLASE_LABEL}>
          Nombre
        </label>
        <input
          id="nombre"
          name="nombre"
          required
          minLength={2}
          defaultValue={cliente?.nombre}
          placeholder="Pedro Gómez"
          className={CLASE_CAMPO}
        />
      </div>

      <div>
        <label htmlFor="telefono" className={CLASE_LABEL}>
          Teléfono
        </label>
        <input
          id="telefono"
          name="telefono"
          type="tel"
          required
          inputMode="tel"
          defaultValue={cliente?.telefono}
          placeholder="351 555 0442"
          className={CLASE_CAMPO}
        />
      </div>

      <div>
        <label htmlFor="email" className={CLASE_LABEL}>
          Email <span className="text-ink-40 normal-case">(opcional)</span>
        </label>
        <input
          id="email"
          name="email"
          type="email"
          inputMode="email"
          defaultValue={cliente?.email ?? ""}
          placeholder="pedro.gomez@gmail.com"
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
export function DialogCliente({
  cliente,
  etiquetaTrigger,
  variante = "primario",
}: {
  cliente?: Cliente;
  etiquetaTrigger?: string;
  variante?: "primario" | "secundario";
}) {
  const [abierto, setAbierto] = useState(false);

  return (
    <Dialog open={abierto} onOpenChange={setAbierto}>
      <DialogTrigger className={clasesBoton(variante, "md")}>
        {etiquetaTrigger ?? (cliente ? "Editar datos" : "+ Nuevo cliente")}
      </DialogTrigger>
      <DialogContenido titulo={cliente ? "Editar cliente" : "Nuevo cliente"}>
        <FormularioCliente cliente={cliente} alGuardar={() => setAbierto(false)} />
      </DialogContenido>
    </Dialog>
  );
}

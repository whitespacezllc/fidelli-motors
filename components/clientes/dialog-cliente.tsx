"use client";

import { useActionState, useEffect, useState } from "react";
import { Dialog, DialogTrigger, DialogContenido } from "@/components/ui/dialog";
import { Boton, clasesBoton } from "@/components/ui/boton";
import {
  crearCliente,
  editarCliente,
  type EstadoCliente,
} from "@/app/panel/clientes/actions";
import {
  formatearCuit,
  normalizarCuit,
  verificadorCuitCierra,
} from "@/lib/cuit";

type Cliente = {
  id: string;
  nombre: string;
  telefono: string;
  email: string | null;
  cuit: string | null;
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
  const [cuit, setCuit] = useState(formatearCuit(cliente?.cuit ?? null));

  // Advierte, nunca bloquea: 11 dígitos con verificador que no cierra es
  // casi seguro un número mal copiado — mejor enterarse ahora que en la
  // factura. Menos dígitos ni se evalúa: puede estar a mitad de tipeo.
  const cuitDigitos = normalizarCuit(cuit);
  const cuitDudoso =
    cuitDigitos.length === 11 && !verificadorCuitCierra(cuitDigitos);

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
          className={CLASE_CAMPO}
        />
      </div>

      <div>
        <label htmlFor="cuit" className={CLASE_LABEL}>
          CUIL/CUIT <span className="text-ink-40 normal-case">(opcional)</span>
        </label>
        <input
          id="cuit"
          name="cuit"
          inputMode="numeric"
          value={cuit}
          onChange={(e) => setCuit(e.target.value)}
          className={`${CLASE_CAMPO} tabular-nums`}
        />
        <p className="mt-1.5 text-label text-ink-60">
          Para tenerlo listo cuando haya que facturarle.
        </p>
        {cuitDudoso && (
          <p className="mt-2 rounded-md bg-urgente-soft px-3.5 py-3 text-ui text-urgente">
            Ese número no parece un CUIL/CUIT: el dígito verificador no
            cierra. Revisalo — si es el que te dieron, guardá igual.
          </p>
        )}
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

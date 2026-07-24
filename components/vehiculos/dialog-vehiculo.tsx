"use client";

import { useActionState, useEffect, useState } from "react";
import { Dialog, DialogTrigger, DialogContenido } from "@/components/ui/dialog";
import { Boton, clasesBoton } from "@/components/ui/boton";
import { esPatenteValida, PATENTE_FORMATO } from "@/lib/texto";
import {
  crearVehiculo,
  editarVehiculo,
  type EstadoVehiculo,
} from "@/app/panel/clientes/[id]/actions";

type Vehiculo = {
  id: string;
  patente: string;
  marca: string | null;
  modelo: string | null;
  anio: number | null;
};

const ESTADO_INICIAL: EstadoVehiculo = {};

const CLASE_CAMPO =
  "h-12 w-full rounded-md border border-line bg-base px-3.5 text-body text-ink placeholder:text-ink-40";
const CLASE_LABEL =
  "mb-1.5 block text-label font-semibold tracking-[0.06em] text-ink-60 uppercase";

function FormularioVehiculo({
  clienteId,
  vehiculo,
  alGuardar,
}: {
  clienteId: string;
  vehiculo?: Vehiculo;
  alGuardar: () => void;
}) {
  const [estado, accion, pendiente] = useActionState(
    vehiculo ? editarVehiculo : crearVehiculo,
    ESTADO_INICIAL,
  );
  const [sinConexion, setSinConexion] = useState(false);
  const [errorPatente, setErrorPatente] = useState<string | null>(null);

  useEffect(() => {
    if (estado.ok) alGuardar();
  }, [estado.ok, alGuardar]);

  const error = sinConexion
    ? "Estás sin conexión a internet. No cierres esta ventana: lo que cargaste sigue acá. Cuando vuelva la señal, tocá Guardar de nuevo."
    : (errorPatente ?? estado.error);

  const anioMaximo = new Date().getFullYear() + 1;

  return (
    <form
      action={accion}
      onSubmit={(e) => {
        const form = e.currentTarget;
        const patente = (form.elements.namedItem("patente") as HTMLInputElement)
          .value;

        // Se valida antes de enviar: es mejor avisar acá que comerse el
        // rechazo del CHECK de la base con el auto esperando.
        if (!esPatenteValida(patente)) {
          e.preventDefault();
          setErrorPatente(PATENTE_FORMATO);
          return;
        }
        setErrorPatente(null);

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

      {vehiculo && <input type="hidden" name="id" value={vehiculo.id} />}
      <input type="hidden" name="cliente_id" value={clienteId} />

      <div>
        <label htmlFor="patente" className={CLASE_LABEL}>
          Patente
        </label>
        <input
          id="patente"
          name="patente"
          required
          defaultValue={vehiculo?.patente}
          placeholder="AB 123 CD"
          autoCapitalize="characters"
          autoComplete="off"
          // Mayúsculas mientras escribe (también al pegar), pero sin máscara
          // de espaciado: las máscaras pelean con pegar y con autocompletar.
          onChange={(e) => {
            const cursor = e.target.selectionStart;
            e.target.value = e.target.value.toUpperCase();
            e.target.setSelectionRange(cursor, cursor);
            if (errorPatente) setErrorPatente(null);
          }}
          className={`${CLASE_CAMPO} plate uppercase`}
        />
        <p className="mt-1.5 text-label text-ink-40">
          Vieja (ABC 123) o Mercosur (AB 123 CD).
        </p>
      </div>

      <div className="flex gap-3">
        <div className="flex-1">
          <label htmlFor="marca" className={CLASE_LABEL}>
            Marca <span className="text-ink-40 normal-case">(opcional)</span>
          </label>
          <input
            id="marca"
            name="marca"
            defaultValue={vehiculo?.marca ?? ""}
            placeholder="Chevrolet"
            className={CLASE_CAMPO}
          />
        </div>
        <div className="flex-1">
          <label htmlFor="modelo" className={CLASE_LABEL}>
            Modelo <span className="text-ink-40 normal-case">(opcional)</span>
          </label>
          <input
            id="modelo"
            name="modelo"
            defaultValue={vehiculo?.modelo ?? ""}
            placeholder="Corsa"
            className={CLASE_CAMPO}
          />
        </div>
      </div>

      <div>
        <label htmlFor="anio" className={CLASE_LABEL}>
          Año <span className="text-ink-40 normal-case">(opcional)</span>
        </label>
        <input
          id="anio"
          name="anio"
          type="number"
          inputMode="numeric"
          min={1900}
          max={anioMaximo}
          step={1}
          defaultValue={vehiculo?.anio ?? ""}
          placeholder="2011"
          className={`${CLASE_CAMPO} tabular-nums`}
        />
      </div>

      <Boton type="submit" tam="lg" disabled={pendiente} className="mt-1 w-full">
        {pendiente ? "Guardando…" : "Guardar"}
      </Boton>
    </form>
  );
}

// Un solo dialog para crear y editar: cambia el título y la action.
export function DialogVehiculo({
  clienteId,
  vehiculo,
  etiquetaTrigger,
  variante = "secundario",
}: {
  clienteId: string;
  vehiculo?: Vehiculo;
  etiquetaTrigger?: string;
  variante?: "primario" | "secundario";
}) {
  const [abierto, setAbierto] = useState(false);

  return (
    <Dialog open={abierto} onOpenChange={setAbierto}>
      <DialogTrigger className={clasesBoton(variante, "md")}>
        {etiquetaTrigger ?? (vehiculo ? "Editar" : "+ Agregar vehículo")}
      </DialogTrigger>
      <DialogContenido titulo={vehiculo ? "Editar vehículo" : "Nuevo vehículo"}>
        <FormularioVehiculo
          clienteId={clienteId}
          vehiculo={vehiculo}
          alGuardar={() => setAbierto(false)}
        />
      </DialogContenido>
    </Dialog>
  );
}

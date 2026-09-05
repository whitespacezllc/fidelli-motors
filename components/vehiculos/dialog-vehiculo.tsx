"use client";

import { useActionState, useEffect, useState } from "react";
import { CamposMarcaModelo } from "@/components/vehiculos/campos-marca-modelo";
import { Dialog, DialogTrigger, DialogContenido } from "@/components/ui/dialog";
import { Boton, clasesBoton } from "@/components/ui/boton";
import { IconoCandado } from "@/components/iconos";
import { esPatenteValida, PATENTE_FORMATO } from "@/lib/texto";
import {
  estadoPatente,
  patenteEditable,
  vencimientoLegible,
} from "@/lib/patente";
import { urlWhatsappSoporte } from "@/lib/config";
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
  // created_at del PRIMER service no anulado, o null si no tiene ninguno.
  // De ahí sale la ventana de 72 hs para corregir la patente.
  primerServiceEn?: string | null;
};

const ESTADO_INICIAL: EstadoVehiculo = {};

const CLASE_CAMPO =
  "h-12 w-full rounded-md border border-line bg-base px-3.5 text-body text-ink placeholder:text-ink-40";
const CLASE_LABEL =
  "mb-1.5 block text-label font-semibold tracking-[0.06em] text-ink-60 uppercase";

function FormularioVehiculo({
  clienteId,
  vehiculo,
  marcas,
  alGuardar,
}: {
  clienteId: string;
  vehiculo?: Vehiculo;
  marcas: string[];
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

  // La patente se corrige hasta 72 hs después del primer service; pasado
  // ese plazo la cambia Fidelli con un motivo registrado. Cuando está fija
  // el campo va readOnly y NO disabled: así el valor sigue viajando en el
  // submit y la base lo ve igual (no cambió). Marca, modelo y año se
  // siguen pudiendo editar siempre.
  const patente = estadoPatente(vehiculo?.primerServiceEn ?? null);
  const patenteBloqueada = !patenteEditable(patente);

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
          readOnly={patenteBloqueada}
          aria-describedby={patenteBloqueada ? "patente-motivo" : undefined}
          autoCapitalize="characters"
          autoComplete="off"
          // Mayúsculas mientras escribe (también al pegar), pero sin máscara
          // de espaciado: las máscaras pelean con pegar y con autocompletar.
          onChange={
            patenteBloqueada
              ? undefined
              : (e) => {
                  const cursor = e.target.selectionStart;
                  e.target.value = e.target.value.toUpperCase();
                  e.target.setSelectionRange(cursor, cursor);
                  if (errorPatente) setErrorPatente(null);
                }
          }
          className={`${CLASE_CAMPO} plate uppercase ${
            patenteBloqueada ? "bg-surface text-ink-40" : ""
          }`}
        />
        {patente.tipo === "fija" ? (
          <p
            id="patente-motivo"
            className="mt-1.5 flex items-start gap-1.5 rounded-md bg-surface px-3 py-2 text-label text-ink-60"
          >
            <IconoCandado className="mt-px size-3.5 shrink-0" />
            <span>
              El plazo para corregirla venció, así que la patente quedó fija —
              es lo que hace confiable el historial que ve tu cliente. Si está
              mal,{" "}
              <a
                href={urlWhatsappSoporte()}
                target="_blank"
                rel="noopener noreferrer"
                className="font-semibold text-ink underline underline-offset-2"
              >
                escribinos
              </a>{" "}
              contándonos qué pasó y la corregimos nosotros.
            </span>
          </p>
        ) : patente.tipo === "ventana" ? (
          /* Ámbar: corre contra el reloj, como el badge de service abierto.
             Nunca rojo — el rojo es solo acción. */
          <p
            id="patente-motivo"
            className="mt-1.5 rounded-md bg-urgente-soft px-3 py-2 text-label text-urgente"
          >
            Si está mal, corregila{" "}
            <span className="font-semibold">
              {vencimientoLegible(patente.vence)}
            </span>
            . Después queda fija y la cambiamos nosotros.
          </p>
        ) : (
          <p className="mt-1.5 text-label text-ink-40">
            Auto: ABC 123 o AB 123 CD · Moto: 123 ABC o A 123 BCD.
          </p>
        )}
      </div>

      <CamposMarcaModelo
        marcas={marcas}
        marcaInicial={vehiculo?.marca ?? ""}
        modeloInicial={vehiculo?.modelo ?? ""}
      />

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
  marcas = [],
  etiquetaTrigger,
  variante = "secundario",
}: {
  clienteId: string;
  vehiculo?: Vehiculo;
  marcas?: string[];
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
          marcas={marcas}
          alGuardar={() => setAbierto(false)}
        />
      </DialogContenido>
    </Dialog>
  );
}

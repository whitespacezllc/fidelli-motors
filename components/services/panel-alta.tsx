"use client";

import { useActionState, useRef, useState } from "react";
import { Boton } from "@/components/ui/boton";
import { IconoBuscar } from "@/components/iconos";
import {
  buscarClientes,
  crearVehiculoParaCliente,
  crearClienteYVehiculo,
  type ClienteSugerido,
  type EstadoAlta,
} from "@/app/panel/services/nuevo/actions";
import { CamposMarcaModelo } from "@/components/vehiculos/campos-marca-modelo";

const ESTADO_INICIAL: EstadoAlta = {};

const CLASE_CAMPO =
  "h-12 w-full rounded-md border border-line bg-base px-3.5 text-body text-ink placeholder:text-ink-40";
const CLASE_LABEL =
  "mb-1.5 block text-label font-semibold tracking-[0.06em] text-ink-60 uppercase";

// Campos del auto, compartidos por los dos caminos. La patente ya viene
// tipeada del Momento 0: no se vuelve a pedir, se muestra fija.
function CamposVehiculo({
  patente,
  marcas,
}: {
  patente: string;
  marcas: string[];
}) {
  return (
    <>
      <input type="hidden" name="patente" value={patente} />
      <CamposMarcaModelo marcas={marcas} />
      {/* En mobile el año ocupa todo el ancho, como siempre. Desde tablet se
          recorta a media fila —el mismo ancho que marca y modelo— para que no
          quede un campo largo suelto debajo del par. */}
      <div className="sm:w-1/2 sm:pr-1.5">
        <label htmlFor="anio" className={CLASE_LABEL}>
          Año <span className="text-ink-40 normal-case">(opcional)</span>
        </label>
        <input
          id="anio"
          name="anio"
          type="number"
          inputMode="numeric"
          min={1900}
          max={new Date().getFullYear() + 1}
          className={`${CLASE_CAMPO} tabular-nums`}
        />
      </div>
    </>
  );
}

function Aviso({ mensaje }: { mensaje: string }) {
  return (
    <p role="alert" className="rounded-md bg-overdue-soft px-3.5 py-3 text-ui text-overdue">
      {mensaje}
    </p>
  );
}

// ---------- Caso B: el cliente ya existe ----------
function CasoB({
  patente,
  cliente,
  marcas,
  alVolver,
}: {
  patente: string;
  cliente: ClienteSugerido;
  marcas: string[];
  alVolver: () => void;
}) {
  const [estado, accion, pendiente] = useActionState(
    crearVehiculoParaCliente,
    ESTADO_INICIAL,
  );

  return (
    <form action={accion} className="flex flex-col gap-4">
      {estado.error && <Aviso mensaje={estado.error} />}
      <input type="hidden" name="cliente_id" value={cliente.id} />

      <div className="flex items-center justify-between gap-3 rounded-md bg-surface px-3.5 py-3">
        <span className="min-w-0">
          <span className="block truncate font-brand text-body font-bold text-ink">
            {cliente.nombre}
          </span>
          <span className="block truncate text-ui text-ink-60 tabular-nums">
            {cliente.telefono}
          </span>
        </span>
        <button
          type="button"
          onClick={alVolver}
          className="min-h-11 shrink-0 px-2 text-ui font-semibold text-brand"
        >
          Cambiar
        </button>
      </div>

      <CamposVehiculo patente={patente} marcas={marcas} />

      <Boton type="submit" tam="lg" disabled={pendiente} className="w-full">
        {pendiente ? "Guardando…" : "Guardar y cargar trabajo"}
      </Boton>
    </form>
  );
}

// ---------- Caso C: cliente y auto nuevos ----------
function CasoC({
  patente,
  marcas,
  alVolver,
}: {
  patente: string;
  marcas: string[];
  alVolver: () => void;
}) {
  const [estado, accion, pendiente] = useActionState(
    crearClienteYVehiculo,
    ESTADO_INICIAL,
  );

  return (
    <form action={accion} className="flex flex-col gap-4">
      {estado.error && <Aviso mensaje={estado.error} />}

      {/* Desde tablet, los dos obligatorios en una fila y el email debajo: se
          lee como un solo bloque de contacto sin perder la jerarquía. El gap
          de mobile es el mismo de siempre (16px); recién en la grilla baja a
          12px, que es el ritmo de los campos apareados. */}
      <div className="grid gap-4 sm:grid-cols-2 sm:gap-3">
        <div>
          <label htmlFor="nombre" className={CLASE_LABEL}>
            Nombre del cliente
          </label>
          <input
            id="nombre"
            name="nombre"
            required
            minLength={2}
            autoFocus
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
            inputMode="tel"
            required
            className={CLASE_CAMPO}
          />
        </div>

        <div>
          <label htmlFor="email" className={CLASE_LABEL}>
            Email <span className="text-ink-40 normal-case">(si lo da)</span>
          </label>
          <input
            id="email"
            name="email"
            type="email"
            inputMode="email"
            className={CLASE_CAMPO}
          />
        </div>

        <div>
          <label htmlFor="cuit" className={CLASE_LABEL}>
            CUIL/CUIT <span className="text-ink-40 normal-case">(si lo da)</span>
          </label>
          <input
            id="cuit"
            name="cuit"
            inputMode="numeric"
            className={`${CLASE_CAMPO} tabular-nums`}
          />
        </div>
      </div>

      <CamposVehiculo patente={patente} marcas={marcas} />

      <Boton type="submit" tam="lg" disabled={pendiente} className="w-full">
        {pendiente ? "Guardando…" : "Guardar y cargar trabajo"}
      </Boton>

      <button
        type="button"
        onClick={alVolver}
        className="min-h-11 text-ui font-semibold text-brand"
      >
        El cliente ya existe, buscarlo
      </button>
    </form>
  );
}

// ---------- El panel que resuelve B y C sin salir de la pantalla ----------
export function PanelAlta({
  patente,
  marcas,
}: {
  patente: string;
  marcas: string[];
}) {
  const [sugerencias, setSugerencias] = useState<ClienteSugerido[]>([]);
  const [buscado, setBuscado] = useState(false);
  const [elegido, setElegido] = useState<ClienteSugerido | null>(null);
  const [nuevoCliente, setNuevoCliente] = useState(false);
  const temporizador = useRef<ReturnType<typeof setTimeout> | null>(null);
  const busqueda = useRef(0);

  function alEscribir(texto: string) {
    if (temporizador.current) clearTimeout(temporizador.current);
    const turno = ++busqueda.current;
    temporizador.current = setTimeout(async () => {
      const encontrados = await buscarClientes(texto);
      if (turno !== busqueda.current) return;
      setSugerencias(encontrados);
      setBuscado(texto.trim().length >= 2);
    }, 300);
  }

  if (elegido) {
    return (
      <div className="surface-card mt-4 p-5">
        <h2 className="mb-4 font-brand text-lead font-bold text-ink">
          Datos del auto
        </h2>
        <CasoB
          patente={patente}
          cliente={elegido}
          marcas={marcas}
          alVolver={() => setElegido(null)}
        />
      </div>
    );
  }

  if (nuevoCliente) {
    return (
      <div className="surface-card mt-4 p-5">
        <h2 className="mb-4 font-brand text-lead font-bold text-ink">
          Cliente y auto nuevos
        </h2>
        <CasoC
          patente={patente}
          marcas={marcas}
          alVolver={() => setNuevoCliente(false)}
        />
      </div>
    );
  }

  return (
    <div className="surface-card mt-4 p-5">
      <h2 className="font-brand text-lead font-bold text-ink">¿De quién es?</h2>
      <p className="mt-1 mb-4 text-ui text-ink-60">
        Buscalo por nombre o teléfono. Si es la primera vez que viene, cargalo
        nuevo.
      </p>

      <div className="relative">
        <IconoBuscar className="pointer-events-none absolute top-1/2 left-3.5 size-5 -translate-y-1/2 text-ink-40" />
        <input
          type="search"
          autoFocus
          onChange={(e) => alEscribir(e.target.value)}
          placeholder="Nombre o teléfono…"
          aria-label="Buscar cliente"
          className="h-12 w-full rounded-md border border-line bg-base pr-3.5 pl-11 text-body text-ink placeholder:text-ink-40"
        />
      </div>

      {sugerencias.length > 0 && (
        <ul className="mt-3 flex flex-col">
          {sugerencias.map((c) => (
            <li key={c.id}>
              <button
                type="button"
                onClick={() => setElegido(c)}
                className="flex min-h-14 w-full items-center justify-between gap-3 border-b border-line px-1 py-2 text-left last:border-b-0 hover:bg-surface"
              >
                <span className="min-w-0">
                  <span className="block truncate font-brand text-body font-bold text-ink">
                    {c.nombre}
                  </span>
                  <span className="block truncate text-ui text-ink-60 tabular-nums">
                    {c.telefono}
                  </span>
                </span>
                <span className="shrink-0 text-label text-ink-60">
                  {c.cantidadVehiculos === 1
                    ? "1 auto"
                    : `${c.cantidadVehiculos} autos`}
                </span>
              </button>
            </li>
          ))}
        </ul>
      )}

      {buscado && sugerencias.length === 0 && (
        <p className="mt-3 text-ui text-ink-60">
          Ningún cliente con ese nombre o teléfono.
        </p>
      )}

      <button
        type="button"
        onClick={() => setNuevoCliente(true)}
        className="mt-4 min-h-11 w-full rounded-md border border-line text-ui font-semibold text-ink hover:bg-surface"
      >
        Es un cliente nuevo
      </button>
    </div>
  );
}

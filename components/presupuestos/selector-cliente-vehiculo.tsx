"use client";

import { useActionState, useEffect, useMemo, useRef, useState } from "react";
import { Boton } from "@/components/ui/boton";
import { IconoBuscar } from "@/components/iconos";
import { CampoPatente } from "@/components/services/campos-carton";
import { CamposMarcaModelo } from "@/components/vehiculos/campos-marca-modelo";
import { SelectorClase } from "@/components/vehiculos/selector-clase";
import { createClient } from "@/lib/supabase/client";
import {
  buscarClientes,
  buscarVehiculoPorPatente,
  BUSQUEDA_CLIENTES_MINIMO,
  type ClienteSugerido,
} from "@/lib/busqueda-alta";
import {
  crearClienteYVehiculoEnPresupuesto,
  crearVehiculoParaClienteEnPresupuesto,
  type ResultadoAltaDesdePresupuesto,
} from "@/app/panel/(tras-onboarding)/presupuestos/actions";
import {
  esPatenteArgentina,
  normalizarPatente,
  patenteIncompleta,
  sanitizarBusqueda,
  PATENTE_LARGO_MINIMO,
} from "@/lib/texto";

// ============================================================
// EL SELECTOR DE CLIENTE + AUTO DEL PRESUPUESTO
//
// Mismo momento 0 que el alta de trabajo —la patente, y «¿De quién es?»
// cuando el auto es nuevo— pero acá el resultado NO navega: deja seteado el
// cliente y el auto en el presupuesto, para que de ahí fluya al trabajo y a
// finanzas. El camino vinculado es el default; «cliente de paso» (texto
// libre) queda para el que no quiere ficha, y ese no se puede fiar ni seguir.
//
// NO reusa los componentes del alta (acoplados a navegar al cartón, camino
// crítico del mecánico): reusa las PRIMITIVAS —buscarVehiculoPorPatente,
// buscarClientes y las RPC de creación— con su propio pegamento.
// ============================================================

export type SeleccionPresupuesto =
  | {
      modo: "vinculado";
      clienteId: string;
      vehiculoId: string;
      nombre: string;
      telefono: string;
      vehiculoTexto: string;
    }
  | { modo: "paso"; nombre: string; telefono: string; vehiculo: string };

const ESTADO_INICIAL: ResultadoAltaDesdePresupuesto = {};
const CLASE_CAMPO =
  "h-12 w-full rounded-md border border-line bg-base px-3.5 text-body text-ink placeholder:text-ink-40";
const CLASE_LABEL =
  "mb-1.5 block text-label font-semibold tracking-[0.06em] text-ink-60 uppercase";

function Aviso({ mensaje }: { mensaje: string }) {
  return (
    <p role="alert" className="rounded-md bg-overdue-soft px-3.5 py-3 text-ui text-overdue">
      {mensaje}
    </p>
  );
}

// Los campos del auto, iguales a los del alta: patente fija (ya tipeada),
// marca/modelo con sugerencia, año opcional y la clase (una vez y para
// siempre).
function CamposVehiculo({ patente, marcas }: { patente: string; marcas: string[] }) {
  const [marca, setMarca] = useState("");
  return (
    <>
      <input type="hidden" name="patente" value={patente} />
      <CamposMarcaModelo marcas={marcas} alCambiarMarca={setMarca} />
      <div className="sm:w-1/2 sm:pr-1.5">
        <label htmlFor="sel-anio" className={CLASE_LABEL}>
          Año <span className="text-ink-40 normal-case">(opcional)</span>
        </label>
        <input
          id="sel-anio"
          name="anio"
          type="number"
          inputMode="numeric"
          min={1900}
          max={new Date().getFullYear() + 1}
          className={`${CLASE_CAMPO} tabular-nums`}
        />
      </div>
      <SelectorClase marca={marca} />
    </>
  );
}

const etiquetaVehiculo = (
  marca: string | null,
  modelo: string | null,
  patente: string,
) => [marca, modelo].filter(Boolean).join(" ").trim() + (marca || modelo ? ` · ${patente}` : patente);

export function SelectorClienteVehiculo({
  marcas,
  inicial,
  onCambio,
}: {
  marcas: string[];
  inicial: SeleccionPresupuesto | null;
  onCambio: (s: SeleccionPresupuesto | null) => void;
}) {
  const supabase = useMemo(() => createClient(), []);

  // La selección vigente (lo que ve el formulario). Arranca de lo que vino
  // (edición / deep-link).
  const [seleccion, setSeleccion] = useState<SeleccionPresupuesto | null>(inicial);

  // Avisar al formulario cada vez que cambia.
  useEffect(() => {
    onCambio(seleccion);
  }, [seleccion, onCambio]);

  const elegir = (s: SeleccionPresupuesto | null) => setSeleccion(s);

  // --------- Cliente de paso (texto libre) ---------
  if (seleccion?.modo === "paso") {
    return (
      <Bloque>
        <div className="mb-3 flex items-center justify-between gap-3">
          <p className="font-brand text-body font-bold text-ink">Cliente de paso</p>
          <button
            type="button"
            onClick={() => elegir(null)}
            className="min-h-11 text-ui font-semibold text-brand-texto"
          >
            Vincular a un cliente
          </button>
        </div>
        <p className="mb-3 text-label text-ink-60">
          Sin ficha. Sirve para darle el número rápido; no se puede fiar ni seguir su
          historial.
        </p>
        <div className="grid gap-3 sm:grid-cols-3">
          <input
            value={seleccion.nombre}
            onChange={(e) => elegir({ ...seleccion, nombre: e.target.value })}
            placeholder="Nombre"
            aria-label="Nombre del destinatario"
            className={CLASE_CAMPO}
          />
          <input
            value={seleccion.telefono}
            onChange={(e) => elegir({ ...seleccion, telefono: e.target.value })}
            placeholder="Teléfono"
            inputMode="tel"
            aria-label="Teléfono del destinatario"
            className={CLASE_CAMPO}
          />
          <input
            value={seleccion.vehiculo}
            onChange={(e) => elegir({ ...seleccion, vehiculo: e.target.value })}
            placeholder="Vehículo — ej: Corsa 1.4 2012"
            aria-label="Vehículo"
            className={CLASE_CAMPO}
          />
        </div>
      </Bloque>
    );
  }

  // --------- Ya hay cliente + auto vinculados ---------
  if (seleccion?.modo === "vinculado") {
    return (
      <Bloque>
        <div className="flex items-center justify-between gap-3">
          <div className="min-w-0">
            <p className="truncate font-brand text-body font-bold text-ink">{seleccion.nombre}</p>
            <p className="truncate text-ui text-ink-60 tabular-nums">
              {seleccion.vehiculoTexto}
              {seleccion.telefono ? ` · ${seleccion.telefono}` : ""}
            </p>
          </div>
          <button
            type="button"
            onClick={() => elegir(null)}
            className="min-h-11 shrink-0 text-ui font-semibold text-brand-texto"
          >
            Cambiar
          </button>
        </div>
      </Bloque>
    );
  }

  // --------- Sin selección: buscar por patente ---------
  return (
    <BuscarPorPatente
      marcas={marcas}
      supabase={supabase}
      onVinculado={elegir}
      onPaso={() => elegir({ modo: "paso", nombre: "", telefono: "", vehiculo: "" })}
    />
  );
}

function Bloque({ children }: { children: React.ReactNode }) {
  return (
    <div className="rounded-lg border border-line bg-surface/60 p-4">
      <p className="mb-3 font-brand text-body font-bold text-ink">Para quién</p>
      {children}
    </div>
  );
}

// El momento 0: patente. Si el auto existe, queda vinculado; si no, abre
// «¿De quién es?».
function BuscarPorPatente({
  marcas,
  supabase,
  onVinculado,
  onPaso,
}: {
  marcas: string[];
  supabase: ReturnType<typeof createClient>;
  onVinculado: (s: SeleccionPresupuesto) => void;
  onPaso: () => void;
}) {
  const [patente, setPatente] = useState("");
  const [buscando, setBuscando] = useState(false);
  const [errorBusqueda, setErrorBusqueda] = useState<string | null>(null);
  const [noAparece, setNoAparece] = useState(false);
  const temporizador = useRef<ReturnType<typeof setTimeout> | null>(null);
  const busqueda = useRef(0);

  const normalizada = normalizarPatente(patente);
  const completa = normalizada.length >= PATENTE_LARGO_MINIMO;

  function alEscribir(valor: string) {
    const enMayus = valor.toUpperCase();
    setPatente(enMayus);
    setNoAparece(false);
    setErrorBusqueda(null);
    if (temporizador.current) clearTimeout(temporizador.current);

    const turno = ++busqueda.current;
    const buscar = async () => {
      if (patenteIncompleta(enMayus)) return;
      setBuscando(true);
      const { vehiculo, error } = await buscarVehiculoPorPatente(supabase, enMayus);
      if (turno !== busqueda.current) return;
      setBuscando(false);
      if (error) {
        setErrorBusqueda(error);
        return;
      }
      if (vehiculo) {
        onVinculado({
          modo: "vinculado",
          clienteId: vehiculo.clienteId,
          vehiculoId: vehiculo.vehiculoId,
          nombre: vehiculo.clienteNombre,
          telefono: "",
          vehiculoTexto: etiquetaVehiculo(vehiculo.marca, vehiculo.modelo, vehiculo.patente),
        });
      } else {
        setNoAparece(true);
      }
    };

    if (esPatenteArgentina(enMayus)) void buscar();
    else temporizador.current = setTimeout(() => void buscar(), 300);
  }

  if (noAparece) {
    return (
      <Bloque>
        <DeQuienEs
          patente={patente.trim()}
          marcas={marcas}
          supabase={supabase}
          onVinculado={onVinculado}
          onVolver={() => {
            setNoAparece(false);
            setPatente("");
          }}
        />
      </Bloque>
    );
  }

  return (
    <Bloque>
      <p className="mb-3 text-label text-ink-60">
        Escribí la patente para vincular el auto y su dueño. Así el presupuesto se convierte
        en trabajo sin recargar nada.
      </p>
      <CampoPatente valor={patente} alEscribir={alEscribir} />
      {buscando && <p className="mt-2 text-center text-ui text-ink-60">Buscando…</p>}
      {errorBusqueda && <p className="mt-3"><Aviso mensaje={errorBusqueda} /></p>}
      {completa && (
        <p className="mt-3 text-center text-ui text-ink-60">
          ¿La patente no aparece?{" "}
          <button
            type="button"
            onClick={() => setNoAparece(true)}
            className="font-semibold text-brand-texto"
          >
            Cargar cliente y vehículo
          </button>
        </p>
      )}
      <div className="mt-3 border-t border-line pt-3 text-center">
        <button
          type="button"
          onClick={onPaso}
          className="min-h-11 text-ui font-semibold text-ink-60"
        >
          Es un cliente de paso (sin ficha)
        </button>
      </div>
    </Bloque>
  );
}

// «¿De quién es?»: buscar el cliente (B) o crear cliente + auto (C).
function DeQuienEs({
  patente,
  marcas,
  supabase,
  onVinculado,
  onVolver,
}: {
  patente: string;
  marcas: string[];
  supabase: ReturnType<typeof createClient>;
  onVinculado: (s: SeleccionPresupuesto) => void;
  onVolver: () => void;
}) {
  const [sugerencias, setSugerencias] = useState<ClienteSugerido[]>([]);
  const [buscado, setBuscado] = useState(false);
  const [errorBusqueda, setErrorBusqueda] = useState<string | null>(null);
  const [elegido, setElegido] = useState<ClienteSugerido | null>(null);
  const [nuevo, setNuevo] = useState(false);
  const temporizador = useRef<ReturnType<typeof setTimeout> | null>(null);
  const busqueda = useRef(0);

  function alEscribir(texto: string) {
    if (temporizador.current) clearTimeout(temporizador.current);
    const turno = ++busqueda.current;
    temporizador.current = setTimeout(async () => {
      const { clientes, error } = await buscarClientes(supabase, texto);
      if (turno !== busqueda.current) return;
      setSugerencias(clientes);
      setErrorBusqueda(error ?? null);
      setBuscado(sanitizarBusqueda(texto).length >= BUSQUEDA_CLIENTES_MINIMO);
    }, 300);
  }

  if (elegido) {
    return (
      <CasoClienteExistente
        patente={patente}
        cliente={elegido}
        marcas={marcas}
        onVinculado={onVinculado}
        onVolver={() => setElegido(null)}
      />
    );
  }
  if (nuevo) {
    return (
      <CasoClienteNuevo
        patente={patente}
        marcas={marcas}
        onVinculado={onVinculado}
        onVolver={() => setNuevo(false)}
      />
    );
  }

  return (
    <div>
      <div className="mb-3 flex items-center justify-between gap-3">
        <h3 className="font-brand text-lead font-bold text-ink">¿De quién es?</h3>
        <button
          type="button"
          onClick={onVolver}
          className="min-h-11 text-ui font-semibold text-brand-texto"
        >
          Volver
        </button>
      </div>
      <div className="relative">
        <IconoBuscar className="pointer-events-none absolute top-1/2 left-3.5 size-5 -translate-y-1/2 text-ink-40" />
        <input
          type="search"
          autoFocus
          onChange={(e) => alEscribir(e.target.value)}
          placeholder="Nombre, teléfono o patente…"
          aria-label="Buscar cliente"
          className="h-12 w-full rounded-md border border-line bg-base pr-3.5 pl-11 text-body text-ink placeholder:text-ink-40"
        />
      </div>
      {errorBusqueda && <div className="mt-3"><Aviso mensaje={errorBusqueda} /></div>}
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
                  {c.cantidadVehiculos === 1 ? "1 auto" : `${c.cantidadVehiculos} autos`}
                </span>
              </button>
            </li>
          ))}
        </ul>
      )}
      {buscado && !errorBusqueda && sugerencias.length === 0 && (
        <p className="mt-3 text-ui text-ink-60">
          Ningún cliente con ese nombre, teléfono o patente.
        </p>
      )}
      <button
        type="button"
        onClick={() => setNuevo(true)}
        className="mt-4 min-h-11 w-full rounded-md border border-line text-ui font-semibold text-ink hover:bg-surface"
      >
        Es un cliente nuevo
      </button>
    </div>
  );
}

// Caso B: cliente existente, auto nuevo. Al guardar, queda vinculado.
function CasoClienteExistente({
  patente,
  cliente,
  marcas,
  onVinculado,
  onVolver,
}: {
  patente: string;
  cliente: ClienteSugerido;
  marcas: string[];
  onVinculado: (s: SeleccionPresupuesto) => void;
  onVolver: () => void;
}) {
  const [estado, accion, pendiente] = useActionState(
    crearVehiculoParaClienteEnPresupuesto,
    ESTADO_INICIAL,
  );

  useEffect(() => {
    if (estado.vehiculoId && estado.clienteId) {
      onVinculado({
        modo: "vinculado",
        clienteId: estado.clienteId,
        vehiculoId: estado.vehiculoId,
        nombre: cliente.nombre,
        telefono: cliente.telefono,
        vehiculoTexto: patente,
      });
    }
  }, [estado, cliente, patente, onVinculado]);

  return (
    <form action={accion} className="flex flex-col gap-4">
      <div className="flex items-center justify-between gap-3">
        <h3 className="font-brand text-lead font-bold text-ink">Datos del auto</h3>
        <button type="button" onClick={onVolver} className="min-h-11 text-ui font-semibold text-brand-texto">
          Cambiar
        </button>
      </div>
      {estado.error && <Aviso mensaje={estado.error} />}
      <input type="hidden" name="cliente_id" value={cliente.id} />
      <div className="rounded-md bg-surface px-3.5 py-3">
        <span className="block truncate font-brand text-body font-bold text-ink">{cliente.nombre}</span>
        <span className="block truncate text-ui text-ink-60 tabular-nums">{cliente.telefono}</span>
      </div>
      <CamposVehiculo patente={patente} marcas={marcas} />
      <Boton type="submit" tam="lg" disabled={pendiente} className="w-full">
        {pendiente ? "Guardando…" : "Vincular el auto"}
      </Boton>
    </form>
  );
}

// Caso C: cliente y auto nuevos.
function CasoClienteNuevo({
  patente,
  marcas,
  onVinculado,
  onVolver,
}: {
  patente: string;
  marcas: string[];
  onVinculado: (s: SeleccionPresupuesto) => void;
  onVolver: () => void;
}) {
  const [nombre, setNombre] = useState("");
  const [telefono, setTelefono] = useState("");
  const [estado, accion, pendiente] = useActionState(
    crearClienteYVehiculoEnPresupuesto,
    ESTADO_INICIAL,
  );

  useEffect(() => {
    if (estado.vehiculoId && estado.clienteId) {
      onVinculado({
        modo: "vinculado",
        clienteId: estado.clienteId,
        vehiculoId: estado.vehiculoId,
        nombre,
        telefono,
        vehiculoTexto: patente,
      });
    }
  }, [estado, nombre, telefono, patente, onVinculado]);

  return (
    <form action={accion} className="flex flex-col gap-4">
      <div className="flex items-center justify-between gap-3">
        <h3 className="font-brand text-lead font-bold text-ink">Cliente y auto nuevos</h3>
        <button type="button" onClick={onVolver} className="min-h-11 text-ui font-semibold text-brand-texto">
          Volver
        </button>
      </div>
      {estado.error && <Aviso mensaje={estado.error} />}
      <div className="grid gap-4 sm:grid-cols-2 sm:gap-3">
        <div>
          <label htmlFor="sel-nombre" className={CLASE_LABEL}>Nombre del cliente</label>
          <input
            id="sel-nombre"
            name="nombre"
            required
            minLength={2}
            autoFocus
            value={nombre}
            onChange={(e) => setNombre(e.target.value)}
            className={CLASE_CAMPO}
          />
        </div>
        <div>
          <label htmlFor="sel-telefono" className={CLASE_LABEL}>Teléfono</label>
          <input
            id="sel-telefono"
            name="telefono"
            type="tel"
            inputMode="tel"
            required
            value={telefono}
            onChange={(e) => setTelefono(e.target.value)}
            className={CLASE_CAMPO}
          />
        </div>
        <div>
          <label htmlFor="sel-email" className={CLASE_LABEL}>
            Email <span className="text-ink-40 normal-case">(si lo da)</span>
          </label>
          <input id="sel-email" name="email" type="email" inputMode="email" className={CLASE_CAMPO} />
        </div>
        <div>
          <label htmlFor="sel-cuit" className={CLASE_LABEL}>
            CUIL/CUIT <span className="text-ink-40 normal-case">(si lo da)</span>
          </label>
          <input id="sel-cuit" name="cuit" inputMode="numeric" className={`${CLASE_CAMPO} tabular-nums`} />
        </div>
      </div>
      <CamposVehiculo patente={patente} marcas={marcas} />
      <Boton type="submit" tam="lg" disabled={pendiente} className="w-full">
        {pendiente ? "Guardando…" : "Vincular cliente y auto"}
      </Boton>
    </form>
  );
}

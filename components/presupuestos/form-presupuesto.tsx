"use client";

import { useActionState, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { Boton } from "@/components/ui/boton";
import { Combobox } from "@/components/ui/combobox";
import {
  crearPresupuesto,
  editarPresupuesto,
  type ResultadoPresupuesto,
} from "@/app/panel/presupuestos/actions";
import { recordarSucursal } from "@/lib/preferencias";
import {
  formatearPesos,
  VALIDEZ_SUGERIDA,
  type ItemPresupuesto,
} from "@/lib/presupuestos";

type Sucursal = { id: string; nombre: string };
type ProductoSugerido = { nombre: string; precio: number | null };

export type PresupuestoInicial = {
  /** Presente solo al EDITAR. Duplicar llega sin id: es un alta. */
  id?: string;
  fecha: string;
  validezDias: number | null;
  observaciones: string | null;
  destinatarioNombre: string | null;
  destinatarioTelefono: string | null;
  destinatarioVehiculo: string | null;
  clienteId: string | null;
  vehiculoId: string | null;
  items: ItemPresupuesto[];
};

const INICIAL: ResultadoPresupuesto = {};
const CLASE_CAMPO =
  "h-12 w-full rounded-md border border-line bg-base px-3.5 text-body text-ink placeholder:text-ink-40";
const CLASE_LABEL =
  "mb-1.5 block text-label font-semibold tracking-[0.06em] text-ink-60 uppercase";

type Fila = { descripcion: string; cantidad: string; precio: string };

const FILA_VACIA: Fila = { descripcion: "", cantidad: "1", precio: "" };

// El formulario del mostrador: cinco renglones en menos de dos minutos,
// con el cliente esperando. Por eso los renglones se agregan sin recargar,
// el total se ve mientras se escribe, y NADA es obligatorio salvo un
// renglón con descripción — ni el cliente, ni el vehículo, ni la ficha.
export function FormPresupuesto({
  sucursales,
  sucursalInicial,
  hoy,
  inicial,
  productos = [],
}: {
  sucursales: Sucursal[];
  sucursalInicial: string;
  hoy: string;
  inicial?: PresupuestoInicial;
  /** El catálogo, para sugerir. La sugerencia ahorra tipeo, no impone:
   *  el renglón sigue siendo texto libre y todo queda editable. */
  productos?: ProductoSugerido[];
}) {
  const router = useRouter();
  const edicion = Boolean(inicial?.id);

  const [sucursalId, setSucursalId] = useState(sucursalInicial);
  const [fecha, setFecha] = useState(inicial?.id ? inicial.fecha : hoy);
  const [validez, setValidez] = useState(
    inicial ? (inicial.validezDias?.toString() ?? "") : String(VALIDEZ_SUGERIDA),
  );
  const [nombre, setNombre] = useState(inicial?.destinatarioNombre ?? "");
  const [telefono, setTelefono] = useState(inicial?.destinatarioTelefono ?? "");
  const [vehiculo, setVehiculo] = useState(inicial?.destinatarioVehiculo ?? "");
  const [observaciones, setObservaciones] = useState(
    inicial?.observaciones ?? "",
  );
  const [mostrarObs, setMostrarObs] = useState(Boolean(inicial?.observaciones));
  const [filas, setFilas] = useState<Fila[]>(
    inicial?.items.length
      ? inicial.items.map((i) => ({
          descripcion: i.descripcion,
          cantidad: String(i.cantidad),
          precio: String(i.precioUnitario),
        }))
      : [{ ...FILA_VACIA }],
  );

  const [resultado, enviar, enviando] = useActionState(
    async (prev: ResultadoPresupuesto) => {
      const datos = {
        sucursalId,
        fecha,
        validezDias: validez.trim() === "" ? null : Number(validez),
        observaciones: observaciones.trim() || null,
        destinatarioNombre: nombre.trim() || null,
        destinatarioTelefono: telefono.trim() || null,
        destinatarioVehiculo: vehiculo.trim() || null,
        clienteId: inicial?.clienteId ?? null,
        vehiculoId: inicial?.vehiculoId ?? null,
        items: filas.map((f) => ({
          descripcion: f.descripcion,
          cantidad: Number(f.cantidad.replace(",", ".")) || 1,
          precioUnitario: Number(f.precio.replace(/\./g, "").replace(",", ".")) || 0,
        })),
      };
      const r = edicion
        ? await editarPresupuesto(prev, { ...datos, id: inicial!.id! })
        : await crearPresupuesto(prev, datos);
      if (r.id) {
        router.push(`/panel/presupuestos/${r.id}`);
        router.refresh();
      }
      return r;
    },
    INICIAL,
  );

  const total = useMemo(
    () =>
      filas.reduce((suma, f) => {
        const cant = Number(f.cantidad.replace(",", ".")) || 0;
        const precio = Number(f.precio.replace(/\./g, "").replace(",", ".")) || 0;
        return suma + cant * precio;
      }, 0),
    [filas],
  );

  const listo = filas.some((f) => f.descripcion.trim().length >= 2);

  const editarFila = (i: number, cambio: Partial<Fila>) =>
    setFilas((prev) => prev.map((f, j) => (j === i ? { ...f, ...cambio } : f)));

  const nombresProductos = productos.map((p) => p.nombre);

  // Elegir una sugerencia precarga descripción E importe (si el producto
  // tiene precio). El importe del presupuesto NO queda atado al catálogo:
  // es una copia de este momento — si mañana cambia el precio, el
  // presupuesto viejo no se mueve.
  const escribirDescripcion = (i: number, texto: string) => {
    const producto = productos.find((p) => p.nombre === texto);
    if (producto && producto.precio != null) {
      editarFila(i, { descripcion: texto, precio: String(producto.precio) });
    } else {
      editarFila(i, { descripcion: texto });
    }
  };

  return (
    <form action={enviar} className="flex flex-col gap-4">
      {/* Destino: TEXTO LIBRE. Un potencial cliente no tiene ficha y no
          se lo obliga a tenerla para darle un número. */}
      <div className="rounded-lg border border-line bg-surface/60 p-4">
        <p className="mb-3 font-brand text-body font-bold text-ink">
          Para quién
          <span className="ml-2 font-ui text-label font-semibold text-ink-40 uppercase">
            todo opcional
          </span>
        </p>
        <div className="grid gap-3 sm:grid-cols-3">
          <input
            value={nombre}
            onChange={(e) => setNombre(e.target.value)}
            placeholder="Nombre"
            aria-label="Nombre del destinatario"
            className={CLASE_CAMPO}
          />
          <input
            value={telefono}
            onChange={(e) => setTelefono(e.target.value)}
            placeholder="Teléfono"
            inputMode="tel"
            aria-label="Teléfono del destinatario"
            className={CLASE_CAMPO}
          />
          <input
            value={vehiculo}
            onChange={(e) => setVehiculo(e.target.value)}
            placeholder="Vehículo — ej: Corsa 1.4 2012"
            aria-label="Vehículo"
            className={CLASE_CAMPO}
          />
        </div>
      </div>

      {/* Los renglones: descripción + cantidad + precio. Agregar es un
          tap, borrar es un tap, y el total se mueve solo. */}
      <div className="rounded-lg border border-line bg-surface/60 p-4">
        <p className="mb-3 font-brand text-body font-bold text-ink">Renglones</p>
        <div className="flex flex-col gap-2.5">
          {filas.map((f, i) => (
            <div key={i} className="flex flex-wrap items-start gap-2">
              <div className="min-w-0 flex-1 basis-52">
                <Combobox
                  value={f.descripcion}
                  onChange={(v) => escribirDescripcion(i, v)}
                  opciones={nombresProductos}
                  ariaLabel={`Renglón ${i + 1}: descripción`}
                />
              </div>
              <input
                value={f.cantidad}
                onChange={(e) => editarFila(i, { cantidad: e.target.value })}
                inputMode="decimal"
                aria-label={`Renglón ${i + 1}: cantidad`}
                className={`${CLASE_CAMPO} w-16 shrink-0 text-center tabular-nums`}
              />
              <div className="relative w-32 shrink-0">
                <span className="pointer-events-none absolute inset-y-0 left-3 flex items-center text-body text-ink-40">
                  $
                </span>
                <input
                  value={f.precio}
                  onChange={(e) => editarFila(i, { precio: e.target.value })}
                  inputMode="decimal"
                  placeholder="0"
                  aria-label={`Renglón ${i + 1}: precio unitario`}
                  className={`${CLASE_CAMPO} pl-7 text-right tabular-nums`}
                />
              </div>
              <button
                type="button"
                onClick={() =>
                  setFilas((prev) =>
                    prev.length === 1
                      ? [{ ...FILA_VACIA }]
                      : prev.filter((_, j) => j !== i),
                  )
                }
                aria-label={`Quitar el renglón ${i + 1}`}
                className="flex size-12 shrink-0 items-center justify-center rounded-md border border-line text-ink-60 hover:bg-surface"
              >
                ✕
              </button>
            </div>
          ))}
        </div>
        <button
          type="button"
          onClick={() => setFilas((prev) => [...prev, { ...FILA_VACIA }])}
          className="mt-2.5 min-h-11 text-ui font-semibold text-brand"
        >
          + Renglón
        </button>
      </div>

      {/* Fecha, sucursal y validez, en una fila: datos del papel. */}
      <div className="grid gap-3 sm:grid-cols-3">
        <div>
          <label htmlFor="pre-fecha" className={CLASE_LABEL}>
            Fecha
          </label>
          <input
            id="pre-fecha"
            type="date"
            value={fecha}
            onChange={(e) => setFecha(e.target.value)}
            className={`${CLASE_CAMPO} tabular-nums`}
          />
        </div>
        <div>
          <label htmlFor="pre-sucursal" className={CLASE_LABEL}>
            Sucursal
          </label>
          <select
            id="pre-sucursal"
            value={sucursalId}
            onChange={(e) => {
              setSucursalId(e.target.value);
              recordarSucursal(e.target.value);
            }}
            className={`${CLASE_CAMPO} cursor-pointer`}
          >
            {sucursales.map((s) => (
              <option key={s.id} value={s.id}>
                {s.nombre}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label htmlFor="pre-validez" className={CLASE_LABEL}>
            Validez en días
          </label>
          <input
            id="pre-validez"
            value={validez}
            onChange={(e) => setValidez(e.target.value.replace(/\D/g, ""))}
            inputMode="numeric"
            placeholder="sin plazo"
            className={`${CLASE_CAMPO} tabular-nums`}
          />
          <p className="mt-1 text-label text-ink-60">
            Sugerido: {VALIDEZ_SUGERIDA} días. Vacío = el papel no promete plazo.
          </p>
        </div>
      </div>

      {mostrarObs ? (
        <div>
          <label htmlFor="pre-obs" className={CLASE_LABEL}>
            Observaciones
          </label>
          <textarea
            id="pre-obs"
            value={observaciones}
            onChange={(e) => setObservaciones(e.target.value)}
            rows={2}
            className="w-full rounded-md border border-line bg-base px-3.5 py-3 text-body text-ink"
          />
        </div>
      ) : (
        <button
          type="button"
          onClick={() => setMostrarObs(true)}
          className="min-h-11 self-start text-ui font-semibold text-ink-60"
        >
          + Observaciones
        </button>
      )}

      {resultado.error && (
        <p
          role="alert"
          className="rounded-md bg-overdue-soft px-3.5 py-3 text-ui text-overdue"
        >
          {resultado.error}
        </p>
      )}

      {/* La banda fija: el total vivo y el guardar, siempre a la vista.
          Mismo patrón que el cartón. */}
      <div className="sticky bottom-[calc(45px+env(safe-area-inset-bottom))] z-20 -mx-4 mt-2 border-t border-line bg-base px-4 py-3 sm:mx-0 sm:rounded-lg sm:border sm:px-5 sm:shadow-lg lg:bottom-6">
        <div className="flex items-center justify-between gap-4">
          <div>
            <p className="text-label font-semibold tracking-[0.06em] text-ink-60 uppercase">
              Total
            </p>
            <p className="font-brand text-h3 font-bold text-ink tabular-nums">
              {formatearPesos(total)}
            </p>
          </div>
          <Boton
            type="submit"
            tam="lg"
            disabled={enviando || !listo}
            className="min-w-[190px]"
          >
            {enviando
              ? "Guardando…"
              : edicion
                ? "Guardar cambios"
                : "Generar presupuesto"}
          </Boton>
        </div>
      </div>
      <div className="h-4" />
    </form>
  );
}

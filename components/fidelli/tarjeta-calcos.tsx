"use client";

import { useActionState, useState } from "react";
import { Dialog, DialogTrigger, DialogContenido } from "@/components/ui/dialog";
import { Boton, clasesBoton } from "@/components/ui/boton";
import {
  CLASE_AYUDA,
  CLASE_CAMPO,
  CLASE_ERROR,
  CLASE_LABEL,
} from "@/components/fidelli/estilos";
import { guardarPrecioCalcos, type EstadoPlan } from "@/app/fidelli/precios/actions";
import { MOTIVO_MINIMO } from "@/components/fidelli/tarjeta-plan";
import { COMISION_CRESIUM } from "@/lib/calcos";
import {
  metrosCuadrados,
  nombreDelCatalogo,
  type FilaCatalogoCalcos,
} from "@/lib/fidelli/calcos";
import { formatearFecha } from "@/lib/fechas";
import { pesos } from "@/lib/fidelli/plan";

const INICIAL: EstadoPlan = {};

export type CambioDePrecioCalcos = {
  id: string;
  codigo: string;
  /** YYYY-MM-DD, día argentino. */
  dia: string;
  motivo: string;
  precioAntes: number;
  precioDespues: number;
  costoAntes: number;
  costoDespues: number;
};

const PORCENTAJE = new Intl.NumberFormat("es-AR", { maximumFractionDigits: 0 });

// La comisión de Cresium sale de lo cobrado: se le descuenta al margen, no
// se le suma al tenant.
function margen(f: { precio: number; costo: number }) {
  const comision = Math.round(f.precio * COMISION_CRESIUM);
  const neto = f.precio - f.costo - comision;
  return { comision, neto, pct: f.precio > 0 ? (neto / f.precio) * 100 : 0 };
}

// ============================================================
// El catálogo de calcos en «Plan y precios»
//
// Los cinco packs y los dos extras que el lubricentro compra desde Mi cuenta
// → Calcos. Es catálogo, igual que los planes y los módulos: un precio de
// lista que vale para todos los pedidos que vengan.
//
// Acá —y solo acá, junto con la ficha y la cola— se ven el COSTO, el m² y
// el margen. El tenant ve el pack y su precio.
//
// El precio y el costo se mueven por fijar_precio_calcos(), con motivo, y
// quedan en cambios_precio_calcos (regla 16). Un cambio NO toca los pedidos
// que ya existen: cada uno congeló sus montos al crearse.
// ============================================================
export function TarjetaCalcos({
  catalogo,
  cambios,
}: {
  catalogo: FilaCatalogoCalcos[];
  cambios: CambioDePrecioCalcos[];
}) {
  return (
    <section className="surface-card overflow-hidden" data-precios-calcos>
      <div className="overflow-x-auto">
        <table className="w-full min-w-[860px] border-collapse text-ui">
          <thead>
            <tr className="border-b border-line text-left text-label font-semibold tracking-[0.04em] text-ink-60 uppercase">
              <th className="px-4 py-2.5 font-semibold">Qué</th>
              <th className="px-4 py-2.5 font-semibold">m²</th>
              <th className="px-4 py-2.5 font-semibold">Precio</th>
              <th className="px-4 py-2.5 font-semibold">Por calco</th>
              <th className="px-4 py-2.5 font-semibold">Costo</th>
              <th className="px-4 py-2.5 font-semibold">Cresium</th>
              <th className="px-4 py-2.5 font-semibold">Margen</th>
              <th className="px-4 py-2.5 font-semibold">
                <span className="sr-only">Editar</span>
              </th>
            </tr>
          </thead>
          <tbody>
            {catalogo.map((f) => {
              const m = margen(f);
              return (
                <tr
                  key={f.codigo}
                  data-codigo={f.codigo}
                  className="border-b border-line align-middle last:border-b-0"
                >
                  <td className="px-4 py-2.5 font-semibold whitespace-nowrap text-ink tabular-nums">
                    {nombreDelCatalogo(f)}
                    {!f.activo && <span className="ml-2 font-normal text-ink-40">fuera del catálogo</span>}
                  </td>
                  <td className="px-4 py-2.5 whitespace-nowrap text-ink-60 tabular-nums">
                    {f.cantidad != null ? metrosCuadrados(f.cantidad) : "—"}
                  </td>
                  <td className="px-4 py-2.5 font-semibold whitespace-nowrap text-ink tabular-nums" data-precio>
                    {pesos(f.precio)}
                  </td>
                  <td className="px-4 py-2.5 whitespace-nowrap text-ink-60 tabular-nums">
                    {f.cantidad != null ? pesos(Math.round(f.precio / f.cantidad)) : "—"}
                  </td>
                  <td className="px-4 py-2.5 whitespace-nowrap text-ink-60 tabular-nums" data-costo>
                    {pesos(f.costo)}
                  </td>
                  <td className="px-4 py-2.5 whitespace-nowrap text-ink-60 tabular-nums">
                    {pesos(m.comision)}
                  </td>
                  <td className="px-4 py-2.5 whitespace-nowrap text-ink-60 tabular-nums">
                    {pesos(m.neto)} · {PORCENTAJE.format(m.pct)}%
                  </td>
                  <td className="px-4 py-1.5 text-right">
                    <DialogPrecio fila={f} />
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      <div className="border-t border-line px-4 py-3 text-label text-ink-60">
        <p>
          El costo es $30.000 el m² (200 calcos), sin baja por volumen. La comisión de Cresium
          es 0,8 % + IVA sobre lo acreditado y se descuenta del margen: no se le suma al
          lubricentro. Mover un precio no cambia los pedidos que ya existen.
        </p>
        {cambios.length > 0 && (
          <ul className="mt-2.5 flex flex-col gap-1 border-t border-line pt-2.5" data-cambios>
            {cambios.map((c) => (
              <li key={c.id} className="tabular-nums">
                <span className="text-ink">{formatearFecha(c.dia)}</span> ·{" "}
                {nombreDelCatalogo({ codigo: c.codigo, cantidad: cantidadDelCodigo(c.codigo) })}:{" "}
                {c.precioAntes !== c.precioDespues &&
                  `precio ${pesos(c.precioAntes)} → ${pesos(c.precioDespues)}`}
                {c.precioAntes !== c.precioDespues && c.costoAntes !== c.costoDespues && ", "}
                {c.costoAntes !== c.costoDespues &&
                  `costo ${pesos(c.costoAntes)} → ${pesos(c.costoDespues)}`}
                <span className="text-ink-40"> · {c.motivo}</span>
              </li>
            ))}
          </ul>
        )}
      </div>
    </section>
  );
}

// `pack_400` → 400. Solo para nombrar la fila en el historial de cambios.
function cantidadDelCodigo(codigo: string): number | null {
  const m = /^pack_(\d+)$/.exec(codigo);
  return m ? Number(m[1]) : null;
}

function DialogPrecio({ fila }: { fila: FilaCatalogoCalcos }) {
  const [abierto, setAbierto] = useState(false);
  const [estado, guardar, guardando] = useActionState(
    async (previo: EstadoPlan, formData: FormData) => {
      const r = await guardarPrecioCalcos(previo, formData);
      if (r.ok) setAbierto(false);
      return r;
    },
    INICIAL,
  );
  const nombre = nombreDelCatalogo(fila);

  return (
    <Dialog open={abierto} onOpenChange={setAbierto}>
      <DialogTrigger
        aria-label={`Editar el precio de ${nombre}`}
        className={`${clasesBoton("secundario", "md")} whitespace-nowrap`}
      >
        Editar
      </DialogTrigger>

      <DialogContenido titulo={`Precio de ${nombre}`}>
        <form action={guardar} className="flex flex-col gap-4">
          {estado.error && (
            <p role="alert" className={CLASE_ERROR}>
              {estado.error}
            </p>
          )}

          <input type="hidden" name="codigo" value={fila.codigo} />

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label htmlFor={`calcos-precio-${fila.codigo}`} className={CLASE_LABEL}>
                Precio de lista
              </label>
              <input
                id={`calcos-precio-${fila.codigo}`}
                name="precio"
                type="number"
                min={0}
                step="0.01"
                inputMode="decimal"
                required
                defaultValue={fila.precio}
                className={`${CLASE_CAMPO} tabular-nums`}
              />
            </div>
            <div>
              <label htmlFor={`calcos-costo-${fila.codigo}`} className={CLASE_LABEL}>
                Costo
              </label>
              <input
                id={`calcos-costo-${fila.codigo}`}
                name="costo"
                type="number"
                min={0}
                step="0.01"
                inputMode="decimal"
                required
                defaultValue={fila.costo}
                className={`${CLASE_CAMPO} tabular-nums`}
              />
            </div>
          </div>
          <p className={CLASE_AYUDA}>
            El precio es lo que el lubricentro ve y paga. El costo es interno: solo mueve la
            ganancia que mostramos en cada pedido.
          </p>

          <div>
            <label htmlFor={`calcos-motivo-${fila.codigo}`} className={CLASE_LABEL}>
              Por qué se mueve
            </label>
            <textarea
              id={`calcos-motivo-${fila.codigo}`}
              name="motivo"
              rows={2}
              required
              minLength={MOTIVO_MINIMO}
              placeholder="La gráfica subió el m² en octubre"
              className={`${CLASE_CAMPO} h-auto py-3`}
            />
            <p className={CLASE_AYUDA}>
              Queda registrado con tu nombre y la fecha. Los pedidos que ya existen no cambian.
            </p>
          </div>

          <Boton type="submit" tam="lg" disabled={guardando} className="mt-1 w-full">
            {guardando ? "Guardando…" : "Guardar precio"}
          </Boton>
        </form>
      </DialogContenido>
    </Dialog>
  );
}

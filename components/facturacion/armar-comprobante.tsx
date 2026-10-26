"use client";

import { useActionState, useState } from "react";
import Link from "next/link";
import { Boton, clasesBoton } from "@/components/ui/boton";
import { formatearPesos } from "@/lib/presupuestos";
import { mascaraCuit } from "@/lib/datos-empresa";
import { desglosarComprobante, type RenglonEntrada } from "@/lib/facturacion/iva";
import {
  ETIQUETA_CONDICION_RECEPTOR,
  ETIQUETA_TIPO,
  discriminaIva,
  type Alicuota,
  type CondicionEmisor,
  type CondicionReceptor,
} from "@/lib/facturacion/tipos";
import {
  armarBorrador,
  type ResultadoBorrador,
} from "@/app/panel/(tras-onboarding)/facturacion/actions";

const INICIAL: ResultadoBorrador = {};
const CLASE_CAMPO =
  "h-12 w-full rounded-md border border-line bg-base px-3.5 text-body text-ink";
const CLASE_LABEL = "mb-1.5 block text-label font-semibold tracking-[0.06em] text-ink-60 uppercase";

const CONDICIONES: readonly CondicionReceptor[] = [
  "consumidor_final",
  "responsable_inscripto",
  "monotributo",
  "exento",
];

// El preview del comprobante que se emitiría desde un presupuesto. En vivo:
// cambiás la condición del cliente y cambian la letra, el IVA y el total. El
// cálculo es espejo de la base (lib/facturacion/iva.ts); confirmar llama a la
// puerta que crea el borrador real. NO emite nada contra ARCA.
export function ArmarComprobante({
  presupuestoId,
  items,
  emisor,
  preciosIncluyenIva,
  alicuotaDefault,
  receptorInicial,
}: {
  presupuestoId: string;
  items: RenglonEntrada[];
  emisor: CondicionEmisor;
  preciosIncluyenIva: boolean;
  alicuotaDefault: Alicuota;
  receptorInicial: { nombre: string; cuit: string };
}) {
  const [condicion, setCondicion] = useState<CondicionReceptor>("consumidor_final");
  const [cuit, setCuit] = useState(mascaraCuit(receptorInicial.cuit));
  const [nombre, setNombre] = useState(receptorInicial.nombre);

  const [estado, enviar, pendiente] = useActionState(
    (prev: ResultadoBorrador) =>
      armarBorrador(prev, {
        presupuestoId,
        receptorCondicion: condicion,
        receptorCuit: cuit,
        receptorNombre: nombre,
      }),
    INICIAL,
  );

  const desglose = desglosarComprobante(items, {
    emisor,
    receptor: condicion,
    preciosIncluyenIva,
    alicuotaDefault,
  });

  // Factura A a un consumidor final no existe: una A exige CUIT. Lo avisamos
  // sin bloquear el preview (el que corresponde ya es B/C según el emisor).
  const exigeCuit = desglose?.tipo === "factura_a";

  if (estado.id) {
    return (
      <div className="surface-card px-5 py-6 text-center">
        <p className="mb-1 font-brand text-h3 font-bold text-ink">Borrador listo</p>
        <p className="mb-5 text-ui text-ink-60">
          Guardamos el comprobante como borrador. La emisión electrónica con CAE llega en la próxima
          entrega.
        </p>
        <Link href="/panel/facturacion" className={clasesBoton("primario", "md")}>
          Ver la cola de comprobantes
        </Link>
      </div>
    );
  }

  return (
    <div className="grid gap-6 lg:grid-cols-2">
      {/* Los datos del receptor */}
      <form action={enviar} className="flex flex-col gap-4">
        {estado.error && (
          <p role="alert" className="rounded-md bg-overdue-soft px-3.5 py-3 text-ui text-overdue">
            {estado.error}
          </p>
        )}

        <div>
          <label htmlFor="receptor-condicion" className={CLASE_LABEL}>
            Condición de tu cliente frente al IVA
          </label>
          <select
            id="receptor-condicion"
            value={condicion}
            onChange={(e) => setCondicion(e.target.value as CondicionReceptor)}
            className={CLASE_CAMPO}
          >
            {CONDICIONES.map((c) => (
              <option key={c} value={c}>
                {ETIQUETA_CONDICION_RECEPTOR[c]}
              </option>
            ))}
          </select>
        </div>

        <div>
          <label htmlFor="receptor-nombre" className={CLASE_LABEL}>
            Nombre o razón social
          </label>
          <input
            id="receptor-nombre"
            autoComplete="off"
            maxLength={120}
            value={nombre}
            onChange={(e) => setNombre(e.target.value)}
            placeholder="Consumidor final"
            className={CLASE_CAMPO}
          />
        </div>

        <div>
          <label htmlFor="receptor-cuit" className={CLASE_LABEL}>
            CUIT {condicion === "consumidor_final" ? "(opcional)" : ""}
          </label>
          <input
            id="receptor-cuit"
            inputMode="numeric"
            autoComplete="off"
            maxLength={13}
            value={cuit}
            onChange={(e) => setCuit(mascaraCuit(e.target.value))}
            className={`${CLASE_CAMPO} tabular-nums`}
          />
          {exigeCuit && (
            <p className="mt-1.5 text-label text-urgente">
              Una Factura A necesita el CUIT del cliente.
            </p>
          )}
        </div>

        <Boton
          type="submit"
          variante="primario"
          tam="lg"
          disabled={pendiente || !desglose}
          className="w-full sm:w-[200px]"
        >
          {pendiente ? "Guardando…" : "Confirmar borrador"}
        </Boton>
      </form>

      {/* El preview, en vivo */}
      <div className="surface-card px-5 py-4">
        {desglose ? (
          <>
            <div className="mb-3 flex items-center justify-between">
              <p className="font-brand text-h3 font-bold text-ink">{ETIQUETA_TIPO[desglose.tipo]}</p>
              <span className="rounded-md bg-surface px-2.5 py-1 text-label font-semibold text-ink-60">
                Borrador
              </span>
            </div>

            <ul className="mb-4 flex flex-col divide-y divide-line">
              {desglose.renglones.map((r, i) => (
                <li key={i} className="flex items-center justify-between gap-3 py-2">
                  <span className="truncate text-ui text-ink">
                    {r.descripcion}
                    <span className="ml-2 text-label text-ink-40 tabular-nums">
                      {r.cantidad} × {formatearPesos(r.precioUnitarioNeto)}
                    </span>
                  </span>
                  <span className="text-ui text-ink tabular-nums">
                    {formatearPesos(r.importeNeto)}
                  </span>
                </li>
              ))}
            </ul>

            <dl className="flex flex-col gap-1.5 text-ui">
              {discriminaIva(desglose.tipo) ? (
                <>
                  <Linea rotulo="Neto gravado" valor={desglose.netoGravado} />
                  {desglose.exento > 0 && <Linea rotulo="Exento" valor={desglose.exento} />}
                  {desglose.iva105 > 0 && <Linea rotulo="IVA 10,5%" valor={desglose.iva105} />}
                  {desglose.iva21 > 0 && <Linea rotulo="IVA 21%" valor={desglose.iva21} />}
                </>
              ) : (
                <Linea rotulo="Subtotal" valor={desglose.netoGravado} />
              )}
              <div className="mt-1.5 flex items-center justify-between border-t border-line pt-2.5">
                <dt className="font-brand text-body font-bold text-ink">Total</dt>
                <dd className="font-brand text-body font-bold text-ink tabular-nums">
                  {formatearPesos(desglose.total)}
                </dd>
              </div>
            </dl>
          </>
        ) : (
          <p className="text-ui text-ink-60">
            No pudimos determinar la letra del comprobante. Revisá tu condición frente al IVA en Mi
            cuenta.
          </p>
        )}
      </div>
    </div>
  );
}

function Linea({ rotulo, valor }: { rotulo: string; valor: number }) {
  return (
    <div className="flex items-center justify-between">
      <dt className="text-ink-60">{rotulo}</dt>
      <dd className="text-ink tabular-nums">{formatearPesos(valor)}</dd>
    </div>
  );
}

"use client";

import { useActionState, useState } from "react";
import { Boton, clasesBoton } from "@/components/ui/boton";
import {
  declararRecuento,
  type EstadoRecuento,
} from "@/app/panel/(tras-onboarding)/cuenta/calcos/actions";
import {
  cantidadDicha,
  ritmoDicho,
  semanasDichas,
  type StockCalcos,
} from "@/lib/stock-calcos";

const INICIAL: EstadoRecuento = {};

// ============================================================
// Cuántas te quedan — arriba del historial de Mi cuenta → Calcos.
//
// «Te quedan unas 115 · alcanzan para unas 5 semanas al ritmo de 22 autos
// nuevos por semana.» La cuenta es de la base (`stock_calcos()`): acá solo
// se le ponen palabras. Sin ritmo —menos de dos semanas de historia, o
// ningún auto nuevo en ocho—, se dice el número a secas.
//
// Es una ESTIMACIÓN y lo dice: descuenta un calco por cada auto nuevo, y un
// calco que se despegó o se regaló no lo ve nadie. Para eso está «Contá y
// corregí»: el dueño escribe cuántas tiene y la cuenta parte de ahí.
//
// El número va en tinta, nunca en ámbar ni en el rojo de marca: que queden
// pocas no es un error de esta pantalla. El aviso es del Inicio.
// ============================================================
export function StockDeCalcos({
  stock,
  recuentoEl,
  suspendido,
}: {
  stock: StockCalcos;
  /** La fecha del recuento que hace de base, ya dicha: «03/10/2026». */
  recuentoEl: string | null;
  suspendido: boolean;
}) {
  const [abierto, setAbierto] = useState(false);
  const [estado, accion, enviando] = useActionState(
    async (previo: EstadoRecuento, formData: FormData) => {
      const r = await declararRecuento(previo, formData);
      if (r.ok) setAbierto(false);
      return r;
    },
    INICIAL,
  );

  const conRitmo = stock.semanas != null && stock.ritmo != null && stock.ritmo > 0;

  return (
    <section className="surface-card p-5" data-stock>
      <h2 className="font-brand text-lead font-bold text-ink">Cuántas te quedan</h2>

      <p className="mt-1.5 text-body text-ink tabular-nums">
        {stock.stock > 0 ? (
          <>
            Te quedan unas{" "}
            <strong className="font-brand font-bold" data-stock-valor>
              {cantidadDicha(stock.stock)}
            </strong>
          </>
        ) : (
          <>
            Según nuestra cuenta no te queda{" "}
            <strong className="font-brand font-bold" data-stock-valor>
              ninguna
            </strong>
          </>
        )}
        {conRitmo && stock.stock > 0 && (
          <>
            {" · "}alcanzan para{" "}
            <strong className="font-brand font-bold" data-stock-semanas>
              {semanasDichas(stock.semanas ?? 0)}
            </strong>{" "}
            al ritmo de {ritmoDicho(stock.ritmo ?? 0)}
          </>
        )}
        .
      </p>

      <p className="mt-1 text-ui text-ink-60 tabular-nums">
        {recuentoEl
          ? `Contaste el ${recuentoEl}. Desde ese día descontamos un calco por cada auto nuevo que cargás.`
          : "Es una estimación: descontamos un calco por cada auto nuevo que cargás desde la primera entrega."}
      </p>

      {abierto ? (
        <form action={accion} className="mt-3 flex flex-col gap-2 border-t border-line pt-3">
          {/* Una pregunta, en letra común: no es la etiqueta de un campo más. */}
          <label htmlFor="calcos-recuento" className="text-ui font-semibold text-ink">
            ¿Cuántas te quedan?
          </label>
          <div className="flex flex-wrap items-center gap-2">
            <input
              id="calcos-recuento"
              name="cantidad"
              type="number"
              inputMode="numeric"
              min={0}
              max={100000}
              step={1}
              required
              autoFocus
              placeholder="Ej.: 120"
              className="h-12 w-32 rounded-md border border-line bg-base px-3.5 text-body text-ink tabular-nums placeholder:text-ink-40"
            />
            {/* Secundario: el rojo de esta pantalla es «Confirmar y pagar». */}
            <Boton type="submit" variante="secundario" tam="lg" disabled={enviando} className="min-w-28">
              {enviando ? "Guardando…" : "Guardar"}
            </Boton>
            <button
              type="button"
              onClick={() => setAbierto(false)}
              className="inline-flex h-12 items-center px-2 text-ui font-semibold text-ink-60 hover:text-ink"
            >
              Cancelar
            </button>
          </div>
          <p className="text-ui text-ink-60">
            Contá las que tenés en el local. Desde ahora la cuenta parte de ese número.
          </p>
          {estado.error && (
            <p role="alert" className="rounded-md bg-overdue-soft px-3.5 py-3 text-ui text-overdue">
              {estado.error}
            </p>
          )}
        </form>
      ) : (
        !suspendido && (
          <button
            type="button"
            onClick={() => setAbierto(true)}
            className={`${clasesBoton("secundario")} mt-3`}
          >
            Contá y corregí
          </button>
        )
      )}
    </section>
  );
}

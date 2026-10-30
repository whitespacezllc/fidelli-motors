"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { Boton, clasesBoton } from "@/components/ui/boton";
import { Toast, type AvisoToast } from "@/components/ui/toast";
import { CLASE_AYUDA, CLASE_CAMPO, CLASE_ERROR, CLASE_LABEL } from "@/components/fidelli/estilos";
import { resolverDeposito, type EstadoResolucion } from "@/app/fidelli/cobranzas/actions";
import { pesos, ETIQUETA_PERIODO, type Periodo } from "@/lib/fidelli/plan";
import { formatearFechaHora } from "@/lib/fechas";

export type DepositoAConfirmar = {
  id: string;
  lubricentro_id: string;
  nombre: string;
  slug: string;
  transaccion_id: number;
  monto: number;
  cvu: string | null;
  recibido_at: string;
  motivo: string;
  periodo_actual: Periodo | null;
  vencimiento: string | null;
  montos: { periodo: Periodo; meses: number; total: number }[];
  telefono: string | null;
  owner_nombre: string | null;
};

const INICIAL: EstadoResolucion = {};

// ============================================================
// La lista de arriba de Cobranzas: la plata que entró a una cuenta fija y
// no se pudo acreditar sola. Cada fila se decide acá, con lo que hace
// falta a la vista: cuánto entró, cuánto se cobra hoy por cada período, y
// a quién escribirle si hay que preguntar.
//
// La confirmación va en un toast y no en la fila: al resolverse, la
// revalidación saca el depósito de la lista y la fila se desmonta antes
// de que nadie lea nada.
// ============================================================
export function DepositosAConfirmar({ depositos }: { depositos: DepositoAConfirmar[] }) {
  const [aviso, setAviso] = useState<AvisoToast | null>(null);
  const total = depositos.reduce((n, d) => n + Number(d.monto), 0);

  if (depositos.length === 0) {
    return aviso ? <Toast aviso={aviso} alCerrar={() => setAviso(null)} /> : null;
  }

  return (
    <section>
      {aviso && <Toast aviso={aviso} alCerrar={() => setAviso(null)} />}
      <div className="mb-3 flex flex-wrap items-baseline justify-between gap-2">
        <h2 className="font-brand text-lead font-bold text-ink">Depósitos a confirmar</h2>
        <p className="text-ui text-ink-60 tabular-nums">
          {depositos.length} {depositos.length === 1 ? "depósito" : "depósitos"} · {pesos(total)}
        </p>
      </div>
      <p className="mb-3 max-w-2xl text-ui text-ink-60">
        Entraron a la cuenta fija de un lubricentro pero no coinciden con el monto exacto
        de ningún período, así que no se acreditaron solos. La plata ya está en Cresium:
        acá se decide a qué período va, o se descarta con una nota.
      </p>
      <div className="flex flex-col gap-2.5">
        {depositos.map((d) => (
          <FilaDeposito key={d.id} d={d} alResolver={(texto) => setAviso({ tipo: "ok", texto })} />
        ))}
      </div>
    </section>
  );
}

function FilaDeposito({
  d,
  alResolver,
}: {
  d: DepositoAConfirmar;
  alResolver: (texto: string) => void;
}) {
  const [error, setError] = useState<string | undefined>();
  const [resolviendo, iniciar] = useTransition();
  // La acción se llama a mano y no por useActionState: la fila se va de
  // la lista con la revalidación, y el resultado tiene que llegar al
  // padre (el toast) antes de que eso pase.
  const resolver = (formData: FormData) =>
    iniciar(async () => {
      const r = await resolverDeposito(INICIAL, formData);
      if (r.ok) alResolver(r.ok);
      else setError(r.error);
    });
  const estado = { error };
  const monto = Number(d.monto);
  // El período cuyo monto está más cerca, propuesto. Es una SUGERENCIA: el
  // select es la decisión.
  const sugerido =
    d.montos.length > 0
      ? d.montos.reduce((a, b) => (Math.abs(Number(b.total) - monto) < Math.abs(Number(a.total) - monto) ? b : a)).periodo
      : (d.periodo_actual ?? "mensual");
  const telefono = d.telefono?.replace(/\D/g, "");

  return (
    <article className="surface-card px-4 py-4 sm:px-5">
      <div className="flex flex-wrap items-start justify-between gap-x-5 gap-y-2">
        <div className="min-w-0 flex-1">
          <Link
            href={`/fidelli/${d.lubricentro_id}?tab=suscripcion`}
            className="font-brand text-body font-bold text-ink hover:underline"
          >
            {d.nombre}
          </Link>
          <p className="mt-0.5 text-ui text-ink-60 tabular-nums">
            {formatearFechaHora(d.recibido_at)} · transacción {d.transaccion_id}
            {d.periodo_actual && ` · hoy ${ETIQUETA_PERIODO[d.periodo_actual].toLowerCase()}`}
          </p>
          <p className="mt-1.5 text-ui text-ink">{d.motivo}</p>
        </div>
        <div className="flex shrink-0 items-center gap-3">
          <p className="font-brand text-lead font-bold text-ink tabular-nums">{pesos(monto)}</p>
          {telefono ? (
            <a
              href={`https://wa.me/${telefono}?text=${encodeURIComponent(
                `Hola${d.owner_nombre ? ` ${d.owner_nombre.split(" ")[0]}` : ""}, soy de Fidelli Motors. Nos llegó tu transferencia de ${pesos(monto)} y no coincide con el monto del plan: ¿a qué corresponde? Así te la acreditamos.`,
              )}`}
              target="_blank"
              rel="noreferrer"
              className={clasesBoton("secundario")}
            >
              Preguntar
            </a>
          ) : null}
        </div>
      </div>

      {estado.error && (
        <p role="alert" className={`${CLASE_ERROR} mt-3`}>
          {estado.error}
        </p>
      )}

      <div className="mt-4 grid gap-4 border-t border-line pt-4 sm:grid-cols-2">
        <form action={resolver} className="flex flex-col gap-3">
          <input type="hidden" name="deposito_id" value={d.id} />
          <input type="hidden" name="accion" value="acreditar" />
          <div>
            <label htmlFor={`periodo-${d.id}`} className={CLASE_LABEL}>
              Acreditar al período
            </label>
            <select
              id={`periodo-${d.id}`}
              name="periodo"
              defaultValue={sugerido}
              className={CLASE_CAMPO}
            >
              {(d.montos.length > 0 ? d.montos : [{ periodo: "mensual" as Periodo, meses: 1, total: 0 }]).map((m) => (
                <option key={m.periodo} value={m.periodo}>
                  {ETIQUETA_PERIODO[m.periodo]}
                  {Number(m.total) > 0 ? ` · hoy ${pesos(Number(m.total))}` : ""}
                </option>
              ))}
            </select>
            <p className={CLASE_AYUDA}>
              Queda un pago por {pesos(monto)} con la transacción de Cresium y tu firma, y
              el vencimiento corre como con cualquier pago.
            </p>
          </div>
          <Boton type="submit" disabled={resolviendo} className="w-full">
            {resolviendo ? "Guardando…" : "Acreditar"}
          </Boton>
        </form>

        <form action={resolver} className="flex flex-col gap-3">
          <input type="hidden" name="deposito_id" value={d.id} />
          <input type="hidden" name="accion" value="descartar" />
          <div>
            <label htmlFor={`nota-${d.id}`} className={CLASE_LABEL}>
              Descartar, con una nota
            </label>
            <input
              id={`nota-${d.id}`}
              name="nota"
              placeholder="Se la devolvimos por Cresium / era de otra cosa"
              className={CLASE_CAMPO}
            />
            <p className={CLASE_AYUDA}>No se acredita nada. La nota queda en el libro.</p>
          </div>
          <Boton type="submit" variante="secundario" disabled={resolviendo} className="w-full">
            {resolviendo ? "Guardando…" : "Descartar"}
          </Boton>
        </form>
      </div>
    </article>
  );
}

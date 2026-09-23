"use client";

import { useState, useTransition } from "react";
import { formatearFecha } from "@/lib/fechas";
import { guardarGasto } from "@/app/fidelli/pauta/actions";
import { sumarDiasIso, type CanalPauta } from "@/lib/fidelli/pauta";

export type FilaGasto = { semana: string; canal: CanalPauta; monto_usd: number };

const CANALES_GASTO: readonly { clave: CanalPauta; nombre: string }[] = [
  { clave: "meta", nombre: "Meta" },
  { clave: "google", nombre: "Google" },
];

const TH =
  "px-3 py-2.5 text-left align-bottom text-label font-semibold tracking-[0.06em] text-ink-60 uppercase";

// ============================================================
// El gasto de las últimas 12 semanas, editable inline: un número por canal
// y semana, en dólares. Se guarda al salir del campo (o con Enter); vacío
// borra la fila («no se cargó» no es «cero»). La semana en curso va arriba
// y, mientras esté vacía, dice «cargar el lunes».
// ============================================================
export function GastoSemanal({
  semanas,
  gasto,
  lunesActual,
}: {
  /** Lunes, del más nuevo al más viejo. */
  semanas: string[];
  gasto: FilaGasto[];
  lunesActual: string;
}) {
  const montoDe = (semana: string, canal: CanalPauta) =>
    gasto.find((g) => g.semana === semana && g.canal === canal)?.monto_usd ?? null;

  return (
    <section className="surface-card overflow-hidden">
      <div className="flex flex-wrap items-baseline justify-between gap-2 border-b border-line px-4.5 py-3">
        <h2 className="font-brand text-ui font-bold tracking-[0.04em] text-ink-60 uppercase">
          Gasto por semana
        </h2>
        <p className="text-label text-ink-40">
          en US$ · se guarda al salir del campo · vacío = sin cargar
        </p>
      </div>

      <div className="relative overflow-x-auto">
        <table className="w-full table-fixed border-collapse text-ui">
          <thead>
            <tr className="border-b border-line">
              <th scope="col" className={`${TH} w-[40%]`}>
                Semana
              </th>
              {CANALES_GASTO.map((c) => (
                <th key={c.clave} scope="col" className={`${TH} w-[30%] text-right`}>
                  {c.nombre}
                  <span className="block font-normal normal-case tracking-normal text-ink-40">US$</span>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {semanas.map((semana) => {
              const enCurso = semana === lunesActual;
              const vacia = CANALES_GASTO.every((c) => montoDe(semana, c.clave) === null);
              return (
                <tr key={semana} className="border-b border-line last:border-b-0">
                  <td className="px-3 py-2 align-middle">
                    <span className="block tabular-nums text-ink">
                      {formatearFecha(semana).slice(0, 5)} → {formatearFecha(sumarDiasIso(semana, 6)).slice(0, 5)}
                    </span>
                    {enCurso && (
                      <span className="block text-label text-ink-40">
                        en curso{vacia ? " · cargar el lunes" : ""}
                      </span>
                    )}
                  </td>
                  {CANALES_GASTO.map((c) => (
                    <td key={c.clave} className="px-3 py-2 text-right align-middle">
                      <CampoGasto
                        semana={semana}
                        canal={c.clave}
                        inicial={montoDe(semana, c.clave)}
                      />
                    </td>
                  ))}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </section>
  );
}

// El campo ocupa la celda (en el celular la columna mide ~90px) y se topa en
// 128px en pantallas anchas; el aviso de la semana en curso vive en la celda
// de la semana, no en el placeholder, para que nunca se corte.
function CampoGasto({
  semana,
  canal,
  inicial,
}: {
  semana: string;
  canal: CanalPauta;
  inicial: number | null;
}) {
  const [valor, setValor] = useState(inicial === null ? "" : String(inicial));
  const [guardado, setGuardado] = useState<string>(inicial === null ? "" : String(inicial));
  const [aviso, setAviso] = useState<"ok" | "error" | null>(null);
  const [pendiente, iniciar] = useTransition();

  function guardar() {
    const limpio = valor.trim().replace(",", ".");
    if (limpio === guardado.trim()) return;
    const monto = limpio === "" ? null : Number(limpio);
    if (monto !== null && !Number.isFinite(monto)) {
      setAviso("error");
      return;
    }
    setAviso(null);
    iniciar(async () => {
      const r = await guardarGasto(semana, canal, monto);
      if (r.error) {
        setAviso("error");
      } else {
        setGuardado(limpio);
        setAviso("ok");
      }
    });
  }

  return (
    <span className="flex w-full flex-col items-end gap-0.5">
      <input
        type="number"
        inputMode="decimal"
        min={0}
        step="0.01"
        value={valor}
        onChange={(e) => setValor(e.target.value)}
        onBlur={guardar}
        onKeyDown={(e) => {
          if (e.key === "Enter") (e.currentTarget as HTMLInputElement).blur();
        }}
        placeholder="—"
        aria-label={`Gasto de ${canal} en la semana del ${formatearFecha(semana)}, en dólares`}
        disabled={pendiente}
        className="h-10 w-full max-w-32 rounded-md border border-line bg-base px-2.5 text-right text-ui text-ink tabular-nums placeholder:text-ink-40 disabled:opacity-60"
      />
      {aviso === "ok" && <span className="text-label text-success">guardado</span>}
      {aviso === "error" && (
        <span role="alert" className="text-label text-overdue">
          no se guardó
        </span>
      )}
    </span>
  );
}

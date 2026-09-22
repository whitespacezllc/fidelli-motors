"use client";

import { useId, useRef, useState, useTransition } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { AreaClosed, LinePath } from "@visx/shape";
import { LinearGradient } from "@visx/gradient";
import { curveLinear, curveMonotoneX } from "@visx/curve";
import { scaleLinear } from "@visx/scale";
import { Segmentado } from "@/components/ui/segmentado";
import { formatearFecha } from "@/lib/fechas";
import { pesos } from "@/lib/fidelli/plan";
import { dolares, enteroAR } from "@/lib/fidelli/resumen";
import { REFERENCIA_MRR_USD, type PuntoObjetivo } from "@/lib/fidelli/objetivo";
import { MONEDAS, type Moneda, type PuntoMrr } from "@/lib/fidelli/mrr";

// ============================================================
// El MRR en el tiempo, contra el objetivo.
//
// La serie real sale de snapshots_diarios (se lee, nunca se recalcula) más
// el punto de hoy en vivo (mrr_plataforma() y el TC vigente). Los días
// reconstruidos (docs/METRICAS.md § 5) van al 50%: son la mejor foto que
// se pudo armar hacia atrás, no un cierre. En dólares se dibuja además el
// objetivo mes a mes, punteado, y la referencia de los US$ 10.000; en
// pesos no hay objetivo, y el eje se acomoda a la serie sola.
//
// UN SOLO EJE Y. Con la meta en 10.000 y el MRR de hoy en 500, la curva
// real queda abajo, chiquita. Es la lectura honesta de dónde estamos; un
// segundo eje la inflaría.
//
// LA GEOMETRÍA VA POR FECHA, no por índice: la serie tiene un punto por
// día y el objetivo uno por mes, así que comparten una escala de tiempo.
// Como en grafico-serie.tsx, el SVG se estira (preserveAspectRatio="none")
// y todo lo que no puede deformarse —etiquetas, tooltip, el punto de hoy—
// vive en HTML posicionado por porcentaje.
// ============================================================

// Los tipos (Moneda, PuntoMrr) y el guard esMoneda viven en
// lib/fidelli/mrr.ts, neutro, porque la page los necesita en el servidor.

const ANCHO = 900;
const ALTO = 240;
const PISO = 12;

// Días desde epoch, por partes: una fecha pura nunca pasa por new Date(iso).
function diaDe(iso: string): number {
  const [a, m, d] = iso.slice(0, 10).split("-").map(Number);
  return Date.UTC(a, m - 1, d) / 86_400_000;
}

const MES_CORTO = new Intl.DateTimeFormat("es-AR", { month: "short", timeZone: "UTC" });

// Los inicios de mes entre dos días, con su etiqueta: «sep», «oct», …,
// y el año cada enero para no perderse en un rango de año y medio.
function mesesEntre(t0: number, t1: number): { t: number; etiqueta: string }[] {
  const desde = new Date(t0 * 86_400_000);
  let anio = desde.getUTCFullYear();
  let mes = desde.getUTCMonth() + 1; // el mes en curso, aunque su día 1 sea anterior a t0
  const salida: { t: number; etiqueta: string }[] = [];
  for (;;) {
    const t = Date.UTC(anio, mes - 1, 1) / 86_400_000;
    if (t > t1) break;
    if (t >= t0) {
      const nombre = MES_CORTO.format(new Date(t * 86_400_000)).replace(".", "");
      salida.push({ t, etiqueta: mes === 1 ? `${nombre} ${anio}` : nombre });
    }
    mes += 1;
    if (mes > 12) { mes = 1; anio += 1; }
  }
  return salida;
}

export function GraficoMrr({
  serie,
  objetivo,
  monedaInicial,
}: {
  /** De la fecha más vieja a la más nueva; la última puede ser la de hoy en vivo. */
  serie: PuntoMrr[];
  objetivo: PuntoObjetivo[];
  monedaInicial: Moneda;
}) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [, iniciar] = useTransition();
  const [moneda, setMoneda] = useState<Moneda>(monedaInicial);
  const [indice, setIndice] = useState<number | null>(null);
  const superficie = useRef<HTMLDivElement | null>(null);
  const idRelleno = useId();

  // El cambio es instantáneo (estado) y la URL lo sigue atrás: se toca
  // solo `moneda`, el `pulso` del otro gráfico sobrevive. USD es el
  // default y no se escribe.
  function cambiar(m: Moneda) {
    setMoneda(m);
    setIndice(null);
    iniciar(() => {
      const params = new URLSearchParams(searchParams);
      if (m === "usd") params.delete("moneda");
      else params.set("moneda", m);
      const q = params.toString();
      router.replace(`/fidelli${q ? `?${q}` : ""}`, { scroll: false });
    });
  }

  const enUsd = moneda === "usd";
  const valorDe = (p: PuntoMrr): number | null => (enUsd ? p.mrrUsd : p.mrrArs);
  const formato = (n: number) => (enUsd ? dolares(n) : pesos(n));
  const reales = serie.filter((p) => valorDe(p) != null);
  const ultimo = reales[reales.length - 1];

  const cabecera = (
    <div className="flex flex-wrap items-end justify-between gap-4 px-4.5 py-4">
      <div>
        <p className="font-brand text-h2 font-bold text-ink tabular-nums">
          {ultimo ? formato(valorDe(ultimo) as number) : "—"}
        </p>
        <p className="text-label font-semibold tracking-[0.04em] text-ink-60 uppercase">
          {ultimo?.fuente === "vivo"
            ? "MRR hoy"
            : ultimo
              ? `MRR al ${formatearFecha(ultimo.fecha)}`
              : "MRR"}
        </p>
      </div>
      <Segmentado
        etiqueta="Moneda del gráfico"
        opciones={MONEDAS}
        valor={moneda}
        alCambiar={cambiar}
      />
    </div>
  );

  if (reales.length === 0) {
    return (
      <section className="surface-card mb-5 overflow-hidden">
        {cabecera}
        <p className="border-t border-line px-4.5 py-8 text-center text-ui text-ink-60">
          {serie.length === 0
            ? "Todavía no hay snapshots diarios. El primer cierre corre esta noche a las 00:10; para tener historia desde el 16/08 hay que correr la reconstrucción (docs/METRICAS.md § 5)."
            : "No hay tipo de cambio cargado para ningún día: sin él no hay MRR en dólares. Corré scripts/backfill-tc.mjs o mirá la serie en ARS."}
        </p>
      </section>
    );
  }

  // ---------- La geometría ----------
  const t0 = diaDe(reales[0].fecha);
  const tUltimo = diaDe(ultimo.fecha);
  const objetivoVisible = enUsd ? objetivo.filter((o) => diaDe(o.fecha) >= t0) : [];
  const tObjetivo = objetivoVisible.length
    ? diaDe(objetivoVisible[objetivoVisible.length - 1].fecha)
    : tUltimo;
  const t1 = Math.max(tUltimo, tObjetivo, t0 + 1);
  const xDe = (iso: string) => ((diaDe(iso) - t0) / (t1 - t0)) * ANCHO;

  const maxReal = Math.max(...reales.map((p) => valorDe(p) as number));
  const maxObjetivo = enUsd
    ? Math.max(REFERENCIA_MRR_USD, ...objetivoVisible.map((o) => o.usd))
    : 0;
  const y = scaleLinear({
    domain: [0, Math.max(1, maxReal, maxObjetivo)],
    range: [ALTO - PISO, PISO],
    nice: true,
  });
  const yMax = y.domain()[1];

  // Los días reconstruidos van primero (son el pasado sin cierre). El
  // tramo al 50% incluye el primer punto firme para que la línea no se
  // corte; el firme arranca donde termina el reconstruido.
  let corte = -1;
  reales.forEach((p, i) => {
    if (p.fuente === "reconstruido") corte = i;
  });
  const reconstruidos = corte >= 0 ? reales.slice(0, Math.min(corte + 2, reales.length)) : [];
  const firmes = corte >= 0 ? reales.slice(corte + 1) : reales;

  const activo = indice !== null ? reales[indice] : null;
  const ticks = y.ticks(4).filter((t) => t > 0 && t <= yMax);
  const meses = mesesEntre(t0, t1);

  const pctX = (iso: string) => (xDe(iso) / ANCHO) * 100;
  const pctY = (v: number) => (y(v) / ALTO) * 100;

  // ---------- La interacción: puntero → fecha → el punto real más cercano ----------
  function indiceDesde(clientX: number): number {
    const caja = superficie.current?.getBoundingClientRect();
    if (!caja || caja.width === 0) return reales.length - 1;
    const fraccion = Math.min(1, Math.max(0, (clientX - caja.left) / caja.width));
    const t = t0 + fraccion * (t1 - t0);
    let mejor = 0;
    let distancia = Infinity;
    reales.forEach((p, i) => {
      const d = Math.abs(diaDe(p.fecha) - t);
      if (d < distancia) {
        distancia = d;
        mejor = i;
      }
    });
    return mejor;
  }

  function alTeclear(e: React.KeyboardEvent) {
    if (e.key === "ArrowRight" || e.key === "ArrowLeft") {
      e.preventDefault();
      const paso = e.key === "ArrowRight" ? 1 : -1;
      const base = indice ?? (paso === 1 ? -1 : reales.length);
      setIndice(Math.min(reales.length - 1, Math.max(0, base + paso)));
    }
    if (e.key === "Escape") setIndice(null);
  }

  const centroTooltip = activo ? pctX(activo.fecha) : 0;
  const corrimientoTooltip =
    centroTooltip < 15 ? "0%" : centroTooltip > 85 ? "-100%" : "-50%";

  const etiquetaUltimo = `${formato(valorDe(ultimo) as number)} · ${
    ultimo.fuente === "vivo" ? "hoy" : formatearFecha(ultimo.fecha).slice(0, 5)
  }`;
  const ultimoALaDerecha = pctX(ultimo.fecha) < 70;

  return (
    <section className="surface-card mb-5 overflow-hidden">
      {cabecera}

      <div className="border-t border-line px-4.5 pt-4 pb-3">
        <div
          ref={superficie}
          role="group"
          aria-label="MRR en el tiempo. Explorá los días con las flechas."
          tabIndex={0}
          className="relative outline-none"
          onPointerMove={(e) => setIndice(indiceDesde(e.clientX))}
          onPointerDown={(e) => setIndice(indiceDesde(e.clientX))}
          onPointerLeave={(e) => {
            if (e.pointerType === "mouse") setIndice(null);
          }}
          onKeyDown={alTeclear}
          onBlur={() => setIndice(null)}
        >
          <svg
            viewBox={`0 0 ${ANCHO} ${ALTO}`}
            preserveAspectRatio="none"
            className="block h-40 w-full sm:h-52 lg:h-[240px]"
            role="img"
            aria-label={`MRR en ${enUsd ? "dólares" : "pesos"}: ${reales
              .filter((_, i) => i === 0 || i === reales.length - 1)
              .map((p) => `${formatearFecha(p.fecha)} ${formato(valorDe(p) as number)}`)
              .join(" a ")}${
              enUsd ? `. Objetivo ${dolares(REFERENCIA_MRR_USD)}.` : "."
            }`}
          >
            <LinearGradient
              id={idRelleno}
              from="var(--color-ink)"
              to="var(--color-ink)"
              fromOpacity={0.14}
              toOpacity={0}
            />

            {/* La grilla: una línea por tick, sin decorar. */}
            {ticks.map((t) => (
              <line
                key={t}
                x1={0}
                x2={ANCHO}
                y1={y(t)}
                y2={y(t)}
                stroke="var(--color-line)"
                strokeWidth={1}
                vectorEffect="non-scaling-stroke"
              />
            ))}

            {/* La referencia de los US$ 10.000: fina, entera, sin punteado. */}
            {enUsd && REFERENCIA_MRR_USD <= yMax && (
              <line
                x1={0}
                x2={ANCHO}
                y1={y(REFERENCIA_MRR_USD)}
                y2={y(REFERENCIA_MRR_USD)}
                stroke="var(--color-ink-40)"
                strokeWidth={1}
                vectorEffect="non-scaling-stroke"
              />
            )}

            {/* El objetivo, punteado y recto entre mes y mes. */}
            {objetivoVisible.length >= 2 && (
              <LinePath
                data={objetivoVisible}
                x={(o) => xDe(o.fecha)}
                y={(o) => y(o.usd)}
                curve={curveLinear}
                stroke="var(--color-ink-60)"
                strokeWidth={1.5}
                strokeDasharray="5 5"
                vectorEffect="non-scaling-stroke"
                fill="none"
              />
            )}

            <AreaClosed
              data={reales}
              x={(p) => xDe(p.fecha)}
              y={(p) => y(valorDe(p) as number)}
              yScale={y}
              curve={curveMonotoneX}
              fill={`url(#${idRelleno})`}
            />

            {reconstruidos.length >= 2 && (
              <LinePath
                data={reconstruidos}
                x={(p) => xDe(p.fecha)}
                y={(p) => y(valorDe(p) as number)}
                curve={curveMonotoneX}
                stroke="var(--color-ink)"
                strokeWidth={2}
                strokeOpacity={0.5}
                vectorEffect="non-scaling-stroke"
                fill="none"
              />
            )}

            {firmes.length >= 2 && (
              <LinePath
                data={firmes}
                x={(p) => xDe(p.fecha)}
                y={(p) => y(valorDe(p) as number)}
                curve={curveMonotoneX}
                stroke="var(--color-ink)"
                strokeWidth={2}
                vectorEffect="non-scaling-stroke"
                fill="none"
              />
            )}
          </svg>

          {/* Las etiquetas del eje Y, en HTML sobre la grilla. */}
          {ticks.map((t) => (
            <span
              key={t}
              aria-hidden
              className="pointer-events-none absolute left-0 -translate-y-1/2 bg-base/80 pr-1 text-label text-ink-40 tabular-nums"
              style={{ top: `${pctY(t)}%` }}
            >
              {enUsd ? enteroAR(t) : enteroAR(t)}
            </span>
          ))}

          {enUsd && REFERENCIA_MRR_USD <= yMax && (
            <span
              aria-hidden
              className="pointer-events-none absolute right-0 -translate-y-full pb-0.5 text-label font-semibold text-ink-60 tabular-nums"
              style={{ top: `${pctY(REFERENCIA_MRR_USD)}%` }}
            >
              Objetivo · {dolares(REFERENCIA_MRR_USD)}
            </span>
          )}

          {/* El punto de hoy y su valor, directo sobre la curva. */}
          <div
            aria-hidden
            className="pointer-events-none absolute size-2.5 rounded-full border-2 border-base bg-ink"
            style={{
              left: `${pctX(ultimo.fecha)}%`,
              top: `${pctY(valorDe(ultimo) as number)}%`,
              translate: "-50% -50%",
            }}
          />
          <span
            aria-hidden
            className="pointer-events-none absolute whitespace-nowrap text-label font-semibold text-ink tabular-nums"
            style={{
              left: `${pctX(ultimo.fecha)}%`,
              top: `${pctY(valorDe(ultimo) as number)}%`,
              transform: ultimoALaDerecha
                ? "translate(8px, -50%)"
                : "translate(calc(-100% - 8px), -50%)",
            }}
          >
            {etiquetaUltimo}
          </span>

          {/* La guía y el tooltip del punto activo. */}
          {activo && (
            <>
              <div
                aria-hidden
                className="pointer-events-none absolute inset-y-0 w-px bg-line"
                style={{ left: `${pctX(activo.fecha)}%` }}
              />
              <div
                aria-hidden
                className="pointer-events-none absolute size-2.5 rounded-full border-2 border-base bg-ink"
                style={{
                  left: `${pctX(activo.fecha)}%`,
                  top: `${pctY(valorDe(activo) as number)}%`,
                  translate: "-50% -50%",
                }}
              />
              <div
                aria-hidden
                className="pointer-events-none absolute -top-1 z-10"
                style={{
                  left: `${centroTooltip}%`,
                  transform: `translate(${corrimientoTooltip}, -100%)`,
                }}
              >
                <div className="rounded-md border border-line bg-base px-2.5 py-1.5 whitespace-nowrap shadow-lg">
                  <p className="font-ui text-label font-semibold text-ink tabular-nums">
                    {formatearFecha(activo.fecha)}
                    <span className="font-normal text-ink-60">
                      {activo.fuente === "vivo"
                        ? " · hoy, en vivo"
                        : activo.fuente === "reconstruido"
                          ? " · reconstruido"
                          : ""}
                    </span>
                  </p>
                  <p className="font-ui text-label text-ink tabular-nums">
                    {pesos(activo.mrrArs)}
                    {activo.mrrUsd != null ? ` · ${dolares(activo.mrrUsd)}` : " · sin TC"}
                  </p>
                  <p className="font-ui text-label text-ink-60 tabular-nums">
                    {activo.tenantsActivos} {activo.tenantsActivos === 1 ? "activo" : "activos"}
                    {activo.tcVenta != null ? ` · TC ${enteroAR(activo.tcVenta)}` : ""}
                  </p>
                </div>
              </div>
            </>
          )}
        </div>

        {/* El eje X: un rótulo por mes, posicionado por fecha. En pantallas
            angostas se saltean de a dos y de a cuatro para que no se pisen. */}
        <div className="relative mt-1.5 h-4 text-label text-ink-40 tabular-nums">
          {meses.map((m, i) => {
            const pct = ((m.t - t0) / (t1 - t0)) * 100;
            const visibilidad =
              i % 4 === 0 ? "" : i % 2 === 0 ? "hidden sm:inline" : "hidden lg:inline";
            return (
              <span
                key={m.t}
                className={`absolute whitespace-nowrap ${visibilidad}`}
                style={{
                  left: `${pct}%`,
                  transform:
                    pct < 3 ? "none" : pct > 97 ? "translateX(-100%)" : "translateX(-50%)",
                }}
              >
                {m.etiqueta}
              </span>
            );
          })}
        </div>

        {/* La leyenda, siempre visible. */}
        <ul className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-1 text-label text-ink-60">
          <li className="flex items-center gap-1.5">
            <span aria-hidden className="inline-block w-4 border-t-2 border-ink" />
            MRR real
          </li>
          {corte >= 0 && (
            <li className="flex items-center gap-1.5">
              <span aria-hidden className="inline-block w-4 border-t-2 border-ink/50" />
              reconstruido hasta el {formatearFecha(reales[corte].fecha)}
            </li>
          )}
          {enUsd && (
            <>
              <li className="flex items-center gap-1.5">
                <span aria-hidden className="inline-block w-4 border-t-2 border-dashed border-ink-60" />
                Objetivo mensual
              </li>
              <li className="flex items-center gap-1.5">
                <span aria-hidden className="inline-block w-4 border-t border-ink-40" />
                Referencia {dolares(REFERENCIA_MRR_USD)}
              </li>
            </>
          )}
        </ul>
      </div>
    </section>
  );
}

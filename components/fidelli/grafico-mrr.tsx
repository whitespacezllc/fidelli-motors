"use client";

import { useId, useLayoutEffect, useRef, useState, useTransition } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { AreaClosed, LinePath } from "@visx/shape";
import { LinearGradient } from "@visx/gradient";
import { curveMonotoneX } from "@visx/curve";
import { scaleLinear } from "@visx/scale";
import { Segmentado } from "@/components/ui/segmentado";
import { formatearFecha } from "@/lib/fechas";
import { pesos } from "@/lib/fidelli/plan";
import { dolares, enteroAR } from "@/lib/fidelli/resumen";
import type { PuntoObjetivo } from "@/lib/fidelli/objetivo";
import {
  MONEDAS,
  RANGOS_MRR,
  limitesDelRango,
  type Moneda,
  type PuntoMrr,
  type RangoMrr,
} from "@/lib/fidelli/mrr";

// ============================================================
// El MRR en el tiempo, para mirarlo por período.
//
// La serie real sale de snapshots_diarios (se lee, nunca se recalcula) más
// el punto de hoy en vivo (mrr_plataforma() y el TC vigente). Un área de
// un solo color, como el Pulso pero sin apilar: la línea del MRR con su
// relleno degradado, tres marcas en el eje Y y las fechas abajo. Nada
// más sobre el dibujo: el valor de hoy y el objetivo del mes se leen en la
// cabecera, no flotando sobre la curva.
//
// EL PERÍODO SE ELIGE (mes en curso, Q1 a Q4 del año en curso, el año) y
// vive en la URL (`?mrr=`), como la moneda: la pantalla se puede compartir
// apuntando a un trimestre. El eje va del primer punto del período al
// último: si la historia arranca a mitad del período (las fotos existen
// desde el 16/08/2026), el gráfico ocupa todo el ancho igual y la primera
// fecha del eje dice desde cuándo.
//
// Los días reconstruidos (docs/METRICAS.md § 5) van al 50%: son la mejor
// foto que se pudo armar hacia atrás, no un cierre.
//
// EL GRÁFICO ARRANCA CON EL PRIMER TENANT (bloque MÉTRICAS 4): una foto
// anterior al alta del primer tenant es una plataforma vacía y se ignora,
// no se borra (los snapshots son inmutables).
//
// LA GEOMETRÍA VA POR FECHA, no por índice, y el SVG se estira
// (preserveAspectRatio="none"): todo lo que no puede deformarse
// —etiquetas, tooltip, el punto de hoy— vive en HTML por porcentaje.
// EL EJE X SE MIDE, NO SE ADIVINA (ResizeObserver): meses cada N, o días
// «dd/MM» si el período no da para dos rótulos de mes.
// ============================================================

const ANCHO = 900;
const ALTO = 220;
const PISO = 10;

// Días desde epoch, por partes: una fecha pura nunca pasa por new Date(iso).
function diaDe(iso: string): number {
  const [a, m, d] = iso.slice(0, 10).split("-").map(Number);
  return Date.UTC(a, m - 1, d) / 86_400_000;
}

const MES_CORTO = new Intl.DateTimeFormat("es-AR", { month: "short", timeZone: "UTC" });

type Mes = { t: number; nombre: string; anio: number };

// Los inicios de mes entre dos días, con su nombre corto y su año.
function mesesEntre(t0: number, tFin: number): Mes[] {
  const desde = new Date(t0 * 86_400_000);
  let anio = desde.getUTCFullYear();
  let mes = desde.getUTCMonth() + 1;
  const salida: Mes[] = [];
  for (;;) {
    const t = Date.UTC(anio, mes - 1, 1) / 86_400_000;
    if (t > tFin) break;
    if (t >= t0) {
      salida.push({ t, nombre: MES_CORTO.format(new Date(t * 86_400_000)).replace(".", ""), anio });
    }
    mes += 1;
    if (mes > 12) { mes = 1; anio += 1; }
  }
  return salida;
}

// «22/09», sin pasar por Intl (es-AR ignora el 2-digit del mes).
function etiquetaDia(t: number): string {
  const f = new Date(t * 86_400_000);
  return `${String(f.getUTCDate()).padStart(2, "0")}/${String(f.getUTCMonth() + 1).padStart(2, "0")}`;
}

// ---------- El eje X según el ancho real ----------

// Ancho estimado de un rótulo, sin medir texto: text-label mide 12px y en
// Public Sans un dígito tabular ocupa ~8,4px y una letra ~6px. Redondeado
// para arriba a propósito, con 8px de aire entre vecinos.
const PX_POR_DIGITO = 8.5;
const PX_POR_LETRA = 6.5;
const SEPARACION = 8;

function anchoDeTexto(texto: string): number {
  let ancho = 0;
  for (const c of texto) ancho += c >= "0" && c <= "9" ? PX_POR_DIGITO : PX_POR_LETRA;
  return ancho;
}
// Antes de medir se asume el eje de un celular de 320px (~240 de eje).
const ANCHO_SUPUESTO = 240;
const PASOS_MES = { lista: [1, 2, 3, 4, 6, 12], base: 12 };
const PASOS_DIA = { lista: [1, 2, 7, 14], base: 7 };

type Candidato = { t: number; etiqueta: string };
type Rotulo = Candidato & { pct: number; anclaje: "izquierda" | "centro" | "derecha" };

// Ubica candidatos sobre un eje de `anchoPx` píxeles que va de t0 a t1 y
// descarta el que pise al anterior. Los de los bordes se anclan hacia
// adentro para no salirse del gráfico.
function ubicar(candidatos: Candidato[], t0: number, t1: number, anchoPx: number): Rotulo[] {
  const salida: Rotulo[] = [];
  let derechaAnterior = -Infinity;
  for (const c of candidatos) {
    const pct = ((c.t - t0) / (t1 - t0)) * 100;
    const x = (pct / 100) * anchoPx;
    const w = anchoDeTexto(c.etiqueta);
    const anclaje = pct < 3 ? "izquierda" : pct > 97 ? "derecha" : "centro";
    const izquierda = anclaje === "izquierda" ? x : anclaje === "derecha" ? x - w : x - w / 2;
    if (izquierda < derechaAnterior + SEPARACION) continue;
    salida.push({ ...c, pct, anclaje });
    derechaAnterior = izquierda + w;
  }
  return salida;
}

// El primer paso en el que TODOS los candidatos caben: así el eje queda
// parejo. Termina siempre: con un paso más grande que el rango queda un
// solo candidato, y uno solo cabe.
function primerPasoQueCabe(
  pasos: { lista: number[]; base: number },
  candidatosCon: (paso: number) => Candidato[],
  t0: number,
  t1: number,
  anchoPx: number,
): Rotulo[] {
  let paso = 0;
  for (let i = 0; ; i++) {
    paso = i < pasos.lista.length ? pasos.lista[i] : paso + pasos.base;
    const candidatos = candidatosCon(paso);
    const ubicados = ubicar(candidatos, t0, t1, anchoPx);
    if (ubicados.length === candidatos.length || candidatos.length <= 1) return ubicados;
  }
}

// Un rótulo cada N meses, con el año en el primero y en cada cambio de año.
// En un eje angosto se reintenta con el año solo en el primero.
function rotulosPorMes(meses: Mes[], t0: number, t1: number, anchoPx: number): Rotulo[] {
  if (meses.length === 0) return [];
  const candidatosCon = (anioEnCambios: boolean) => (paso: number) => {
    const elegidos = meses.filter((_, i) => i % paso === 0);
    return elegidos.map((m, i) => ({
      t: m.t,
      etiqueta:
        i === 0 || (anioEnCambios && m.anio !== elegidos[i - 1].anio)
          ? `${m.nombre} ${m.anio}`
          : m.nombre,
    }));
  };
  const conCambios = primerPasoQueCabe(PASOS_MES, candidatosCon(true), t0, t1, anchoPx);
  if (conCambios.length >= 3) return conCambios;
  const soloPrimero = primerPasoQueCabe(PASOS_MES, candidatosCon(false), t0, t1, anchoPx);
  return soloPrimero.length > conCambios.length ? soloPrimero : conCambios;
}

// Un rótulo «dd/MM» cada N días: el eje de un período que no llega a dos
// inicios de mes (el mes en curso, o un trimestre recién empezado).
function rotulosPorDia(t0: number, tFin: number, t1: number, anchoPx: number): Rotulo[] {
  const candidatosCon = (paso: number) => {
    const candidatos: Candidato[] = [];
    for (let t = t0; t <= tFin; t += paso) candidatos.push({ t, etiqueta: etiquetaDia(t) });
    return candidatos;
  };
  return primerPasoQueCabe(PASOS_DIA, candidatosCon, t0, t1, anchoPx);
}

function elegirRotulos(t0: number, tFin: number, t1: number, anchoPx: number): Rotulo[] {
  const porMes = rotulosPorMes(mesesEntre(t0, tFin), t0, t1, anchoPx);
  return porMes.length >= 2 ? porMes : rotulosPorDia(t0, tFin, t1, anchoPx);
}

// El ancho real de un elemento, seguido con ResizeObserver.
function useAncho(): [(nodo: HTMLDivElement | null) => void, number | null] {
  const [nodo, setNodo] = useState<HTMLDivElement | null>(null);
  const [ancho, setAncho] = useState<number | null>(null);
  useLayoutEffect(() => {
    if (!nodo) return;
    const medir = () => setAncho(nodo.getBoundingClientRect().width);
    medir();
    const observador = new ResizeObserver(medir);
    observador.observe(nodo);
    return () => observador.disconnect();
  }, [nodo]);
  return [setNodo, ancho];
}

// «+12,5 %» / «−3,0 %» / «sin cambios»: la variación entre dos valores.
function variacion(desde: number, hasta: number): string {
  if (desde <= 0) return hasta > 0 ? "arrancó de cero" : "sin cambios";
  const pct = ((hasta - desde) / desde) * 100;
  if (Math.abs(pct) < 0.05) return "sin cambios";
  const texto = pct.toLocaleString("es-AR", { minimumFractionDigits: 1, maximumFractionDigits: 1 });
  return `${pct > 0 ? "+" : "−"}${texto.replace("-", "")} %`;
}

export function GraficoMrr({
  serie,
  objetivo,
  monedaInicial,
  rangoInicial,
  hoy,
  primerTenant,
}: {
  /** De la fecha más vieja a la más nueva; la última puede ser la de hoy en vivo. */
  serie: PuntoMrr[];
  objetivo: PuntoObjetivo[];
  monedaInicial: Moneda;
  rangoInicial: RangoMrr;
  /** El día argentino de hoy, «2026-09-23»: el fin de todo período. */
  hoy: string;
  /** El día argentino del alta del primer tenant; las fotos anteriores se ignoran. */
  primerTenant: string | null;
}) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [, iniciar] = useTransition();
  const [moneda, setMoneda] = useState<Moneda>(monedaInicial);
  const [rango, setRango] = useState<RangoMrr>(rangoInicial);
  const [indice, setIndice] = useState<number | null>(null);
  const superficie = useRef<HTMLDivElement | null>(null);
  const [ejeX, anchoEje] = useAncho();
  const idRelleno = useId();

  // El cambio es instantáneo (estado) y la URL lo sigue atrás: se toca
  // solo la clave propia, el `pulso` del otro gráfico sobrevive. Los
  // defaults (USD, mes) no se escriben.
  function escribirUrl(clave: string, valor: string | null) {
    iniciar(() => {
      const params = new URLSearchParams(searchParams);
      if (valor === null) params.delete(clave);
      else params.set(clave, valor);
      const q = params.toString();
      router.replace(`/fidelli${q ? `?${q}` : ""}`, { scroll: false });
    });
  }
  function cambiarMoneda(m: Moneda) {
    setMoneda(m);
    setIndice(null);
    escribirUrl("moneda", m === "usd" ? null : m);
  }
  function cambiarRango(r: RangoMrr) {
    setRango(r);
    setIndice(null);
    escribirUrl("mrr", r === "mes" ? null : r);
  }

  const enUsd = moneda === "usd";
  const valorDe = (p: PuntoMrr): number | null => (enUsd ? p.mrrUsd : p.mrrArs);
  const formato = (n: number) => (enUsd ? dolares(n) : pesos(n));

  // El piso de fecha: desde el alta del primer tenant, inclusive.
  const desdeElPrimerTenant = primerTenant ? serie.filter((p) => p.fecha >= primerTenant) : serie;
  const reales = desdeElPrimerTenant.filter((p) => valorDe(p) != null);
  const ultimo = reales[reales.length - 1];

  // El período, y lo que cae adentro.
  const limites = limitesDelRango(rango, hoy);
  const enRango = reales.filter((p) => p.fecha >= limites.desde && p.fecha <= limites.hasta);
  const primero = enRango[0];
  const final = enRango[enRango.length - 1];

  // El objetivo del mes en curso, para la cabecera (solo en dólares: es la
  // moneda de la meta).
  const objetivoDelMes = enUsd
    ? objetivo.find((o) => o.fecha.slice(0, 7) === hoy.slice(0, 7))?.usd ?? null
    : null;

  const cabecera = (
    <div className="flex flex-wrap items-start justify-between gap-x-6 gap-y-3 px-4.5 py-4">
      <div>
        <p className="font-brand text-h2 font-bold text-ink tabular-nums">
          {ultimo ? formato(valorDe(ultimo) as number) : "—"}
        </p>
        <p className="text-label font-semibold tracking-[0.04em] text-ink-60 uppercase">
          {ultimo?.fuente === "vivo" ? "MRR hoy" : ultimo ? `MRR al ${formatearFecha(ultimo.fecha)}` : "MRR"}
        </p>
        {primero && final && (
          <p className="mt-1 text-ui text-ink-60 tabular-nums">
            {enRango.length > 1 ? (
              <>
                <span className="font-semibold text-ink">
                  {variacion(valorDe(primero) as number, valorDe(final) as number)}
                </span>{" "}
                desde el {formatearFecha(primero.fecha).slice(0, 5)}
              </>
            ) : (
              "una sola foto en el período"
            )}
            {objetivoDelMes !== null && (
              <span className="text-ink-40"> · objetivo del mes {dolares(objetivoDelMes)}</span>
            )}
          </p>
        )}
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <Segmentado
          etiqueta="Período del gráfico"
          opciones={RANGOS_MRR}
          valor={rango}
          alCambiar={cambiarRango}
        />
        <Segmentado
          etiqueta="Moneda del gráfico"
          opciones={MONEDAS}
          valor={moneda}
          alCambiar={cambiarMoneda}
        />
      </div>
    </div>
  );

  const vacio = (texto: string) => (
    <section className="surface-card mb-5 overflow-hidden">
      {cabecera}
      <p className="border-t border-line px-4.5 py-8 text-center text-ui text-ink-60">{texto}</p>
    </section>
  );

  if (reales.length === 0) {
    return vacio(
      serie.length === 0
        ? "Todavía no hay fotos diarias. El primer cierre corre esta noche a las 00:10; para tener historia desde el 16/08 hay que correr la reconstrucción (docs/METRICAS.md § 5)."
        : "No hay tipo de cambio cargado para ningún día: sin él no hay MRR en dólares. Corré scripts/backfill-tc.mjs o mirá la serie en ARS.",
    );
  }
  if (limites.futuro) {
    return vacio(`${limites.nombre} todavía no empezó: arranca el ${formatearFecha(limites.desde)}.`);
  }
  if (enRango.length === 0) {
    return vacio(
      `Sin fotos en ${limites.nombre}: la historia arranca el ${formatearFecha(reales[0].fecha)}.`,
    );
  }
  if (enRango.length === 1) {
    return vacio(
      `${limites.nombre} tiene una sola foto, la del ${formatearFecha(primero.fecha)}: ${formato(valorDe(primero) as number)}. El gráfico aparece con la segunda.`,
    );
  }

  // ---------- La geometría ----------
  const t0 = diaDe(primero.fecha);
  const t1 = diaDe(final.fecha);
  const xDe = (iso: string) => ((diaDe(iso) - t0) / (t1 - t0)) * ANCHO;

  const maximo = Math.max(...enRango.map((p) => valorDe(p) as number));
  const y = scaleLinear({
    domain: [0, Math.max(1, maximo)],
    range: [ALTO - PISO, PISO],
    nice: true,
  });
  const yMax = y.domain()[1];

  // Los días reconstruidos van primero. El tramo al 50% incluye el primer
  // punto firme para que la línea no se corte.
  let corte = -1;
  enRango.forEach((p, i) => {
    if (p.fuente === "reconstruido") corte = i;
  });
  const reconstruidos = corte >= 0 ? enRango.slice(0, Math.min(corte + 2, enRango.length)) : [];
  const firmes = corte >= 0 ? enRango.slice(corte + 1) : enRango;

  const activo = indice !== null ? enRango[indice] : null;
  const ticks = y.ticks(3).filter((t) => t > 0 && t <= yMax);
  const rotulos = elegirRotulos(t0, t1, t1, anchoEje ?? ANCHO_SUPUESTO);

  const pctX = (iso: string) => (xDe(iso) / ANCHO) * 100;
  const pctY = (v: number) => (y(v) / ALTO) * 100;

  // ---------- La interacción: puntero → fecha → el punto más cercano ----------
  function indiceDesde(clientX: number): number {
    const caja = superficie.current?.getBoundingClientRect();
    if (!caja || caja.width === 0) return enRango.length - 1;
    const fraccion = Math.min(1, Math.max(0, (clientX - caja.left) / caja.width));
    const t = t0 + fraccion * (t1 - t0);
    let mejor = 0;
    let distancia = Infinity;
    enRango.forEach((p, i) => {
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
      const base = indice ?? (paso === 1 ? -1 : enRango.length);
      setIndice(Math.min(enRango.length - 1, Math.max(0, base + paso)));
    }
    if (e.key === "Escape") setIndice(null);
  }

  const centroTooltip = activo ? pctX(activo.fecha) : 0;
  const corrimientoTooltip = centroTooltip < 15 ? "0%" : centroTooltip > 85 ? "-100%" : "-50%";

  return (
    <section className="surface-card mb-5 overflow-hidden">
      {cabecera}

      <div className="border-t border-line px-4.5 pt-4 pb-3">
        <div
          ref={superficie}
          role="group"
          aria-label={`MRR en ${limites.nombre}. Explorá los días con las flechas.`}
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
            className="block h-36 w-full sm:h-44 lg:h-[220px]"
            role="img"
            aria-label={`MRR en ${enUsd ? "dólares" : "pesos"}, ${limites.nombre}: de ${formato(
              valorDe(primero) as number,
            )} el ${formatearFecha(primero.fecha)} a ${formato(valorDe(final) as number)} el ${formatearFecha(
              final.fecha,
            )}.`}
          >
            <LinearGradient
              id={idRelleno}
              from="var(--color-ink)"
              to="var(--color-ink)"
              fromOpacity={0.16}
              toOpacity={0.02}
            />

            {/* Tres marcas apenas visibles: la referencia de escala, sin grilla. */}
            {ticks.map((t) => (
              <line
                key={t}
                x1={0}
                x2={ANCHO}
                y1={y(t)}
                y2={y(t)}
                stroke="var(--color-line)"
                strokeWidth={1}
                strokeDasharray="2 4"
                vectorEffect="non-scaling-stroke"
              />
            ))}

            <AreaClosed
              data={enRango}
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
                strokeOpacity={0.45}
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

          {/* Las marcas del eje Y, en HTML, pegadas a la izquierda. */}
          {ticks.map((t) => (
            <span
              key={t}
              aria-hidden
              className="pointer-events-none absolute left-0 -translate-y-1/2 rounded-sm bg-base/80 pr-1 text-label text-ink-40 tabular-nums"
              style={{ top: `${pctY(t)}%` }}
            >
              {enteroAR(t)}
            </span>
          ))}

          {/* El último punto del período, sin texto encima: el valor está en la cabecera. */}
          <div
            aria-hidden
            className="pointer-events-none absolute size-2.5 rounded-full border-2 border-base bg-ink"
            style={{
              left: `${pctX(final.fecha)}%`,
              top: `${pctY(valorDe(final) as number)}%`,
              translate: "-50% -50%",
            }}
          />

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
                style={{ left: `${centroTooltip}%`, transform: `translate(${corrimientoTooltip}, -100%)` }}
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

        {/* El eje X, medido: meses cada N o días, según el período y el ancho. */}
        <div ref={ejeX} data-eje-x className="relative mt-1.5 h-4 text-label text-ink-40 tabular-nums">
          {rotulos.map((m) => (
            <span
              key={m.t}
              className="absolute whitespace-nowrap"
              style={{
                left: `${m.pct}%`,
                transform:
                  m.anclaje === "izquierda"
                    ? "none"
                    : m.anclaje === "derecha"
                      ? "translateX(-100%)"
                      : "translateX(-50%)",
              }}
            >
              {m.etiqueta}
            </span>
          ))}
        </div>

        {/* Una sola línea de leyenda, y solo si hace falta aclarar algo. */}
        {corte >= 0 && (
          <p className="mt-3 flex items-center gap-1.5 text-label text-ink-60">
            <span aria-hidden className="inline-block w-4 border-t-2 border-ink/45" />
            reconstruido hasta el {formatearFecha(enRango[corte].fecha)}; desde ahí, cierres diarios
          </p>
        )}
      </div>
    </section>
  );
}

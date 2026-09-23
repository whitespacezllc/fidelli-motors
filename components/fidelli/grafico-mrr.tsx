"use client";

import { useId, useLayoutEffect, useRef, useState, useTransition } from "react";
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
//
// EL GRÁFICO ARRANCA CON EL PRIMER TENANT (bloque MÉTRICAS 4): una foto
// anterior al alta del primer tenant es una plataforma vacía —una
// reconstrucción que arrancó antes, una foto de prueba que quedó en una
// base local— y estiraría el eje con meses de ceros. Esas fotos se ignoran
// acá, no se borran (los snapshots son inmutables): el primer punto es el
// mayor entre la primera foto y el día del alta. El punto de hoy y el
// objetivo no cambian.
//
// EL EJE X SE MIDE, NO SE ADIVINA: la cantidad de rótulos que entran
// depende del ancho real del contenedor (ResizeObserver) y del largo del
// rango, no del breakpoint de Tailwind. El eje habla en meses: uno cada N,
// con N el menor paso de calendario (1, 2, 3, 4, 6, 12) en el que dos
// rótulos vecinos no se tocan, anclado al primer mes del rango (el
// arranque siempre tiene fecha) y con el año en el primero y en cada
// cambio de año. Si el rango no da para dos rótulos de mes (en pesos no
// hay objetivo que lo estire: la serie sola puede ser de días o semanas),
// habla en días, «dd/MM» cada 1, 2, 7 o 14.
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

type Mes = { t: number; nombre: string; anio: number };

// Los inicios de mes entre dos días, con su nombre corto («sept», «oct», …)
// y su año. La etiqueta se arma después, cuando se sabe cuáles se muestran:
// el año va en el primero y en cada cambio de año.
function mesesEntre(t0: number, tFin: number): Mes[] {
  const desde = new Date(t0 * 86_400_000);
  let anio = desde.getUTCFullYear();
  let mes = desde.getUTCMonth() + 1; // el mes en curso, aunque su día 1 sea anterior a t0
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

// «22/09»: día y mes armados del número de día, sin pasar por Intl (es-AR
// ignora el 2-digit del mes, como anota lib/series.ts).
function etiquetaDia(t: number): string {
  const f = new Date(t * 86_400_000);
  return `${String(f.getUTCDate()).padStart(2, "0")}/${String(f.getUTCMonth() + 1).padStart(2, "0")}`;
}

// ---------- El eje X según el ancho real ----------

// Ancho estimado de un rótulo, sin medir texto (el ancho del contenedor no
// depende de que la fuente haya cargado; el del texto sí): text-label mide
// 12px y en Public Sans un dígito tabular ocupa ~8,4px y una letra ~6px.
// Se redondea para arriba a propósito (mejor un rótulo de menos que dos
// pisados). Entre rótulos vecinos quedan 8px de aire.
const PX_POR_DIGITO = 8.5;
const PX_POR_LETRA = 6.5;
const SEPARACION = 8;

function anchoDeTexto(texto: string): number {
  let ancho = 0;
  for (const c of texto) ancho += c >= "0" && c <= "9" ? PX_POR_DIGITO : PX_POR_LETRA;
  return ancho;
}
// Antes de medir (el render del servidor y el primer paint) se asume el
// eje de un celular de 320px de ancho: la tarjeta le descuenta unos 80px
// de márgenes y padding y quedan ~240. Si el eje real es más ancho sobran
// rótulos, que es el error barato; el ResizeObserver corrige antes de
// pintar. El mismo número usa grafico-pulso.tsx.
const ANCHO_SUPUESTO = 240;
// Pasos de calendario, del más fino al más grueso. En meses: con 3 se ven
// los trimestres, con 6 los semestres, con 12 uno por año; más allá,
// múltiplos de 12. En días: uno, dos, la semana y la quincena; más allá,
// múltiplos de la semana.
const PASOS_MES = { lista: [1, 2, 3, 4, 6, 12], base: 12 };
const PASOS_DIA = { lista: [1, 2, 7, 14], base: 7 };

type Candidato = { t: number; etiqueta: string };
type Rotulo = Candidato & { pct: number; anclaje: "izquierda" | "centro" | "derecha" };

// Ubica candidatos sobre un eje de `anchoPx` píxeles que va de t0 a t1 y
// descarta el que pise al anterior. Los de los bordes no se centran (para
// no salirse del gráfico), así que sus cajas son distintas: el primero,
// ancho porque lleva el año y anclado a la izquierda, ocupa el doble hacia
// la derecha que uno centrado.
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

// Prueba los pasos del más fino al más grueso y se queda con el primero en
// el que TODOS los candidatos caben (ubicar() no tuvo que descartar
// ninguno): así el eje queda parejo. Elegir el paso con una cuenta de
// «ancho del rótulo más ancho ÷ píxeles por mes» dejaba un hueco al
// arranque, donde el primer rótulo pisaba al segundo y se perdía solo ese.
// Termina siempre: con un paso más grande que el rango queda un solo
// candidato, y uno solo cabe.
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

// Un rótulo cada N meses, anclado al primer mes del rango (así el arranque
// siempre tiene fecha). El año va en el primero y en cada cambio de año
// («oct 2026, dic, feb 2027, …»), que es lo que antes justificaba anclar
// el paso a enero. En un eje angosto (un celular) el año del cambio cuesta
// caro: «mar 2027» no cabe al lado de «sept 2026» y el paso salta a un
// rótulo por año; con menos de tres, se reintenta con el año solo en el
// primero («sept 2026, mar, sept, mar») y se acepta si entran más.
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

// Un rótulo «dd/MM» cada N días desde el primer punto hasta el último día
// con algo dibujado: el eje de un rango que no llega a dos inicios de mes.
function rotulosPorDia(t0: number, tFin: number, t1: number, anchoPx: number): Rotulo[] {
  const candidatosCon = (paso: number) => {
    const candidatos: Candidato[] = [];
    for (let t = t0; t <= tFin; t += paso) candidatos.push({ t, etiqueta: etiquetaDia(t) });
    return candidatos;
  };
  return primerPasoQueCabe(PASOS_DIA, candidatosCon, t0, t1, anchoPx);
}

// Qué rotular en un eje de `anchoPx` píxeles que va de t0 a t1, con tFin el
// último día con algo dibujado (con un solo punto real y sin objetivo, t1
// es t0 + 1: un día de relleno para que el eje no mida cero, que no se
// rotula). Primero en meses; si el rango no da para dos rótulos de mes, en
// días: un eje de tiempo sin fechas no se lee.
function elegirRotulos(t0: number, tFin: number, t1: number, anchoPx: number): Rotulo[] {
  const porMes = rotulosPorMes(mesesEntre(t0, tFin), t0, t1, anchoPx);
  return porMes.length >= 2 ? porMes : rotulosPorDia(t0, tFin, t1, anchoPx);
}

// El ancho real de un elemento, seguido con ResizeObserver. Devuelve el ref
// (como callback, para volver a medir si el nodo se monta después: el
// gráfico tiene un estado vacío sin eje) y el ancho, null hasta medir.
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

export function GraficoMrr({
  serie,
  objetivo,
  monedaInicial,
  primerTenant,
}: {
  /** De la fecha más vieja a la más nueva; la última puede ser la de hoy en vivo. */
  serie: PuntoMrr[];
  objetivo: PuntoObjetivo[];
  monedaInicial: Moneda;
  /**
   * El día argentino del alta del primer tenant ("2026-09-22"): las fotos
   * anteriores se ignoran. Null si no hay tenants: no se filtra nada.
   */
  primerTenant: string | null;
}) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [, iniciar] = useTransition();
  const [moneda, setMoneda] = useState<Moneda>(monedaInicial);
  const [indice, setIndice] = useState<number | null>(null);
  const superficie = useRef<HTMLDivElement | null>(null);
  const [ejeX, anchoEje] = useAncho();
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
  // El piso de fecha: desde el alta del primer tenant, inclusive (la foto
  // de ese día ya lo tiene). El punto de hoy siempre pasa.
  const desdeElPrimerTenant = primerTenant
    ? serie.filter((p) => p.fecha >= primerTenant)
    : serie;
  const reales = desdeElPrimerTenant.filter((p) => valorDe(p) != null);
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
  // El último día con algo dibujado, y el fin del eje: con un solo punto
  // real y sin objetivo, el eje se estira un día de relleno para no medir
  // cero (ese día no se rotula).
  const tFin = Math.max(tUltimo, tObjetivo);
  const t1 = Math.max(tFin, t0 + 1);
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
  const rotulos = elegirRotulos(t0, tFin, t1, anchoEje ?? ANCHO_SUPUESTO);

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

          {/* Los dos textos que viven sobre el dibujo (este y el de hoy)
              llevan el mismo fondo translúcido que las etiquetas del eje Y:
              el objetivo punteado cruza la referencia cerca del borde
              derecho, y la etiqueta de hoy cae sobre la propia serie cuando
              es plana. */}
          {enUsd && REFERENCIA_MRR_USD <= yMax && (
            <span
              aria-hidden
              className="pointer-events-none absolute right-0 rounded-sm bg-base/80 px-1 text-label font-semibold text-ink-60 tabular-nums"
              style={{
                top: `${pctY(REFERENCIA_MRR_USD)}%`,
                transform: "translateY(calc(-100% - 2px))",
              }}
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
            className="pointer-events-none absolute rounded-sm bg-base/80 px-1 text-label font-semibold whitespace-nowrap text-ink tabular-nums"
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

        {/* El eje X: un rótulo cada N meses (o días, en un rango corto) según
            el ancho medido, posicionado por fecha. Los de los bordes se
            anclan hacia adentro. */}
        <div
          ref={ejeX}
          data-eje-x
          className="relative mt-1.5 h-4 text-label text-ink-40 tabular-nums"
        >
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

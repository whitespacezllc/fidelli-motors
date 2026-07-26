import Link from "next/link";
import { AreaClosed, LinePath } from "@visx/shape";
import { LinearGradient } from "@visx/gradient";
import { curveMonotoneX } from "@visx/curve";
import { scaleLinear, scaleTime } from "@visx/scale";

export type Granularidad = "dia" | "semana" | "mes";

export type PuntoPulso = { inicio: string; cantidad: number };

export const GRANULARIDADES: { clave: Granularidad; nombre: string }[] = [
  { clave: "dia", nombre: "Día" },
  { clave: "semana", nombre: "Semana" },
  { clave: "mes", nombre: "Mes" },
];

export function esGranularidad(v: string | undefined): v is Granularidad {
  return v === "dia" || v === "semana" || v === "mes";
}

const ANCHO = 900;
const ALTO = 200;
// Aire abajo para las etiquetas del eje X, que van en HTML y no adentro
// del SVG: así conservan la tipografía del sistema y no se deforman con el
// escalado horizontal.
const PISO = 8;
// Un respiro a los costados: con el rango pegado a los bordes, el trazo
// del primer y del último punto queda cortado por la mitad.
const MARGEN = 6;

function aFecha(iso: string): Date {
  const [a, m, d] = iso.slice(0, 10).split("-").map(Number);
  return new Date(a, m - 1, d);
}

// "12/05" para día y semana, "may" para mes: la etiqueta más corta que
// todavía se entiende sola.
function etiqueta(iso: string, granularidad: Granularidad): string {
  const f = aFecha(iso);
  if (granularidad === "mes") {
    return new Intl.DateTimeFormat("es-AR", { month: "short" })
      .format(f)
      .replace(".", "");
  }
  return new Intl.DateTimeFormat("es-AR", {
    day: "2-digit",
    month: "2-digit",
  }).format(f);
}

// ============================================================
// El pulso de la plataforma.
//
// Área cerrada con gradiente, como la cotización de algo que acaba de
// salir al mercado: el día uno es hoy y de acá en adelante se llena.
//
// COLOR — se evaluó el rojo de marca muy diluido y quedó en los neutros.
// Razón: la tabla de abajo ya está llena de color de estado (verde de "al
// día", ámbar de lo vencido) y esos colores tienen que ganar, porque son
// los que dicen a quién llamar hoy. Un área roja arriba de todo sería la
// cuarta familia de color de la pantalla y se llevaría el ojo a un dato
// que no pide ninguna acción. La línea en ink con el relleno degradado
// tiene la lectura financiera que busca la metáfora y deja el color donde
// hace falta.
//
// DEGRADACIÓN — la serie llega de la base ya recortada al primer service
// de la historia: con tres días de datos hay tres puntos, no veintisiete
// ceros previos al lanzamiento fingiendo un eje lleno. Los períodos sin
// services SÍ van en cero y visibles, que es otra cosa: un domingo
// cerrado es información.
// ============================================================
export function Pulso({
  serie,
  acumulado,
  granularidad,
  soloAtencion,
}: {
  serie: PuntoPulso[];
  acumulado: number;
  granularidad: Granularidad;
  soloAtencion: boolean;
}) {
  // Cambiar la granularidad no puede apagar el filtro de atención.
  const sufijo = soloAtencion ? "&atencion=1" : "";
  return (
    <section className="surface-card mb-5 overflow-hidden">
      <div className="flex flex-wrap items-end justify-between gap-4 px-4.5 py-4">
        <div>
          <p className="font-brand text-h2 font-bold text-ink tabular-nums">
            {acumulado.toLocaleString("es-AR")}
          </p>
          <p className="text-label font-semibold tracking-[0.04em] text-ink-60 uppercase">
            Services desde el día uno
          </p>
        </div>

        <nav aria-label="Granularidad del gráfico" className="flex gap-1">
          {GRANULARIDADES.map((g) => {
            const activa = g.clave === granularidad;
            return (
              <Link
                key={g.clave}
                href={`/fidelli?pulso=${g.clave}${sufijo}`}
                aria-current={activa ? "page" : undefined}
                className={`flex h-8 items-center rounded-md px-2.5 text-label font-semibold transition-colors ${
                  activa
                    ? "bg-ink text-base"
                    : "border border-line bg-base text-ink-60 hover:bg-surface"
                }`}
              >
                {g.nombre}
              </Link>
            );
          })}
        </nav>
      </div>

      <Grafico serie={serie} granularidad={granularidad} />
    </section>
  );
}

function Grafico({
  serie,
  granularidad,
}: {
  serie: PuntoPulso[];
  granularidad: Granularidad;
}) {
  if (serie.length === 0) {
    return (
      <p className="border-t border-line px-4.5 py-8 text-center text-ui text-ink-60">
        Todavía no se cargó ningún service en la plataforma. Acá va a aparecer
        el pulso en cuanto entre el primero.
      </p>
    );
  }

  // Un solo punto no es una curva: no hay tendencia que dibujar y una área
  // de un punto es una mancha. Se muestra el dato y ya — degradar con
  // dignidad es también saber cuándo no hay gráfico.
  if (serie.length === 1) {
    return (
      <div className="border-t border-line px-4.5 py-8 text-center">
        <p className="font-brand text-h3 font-bold text-ink tabular-nums">
          {serie[0].cantidad}
        </p>
        <p className="mt-0.5 text-ui text-ink-60">
          {etiqueta(serie[0].inicio, granularidad)} — el primer período de la
          plataforma. Con dos ya hay curva.
        </p>
      </div>
    );
  }

  const puntos = serie.map((p) => ({ fecha: aFecha(p.inicio), cantidad: p.cantidad }));
  const maximo = Math.max(...puntos.map((p) => p.cantidad));

  const x = scaleTime({
    domain: [puntos[0].fecha, puntos[puntos.length - 1].fecha],
    range: [MARGEN, ANCHO - MARGEN],
  });

  // Con todo en cero el dominio sería [0,0] y no habría escala: el max de 1
  // deja el gráfico plano contra el piso, que es exactamente lo que pasó.
  const y = scaleLinear({
    domain: [0, Math.max(1, maximo)],
    range: [ALTO - PISO, PISO],
    nice: true,
  });

  return (
    <div className="border-t border-line px-4.5 pt-4 pb-3">
      <svg
        viewBox={`0 0 ${ANCHO} ${ALTO}`}
        preserveAspectRatio="none"
        className="block h-[200px] w-full"
        role="img"
        aria-label={`Services por ${granularidad}: ${serie
          .map((p) => `${etiqueta(p.inicio, granularidad)} ${p.cantidad}`)
          .join(", ")}`}
      >
        <LinearGradient
          id="pulso-relleno"
          from="var(--color-ink)"
          to="var(--color-ink)"
          fromOpacity={0.16}
          toOpacity={0}
        />

        <AreaClosed
          data={puntos}
          x={(d) => x(d.fecha)}
          y={(d) => y(d.cantidad)}
          yScale={y}
          curve={curveMonotoneX}
          fill="url(#pulso-relleno)"
        />

        {/* El borde superior definido y el relleno suave: la línea es la
            que se lee, el área solo le da cuerpo. */}
        <LinePath
          data={puntos}
          x={(d) => x(d.fecha)}
          y={(d) => y(d.cantidad)}
          curve={curveMonotoneX}
          stroke="var(--color-ink)"
          strokeWidth={2}
          // El SVG se estira en horizontal: sin esto el trazo se
          // engrosaría con el escalado.
          vectorEffect="non-scaling-stroke"
          fill="none"
        />
      </svg>

      {/* Las etiquetas van en HTML, alineadas por grilla contra el mismo
          reparto que el SVG. Sin ejes decorados ni grilla pesada: lo
          mínimo para leer la tendencia. */}
      <div
        className="mt-1.5 grid gap-1 text-center text-label text-ink-40 tabular-nums"
        style={{ gridTemplateColumns: `repeat(${serie.length}, minmax(0, 1fr))` }}
      >
        {serie.map((p, i) => (
          // Con treinta puntos las etiquetas se pisan: se muestra una de
          // cada tantas, siempre incluyendo la última. Las salteadas van
          // vacías y no ocultas — una etiqueta invisible sigue ocupando su
          // ancho y se desborda de la celda en pantallas angostas.
          <span key={p.inicio}>
            {serie.length > 14 && i % 4 !== 0 && i !== serie.length - 1
              ? ""
              : etiqueta(p.inicio, granularidad)}
          </span>
        ))}
      </div>
    </div>
  );
}

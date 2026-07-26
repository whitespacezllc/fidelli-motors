import { scaleBand, scaleLinear } from "@visx/scale";

export type PuntoMes = { mes: string; cantidad: number };

// El viewBox se estira en horizontal (preserveAspectRatio="none"): las
// barras son rectángulos, así que estirarlas no deforma nada. Los textos
// NO van adentro del SVG — van como HTML alineado por grilla, para que
// conserven la tipografía del sistema y no se achiquen con el escalado.
const ANCHO = 600;
const ALTO = 120;

// "2026-07" → "jul". Se arma con las partes para no correrse de mes por
// zona horaria, igual que el resto de las fechas del producto.
function etiquetaMes(mes: string): string {
  const [anio, m] = mes.split("-").map(Number);
  return new Intl.DateTimeFormat("es-AR", { month: "short" })
    .format(new Date(anio, m - 1, 1))
    .replace(".", "");
}

export function GraficoEvolucion({ datos }: { datos: PuntoMes[] }) {
  if (datos.length === 0) return null;

  const maximo = Math.max(...datos.map((d) => d.cantidad));
  // El último punto es el mes en curso: todavía le faltan días, así que
  // no es comparable con los cerrados. Va más claro para que nadie lea
  // una caída donde solo hay un mes a medio terminar.
  const indiceEnCurso = datos.length - 1;

  const x = scaleBand({
    domain: datos.map((d) => d.mes),
    range: [0, ANCHO],
    padding: 0.42,
  });
  // Con todo en cero el dominio sería [0,0] y las barras no se podrían
  // dibujar: el max de 1 mantiene la escala sana y el gráfico plano.
  const y = scaleLinear({
    domain: [0, Math.max(1, maximo)],
    range: [ALTO, 0],
  });

  return (
    <div>
      {/* Los valores arriba reemplazan al eje Y: se lee el número exacto
          en vez de estimarlo contra una grilla. */}
      <div className="grid grid-cols-6 gap-1 text-center">
        {datos.map((d, i) => (
          <span
            key={d.mes}
            className={`text-ui font-semibold tabular-nums ${
              i === indiceEnCurso ? "text-ink-40" : "text-ink"
            }`}
          >
            {d.cantidad}
          </span>
        ))}
      </div>

      <svg
        viewBox={`0 0 ${ANCHO} ${ALTO}`}
        preserveAspectRatio="none"
        role="img"
        aria-label={`Services por mes: ${datos
          .map((d) => `${etiquetaMes(d.mes)} ${d.cantidad}`)
          .join(", ")}`}
        className="mt-1.5 h-28 w-full sm:h-32"
      >
        {datos.map((d, i) => {
          const alto = ALTO - y(d.cantidad);
          return (
            <rect
              key={d.mes}
              x={x(d.mes) ?? 0}
              // Un mes en cero deja 2px de zócalo: la barra existe aunque
              // valga cero, que es distinto de que falte el mes.
              y={ALTO - Math.max(alto, 2)}
              width={x.bandwidth()}
              height={Math.max(alto, 2)}
              rx="2"
              className={i === indiceEnCurso ? "fill-line" : "fill-ink"}
            />
          );
        })}
      </svg>

      <div className="mt-1.5 grid grid-cols-6 gap-1 text-center">
        {datos.map((d, i) => (
          <span
            key={d.mes}
            className={`text-label ${
              i === indiceEnCurso ? "text-ink-40" : "text-ink-60"
            }`}
          >
            {etiquetaMes(d.mes)}
          </span>
        ))}
      </div>
    </div>
  );
}

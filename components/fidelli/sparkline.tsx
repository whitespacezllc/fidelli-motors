// La chispa de 12 semanas del listado: 80 × 20, una línea de 1,5px y el
// punto del final. Sin tooltip y sin ejes: es para ver la forma —sube,
// baja, se apagó—, no para leer un número (el número va al lado).
const ANCHO = 80;
const ALTO = 20;
const MARGEN = 2;

export function Sparkline({
  valores,
  etiqueta,
}: {
  /** Una cantidad por semana, de la más vieja a la más nueva. */
  valores: number[];
  /** Para el lector de pantalla. */
  etiqueta: string;
}) {
  const n = valores.length;
  if (n < 2) return null;

  // Con todo en cero el máximo sería 0: el 1 deja la línea plana contra el
  // piso, que es exactamente lo que pasó.
  const maximo = Math.max(1, ...valores);
  const x = (i: number) => MARGEN + (i / (n - 1)) * (ANCHO - 2 * MARGEN);
  const y = (v: number) => ALTO - MARGEN - (v / maximo) * (ALTO - 2 * MARGEN);

  const trazo = valores
    .map((v, i) => `${i === 0 ? "M" : "L"}${x(i).toFixed(1)} ${y(v).toFixed(1)}`)
    .join(" ");

  return (
    <svg
      width={ANCHO}
      height={ALTO}
      viewBox={`0 0 ${ANCHO} ${ALTO}`}
      role="img"
      aria-label={etiqueta}
      className="shrink-0 overflow-visible"
    >
      <path
        d={trazo}
        fill="none"
        stroke="currentColor"
        strokeWidth={1.5}
        strokeLinejoin="round"
        strokeLinecap="round"
      />
      <circle cx={x(n - 1)} cy={y(valores[n - 1])} r={2} fill="currentColor" />
    </svg>
  );
}

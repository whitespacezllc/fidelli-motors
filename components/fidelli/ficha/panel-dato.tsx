// Los bloques de la ficha: un título de sección y pares etiqueta/valor.
// Es el mismo patrón en Resumen y en Configuración, así que vive en un lugar.

export function PanelFicha({
  titulo,
  children,
  acciones,
}: {
  titulo: string;
  children: React.ReactNode;
  acciones?: React.ReactNode;
}) {
  return (
    <section className="surface-card overflow-hidden">
      <div className="flex items-center justify-between gap-3 border-b border-line px-4.5 py-3">
        <h2 className="font-brand text-ui font-bold tracking-[0.04em] text-ink-60 uppercase">
          {titulo}
        </h2>
        {acciones}
      </div>
      <div className="px-4.5 py-1.5">{children}</div>
    </section>
  );
}

// Densidad alta: el renglón va a 40px, no a 44. Esta superficie es de
// escritorio y se lee de un vistazo, no se toca con los dedos con aceite.
export function Dato({
  etiqueta,
  children,
}: {
  etiqueta: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex min-h-10 flex-wrap items-baseline justify-between gap-x-4 gap-y-0.5 border-b border-line py-2.5 last:border-b-0">
      <dt className="text-ui text-ink-60">{etiqueta}</dt>
      <dd className="text-right text-ui text-ink">{children}</dd>
    </div>
  );
}

export function SinDato({ children = "—" }: { children?: React.ReactNode }) {
  return <span className="text-ink-40">{children}</span>;
}

// Las métricas del tenant: número grande y su etiqueta debajo.
export function Metrica({
  valor,
  etiqueta,
  pie,
}: {
  valor: string;
  etiqueta: string;
  pie?: string;
}) {
  return (
    <div className="surface-card px-4 py-3.5">
      <p className="font-brand text-h3 font-bold text-ink">{valor}</p>
      <p className="mt-0.5 text-label font-semibold tracking-[0.04em] text-ink-60 uppercase">
        {etiqueta}
      </p>
      {pie && <p className="mt-1 text-label text-ink-40">{pie}</p>}
    </div>
  );
}

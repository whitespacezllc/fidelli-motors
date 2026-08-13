// Andamio de las once secciones.
//
// Cada sección es un <section> con su id de ancla y su fondo definitivo, y
// por dentro un cartel que dice qué va ahí. El cartel se borra cuando se
// implemente el contenido: no lleva nada del copy real, que está cerrado en
// docs/landing-spec.md y no se escribe de memoria.
//
// Sirve para lo único que tiene que servir ahora: ver el orden narrativo
// completo, probar que las anclas del navbar saltan donde deben, y
// confirmar que las dos familias tipográficas cargan.

type Fondo = "base" | "surface" | "grafito" | "brand-soft";

// El fondo de cada sección ya es el definitivo — la 05 y la 06 son el único
// quiebre a grafito de la página, y la 07 el único lugar donde el rojo se
// usa como superficie.
const FONDOS: Record<Fondo, string> = {
  base: "bg-base text-ink",
  surface: "bg-surface text-ink",
  grafito: "bg-ink text-base",
  "brand-soft": "bg-brand-soft text-ink",
};

export function Seccion({
  id,
  numero,
  titulo,
  trabajo,
  fondo = "base",
  primeraDeGrafito = false,
  children,
}: {
  id: string;
  numero: string;
  titulo: string;
  /** El "trabajo" que la sección tiene que hacer, según el spec. */
  trabajo: string;
  fondo?: Fondo;
  /** La 05 y la 06 comparten fondo sin corte: solo la primera lleva aire arriba. */
  primeraDeGrafito?: boolean;
  children?: React.ReactNode;
}) {
  const enGrafito = fondo === "grafito";

  return (
    <section
      id={id}
      aria-labelledby={`${id}-titulo`}
      // scroll-mt deja el título despejado del navbar sticky al saltar por
      // el ancla. 56px en mobile, 64 desde sm: los altos del navbar.
      className={`scroll-mt-14 px-5 md:scroll-mt-16 sm:px-8 ${FONDOS[fondo]} ${
        enGrafito && !primeraDeGrafito ? "pt-0 pb-14 sm:pb-20" : "py-14 sm:py-20"
      }`}
    >
      <div className="mx-auto w-full max-w-6xl">
        <div
          className={`rounded-lg border border-dashed px-5 py-10 sm:py-14 ${
            enGrafito ? "border-base/25" : "border-line"
          }`}
        >
          <p
            className={`font-ui text-label font-semibold tracking-[0.12em] uppercase ${
              enGrafito ? "text-base/60" : "text-ink-40"
            }`}
          >
            {numero}
          </p>
          <h2
            id={`${id}-titulo`}
            className="mt-2 font-brand text-h3 font-bold sm:text-h2"
          >
            {titulo}
          </h2>
          <p
            className={`mt-2 max-w-prose text-body ${
              enGrafito ? "text-base/70" : "text-ink-60"
            }`}
          >
            {trabajo}
          </p>
          {children}
        </div>
      </div>
    </section>
  );
}

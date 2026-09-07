import Link from "next/link";

// Las migas del artículo: Inicio › Blog › título corto. El BreadcrumbList
// del JSON-LD dice lo mismo y sale de la misma fuente (tituloCorto).
// min-h-11: el área táctil de 44px del sistema, también en un enlace de
// texto de 14px. Sin eso, "Inicio" y "Blog" eran el objetivo más chico del
// blog, uno al lado del otro.
const CLASE_LINK =
  "inline-flex min-h-11 items-center text-ink-60 transition-colors hover:text-ink";

export function Migas({ actual }: { actual: string }) {
  return (
    <nav aria-label="Migas de pan" className="font-ui text-ui">
      <ol className="flex flex-wrap items-center gap-x-2 gap-y-1">
        <li>
          <Link href="/" className={CLASE_LINK}>
            Inicio
          </Link>
        </li>
        <li className="flex items-center gap-2">
          <span aria-hidden className="text-ink-40">
            ›
          </span>
          <Link href="/blog" className={CLASE_LINK}>
            Blog
          </Link>
        </li>
        <li className="flex items-center gap-2">
          <span aria-hidden className="text-ink-40">
            ›
          </span>
          <span aria-current="page" className="inline-flex min-h-11 items-center text-ink">
            {actual}
          </span>
        </li>
      </ol>
    </nav>
  );
}

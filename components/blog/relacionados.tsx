import Link from "next/link";
import type { Articulo } from "@/lib/blog/articulos";
import { Miniatura } from "@/components/blog/imagen-articulo";

// Los otros artículos, en el orden del índice. Lista y no grilla: la
// columna del artículo mide 65-75 caracteres y tres tarjetas al lado no
// entran sin achicar la letra, que es lo que no se hace.
export function Relacionados({
  articulos,
  className = "",
}: {
  articulos: readonly Articulo[];
  className?: string;
}) {
  if (articulos.length === 0) return null;

  return (
    <section aria-labelledby="relacionados-titulo" className={className}>
      <h2 id="relacionados-titulo" className="text-lead font-bold sm:text-h3">
        Artículos relacionados
      </h2>
      <ul className="mt-4 divide-y divide-line border-y border-line">
        {articulos.map((a) => (
          <li key={a.slug} className="grid grid-cols-[96px_1fr] gap-4 py-5 sm:grid-cols-[128px_1fr]">
            {/* La miniatura no es enlace: acá el que lleva al artículo es el
                título, y una foto de 96px no necesita ser un segundo. */}
            {a.imagen ? (
              <Miniatura imagen={a.imagen} sizes="128px" className="rounded-md" />
            ) : (
              <div aria-hidden />
            )}
            <div>
              <p className="font-ui text-label font-semibold tracking-[0.06em] text-ink-60 uppercase">
                {a.categoria}
                <span aria-hidden> · </span>
                {a.minutosLectura} min de lectura
              </p>
              <h3 className="mt-1.5 text-body font-bold">
                <Link
                  href={`/blog/${a.slug}`}
                  className="text-ink underline-offset-4 transition-colors hover:underline"
                >
                  {a.titulo}
                </Link>
              </h3>
              <p className="mt-1.5 max-w-prose text-pretty font-ui text-ui text-ink-60">
                {a.descripcion}
              </p>
            </div>
          </li>
        ))}
      </ul>
    </section>
  );
}

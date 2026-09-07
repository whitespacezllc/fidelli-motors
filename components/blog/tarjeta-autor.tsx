import { AvatarAutor } from "@/components/blog/avatar-autor";
import { AUTOR } from "@/lib/blog/seo";
import type { Articulo } from "@/lib/blog/articulos";

// La tarjeta de autor al final del artículo. La bio es la línea que cierra
// cada Markdown después del `---`, separada del cuerpo en lib/blog: acá se
// renderiza con la clase `prosa` para que su enlace se vea como los del
// artículo, y en tinta secundaria porque es una nota, no el cuerpo.
export function TarjetaAutor({
  articulo,
  className = "",
}: {
  articulo: Articulo;
  className?: string;
}) {
  return (
    <aside
      aria-label="Sobre el autor"
      className={`rounded-lg border border-line p-5 sm:p-6 ${className}`}
    >
      <div className="flex items-center gap-4">
        <AvatarAutor tamano="grande" />
        <div>
          <p className="font-brand text-body font-bold text-ink">
            {articulo.autor}
          </p>
          <p className="font-ui text-ui text-ink-60">{AUTOR.rol}</p>
        </div>
      </div>
      <div
        className="prosa mt-4 max-w-prose text-ink-60"
        dangerouslySetInnerHTML={{ __html: articulo.bioHtml }}
      />
    </aside>
  );
}

import Image from "next/image";
import type { ImagenBlog } from "@/lib/blog/articulos";

// Las fotos del blog. Vienen de un banco de imágenes (Pexels), son fotos
// reales —ninguna persona generada por IA, que es la regla de la landing—
// y viven en public/assets/blog con el nombre del artículo.
//
// Se recortan por CSS a 16:9 con `fill` + object-cover: así el archivo
// puede tener cualquier medida y el layout no se mueve al cargar. `sizes`
// lo pone quien la usa, porque el hueco cambia entre la portada, la lista
// y los relacionados.

const SIZES_COLUMNA = "(min-width: 768px) 672px, calc(100vw - 40px)";

/** La foto sola, recortada a 16:9. Para listas y miniaturas. */
export function Miniatura({
  imagen,
  sizes = SIZES_COLUMNA,
  prioridad = false,
  className = "",
}: {
  imagen: ImagenBlog;
  sizes?: string;
  prioridad?: boolean;
  className?: string;
}) {
  return (
    <div
      className={`relative aspect-video overflow-hidden rounded-lg bg-surface ${className}`}
    >
      <Image
        src={imagen.src}
        alt={imagen.alt}
        fill
        sizes={sizes}
        priority={prioridad}
        className="object-cover"
      />
    </div>
  );
}

/** La foto destacada, con el crédito del fotógrafo debajo. */
export function ImagenDestacada({
  imagen,
  prioridad = false,
  className = "",
}: {
  imagen: ImagenBlog;
  prioridad?: boolean;
  className?: string;
}) {
  return (
    <figure className={className}>
      <Miniatura imagen={imagen} prioridad={prioridad} />
      {/* El crédito no es obligatorio en la licencia de Pexels, pero se
          da igual. En la tinta secundaria y al piso de 12px: es una nota. */}
      {imagen.credito && (
        <figcaption className="mt-2 font-ui text-label text-ink-60">
          Foto: {imagen.credito}
        </figcaption>
      )}
    </figure>
  );
}

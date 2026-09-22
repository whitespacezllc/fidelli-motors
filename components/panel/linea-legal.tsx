import Link from "next/link";
import { DOCUMENTOS_LEGALES } from "@/lib/legal";

// La línea discreta con los dos documentos legales, al pie del sidebar y de
// la hoja "Más" de mobile: junto a "Ayuda por WhatsApp" y "Cerrar sesión",
// que es donde se busca. Solo texto, en tinta terciaria y 12px (el piso):
// no compite con la navegación. Abren en pestaña nueva para no sacar al
// mecánico de lo que estaba haciendo.
//
// El mismo par que enlaza el pie de la landing. Ninguna página más.
export function LineaLegal({ className = "" }: { className?: string }) {
  return (
    <p className={`flex flex-wrap gap-x-1.5 text-label text-ink-40 ${className}`}>
      {DOCUMENTOS_LEGALES.map((d, i) => (
        <span key={d.slug} className="flex gap-x-1.5">
          {i > 0 && <span aria-hidden>·</span>}
          <Link
            href={d.ruta}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex min-h-6 items-center transition-colors hover:text-ink-60"
          >
            {d.nombreCorto}
          </Link>
        </span>
      ))}
    </p>
  );
}

import Link from "next/link";
import { DOCUMENTOS_LEGALES } from "@/lib/legal";

// La línea discreta con los dos documentos legales, al pie de Mi cuenta
// (hasta el 30/10/2026 estaba en el pie del sidebar y de la hoja «Más»;
// con el pie en una sola fila, lo legal se busca en la cuenta). Solo texto,
// en tinta terciaria y 12px (el piso): no compite con nada. Abren en
// pestaña nueva para no sacar al mecánico de lo que estaba haciendo.
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

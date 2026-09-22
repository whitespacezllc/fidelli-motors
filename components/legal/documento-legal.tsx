import { formatearFechaLarga } from "@/lib/fechas";
import type { DocumentoLegal } from "@/lib/legal/documentos";

// Un documento legal, tal cual: título, versión y fecha de vigencia arriba,
// las secciones numeradas, y el bloque de contacto al final (es la última
// sección del texto). Sin hero, sin ilustración, sin cards.
//
// La voz es la del blog, decidida el 07/09/2026: Nunito para el título y
// los H2 (los pone `prosa`), Public Sans 16/1.6 para el cuerpo, medida
// topada en 65ch (`max-w-prose`), cero itálicas. Ink sobre base. El rojo de
// marca no aparece: acá no hay ninguna acción que ofrecer.
export function DocumentoLegal({ documento }: { documento: DocumentoLegal }) {
  return (
    <div className="contenedor aire-seccion">
      <article className="mx-auto max-w-2xl">
        <header>
          <h1 className="max-w-prose text-balance text-h2 font-bold tracking-[-0.015em] sm:text-h1">
            {documento.titulo}
          </h1>
          {/* La versión y la vigencia, en la voz del instrumento: es el dato
              que identifica QUÉ texto está vigente, y el que el modal del
              panel registra al aceptar. En tabular por la regla del body. */}
          <p className="mt-(--espacio-h2-lead) font-ui text-ui text-ink-60 tabular-nums">
            Versión {documento.version}
            <span aria-hidden> · </span>
            Vigente desde el{" "}
            <time dateTime={documento.vigencia}>
              {formatearFechaLarga(documento.vigencia)}
            </time>
          </p>
        </header>

        {/* El cuerpo: HTML generado en build a partir del Markdown de
            content/legal. `prosa` (globals.css) pone Public Sans, la
            medida y el resto de las reglas del bloque. */}
        <div
          className="prosa mt-(--espacio-lead) max-w-prose"
          dangerouslySetInnerHTML={{ __html: documento.html }}
        />
      </article>
    </div>
  );
}

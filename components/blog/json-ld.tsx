// Un bloque de datos estructurados. El JSON va escapado: un `<` adentro de
// un <script> puede cerrar la etiqueta antes de tiempo, y el texto de los
// artículos sale de Markdown que mañana puede traer cualquier cosa.
export function JsonLd({ datos }: { datos: unknown }) {
  return (
    <script
      type="application/ld+json"
      dangerouslySetInnerHTML={{
        __html: JSON.stringify(datos).replace(/</g, "\\u003c"),
      }}
    />
  );
}

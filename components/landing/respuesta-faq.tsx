// El texto de una respuesta del FAQ, con su enlace opcional adentro.
//
// Vive en su propio archivo porque lo usan las dos tandas —las cuatro
// abiertas y el acordeón— y si lo importara una de la otra, el ciclo sería
// preguntas → acordeon → preguntas.
//
// Parte el MISMO string que va al JSON-LD: guardar el texto dos veces
// —uno con JSX y otro plano para el schema— es la forma segura de que
// terminen diciendo cosas distintas, y Google marca el rich result como
// contenido que no coincide.
export type EnlaceFaq = { readonly texto: string; readonly href: string };

export function RespuestaFaq({
  texto,
  enlace,
}: {
  texto: string;
  enlace?: EnlaceFaq;
}) {
  if (!enlace) return texto;
  const corte = texto.lastIndexOf(enlace.texto);
  if (corte === -1) return texto;

  return (
    <>
      {texto.slice(0, corte)}
      {/* En tinta plena y subrayado, NO en rojo: el único rojo de esta
          sección es el WhatsApp del cierre. */}
      <a
        href={enlace.href}
        className="font-semibold text-ink underline decoration-ink-40 underline-offset-2 transition-colors hover:decoration-ink"
      >
        {enlace.texto}
      </a>
      {texto.slice(corte + enlace.texto.length)}
    </>
  );
}

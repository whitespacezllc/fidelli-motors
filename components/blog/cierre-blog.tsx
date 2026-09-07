import { CtaWhatsapp } from "@/components/landing/cta-whatsapp";

// El único llamado a la acción del artículo: el mismo WhatsApp, con el
// mismo texto y el mismo href que toda la landing (CtaWhatsapp). Sobre
// grafito, como el cierre de la landing, para que no compita con nada.
//
// Las dos líneas son las del cierre de la landing (sección 11): una sola
// voz para pedir lo mismo.
export function CierreBlog({ className = "" }: { className?: string }) {
  return (
    <section
      aria-labelledby="cierre-blog-titulo"
      className={`rounded-lg bg-ink px-6 py-8 text-center text-inverso sm:px-8 sm:py-10 ${className}`}
    >
      <h2
        id="cierre-blog-titulo"
        className="text-balance text-lead font-bold sm:text-h3"
      >
        Ordená tu lubricentro con Fidelli Motors.
      </h2>
      <p className="mx-auto mt-2 max-w-prose text-pretty text-body text-inverso-60">
        Escribinos por WhatsApp y agendamos una demo.
      </p>
      <CtaWhatsapp
        variante="solido-grafito"
        className="mt-6 h-12 px-6 text-body"
      />
    </section>
  );
}

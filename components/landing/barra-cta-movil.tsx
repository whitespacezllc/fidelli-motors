"use client";

import { CtaWhatsapp } from "@/components/landing/cta-whatsapp";
import { useCtaHeroVisible } from "@/components/landing/usar-cta-hero";

// La barra fija al pie, solo en mobile.
//
// APARECE RECIÉN CUANDO EL CTA DEL HERO SE VA DE PANTALLA. Antes estaba
// desde el primer scroll y era el mismo botón dos veces en la misma
// pantalla: uno en el hero y otro tapándolo tres centímetros abajo.
//
// El CTA no va en el menú hamburguesa: un menú esconde la única acción de
// la página detrás de un toque de más. Mientras el hero está a la vista la
// acción ya está ahí, a tamaño completo; después la toma esta barra y no la
// suelta hasta el final.
//
// Montada siempre y corrida hacia abajo con transform, para que entre
// deslizando. `inert` mientras está afuera: sin eso, el tabulador cae en un
// botón que no se ve.
//
// El aire de abajo lleva safe-area para no quedar debajo de la barra de
// gestos del iPhone. El alto total —72px más el safe-area— es el mismo
// padding que reserva el layout al final de la página.
export function BarraCtaMovil() {
  const mostrar = !useCtaHeroVisible();

  return (
    <div
      inert={!mostrar}
      className={`fixed inset-x-0 bottom-0 z-60 border-t border-line bg-base px-5 pt-3 pb-[calc(0.75rem+env(safe-area-inset-bottom))] transition-transform duration-[220ms] ease-out md:hidden ${
        mostrar ? "translate-y-0" : "translate-y-full"
      }`}
    >
      <CtaWhatsapp className="h-12 w-full text-body" />
    </div>
  );
}

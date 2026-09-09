"use client";

import type { MouseEvent, ReactNode } from "react";
import { CTA_WHATSAPP } from "@/lib/landing";
import { registrarClicWhatsapp } from "@/lib/tracking/eventos";

// El enlace a WhatsApp de ventas. TODOS los botones y enlaces del sitio que
// abren el chat pasan por acá: CtaWhatsapp (navbar, hero, cierre, barra de
// mobile, cierre del blog), los tres botones de precio, el pie y el remate
// de las preguntas.
//
// En el HTML va el href de respaldo, con el mensaje sin origen: sin
// JavaScript, o si alguien toca antes de que la página hidrate, el botón
// abre WhatsApp igual. Al hacer clic se reemplaza el href por el mensaje
// que corresponde al origen del visitante y se avisa a GA4, Google Ads y
// Meta (lib/tracking/eventos.ts).
//
// CÓMO SE CAMBIA EL DESTINO SIN TOCAR LA NAVEGACIÓN: se escribe el href
// nuevo en el propio <a> durante el evento y se deja que el navegador siga
// con su acción por defecto. Nada de preventDefault ni window.open: así el
// clic sigue siendo un clic —abre en pestaña nueva, respeta Cmd/Ctrl,
// funciona con el teclado— y ningún bloqueador de anuncios lo puede frenar.
//
// Pestaña nueva a propósito (`target="_blank"`): la página sigue viva
// mientras los eventos salen. Por eso no hace falta esperar respuesta de
// Google ni de Meta antes de navegar.
export function EnlaceWhatsapp({
  cta,
  className,
  id,
  children,
}: {
  /** Qué botón es: `hero`, `navbar`, `precio-pro`, `footer`, `blog`… */
  cta: string;
  className?: string;
  id?: string;
  children: ReactNode;
}) {
  const alHacerClic = (evento: MouseEvent<HTMLAnchorElement>) => {
    evento.currentTarget.href = registrarClicWhatsapp(cta);
  };

  // El botón del medio del mouse no dispara `click` sino `auxclick`, y
  // también abre el enlace en una pestaña nueva.
  const alHacerClicAuxiliar = (evento: MouseEvent<HTMLAnchorElement>) => {
    if (evento.button === 1) alHacerClic(evento);
  };

  return (
    <a
      id={id}
      href={CTA_WHATSAPP}
      target="_blank"
      rel="noopener noreferrer"
      className={className}
      onClick={alHacerClic}
      onAuxClick={alHacerClicAuxiliar}
    >
      {children}
    </a>
  );
}

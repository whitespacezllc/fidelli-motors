"use client";

import { useEffect, useState } from "react";
import { ID_CTA_HERO } from "@/lib/landing";

// ¿El CTA del hero está en pantalla?
//
// Lo preguntan dos componentes y por eso vive suelto: el navbar decide con
// esto si su botón va en outline o en rojo, y la barra fija de mobile si se
// muestra o no. Los dos tienen que contestar lo mismo en el mismo momento;
// si cada uno lo calculara por su cuenta, el día que uno cambie de criterio
// aparecen dos botones rojos en la misma pantalla.
//
// IntersectionObserver y no scrollY: la posición del CTA del hero depende
// del alto del titular, que cambia con el ancho de la pantalla y con el
// texto. Cualquier número de píxeles quemado en el código envejece mal.
//
// Arranca en `true` —el CTA del hero está a la vista cuando la página abre—
// para que el primer pintado sea el correcto y no haya un parpadeo de botón
// rojo, ni la barra de mobile entrando y saliendo, antes de que el observer
// conteste.
//
// SI EL CTA NO EXISTE, el valor se queda en `true` y no pasa nada más. Hoy
// la única página de esta superficie es `/`, que siempre lo tiene. Cuando
// existan /terminos y /privacidad —que no llevan hero— el navbar de esas
// páginas va a mostrar su botón en outline para siempre: no está roto, pero
// tampoco es lo que corresponde, así que ahí hay que darle a este hook una
// forma de saberlo. No se resuelve hoy con un setState dentro del efecto:
// eso es una cascada de renders y el lint de React lo rechaza con razón.
//
// El nombre arranca en inglés a propósito: la regla de hooks de ESLint
// reconoce los hooks por el prefijo `use` y con `usarCtaHero` dejaría de
// mirar este archivo.
export function useCtaHeroVisible(): boolean {
  const [visible, setVisible] = useState(true);

  useEffect(() => {
    const cta = document.getElementById(ID_CTA_HERO);
    if (!cta) return;

    const observer = new IntersectionObserver(
      ([entrada]) => setVisible(entrada.isIntersecting),
      { threshold: 0 },
    );
    observer.observe(cta);
    return () => observer.disconnect();
  }, []);

  return visible;
}

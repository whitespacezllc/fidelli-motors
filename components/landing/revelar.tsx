"use client";

import { useEffect, useRef, type ElementType, type ReactNode } from "react";

// El reveal de entrada de la landing. Envuelve un bloque y lo hace
// aparecer —opacity 0→1, translateY 12px→0— la primera vez que entra al
// viewport. Una sola vez: el observer se desconecta al disparar, así
// volver a scrollear hacia arriba no re-anima nada.
//
// LA SALVAGUARDA ES EL CENTRO DEL DISEÑO: el HTML llega VISIBLE del
// servidor y esta clase lo oculta recién al montar en el cliente. Sin
// JavaScript, la página entera se ve. Y hay dos casos donde ni siquiera
// se oculta:
//
//   · prefers-reduced-motion → no se toca nada, todo visible de entrada;
//   · el bloque ya está a la vista al montar → ocultarlo produciría el
//     parpadeo visible→oculto→visible en lo que quedó cerca del pliegue
//     mientras hidrata. Lo que ya se ve, se queda.
//
// El stagger llega por `indice`: 70ms por hermano, con tope en el quinto
// — del sexto en adelante todos entran juntos, que una fila de doce
// tarjetas no es un desfile.
export function Revelar({
  children,
  indice = 0,
  className,
  como = "div",
}: {
  children: ReactNode;
  /** Posición entre hermanos que aparecen juntos, para el stagger. */
  indice?: number;
  className?: string;
  /**
   * Qué elemento renderiza. El default `div` sirve casi siempre, PERO NO
   * DENTRO DE UNA LISTA: un div entre el <ol> y sus <li> rompe la
   * semántica —el lector de pantalla deja de anunciar "lista de 3
   * elementos"— y es HTML inválido. Ahí va `como="li"`.
   *
   * Existe por eso: envolver el <li> en un div hacía pasar el validador
   * por accidente en algunos casos y empeoraba la accesibilidad en todos.
   * Con esta prop, animar un ítem de lista no obliga a elegir entre las
   * dos cosas.
   */
  como?: ElementType;
}) {
  const Elemento = como;
  const ref = useRef<HTMLElement | null>(null);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;

    const caja = el.getBoundingClientRect();
    const yaVisible = caja.top < window.innerHeight * 0.9 && caja.bottom > 0;
    if (yaVisible) return;

    el.classList.add("revelar-oculto");
    const observer = new IntersectionObserver(
      ([entrada]) => {
        if (!entrada.isIntersecting) return;
        el.classList.add("revelar-entra");
        observer.disconnect();
      },
      { threshold: 0.15, rootMargin: "0px 0px -10% 0px" },
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  const retraso = Math.min(indice, 5) * 70;

  return (
    <Elemento
      ref={ref}
      className={className}
      style={
        retraso
          ? ({ "--revelar-retraso": `${retraso}ms` } as React.CSSProperties)
          : undefined
      }
    >
      {children}
    </Elemento>
  );
}

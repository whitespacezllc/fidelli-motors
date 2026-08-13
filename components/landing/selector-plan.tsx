"use client";

import { useId, useState } from "react";

// 09 · El control mensual/anual y la cifra que cambia con él.
//
// Es lo ÚNICO interactivo de la sección: el resto de la tarjeta oscura
// —etiqueta, chip, bullets, CTA— es estático y se queda en el servidor.
//
// ARRANCA EN MENSUAL, no en anual, y es deliberado: el anual es más barato
// y la tentación es mostrarlo primero. Pero el precio que el visitante va a
// comparar con lo que paga hoy es el mensual, y arrancar en anual convierte
// el número grande en una cifra con asterisco. El descuento se ofrece; no
// se usa para maquillar la entrada.
//
// EL CONTROL ES UN RADIOGROUP DE VERDAD —un fieldset con dos radios
// nativos— y no dos <button> con role="radio". Los nativos ya traen la
// navegación con flechas, el único tab stop del grupo y la semántica de
// "elegí uno de dos", que a mano son treinta líneas de teclado que se
// rompen en el primer refactor.
//
// Los radios no van con `sr-only` sino estirados sobre la pastilla y con
// `appearance-none`: invisibles pero del tamaño de lo que representan. Así
// el `:focus-visible` global de globals.css dibuja el foco alrededor de la
// pastilla en vez de alrededor de un punto de 1px, y esta sección no
// escribe ni una clase de color de marca.

const OPCIONES = [
  {
    id: "mensual",
    texto: "Mensual",
    badge: null,
    cifra: "$46.750",
    // El total anual solo existe en el plan anual.
    detalle: null,
  },
  {
    id: "anual",
    texto: "Anual",
    badge: "3 meses gratis",
    // 46.750 × 9 = 420.750, y eso dividido en los 12 meses que se usan.
    cifra: "$35.063",
    detalle: "$420.750 al año. Pagás 9 meses, usás 12.",
  },
] as const;

type Plan = (typeof OPCIONES)[number]["id"];

export function SelectorPlan() {
  const [plan, setPlan] = useState<Plan>("mensual");
  // El name del grupo tiene que ser único en el documento: si mañana hay
  // dos selectores en la misma página, con un name escrito a mano los dos
  // radios se pisarían entre sí.
  const grupo = useId();

  return (
    <div>
      {/* ---------- El control ----------
          El track y la pastilla salen de la escala de grafito de
          CLAUDE-landing: 0.08 para el riel, 0.14 para lo activo —el mismo
          valor que --color-inverso-line—. Van como blanco con alfa y no
          como token de borde usado de relleno. */}
      <fieldset className="inline-flex rounded-md bg-white/8 p-1">
        <legend className="sr-only">Cómo querés pagar</legend>

        {OPCIONES.map((opcion) => {
          const activo = plan === opcion.id;
          return (
            <label
              key={opcion.id}
              className={`relative flex cursor-pointer items-center gap-2 rounded-sm px-3.5 py-2 font-ui text-ui font-semibold transition-colors ${
                activo
                  ? "bg-white/14 text-inverso"
                  : "text-inverso-40 hover:text-inverso-60"
              }`}
            >
              <input
                type="radio"
                name={grupo}
                value={opcion.id}
                checked={activo}
                onChange={() => setPlan(opcion.id)}
                className="absolute inset-0 cursor-pointer appearance-none rounded-sm"
              />
              {opcion.texto}

              {/* EL BADGE EN ÁMBAR, NUNCA EN ROJO: es un incentivo, o sea
                  un estado de la oferta, y el rojo en esta casa es solo
                  acción. Sobre grafito el ámbar da 6.2:1, y sobre la
                  pastilla activa 4.9:1 — pasa AA en los dos, que es lo que
                  importa porque el badge se lee igual esté o no elegido. */}
              {opcion.badge && (
                <span className="text-label font-semibold tracking-[0.04em] text-urgente uppercase">
                  {opcion.badge}
                </span>
              )}
            </label>
          );
        })}
      </fieldset>

      {/* ---------- La cifra ----------
          LOS DOS ESTADOS VIVEN SIEMPRE EN EL DOM, uno encima del otro en la
          misma celda de grilla. Es lo que evita que la tarjeta pegue un
          salto al cambiar de plan: el alto del bloque es el del estado más
          alto —el anual, que tiene un renglón más— y no cambia nunca.
          Montar y desmontar el bloque haría exactamente lo contrario.

          El que no está activo va con `inert` además de `aria-hidden`: sin
          eso un lector de pantalla lee los dos precios seguidos y la
          sección pasa a tener cuatro cifras en vez de dos. */}
      <div aria-live="polite" className="mt-7 grid">
        {OPCIONES.map((opcion) => {
          const activo = plan === opcion.id;
          return (
            <div
              key={opcion.id}
              inert={!activo}
              aria-hidden={!activo}
              // `translate` en Tailwind v4 es una propiedad propia y no
              // entra en `transition-transform` por nombre: hay que
              // listarla. Con `transition-[opacity,transform]` el
              // desplazamiento no se anima y solo queda el fade.
              className={`col-start-1 row-start-1 transition-[opacity,translate] duration-200 ease-out motion-reduce:transition-none ${
                activo
                  ? "translate-y-0 opacity-100"
                  : "pointer-events-none translate-y-1.5 opacity-0"
              }`}
            >
              <p className="flex flex-wrap items-baseline gap-x-2.5">
                {/* Nunito Y tabular a la vez: es una cifra de marca, no un
                    dato de tabla. El tope es h1 (39px) — el escalón display
                    es de otras superficies. */}
                <span className="text-h2 font-bold text-inverso tabular-nums sm:text-h1">
                  {opcion.cifra}
                </span>
                <span className="text-body text-inverso-60">por mes</span>
              </p>

              {opcion.detalle && (
                <p className="mt-2 text-body text-inverso-60 tabular-nums">
                  {opcion.detalle}
                </p>
              )}

              <p className="mt-2 text-ui text-inverso-40">
                Ajuste trimestral según IPC.
              </p>
            </div>
          );
        })}
      </div>
    </div>
  );
}

"use client";

import { useId, useState } from "react";
import { IconoIncluido } from "@/components/iconos";
import { CTA_WHATSAPP } from "@/lib/landing";
import { PLANES, pesos, type PlanLanding } from "@/lib/planes-landing";

// 09 · Las tres tarjetas y el control mensual/anual.
//
// ARRANCA EN MENSUAL, y es deliberado: si el diferencial es "sin
// permanencia", abrir en anual se contradice solo. El descuento se ofrece;
// no se usa para maquillar la entrada.
//
// EL ÚNICO BOTÓN ROJO DE LA SECCIÓN ES EL DE PRO. Basic y Ultra van con
// botón de contorno. Los tres llevan al MISMO WhatsApp —no son tres
// acciones— pero visualmente hay una sola acción primaria, que es la regla
// de CLAUDE-landing. El grafito y el tamaño de la tarjeta de Pro alcanzan
// para marcar la recomendación: no hace falta ninguna flecha.
//
// El badge "3 meses gratis" va en ÁMBAR: es un incentivo, o sea un estado
// de la oferta, y el rojo en esta casa es solo acción.
//
// El control es un radiogroup nativo (fieldset + dos radios estirados sobre
// la pastilla, appearance-none) por lo mismo que el selector viejo: las
// flechas del teclado, el único tab stop y la semántica vienen gratis, y el
// :focus-visible global dibuja el foco alrededor de la pastilla entera.

type Modo = "mensual" | "anual";

function Renglon({ texto, oscuro }: { texto: string; oscuro: boolean }) {
  return (
    <li
      className={`flex items-start gap-2.5 py-[7px] text-body ${
        oscuro ? "text-inverso-60" : "text-ink-60"
      }`}
    >
      {/* El tilde en la escala de éxito, nunca en rojo: marca "incluido",
          que es un estado. Sobre grafito va en blanco. */}
      <IconoIncluido
        aria-hidden
        strokeWidth={2}
        className={`mt-[0.2em] size-[18px] shrink-0 ${
          oscuro ? "text-inverso" : "text-success"
        }`}
      />
      {texto}
    </li>
  );
}

function Tarjeta({ plan, modo }: { plan: PlanLanding; modo: Modo }) {
  const oscuro = plan.destacado;
  const anual = modo === "anual";

  return (
    <div
      className={`flex h-full flex-col rounded-lg p-7 sm:p-8 ${
        oscuro
          ? "bg-ink text-inverso shadow-lg lg:p-9"
          : "border border-line bg-base"
      }`}
    >
      {/* La fila del nombre. `min-h` fija para que las tres tarjetas
          arranquen el precio a la misma altura, tenga o no insignia. */}
      <div className="flex min-h-7 items-center gap-2.5">
        <h3
          className={`text-lead font-bold ${oscuro ? "text-inverso" : "text-ink"}`}
        >
          {plan.nombre}
        </h3>
        {plan.destacado && (
          <span className="rounded-full bg-base px-2.5 py-1 font-ui text-label font-semibold tracking-[0.06em] text-ink uppercase">
            Recomendado
          </span>
        )}
      </div>

      {/* ---------- El precio ----------
          Nunito Y tabular a la vez: es una cifra de marca, no un dato de
          tabla. El bloque tiene alto propio y los dos estados no se montan
          ni desmontan: cambia el texto, no la caja, así la tarjeta no pega
          un salto al tocar el control. */}
      <p className="mt-5 flex flex-wrap items-baseline gap-x-2">
        <span
          className={`font-bold tabular-nums ${
            oscuro ? "text-h1 text-inverso" : "text-h2 text-ink"
          }`}
        >
          {pesos(anual ? plan.anualPorMes : plan.mensual)}
        </span>
        <span
          className={`font-ui text-ui font-semibold ${
            oscuro ? "text-inverso-40" : "text-ink-40"
          }`}
        >
          por mes
        </span>
      </p>

      <p
        className={`mt-2.5 min-h-10 text-ui ${
          oscuro ? "text-inverso-60" : "text-ink-40"
        }`}
      >
        {anual ? (
          <span className="tabular-nums">
            <b className={oscuro ? "text-inverso" : "text-ink-60"}>
              {pesos(plan.anual)} al año.
            </b>{" "}
            Pagás 9 meses, usás 12.
          </span>
        ) : (
          plan.paraQuien
        )}
      </p>

      <div
        className={`my-6 h-px ${oscuro ? "bg-inverso-line" : "bg-line"}`}
        aria-hidden
      />

      <p
        className={`mb-3 font-ui text-label font-semibold tracking-[0.06em] uppercase ${
          oscuro ? "text-inverso-40" : "text-ink-40"
        }`}
      >
        {plan.encabezadoLista}
      </p>

      {/* `flex-1` empuja el botón al pie: las tres tarjetas terminan con el
          botón alineado aunque las listas midan distinto. */}
      <ul className="mb-7 flex flex-1 flex-col">
        {plan.incluye.map((item) => (
          <Renglon key={item} texto={item} oscuro={oscuro} />
        ))}
      </ul>

      <a
        href={CTA_WHATSAPP}
        target="_blank"
        rel="noopener noreferrer"
        className={`block min-h-13 content-center rounded-md px-4 text-center font-ui text-ui font-semibold transition-colors ${
          plan.destacado
            ? "bg-brand text-white hover:bg-brand-deep"
            : "border border-line bg-base text-ink hover:border-ink-40"
        }`}
      >
        {plan.cta}
      </a>
    </div>
  );
}

export function TarjetasPlanes() {
  const [modo, setModo] = useState<Modo>("mensual");
  const grupo = useId();

  return (
    <div>
      {/* ---------- El control ---------- */}
      <div className="flex justify-center">
        <fieldset className="inline-flex rounded-full border border-line bg-surface p-1">
          <legend className="sr-only">Cómo querés pagar</legend>
          {(
            [
              ["mensual", "Mensual", null],
              ["anual", "Anual", "3 meses gratis"],
            ] as const
          ).map(([valor, etiqueta, badge]) => {
            const activo = modo === valor;
            return (
              <label
                key={valor}
                className={`relative flex min-h-11 cursor-pointer items-center gap-2 rounded-full px-5 font-ui text-ui font-semibold transition-colors ${
                  activo
                    ? "bg-base text-ink shadow-sm"
                    : "text-ink-40 hover:text-ink-60"
                }`}
              >
                <input
                  type="radio"
                  name={grupo}
                  value={valor}
                  checked={activo}
                  onChange={() => setModo(valor)}
                  className="absolute inset-0 cursor-pointer appearance-none rounded-full"
                />
                {etiqueta}
                {badge && (
                  // Ámbar OSCURO y no #D97706: sobre el fondo suave, el
                  // urgente da 3.0:1 y esto es texto de 12px. El overdue
                  // llega a 4.75:1 y sigue siendo la misma escala.
                  <span className="rounded-full bg-urgente-soft px-2 py-0.5 text-label font-semibold text-overdue">
                    {badge}
                  </span>
                )}
              </label>
            );
          })}
        </fieldset>
      </div>

      <p className="mt-3.5 text-center text-ui text-ink-40">
        Sin permanencia · Ajuste trimestral según IPC
      </p>

      {/* ---------- Las tres tarjetas ----------
          Pro va un poco más ancha (1.08fr en el boceto) y con más padding:
          la jerarquía la da el grafito y el tamaño, no un contorno rojo.
          En mobile se apilan y Pro queda primera por peso visual, no por
          orden del DOM: el orden de lectura sigue siendo Basic → Pro →
          Ultra, que es el de precio creciente. */}
      <div className="mt-(--espacio-lead) grid items-stretch gap-4 lg:grid-cols-[1fr_1.08fr_1fr] lg:gap-5">
        {PLANES.map((plan) => (
          <Tarjeta key={plan.clave} plan={plan} modo={modo} />
        ))}
      </div>
    </div>
  );
}

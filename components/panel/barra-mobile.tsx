"use client";

import { ToggleTema } from "@/components/tema/toggle-tema";
import type { TemaPanel } from "@/lib/tema-panel";
import { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  IconoInicio,
  IconoReloj,
  IconoClientes,
  IconoPlus,
  IconoMas,
  IconoCandado,
  IconoTrabajos,
  IconoCaja,
  IconoPremio,
  IconoPresupuesto,
  IconoDiseno,
  IconoMensajes,
  IconoNeumatico,
  IconoLubricentro,
  IconoCuenta,
  IconoQR,
  IconoAyuda,
  IconoWhatsapp,
  IconoSalir,
} from "@/components/iconos";
import { urlWhatsappSoporte } from "@/lib/config";
import { MOTIVO_SUSPENSION } from "@/components/panel/aviso-suspension";
import { motivoBloqueo } from "@/components/panel/bloqueo-onboarding";
import { ItemBloqueado } from "@/components/panel/item-bloqueado";
import type { FeaturePlan } from "@/lib/planes";

// Secciones que no entran en la barra: viven en la hoja "Más", en el
// mismo orden y CON LOS MISMOS ÍCONOS que el sidebar (desde el 30/10/2026:
// antes eran texto pelado, y faltaba Neumáticos). `feature` = qué tiene que
// habilitar el plan para que el item exista. "Ayuda" va al final, y es la
// única que no lleva candado con el onboarding a medias.
const SECCIONES_MAS: {
  href: string;
  nombre: string;
  feature?: FeaturePlan;
  Icono: typeof IconoInicio;
}[] = [
  { href: "/panel/services", nombre: "Trabajos", Icono: IconoTrabajos },
  { href: "/panel/productos", nombre: "Productos", Icono: IconoCaja },
  { href: "/panel/fidelizacion", nombre: "Fidelización", feature: "premios", Icono: IconoPremio },
  { href: "/panel/presupuestos", nombre: "Presupuestos", feature: "presupuestos", Icono: IconoPresupuesto },
  { href: "/panel/experiencia", nombre: "Diseño de experiencia", feature: "personalizacion_pagina", Icono: IconoDiseno },
  { href: "/panel/mensajes", nombre: "Mensajes", Icono: IconoMensajes },
  // Los intervalos del módulo de gomería: estaba en el sidebar y no acá.
  { href: "/panel/neumaticos", nombre: "Neumáticos", feature: "neumaticos", Icono: IconoNeumatico },
  { href: "/panel/sucursales", nombre: "Sucursales", Icono: IconoLubricentro },
  { href: "/panel/cuenta", nombre: "Mi cuenta", Icono: IconoCuenta },
  // Pedir calcos vive adentro de Mi cuenta; en el celular tiene su entrada
  // propia para no obligar a dos toques y un scroll.
  { href: "/panel/cuenta/calcos", nombre: "Calcos", Icono: IconoQR },
  { href: "/panel/ayuda", nombre: "Ayuda", Icono: IconoAyuda },
];

// Un acceso de la hoja: ícono + nombre, media hoja de ancho, 48 px o lo
// que pida el nombre en dos líneas («Diseño de experiencia», «Ayuda por
// WhatsApp»): nunca se corta con puntos suspensivos.
const CLASE_ACCESO =
  "flex min-h-12 items-center gap-2.5 rounded-md px-3 py-2 text-ui leading-tight transition-colors";

const SIEMPRE_ABIERTAS = new Set(["/panel/ayuda"]);

// Cada pestaña mide 64 px de alto: el ícono (24 px) va adentro de una
// píldora de 56 × 32 que se pinta cuando la sección está abierta —la
// marca que el ojo busca— y el nombre debajo. Antes la barra medía 56 px
// con íconos de 20 y sin ningún indicador: fina, pegada al fondo y, en
// oscuro, difícil de distinguir de la página (30/10/2026).
const CLASE_ITEM_BARRA =
  "flex h-16 flex-col items-center justify-center gap-0.5 pt-1";
const CLASE_PILDORA =
  "relative flex h-8 w-14 items-center justify-center rounded-full transition-colors";

function ItemBarra({
  href,
  nombre,
  activo,
  icono,
  badge,
  indice,
  desbloqueando,
}: {
  href: string;
  nombre: string;
  activo: boolean;
  icono: React.ReactNode;
  /** El círculo de pendientes, flotando sobre el ícono como en WhatsApp. */
  badge?: React.ReactNode;
  /** Su lugar en el orden del desbloqueo de la bienvenida. */
  indice: number;
  desbloqueando: boolean;
}) {
  return (
    <Link
      href={href}
      aria-current={activo ? "page" : undefined}
      className={`${CLASE_ITEM_BARRA} ${activo ? "font-semibold text-ink" : "text-ink-60"} ${
        desbloqueando ? "nav-desbloqueo" : ""
      }`}
      style={desbloqueando ? ({ "--i": indice } as React.CSSProperties) : undefined}
    >
      <span className={`${CLASE_PILDORA} ${activo ? "bg-line" : ""}`}>
        {icono}
        {badge && (
          <span className="absolute -top-1 right-2">
            {badge}
          </span>
        )}
        {desbloqueando && (
          <span
            aria-hidden
            className="candado-nav absolute -top-0.5 right-2 flex overflow-hidden"
          >
            <IconoCandado className="size-3.5 shrink-0" />
          </span>
        )}
      </span>
      <span className="text-label">{nombre}</span>
    </Link>
  );
}

// El mismo ítem, con candado: mientras el onboarding no terminó, o con la
// carga de trabajos apagada por la suspensión.
function ItemBarraBloqueado({
  nombre,
  icono,
  motivo,
}: {
  nombre: string;
  icono: React.ReactNode;
  motivo: string;
}) {
  return (
    <ItemBloqueado
      motivo={motivo}
      posicion="arriba"
      className={`${CLASE_ITEM_BARRA} text-ink-40`}
    >
      <span className={CLASE_PILDORA}>
        {icono}
        <span className="absolute -top-0.5 right-2 flex">
          <IconoCandado className="size-3.5" />
        </span>
      </span>
      <span className="text-label">{nombre}</span>
    </ItemBloqueado>
  );
}

export function BarraMobile({
  tema,
  cerrarSesion,
  suspendido = false,
  motivoSuspension = MOTIVO_SUSPENSION,
  features = {},
  badgePorLlamar,
  bloqueado = false,
  pasosOnboarding = 3,
  desbloqueando = false,
}: {
  tema: TemaPanel;
  cerrarSesion: () => Promise<void>;
  suspendido?: boolean;
  /** Por qué está suspendido, con la salida que corresponde (WhatsApp o
   *  Pagar). Lo elige el layout, que sabe si fue a mano o por reloj. */
  motivoSuspension?: string;
  features?: Partial<Record<FeaturePlan, boolean>>;
  /** El círculo de "A quién llamar", con su propio Suspense: llega
   *  después que la pantalla (components/panel/por-llamar.tsx). */
  badgePorLlamar?: React.ReactNode;
  /** El onboarding no terminó: todo con candado salvo Ayuda. */
  bloqueado?: boolean;
  pasosOnboarding?: number;
  /** La bienvenida está en pantalla: los ítems se desbloquean en orden. */
  desbloqueando?: boolean;
}) {
  const pathname = usePathname();
  const [abierta, setAbierta] = useState(false);
  // La hoja se va con la misma animación con la que llegó, al revés: se
  // marca `cerrando`, corre la salida y recién al terminar se desmonta
  // (onAnimationEnd; con reduced-motion dura 0,01 ms y es inmediato).
  const [cerrando, setCerrando] = useState(false);
  const cerrar = () => setCerrando(true);
  const secciones = SECCIONES_MAS.filter(
    (s) => !s.feature || features[s.feature],
  );
  const motivo = motivoBloqueo(pasosOnboarding);

  // La hoja se cierra con Escape; al navegar la cierra el onClick de cada link.
  useEffect(() => {
    if (!abierta) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setCerrando(true);
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [abierta]);

  const enMas = secciones.some((s) => pathname.startsWith(s.href));

  const principales = [
    { href: "/panel", nombre: "Inicio", activo: pathname === "/panel", icono: <IconoInicio className="size-6" /> },
    // Forma corta de "A quién llamar", que es como se llama la pantalla y
    // como figura en el sidebar: entero no entra en una pestaña de 75px
    // sin partirse en dos renglones.
    {
      href: "/panel/proximos",
      nombre: "Llamar",
      activo: pathname.startsWith("/panel/proximos"),
      icono: <IconoReloj className="size-6" />,
      badge: badgePorLlamar,
    },
    { href: "/panel/clientes", nombre: "Clientes", activo: pathname.startsWith("/panel/clientes"), icono: <IconoClientes className="size-6" /> },
  ];

  return (
    <>
      <nav
        aria-label="Navegación principal"
        // print:hidden porque lg:hidden no alcanza: al imprimir, el viewport
        // es el ancho del PAPEL (una A4 vertical mide ~794px), no el de la
        // pantalla — y una barra fixed se repite al pie de cada hoja.
        // Con presencia: 64 px, borde arriba y una sombra hacia arriba en
        // claro; en oscuro el fondo es `surface` (#1D1D1D), un escalón más
        // claro que la página (#0A0A0A) y que las tarjetas (#141414), para
        // que se lea como barra y no como fondo. En tablet las cinco
        // pestañas se agrupan en 448 px al centro: desparramadas a 160 px
        // una de otra, el pulgar no encuentra nada.
        className="fixed inset-x-0 bottom-0 z-40 border-t border-line bg-base pb-[env(safe-area-inset-bottom)] shadow-[0_-8px_24px_-12px_rgba(10,10,10,0.18)] oscuro:bg-surface oscuro:shadow-none lg:hidden print:hidden"
      >
        <div className="mx-auto grid max-w-md grid-cols-5">
        {principales.map((item, i) =>
          bloqueado ? (
            <ItemBarraBloqueado key={item.href} nombre={item.nombre} icono={item.icono} motivo={motivo} />
          ) : (
            <ItemBarra
              key={item.href}
              href={item.href}
              nombre={item.nombre}
              activo={item.activo}
              icono={item.icono}
              badge={item.badge}
              indice={i}
              desbloqueando={desbloqueando}
            />
          ),
        )}

        {/* La acción primaria del mecánico, destacada: rojo = acción.
            Suspendido o con el onboarding a medias deja de ser un enlace:
            se apaga y dice por qué. */}
        {suspendido || bloqueado ? (
          <ItemBloqueado
            motivo={suspendido ? motivoSuspension : motivo}
            posicion="arriba"
            className={`${CLASE_ITEM_BARRA} text-ink-40`}
          >
            <span className="-mt-6 flex size-13 items-center justify-center rounded-full bg-line text-ink-40 shadow-md ring-4 ring-base oscuro:ring-surface">
              <IconoCandado className="size-6" />
            </span>
            <span className="text-label">Trabajo</span>
          </ItemBloqueado>
        ) : (
          <Link
            href="/panel/services/nuevo"
            className={`${CLASE_ITEM_BARRA} text-ink-60`}
          >
            {/* La acción primaria, más grande que todo lo demás (52 px) y
                levantada sobre la barra, con un anillo del color de la
                barra que la despega: rojo = acción, y es la única. */}
            <span className="-mt-6 flex size-13 items-center justify-center rounded-full bg-brand text-white shadow-md ring-4 ring-base oscuro:ring-surface">
              <IconoPlus className="size-6" />
            </span>
            <span className="text-label">Trabajo</span>
          </Link>
        )}
        <button
          type="button"
          onClick={() => setAbierta(true)}
          aria-expanded={abierta}
          className={`${CLASE_ITEM_BARRA} ${
            enMas || abierta ? "font-semibold text-ink" : "text-ink-60"
          }`}
        >
          <span className={`${CLASE_PILDORA} ${enMas || abierta ? "bg-line" : ""}`}>
            <IconoMas className="size-6" />
          </span>
          <span className="text-label">Más</span>
        </button>
        </div>
      </nav>

      {abierta && (
        <div
          className="fixed inset-0 z-50 lg:hidden print:hidden"
          role="dialog"
          aria-modal="true"
          aria-label="Más secciones"
        >
          <button
            type="button"
            aria-label="Cerrar"
            onClick={cerrar}
            className={`absolute inset-0 bg-velo ${cerrando ? "animar-velo-sale" : "animar-velo-entra"}`}
          />
          {/* LA HOJA (30/10/2026): una grilla de dos columnas con ícono y
              nombre, en vez de diez renglones de texto que llenaban la
              pantalla. Son las mismas secciones y los mismos íconos que el
              sidebar; la que está abierta se marca. Abajo, el modo oscuro y
              las dos salidas —ayuda por WhatsApp y cerrar sesión— en una
              fila. Los enlaces legales viven en Mi cuenta. */}
          <div
            className={`absolute inset-x-0 bottom-0 max-h-[88dvh] overflow-y-auto rounded-t-lg bg-base px-4 pt-2 pb-[max(1rem,env(safe-area-inset-bottom))] shadow-lg ${
              cerrando ? "animar-hoja-sale" : "animar-hoja-entra"
            }`}
            onAnimationEnd={() => {
              if (cerrando) {
                setAbierta(false);
                setCerrando(false);
              }
            }}
          >
            <span aria-hidden className="mx-auto mb-3 block h-1 w-9 rounded-full bg-line" />
            <nav aria-label="Secciones" className="grid grid-cols-2 gap-2">
              {secciones.map((s) => {
                const activa = pathname.startsWith(s.href);
                return bloqueado && !SIEMPRE_ABIERTAS.has(s.href) ? (
                  <ItemBloqueado
                    key={s.href}
                    motivo={motivo}
                    className={`${CLASE_ACCESO} bg-surface/60 text-ink-40`}
                  >
                    <s.Icono aria-hidden className="size-5 shrink-0" />
                    <span className="min-w-0">{s.nombre}</span>
                    <IconoCandado aria-hidden className="ml-auto size-4 shrink-0" />
                  </ItemBloqueado>
                ) : (
                  <Link
                    key={s.href}
                    href={s.href}
                    onClick={cerrar}
                    aria-current={activa ? "page" : undefined}
                    className={`${CLASE_ACCESO} ${
                      activa ? "bg-surface font-semibold text-ink" : "bg-surface/60 text-ink hover:bg-surface"
                    }`}
                  >
                    <s.Icono aria-hidden className="size-5 shrink-0" />
                    <span className="min-w-0">{s.nombre}</span>
                  </Link>
                );
              })}
            </nav>
            <div className="mt-3 border-t border-line pt-3">
              <ToggleTema tema={tema} />
              <div className="mt-1 grid grid-cols-2 gap-2">
                <a
                  href={urlWhatsappSoporte()}
                  target="_blank"
                  rel="noopener noreferrer"
                  className={`${CLASE_ACCESO} bg-surface/60 text-ink-60 hover:bg-surface hover:text-ink`}
                >
                  <IconoWhatsapp aria-hidden className="size-5 shrink-0" />
                  <span className="min-w-0">Ayuda por WhatsApp</span>
                </a>
                <form action={cerrarSesion} className="contents">
                  <button
                    type="submit"
                    className={`${CLASE_ACCESO} bg-surface/60 text-left text-ink-60 hover:bg-surface hover:text-ink`}
                  >
                    <IconoSalir aria-hidden className="size-5 shrink-0" />
                    <span className="min-w-0">Cerrar sesión</span>
                  </button>
                </form>
              </div>
            </div>
          </div>
        </div>
      )}
    </>
  );
}

"use client";

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
} from "@/components/iconos";
import { urlWhatsappSoporte } from "@/lib/config";
import { MOTIVO_SUSPENSION } from "@/components/panel/aviso-suspension";
import { motivoBloqueo } from "@/components/panel/bloqueo-onboarding";
import { ItemBloqueado } from "@/components/panel/item-bloqueado";
import type { FeaturePlan } from "@/lib/planes";
import { BadgePorLlamar } from "@/components/panel/badge-por-llamar";

// Secciones que no entran en la barra: viven en la hoja "Más". `feature` =
// qué tiene que habilitar el plan para que el item exista. "Ayuda" va al
// final, y es la única que no lleva candado con el onboarding a medias.
const SECCIONES_MAS: { href: string; nombre: string; feature?: FeaturePlan }[] = [
  { href: "/panel/services", nombre: "Trabajos" },
  { href: "/panel/productos", nombre: "Productos" },
  { href: "/panel/fidelizacion", nombre: "Fidelización", feature: "premios" },
  { href: "/panel/presupuestos", nombre: "Presupuestos", feature: "presupuestos" },
  { href: "/panel/experiencia", nombre: "Diseño de experiencia", feature: "personalizacion_pagina" },
  { href: "/panel/mensajes", nombre: "Mensajes" },
  { href: "/panel/sucursales", nombre: "Sucursales" },
  { href: "/panel/cuenta", nombre: "Mi cuenta" },
  { href: "/panel/ayuda", nombre: "Ayuda" },
];

const SIEMPRE_ABIERTAS = new Set(["/panel/ayuda"]);

const CLASE_ITEM_BARRA =
  "flex min-h-11 flex-col items-center justify-center gap-0.5";

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
      <span className="relative">
        {icono}
        {badge && (
          <span className="absolute -top-1.5 left-full -translate-x-2">
            {badge}
          </span>
        )}
        {desbloqueando && (
          <span
            aria-hidden
            className="candado-nav absolute -top-1 left-full flex overflow-hidden"
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
      <span className="relative">
        {icono}
        <span className="absolute -top-1 left-full flex">
          <IconoCandado className="size-3.5" />
        </span>
      </span>
      <span className="text-label">{nombre}</span>
    </ItemBloqueado>
  );
}

export function BarraMobile({
  cerrarSesion,
  suspendido = false,
  features = {},
  porLlamar = 0,
  bloqueado = false,
  pasosOnboarding = 3,
  desbloqueando = false,
}: {
  cerrarSesion: () => Promise<void>;
  suspendido?: boolean;
  features?: Partial<Record<FeaturePlan, boolean>>;
  /** Contactos sin hacer en "A quién llamar" — pinta el círculo. */
  porLlamar?: number;
  /** El onboarding no terminó: todo con candado salvo Ayuda. */
  bloqueado?: boolean;
  pasosOnboarding?: number;
  /** La bienvenida está en pantalla: los ítems se desbloquean en orden. */
  desbloqueando?: boolean;
}) {
  const pathname = usePathname();
  const [abierta, setAbierta] = useState(false);
  const secciones = SECCIONES_MAS.filter(
    (s) => !s.feature || features[s.feature],
  );
  const motivo = motivoBloqueo(pasosOnboarding);

  // La hoja se cierra con Escape; al navegar la cierra el onClick de cada link.
  useEffect(() => {
    if (!abierta) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setAbierta(false);
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [abierta]);

  const enMas = secciones.some((s) => pathname.startsWith(s.href));

  const principales = [
    { href: "/panel", nombre: "Inicio", activo: pathname === "/panel", icono: <IconoInicio className="size-5" /> },
    // Forma corta de "A quién llamar", que es como se llama la pantalla y
    // como figura en el sidebar: entero no entra en una pestaña de 75px
    // sin partirse en dos renglones.
    {
      href: "/panel/proximos",
      nombre: "Llamar",
      activo: pathname.startsWith("/panel/proximos"),
      icono: <IconoReloj className="size-5" />,
      badge: <BadgePorLlamar cantidad={porLlamar} />,
    },
    { href: "/panel/clientes", nombre: "Clientes", activo: pathname.startsWith("/panel/clientes"), icono: <IconoClientes className="size-5" /> },
  ];

  return (
    <>
      <nav
        aria-label="Navegación principal"
        // print:hidden porque lg:hidden no alcanza: al imprimir, el viewport
        // es el ancho del PAPEL (una A4 vertical mide ~794px), no el de la
        // pantalla — y una barra fixed se repite al pie de cada hoja.
        className="fixed inset-x-0 bottom-0 z-40 grid grid-cols-5 border-t border-line bg-base pb-[env(safe-area-inset-bottom)] lg:hidden print:hidden"
      >
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
            motivo={suspendido ? MOTIVO_SUSPENSION : motivo}
            posicion="arriba"
            className={`${CLASE_ITEM_BARRA} text-ink-40`}
          >
            <span className="flex size-9 -mt-4 items-center justify-center rounded-full bg-line text-ink-40 shadow-md">
              <IconoCandado className="size-5" />
            </span>
            <span className="text-label">Trabajo</span>
          </ItemBloqueado>
        ) : (
          <Link
            href="/panel/services/nuevo"
            className={`${CLASE_ITEM_BARRA} text-ink-60`}
          >
            <span className="flex size-9 -mt-4 items-center justify-center rounded-full bg-brand text-white shadow-md">
              <IconoPlus className="size-5" />
            </span>
            <span className="text-label">Trabajo</span>
          </Link>
        )}
        <button
          type="button"
          onClick={() => setAbierta(true)}
          aria-expanded={abierta}
          className={`${CLASE_ITEM_BARRA} ${
            enMas ? "font-semibold text-ink" : "text-ink-60"
          }`}
        >
          <IconoMas className="size-5" />
          <span className="text-label">Más</span>
        </button>
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
            onClick={() => setAbierta(false)}
            className="absolute inset-0 bg-ink/40"
          />
          <div className="absolute inset-x-0 bottom-0 rounded-t-lg bg-base p-4 pb-[max(1rem,env(safe-area-inset-bottom))]">
            <nav className="flex flex-col">
              {secciones.map((s) =>
                bloqueado && !SIEMPRE_ABIERTAS.has(s.href) ? (
                  <ItemBloqueado
                    key={s.href}
                    motivo={motivo}
                    className="flex h-11 items-center rounded-md px-3 text-body text-ink-40"
                  >
                    {s.nombre}
                    <IconoCandado aria-hidden className="ml-auto size-4" />
                  </ItemBloqueado>
                ) : (
                  <Link
                    key={s.href}
                    href={s.href}
                    onClick={() => setAbierta(false)}
                    className="flex h-11 items-center rounded-md px-3 text-body text-ink hover:bg-surface"
                  >
                    {s.nombre}
                  </Link>
                ),
              )}
            </nav>
            <div className="mt-2 border-t border-line pt-2">
              <a
                href={urlWhatsappSoporte()}
                target="_blank"
                rel="noopener noreferrer"
                className="flex h-11 items-center rounded-md px-3 text-body text-ink-60 hover:bg-surface"
              >
                Ayuda por WhatsApp
              </a>
              <form action={cerrarSesion}>
                <button
                  type="submit"
                  className="flex h-11 w-full items-center rounded-md px-3 text-left text-body text-ink-60 hover:bg-surface"
                >
                  Cerrar sesión
                </button>
              </form>
            </div>
          </div>
        </div>
      )}
    </>
  );
}

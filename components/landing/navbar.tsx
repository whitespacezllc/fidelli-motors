"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Logo } from "@/components/marca/logo";
import { IconoCerrar } from "@/components/iconos";
import { CTA_WHATSAPP, LINKS_NAVBAR } from "@/lib/landing";

// 01 · Navbar — no estorbar y tener el CTA siempre a mano.
//
// Desktop 64px: logo · links · CTA. Mobile 56px: logo + hamburguesa.
//
// El CTA NO va en el menú de mobile: va en la barra fija al pie, visible
// durante toda la página. Esconder la única acción de la página detrás de
// un toque de más es exactamente lo que no hay que hacer.
//
// Es cliente por dos cosas chicas y ninguna toca la sesión: el borde que
// aparece al scrollear y el menú. La página sigue siendo estática.
export function Navbar() {
  const [scrolleado, setScrolleado] = useState(false);
  const [menuAbierto, setMenuAbierto] = useState(false);

  useEffect(() => {
    const alScrollear = () => setScrolleado(window.scrollY > 8);
    alScrollear();
    window.addEventListener("scroll", alScrollear, { passive: true });
    return () => window.removeEventListener("scroll", alScrollear);
  }, []);

  // Con el menú abierto el fondo no scrollea: el panel ocupa la pantalla.
  useEffect(() => {
    document.body.style.overflow = menuAbierto ? "hidden" : "";
    return () => {
      document.body.style.overflow = "";
    };
  }, [menuAbierto]);

  // Escape cierra, como cualquier capa modal.
  useEffect(() => {
    if (!menuAbierto) return;
    const alTeclear = (e: KeyboardEvent) => {
      if (e.key === "Escape") setMenuAbierto(false);
    };
    window.addEventListener("keydown", alTeclear);
    return () => window.removeEventListener("keydown", alTeclear);
  }, [menuAbierto]);

  return (
    <>
      <header
      className={`sticky top-0 z-40 bg-base/85 backdrop-blur-md transition-colors ${
        scrolleado ? "border-b border-line" : "border-b border-transparent"
      }`}
    >
      <nav
        aria-label="Principal"
        className="mx-auto flex h-14 w-full max-w-6xl items-center gap-4 px-5 sm:h-16 sm:px-8"
      >
        <Link href="/" aria-label="Fidelli Motors — inicio" className="shrink-0">
          <Logo className="h-5 w-auto sm:h-6" priority />
        </Link>

        {/* ---------- Desktop: tres links, "Ingresar" y el CTA ---------- */}
        <ul className="ml-auto hidden items-center gap-7 sm:flex">
          {LINKS_NAVBAR.map((l) => (
            <li key={l.href}>
              <Link
                href={l.href}
                className="text-ui text-ink-60 transition-colors hover:text-ink"
              >
                {l.texto}
              </Link>
            </li>
          ))}
          <li>
            {/* Enlace de texto, nunca botón: no compite con la conversión.
                Va siempre a /login, que ya redirige al panel si hay sesión. */}
            <Link
              href="/login"
              className="text-ui text-ink-60 underline underline-offset-4 transition-colors hover:text-ink"
            >
              Ingresar
            </Link>
          </li>
        </ul>

        <a
          href={CTA_WHATSAPP}
          target="_blank"
          rel="noopener noreferrer"
          className="hidden h-11 items-center rounded-md bg-brand px-4 font-bold text-ui text-white transition-colors hover:bg-brand-deep sm:inline-flex"
        >
          Quiero mi lugar
        </a>

        {/* ---------- Mobile: la hamburguesa ---------- */}
        <button
          type="button"
          onClick={() => setMenuAbierto(true)}
          aria-label="Abrir el menú"
          aria-expanded={menuAbierto}
          className="ml-auto flex size-11 items-center justify-center sm:hidden"
        >
          <span aria-hidden className="flex w-6 flex-col gap-[5px]">
            <span className="h-0.5 w-full rounded-sm bg-ink" />
            <span className="h-0.5 w-full rounded-sm bg-ink" />
            <span className="h-0.5 w-full rounded-sm bg-ink" />
          </span>
        </button>
      </nav>
      </header>

      {/* El menú va FUERA del <header>, y no es un detalle de orden.
          `backdrop-blur` crea un containing block para los hijos `fixed`:
          adentro del header, este panel se posicionaba contra esos 56px de
          alto en vez de contra el viewport, y quedaba recortado y
          traslúcido. Como hermano, `inset-0` vuelve a ser la pantalla.

          El CTA no está acá a propósito — vive en la barra fija al pie. */}
      {menuAbierto && (
        <div className="fixed inset-0 z-50 overflow-y-auto bg-base pb-24 sm:hidden">
          <div className="flex h-14 items-center justify-between px-5">
            <Logo className="h-5 w-auto" />
            <button
              type="button"
              onClick={() => setMenuAbierto(false)}
              aria-label="Cerrar el menú"
              className="flex size-11 items-center justify-center"
            >
              <IconoCerrar aria-hidden className="size-6 text-ink" />
            </button>
          </div>

          <ul className="flex flex-col px-5 pt-4">
            {LINKS_NAVBAR.map((l) => (
              <li key={l.href} className="border-b border-line">
                <Link
                  href={l.href}
                  onClick={() => setMenuAbierto(false)}
                  className="flex min-h-14 items-center text-lead text-ink"
                >
                  {l.texto}
                </Link>
              </li>
            ))}
            <li>
              <Link
                href="/login"
                onClick={() => setMenuAbierto(false)}
                className="flex min-h-14 items-center text-lead text-ink-60 underline underline-offset-4"
              >
                Ingresar
              </Link>
            </li>
          </ul>
        </div>
      )}
    </>
  );
}

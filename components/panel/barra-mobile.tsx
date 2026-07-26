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

// Secciones que no entran en la barra: viven en la hoja "Más".
const SECCIONES_MAS = [
  { href: "/panel/services", nombre: "Services" },
  { href: "/panel/productos", nombre: "Productos" },
  { href: "/panel/fidelizacion", nombre: "Fidelización" },
  { href: "/panel/experiencia", nombre: "Diseño de experiencia" },
  { href: "/panel/mensajes", nombre: "Mensajes" },
  { href: "/panel/sucursales", nombre: "Sucursales" },
  { href: "/panel/cuenta", nombre: "Mi cuenta" },
];

function ItemBarra({
  href,
  nombre,
  activo,
  icono,
}: {
  href: string;
  nombre: string;
  activo: boolean;
  icono: React.ReactNode;
}) {
  return (
    <Link
      href={href}
      aria-current={activo ? "page" : undefined}
      className={`flex min-h-11 flex-col items-center justify-center gap-0.5 ${
        activo ? "font-semibold text-ink" : "text-ink-60"
      }`}
    >
      {icono}
      <span className="text-label">{nombre}</span>
    </Link>
  );
}

export function BarraMobile({
  cerrarSesion,
  suspendido = false,
}: {
  cerrarSesion: () => Promise<void>;
  suspendido?: boolean;
}) {
  const pathname = usePathname();
  const [abierta, setAbierta] = useState(false);

  // La hoja se cierra con Escape; al navegar la cierra el onClick de cada link.
  useEffect(() => {
    if (!abierta) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setAbierta(false);
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [abierta]);

  const enMas = SECCIONES_MAS.some((s) => pathname.startsWith(s.href));

  return (
    <>
      <nav
        aria-label="Navegación principal"
        className="fixed inset-x-0 bottom-0 z-40 grid grid-cols-5 border-t border-line bg-base pb-[env(safe-area-inset-bottom)] lg:hidden"
      >
        <ItemBarra
          href="/panel"
          nombre="Inicio"
          activo={pathname === "/panel"}
          icono={<IconoInicio className="size-5" />}
        />
        <ItemBarra
          href="/panel/proximos"
          nombre="Próximos"
          activo={pathname.startsWith("/panel/proximos")}
          icono={<IconoReloj className="size-5" />}
        />
        <ItemBarra
          href="/panel/clientes"
          nombre="Clientes"
          activo={pathname.startsWith("/panel/clientes")}
          icono={<IconoClientes className="size-5" />}
        />
        {/* La acción primaria del mecánico, destacada: rojo = acción.
            Suspendido deja de ser un enlace: se apaga y dice por qué. */}
        {suspendido ? (
          <span
            aria-disabled="true"
            title={MOTIVO_SUSPENSION}
            className="flex min-h-11 flex-col items-center justify-center gap-0.5 text-ink-40"
          >
            <span className="flex size-9 -mt-4 items-center justify-center rounded-full bg-line text-ink-40 shadow-md">
              <IconoCandado className="size-5" />
            </span>
            <span className="text-label">Service</span>
          </span>
        ) : (
          <Link
            href="/panel/services/nuevo"
            className="flex min-h-11 flex-col items-center justify-center gap-0.5 text-ink-60"
          >
            <span className="flex size-9 -mt-4 items-center justify-center rounded-full bg-brand text-white shadow-md">
              <IconoPlus className="size-5" />
            </span>
            <span className="text-label">Service</span>
          </Link>
        )}
        <button
          type="button"
          onClick={() => setAbierta(true)}
          aria-expanded={abierta}
          className={`flex min-h-11 flex-col items-center justify-center gap-0.5 ${
            enMas ? "font-semibold text-ink" : "text-ink-60"
          }`}
        >
          <IconoMas className="size-5" />
          <span className="text-label">Más</span>
        </button>
      </nav>

      {abierta && (
        <div
          className="fixed inset-0 z-50 lg:hidden"
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
              {SECCIONES_MAS.map((s) => (
                <Link
                  key={s.href}
                  href={s.href}
                  onClick={() => setAbierta(false)}
                  className="flex h-11 items-center rounded-md px-3 text-body text-ink hover:bg-surface"
                >
                  {s.nombre}
                </Link>
              ))}
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

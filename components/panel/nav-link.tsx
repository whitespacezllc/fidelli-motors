"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

// Link de navegación con estado activo por ruta. Las raíces de superficie
// ("/panel", "/fidelli") matchean exacto; el resto, por prefijo.
export function NavLink({
  href,
  exacto = false,
  className = "",
  claseActiva = "bg-surface font-semibold text-ink",
  claseInactiva = "text-ink-60 hover:bg-surface/60",
  children,
}: {
  href: string;
  exacto?: boolean;
  className?: string;
  claseActiva?: string;
  claseInactiva?: string;
  children: React.ReactNode;
}) {
  const pathname = usePathname();
  const activo = exacto ? pathname === href : pathname.startsWith(href);

  return (
    <Link
      href={href}
      aria-current={activo ? "page" : undefined}
      className={`${className} ${activo ? claseActiva : claseInactiva}`}
    >
      {children}
    </Link>
  );
}

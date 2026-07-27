import { exigirRol } from "@/lib/auth/session";
import { cerrarSesion } from "@/lib/auth/actions";
import { Wordmark } from "@/components/marca/wordmark";
import { NavLink } from "@/components/panel/nav-link";

// El panel de administración de Fidelli: barra superior en vez de sidebar —
// dos módulos no justifican uno (ver docs/Panel de Administración.html).
// Densidad alta: acá las filas van a 40px, no a 44.
export default async function LayoutFidelli({
  children,
}: {
  children: React.ReactNode;
}) {
  const sesion = await exigirRol("superadmin");

  return (
    <div className="min-h-dvh bg-surface/40">
      <header className="flex h-[54px] items-center gap-5 overflow-x-auto border-b border-line bg-base px-5">
        <div className="flex shrink-0 items-baseline gap-2">
          <Wordmark className="text-base text-ink" />
          <span className="text-ui text-ink-60">Administración</span>
        </div>

        <nav className="flex items-center gap-1" aria-label="Secciones">
          <NavLink
            href="/fidelli"
            exacto
            className="flex h-10 items-center rounded-md px-3 text-ui transition-colors"
          >
            Lubricentros
          </NavLink>
          <NavLink
            href="/fidelli/precios"
            className="flex h-10 items-center rounded-md px-3 text-ui transition-colors"
          >
            Plan y precios
          </NavLink>
          <NavLink
            href="/fidelli/cuenta"
            className="flex h-10 items-center rounded-md px-3 text-ui transition-colors"
          >
            Mi cuenta
          </NavLink>
        </nav>

        <div className="ml-auto flex shrink-0 items-center gap-4">
          <span className="text-ui text-ink-60">
            Sesión: <span className="font-semibold text-ink">{sesion.nombre}</span>
          </span>
          <form action={cerrarSesion}>
            <button
              type="submit"
              className="flex h-10 items-center rounded-md px-2 text-ui text-ink-60 hover:bg-surface"
            >
              Salir
            </button>
          </form>
        </div>
      </header>

      {/* Más ancho que el panel del lubri: la tabla de tenants tiene ocho
          columnas y la de atención necesita lugar para su acción. */}
      <main className="mx-auto max-w-[1400px] px-5 py-6">{children}</main>
    </div>
  );
}

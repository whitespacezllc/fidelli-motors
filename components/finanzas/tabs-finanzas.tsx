import Link from "next/link";

// Las dos vistas del módulo Finanzas: la caja del día y la cuenta
// corriente. Navegación con <Link> (no estado): cada una es su página.
// Mismas clases de pastilla que el resto del panel.
const TABS = [
  { href: "/panel/finanzas", clave: "dia", nombre: "El día" },
  { href: "/panel/finanzas/cuenta", clave: "cuenta", nombre: "Cuenta corriente" },
] as const;

export function TabsFinanzas({ activa }: { activa: "dia" | "cuenta" }) {
  return (
    <nav className="mb-4 flex flex-wrap gap-1" aria-label="Vistas de Finanzas">
      {TABS.map((t) => {
        const esActiva = t.clave === activa;
        return (
          <Link
            key={t.clave}
            href={t.href}
            aria-current={esActiva ? "page" : undefined}
            className={`flex h-9 items-center rounded-md px-3 font-ui text-ui font-semibold transition-colors ${
              esActiva
                ? "bg-ink text-base"
                : "border border-line bg-base text-ink-60 hover:bg-surface"
            }`}
          >
            {t.nombre}
          </Link>
        );
      })}
    </nav>
  );
}

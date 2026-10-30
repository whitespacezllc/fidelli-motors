import Link from "next/link";

// ============================================================
// Las cuatro solapas de Mi cuenta (30/10/2026)
//
// Mi cuenta era una columna de ocho bloques; a Santiago le parecía larga y
// desordenada. Son cuatro cosas distintas y ahora son cuatro solapas:
//
//   · Cuenta        · la persona: su nombre, su mail, el modo, la clave.
//   · Plan y pagos  · el contrato: el plan, la cuenta de cobro, los pagos.
//   · Tu negocio    · el taller: la marca, la página pública, la empresa.
//   · Calcos        · el calco, el stock y los pedidos (su propia ruta).
//
// Son LINKS, no estado de cliente: cada solapa es una URL que se comparte,
// se vuelve con «atrás» y se abre desde el mail de calcos. En el celular la
// barra se desplaza de costado si no entra.
// ============================================================
export type SolapaCuenta = "cuenta" | "plan" | "negocio" | "calcos";

export const SOLAPAS_CUENTA: readonly { clave: SolapaCuenta; nombre: string; href: string }[] = [
  { clave: "cuenta", nombre: "Cuenta", href: "/panel/cuenta" },
  { clave: "plan", nombre: "Plan y pagos", href: "/panel/cuenta?tab=plan" },
  { clave: "negocio", nombre: "Tu negocio", href: "/panel/cuenta?tab=negocio" },
  { clave: "calcos", nombre: "Calcos", href: "/panel/cuenta/calcos" },
];

export function esSolapaCuenta(v: unknown): v is SolapaCuenta {
  return typeof v === "string" && SOLAPAS_CUENTA.some((s) => s.clave === v);
}

export function SolapasCuenta({ activa }: { activa: SolapaCuenta }) {
  return (
    <nav aria-label="Secciones de Mi cuenta" className="-mx-4 overflow-x-auto px-4 sm:mx-0 sm:px-0">
      <ul className="flex min-w-max gap-1 border-b border-line">
        {SOLAPAS_CUENTA.map((s) => {
          const esta = s.clave === activa;
          return (
            <li key={s.clave}>
              <Link
                href={s.href}
                aria-current={esta ? "page" : undefined}
                className={`-mb-px flex h-11 items-center border-b-2 px-3 font-ui text-ui font-semibold whitespace-nowrap transition-colors ${
                  esta ? "border-ink text-ink" : "border-transparent text-ink-60 hover:text-ink"
                }`}
              >
                {s.nombre}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}

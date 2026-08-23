import Link from "next/link";
import { Logo } from "@/components/marca/logo";
import { NavLink } from "@/components/panel/nav-link";
import { IconoPlus, IconoCandado } from "@/components/iconos";
import { cerrarSesion } from "@/lib/auth/actions";
import { urlWhatsappSoporte } from "@/lib/config";
import { MOTIVO_SUSPENSION } from "@/components/panel/aviso-suspension";
import type { FeaturePlan } from "@/lib/planes";

// Los grupos y el orden vienen del hi-fi (pantalla 2 · Inicio — panel del lubri).
// `feature` = qué tiene que habilitar el plan para que el item exista. La
// resolución viene con la sesión (plan_capacidades); acá solo se filtra.
const GRUPOS: { titulo: string; items: { href: string; nombre: string; exacto?: boolean; feature?: FeaturePlan }[] }[] = [
  {
    titulo: "Operación",
    items: [
      { href: "/panel", nombre: "Inicio", exacto: true },
      { href: "/panel/proximos", nombre: "Próximos services" },
      { href: "/panel/clientes", nombre: "Clientes" },
      { href: "/panel/services", nombre: "Services" },
    ],
  },
  {
    titulo: "Negocio",
    items: [
      { href: "/panel/productos", nombre: "Productos" },
      { href: "/panel/fidelizacion", nombre: "Fidelización", feature: "premios" },
      { href: "/panel/presupuestos", nombre: "Presupuestos", feature: "presupuestos" },
    ],
  },
  {
    titulo: "Configuración",
    items: [
      // Sin feature a propósito (Bloque 7): la hoja de calcos QR vive en
      // esta pantalla y es de LOS TRES planes. Sin la feature, la pantalla
      // muestra el BloqueoPlan de personalización + los calcos igual.
      { href: "/panel/experiencia", nombre: "Diseño de experiencia" },
      { href: "/panel/mensajes", nombre: "Mensajes" },
      { href: "/panel/sucursales", nombre: "Sucursales" },
      { href: "/panel/cuenta", nombre: "Mi cuenta" },
    ],
  },
];

const CLASE_ITEM =
  "flex h-11 items-center rounded-md px-3 text-ui transition-colors";

export function Sidebar({
  lubricentroNombre,
  suspendido = false,
  features = {},
}: {
  lubricentroNombre: string;
  suspendido?: boolean;
  features?: Partial<Record<FeaturePlan, boolean>>;
}) {
  // Lo que el plan no incluye no aparece — la sección de URL directa la
  // atiende BloqueoPlan, pero el menú no ofrece lo que no se puede usar.
  const grupos = GRUPOS.map((g) => ({
    ...g,
    items: g.items.filter((i) => !i.feature || features[i.feature]),
  })).filter((g) => g.items.length > 0);

  return (
    <aside className="fixed inset-y-0 left-0 z-30 hidden w-64 flex-col border-r border-line bg-base lg:flex">
      <div className="px-5 pt-5 pb-4">
        <Logo className="h-5 w-auto" priority />
        <p className="mt-0.5 truncate text-ui text-ink-60">{lubricentroNombre}</p>
      </div>

      <div className="px-4">
        {suspendido ? (
          // Apagado, en su lugar y con el motivo: el botón no desaparece
          // —eso haría pensar que se rompió algo— pero tampoco engaña.
          <span
            aria-disabled="true"
            title={MOTIVO_SUSPENSION}
            className="flex h-11 w-full cursor-not-allowed items-center justify-center gap-1.5 rounded-md bg-surface font-brand text-ui font-bold text-ink-40"
          >
            <IconoCandado className="size-4" />
            Nuevo service
          </span>
        ) : (
          <Link
            href="/panel/services/nuevo"
            className="flex h-11 w-full items-center justify-center gap-1.5 rounded-md bg-brand font-brand text-ui font-bold text-white transition-colors hover:bg-brand-deep"
          >
            <IconoPlus className="size-4" />
            Nuevo service
          </Link>
        )}
      </div>

      <nav className="mt-1 flex-1 overflow-y-auto px-4 pb-4">
        {grupos.map((grupo) => (
          <div key={grupo.titulo}>
            <p className="px-3 pt-4 pb-1 text-label font-semibold tracking-[0.06em] text-ink-40 uppercase">
              {grupo.titulo}
            </p>
            {grupo.items.map((item) => (
              <NavLink
                key={item.href}
                href={item.href}
                exacto={item.exacto}
                className={CLASE_ITEM}
              >
                {item.nombre}
              </NavLink>
            ))}
          </div>
        ))}
      </nav>

      {/* El pie del sidebar, como en el hi-fi: ayuda y salida. */}
      <div className="border-t border-line px-4 py-2">
        <a
          href={urlWhatsappSoporte()}
          target="_blank"
          rel="noopener noreferrer"
          className={`${CLASE_ITEM} text-ink-60 hover:bg-surface/60`}
        >
          Ayuda por WhatsApp
        </a>
        <form action={cerrarSesion}>
          <button
            type="submit"
            className={`${CLASE_ITEM} w-full text-left text-ink-60 hover:bg-surface/60`}
          >
            Cerrar sesión
          </button>
        </form>
      </div>
    </aside>
  );
}

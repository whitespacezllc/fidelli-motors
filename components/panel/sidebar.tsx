import Link from "next/link";
import { Logo } from "@/components/marca/logo";
import { NavLink } from "@/components/panel/nav-link";
import {
  IconoPlus,
  IconoCandado,
  IconoInicio,
  IconoReloj,
  IconoClientes,
  IconoTrabajos,
  IconoCaja,
  IconoPremio,
  IconoPresupuesto,
  IconoDiseno,
  IconoMensajes,
  IconoLubricentro,
  IconoCuenta,
} from "@/components/iconos";
import { BadgePorLlamar } from "@/components/panel/badge-por-llamar";
import { cerrarSesion } from "@/lib/auth/actions";
import { urlWhatsappSoporte } from "@/lib/config";
import { MOTIVO_SUSPENSION } from "@/components/panel/aviso-suspension";
import type { FeaturePlan } from "@/lib/planes";

// Los grupos y el orden vienen del hi-fi (pantalla 2 · Inicio — panel del lubri).
// `feature` = qué tiene que habilitar el plan para que el item exista. La
// resolución viene con la sesión (plan_capacidades); acá solo se filtra.
// LOS ONCE LLEVAN ÍCONO. Antes lo tenían cuatro y la lista quedaba a
// mitad de camino entre una barra con íconos y una de solo texto — que es
// peor que cualquiera de las dos, porque el ojo busca la marca visual
// donde no está y la fila salta de sangría.
const GRUPOS: {
  titulo: string;
  items: {
    href: string;
    nombre: string;
    exacto?: boolean;
    feature?: FeaturePlan;
    Icono: typeof IconoInicio;
  }[];
}[] = [
  {
    titulo: "Operación",
    items: [
      { href: "/panel", nombre: "Inicio", exacto: true, Icono: IconoInicio },
      // El nombre es el TÍTULO de la pantalla, no una descripción de lo
      // que había en el bloque 1: desde los pendientes, esa lista tiene
      // dos fuentes y ninguna es "próximos services" a secas.
      { href: "/panel/proximos", nombre: "A quién llamar", Icono: IconoReloj },
      { href: "/panel/clientes", nombre: "Clientes", Icono: IconoClientes },
      // "Trabajos" y no "Services": la lista mezcla los dos tipos desde
      // el bloque 2, y el filtro por tipo lo hace evidente.
      { href: "/panel/services", nombre: "Trabajos", Icono: IconoTrabajos },
    ],
  },
  {
    titulo: "Negocio",
    items: [
      { href: "/panel/productos", nombre: "Productos", Icono: IconoCaja },
      { href: "/panel/fidelizacion", nombre: "Fidelización", feature: "premios", Icono: IconoPremio },
      { href: "/panel/presupuestos", nombre: "Presupuestos", feature: "presupuestos", Icono: IconoPresupuesto },
    ],
  },
  {
    titulo: "Configuración",
    items: [
      // Sin feature a propósito (Bloque 7): la hoja de calcos QR vive en
      // esta pantalla y es de LOS TRES planes. Sin la feature, la pantalla
      // muestra el BloqueoPlan de personalización + los calcos igual.
      { href: "/panel/experiencia", nombre: "Diseño de experiencia", Icono: IconoDiseno },
      { href: "/panel/mensajes", nombre: "Mensajes", Icono: IconoMensajes },
      { href: "/panel/sucursales", nombre: "Sucursales", Icono: IconoLubricentro },
      { href: "/panel/cuenta", nombre: "Mi cuenta", Icono: IconoCuenta },
    ],
  },
];

const CLASE_ITEM =
  "flex h-11 items-center gap-2.5 rounded-md px-3 text-ui transition-colors";

export function Sidebar({
  lubricentroNombre,
  suspendido = false,
  features = {},
  porLlamar = 0,
}: {
  lubricentroNombre: string;
  suspendido?: boolean;
  features?: Partial<Record<FeaturePlan, boolean>>;
  /** Contactos sin hacer en "A quién llamar" — pinta el círculo. */
  porLlamar?: number;
}) {
  // Lo que el plan no incluye no aparece — la sección de URL directa la
  // atiende BloqueoPlan, pero el menú no ofrece lo que no se puede usar.
  const grupos = GRUPOS.map((g) => ({
    ...g,
    items: g.items.filter((i) => !i.feature || features[i.feature]),
  })).filter((g) => g.items.length > 0);

  return (
    // print:hidden explícito: en papel apaisado (≥1024px) lg:flex lo haría
    // aparecer impreso. El ancho del papel decide los breakpoints, no la
    // pantalla desde la que se imprime.
    <aside className="fixed inset-y-0 left-0 z-30 hidden w-64 flex-col border-r border-line bg-base lg:flex print:hidden">
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
            Nuevo trabajo
          </span>
        ) : (
          <Link
            href="/panel/services/nuevo"
            className="flex h-11 w-full items-center justify-center gap-1.5 rounded-md bg-brand font-brand text-ui font-bold text-white transition-colors hover:bg-brand-deep"
          >
            <IconoPlus className="size-4" />
            Nuevo trabajo
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
                <item.Icono aria-hidden className="size-5 shrink-0" />
                {item.nombre}
                {/* El círculo va SOLO en "A quién llamar": es la única
                    sección con una cola de tareas que se vacía. */}
                {item.href === "/panel/proximos" && (
                  <span className="ml-auto flex">
                    <BadgePorLlamar cantidad={porLlamar} />
                  </span>
                )}
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

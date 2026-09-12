import Link from "next/link";
import { Logo } from "@/components/marca/logo";
import { NavLink } from "@/components/panel/nav-link";
import { ItemBloqueado } from "@/components/panel/item-bloqueado";
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
  IconoNeumatico,
  IconoLubricentro,
  IconoCuenta,
  IconoAyuda,
} from "@/components/iconos";
import { BadgePorLlamar } from "@/components/panel/badge-por-llamar";
import { cerrarSesion } from "@/lib/auth/actions";
import { urlWhatsappSoporte } from "@/lib/config";
import { MOTIVO_SUSPENSION } from "@/components/panel/aviso-suspension";
import { motivoBloqueo } from "@/components/panel/bloqueo-onboarding";
import type { FeaturePlan } from "@/lib/planes";

// Los grupos y el orden vienen del hi-fi (pantalla 2 · Inicio — panel del lubri).
// `feature` = qué tiene que habilitar el plan para que el item exista. La
// resolución viene con la sesión (plan_capacidades); acá solo se filtra.
// LOS DOCE LLEVAN ÍCONO. Antes lo tenían cuatro y la lista quedaba a
// mitad de camino entre una barra con íconos y una de solo texto — que es
// peor que cualquiera de las dos, porque el ojo busca la marca visual
// donde no está y la fila salta de sangría.
//
// "Ayuda" va al final: es la única solapa que sigue abierta mientras el
// onboarding no terminó, y por eso nunca lleva candado.
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
      // Los intervalos del módulo de gomería. Solo con el módulo: es un
      // add-on pago y el menú no ofrece lo que no se puede usar.
      { href: "/panel/neumaticos", nombre: "Neumáticos", feature: "neumaticos", Icono: IconoNeumatico },
      { href: "/panel/sucursales", nombre: "Sucursales", Icono: IconoLubricentro },
      { href: "/panel/cuenta", nombre: "Mi cuenta", Icono: IconoCuenta },
      { href: "/panel/ayuda", nombre: "Ayuda", Icono: IconoAyuda },
    ],
  },
];

/** Las solapas que siguen abiertas con el onboarding a medias. */
const SIEMPRE_ABIERTAS = new Set(["/panel/ayuda"]);

const CLASE_ITEM =
  "flex h-11 items-center gap-2.5 rounded-md px-3 text-ui transition-colors";

export function Sidebar({
  lubricentroNombre,
  suspendido = false,
  features = {},
  porLlamar = 0,
  bloqueado = false,
  pasosOnboarding = 3,
  desbloqueando = false,
}: {
  lubricentroNombre: string;
  suspendido?: boolean;
  features?: Partial<Record<FeaturePlan, boolean>>;
  /** Contactos sin hacer en "A quién llamar" — pinta el círculo. */
  porLlamar?: number;
  /** El onboarding no terminó: todo con candado salvo Ayuda. */
  bloqueado?: boolean;
  /** Cuántos pasos tiene el onboarding de esta cuenta (2 en Basic). */
  pasosOnboarding?: number;
  /**
   * La bienvenida está en pantalla: los ítems nacen con candado y se
   * desbloquean de arriba hacia abajo cuando el telón se levanta. Es puro
   * CSS (globals.css · nav-desbloqueo) con el índice de cada ítem.
   */
  desbloqueando?: boolean;
}) {
  // Lo que el plan no incluye no aparece — la sección de URL directa la
  // atiende BloqueoPlan, pero el menú no ofrece lo que no se puede usar.
  const grupos = GRUPOS.map((g) => ({
    ...g,
    items: g.items.filter((i) => !i.feature || features[i.feature]),
  })).filter((g) => g.items.length > 0);

  const motivo = motivoBloqueo(pasosOnboarding);
  // El índice corrido de cada ítem, de arriba hacia abajo: es el orden
  // en que se desbloquean en la bienvenida.
  let indice = 0;

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
        {suspendido || bloqueado ? (
          // Apagado, en su lugar y con el motivo: el botón no desaparece
          // —eso haría pensar que se rompió algo— pero tampoco engaña.
          <ItemBloqueado motivo={suspendido ? MOTIVO_SUSPENSION : motivo}>
            <span className="flex h-11 w-full items-center justify-center gap-1.5 rounded-md bg-surface font-brand text-ui font-bold text-ink-40">
              <IconoCandado className="size-4" />
              Nuevo trabajo
            </span>
          </ItemBloqueado>
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
            {grupo.items.map((item) => {
              const abierta = SIEMPRE_ABIERTAS.has(item.href);
              const i = indice++;

              if (bloqueado && !abierta) {
                return (
                  <ItemBloqueado
                    key={item.href}
                    motivo={motivo}
                    className={`${CLASE_ITEM} text-ink-40`}
                  >
                    <item.Icono aria-hidden className="size-5 shrink-0" />
                    {item.nombre}
                    <IconoCandado aria-hidden className="ml-auto size-4 shrink-0" />
                  </ItemBloqueado>
                );
              }

              return (
                <NavLink
                  key={item.href}
                  href={item.href}
                  exacto={item.exacto}
                  className={`${CLASE_ITEM} ${desbloqueando && !abierta ? "nav-desbloqueo" : ""}`}
                  style={desbloqueando ? ({ "--i": i } as React.CSSProperties) : undefined}
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
                  {/* El candado de la bienvenida: nace visible y se va
                      cuando le toca el turno a este ítem. */}
                  {desbloqueando && !abierta && (
                    <span aria-hidden className="candado-nav ml-auto flex overflow-hidden">
                      <IconoCandado className="size-4 shrink-0" />
                    </span>
                  )}
                </NavLink>
              );
            })}
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

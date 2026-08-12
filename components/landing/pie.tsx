import Link from "next/link";
import { Logo } from "@/components/marca/logo";
import { LINKS_NAVBAR } from "@/lib/landing";

// El pie, sobre blanco — el cierre (11) va sobre grafito y termina ahí.
//
// Sin newsletter: este público no se suscribe a nada.
//
// ANDAMIO: la estructura de las tres columnas es la definitiva; los enlaces
// a /terminos y /privacidad todavía no tienen destino (son rutas de la
// entrega 2) y por eso van sin href.
export function Pie() {
  return (
    <footer className="border-t border-line bg-base px-5 py-12 sm:px-8">
      <div className="mx-auto grid w-full max-w-6xl gap-8 sm:grid-cols-2 lg:grid-cols-4">
        <div>
          <Logo className="h-5 w-auto" />
          <p className="mt-2 text-ui text-ink-60">Córdoba, Argentina</p>
        </div>

        <nav aria-label="Secciones">
          <p className="font-ui text-label font-semibold tracking-[0.06em] text-ink-40 uppercase">
            La página
          </p>
          <ul className="mt-2 flex flex-col gap-1.5">
            {LINKS_NAVBAR.map((l) => (
              <li key={l.href}>
                <Link
                  href={l.href}
                  className="text-ui text-ink-60 hover:text-ink"
                >
                  {l.texto}
                </Link>
              </li>
            ))}
          </ul>
        </nav>

        <div>
          <p className="font-ui text-label font-semibold tracking-[0.06em] text-ink-40 uppercase">
            Contacto
          </p>
          <p className="mt-2 text-ui text-ink-40">
            {/* ANDAMIO: WhatsApp · Instagram · Mail */}
            pendiente
          </p>
        </div>

        <div>
          <p className="font-ui text-label font-semibold tracking-[0.06em] text-ink-40 uppercase">
            Fidelli Motors
          </p>
          <ul className="mt-2 flex flex-col gap-1.5">
            <li>
              <Link
                href="/login"
                className="text-ui text-ink-60 hover:text-ink"
              >
                Ingresar al panel
              </Link>
            </li>
            <li className="text-ui text-ink-40">
              {/* ANDAMIO: /terminos y /privacidad — entrega 2 */}
              Términos · Privacidad
            </li>
          </ul>
        </div>
      </div>
    </footer>
  );
}

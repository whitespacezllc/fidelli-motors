import Link from "next/link";
import { Logo } from "@/components/marca/logo";
import { CTA_WHATSAPP, LINKS_NAVBAR } from "@/lib/landing";

// El pie, sobre blanco — el cierre queda arriba, sobre grafito.
//
// Sin newsletter: este público no se suscribe a nada.
//
const CLASE_TITULO =
  "font-ui text-label font-semibold tracking-[0.06em] text-ink-60 uppercase";
const CLASE_LINK = "text-ui text-ink-60 transition-colors hover:text-ink";

export function Pie() {
  return (
    <footer className="border-t border-line bg-base py-12 sm:py-14">
      <div className="contenedor grid gap-9 sm:grid-cols-2 lg:grid-cols-4 lg:gap-8">
        <div>
          <Logo className="h-5 w-auto" />
          <p className="mt-2.5 text-ui text-ink-60">Córdoba, Argentina</p>
        </div>

        <nav aria-label="Secciones de la página">
          <p className={CLASE_TITULO}>La página</p>
          <ul className="mt-3 flex flex-col gap-2">
            {LINKS_NAVBAR.map((l) => (
              <li key={l.href}>
                <Link href={l.href} className={CLASE_LINK}>
                  {l.texto}
                </Link>
              </li>
            ))}
          </ul>
        </nav>

        <div>
          <p className={CLASE_TITULO}>Contacto</p>
          <ul className="mt-3 flex flex-col gap-2">
            <li>
              <a
                href={CTA_WHATSAPP}
                target="_blank"
                rel="noopener noreferrer"
                className={CLASE_LINK}
              >
                WhatsApp
              </a>
            </li>
            <li>
              <a
                href="https://instagram.com/fidelli.motors"
                target="_blank"
                rel="noopener noreferrer"
                className={CLASE_LINK}
              >
                Instagram
              </a>
            </li>
            <li>
              <a href="mailto:hola@fidellimotors.app" className={CLASE_LINK}>
                hola@fidellimotors.app
              </a>
            </li>
          </ul>
        </div>

        <nav aria-label="Accesos">
          <p className={CLASE_TITULO}>Fidelli Motors</p>
          <ul className="mt-3 flex flex-col gap-2">
            <li>
              <Link href="/login" className={CLASE_LINK}>
                Ingresar al panel
              </Link>
            </li>
            {/* Términos y Privacidad son rutas de la entrega 2. Se agregan
                acá el día que existan — no antes, para no publicar un
                enlace muerto en el pie. */}
          </ul>
        </nav>
      </div>
    </footer>
  );
}

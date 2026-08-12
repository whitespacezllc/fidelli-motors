import Link from "next/link";
import { Logo } from "@/components/marca/logo";
import { CTA_WHATSAPP, LINKS_NAVBAR } from "@/lib/landing";

// 01 · Navbar — no estorbar y tener el CTA siempre a mano.
//
// Mobile 56px: logo y nada más. El CTA NO va acá ni en un menú hamburguesa
// —va en la barra fija al pie, visible durante toda la página— y los tres
// links son anclas de esta misma página, así que en mobile se llega
// scrolleando. Un menú que esconde tres anclas es fricción sin beneficio.
//
// Desktop 64px: logo · links · CTA.
//
// "Ingresar" es enlace de texto y apunta siempre a /login, con o sin
// sesión: /login ya redirige al panel que corresponda. El navbar no lee la
// sesión — la landing tiene que quedar estática.
export function Navbar() {
  return (
    <header className="sticky top-0 z-40 border-b border-line bg-base/85 backdrop-blur-md">
      <nav
        aria-label="Principal"
        className="mx-auto flex h-14 w-full max-w-6xl items-center gap-4 px-5 sm:h-16 sm:px-8"
      >
        <Link href="/" aria-label="Fidelli Motors — inicio" className="shrink-0">
          <Logo className="h-5 w-auto sm:h-6" priority />
        </Link>

        {/* Los links viven desde sm: en mobile se llega scrolleando. */}
        <ul className="ml-auto hidden items-center gap-6 sm:flex">
          {LINKS_NAVBAR.map((l) => (
            <li key={l.href}>
              <Link
                href={l.href}
                className="text-ui text-ink-60 transition-colors hover:text-ink"
              >
                {l.texto}
              </Link>
            </li>
          ))}
          <li>
            <Link
              href="/login"
              className="text-ui text-ink-60 underline underline-offset-4 transition-colors hover:text-ink"
            >
              Ingresar
            </Link>
          </li>
        </ul>

        {/* En mobile "Ingresar" queda solo, a la derecha: es la única salida
            del navbar y no compite con nada. */}
        <Link
          href="/login"
          className="ml-auto text-ui text-ink-60 underline underline-offset-4 sm:hidden"
        >
          Ingresar
        </Link>

        <a
          href={CTA_WHATSAPP}
          target="_blank"
          rel="noopener noreferrer"
          className="hidden h-11 items-center rounded-md bg-brand px-4 font-brand text-ui font-bold text-white transition-colors hover:bg-brand-deep sm:inline-flex"
        >
          Quiero mi lugar
        </a>
      </nav>
    </header>
  );
}

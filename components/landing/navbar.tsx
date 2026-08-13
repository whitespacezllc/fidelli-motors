"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { Logo } from "@/components/marca/logo";
import { IconoCerrarMenu, IconoMenu } from "@/components/iconos";
import { CtaWhatsapp } from "@/components/landing/cta-whatsapp";
import { useCtaHeroVisible } from "@/components/landing/usar-cta-hero";
import { LINKS_NAVBAR } from "@/lib/landing";

// 01 · Navbar — no estorbar y tener el CTA siempre a mano.
//
// Desktop 64px: logo · links · CTA. Mobile 56px: logo + hamburguesa.
//
// SE ESCONDE AL BAJAR Y VUELVE AL SUBIR. Es una landing larga que se lee
// de corrido: mientras baja, la barra es un estorbo; apenas hace el gesto
// de volver, la acción tiene que estar ahí.
//
// Sin borde y sin glass: blanco sólido. Arriba de todo no lleva ni sombra
// —se funde con el hero— y apenas se scrollea aparece una sombra de 1px que
// es lo único que lo despega del contenido.
//
// Es cliente por el scroll y el menú. Ninguna de las dos cosas lee la
// sesión: la landing se sigue sirviendo estática.
//
// "Ingresar" ya no está acá. Confundía —un desconocido no sabe si tiene que
// entrar antes de nada— y se fue al pie, que es donde se busca.

// Delta mínimo antes de cambiar de estado. Sin esto, el rebote de iOS y
// cualquier scroll de dos píxeles hacen titilar la barra.
const UMBRAL_PX = 8;

// Alto del navbar en mobile (h-14). El panel del menú cuelga de acá.
const ALTO_MOBILE = "top-14";

export function Navbar() {
  const [oculto, setOculto] = useState(false);
  const [conSombra, setConSombra] = useState(false);
  const [menuAbierto, setMenuAbierto] = useState(false);
  const [motionReducido, setMotionReducido] = useState(false);
  const ultimoY = useRef(0);

  // Con el CTA del hero en pantalla, el del navbar va en outline: nunca dos
  // botones rojos compitiendo a la vez.
  const ctaHeroVisible = useCtaHeroVisible();

  useEffect(() => {
    const mq = window.matchMedia("(prefers-reduced-motion: reduce)");
    const aplicar = () => setMotionReducido(mq.matches);
    aplicar();
    mq.addEventListener("change", aplicar);
    return () => mq.removeEventListener("change", aplicar);
  }, []);

  useEffect(() => {
    const alScrollear = () => {
      const y = window.scrollY;

      // La sombra se decide sola y sin umbral: es un booleano de "¿ya no
      // estamos arriba de todo?", no una reacción al gesto.
      setConSombra(y > 0);

      // Arriba de todo siempre visible. `<= 0` y no `=== 0` por el rebote
      // de iOS, que deja el scroll en negativo.
      if (y <= 0) {
        setOculto(false);
        ultimoY.current = 0;
        return;
      }

      const delta = y - ultimoY.current;
      if (Math.abs(delta) < UMBRAL_PX) return;
      ultimoY.current = y;

      // Con el menú abierto la barra no se mueve: el panel cuelga de ella y
      // se iría de la pantalla con todo adentro. Con movimiento reducido,
      // tampoco: queda siempre a la vista.
      if (menuAbierto || motionReducido) {
        setOculto(false);
        return;
      }

      setOculto(delta > 0);
    };

    // El punto de partida es dónde está la página AHORA, no cero. Si se
    // recarga a mitad de la landing —o se entra por un ancla— con el cero
    // de arranque el primer cálculo daba un delta gigante hacia abajo y la
    // barra nacía escondida sin que nadie hubiera scrolleado.
    //
    // Con el punto de partida puesto, esta primera pasada da delta 0: no
    // decide nada sobre esconder, y sirve para lo único que tiene que
    // servir en el arranque, que es poner la sombra si ya venimos scrolleados.
    ultimoY.current = window.scrollY;
    alScrollear();

    window.addEventListener("scroll", alScrollear, { passive: true });
    return () => window.removeEventListener("scroll", alScrollear);
  }, [menuAbierto, motionReducido]);

  // Con el menú abierto el fondo no scrollea: hay un scrim adelante y
  // scrollear atrás se siente roto.
  useEffect(() => {
    document.body.style.overflow = menuAbierto ? "hidden" : "";
    return () => {
      document.body.style.overflow = "";
    };
  }, [menuAbierto]);

  // Escape cierra, como cualquier capa modal.
  useEffect(() => {
    if (!menuAbierto) return;
    const alTeclear = (e: KeyboardEvent) => {
      if (e.key === "Escape") setMenuAbierto(false);
    };
    window.addEventListener("keydown", alTeclear);
    return () => window.removeEventListener("keydown", alTeclear);
  }, [menuAbierto]);

  return (
    <>
      <header
        className={`sticky top-0 z-40 bg-base transition-transform duration-[220ms] ease-out ${
          oculto ? "-translate-y-full" : "translate-y-0"
        } ${conSombra ? "shadow-[0_1px_2px_rgba(10,10,10,0.04)]" : ""}`}
      >
        <nav
          aria-label="Principal"
          className="contenedor flex h-14 items-center gap-4 md:h-16"
        >
          <Link href="/" aria-label="Fidelli Motors, ir al inicio" className="shrink-0">
            <Logo className="h-5 w-auto sm:h-6" priority />
          </Link>

          {/* ---------- Desktop: los tres links y el CTA ---------- */}
          <ul className="ml-auto hidden items-center gap-6 md:flex lg:gap-7">
            {LINKS_NAVBAR.map((l) => (
              <li key={l.href}>
                <Link
                  href={l.href}
                  className="text-ui whitespace-nowrap text-ink-60 transition-colors hover:text-ink"
                >
                  {l.texto}
                </Link>
              </li>
            ))}
          </ul>

          {/* El div de visibilidad es para no pelearle el `display` al
              inline-flex del botón: `hidden` y `inline-flex` en la misma
              clase dependen del orden en que Tailwind los emita. */}
          <div className="ml-6 hidden md:block lg:ml-7">
            <CtaWhatsapp
              variante={ctaHeroVisible ? "outline" : "solido"}
              className="h-11 whitespace-nowrap px-4 text-ui"
            />
          </div>

          {/* ---------- Mobile: la hamburguesa ----------
              22px de ícono en un área táctil de 44. El margen negativo
              alinea el borde óptico del ícono con el del logo: sin él, el
              aire propio del área táctil lo deja diez píxeles más adentro
              que todo lo demás de la página. */}
          <button
            type="button"
            onClick={() => setMenuAbierto((v) => !v)}
            aria-label={menuAbierto ? "Cerrar el menú" : "Abrir el menú"}
            aria-expanded={menuAbierto}
            aria-controls="menu-navbar"
            className="-mr-2.5 ml-auto grid size-11 place-items-center text-ink md:hidden"
          >
            {/* Los dos íconos ocupan la misma celda de la grilla y se cruzan
                girando. Montados los dos, la transición existe; alternando
                cuál se renderiza, sería un salto. */}
            {/* `transition-[opacity,rotate]` y no `,transform`: en Tailwind
                v4 `rotate-90` escribe la propiedad `rotate`, no `transform`,
                así que con `transform` en la lista el giro se aplicaba de
                golpe y solo se desvanecía la opacidad. */}
            <IconoMenu
              aria-hidden
              strokeWidth={2}
              className={`col-start-1 row-start-1 size-[22px] transition-[opacity,rotate] duration-200 ease-out ${
                menuAbierto ? "rotate-90 opacity-0" : "rotate-0 opacity-100"
              }`}
            />
            <IconoCerrarMenu
              aria-hidden
              strokeWidth={2}
              className={`col-start-1 row-start-1 size-[22px] transition-[opacity,rotate] duration-200 ease-out ${
                menuAbierto ? "rotate-0 opacity-100" : "-rotate-90 opacity-0"
              }`}
            />
          </button>
        </nav>
      </header>

      {/* ---------- El scrim y el panel ----------
          Van FUERA del <header> y no es un detalle de orden: el header
          lleva un `transform` para esconderse, y un `transform` convierte a
          su elemento en el marco de referencia de cualquier hijo `fixed`.
          Adentro, el scrim se posicionaría contra los 56px del navbar en
          vez de contra la pantalla.

          Montados siempre y ocultos con clases, para que la salida se
          anime. `inert` los saca del foco y del lector de pantalla mientras
          están cerrados, que es lo que un `display:none` haría gratis y
          esto no puede hacer sin perder la animación. */}
      <div
        aria-hidden
        inert={!menuAbierto}
        onClick={() => setMenuAbierto(false)}
        className={`fixed inset-0 z-30 bg-ink/20 transition-opacity ease-out md:hidden ${
          menuAbierto
            ? "opacity-100 duration-200"
            : "pointer-events-none opacity-0 duration-150"
        }`}
      />

      <div
        id="menu-navbar"
        inert={!menuAbierto}
        // `contenedor` también acá: los links del menú caen en el mismo eje
        // que el logo de arriba. Con un px-5 propio se despegaban apenas la
        // pantalla pasaba de 400px, que es donde el clamp empieza a crecer.
        className={`contenedor fixed inset-x-0 ${ALTO_MOBILE} z-40 rounded-b-lg bg-base pb-3 shadow-[0_1px_2px_rgba(10,10,10,0.04)] transition-[opacity,translate] ease-out md:hidden ${
          menuAbierto
            ? "translate-y-0 opacity-100 duration-200"
            : "pointer-events-none -translate-y-2 opacity-0 duration-150"
        }`}
      >
        <ul className="flex flex-col">
          {LINKS_NAVBAR.map((l) => (
            <li key={l.href}>
              <Link
                href={l.href}
                onClick={() => setMenuAbierto(false)}
                className="flex min-h-14 items-center text-body text-ink"
              >
                {l.texto}
              </Link>
            </li>
          ))}
        </ul>
      </div>
    </>
  );
}

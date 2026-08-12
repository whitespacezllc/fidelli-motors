import Image from "next/image";
import Link from "next/link";
import { CTA_WHATSAPP } from "@/lib/landing";

// 02 · Hero — que se reconozca en la primera línea.
//
// UNA SOLA COLUMNA, de arriba hacia abajo: badge, titular, lead, botones,
// cupos y la captura. Todo comparte el mismo eje izquierdo —incluido el
// borde izquierdo de la imagen—; el contenedor va centrado en la página,
// el contenido alineado a la izquierda adentro.
//
// La captura se CORTA contra el borde inferior del viewport. El recorte es
// parte del efecto, no un descuido: sugiere que hay más abajo y empuja a
// scrollear.
//
// El recorte se mide en `svh` —proporción de la pantalla— y no en píxeles
// fijos, para que el efecto sobreviva a cualquier alto de viewport. `svh` y
// no `vh` porque en mobile la barra de URL del navegador aparece y
// desaparece, y con `vh` el recorte saltaría con ella.
export function Hero() {
  return (
    <section
      id="hero"
      aria-labelledby="hero-titulo"
      className="relative overflow-hidden bg-base"
    >
      {/* El lavado gris de arriba a la izquierda. Tiene que ser casi
          imperceptible: si se nota que hay un degradado, está muy fuerte.
          Sin color y sin glow — el fondo es blanco y esto es apenas una
          sombra de luz. */}
      <div
        aria-hidden
        className="pointer-events-none absolute -top-40 -left-40 h-[36rem] w-[36rem] rounded-full bg-[radial-gradient(circle,rgba(10,10,10,0.045),transparent_70%)]"
      />

      <div className="relative mx-auto w-full max-w-6xl px-5 pt-10 pb-0 sm:px-8 sm:pt-14 lg:pt-16">
        {/* 1 · Badge pill. Dos partes: el tag en su propio recuadro y el
            texto al lado. */}
        <p className="inline-flex items-center gap-2.5 rounded-full border border-line bg-base py-1.5 pr-4 pl-1.5">
          <span className="rounded-full bg-surface px-2.5 py-1 font-ui text-label font-semibold tracking-[0.08em] text-ink-60 uppercase">
            Nuevo
          </span>
          <span className="text-ui text-ink-60">Para lubricentros y talleres</span>
        </p>

        {/* 2 · H1. LA EXCEPCIÓN TIPOGRÁFICA de toda la landing: usa el
            escalón display de 52px, que en el resto del producto es solo
            del cartón. 31 en mobile → 39 en tablet → 52 en desktop.
            text-balance reparte las dos líneas sin dejar una huérfana. */}
        <h1
          id="hero-titulo"
          className="mt-7 max-w-4xl text-balance text-h2 leading-[1.1] font-bold tracking-[-0.02em] text-ink sm:text-h1 lg:text-display"
        >
          Tus services están en un Excel, un cuaderno y un cartón que se pierde.
        </h1>

        {/* 3 · Lead. Se queda en 20px SIEMPRE, no escala con el titular.
            max-w topa la medida de línea en ~65-75 caracteres. */}
        <p className="mt-5 max-w-[46ch] text-pretty text-lead leading-relaxed text-ink-60">
          Fidelli Motors los junta en un solo lugar. Cargás el service en 90
          segundos y el sistema te dice a quién le toca volver.
        </p>

        {/* 4 · Los dos botones. El primario es el único rojo; el secundario
            va en outline grafito y baja a la sección 03. */}
        <div className="mt-8 flex flex-col gap-3 sm:flex-row sm:items-center">
          <a
            href={CTA_WHATSAPP}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex h-13 items-center justify-center rounded-md bg-brand px-7 text-body font-bold text-white transition-colors hover:bg-brand-deep"
          >
            Quiero mi lugar
          </a>
          <Link
            href="#como-funciona"
            className="inline-flex h-13 items-center justify-center gap-2 rounded-md border border-ink px-7 text-body font-bold text-ink transition-colors hover:bg-surface"
          >
            Ver cómo se carga
            <span aria-hidden className="text-ink-60">
              ↓
            </span>
          </Link>
        </div>

        {/* 5 · La prueba social. NO va en rojo: es escasez, no acción. El
            punto verde dice "esto está andando ahora", que es literal. */}
        <p className="mt-6 flex flex-wrap items-center gap-x-2 gap-y-1 text-ui text-ink-40">
          <span aria-hidden className="size-2 shrink-0 rounded-full bg-success" />
          Funcionando en Brothers Oil, Córdoba
          <span aria-hidden className="text-line">·</span>
          Quedan 4 de 5 lugares
        </p>

        {/* 6 · La captura, a todo el ancho del contenedor y con su borde
            izquierdo en el mismo eje que el badge, el titular y los botones.

            La altura va en `svh` y NO en `flex-1`: un flex item no se encoge
            por debajo de su contenido, así que con flex-1 la imagen entraba
            entera y estiraba la sección a 1181px en una pantalla de 900 —
            justo lo contrario del recorte. Con una altura proporcional al
            viewport el corte está garantizado en los tres tamaños, porque la
            captura es más alta que ancha (ratio 1.16) y a cualquier ancho su
            alto natural supera al contenedor.

            Es una captura REAL del panel andando —la pantalla de próximos
            services, con las patentes del entorno de prueba—, no un mockup
            dibujado. Se regenera con scripts/capturar-panel.mjs. */}
        <div className="mt-10 h-[26svh] min-h-24 overflow-hidden sm:mt-14 sm:h-[38svh] lg:h-[44svh]">
          <div className="overflow-hidden rounded-t-lg border border-b-0 border-line shadow-[0_-1px_40px_rgba(10,10,10,0.06)]">
            {/* En mobile la captura va al DOBLE del ancho del contenedor y
                se corta también a la derecha. Encogida a 335px, la tabla
                del panel queda en tipografía de 4px: no se lee nada y deja
                de ser prueba para pasar a ser ruido. Al doble se reconoce
                la lista de autos con su patente y su estado, que es
                justamente lo que la sección tiene que demostrar. */}
            <Image
              src="/assets/panel-proximos-services.webp"
              alt="El panel de Fidelli Motors mostrando los próximos services: qué cliente, qué vehículo, cuándo le toca volver y su estado."
              width={2880}
              height={2480}
              priority
              className="w-[200%] max-w-none sm:w-full"
            />
          </div>
        </div>
      </div>
    </section>
  );
}

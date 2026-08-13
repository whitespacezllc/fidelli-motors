import Link from "next/link";
import { CtaWhatsapp } from "@/components/landing/cta-whatsapp";
import { ID_CTA_HERO } from "@/lib/landing";

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

      <div className="contenedor relative pt-10 pb-0 sm:pt-14 lg:pt-16">
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
          className="mt-7 max-w-4xl text-balance text-h3 leading-[1.1] font-bold tracking-[-0.02em] text-ink min-[360px]:text-h2 sm:text-h1 lg:text-display"
        >
          {/* Espacio duro entre "sus" y "autos". No cambia el copy: impide
              un solo punto de corte. Sin él, los tres modos de wrap dejan
              algo colgando — balance corta en "sus / autos", pretty en
              "y / cada service.", y el normal deja "service." solo. Con
              "sus autos" pegado, el corte cae en la coma, que es donde la
              frase respira. */}
          Todos tus clientes, sus{"\u00A0"}autos y cada service.{" "}
          {/* El remate en su propio renglón, pero solo desde md: `block`
              fuerza el corte donde el spec lo quiere y en mobile lo suelta
              para que el titular rompa natural.

              `whitespace-nowrap` en todos los anchos porque la frase no
              puede quedar partida — es el remate, no una oración más. Eso
              obliga a que entre entera: a 31px mide 300px y en una pantalla
              de 320 quedan 280, así que abajo de 360 el titular baja un
              escalón. Es el mismo problema de "10 días" en la sección 08. */}
          <span className="whitespace-nowrap md:block">
            En una sola pantalla.
          </span>
        </h1>

        {/* 3 · Lead. Se queda en 20px SIEMPRE, no escala con el titular.
            `text-balance` y NO `text-pretty`, que es lo que usa el resto de
            la landing: `pretty` solo evita la huérfana de UNA palabra, y
            acá la última línea quedaba en "toca volver." en las dos puntas
            —a 1440 y a 390—. `balance` empareja los renglones y el corte
            cae solo en la juntura de la frase:
              1440 → "…desde el celular," / "y el sistema te dice…"
               390 → tres renglones parejos, el último de siete palabras
            En mobile el ancho lo pone el contenedor, así que toparlo no
            alcanzaba: el único arreglo que sirve en los dos lados es este.
            48ch topa la medida de línea en desktop, dentro de los 65-75. */}
        <p className="mt-5 max-w-[48ch] text-balance text-lead leading-relaxed text-ink-60">
          Los cargás en 90 segundos desde el celular, y el sistema te dice a
          quién le toca volver.
        </p>

        {/* 4 · Los dos botones. El primario es el único rojo; el secundario
            va en outline grafito y baja a la sección 03. */}
        <div className="mt-8 flex flex-col gap-3 sm:flex-row sm:items-center">
          {/* Lleva el id que miran el navbar y la barra fija de mobile: los
              dos cambian de estado cuando este botón sale de pantalla. */}
          <CtaWhatsapp id={ID_CTA_HERO} className="h-13 px-7 text-body" />
          <Link
            href="#como-funciona"
            className="inline-flex h-13 items-center justify-center gap-2 rounded-md border border-ink px-7 text-body font-bold text-ink transition-colors hover:bg-surface"
          >
            Ver cómo funciona
            <span aria-hidden className="text-ink-60">
              ↓
            </span>
          </Link>
        </div>

        {/* 5 · La captura, a todo el ancho del contenedor y con su borde
            izquierdo en el mismo eje que el badge, el titular y los botones.

            SON DOS CAPTURAS, no una recortada. Encoger la de escritorio a
            390px deja la tabla en tipografía de 4px, y además muestra el
            producto en el dispositivo equivocado: el lubricentrero que abre
            esto desde el mostrador tiene que ver la app en un teléfono.
            Las dos son reales, del panel andando con las patentes ficticias
            del entorno local, y se regeneran con scripts/capturar-panel.mjs.

            `<picture>` y no dos <Image> con `hidden`: un <img> en
            display:none igual se descarga, así que el celular se bajaría
            también la captura de escritorio. Con <source media> el
            navegador elige una sola, y es la única forma de hacer art
            direction de verdad. Por eso también se pierde next/image acá:
            los archivos ya son webp del tamaño justo.

            LA PORCIÓN VISIBLE ES LA MISMA EN LOS TRES ANCHOS — 60% de cada
            captura. La proporción del marco sale de dividir la de cada
            imagen por 0,6: la de escritorio es 16:10 → 8/3, y la de celular
            390×844 → 10/13. Sin eso se veía media pantalla en un tamaño y
            dos filas en otro. */}
        <div className="relative mt-10 sm:mt-14">
          <div className="aspect-[10/13] overflow-hidden rounded-t-lg border-x border-t border-line md:aspect-[8/3]">
            <picture>
              {/* Dos densidades: la de 1520 alcanza para una pantalla 1x
                  (el hueco tope mide ~1120px de CSS) y la de 2880 es para
                  retina. Sin el srcset, una notebook 1x bajaba el doble de
                  píxeles de los que podía mostrar. */}
              <source
                media="(min-width: 768px)"
                srcSet="/assets/panel-proximos-services-1520.webp 1520w, /assets/panel-proximos-services.webp 2880w"
                sizes="(min-width: 1240px) 1118px, 92vw"
                width={2880}
                height={1800}
              />
              <img
                src="/assets/panel-proximos-services-celular.webp"
                alt="El panel de Fidelli Motors con los próximos services: qué cliente, qué vehículo, cuándo le toca volver y su estado."
                width={780}
                height={1688}
                // Es la imagen del LCP: se pide temprano y sin lazy, que es
                // lo que hacía `priority` en next/image.
                fetchPriority="high"
                decoding="async"
                className="h-auto w-full"
              />
            </picture>
          </div>

          {/* El corte de abajo es un DEGRADADO, no un tajo: la captura se
              desvanece contra el fondo de la página. Va como capa aparte y
              sobre el marco —no adentro— para que también apague los bordes
              laterales; si no, las dos líneas seguían bajando nítidas hasta
              cortarse de golpe.

              El color final es el token del fondo de esta sección, no un
              blanco escrito a mano: cualquier diferencia se ve como costura. */}
          <div
            aria-hidden
            className="pointer-events-none absolute inset-0 bg-[linear-gradient(to_bottom,transparent_0%,transparent_55%,var(--color-base)_100%)]"
          />
        </div>
      </div>
    </section>
  );
}

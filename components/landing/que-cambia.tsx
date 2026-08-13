import Image from "next/image";
import { VideoFeature } from "@/components/landing/video-feature";

// 04 · Qué cambia en tu lubricentro — llevarlo a la situación deseada.
//
// Cuatro filas, una por deseo. En desktop alternan foto/texto y texto/foto;
// en mobile la alternancia desaparece y SIEMPRE va la foto arriba.
//
// Cómo se resuelve la alternancia sin romper el orden de mobile: la imagen
// va siempre primera en el DOM y en las filas pares se manda a la derecha
// con `order` a partir de `lg`. Al revés —texto primero y reordenar en
// mobile— el celular mostraría texto/foto en la mitad de las filas, que es
// justo lo que el spec prohíbe.
//
// TRES DE LAS CUATRO SON VIDEO del producto andando; la 03 sigue con su
// captura. Las cuatro comparten el marco 16:10 —el mismo de las capturas—
// para que la alternancia se lea como un ritmo y no como cuatro piezas
// sueltas. Los videos solo corren mientras se ven y respetan
// prefers-reduced-motion: eso vive en VideoFeature.

//
// Sin íconos decorativos y un solo nivel de título por fila: el número es
// una etiqueta, no un encabezado. El único <h3> es el título.

const FILAS = [
  {
    numero: "01",
    titulo: "Contás con todo en un solo lugar",
    texto:
      "Tus clientes, sus autos y cada service que les hiciste. Buscás por patente y aparece todo: qué aceite lleva, qué filtros, cuándo fue la última vez.",
    video: "/assets/videos/01-todo_en_un_solo_lugar",
    alt: "El panel abierto en Inicio: los services del mes, la retención pendiente y los últimos autos que pasaron por el taller.",
  },
  {
    numero: "02",
    titulo: "Cargás los services como lo hacés a mano",
    texto:
      "Patente, kilómetros, aceite, filtros. Listo. El mismo gesto que hacías en el cartón, en el celular, en 90 segundos.",
    video: "/assets/videos/02-cargalo_como_lo_haces_a_mano",
    alt: "La carga de un service de punta a punta: la patente, los kilómetros, la viscosidad del aceite y los renglones del cartón.",
  },
  {
    numero: "03",
    titulo: "Vas a saber quiénes están próximos a service",
    texto:
      "Con el segundo service el sistema ya sabe cuántos kilómetros hace por día cada auto: estima cuándo vuelve y acierta el 85% de las veces. No tenés que acordarte de nadie.",
    imagen: "/assets/panel-proximos-por-kilometros.webp",
    alt: "La lista de próximos services: cada auto con su último service, los kilómetros a los que le toca el próximo y la fecha estimada de retorno.",
  },
  {
    numero: "04",
    titulo: "Enviás un seguimiento en un solo clic",
    texto:
      "Cada auto pasa por tres estados: próximo, urgente y vencido. En cada uno le mandás un mensaje, hasta tres seguimientos para que no se le pase el service. Cuidás su auto y no perdés el trabajo.",
    video: "/assets/videos/04-envia_seguimientos_en_un_clic",
    alt: "La lista de próximos services con sus tres estados, y el WhatsApp que sale armado al tocar el botón de una fila.",
    // El archivo trae 37px de banda negra arriba, medidos sobre el póster.
    // object-bottom manda todo el recorte del alto al borde superior y se
    // la come entera, sin tocar el pie de la tabla.
    encuadre: "object-bottom",
  },
] as const;

export function QueCambia() {
  return (
    <section
      id="que-cambia"
      aria-labelledby="que-cambia-titulo"
      className="aire-seccion scroll-mt-14 bg-base md:scroll-mt-16"
    >
      <div className="contenedor">
        <h2
          id="que-cambia-titulo"
          className="max-w-3xl text-balance text-h3 font-bold sm:text-h2"
        >
          De cinco planillas a una sola pantalla.
        </h2>

        <div className="mt-12 flex flex-col gap-14 sm:mt-14 sm:gap-16 lg:gap-20">
          {FILAS.map((fila, i) => {
            // Pares (02 y 04) con la foto a la derecha, solo desde lg.
            const fotoALaDerecha = i % 2 === 1;

            return (
              <div
                key={fila.numero}
                className="grid items-center gap-6 sm:gap-8 lg:grid-cols-2 lg:gap-14"
              >
                {/* El marco: 16:10 en las cuatro, sea video o captura. */}
                <div
                  className={`aspect-[16/10] overflow-hidden rounded-lg border border-line ${
                    fotoALaDerecha ? "lg:order-2" : ""
                  }`}
                >
                  {"video" in fila ? (
                    <VideoFeature
                      src={fila.video}
                      poster={`${fila.video}.webp`}
                      alt={fila.alt}
                      encuadre={"encuadre" in fila ? fila.encuadre : undefined}
                    />
                  ) : (
                    <Image
                      src={fila.imagen}
                      alt={fila.alt}
                      width={2880}
                      height={1800}
                      sizes="(min-width: 1024px) 50vw, 100vw"
                      className="size-full object-cover"
                    />
                  )}
                </div>

                <div>
                  {/* El número es una etiqueta, no un encabezado: un solo
                      nivel de título por fila. En ink-60 y no en ink-40,
                      que a 12px no llega al AA de cuerpo. */}
                  <p className="font-ui text-label font-semibold tracking-[0.08em] text-ink-60 tabular-nums">
                    {fila.numero}
                  </p>
                  <h3 className="mt-2 text-balance text-lead font-bold text-ink sm:text-h3">
                    {fila.titulo}
                  </h3>
                  <p className="mt-3 max-w-[46ch] text-pretty text-body text-ink-60">
                    {fila.texto}
                  </p>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </section>
  );
}

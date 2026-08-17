import Image from "next/image";
import {
  IconoEscanear,
  IconoPatente,
  IconoVerHistorial,
} from "@/components/iconos";
import { Revelar } from "@/components/landing/revelar";

// 05 · La calco — el "y encima" de la página, en UNA sola sección.
//
// Antes eran dos secciones encadenadas (la calco + los tres pasos) con dos
// H2 y un remate en escala de H2: tres golpes de título para una sola
// idea. Ahora es una sección, UN H2, y los pasos van debajo de un label —
// son detalle del objeto, no un capítulo aparte.
//
// El eyebrow "Y lo mejor de todo" se fue: era relleno. La foto habla.
//
// LOS PASOS LLEVAN ÍCONOS, no capturas: las tres imágenes generadas que
// había acá se borraron del repo. Dos de lucide (ScanLine, History) y la
// patente dibujada a mano en el mismo lenguaje —es el objeto central del
// producto y no existe en ninguna librería—. Señalización, nunca acción:
// tinta ink sobre surface, jamás rojo.
//
// EL PERSONAJE NO VA EN EL CIERRE, aunque el pedido lo incluía: la
// sección siguiente es Fidelliza, que abre con el personaje a página
// completa. Ponerlo acá era mostrarlo dos veces seguidas — exactamente la
// repetición que esta pasada vino a matar. El cierre queda tipográfico,
// que con tres golpes se sostiene solo.
//
// SOBRE GRAFITO manda la escala inversa de globals.css. El rojo Motors no
// aparece: la pantalla que la calco abre es la superficie del cliente,
// que se pinta con el color del lubricentro.

const PASOS = [
  {
    numero: "01",
    titulo: "Escanea la calco",
    texto: "Con la cámara. No baja nada.",
    Icono: IconoEscanear,
  },
  {
    numero: "02",
    titulo: "Escribe la patente",
    texto: "Seis caracteres.",
    Icono: IconoPatente,
  },
  {
    numero: "03",
    titulo: "Ve todo el historial",
    texto: "Con fecha, kilómetros y tu logo.",
    Icono: IconoVerHistorial,
  },
] as const;

export function QrYPasos() {
  return (
    <section
      id="qr"
      aria-labelledby="qr-titulo"
      className="aire-seccion scroll-mt-14 bg-ink text-inverso md:scroll-mt-16"
    >
      <div className="contenedor">
        <Revelar className="grid items-center gap-(--espacio-bloque) lg:grid-cols-2 lg:gap-x-14">
          <div>
            <h2
              id="qr-titulo"
              className="text-balance text-h3 font-bold sm:text-h2"
            >
              Una calco en el parasol, y tu cliente tiene todo el historial.
            </h2>

            <p className="mt-(--espacio-h2-lead) max-w-[46ch] text-pretty text-body text-inverso-60 sm:text-lead">
              Tu marca, pegada en el auto de tu cliente.
            </p>
          </div>

          {/* La foto real del calco de Brothers Oil: el ancla de la
              sección. Cuadrada porque el material es cuadrado — entra
              entera, sin recorte. */}
          <div className="aspect-square overflow-hidden rounded-lg border border-inverso-line bg-inverso-line">
            <Image
              src="/assets/calco-en-parasol.webp"
              alt="La calco con el QR de Brothers Oil pegada en el parasol de un auto, vista desde el asiento del conductor, con el taller de fondo."
              width={1254}
              height={1254}
              sizes="(min-width: 1200px) 532px, (min-width: 1024px) 50vw, 100vw"
              className="size-full object-cover"
            />
          </div>
        </Revelar>

        {/* Los pasos del cliente: detalle de la calco, no un capítulo. El
            label reemplaza al H2 que había acá — 12px, tracking abierto,
            en la tinta terciaria de grafito (el ink-40 del spec es de
            fondo claro y sobre #0A0A0A no llega a leerse). */}
        <p className="mt-(--espacio-bloque) font-ui text-label font-semibold tracking-[0.08em] text-inverso-40 uppercase">
          Lo que hace tu cliente
        </p>

        {/* Mobile: columna, con el ícono a la IZQUIERDA alineado al
            título — a 375px el ícono arriba centraba cada paso y la lista
            se estiraba una pantalla entera; en fila, los tres pasos entran
            juntos en el viewport, que es lo que los hace leerse como una
            secuencia. Desktop: tres columnas iguales. */}
        <ol className="mt-6 grid gap-6 sm:mt-8 sm:gap-8 lg:grid-cols-3 lg:gap-10">
          {PASOS.map((paso, i) => (
            <Revelar key={paso.numero} indice={i}>
              <li className="flex items-start gap-4 lg:flex-col lg:gap-5">
                {/* 56px en mobile, 64 en desktop, radio 14. El fondo claro
                    sobre el grafito hace de linterna: los tres íconos son
                    lo único claro entre la foto y el cierre. */}
                <span
                  aria-hidden
                  className="grid size-14 shrink-0 place-items-center rounded-[14px] border border-line bg-surface text-ink lg:size-16"
                >
                  <paso.Icono
                    aria-hidden
                    strokeWidth={1.5}
                    className="size-[26px] lg:size-[28px]"
                  />
                </span>

                <div className="min-w-0">
                  <p className="font-ui text-label font-semibold tracking-[0.08em] text-inverso-40 tabular-nums">
                    {paso.numero}
                  </p>
                  <h3 className="mt-1 text-lead font-bold text-inverso">
                    {paso.titulo}
                  </h3>
                  <p className="mt-1 text-pretty text-body text-inverso-60">
                    {paso.texto}
                  </p>
                </div>
              </li>
            </Revelar>
          ))}
        </ol>

        {/* El cierre, sobre la línea divisoria. Escala de H2 pero como
            párrafo: es un remate de tamaño, no un encabezado — la sección
            ya tiene su único H2 arriba. */}
        <Revelar>
          <div className="mt-(--espacio-bloque) border-t border-inverso-line pt-(--espacio-lead) text-center">
            <p className="text-balance text-h3 font-bold text-inverso sm:text-h2">
              Sin apps. Sin cuenta. Sin contraseña.
            </p>
          </div>
        </Revelar>
      </div>
    </section>
  );
}

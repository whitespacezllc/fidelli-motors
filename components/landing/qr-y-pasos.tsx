import Image from "next/image";

// 05 · La calco  +  06 · Los tres pasos del cliente
//
// Las dos secciones viven en un mismo archivo y las renderiza un solo
// componente porque el spec pide que se lean como UN bloque: comparten el
// fondo grafito y no hay corte entre ellas. Separadas en dos componentes,
// nada impide que mañana alguien meta algo en el medio y rompa el único
// quiebre visual que tiene la página. Acá no se puede.
//
// EL REPARTO DE TRABAJO ENTRE LAS DOS, que antes estaba pisado: la 05
// muestra el OBJETO —una calco pegada en un parasol— y la diferenciación;
// la 06 cuenta los tres pasos. Cuando la 05 narraba el recorrido y además
// mostraba la pantalla del historial, le spoileaba la 06 y las dos perdían.
// Por eso acá la 05 tiene UNA sola imagen y ningún paso.
//
// SOBRE GRAFITO manda la escala inversa de globals.css —inverso,
// inverso-60, inverso-40, inverso-line—, que existe justamente porque
// ink-60 e ink-40 sobre #0A0A0A son ilegibles. Acá no se inventa ninguna
// opacidad suelta.
//
// El rojo Motors NO aparece en las pantallas que se ven en estas fotos, y
// no es casualidad: son de la superficie del cliente, que se pinta con el
// color del lubricentro. Lo rojo que se ve es el logo de Brothers Oil, que
// es justamente de lo que se trata.

// LAS CUATRO FOTOS DE ESTE BLOQUE SON CUADRADAS, y los marcos también:
// entran enteras, sin recorte. Es una condición del material, no una
// decisión de layout — si el reemplazo del viernes no viene en 1:1,
// `object-cover` va a recortarlo. Que lleguen cuadradas.
//
// LAS TRES PIEZAS DE LA 06 SON UNA SERIE, y esta vez lo son de origen:
// misma toma, mismo auto, mismo taller de fondo, y solo cambia lo que pasa
// en la pantalla del celular. Se leen como tres momentos de un mismo gesto
// porque literalmente lo son.
const PASOS = [
  {
    numero: "01",
    titulo: "Escanea la calco",
    texto: "Con la cámara del celular. No baja nada.",
    src: "/assets/escanea-la-calco.webp",
    alt: "Desde el asiento del conductor, dos manos sostienen un celular frente al parasol y la cámara enfoca el QR de la calco.",
  },
  {
    numero: "02",
    titulo: "Escribe la patente",
    texto: "Seis caracteres. Ni mail, ni teléfono, ni registrarse.",
    src: "/assets/escribe-la-patente.webp",
    alt: "En la pantalla del celular, la página de Brothers Oil pide la patente del auto: el campo dice AC992ZG y abajo está el botón para ver el historial.",
  },
  {
    numero: "03",
    titulo: "Ve todo el historial",
    texto: "Cada service, con fecha y kilómetros. Y tu logo arriba.",
    src: "/assets/ve-todo-el-historial.webp",
    alt: "En la pantalla del celular, el historial del VW Polo con el logo de Brothers Oil arriba: el próximo service a los 111.250 km y debajo la lista de trabajos con su fecha y sus kilómetros.",
  },
] as const;

const ETIQUETA = "font-ui text-label font-semibold tracking-[0.08em] uppercase";

export function QrYPasos() {
  return (
    <>
      {/* ============ 05 · La calco ============ */}
      <section
        id="qr"
        aria-labelledby="qr-titulo"
        className="aire-seccion scroll-mt-14 bg-ink text-inverso md:scroll-mt-16"
      >
        <div className="contenedor grid items-center gap-10 lg:grid-cols-2 lg:gap-14">
          <div>
            <p className={`${ETIQUETA} text-inverso-60`}>Y lo mejor de todo</p>

            <h2
              id="qr-titulo"
              className="mt-3 text-balance text-h3 font-bold sm:text-h2"
            >
              Una calco en el parasol, y tu cliente tiene todo el historial del
              auto.
            </h2>

            <p className="mt-4 max-w-[46ch] text-pretty text-body text-inverso-60 sm:text-lead">
              Con tu logo, Tu marca la que queda pegada en el auto de tu
              cliente.
            </p>
          </div>

          {/* UNA sola imagen, y grande: es el ancla de la sección. Lo que
              la separa de la serie de la 06 no es la proporción —las cuatro
              son 1:1— sino que acá no hay ni mano ni celular: es la foto
              del objeto, sola, al tamaño de media pantalla.

              El fondo del marco es un gris apenas levantado del grafito y
              no blanco: mientras la foto carga, un cuadrado blanco sobre
              #0A0A0A es un flash. */}
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
        </div>
      </section>

      {/* ============ 06 · Los tres pasos del cliente ============
          Sin aire arriba: sigue el mismo grafito de la 05 y entre las dos
          no hay ni borde ni cambio de fondo. Son un bloque. */}
      <section
        id="pasos-cliente"
        aria-labelledby="pasos-cliente-titulo"
        className="aire-seccion-pie scroll-mt-14 bg-ink text-inverso md:scroll-mt-16"
      >
        <div className="contenedor">
          <h2
            id="pasos-cliente-titulo"
            className="mx-auto max-w-2xl text-balance text-center text-h3 font-bold sm:text-h2"
          >
            Todo lo que tiene que hacer tu cliente.
          </h2>

          {/* NADA DE CARRUSEL en mobile, y está escrito en el spec con esas
              palabras: un carrusel esconde los pasos 2 y 3, que son
              justamente los que prueban que no hay nada que aprender. Acá
              los tres están siempre a la vista.

              La imagen va ARRIBA del texto también en mobile, y no chica al
              costado como antes: lo que hay que ver es un tipo con el
              celular en la mano dentro del auto, y a 96px de ancho eso no
              se lee. */}
          {/* EN DOS COLUMNAS EL PASO 03 QUEDA HUÉRFANO, con media fila
              vacía al lado: en una secuencia numerada eso se lee como que
              falta algo. Con las fotos cuadradas el vacío es todavía más
              grande que antes. El último se centra ocupando las dos
              columnas pero conservando el ancho de una, así las tres
              tarjetas siguen midiendo lo mismo — que es lo que las hace
              leer como serie. En tres columnas no hay huérfano y se
              devuelve a su celda. */}
          <ol className="mt-10 grid gap-8 sm:mt-12 sm:grid-cols-2 lg:grid-cols-3 lg:gap-10">
            {PASOS.map((paso) => (
              <li
                key={paso.numero}
                className="sm:last:col-span-2 sm:last:mx-auto sm:last:w-[calc(50%-1rem)] lg:last:col-span-1 lg:last:w-auto"
              >
                {/* Marco 1:1 porque la foto es 1:1: entra entera y no se
                    recorta nada. El fondo es el mismo gris apenas levantado
                    de la 05 — el marco tiene que existir antes de que la
                    foto cargue, pero sin destellar en blanco. */}
                <div className="aspect-square overflow-hidden rounded-lg border border-inverso-line bg-inverso-line">
                  <Image
                    src={paso.src}
                    alt={paso.alt}
                    width={1254}
                    height={1254}
                    sizes="(min-width: 1200px) 347px, (min-width: 1024px) 30vw, (min-width: 640px) 45vw, 100vw"
                    className="size-full object-cover"
                  />
                </div>

                <div className="mt-5">
                  <p className={`${ETIQUETA} text-inverso-60 tabular-nums`}>
                    {paso.numero}
                  </p>
                  <h3 className="mt-1.5 text-lead font-bold text-inverso">
                    {paso.titulo}
                  </h3>
                  <p className="mt-1.5 max-w-[46ch] text-pretty text-body text-inverso-60">
                    {paso.texto}
                  </p>
                </div>
              </li>
            ))}
          </ol>

          {/* El remate, centrado sobre la línea divisoria. Va en el escalón
              h2 y no en cuerpo: es el titular del bloque, no un pie. Como
              párrafo y no como <h2>, que ya lo tiene la sección — el escalón
              acá es de tamaño, no de jerarquía.

              VA SOLO, SIN BAJADA. Tenía una que explicaba a quién le
              importa; era condescendiente con el cliente del cliente y no
              agregaba nada que las tres fotos no dijeran ya. Un remate de
              tres golpes se sostiene mejor sin nadie explicándolo. */}
          <div className="mt-12 border-t border-inverso-line pt-10 text-center sm:mt-14 sm:pt-12">
            <p className="text-balance text-h3 font-bold text-inverso sm:text-h2">
              Sin apps. Sin cuenta. Sin contraseña.
            </p>
          </div>
        </div>
      </section>
    </>
  );
}

import { AcordeonPreguntas } from "@/components/landing/acordeon-preguntas";
import { Revelar } from "@/components/landing/revelar";
import { CTA_WHATSAPP } from "@/lib/landing";

// 10 · Preguntas frecuentes — desarmar las dudas.
//
// Una objeción que no respondés se la contesta él solo, y siempre se
// contesta que no.
//
// LAS CUATRO DE ARRIBA VAN ABIERTAS, también en mobile: son las que frenan
// la decisión. Meterlas en el acordeón para ahorrar scroll es justamente lo
// que no hay que hacer, porque una respuesta que hay que ir a buscar no
// desarma nada. Las otras seis sí van plegadas: son dudas de detalle, y
// quien las tiene las busca.

/** El enlace es opcional: hoy solo la primera lo lleva. */
type Abierta = {
  readonly pregunta: string;
  readonly respuesta: string;
  readonly enlace?: { readonly texto: string; readonly href: string };
};

const ABIERTAS: readonly Abierta[] = [
  {
    pregunta: "¿Me lleva más tiempo que el cartón?",
    // "acá" es un ancla real a la simulación de la sección 03. Antes decía
    // "acá arriba" sin enlace, que es pedirle al visitante que scrollee a
    // buscar algo que no sabe dónde está.
    respuesta:
      "No. 90 segundos, y el próximo service se calcula solo. Probalo vos acá.",
    enlace: { texto: "acá", href: "#como-funciona" },
  },
  {
    pregunta: "¿Tengo que cargar mis clientes viejos?",
    // Acá decía "Si tenés Excel, lo migramos nosotros". No existe ninguna
    // importación en el producto y la instalación tampoco la incluye, así
    // que era una promesa que se cobraba el día de la instalación. No se
    // reemplaza por otra: se explica que el historial se arma trabajando.
    respuesta:
      "No. Arrancás con el próximo service de cada uno, y el historial se arma solo a medida que trabajás.",
  },
  {
    pregunta: "¿Y si mis clientes no escanean?",
    respuesta:
      "El orden y los avisos te sirven igual. El QR es el extra, no el motivo.",
  },
  {
    // SOLO CIFRADO EN TRÁNSITO Y AISLAMIENTO POR TENANT. Las dos cosas son
    // verificables: HTTPS de punta a punta y RLS filtrando por
    // lubricentro_id. Cifrado en reposo NO se afirma. Y nada de "100%":
    // CLAUDE-landing lo prohíbe por sostenibilidad y por riesgo legal.
    pregunta: "¿Están seguros los datos de mis clientes?",
    respuesta:
      "Viajan cifrados y están aislados por lubricentro. Nadie más que vos ve los tuyos.",
  },
] as const;

const ACORDEON = [
  {
    pregunta: "¿Quién me lo instala?",
    respuesta:
      "Vamos nosotros a tu local. Lo dejamos funcionando el mismo día, capacitamos a tu equipo y te dejamos el manual de usuario.",
  },
  {
    pregunta: "¿Mi cliente tiene que bajar una app?",
    respuesta:
      "No. Escanea el QR del calco, escribe su patente y ve su historial. Sin app, sin cuenta y sin contraseña.",
  },
  {
    // Verificado contra el código antes de escribirlo: la sesión lleva
    // `lubricentroActivo`, las pantallas usan obtenerSesion() y siguen
    // funcionando, y `sesionParaEscribir()` bloquea toda escritura del
    // panel. El aviso de suspensión ya existe en app/panel/layout.tsx.
    //
    // Esta respuesta tiene que coincidir palabra por palabra con la
    // política de cancelación cuando se escriba /terminos.
    pregunta: "¿Qué pasa con mis datos si me doy de baja?",
    respuesta:
      "Seguís entrando en modo lector: ves todos tus services, clientes y vehículos cuando quieras. Lo único que no vas a poder es cargar nuevos ni editar los que están.",
  },
  {
    // Sin promesa de modo offline: no hay borradores locales, y es una
    // decisión de alcance registrada en CLAUDE.md, no un pendiente.
    pregunta: "¿Y si se cae internet en el taller?",
    respuesta:
      "El sistema necesita conexión. Como cargás desde el celular, si se cae el wifi del local seguís trabajando con los datos del teléfono.",
  },
  {
    // ⚠ RESPUESTA RECORTADA RESPECTO DEL PEDIDO, a propósito.
    //
    // El texto pedido decía "al cargar un trabajo elegís entre service o
    // mecánica y otros". Eso hoy no existe: `services` no tiene ninguna
    // columna de tipo de trabajo, no hay un enum que lo represente y el
    // formulario no ofrece esa opción. Lo único que hay para lo que no es
    // service es el campo de observaciones.
    //
    // Queda escrito con lo que el producto sí hace. Si la función entra
    // antes de publicar, se cambia esta línea y nada más.
    pregunta: "¿Sirve si también hago mecánica?",
    respuesta:
      "Hoy está hecho para el service: cargás el aceite, los filtros y los líquidos, y tenés un campo de observaciones para dejar anotado el resto del trabajo. La versión completa para talleres mecánicos está en el roadmap del producto.",
  },
  {
    // La comparación es contra la CATEGORÍA, no contra una marca. Nombrar a
    // un competidor en tu propia landing es regalarle una búsqueda.
    pregunta: "¿Esto es como los otros sistemas que ya vi?",
    respuesta:
      "Los sistemas de gestión te piden cargar todo antes de servirte para algo. Este hace una cosa sola: ordena tus services y te dice a quién llamar esta semana. Funciona desde el primer día.",
  },
] as const;

// Marcado FAQPage con las DIEZ, y el texto sale de las mismas constantes
// que se renderizan: si mañana cambia una respuesta en pantalla y no en el
// schema, Google marca el rich result como contenido que no coincide.
const SCHEMA_FAQ = {
  "@context": "https://schema.org",
  "@type": "FAQPage",
  mainEntity: [...ABIERTAS, ...ACORDEON].map((f) => ({
    "@type": "Question",
    name: f.pregunta,
    acceptedAnswer: { "@type": "Answer", text: f.respuesta },
  })),
};

/**
 * Renderiza una respuesta que lleva un enlace adentro, partiendo el MISMO
 * string que usa el JSON-LD. Guardar el texto dos veces —uno con JSX y otro
 * plano para el schema— es la forma segura de que terminen diciendo cosas
 * distintas.
 */
function Respuesta({
  texto,
  enlace,
}: {
  texto: string;
  enlace?: { texto: string; href: string };
}) {
  if (!enlace) return texto;
  const corte = texto.lastIndexOf(enlace.texto);
  if (corte === -1) return texto;

  return (
    <>
      {texto.slice(0, corte)}
      {/* En tinta plena y subrayado, NO en rojo: el único rojo de esta
          sección es el WhatsApp del cierre. */}
      <a
        href={enlace.href}
        className="font-semibold text-ink underline decoration-ink-40 underline-offset-2 transition-colors hover:decoration-ink"
      >
        {enlace.texto}
      </a>
      {texto.slice(corte + enlace.texto.length)}
    </>
  );
}

export function Preguntas() {
  return (
    <section
      id="preguntas"
      aria-labelledby="preguntas-titulo"
      className="aire-seccion scroll-mt-14 bg-base md:scroll-mt-16"
    >
      {/* El JSON-LD va escapado: `<` dentro de un <script> puede cerrar la
          etiqueta antes de tiempo. Hoy el contenido es estático y nuestro,
          pero la protección cuesta una línea y sobrevive a que mañana el
          copy salga de otro lado. */}
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{
          __html: JSON.stringify(SCHEMA_FAQ).replace(/</g, "\\u003c"),
        }}
      />

      <div className="contenedor">
        <Revelar className="mx-auto max-w-2xl text-center">
          <h2
            id="preguntas-titulo"
            className="text-balance text-h3 font-bold sm:text-h2"
          >
            Preguntas frecuentes
          </h2>
          <p className="mt-(--espacio-h2-lead) text-pretty text-body text-ink-60 sm:text-lead">
            Lo que nos preguntan antes de decidirse.
          </p>
        </Revelar>

        {/* Las cuatro abiertas. En mobile se apilan pero SIGUEN ABIERTAS. */}
        <div className="mt-(--espacio-lead) grid gap-4 sm:grid-cols-2 sm:gap-5">
          {ABIERTAS.map((f, i) => (
            <Revelar
              key={f.pregunta}
              indice={i}
              className="rounded-lg border border-line bg-base p-5 sm:p-6"
            >
              <h3 className="text-lead font-bold text-ink">{f.pregunta}</h3>
              <p className="mt-2 max-w-[46ch] text-pretty text-body text-ink-60">
                <Respuesta texto={f.respuesta} enlace={f.enlace} />
              </p>
            </Revelar>
          ))}
        </div>

        <Revelar className="mt-4 sm:mt-5">
          <AcordeonPreguntas items={ACORDEON} />
        </Revelar>

        {/* ---------- El remate ----------
            NO es un botón rojo: el CTA primario de la página no se duplica
            acá. Es una salida para el que llegó hasta el final con una duda
            que no está en la lista, y por eso va como enlace de texto. */}
        <Revelar>
        <p className="mt-(--espacio-bloque) text-center text-pretty text-body text-ink sm:text-lead">
          ¿Tenés otra pregunta?{" "}
          <a
            href={CTA_WHATSAPP}
            target="_blank"
            rel="noopener noreferrer"
            className="font-semibold text-brand underline decoration-brand/40 underline-offset-2 transition-colors hover:decoration-brand"
          >
            Escribinos por WhatsApp
          </a>
          .
        </p>
        </Revelar>
      </div>
    </section>
  );
}

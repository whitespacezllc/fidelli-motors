import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { OG_IMAGEN, SITIO_URL, SLUGS_SIN_INDEXAR } from "@/lib/seo";
import { obtenerLanding, type Lubricentro } from "@/lib/cliente/landing";
import { paletaTenant, variablesTenant } from "@/lib/cliente/color";
import { estilosTema } from "@/lib/cliente/tema";
import { normalizarPatente } from "@/lib/texto";
import { MarcaLubricentro } from "@/components/cliente/marca-lubricentro";
import { GuiaPasos } from "@/components/cliente/guia-pasos";
import { BuscadorPatente } from "@/components/cliente/buscador-patente";
import { PatenteNoEncontrada } from "@/components/cliente/patente-no-encontrada";
import { PieConfianza } from "@/components/cliente/pie-confianza";
import { metadataPwa } from "@/lib/pwa";

type Props = {
  params: Promise<{ slug: string }>;
  searchParams: Promise<{ nohay?: string }>;
};

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { slug } = await params;
  const lubricentro = await obtenerLanding(slug);

  if (!lubricentro) {
    return {
      title: { absolute: "Lubricentro no encontrado" },
      robots: { index: false, follow: false },
    };
  }

  // `absolute` en el título: esta página es la vidriera del LUBRICENTRO,
  // no nuestra — el template "| Fidelli Motors" del layout raíz acá no
  // corresponde. La marca de la plataforma ya vive en el pie de confianza.
  const titulo = `${lubricentro.nombre} · Historial de tu auto`;
  const descripcion = `Escribí la patente de tu auto y mirá todo lo que le hicieron en ${lubricentro.nombre}, y cuándo te toca volver.`;

  return {
    title: { absolute: titulo },
    description: descripcion,
    alternates: { canonical: `/${slug}` },
    // Se indexa a propósito: es la vidriera del lubricentro y le suma. La
    // página de la patente —un vehículo identificable— es la que va
    // noindex, en su propia ruta.
    //
    // La excepción es `demo` y cualquier otro tenant de la lista: existe y
    // se le puede pasar el link a un prospecto, pero no es un negocio real
    // y no compite en el buscador. El sitemap usa la misma lista.
    robots: SLUGS_SIN_INDEXAR.includes(slug)
      ? { index: false, follow: true }
      : { index: true, follow: true },
    // La imagen es la general de la marca, NO el logo del lubricentro:
    // la tarjeta grande de WhatsApp exige 1200×630 con dimensiones
    // declaradas, y un logo cuadrado de tamaño desconocido la degrada a
    // miniatura. El día que cada lubricentro tenga su propia pieza en esa
    // proporción, entra acá.
    openGraph: {
      title: titulo,
      description: descripcion,
      url: `/${slug}`,
      siteName: "Fidelli Motors",
      locale: "es_AR",
      type: "website",
      images: [OG_IMAGEN],
    },
    twitter: {
      card: "summary_large_image",
      title: titulo,
      description: descripcion,
      images: [OG_IMAGEN.url],
    },
    // El manifest del lubricentro: agregar esta página a la pantalla de
    // inicio tiene que abrir SU página, no la landing comercial de
    // Fidelli. Lleva su nombre, su color y su logo.
    ...metadataPwa(`/${slug}/manifest.webmanifest`, lubricentro.nombre),
  };
}

// JSON-LD del lubricentro: AutoRepair, el subtipo de LocalBusiness que
// corresponde. SOLO los campos que existen de verdad en el registro — un
// campo inventado o vacío es peor que ausente, así que dirección y
// teléfono entran únicamente si la primera sucursal los tiene cargados.
// `horarios` es texto libre del dueño y no el formato que openingHours
// espera, así que no se emite; geo no existe en la base.
function datosLubricentro(slug: string, lubricentro: Lubricentro) {
  const conDireccion = lubricentro.sucursales.find((s) => s.direccion);
  const conTelefono = lubricentro.sucursales.find((s) => s.telefono);
  const redes = [
    lubricentro.contacto.instagram,
    lubricentro.contacto.facebook,
  ].filter((u): u is string => !!u && u.startsWith("http"));

  return {
    "@context": "https://schema.org",
    "@type": "AutoRepair",
    name: lubricentro.nombre,
    url: `${SITIO_URL}/${slug}`,
    ...(lubricentro.logoUrl ? { image: lubricentro.logoUrl } : {}),
    ...(conTelefono ? { telephone: conTelefono.telefono } : {}),
    ...(conDireccion
      ? {
          address: {
            "@type": "PostalAddress",
            streetAddress: conDireccion.direccion,
            addressCountry: "AR",
          },
        }
      : {}),
    ...(redes.length ? { sameAs: redes } : {}),
  };
}

// La mini-landing del lubricentro. Es la puerta de entrada del cliente
// final: llega escaneando el QR del parasol, dos o tres veces al año, sin
// que nadie le haya explicado nada.
//
// Sin dispositivo recordado, por decisión estructural del flow: cada
// escaneo aterriza acá. No se guarda la patente ni se redirige solo — cada
// visita es tráfico y re-exposición de la marca del lubricentro.
export default async function PaginaLanding({ params, searchParams }: Props) {
  const { slug } = await params;
  const { nohay } = await searchParams;

  // El slug no existe o el lubri está inactivo: los dos casos se ven igual
  // y responden 404. Ver app/(cliente)/[slug]/not-found.tsx.
  const lubricentro = await obtenerLanding(slug);
  if (!lubricentro) notFound();

  // Llega del redirect de la búsqueda, no de una consulta: mostrar el
  // mensaje no vuelve a llamar a get_carton, así que recargar la pantalla
  // no registra un segundo lead.
  const patenteSinResultado = nohay ? normalizarPatente(nohay) : null;

  const paleta = paletaTenant(lubricentro.colorPrimario, lubricentro.tema);

  return (
    // El único lugar donde entra el color del lubri: de acá para abajo,
    // `bg-tenant`, `text-tenant` y el anillo de foco lo leen de las cuatro
    // variables. El shell de arriba es neutro.
    //
    // El tema lo elige EL LUBRICENTRO y vale para todos los que escanean:
    // no hay prefers-color-scheme acá a propósito — con la preferencia
    // del sistema, la página de un taller oscuro se vería clara para la
    // mitad de sus clientes. En oscuro, estilosTema pisa las variables de
    // tinta con la escala sobre grafito; en claro, aplica el fondo del
    // lubri o no toca nada.
    <div
      style={{
        ...variablesTenant(paleta),
        ...estilosTema(lubricentro.tema, lubricentro.colorFondo),
      }}
      className="flex min-h-full flex-1 flex-col"
    >
      {/* Escapado como el resto de los JSON-LD: un `<` dentro de un
          <script> puede cerrar la etiqueta antes de tiempo. */}
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{
          __html: JSON.stringify(datosLubricentro(slug, lubricentro)).replace(
            /</g,
            "\\u003c",
          ),
        }}
      />
      {/* El buscador ocupa el centro de la pantalla apenas carga, sin
          scroll para llegar al input: es lo primero que pide el flow. La
          misma estructura sostiene los tres tamaños —cambia el ancho y el
          aire, no el orden— para que la pantalla se lea igual en todos.

          El centrado va con `m-auto` y no con `justify-center`: cuando el
          contenido no entra (celular chico, texto agrandado por el
          sistema), centrar reparte el desborde para los dos lados y la
          marca queda arriba del scroll, inalcanzable. Los márgenes auto
          colapsan a cero cuando el espacio libre es negativo, así que ahí
          el contenido se apoya arriba y se puede scrollear entero. */}
      <main className="flex flex-1 flex-col px-5 py-8 sm:px-8 sm:py-12 lg:py-10">
        <div className="m-auto w-full max-w-md sm:max-w-xl lg:max-w-2xl">
          <MarcaLubricentro lubricentro={lubricentro} />

          <div className="mt-8 sm:mt-10">
            <GuiaPasos />
          </div>

          <div className="mt-8 sm:mt-10">
            <BuscadorPatente
              slug={slug}
              valorInicial={patenteSinResultado ?? undefined}
            />
          </div>

          {patenteSinResultado && (
            <div className="mt-6 sm:mt-8">
              <PatenteNoEncontrada
                patente={patenteSinResultado}
                lubricentro={lubricentro}
              />
            </div>
          )}
        </div>
      </main>

      <PieConfianza lubricentro={lubricentro} />
    </div>
  );
}

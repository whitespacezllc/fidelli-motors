import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { obtenerLanding } from "@/lib/cliente/landing";
import { paletaTenant, variablesTenant } from "@/lib/cliente/color";
import { normalizarPatente } from "@/lib/texto";
import { MarcaLubricentro } from "@/components/cliente/marca-lubricentro";
import { GuiaPasos } from "@/components/cliente/guia-pasos";
import { BuscadorPatente } from "@/components/cliente/buscador-patente";
import { PatenteNoEncontrada } from "@/components/cliente/patente-no-encontrada";
import { PieConfianza } from "@/components/cliente/pie-confianza";

type Props = {
  params: Promise<{ slug: string }>;
  searchParams: Promise<{ nohay?: string }>;
};

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { slug } = await params;
  const lubricentro = await obtenerLanding(slug);

  if (!lubricentro) return { title: "Lubricentro no encontrado" };

  return {
    title: `${lubricentro.nombre} — Historial de tu auto`,
    description: `Escribí la patente de tu auto y mirá todo lo que le hicieron en ${lubricentro.nombre}, y cuándo te toca volver.`,
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

  const paleta = paletaTenant(lubricentro.colorPrimario);

  return (
    // El único lugar donde entra el color del lubri: de acá para abajo,
    // `bg-tenant`, `text-tenant` y el anillo de foco lo leen de las cuatro
    // variables. El shell de arriba es neutro.
    <div
      style={{
        ...variablesTenant(paleta),
        // El fondo elegido por el lubri. Sin configurar, el blanco de
        // siempre — la clase no cambia, solo se pisa el color.
        ...(lubricentro.colorFondo
          ? { backgroundColor: lubricentro.colorFondo }
          : {}),
      }}
      className="flex min-h-full flex-1 flex-col"
    >
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

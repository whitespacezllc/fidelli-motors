import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { obtenerLanding } from "@/lib/cliente/landing";
import { paletaTenant, variablesTenant } from "@/lib/cliente/color";
import { formatearPatente, normalizarPatente } from "@/lib/texto";

type Props = { params: Promise<{ slug: string; patente: string }> };

export const metadata: Metadata = { title: "Tu auto" };

// PLACEHOLDER — el cartón digital del vehículo es la tarea siguiente del
// sprint. Por ahora esta ruta solo confirma que la búsqueda encontró la
// patente y la muestra; toda la pieza (próximo service, último cartón,
// progreso de fidelización, historial) se construye después con get_carton.
export default async function PaginaVehiculo({ params }: Props) {
  const { slug, patente } = await params;

  const lubricentro = await obtenerLanding(slug);
  if (!lubricentro) notFound();

  const paleta = paletaTenant(lubricentro.colorPrimario);

  return (
    <div style={variablesTenant(paleta)} className="flex min-h-full flex-1 flex-col">
      <main className="flex flex-1 flex-col px-5 py-12 sm:px-8">
        <div className="m-auto w-full max-w-md text-center sm:max-w-lg">
          <p className="text-c-body text-ink-60">{lubricentro.nombre}</p>
          <p className="plate mt-2 text-c-plate sm:text-h2">
            {formatearPatente(normalizarPatente(patente))}
          </p>

          <p className="mt-6 rounded-lg border border-tenant bg-tenant-soft p-5 text-c-body text-ink-60">
            Acá va el cartón digital de tu auto. Todavía lo estamos armando.
          </p>

          <Link
            href={`/${slug}`}
            className="mt-6 flex min-h-16 w-full items-center justify-center rounded-md border-2 border-tenant bg-base px-4 py-3 text-c-lead font-bold text-tenant transition-colors hover:bg-tenant-soft"
          >
            Buscar otra patente
          </Link>
        </div>
      </main>
    </div>
  );
}

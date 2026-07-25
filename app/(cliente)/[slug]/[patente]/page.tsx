import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { obtenerCarton, marcadosDe } from "@/lib/cliente/carton";
import { paletaTenant, variablesTenant } from "@/lib/cliente/color";
import { formatearPatente, normalizarPatente } from "@/lib/texto";
import { CabeceraVehiculo } from "@/components/cliente/cabecera-vehiculo";
import { ProximoService } from "@/components/cliente/proximo-service";
import { ProgresoFidelizacion } from "@/components/cliente/progreso-fidelizacion";
import { HistorialCartones } from "@/components/cliente/historial-cartones";
import { BotonTurno } from "@/components/cliente/boton-turno";
import { SinHistorial } from "@/components/cliente/sin-historial";
import { PatenteNoEncontrada } from "@/components/cliente/patente-no-encontrada";
import { PieConfianza } from "@/components/cliente/pie-confianza";
import { CartonPapel } from "@/components/services/carton-papel";

type Props = { params: Promise<{ slug: string; patente: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { patente } = await params;
  return { title: `${formatearPatente(patente)} — Tu historial` };
}

// El cartón digital del vehículo: la pieza estrella. Es lo que Pedro abre
// dos veces al año con una sola pregunta —¿cuándo me toca?— y lo que Bruno
// le muestra a un colega para explicar qué compró.
//
// Todo sale de una sola llamada a get_carton, que ya aplica campos_visibles
// del tenant. Nada de consultas adicionales.
export default async function PaginaVehiculo({ params }: Props) {
  const { slug, patente } = await params;
  const resultado = await obtenerCarton(slug, patente);

  if (resultado.estado === "lubricentro_no_encontrado") notFound();

  // La patente que no aparece es un lead, no un error: mismo mensaje que en
  // la landing, con el WhatsApp del lubri. Nunca un 404 pelado.
  if (resultado.estado === "patente_no_encontrada") {
    const paleta = paletaTenant(resultado.lubricentro.colorPrimario);
    return (
      <div style={variablesTenant(paleta)} className="flex min-h-full flex-1 flex-col">
        <main className="flex flex-1 flex-col px-5 py-8 sm:px-8 sm:py-12">
          <div className="m-auto w-full max-w-md sm:max-w-xl">
            <PatenteNoEncontrada
              patente={normalizarPatente(patente)}
              lubricentro={resultado.lubricentro}
            />
          </div>
        </main>
        <PieConfianza lubricentro={resultado.lubricentro} />
      </div>
    );
  }

  const { lubricentro, vehiculo, fidelizacion, services } = resultado.carton;
  const paleta = paletaTenant(lubricentro.colorPrimario);
  const ultimo = services[0] ?? null;
  const anteriores = services.slice(1);

  return (
    <div style={variablesTenant(paleta)} className="flex min-h-full flex-1 flex-col">
      <main className="flex-1 px-4 py-6 sm:px-8 sm:py-10">
        <div className="mx-auto w-full max-w-md sm:max-w-xl lg:max-w-5xl">
          <CabeceraVehiculo lubricentro={lubricentro} vehiculo={vehiculo} />

          {!ultimo ? (
            <div className="mt-6 flex flex-col gap-6 sm:mt-8 sm:gap-8">
              <SinHistorial />
              <BotonTurno lubricentro={lubricentro} patente={vehiculo.patente} />
            </div>
          ) : (
            // En desktop el cartón no se estira: es un objeto de papel de
            // ancho fijo, y agrandarlo mentiría sobre lo que Pedro ve en el
            // celular. Lo que hace el ancho de más es poner a su lado la
            // respuesta y el resto, en vez de obligar a scrollear. Mismo
            // criterio que la previsualización del panel.
            //
            // El orden del DOM es el de mobile, que es el que manda: primero
            // la respuesta, después el cartón. En desktop la grilla reubica
            // el cartón a la izquierda con col-start/row-start, sin tocar el
            // orden de lectura ni el de tabulación.
            <div className="mt-6 grid gap-6 sm:mt-8 sm:gap-8 lg:grid-cols-[minmax(0,26rem)_1fr] lg:items-start">
              {/* 1. La única pregunta que Pedro trae, arriba de todo */}
              <div className="lg:col-start-2 lg:row-start-1">
                <ProximoService
                  proxServiceKm={ultimo.proxServiceKm}
                  kmUltimoService={ultimo.kilometros}
                />
              </div>

              {/* 2. El cartón, tal cual el papel del parasol. Se topa el
                  ancho desde tablet: estirado a 576px dejaría de parecerse
                  a lo que cuelga del parasol y a lo que ve Pedro en la mano. */}
              <div className="sm:mx-auto sm:w-full sm:max-w-[26rem] lg:sticky lg:top-8 lg:col-start-1 lg:row-start-1 lg:row-span-2 lg:mx-0 lg:max-w-none">
                <CartonPapel
                  escala="cliente"
                  datos={{
                    lubricentroNombre: lubricentro.nombre,
                    colorTenant: paleta.primary,
                    fecha: ultimo.fecha,
                    kilometros: ultimo.kilometros,
                    aceiteTipo: ultimo.aceiteTipo,
                    proxServiceKm: ultimo.proxServiceKm,
                    marcados: marcadosDe(ultimo),
                  }}
                />
                {/* La sucursal y el producto van afuera de la grilla del
                    papel: en el cartón físico ninguno tiene renglón. La
                    sucursal se muestra para que el último service no quede
                    asimétrico con el historial, que la indica en cada fila.
                    Los dos respetan campos_visibles sin lógica propia: si
                    el lubri apagó mostrar_sucursal o mostrar_productos,
                    get_carton los manda en null y acá no se renderizan. */}
                {(ultimo.sucursal || ultimo.aceiteNombre) && (
                  <div className="mt-3 flex flex-col gap-1 text-center text-c-body text-ink-60">
                    {ultimo.sucursal && <p>Hecho en {ultimo.sucursal}</p>}
                    {ultimo.aceiteNombre && (
                      <p>
                        Aceite:{" "}
                        <span className="text-ink">{ultimo.aceiteNombre}</span>
                      </p>
                    )}
                  </div>
                )}
              </div>

              {/* 3. Fidelización, historial y el único CTA */}
              <div className="flex flex-col gap-6 sm:gap-8 lg:col-start-2 lg:row-start-2">
                {fidelizacion && (
                  <ProgresoFidelizacion fidelizacion={fidelizacion} />
                )}

                <HistorialCartones
                  services={anteriores}
                  lubricentroNombre={lubricentro.nombre}
                  colorTenant={paleta.primary}
                />

                <BotonTurno
                  lubricentro={lubricentro}
                  patente={vehiculo.patente}
                />
              </div>
            </div>
          )}
        </div>
      </main>

      <PieConfianza lubricentro={lubricentro} />
    </div>
  );
}

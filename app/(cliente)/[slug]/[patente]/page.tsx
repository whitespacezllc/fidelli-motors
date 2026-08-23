import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { obtenerCarton, marcadosDe } from "@/lib/cliente/carton";
import { paletaTenant, variablesTenant } from "@/lib/cliente/color";
import { estilosTema, ESTILO_PAPEL } from "@/lib/cliente/tema";
import { MensajeTaller } from "@/components/cliente/mensaje-taller";
import { formatearPatente, normalizarPatente } from "@/lib/texto";
import { CabeceraVehiculo } from "@/components/cliente/cabecera-vehiculo";
import { ProximoService } from "@/components/cliente/proximo-service";
import { ProgresoFidelizacion } from "@/components/cliente/progreso-fidelizacion";
import { Recomendaciones } from "@/components/cliente/recomendaciones";
import { PendientesTaller } from "@/components/cliente/pendientes-taller";
import { HistorialCartones } from "@/components/cliente/historial-cartones";
import { BotonTurno } from "@/components/cliente/boton-turno";
import { SinHistorial } from "@/components/cliente/sin-historial";
import { PatenteNoEncontrada } from "@/components/cliente/patente-no-encontrada";
import { PieConfianza } from "@/components/cliente/pie-confianza";
import {
  CartonPapel,
  CartonPapelMecanica,
} from "@/components/services/carton-papel";
import { renglonesLibres } from "@/lib/cliente/carton";

type Props = { params: Promise<{ slug: string; patente: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { patente } = await params;
  return {
    // `absolute`: superficie del lubricentro, sin el template de marca.
    title: { absolute: `${formatearPatente(patente)} · Tu historial` },
    // Pública por diseño, indexable no: la patente está en la chapa a la
    // vista de cualquiera, pero que buscarla en Google devuelva el
    // historial de service del auto es otra cosa. El que la sabe entra;
    // el buscador no la lista. La landing /[slug] sí se indexa — es la
    // vidriera del lubricentro.
    robots: { index: false, follow: false },
  };
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
    const paleta = paletaTenant(
      resultado.lubricentro.colorPrimario,
      resultado.lubricentro.tema,
    );
    return (
      <div
        style={{
          ...variablesTenant(paleta),
          ...estilosTema(resultado.lubricentro.tema, resultado.lubricentro.colorFondo),
        }}
        className="flex min-h-full flex-1 flex-col"
      >
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

  const {
    lubricentro,
    mensajeTaller,
    whatsappTaller,
    vehiculo,
    notas,
    pendientes,
    fidelizacion,
    services,
  } = resultado.carton;
  const paleta = paletaTenant(lubricentro.colorPrimario, lubricentro.tema);
  // El cartón destacado y la respuesta de "¿cuándo me toca?" salen del
  // último SERVICE — es lo que gobierna el próximo cambio de aceite y lo
  // que replica el papel del parasol. Si el auto solo tiene mecánica (el
  // caso taller), el destacado es el último trabajo. El resto va todo
  // junto al historial, en una sola línea de tiempo con los dos tipos.
  const ultimoService = services.find((s) => s.tipo === "service") ?? null;
  const ultimo = ultimoService ?? services[0] ?? null;
  const anteriores = services.filter((s) => s !== ultimo);

  return (
    <div
      style={{
        ...variablesTenant(paleta),
        // El tema es del lubricentro, para todos los que escanean — ver
        // la nota en la landing del slug. El cartón queda afuera del
        // apagón a propósito: es papel (reset más abajo).
        ...estilosTema(lubricentro.tema, lubricentro.colorFondo),
      }}
      className="flex min-h-full flex-1 flex-col"
    >
      <main className="flex-1 px-4 py-6 sm:px-8 sm:py-10">
        <div className="mx-auto w-full max-w-md sm:max-w-xl lg:max-w-5xl">
          <CabeceraVehiculo lubricentro={lubricentro} vehiculo={vehiculo} />

          {!ultimo ? (
            <div className="mt-6 flex flex-col gap-6 sm:mt-8 sm:gap-8">
              <SinHistorial />
              {/* Una nota o un pendiente pueden existir antes del primer
                  service cargado. */}
              <Recomendaciones notas={notas} />
              <PendientesTaller pendientes={pendientes} />
              <BotonTurno
                lubricentro={lubricentro}
                whatsappTaller={whatsappTaller}
                patente={vehiculo.patente}
              />
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
              {ultimoService?.proxServiceKm != null &&
                ultimoService.kilometros != null && (
                  <div className="lg:col-start-2 lg:row-start-1">
                    <ProximoService
                      proxServiceKm={ultimoService.proxServiceKm}
                      kmUltimoService={ultimoService.kilometros}
                    />
                  </div>
                )}

              {/* 2. El cartón, tal cual el papel del parasol. Se topa el
                  ancho desde tablet: estirado a 576px dejaría de parecerse
                  a lo que cuelga del parasol y a lo que ve Pedro en la mano. */}
              <div className="sm:mx-auto sm:w-full sm:max-w-[26rem] lg:sticky lg:top-8 lg:col-start-1 lg:row-start-1 lg:row-span-2 lg:mx-0 lg:max-w-none">
                {/* El papel no se apaga: en modo oscuro el cartón sigue
                    siendo un recibo claro sobre el mostrador oscuro — la
                    metáfora se refuerza. El reset devuelve la tinta clara
                    SOLO adentro del papel; el "Hecho en" de abajo queda
                    afuera y acompaña al tema. */}
                <div style={ESTILO_PAPEL}>
                {ultimo.tipo === "mecanica" ? (
                  <CartonPapelMecanica
                    escala="cliente"
                    datos={{
                      lubricentroNombre: lubricentro.nombre,
                      colorTenant: paleta.primary,
                      colorPapel: lubricentro.colorCarton,
                      fecha: ultimo.fecha,
                      kilometros: ultimo.kilometros,
                      descripcion: ultimo.trabajoDescripcion ?? "",
                      renglones: renglonesLibres(ultimo),
                    }}
                  />
                ) : (
                  <CartonPapel
                    escala="cliente"
                    datos={{
                      lubricentroNombre: lubricentro.nombre,
                      colorTenant: paleta.primary,
                      fecha: ultimo.fecha,
                      kilometros: ultimo.kilometros ?? 0,
                      aceiteTipo: ultimo.aceiteTipo ?? "",
                      // El producto va EN el cartón (renglón "Aceite marca"):
                      // pedido de Brothers — antes era una línea suelta acá
                      // abajo y se perdía. Respeta campos_visibles sin lógica
                      // propia: apagado, get_carton lo manda null y la fila
                      // no se dibuja.
                      aceiteNombre: ultimo.aceiteNombre,
                      proxServiceKm: ultimo.proxServiceKm ?? 0,
                      colorPapel: lubricentro.colorCarton,
                      marcados: marcadosDe(ultimo),
                    }}
                  />
                )}
                </div>
                {/* La sucursal sí queda afuera: en el cartón físico no
                    tiene renglón. Se muestra para que el último service no
                    quede asimétrico con el historial, que la indica en
                    cada fila. Respeta mostrar_sucursal vía get_carton. */}
                {ultimo.sucursal && (
                  <p className="mt-3 text-center text-c-body text-ink-60">
                    Hecho en {ultimo.sucursal}
                  </p>
                )}
              </div>

              {/* 3. Recomendaciones, fidelización, historial y el CTA.
                  Las notas van primero: después del cartón y antes de los
                  cartones anteriores — es información sobre el auto, y
                  "cubiertas para cambio" importa más que el progreso del
                  premio. */}
              <div className="flex flex-col gap-6 sm:gap-8 lg:col-start-2 lg:row-start-2">
                {/* El momento de mayor intención del mes: entre el
                    próximo service y el historial, sin tapar nada. */}
                {mensajeTaller && (
                  <MensajeTaller
                    mensaje={mensajeTaller}
                    nombreLubricentro={lubricentro.nombre}
                  />
                )}

                <Recomendaciones notas={notas} />

                <PendientesTaller pendientes={pendientes} />

                {fidelizacion && (
                  <ProgresoFidelizacion fidelizacion={fidelizacion} />
                )}

                <HistorialCartones
                  services={anteriores}
                  lubricentroNombre={lubricentro.nombre}
                  colorTenant={paleta.primary}
                  colorPapel={lubricentro.colorCarton}
                />

                <BotonTurno
                  lubricentro={lubricentro}
                  whatsappTaller={whatsappTaller}
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

import type { Metadata } from "next";
import { notFound } from "next/navigation";
import {
  obtenerCarton,
  marcadosDe,
  renglonesLibres,
  type Carton,
  type ServiceCarton,
} from "@/lib/cliente/carton";
import {
  paletaTenant,
  variablesTenant,
  type PaletaTenant,
} from "@/lib/cliente/color";
import { proximosDelCliente } from "@/lib/cliente/proximos";
import { estilosTema, ESTILO_PAPEL } from "@/lib/cliente/tema";
import type { TipoTrabajo } from "@/lib/trabajos";
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
  CartonPapelCaja,
  CartonPapelMecanica,
  CartonPapelNeumaticos,
} from "@/components/services/carton-papel";
import { metadataPwa } from "@/lib/pwa";

type Props = { params: Promise<{ slug: string; patente: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { slug, patente } = await params;
  return {
    // `absolute`: superficie del lubricentro, sin el template de marca.
    title: { absolute: `${formatearPatente(patente)} · Tu historial` },
    // El acceso directo al cartón de ESTE auto: el QR del parasol se
    // escanea una vez y el ícono queda en el teléfono. El manifest se
    // arma solo con la URL —el nombre y el color del lubricentro los
    // resuelve el route handler—, así esta pantalla sigue costando una
    // sola consulta.
    // La patente como nombre del ícono: es lo que distingue un auto de
    // otro cuando el mismo cliente se guarda dos.
    ...metadataPwa(
      `/${slug}/${normalizarPatente(patente)}/manifest.webmanifest`,
      formatearPatente(patente),
    ),
    // Pública por diseño, indexable no: la patente está en la chapa a la
    // vista de cualquiera, pero que buscarla en Google devuelva el
    // historial de service del auto es otra cosa. El que la sabe entra;
    // el buscador no la lista. La landing /[slug] sí se indexa — es la
    // vidriera del lubricentro.
    robots: { index: false, follow: false },
  };
}

// EL PAPEL DEL CARTÓN DESTACADO, por tipo. Era un ternario —neumáticos,
// mecánica y, por descarte, el cartón de aceite—, y con el cuarto tipo un
// service de caja caía en el cartón de ACEITE sin dar ningún error: el
// compilador no ve un ternario. A un Record lo obliga a contestar por
// cada tipo, y el quinto no compila hasta tener su papel (la historia
// entera está en lib/trabajos.ts).
type Destacado = {
  ultimo: ServiceCarton;
  lubricentro: Carton["lubricentro"];
  paleta: PaletaTenant;
  vehiculo: Carton["vehiculo"];
};

const PAPEL_POR_TIPO: Record<
  TipoTrabajo,
  (destacado: Destacado) => React.ReactNode
> = {
  service: ({ ultimo, lubricentro, paleta, vehiculo }) => (
    <CartonPapel
      escala="cliente"
      datos={{
        lubricentroNombre: lubricentro.nombre,
        colorTenant: paleta.primary,
        fecha: ultimo.fecha,
        kilometros: ultimo.kilometros ?? 0,
        aceiteTipo: ultimo.aceiteTipo ?? "",
        // El producto va EN el cartón (renglón "Aceite marca"): pedido de
        // Brothers — antes era una línea suelta debajo del cartón y se
        // perdía. Respeta campos_visibles sin lógica propia: apagado,
        // get_carton lo manda null y la fila no se dibuja.
        aceiteNombre: ultimo.aceiteNombre,
        proxServiceKm: ultimo.proxServiceKm ?? 0,
        colorPapel: lubricentro.colorCarton,
        // El mismo papel que ve el mecánico: el de la clase.
        clase: vehiculo.clase,
        marcados: marcadosDe(ultimo),
      }}
    />
  ),
  mecanica: ({ ultimo, lubricentro, paleta }) => (
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
  ),
  neumaticos: ({ ultimo, lubricentro, paleta }) => (
    <CartonPapelNeumaticos
      escala="cliente"
      datos={{
        lubricentroNombre: lubricentro.nombre,
        colorTenant: paleta.primary,
        colorPapel: lubricentro.colorCarton,
        fecha: ultimo.fecha,
        kilometros: ultimo.kilometros,
        alineacion: ultimo.alineacion ?? false,
        ruedas: ultimo.ruedas,
        beneficio:
          ultimo.beneficioHastaKm != null && ultimo.beneficioHastaFecha
            ? { hastaKm: ultimo.beneficioHastaKm, hastaFecha: ultimo.beneficioHastaFecha }
            : null,
      }}
    />
  ),
  // El service de caja: la misma hoja que el cartón de aceite, con su
  // aceite, sus cuatro renglones y SU próximo. Solo llega a destacado
  // cuando el auto no tiene ningún service.
  caja: ({ ultimo, lubricentro, paleta }) => (
    <CartonPapelCaja
      escala="cliente"
      datos={{
        lubricentroNombre: lubricentro.nombre,
        colorTenant: paleta.primary,
        colorPapel: lubricentro.colorCarton,
        fecha: ultimo.fecha,
        kilometros: ultimo.kilometros ?? 0,
        aceiteTipo: ultimo.aceiteTipo ?? "",
        aceiteNombre: ultimo.aceiteNombre,
        proxCajaKm: ultimo.proxCajaKm ?? 0,
        marcados: marcadosDe(ultimo),
      }}
    />
  ),
};

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
  // El cartón destacado sale del último SERVICE — es lo que replica el
  // papel del parasol. Si el auto no tiene ninguno, el destacado es su
  // último trabajo, del tipo que sea: una mecánica, un trabajo de gomería
  // o un service de caja, cada uno con su papel. El resto va todo junto al
  // historial, en una sola línea de tiempo con los cuatro tipos.
  const ultimoService = services.find((s) => s.tipo === "service") ?? null;
  const ultimo = ultimoService ?? services[0] ?? null;
  const anteriores = services.filter((s) => s !== ultimo);
  // La respuesta de "¿cuándo me toca?" ya no sale del destacado: son dos
  // preguntas —el próximo service y el próximo service de caja— y cada una
  // se contesta con el último trabajo de su tipo. Un auto que solo tiene
  // mecánica o gomería sigue sin ese bloque, como siempre.
  const proximos = proximosDelCliente(services);

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
              {/* 1. Lo que Pedro vino a preguntar, arriba de todo: cuándo
                  le toca el service y, si acá le atendieron la caja,
                  cuándo le toca la caja. Con uno de los dos alcanza. */}
              {(proximos.service || proximos.caja) && (
                <div className="lg:col-start-2 lg:row-start-1">
                  <ProximoService
                    service={proximos.service}
                    caja={proximos.caja}
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
                  {PAPEL_POR_TIPO[ultimo.tipo]({
                    ultimo,
                    lubricentro,
                    paleta,
                    vehiculo,
                  })}
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
              {/* min-w-0: un item de grilla NO baja de su ancho
                  min-content salvo que se lo digan, y acá adentro vive el
                  historial, donde el papel de un trabajo de gomería pide
                  más de lo que la columna ofrece en un celular de 390. Sin
                  esto, la columna se estira y TODA la página —el próximo
                  service incluido— se corre 8px al costado. No cambia nada
                  donde nadie pide de más, que es el resto de los casos. */}
              <div className="flex min-w-0 flex-col gap-6 sm:gap-8 lg:col-start-2 lg:row-start-2">
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
                  clase={vehiculo.clase}
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

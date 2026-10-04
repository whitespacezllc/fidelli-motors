import { formatearKm } from "@/lib/renglones";
import type { ProximoDelCliente } from "@/lib/cliente/proximos";

// La pregunta que Pedro trae en la cabeza —¿cuándo me toca?—, respondida
// arriba de todo y sin scroll. La tarjeta sola es el único display de 52px
// del producto.
//
// SOLO EL KM, NUNCA UNA FECHA ESTIMADA. El kilometraje es un dato que
// declaró el mecánico y es incuestionable. La fecha estimada existe —la
// calcula vista_proximos_service— pero es herramienta del panel para saber
// a quién llamar: mostrársela al cliente con poco historial da fechas malas
// y reclamos. Acá no entra. Vale para las dos tarjetas: la caja tiene su
// vista_proximos_caja, y tampoco entra.
//
// SON DOS PREGUNTAS, NO UNA. La caja automática tiene su propio próximo
// (prox_caja_km) y el cambio de aceite no se entera: ninguno de los dos
// pisa ni corre al otro. Cada tarjeta contesta con el último trabajo de su
// tipo (lib/cliente/proximos.ts). Con los dos van las dos —la del service
// primero y con el borde fuerte, la de caja como secundaria—; con uno
// solo, esa es la principal, sea cual sea.
export function ProximoService({
  service,
  caja,
}: {
  service: ProximoDelCliente | null;
  caja: ProximoDelCliente | null;
}) {
  if (!service && !caja) return null;

  const enPar = service !== null && caja !== null;

  const tarjetas = (
    <>
      {service && (
        <Tarjeta
          titulo="Tu próximo service"
          proxKm={service.proxKm}
          principal
          enPar={enPar}
        >
          {/* "Hoy tu auto tiene X km" sería mentira salvo que el service haya
              sido hoy: lo único que sabemos es cuánto marcaba entonces. */}
          En tu último service marcaba {formatearKm(service.km)} km
        </Tarjeta>
      )}
      {caja && (
        <Tarjeta
          titulo="Tu próximo service de caja"
          proxKm={caja.proxKm}
          principal={!service}
          enPar={enPar}
        >
          Hiciste el service de caja a los {formatearKm(caja.km)} km
        </Tarjeta>
      )}
    </>
  );

  // Una columna en el celular, el service arriba; lado a lado desde 640.
  // Ahí el gap vertical va en cero: las tres filas que comparten las dos
  // tarjetas (ver Tarjeta) se separan con sus márgenes, no con la grilla.
  return enPar ? (
    <div className="grid gap-4 sm:grid-cols-2 sm:gap-y-0">{tarjetas}</div>
  ) : (
    tarjetas
  );
}

// EL PAR, MEDIDO. Lado a lado cada tarjeta mide 280px, y 248 en una
// pantalla de 1024, donde la columna de la derecha se angosta. Con el
// padding en 20 —sin el salto a 24 de la tarjeta sola— quedan 204 útiles
// en la más angosta, y «1.164.300 km» mide 320px a 52, 240 a 39 y 190 a
// 31: el número va a 31 (`h2`). Apiladas son tan anchas como la tarjeta
// sola, así que conservan los 39px del celular.
//
// Y las tres filas de las dos tarjetas son LAS MISMAS tres filas (subgrid):
// «Tu próximo service de caja» ocupa dos renglones donde el del service
// ocupa uno, y sin eso los dos números quedan a distinta altura. Un
// navegador sin subgrid los muestra desparejos, y nada más.
function Tarjeta({
  titulo,
  proxKm,
  principal,
  enPar,
  children,
}: {
  titulo: string;
  proxKm: number;
  /** El borde fuerte: la del service, o la de caja cuando está sola. */
  principal: boolean;
  /** Hay dos tarjetas: lado a lado desde 640, con el número en 31px. */
  enPar: boolean;
  children: React.ReactNode;
}) {
  return (
    <section
      className={`rounded-lg ${
        principal ? "border-2 border-ink" : "border border-line"
      } p-5 text-center ${
        enPar ? "sm:row-span-3 sm:grid sm:grid-rows-subgrid" : "sm:p-6"
      }`}
    >
      <h2 className="text-c-body font-semibold tracking-[0.08em] text-ink-60 uppercase">
        {titulo}
      </h2>
      <p
        className={`mt-2 font-brand text-h1 leading-none font-bold tracking-[-0.02em] tabular-nums ${
          enPar ? "sm:text-h2" : "sm:text-display"
        }`}
      >
        {formatearKm(proxKm)} km
      </p>
      <p className="mt-3 text-c-body text-ink-60 tabular-nums">{children}</p>
    </section>
  );
}

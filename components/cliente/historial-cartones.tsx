import { IconoChevron, IconoCandado } from "@/components/iconos";
import { AdjuntosCliente } from "@/components/cliente/adjuntos-cliente";
import {
  CartonPapel,
  CartonPapelCaja,
  CartonPapelMecanica,
  CartonPapelNeumaticos,
} from "@/components/services/carton-papel";
import {
  marcadosDe,
  renglonesLibres,
  type ServiceCarton,
} from "@/lib/cliente/carton";
import { formatearKm, type ClaseVehiculo } from "@/lib/renglones";
import { formatearFecha } from "@/lib/fechas";
import { ESTILO_PAPEL } from "@/lib/cliente/tema";
import { ETIQUETA_TIPO, type TipoTrabajo } from "@/lib/trabajos";
import { plazoEdicionTexto } from "@/lib/servicios";
import { resumenRuedas } from "@/lib/ruedas";
import { descripcionEnUnaLinea } from "@/lib/renglones-mecanica";

// LA LÍNEA SECUNDARIA DEL ACORDEÓN, por tipo. Antes era un ternario con
// el service como caso por ausencia; con tres tipos eso le mostraba al
// dueño del auto los kilómetros de un trabajo de gomería como si fuera
// un cambio de aceite. Un Record obliga a contestar por cada tipo.
const RESUMEN_POR_TIPO: Record<TipoTrabajo, (s: ServiceCarton) => string> = {
  service: (s) =>
    `${formatearKm(s.kilometros ?? 0)} km${s.sucursal ? ` · ${s.sucursal}` : ""}`,
  mecanica: (s) =>
    [descripcionEnUnaLinea(s.trabajoDescripcion), s.sucursal]
      .filter(Boolean)
      .join(" · "),
  neumaticos: (s) =>
    [
      s.kilometros != null ? `${formatearKm(s.kilometros)} km` : null,
      resumenRuedas(s.ruedas, s.alineacion ?? false),
      s.sucursal,
    ]
      .filter(Boolean)
      .join(" · "),
  // El service de caja se nombra por su aceite de caja y, si viene, por el
  // producto (con «mostrar productos» apagado, get_carton lo manda null);
  // la sucursal al final, como en los otros tres. Los kilómetros y el
  // próximo están en su papel.
  caja: (s) =>
    [s.aceiteTipo, s.aceiteNombre, s.sucursal].filter(Boolean).join(" · "),
};

// EL PAPEL QUE SE DESPLIEGA, por tipo. Mismo remedio que arriba y por la
// misma razón: acá había un ternario —neumáticos, mecánica y, por
// descarte, el cartón de aceite—, y con el cuarto tipo un service de caja
// se abría a un cartón de ACEITE sin dar ningún error. Con el Record, el
// quinto tipo no compila hasta tener su papel.
type Entrada = {
  s: ServiceCarton;
  lubricentroNombre: string;
  colorTenant: string;
  colorPapel: string | null;
  clase: ClaseVehiculo | null;
};

const PAPEL_POR_TIPO: Record<
  TipoTrabajo,
  (entrada: Entrada) => React.ReactNode
> = {
  service: ({ s, lubricentroNombre, colorTenant, colorPapel, clase }) => (
    <CartonPapel
      escala="cliente"
      datos={{
        lubricentroNombre,
        colorTenant,
        fecha: s.fecha,
        kilometros: s.kilometros ?? 0,
        aceiteTipo: s.aceiteTipo ?? "",
        aceiteNombre: s.aceiteNombre,
        proxServiceKm: s.proxServiceKm ?? 0,
        colorPapel,
        clase,
        marcados: marcadosDe(s),
      }}
    />
  ),
  mecanica: ({ s, lubricentroNombre, colorTenant, colorPapel }) => (
    <CartonPapelMecanica
      escala="cliente"
      datos={{
        lubricentroNombre,
        colorTenant,
        colorPapel,
        fecha: s.fecha,
        kilometros: s.kilometros,
        descripcion: s.trabajoDescripcion ?? "",
        renglones: renglonesLibres(s),
      }}
    />
  ),
  neumaticos: ({ s, lubricentroNombre, colorTenant, colorPapel }) => (
    <CartonPapelNeumaticos
      escala="cliente"
      datos={{
        lubricentroNombre,
        colorTenant,
        colorPapel,
        fecha: s.fecha,
        kilometros: s.kilometros,
        alineacion: s.alineacion ?? false,
        ruedas: s.ruedas,
        beneficio:
          s.beneficioHastaKm != null && s.beneficioHastaFecha
            ? { hastaKm: s.beneficioHastaKm, hastaFecha: s.beneficioHastaFecha }
            : null,
      }}
    />
  ),
  caja: ({ s, lubricentroNombre, colorTenant, colorPapel }) => (
    <CartonPapelCaja
      escala="cliente"
      datos={{
        lubricentroNombre,
        colorTenant,
        colorPapel,
        fecha: s.fecha,
        kilometros: s.kilometros ?? 0,
        aceiteTipo: s.aceiteTipo ?? "",
        aceiteNombre: s.aceiteNombre,
        proxCajaKm: s.proxCajaKm ?? 0,
        marcados: marcadosDe(s),
      }}
    />
  ),
};

// El historial cronológico, con LOS CUATRO tipos de trabajo en una sola
// línea de tiempo — un cliente de taller que escanea tiene que ver todo
// lo que le hicieron al auto, no solo los cambios de aceite. Cada fila se
// abre a su papel: el cartón para el service, la orden de trabajo para la
// mecánica, el esquema de las ruedas para la gomería y el cartón de la
// caja para el service de caja. Es el mismo objeto, no un resumen
// distinto.
//
// Va con <details>/<summary> y no con estado de React: expandir y colapsar
// es exactamente para lo que existe el elemento, funciona sin que hidrate
// nada y le ahorra JavaScript a un celular viejo con 4G.
export function HistorialCartones({
  services,
  lubricentroNombre,
  colorTenant,
  colorPapel = null,
  clase = null,
  slug,
  patente,
}: {
  services: ServiceCarton[];
  lubricentroNombre: string;
  colorTenant: string;
  colorPapel?: string | null;
  /** La clase del vehículo: el papel de referencia de cada cartón. */
  clase?: ClaseVehiculo | null;
  /** Para el enlace de los adjuntos: /[slug]/[patente]/adjunto/[id]. */
  slug: string;
  /** La patente normalizada. */
  patente: string;
}) {
  if (services.length === 0) return null;

  return (
    <section>
      <h2 className="text-c-lead font-bold">Historial del auto</h2>

      {/* EL SELLO SE EXPLICA UNA VEZ, ACÁ, Y CON PESO. Es el argumento de
          confianza de primer orden del producto —este historial no lo
          puede cambiar nadie, tampoco el taller que lo escribió— y estaba
          dicho como una nota de sistema en gris al pie del título. Ahora
          es un objeto: habla en segunda persona al dueño del auto, y
          lleva el mismo candado que marca cada fila fijada, así el
          símbolo queda explicado de entrada en vez de repetirse sin
          significado. */}
      <div className="mt-3 flex gap-3 rounded-lg border border-line bg-surface p-4">
        <IconoCandado aria-hidden className="mt-0.5 size-6 shrink-0 text-ink-60" />
        <p className="text-c-body text-ink-60">
          <span className="font-bold text-ink">
            Este historial no se puede editar.
          </span>{" "}
          Cada trabajo queda fijado para siempre al vencer su plazo de
          edición —{plazoEdicionTexto("mecanica")} en una mecánica,{" "}
          {plazoEdicionTexto("service")} en el resto—: ni el taller que lo
          cargó puede cambiarlo.
        </p>
      </div>

      <ul className="mt-4 flex flex-col gap-3">
        {services.map((s, i) => (
          // El borde es de la ENTRADA, no del desplegable: debajo del papel
          // —y a la vista aunque el papel esté cerrado— van los adjuntos
          // que el taller decidió mostrar.
          <li key={`${s.fecha}-${i}`} className="rounded-lg border border-line">
            <details className="group">
              <summary className="flex min-h-16 cursor-pointer list-none items-center gap-3 p-4 [&::-webkit-details-marker]:hidden">
                <span className="min-w-0 flex-1">
                  <span className="flex flex-wrap items-baseline gap-x-2 text-c-body font-bold tabular-nums">
                    {formatearFecha(s.fecha)}
                    {/* EL SELLO DEL TIPO, para los cuatro. Antes había uno
                        solo —"Mecánica"— y el service se identificaba por
                        ausencia; con más de dos tipos, dejar uno sin
                        etiquetar es confuso para el dueño del auto. */}
                    <span className="rounded-sm border border-line bg-surface px-2 py-0.5 text-label font-semibold tracking-[0.04em] text-ink-60 uppercase">
                      {ETIQUETA_TIPO[s.tipo]}
                    </span>
                  </span>
                  <span className="block text-c-body text-ink-60 tabular-nums">
                    {RESUMEN_POR_TIPO[s.tipo](s)}
                  </span>
                  {s.fijado && (
                    <span className="mt-2 inline-flex items-center gap-1.5 rounded-sm bg-surface px-2.5 py-1 text-c-body text-ink-60">
                      <IconoCandado aria-hidden className="size-5 shrink-0" />
                      Registro fijado
                    </span>
                  )}
                </span>
                <IconoChevron
                  aria-hidden
                  className="size-7 shrink-0 text-ink-60 transition-transform group-open:rotate-180"
                />
              </summary>

              {/* El papel no se apaga: en modo oscuro el cartón sigue
                  siendo un recibo claro sobre el mostrador — el reset
                  devuelve los tokens de tinta dentro de este subárbol. */}
              <div className="px-3 pt-1 pb-4" style={ESTILO_PAPEL}>
                {PAPEL_POR_TIPO[s.tipo]({
                  s,
                  lubricentroNombre,
                  colorTenant,
                  colorPapel,
                  clase,
                })}
                {s.observaciones && (
                  <p className="mt-3 text-c-body text-ink-60">
                    {s.observaciones}
                  </p>
                )}
              </div>
            </details>
            {/* Debajo del papel, nunca adentro. Afuera del <details>: un
                diagnóstico que solo aparece si alguien abre la fila es un
                diagnóstico que nadie encuentra. */}
            <AdjuntosCliente
              adjuntos={s.adjuntos}
              slug={slug}
              patente={patente}
              enEntrada
            />
          </li>
        ))}
      </ul>
    </section>
  );
}

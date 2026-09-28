import { IconoPremio } from "@/components/iconos";
import type { Fidelizacion } from "@/lib/cliente/carton";

// La tarjeta de sellos: la metáfora física del premio, digitalizada, igual
// que el cartón es el papel del parasol. Un círculo por service del ciclo
// —lleno en el color del lubricentro cuando ya se hizo, vacío cuando
// falta— y el premio al final de la fila. Pedro la entiende sin leer: es
// la tarjeta del café.
//
// EL COPY NO CAMBIÓ. Las frases son las de siempre —las fija el flow de
// fidelización y las repite el panel—; lo que cambió es cómo se dibuja el
// progreso y con qué colores.
//
// Legible en claro y en oscuro sin un solo color fijo: la tarjeta no
// lleva borde y se tiñe con `tenant-soft` —el color del lubricentro
// disuelto en el fondo del modo, que `paletaTenant` ya calcula por tema—
// y, con el premio disponible, con `reward-soft`, que desde hoy también
// tiene su valor sobre grafito (lib/cliente/tema.ts). Antes ese crema era
// FIJO: sobre el grafito de un tenant oscuro quedaba una tarjeta clara con
// texto blanco encima, y no se leía nada. Sin borde es también lo que la
// distingue del resto de los recuadros de la pantalla, que van con línea
// de 1px: es una tarjeta, no un aviso.
//
// El dorado del premio es semántico y cruza tenants: es el único amarillo
// del sistema y significa "premio" en todo el producto, así que no se
// pinta con el color del lubricentro. Los sellos en curso sí.

// Hasta acá la tarjeta se dibuja con sellos. Por encima, una fila de
// círculos deja de parecer una tarjeta (la base admite metas de hasta 50)
// y el progreso vuelve a la barra.
const MAX_SELLOS = 12;

export function ProgresoFidelizacion({
  fidelizacion,
}: {
  fidelizacion: Fidelizacion;
}) {
  const { disponible, servicesCiclo, metaServices, descripcion, alcance } =
    fidelizacion;
  // EL COPY SIGUE LA CONFIGURACIÓN. Con alcance "todos" el ciclo avanza
  // con cualquier trabajo, así que decir "services" le habla al cliente de
  // algo que no es lo que suma: en un taller, viene por una mecánica, ve
  // que el contador subió y el cartel le habla de cambios de aceite.
  const unidad = alcance === "todos" ? "trabajos" : "services";
  const premio = descripcion?.toLowerCase() ?? "tu premio";
  const meta = Math.max(1, metaServices);
  // Los sellos se topan en la meta: con el premio disponible y sin canjear
  // el contador puede pasarla, y un sello de más no significa nada.
  const hechos = Math.min(meta, Math.max(0, servicesCiclo));
  const faltan = Math.max(0, metaServices - servicesCiclo);

  return (
    <section
      className={`rounded-lg p-5 sm:p-6 ${disponible ? "bg-reward-soft" : "bg-tenant-soft"}`}
    >
      {/* flex-wrap y no un simple justify-between: si los dos textos no
          entran en una línea, el segundo baja entero en vez de partirse
          por dentro y dejar dos bloques de dos renglones desalineados. */}
      <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
        <p className="text-c-lead font-bold tabular-nums">
          {disponible ? "" : "Vas "}
          {servicesCiclo} de {metaServices} {unidad}
        </p>
        <p className="text-c-body text-ink-60 tabular-nums">
          {disponible
            ? "¡completaste el ciclo!"
            : faltan === 1
              ? "falta 1"
              : `faltan ${faltan}`}
        </p>
      </div>

      {meta <= MAX_SELLOS ? (
        <Sellos meta={meta} hechos={hechos} disponible={disponible} />
      ) : (
        <div
          className="mt-4 h-2.5 overflow-hidden rounded-sm bg-ink/10"
          role="presentation"
        >
          <div
            className={`h-full rounded-sm ${disponible ? "bg-reward" : "bg-tenant"}`}
            style={{ width: `${Math.round((hechos / meta) * 100)}%` }}
          />
        </div>
      )}

      {disponible ? (
        <p className="mt-4 text-c-body text-ink-60">
          <span className="font-bold text-ink">
            Tenés un premio disponible: {premio}.
          </span>{" "}
          {/* Sin botón de canje: el cliente ve, el mecánico ejecuta. */}
          Avisale al mecánico en tu próxima visita y lo aplicás en el momento.
        </p>
      ) : (
        <p className="mt-4 text-c-body text-ink-60">
          Al llegar a {metaServices}: <span className="text-ink">{premio}</span>
        </p>
      )}
    </section>
  );
}

// Decorativa a propósito (aria-hidden): el texto de arriba ya dice "3 de
// 4"; la fila lo dibuja. Los sellos vacíos van en la tinta terciaria y no
// en `line`: sobre la tarjeta teñida, la línea de 1px se perdía. La fila
// se envuelve sola: con una meta de 10 en un celular angosto pasa a dos
// renglones en vez de desbordar.
function Sellos({
  meta,
  hechos,
  disponible,
}: {
  meta: number;
  hechos: number;
  disponible: boolean;
}) {
  return (
    <div aria-hidden className="mt-4 flex flex-wrap items-center gap-2">
      {Array.from({ length: meta }, (_, i) => (
        <span
          key={i}
          className={`size-7 rounded-full border ${
            i < hechos
              ? disponible
                ? "border-reward bg-reward"
                : "border-tenant bg-tenant"
              : "border-ink-40"
          }`}
        />
      ))}
      {/* El premio, al final de la fila: vacío mientras se junta, lleno
          cuando ya está. Es el mismo dorado del resto del producto. */}
      <span
        className={`ml-1 flex size-7 items-center justify-center rounded-full border border-reward ${
          disponible ? "bg-reward text-white" : "text-reward"
        }`}
      >
        <IconoPremio className="size-4.5" />
      </span>
    </div>
  );
}

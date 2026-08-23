import { IconoPremio } from "@/components/iconos";
import type { Fidelizacion } from "@/lib/cliente/carton";

// Recuerda sin invadir: una barra y una línea. El programa completo no
// necesita explicarse acá — Pedro ya lo entiende viendo cuánto le falta.
//
// El dorado del premio es semántico y cruza tenants: es el único amarillo
// del sistema y significa "premio" en todo el producto, así que no se pinta
// con el color del lubricentro. La barra en curso sí.
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
  const porcentaje = Math.min(
    100,
    Math.round((servicesCiclo / Math.max(1, metaServices)) * 100),
  );
  const premio = descripcion?.toLowerCase() ?? "tu premio";

  if (disponible) {
    return (
      <section className="rounded-lg border border-reward bg-reward-soft p-5 sm:p-6">
        {/* flex-wrap y no un simple justify-between: si los dos textos no
            entran en una línea, el segundo baja entero en vez de partirse
            por dentro y dejar dos bloques de dos renglones desalineados. */}
        <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
          <p className="text-c-lead font-bold tabular-nums">
            {servicesCiclo} de {metaServices} {unidad}
          </p>
          <p className="text-c-body text-ink-60">¡completaste el ciclo!</p>
        </div>

        <div
          className="mt-3 h-2.5 overflow-hidden rounded-sm border border-line bg-base"
          role="presentation"
        >
          <div className="h-full rounded-sm bg-reward" style={{ width: "100%" }} />
        </div>

        <p className="mt-4 flex gap-2.5 text-c-body text-ink-60">
          <IconoPremio aria-hidden className="mt-0.5 size-6 shrink-0 text-reward" />
          <span>
            <span className="font-bold text-ink">
              Tenés un premio disponible: {premio}.
            </span>{" "}
            {/* Sin botón de canje: el cliente ve, el mecánico ejecuta. */}
            Avisale al mecánico en tu próxima visita y lo aplicás en el momento.
          </span>
        </p>
      </section>
    );
  }

  const faltan = Math.max(0, metaServices - servicesCiclo);

  return (
    <section className="rounded-lg border border-line p-5 sm:p-6">
      <div className="flex items-baseline justify-between gap-3">
        <p className="text-c-lead font-bold tabular-nums">
          Vas {servicesCiclo} de {metaServices} {unidad}
        </p>
        <p className="text-c-body text-ink-60 tabular-nums">
          {faltan === 1 ? "falta 1" : `faltan ${faltan}`}
        </p>
      </div>

      <div
        className="mt-3 h-2.5 overflow-hidden rounded-sm border border-line bg-surface"
        role="presentation"
      >
        <div
          className="h-full rounded-sm bg-tenant"
          style={{ width: `${porcentaje}%` }}
        />
      </div>

      <p className="mt-3 text-c-body text-ink-60">
        Al llegar a {metaServices}: <span className="text-ink">{premio}</span>
      </p>
    </section>
  );
}

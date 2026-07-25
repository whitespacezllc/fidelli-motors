import { formatearKm } from "@/lib/renglones";

// La única pregunta que Pedro trae en la cabeza, respondida arriba de todo
// y sin scroll. Es el único display de 52px del producto.
//
// SOLO EL KM, NUNCA UNA FECHA ESTIMADA. El kilometraje es un dato que
// declaró el mecánico y es incuestionable. La fecha estimada existe —la
// calcula vista_proximos_service— pero es herramienta del panel para saber
// a quién llamar: mostrársela al cliente con poco historial da fechas malas
// y reclamos. Acá no entra.
export function ProximoService({
  proxServiceKm,
  kmUltimoService,
}: {
  proxServiceKm: number;
  kmUltimoService: number;
}) {
  return (
    <section className="rounded-lg border-2 border-ink p-5 text-center sm:p-6">
      <h2 className="text-c-body font-semibold tracking-[0.08em] text-ink-60 uppercase">
        Tu próximo service
      </h2>
      <p className="mt-2 font-brand text-h1 leading-none font-bold tracking-[-0.02em] tabular-nums sm:text-display">
        {formatearKm(proxServiceKm)} km
      </p>
      {/* "Hoy tu auto tiene X km" sería mentira salvo que el service haya
          sido hoy: lo único que sabemos es cuánto marcaba entonces. */}
      <p className="mt-3 text-c-body text-ink-60 tabular-nums">
        En tu último service marcaba {formatearKm(kmUltimoService)} km
      </p>
    </section>
  );
}

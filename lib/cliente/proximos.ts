// ============================================================
// Las tarjetas de «próximo» de la página del cliente.
//
// Hasta el service de caja (04/10/2026) la página contestaba una sola
// pregunta —¿cuándo me toca el service?— con el último trabajo de tipo
// `service`. Una caja tiene SU próximo (`prox_caja_km`), y el cambio de
// aceite no se entera: son dos preguntas, y cada una se contesta con el
// último trabajo de su tipo.
//
//   · con service y con caja → las dos tarjetas, la del service primero;
//   · solo con cajas          → la de caja, sola, como la principal;
//   · solo con services       → la de siempre.
//
// Sin React y sin Supabase: lo usa la página y lo carga la prueba
// (scripts/regresion-caja.mjs).
// ============================================================

/** Lo mínimo de cada trabajo de get_carton que hace falta para decidir. */
export type TrabajoConProximo = {
  tipo: string;
  kilometros: number | null;
  proxServiceKm: number | null;
  proxCajaKm: number | null;
};

export type ProximoDelCliente = {
  /** A cuántos kilómetros le toca. */
  proxKm: number;
  /** Cuánto marcaba el odómetro en ese trabajo. */
  km: number;
};

export type ProximosDelCliente = {
  service: ProximoDelCliente | null;
  caja: ProximoDelCliente | null;
};

/** Los próximos del auto. Los trabajos llegan del más nuevo al más viejo
 *  (así los ordena lib/cliente/carton.ts): manda el primero de cada tipo. */
export function proximosDelCliente(
  services: readonly TrabajoConProximo[],
): ProximosDelCliente {
  const ultimoService = services.find((s) => s.tipo === "service") ?? null;
  const ultimaCaja = services.find((s) => s.tipo === "caja") ?? null;
  return {
    service:
      ultimoService?.proxServiceKm != null && ultimoService.kilometros != null
        ? { proxKm: ultimoService.proxServiceKm, km: ultimoService.kilometros }
        : null,
    caja:
      ultimaCaja?.proxCajaKm != null && ultimaCaja.kilometros != null
        ? { proxKm: ultimaCaja.proxCajaKm, km: ultimaCaja.kilometros }
        : null,
  };
}

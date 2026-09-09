// Los parámetros de la URL que le importan al tracking, leídos de la query
// string y, si ahí no están, de la parte del hash que sigue a un `?`.
//
// Por qué también el hash: Google puede pegar el sufijo de URL de la campaña
// después del ancla en enlaces como `/#precio`, y la URL termina siendo
// `/#precio?utm_source=google&utm_medium=cpc`. Para el navegador todo eso
// es fragmento —`location.search` viene vacío— y para GA4 también, así que
// si no se lee acá, el clic se queda sin origen.

export type Parametros = {
  /** El valor del parámetro, o null si no viene o viene vacío. */
  readonly get: (nombre: string) => string | null;
};

export function leerParametros(search: string, hash: string): Parametros {
  const enQuery = new URLSearchParams(search);

  const corte = hash.indexOf("?");
  const enHash =
    corte >= 0 ? new URLSearchParams(hash.slice(corte + 1)) : null;

  return {
    get(nombre) {
      const valor = enQuery.get(nombre) ?? enHash?.get(nombre) ?? null;
      const limpio = valor?.trim() ?? "";
      return limpio ? limpio : null;
    },
  };
}

/**
 * El ancla de la URL sin el sufijo de campaña: `#precio?utm_source=google`
 * → `precio`. Vacío si no hay ancla.
 */
export function anclaDe(hash: string): string {
  const sinNumeral = hash.startsWith("#") ? hash.slice(1) : hash;
  const corte = sinNumeral.indexOf("?");
  const ancla = corte >= 0 ? sinNumeral.slice(0, corte) : sinNumeral;
  try {
    return decodeURIComponent(ancla);
  } catch {
    return ancla;
  }
}

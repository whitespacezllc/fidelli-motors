// Preferencias que son del dispositivo y no del usuario. En el MVP es
// probable que el lubricentro comparta una sola cuenta entre sucursales, así
// que la sucursal en la que se está cargando no se puede deducir de quién
// inició sesión: la recuerda el celular que está en el mostrador.
export const COOKIE_SUCURSAL = "fm_sucursal";

const UN_ANIO = 60 * 60 * 24 * 365;

// Se escribe desde el cliente a propósito: es una preferencia de interfaz,
// no un dato sensible, y así el cambio no cuesta un viaje al servidor.
export function recordarSucursal(id: string) {
  document.cookie = `${COOKIE_SUCURSAL}=${id}; path=/; max-age=${UN_ANIO}; samesite=lax`;
}

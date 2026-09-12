// Preferencias que son del dispositivo y no del usuario. En el MVP es
// probable que el lubricentro comparta una sola cuenta entre sucursales, así
// que la sucursal en la que se está cargando no se puede deducir de quién
// inició sesión: la recuerda el celular que está en el mostrador.
export const COOKIE_SUCURSAL = "fm_sucursal";

// El tipo de trabajo que este dispositivo cargó la última vez. Una gomería
// carga cubiertas todo el día: abrir siempre en Service es un toque
// equivocado por cada trabajo de la jornada. Va en cookie y no en
// localStorage para que la solapa correcta llegue ya renderizada del
// servidor — con localStorage el control parpadearía en cada carga.
export const COOKIE_TIPO_TRABAJO = "fm_tipo_trabajo";

const UN_ANIO = 60 * 60 * 24 * 365;

// Se escribe desde el cliente a propósito: es una preferencia de interfaz,
// no un dato sensible, y así el cambio no cuesta un viaje al servidor.
export function recordarSucursal(id: string) {
  document.cookie = `${COOKIE_SUCURSAL}=${id}; path=/; max-age=${UN_ANIO}; samesite=lax`;
}

export function recordarTipoTrabajo(tipo: string) {
  document.cookie = `${COOKIE_TIPO_TRABAJO}=${tipo}; path=/; max-age=${UN_ANIO}; samesite=lax`;
}

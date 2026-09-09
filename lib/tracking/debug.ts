import type { Parametros } from "@/lib/tracking/parametros";

// El modo debug del tracking: con `?fm_debug=1` en la URL, el módulo cuenta
// en la consola qué origen resolvió, qué mensaje eligió y qué eventos
// mandó. Sin ese parámetro, silencio total.
//
// SE RECUERDA POR PESTAÑA (sessionStorage) y no solo por URL: la landing
// navega adentro de la misma página (`/#precio`, `/blog`) y el parámetro se
// pierde en el primer clic. Con `?fm_debug=0` se apaga. Al cerrar la
// pestaña se olvida solo.

const CLAVE = "fm_debug";

let activo: boolean | null = null;

function leerGuardado(): boolean {
  try {
    return window.sessionStorage.getItem(CLAVE) === "1";
  } catch {
    return false;
  }
}

function guardar(valor: boolean) {
  activo = valor;
  try {
    if (valor) window.sessionStorage.setItem(CLAVE, "1");
    else window.sessionStorage.removeItem(CLAVE);
  } catch {
    // Sin sessionStorage el flag vive solo en memoria, que para una pestaña
    // alcanza.
  }
}

/** Lee `fm_debug` de los parámetros de la página y lo recuerda. */
export function evaluarDebug(parametros: Parametros) {
  const valor = parametros.get(CLAVE);
  if (valor === "1") guardar(true);
  else if (valor === "0") guardar(false);
}

export function debugActivo(): boolean {
  if (typeof window === "undefined") return false;
  if (activo === null) activo = leerGuardado();
  return activo;
}

/** Escribe en la consola solo con el modo debug encendido. */
export function log(mensaje: string, ...datos: unknown[]) {
  if (!debugActivo()) return;
  console.log(`[fm] ${mensaje}`, ...datos);
}

// ============================================================
// Los slugs que un lubricentro tuvo ANTES y que siguen impresos.
//
// El slug va en el QR del calco, y un calco pegado en un parasol no se
// actualiza: por eso un slug con calcos entregados no se cambia
// (`slug_bloqueado`). La excepción es el que quedó por encima del tope de
// 32 caracteres (`slug_largo_qr`, 20261004200000): ese se acorta por SQL,
// y su dirección vieja queda acá, redirigiendo a la nueva con todo lo que
// venga atrás —la patente, el adjunto, los parámetros—.
//
//   · Una entrada no se borra nunca. Borrarla es apagar los calcos que ese
//     taller ya pegó, y no da ningún error.
//   · El slug viejo no puede volver a ser de nadie: el redirect se resuelve
//     antes que cualquier página, así que taparía al tenant que lo tomara.
//     Uno de más de 32 ya no entra por el CHECK; uno más corto, además de
//     estar acá, tiene que quedar reservado en `slug_reservado()`.
//   · El orden en producción: primero el UPDATE del slug, después el deploy
//     que trae la entrada. Al revés, el viejo redirige a una página que
//     todavía no existe.
//   · 301 y no 308 (`permanent: true`): el que escanea puede tener un
//     celular viejo, y el 301 lo entiende cualquier navegador.
//
// Lo lee next.config.ts. Lo vigila scripts/regresion-adjuntos.mjs.
// No importa nada: next.config.ts lo carga antes de que exista el build.
// ============================================================
export const SLUGS_ANTERIORES: Readonly<Record<string, string>> = {
  "mecanica-y-lubricentro-deambrossio": "deambrossio",
};

export type RedireccionDeSlug = {
  source: string;
  destination: string;
  statusCode: 301;
};

/** Las reglas de redirect de next.config.ts: una por slug viejo, con lo
 *  que cuelga de él (`:resto*` también toma la vidriera a secas). */
export function redireccionesDeSlugs(): RedireccionDeSlug[] {
  return Object.entries(SLUGS_ANTERIORES).map(([viejo, nuevo]) => ({
    source: `/${viejo}/:resto*`,
    destination: `/${nuevo}/:resto*`,
    statusCode: 301,
  }));
}

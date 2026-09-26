// ============================================================
// Lo que se sabe de una orden de pago SIN llamarlo a Cresium
//
// Puro a propósito: sin `server-only`, sin red, sin base. Lo usan la
// acción que crea la orden, la página que la pinta y la regresión
// (scripts/regresion-cresium-orden.mjs), y los tres tienen que contar
// los mismos días y armar la misma referencia.
// ============================================================

/** Cuánto vive un CVU. Es el `expiresIn` que se le pide a Cresium al
 *  crear la orden: pasado eso, transferirle no acredita nada. */
export const DIAS_DE_VIDA_DE_LA_ORDEN = 7;

/**
 * La referencia que viaja a Cresium en el intento N de una MISMA
 * renovación: `sub:hasta` la primera vez, `sub:hasta:2` la segunda, y así.
 *
 * ⚠ EL externalId ES ÚNICO EN CRESIUM PARA SIEMPRE, también después de
 * PAID o EXPIRED. Se aprendió en producción el 16/09/2026: la orden de los
 * $390 quedó PAID, se borró nuestra fila para volver a probar, y el intento
 * siguiente —mismo vencimiento, misma referencia— volvió con
 * «400 EXISTING_EXTERNAL_ID: A payment order already exists for this
 * externalId». Y no era solo de las pruebas: un tenant que genera la
 * cuenta, deja pasar los siete días y vuelve, caía en el mismo callejón.
 *
 * La suscripción y el período siguen adelante y el webhook lee SOLO esas
 * dos partes (`split_part(…, ':', 1)` y `(…, ':', 2)`), así que el sufijo
 * no cambia a quién ni hasta cuándo se le acredita. Y como el alias sale
 * del hash de la referencia, el CVU nuevo trae alias nuevo.
 */
export function externalIdDelIntento(base: string, intento: number): string {
  return intento <= 1 ? base : `${base}:${intento}`;
}

/** ¿Pasó la vida de la orden? Se cuenta desde que se creó, con los mismos
 *  días que se le pidieron a Cresium. */
export function ordenVencida(createdAt: string, ahora: Date = new Date()): boolean {
  const limite = new Date(createdAt).getTime() + DIAS_DE_VIDA_DE_LA_ORDEN * 86_400_000;
  return ahora.getTime() >= limite;
}

/**
 * El estado que hay que creerle a una orden, que no siempre es el que
 * quedó escrito. El único webhook configurado es el de DEPOSIT: nadie
 * avisa cuando una orden vence, así que una NOT_PAID de hace diez días
 * sigue diciendo NOT_PAID en nuestra tabla mientras su CVU ya no recibe
 * nada. Reusarla es mandar a alguien a transferir a una cuenta muerta.
 */
export function estadoEfectivo(estado: string, createdAt: string, ahora: Date = new Date()): string {
  if ((estado === "NOT_PAID" || estado === "PARTIAL") && ordenVencida(createdAt, ahora)) {
    return "EXPIRED";
  }
  return estado;
}

// ============================================================
// EL ALIAS DE UNA ORDEN · el camino nuevo detrás de la misma interfaz
//
// Una sola función decide, y por eso el corte entre el alias fijo y el
// derivado es UN DATO y no un deploy:
//
//   · el tenant TIENE alias asignado  → se usa ése, siempre, sin tocarlo.
//   · el tenant NO tiene  (null)      → se sigue derivando de la orden,
//                                        exactamente como hasta hoy.
//
// Hoy los 17 tenants están en null, así que esto no cambia el comportamiento
// de nadie. El día que Cresium conteste, cada tenant que reciba su alias
// cruza de camino solo, sin que se toque una línea.
//
// ⚠ EL REINTENTO SE COMPORTA DISTINTO CON UN ALIAS FIJO, y conviene tenerlo
// escrito antes de que pase. Hoy el alias sale del `externalId`, así que el
// intento `:2` pide un alias DISTINTO del que pidió el `:1` —el comentario
// de `externalIdDelIntento()` lo dice: «el CVU nuevo trae alias nuevo»—.
// Con un alias fijo, el `:2` pide EL MISMO, y si el `:1` alcanzó a crear la
// cuenta antes de fallar por otra cosa, Cresium va a contestar que el alias
// está tomado. Ese error NO es motivo para subir el número de intento:
// insistir pide lo mismo otra vez. Lo maneja la acción, que solo reintenta
// con `EXISTING_EXTERNAL_ID`.
// ============================================================

/**
 * El alias con el que se pide una orden.
 *
 * `derivado` es la función de siempre (`aliasDeOrden`), que entra por
 * parámetro para que este módulo siga siendo puro: sin `server-only`, sin
 * red y sin `node:crypto`, que es lo que permite que la regresión lo
 * importe directo.
 */
export function aliasParaLaOrden(
  aliasDelTenant: string | null | undefined,
  derivado: () => string,
): { alias: string; fijo: boolean } {
  const propio = aliasDelTenant?.trim();
  return propio ? { alias: propio, fijo: true } : { alias: derivado(), fijo: false };
}

// ============================================================
// HASTA CUÁNDO COMPRA UNA ORDEN DE RENOVACIÓN
//
// `greatest(vencimiento, hoy) + período`, en fechas-calendario: las dos
// entran como YYYY-MM-DD (la del negocio, hora argentina) y sale
// YYYY-MM-DD. Es pura y vive acá, y no en la acción, para que la
// regresión la corra con literales (scripts/regresion-cresium-orden.mjs § 6).
//
// ⚠ ARRANCA EN EL MAYOR DE LOS DOS, y las dos mitades son de Santiago:
//
//   · el que paga DENTRO del ciclo no gana días: con el vencimiento
//     adelante, el período se apoya en el vencimiento. Pagar tres días
//     antes no regala tres días menos, ni de más.
//   · el que paga DESPUÉS de vencido compra un período entero desde hoy.
//     Con `vencimiento + período` a secas —lo que había—, un tenant
//     vencido el 01/10 que se suspendía el 09/10 y pagaba el 20/11
//     compraba hasta el 01/11, ya pasado: pagaba y seguía suspendido.
//     Es el 1.4 del bloque 1 del sprint de cobranza (26/09/2026).
//
// La base hace su mitad del otro lado (`greatest(v_venc, v_hasta)` en
// `ciclo_tras_el_pago`), y R36d prueba que con este `hasta` el vencimiento
// queda exactamente acá y el pago registra el período que cubre de verdad.
// Los meses se suman como los suma Postgres: el 31/01 + 1 mes es el 28/02,
// no el 03/03.
// ============================================================
export function periodoHastaDeLaOrden(vencimiento: string, hoy: string, meses: number): string {
  // YYYY-MM-DD compara bien como texto: el mayor de los dos es el más nuevo.
  const desde = vencimiento > hoy ? vencimiento : hoy;
  return sumarMesesISO(desde, meses);
}

// En UTC a propósito: la TZ del proceso (UTC en Vercel, -03 acá) no puede
// mover el día. `new Date("2026-10-01T00:00:00")` + `toISOString()`, que
// era la cuenta anterior, funcionaba solo porque ninguna de las dos zonas
// es positiva.
function sumarMesesISO(iso: string, meses: number): string {
  const [a, m, d] = iso.slice(0, 10).split("-").map(Number);
  const f = new Date(Date.UTC(a, m - 1 + meses, d));
  // El 31 + 1 mes desborda al mes siguiente: se retrocede al último día
  // del mes que corresponde, como hace `date + interval '1 month'`.
  if (f.getUTCDate() !== d) f.setUTCDate(0);
  return f.toISOString().slice(0, 10);
}

export type Intento<T> =
  | { ok: true; valor: T; externalId: string; intento: number }
  | { ok: false; error: unknown; externalId: string; intento: number };

/**
 * Crea algo con la referencia del intento N y, si Cresium contesta que esa
 * referencia ya existe, sube el número y vuelve a intentar. Cualquier
 * otro error corta: firma, permisos o monto no cambian por insistir.
 *
 * `maximo` es un límite para no colgar la pantalla, no una expectativa:
 * en la práctica alcanza con el primer reintento. Vive acá y no en la
 * acción para que la regresión lo corra con un `crear` de mentira.
 */
export async function conIntentos<T>(
  base: string,
  desde: number,
  crear: (externalId: string, intento: number) => Promise<T>,
  yaExiste: (error: unknown) => boolean,
  maximo = 5,
): Promise<Intento<T>> {
  let intento = Math.max(1, desde);
  let ultimo: { error: unknown; externalId: string; intento: number } | null = null;

  for (let vuelta = 0; vuelta < Math.max(1, maximo); vuelta++, intento++) {
    const externalId = externalIdDelIntento(base, intento);
    try {
      return { ok: true, valor: await crear(externalId, intento), externalId, intento };
    } catch (error) {
      ultimo = { error, externalId, intento };
      if (!yaExiste(error)) break;
    }
  }

  return { ok: false, ...ultimo! };
}

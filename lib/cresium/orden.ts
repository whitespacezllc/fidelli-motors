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

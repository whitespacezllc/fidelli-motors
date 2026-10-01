// ============================================================
// Los aceites más usados del taller — los chips del bloque «Aceite de
// motor» del cartón.
//
// El aceite es el primer campo que el mecánico completa, y un taller usa
// cuatro o cinco de los que tiene cargados. Un buscador esconde las
// opciones; una fila de nombres para tocar las muestra. Qué va primero lo
// decide el uso real: los services de los últimos 90 días.
//
// Sin React y sin Supabase: la consulta la hace la página (alta y
// edición), acá solo se cuenta y se arma la fila. Lo carga también la
// prueba (scripts/regresion-aceite.mjs). Solo aceite de motor: no hay
// «más usados» para filtros ni para cubiertas.
// ============================================================

/** Cuántos chips de aceite se muestran, como mucho, sin contar el elegido. */
export const MAX_CHIPS_ACEITE = 4;

/** La ventana de «más usados», en días hacia atrás desde hoy. */
export const DIAS_MAS_USADOS = 90;

/** Cuántos services recientes se miran, como mucho, para contar. */
export const LIMITE_MAS_USADOS = 300;

/** El primer día de la ventana, a partir del hoy del negocio ("2026-10-01"
 *  → "2026-07-03"). Se resta por calendario, sin horas de por medio. */
export function desdeMasUsados(hoy: string): string {
  const [anio, mes, dia] = hoy.split("-").map(Number);
  const fecha = new Date(Date.UTC(anio, mes - 1, dia - DIAS_MAS_USADOS));
  return fecha.toISOString().slice(0, 10);
}

/** Los ids de aceite, del más usado al menos usado. Las filas llegan de la
 *  más nueva a la más vieja: el empate lo gana el que se usó último. */
export function aceitesMasUsados(
  filas: { aceite_producto_id: string | null }[],
): string[] {
  const usos = new Map<string, number>();
  for (const { aceite_producto_id: id } of filas) {
    if (id) usos.set(id, (usos.get(id) ?? 0) + 1);
  }
  // Map conserva el orden de primera aparición y sort es estable: con la
  // misma cantidad, queda primero el que apareció primero (el más nuevo).
  return [...usos.entries()].sort((a, b) => b[1] - a[1]).map(([id]) => id);
}

/** Los chips del bloque de aceite: los más usados primero y, si no llegan
 *  a cuatro, el catálogo en el orden en que llega (sin historia, son los
 *  primeros cuatro; con cuatro o menos, son todos). El ELEGIDO siempre
 *  tiene chip: si no está entre esos, va al final —un aceite elegido desde
 *  el buscador, recién creado o guardado en un service que se edita no
 *  puede quedar sin verse—. */
export function chipsDeAceite<T extends { id: string }>(
  catalogo: T[],
  masUsados: string[],
  elegidoId: string | null,
): T[] {
  const usados = masUsados
    .map((id) => catalogo.find((p) => p.id === id))
    .filter((p): p is T => p !== undefined);
  const resto = catalogo.filter((p) => !usados.includes(p));
  const chips = [...usados, ...resto].slice(0, MAX_CHIPS_ACEITE);
  const elegido = elegidoId
    ? catalogo.find((p) => p.id === elegidoId)
    : undefined;
  if (elegido && !chips.includes(elegido)) chips.push(elegido);
  return chips;
}

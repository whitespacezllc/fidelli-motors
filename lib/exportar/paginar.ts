// ============================================================
// Traer TODO, de a páginas.
//
// PostgREST devuelve como máximo 1000 filas por consulta (max_rows en
// supabase/config.toml, y el mismo tope en la nube). Una exportación que
// pida "todos los trabajos" sin paginar se lleva los primeros mil y nada
// avisa: el archivo abre, tiene filas, y le faltan tres mil. Por eso acá
// se pide con .range() hasta que una página venga incompleta.
//
// Las relaciones (el cliente del vehículo, los productos del trabajo)
// viajan embebidas en la misma consulta de cada página — nunca una
// consulta por fila.
// ============================================================

export const TAMANO_PAGINA = 1000;

// Cuando la exportación está filtrada, los hijos (vehículos, services,
// notas) se piden por lotes de ids con .in(). Los ids van en la URL: cien
// UUIDs son unos 3,7 KB, lejos de cualquier límite de longitud.
export const TAMANO_LOTE = 100;

type Resultado<T> = {
  data: T[] | null;
  error: { message: string } | null;
};

type Pagina<T> = (desde: number, hasta: number) => PromiseLike<Resultado<T>>;

export async function paginar<T>(consultar: Pagina<T>): Promise<T[]> {
  const todas: T[] = [];
  for (let desde = 0; ; desde += TAMANO_PAGINA) {
    const { data, error } = await consultar(desde, desde + TAMANO_PAGINA - 1);
    if (error) throw new Error(error.message);
    const pagina = data ?? [];
    for (const fila of pagina) todas.push(fila);
    if (pagina.length < TAMANO_PAGINA) return todas;
  }
}

export function enLotes<T>(items: T[], tamano = TAMANO_LOTE): T[][] {
  const lotes: T[][] = [];
  for (let i = 0; i < items.length; i += tamano) {
    lotes.push(items.slice(i, i + tamano));
  }
  return lotes;
}

// `ids === null` significa "sin filtro": una sola pasada por toda la tabla.
// Con ids, una pasada (paginada) por cada lote. Con una lista vacía no se
// consulta nada: no hay padres, no hay hijos.
export async function paginarPorLotes<T>(
  ids: string[] | null,
  consultar: (lote: string[] | null, desde: number, hasta: number) => PromiseLike<Resultado<T>>,
): Promise<T[]> {
  if (ids === null) return paginar((desde, hasta) => consultar(null, desde, hasta));
  const todas: T[] = [];
  for (const lote of enLotes(ids)) {
    const filas = await paginar((desde, hasta) => consultar(lote, desde, hasta));
    for (const fila of filas) todas.push(fila);
  }
  return todas;
}

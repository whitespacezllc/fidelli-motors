// Las categorías del catálogo viven en la BASE (tabla categorias_producto,
// administrada por Fidelli): una categoría nueva es un INSERT, no una
// migración. Este módulo solo tipa la forma y ordena lo que llega.

export type CategoriaProducto = string;

export type Categoria = {
  valor: string;
  singular: string;
  plural: string;
};

/** La fila de la base → la forma que consumen filtros y formularios. */
export function aCategorias(
  filas: { clave: string; nombre: string; plural: string }[] | null,
): Categoria[] {
  return (filas ?? []).map((c) => ({
    valor: c.clave,
    singular: c.nombre,
    plural: c.plural,
  }));
}

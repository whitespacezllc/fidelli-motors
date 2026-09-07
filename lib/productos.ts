import { normalizar } from "@/lib/texto";

// ============================================================
// El filtro del catálogo de productos.
//
// Es en memoria —el catálogo de un lubricentro son decenas de filas, se
// trae entero— y lo comparten la solapa y la exportación a Excel, para
// que el archivo traiga exactamente lo que la pantalla muestra.
// ============================================================

export type FiltrosProductos = {
  q?: string;
  categoria?: string;
};

// Una categoría que no está en el catálogo no filtra nada.
export function categoriaValida(
  categoria: string | undefined,
  validas: string[],
): string | undefined {
  return categoria && validas.includes(categoria) ? categoria : undefined;
}

export function filtrarProductos<
  P extends { nombre: string; marca: string | null; categoria: string },
>(productos: P[], filtros: FiltrosProductos): P[] {
  const busqueda = normalizar(filtros.q ?? "");
  return productos.filter((p) => {
    if (filtros.categoria && p.categoria !== filtros.categoria) return false;
    if (!busqueda) return true;
    return (
      normalizar(p.nombre).includes(busqueda) ||
      normalizar(p.marca ?? "").includes(busqueda)
    );
  });
}

export function hayFiltrosProductos(filtros: FiltrosProductos): boolean {
  return Boolean(normalizar(filtros.q ?? "") || filtros.categoria);
}

// Los mismos filtros como query string, para el link de la exportación.
export function queryProductos(filtros: FiltrosProductos): string {
  const params = new URLSearchParams();
  if (filtros.categoria) params.set("categoria", filtros.categoria);
  if (filtros.q) params.set("q", filtros.q);
  const query = params.toString();
  return query ? `?${query}` : "";
}

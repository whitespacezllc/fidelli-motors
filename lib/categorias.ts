import type { Database } from "@/lib/database.types";

export type CategoriaProducto = Database["public"]["Enums"]["categoria_producto"];

// El orden es el del enum en la base: "order by categoria" devuelve este mismo
// orden, así que la pantalla y la consulta no se pueden desincronizar.
export const CATEGORIAS: {
  valor: CategoriaProducto;
  singular: string;
  plural: string;
}[] = [
  { valor: "aceite", singular: "Aceite", plural: "Aceites" },
  { valor: "filtro", singular: "Filtro", plural: "Filtros" },
  { valor: "liquido", singular: "Líquido", plural: "Líquidos" },
  { valor: "aditivo", singular: "Aditivo", plural: "Aditivos" },
  { valor: "otro", singular: "Otro", plural: "Otros" },
];

export function esCategoria(valor: string): valor is CategoriaProducto {
  return CATEGORIAS.some((c) => c.valor === valor);
}

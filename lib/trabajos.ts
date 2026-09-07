import { normalizarPatente } from "@/lib/texto";

// ============================================================
// Los filtros del listado de trabajos, leídos de la URL.
//
// Viven acá porque los usan DOS lugares —la solapa y la exportación a
// Excel— y tienen que coincidir siempre: lo que Bruno ve filtrado es
// exactamente lo que se lleva en el archivo. Mismo criterio que
// filtroClientes() en lib/clientes.ts.
// ============================================================

export type TipoTrabajo = "service" | "mecanica";

export type FiltrosTrabajos = {
  q?: string;
  sucursal?: string;
  tipo?: TipoTrabajo;
  desde?: string;
  hasta?: string;
};

export type ParamsTrabajos = {
  q?: string;
  sucursal?: string;
  tipo?: string;
  desde?: string;
  hasta?: string;
};

const FECHA = /^\d{4}-\d{2}-\d{2}$/;

export function filtrosTrabajos(params: ParamsTrabajos): FiltrosTrabajos {
  return {
    q: params.q?.trim() || undefined,
    sucursal: params.sucursal || undefined,
    // Valor cerrado: cualquier otra cosa en la URL no filtra nada, en vez
    // de mandarle basura al enum de Postgres.
    tipo:
      params.tipo === "service" || params.tipo === "mecanica"
        ? params.tipo
        : undefined,
    desde: params.desde && FECHA.test(params.desde) ? params.desde : undefined,
    hasta: params.hasta && FECHA.test(params.hasta) ? params.hasta : undefined,
  };
}

export function hayFiltrosTrabajos(filtros: FiltrosTrabajos): boolean {
  return Boolean(
    filtros.q || filtros.sucursal || filtros.tipo || filtros.desde || filtros.hasta,
  );
}

// Lo mínimo que necesita del query builder de Supabase, para aplicarle los
// mismos filtros a la consulta del listado y a la de la exportación aunque
// seleccionen columnas distintas.
type ConsultaFiltrable<Q> = {
  like(columna: string, patron: string): Q;
  eq(columna: string, valor: string): Q;
  gte(columna: string, valor: string): Q;
  lte(columna: string, valor: string): Q;
};

// La patente entra por el join: la consulta tiene que pedir vehiculos con
// !inner para que el filtro recorte los services y no deje el vehículo en
// null.
export function aplicarFiltrosTrabajos<Q extends ConsultaFiltrable<Q>>(
  consulta: Q,
  filtros: FiltrosTrabajos,
): Q {
  const patente = filtros.q ? normalizarPatente(filtros.q) : "";
  if (patente) {
    consulta = consulta.like("vehiculos.patente_normalizada", `%${patente}%`);
  }
  if (filtros.sucursal) consulta = consulta.eq("sucursal_id", filtros.sucursal);
  if (filtros.tipo) consulta = consulta.eq("tipo", filtros.tipo);
  if (filtros.desde) consulta = consulta.gte("fecha", filtros.desde);
  if (filtros.hasta) consulta = consulta.lte("fecha", filtros.hasta);
  return consulta;
}

// Los mismos filtros como query string, para el link de la exportación.
export function queryTrabajos(filtros: FiltrosTrabajos): string {
  const params = new URLSearchParams();
  if (filtros.q) params.set("q", filtros.q);
  if (filtros.sucursal) params.set("sucursal", filtros.sucursal);
  if (filtros.tipo) params.set("tipo", filtros.tipo);
  if (filtros.desde) params.set("desde", filtros.desde);
  if (filtros.hasta) params.set("hasta", filtros.hasta);
  const query = params.toString();
  return query ? `?${query}` : "";
}

import { normalizarPatente } from "@/lib/texto";

// ============================================================
// Los filtros del listado de trabajos, leídos de la URL.
//
// Viven acá porque los usan DOS lugares —la solapa y la exportación a
// Excel— y tienen que coincidir siempre: lo que Bruno ve filtrado es
// exactamente lo que se lleva en el archivo. Mismo criterio que
// filtroClientes() en lib/clientes.ts.
// ============================================================

// ============================================================
// LOS TIPOS DE TRABAJO — un mapa, nunca un binario.
//
// Hasta el módulo de gomería había DOS tipos, y media aplicación estaba
// escrita como `tipo === "mecanica" ? A : B`: el service era "lo que no
// es mecánica", identificado por ausencia. Con un tercer tipo esa forma
// no da error — le muestra al cliente el cartón de aceite de un trabajo
// de cubiertas.
//
// Por eso el catálogo vive acá, tipado, y las pantallas se ramifican con
// un Record<TipoTrabajo, …> que el compilador obliga a completar. Un
// cuarto tipo mañana rompe el build en cada lugar que haya que mirar, que
// es exactamente lo que se quiere.
//
// El orden de TIPOS_TRABAJO es el del control de la carga.
// ============================================================

export const TIPOS_TRABAJO = ["service", "mecanica", "neumaticos"] as const;

export type TipoTrabajo = (typeof TIPOS_TRABAJO)[number];

/** Cómo se nombra cada tipo. Singular, como etiqueta de una fila. */
export const ETIQUETA_TIPO: Record<TipoTrabajo, string> = {
  service: "Service",
  mecanica: "Mecánica",
  neumaticos: "Neumáticos",
};

/** El nombre del trabajo en una oración: "Confirmar {…}". */
export const NOMBRE_TRABAJO: Record<TipoTrabajo, string> = {
  service: "service",
  mecanica: "trabajo",
  neumaticos: "trabajo",
};

/** La feature de plan que habilita cada tipo. `service` no tiene: es el
 *  trabajo base y ningún plan lo apaga. */
export const FEATURE_DE_TIPO: Record<TipoTrabajo, "mecanica" | "neumaticos" | null> = {
  service: null,
  mecanica: "mecanica",
  neumaticos: "neumaticos",
};

export function esTipoTrabajo(valor: unknown): valor is TipoTrabajo {
  return (TIPOS_TRABAJO as readonly unknown[]).includes(valor);
}

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
    tipo: esTipoTrabajo(params.tipo) ? params.tipo : undefined,
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

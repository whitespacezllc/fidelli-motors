import type { FilaLubricentro } from "@/components/fidelli/tipos";
import type { OrigenDeFila } from "@/components/fidelli/acciones-tenant";
import type { TonoChip } from "@/components/fidelli/chip";
import { esAtencion } from "@/lib/fidelli/atencion";

// ============================================================
// El listado de /fidelli/lubricentros: cómo se juntan las cuatro lecturas
// de la base en una fila, y los filtros que viven en la URL.
//
// `listado_lubricentros()` no se toca (bloque 4). Lo que la fila necesita
// además —la salud, el MRR de SQL, el estado del reloj, el módulo pago o
// bonificado, los trabajos de 30 días y las 12 semanas del sparkline—
// viene de las funciones nuevas de 20260923100000, una llamada cada una
// para TODOS los tenants, y se cruza acá por id. Nunca una consulta por
// fila.
// ============================================================

export type SaludTenant = "cobro_vencido" | "al_dia" | "actividad_baja" | "sin_actividad";

export type FilaSalud = {
  lubricentro_id: string;
  salud: SaludTenant | null;
  motivo: string | null;
  ultimo_trabajo: string | null;
};

export type FilaIndicadores = {
  lubricentro_id: string;
  es_activo: boolean;
  exento: boolean;
  estado_reloj: string | null;
  mrr_ars: number;
  modulo_pago: boolean;
  trabajos_30: number;
  ultimo_trabajo: string | null;
  /** Bloque 3: 20 o más trabajos en la primera semana, y los días de alta. */
  activado: boolean;
  dias_alta: number;
};

export type FilaSemana = {
  lubricentro_id: string;
  semana: string;
  cantidad: number;
};

export type FilaListado = {
  fila: FilaLubricentro;
  salud: FilaSalud | null;
  indicadores: FilaIndicadores | null;
  /** Las 12 semanas, de la más vieja a la más nueva. Vacío si no llegó. */
  semanas: number[];
  origen: OrigenDeFila;
};

export const ESTILO_SALUD: Record<SaludTenant, { etiqueta: string; tono: TonoChip }> = {
  // Lo normal, callado; la excepción, en ámbar. Nunca el rojo de marca.
  al_dia: { etiqueta: "Al día", tono: "neutro" },
  actividad_baja: { etiqueta: "Actividad baja", tono: "aviso" },
  sin_actividad: { etiqueta: "Sin actividad", tono: "vencido" },
  cobro_vencido: { etiqueta: "Cobro vencido", tono: "vencido" },
};

export type EstadoTenant = "activo" | "suspendido" | "suspendido_reloj" | "exento";

export const ESTILO_ESTADO: Record<EstadoTenant, { etiqueta: string; tono: TonoChip }> = {
  activo: { etiqueta: "Activo", tono: "neutro" },
  exento: { etiqueta: "Exento", tono: "neutro" },
  // El reloj lo cerró y nadie lo apagó a mano: es la excepción que hay
  // que ver. El manual se ve apagado: alguien ya decidió.
  suspendido_reloj: { etiqueta: "Suspendido por reloj", tono: "vencido" },
  suspendido: { etiqueta: "Suspendido", tono: "apagado" },
};

// El estado del tenant, con la definición única de activo (es_activo() =
// activo Y el reloj no lo tiene suspendido, docs/METRICAS.md § 1).
export function estadoDe(f: FilaListado): EstadoTenant {
  if (!f.fila.activo) return "suspendido";
  if (f.indicadores && !f.indicadores.es_activo) return "suspendido_reloj";
  if (f.indicadores?.exento || Number(f.fila.sub_descuento_pct ?? 0) >= 100) return "exento";
  return "activo";
}

export function armarListado({
  filas,
  salud,
  indicadores,
  semanas,
  origenes,
}: {
  filas: FilaLubricentro[];
  salud: FilaSalud[];
  indicadores: FilaIndicadores[];
  semanas: FilaSemana[];
  origenes: Record<string, OrigenDeFila>;
}): FilaListado[] {
  const saludPorId = new Map(salud.map((s) => [s.lubricentro_id, s]));
  const indPorId = new Map(indicadores.map((i) => [i.lubricentro_id, i]));

  // Las semanas llegan ordenadas por tenant y por semana; se agrupan y se
  // conserva ese orden.
  const semanasPorId = new Map<string, number[]>();
  for (const s of semanas) {
    const lista = semanasPorId.get(s.lubricentro_id) ?? [];
    lista.push(Number(s.cantidad));
    semanasPorId.set(s.lubricentro_id, lista);
  }

  return filas.map((fila) => ({
    fila,
    salud: saludPorId.get(fila.id) ?? null,
    indicadores: indPorId.get(fila.id) ?? null,
    semanas: semanasPorId.get(fila.id) ?? [],
    origen: origenes[fila.id] ?? { origen: null, detalle: null },
  }));
}

// ---------- Los filtros, en la URL ----------

export type FiltroListado = "todos" | "atencion" | "sin_actividad" | "sin_origen";

export function filtroDe(params: {
  atencion?: string;
  actividad?: string;
  origen?: string;
}): FiltroListado {
  if (params.atencion === "1") return "atencion";
  if (params.actividad === "sin") return "sin_actividad";
  if (params.origen === "sin") return "sin_origen";
  return "todos";
}

/** El querystring de cada filtro (sin el «?»). */
export const QUERY_FILTRO: Record<FiltroListado, string> = {
  todos: "",
  atencion: "atencion=1",
  sin_actividad: "actividad=sin",
  sin_origen: "origen=sin",
};

export function necesitaAtencion(f: FilaListado): boolean {
  return esAtencion(f.fila.atencion);
}

export function sinActividad(f: FilaListado): boolean {
  return f.salud?.salud === "sin_actividad";
}

export function sinOrigen(f: FilaListado): boolean {
  return f.origen.origen === null;
}

// El chip «No activado»: pasó la primera semana y no llegó a los 20
// trabajos (docs/METRICAS.md § 1 «Activación»). Mientras la semana corre,
// nada: todavía puede activarse.
export function noActivado(f: FilaListado): boolean {
  return (
    f.indicadores !== null &&
    !f.indicadores.activado &&
    Number(f.indicadores.dias_alta) > 7
  );
}

function normalizar(s: string): string {
  return s
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "");
}

export function coincide(f: FilaListado, q: string): boolean {
  const aguja = normalizar(q.trim());
  if (!aguja) return true;
  return normalizar(f.fila.nombre).includes(aguja) || normalizar(f.fila.slug).includes(aguja);
}

export function aplicarFiltro(
  filas: FilaListado[],
  filtro: FiltroListado,
  q: string,
): FilaListado[] {
  const porFiltro =
    filtro === "atencion"
      ? filas.filter(necesitaAtencion)
      : filtro === "sin_actividad"
        ? filas.filter(sinActividad)
        : filtro === "sin_origen"
          ? filas.filter(sinOrigen)
          : filas;
  return porFiltro.filter((f) => coincide(f, q));
}

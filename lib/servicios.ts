import type { TipoTrabajo } from "@/lib/trabajos";

// El estado de edición de un trabajo, para MOSTRARLO. La regla la impone
// la base (policy services_edicion + plazo_edicion()): esto solo pinta
// badges y decide qué botones ofrecer. Si el reloj del front miente, el
// guardado igual falla limpio del otro lado.

// ============================================================
// EL PLAZO DE EDICIÓN, POR TIPO — el espejo de plazo_edicion() en la
// base (migración 20260925110000). Un service y un trabajo de gomería se
// fijan a las 24 horas; una mecánica, a los 7 días: un arreglo de motor
// se termina de cerrar en días, no en una tarde, y el mecánico completa
// la ficha a medida que llegan los repuestos. Record y no ternario: un
// cuarto tipo obliga a contestar acá y en la base.
// ============================================================
export const PLAZO_EDICION_HORAS: Record<TipoTrabajo, number> = {
  service: 24,
  mecanica: 24 * 7,
  neumaticos: 24,
};

/** "24 horas" · "7 días" — el plazo del tipo, en palabras. */
export function plazoEdicionTexto(tipo: TipoTrabajo): string {
  const horas = PLAZO_EDICION_HORAS[tipo];
  return horas >= 48 && horas % 24 === 0 ? `${horas / 24} días` : `${horas} horas`;
}

/** "las 24 horas" · "los 7 días" — para meterlo en una oración:
 *  "pasaron …", "después de …", "durante … posteriores". */
export function plazoEdicionConArticulo(tipo: TipoTrabajo): string {
  const texto = plazoEdicionTexto(tipo);
  return `${texto.endsWith("días") ? "los" : "las"} ${texto}`;
}

export type EstadoService =
  | { tipo: "anulado" }
  | { tipo: "fijado" }
  | { tipo: "editable"; horasRestantes: number }
  | { tipo: "desbloqueado"; hasta: Date };

export function estadoService(s: {
  tipo: TipoTrabajo;
  created_at: string;
  desbloqueado_hasta: string | null;
  anulado: boolean;
}): EstadoService {
  if (s.anulado) return { tipo: "anulado" };

  const creado = new Date(s.created_at).getTime();
  const horasRestantes =
    PLAZO_EDICION_HORAS[s.tipo] - (Date.now() - creado) / 3_600_000;
  if (horasRestantes > 0) {
    return { tipo: "editable", horasRestantes };
  }

  if (s.desbloqueado_hasta) {
    const hasta = new Date(s.desbloqueado_hasta);
    if (hasta.getTime() > Date.now()) return { tipo: "desbloqueado", hasta };
  }

  return { tipo: "fijado" };
}

/** Editable o con ventana de desbloqueo abierta: se puede editar y anular. */
export function puedeEditarse(estado: EstadoService): boolean {
  return estado.tipo === "editable" || estado.tipo === "desbloqueado";
}

// "6 DÍAS" · "1 DÍA" · "22 HS" · "1 H" · "<1 H" — como el badge del hi-fi,
// más los días que trajo la mecánica: "160 HS" no le dice nada a nadie.
export function horasParaBadge(horas: number): string {
  if (horas >= 24) {
    const dias = Math.floor(horas / 24);
    return `${dias} ${dias === 1 ? "DÍA" : "DÍAS"}`;
  }
  const enteras = Math.floor(horas);
  if (enteras < 1) return "<1 H";
  return `${enteras} ${enteras === 1 ? "H" : "HS"}`;
}

// "6 días" · "1 día" · "23 horas" · "1 hora" · "menos de una hora" — para
// "Editable por … más", en el detalle.
export function restanteEnPalabras(horas: number): string {
  if (horas >= 24) {
    const dias = Math.floor(horas / 24);
    return `${dias} ${dias === 1 ? "día" : "días"}`;
  }
  const enteras = Math.floor(horas);
  if (enteras < 1) return "menos de una hora";
  return `${enteras} ${enteras === 1 ? "hora" : "horas"}`;
}

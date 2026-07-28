// El estado de edición de un service, para MOSTRARLO. La regla la impone
// la base (policy services_edicion + service_editable): esto solo pinta
// badges y decide qué botones ofrecer. Si el reloj del front miente, el
// guardado igual falla limpio del otro lado.

export type EstadoService =
  | { tipo: "anulado" }
  | { tipo: "fijado" }
  | { tipo: "editable"; horasRestantes: number }
  | { tipo: "desbloqueado"; hasta: Date };

export function estadoService(s: {
  created_at: string;
  desbloqueado_hasta: string | null;
  anulado: boolean;
}): EstadoService {
  if (s.anulado) return { tipo: "anulado" };

  const creado = new Date(s.created_at).getTime();
  const horasRestantes = 24 - (Date.now() - creado) / 3_600_000;
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

// "22 HS" · "1 H" · "<1 H" — como el badge del hi-fi.
export function horasParaBadge(horas: number): string {
  const enteras = Math.floor(horas);
  if (enteras < 1) return "<1 H";
  return `${enteras} ${enteras === 1 ? "H" : "HS"}`;
}

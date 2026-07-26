import {
  estadoService,
  horasParaBadge,
  type EstadoService,
} from "@/lib/servicios";

// El badge de estado del hi-fi (pantalla 4): EDITABLE en verde de éxito,
// FIJADO y ANULADO apagados. Verde y no rojo/ámbar a propósito — que un
// service sea editable es lo normal de las primeras 24 hs, no una alarma.
const CLASE_BASE =
  "inline-flex items-center rounded-sm border px-2.5 py-1 text-label font-semibold tracking-[0.04em] whitespace-nowrap";

export function BadgeEstado({ estado }: { estado: EstadoService }) {
  if (estado.tipo === "editable") {
    return (
      <span className={`${CLASE_BASE} border-success bg-success-soft text-success`}>
        EDITABLE {horasParaBadge(estado.horasRestantes)}
      </span>
    );
  }

  if (estado.tipo === "desbloqueado") {
    return (
      <span className={`${CLASE_BASE} border-success bg-success-soft text-success`}>
        DESBLOQUEADO
      </span>
    );
  }

  if (estado.tipo === "anulado") {
    return (
      <span className={`${CLASE_BASE} border-line bg-surface text-ink-40`}>
        ANULADO
      </span>
    );
  }

  return (
    <span className={`${CLASE_BASE} border-line bg-surface text-ink-40`}>
      FIJADO
    </span>
  );
}

export { estadoService };

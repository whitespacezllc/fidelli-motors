import type { EstadoContacto } from "@/lib/contacto";

// Los tres estados, con los colores de estado del sistema. El rojo de
// marca NO participa: acá comunica estado, y esa es la regla de oro de la
// paleta. Un service vencido es ámbar, no rojo de alarma — el lubri mira
// esta tabla todas las semanas y una pantalla que grita se deja de mirar.
const ESTILOS: Record<EstadoContacto, string> = {
  vencido: "border-overdue bg-overdue-soft text-overdue",
  urgente: "border-urgente bg-urgente-soft text-urgente",
  proximo: "border-line bg-surface text-upcoming",
};

export const ETIQUETAS: Record<EstadoContacto, string> = {
  vencido: "Vencido",
  urgente: "Urgente",
  proximo: "Próximo",
};

export function BadgeUrgencia({
  estado,
  className = "",
}: {
  estado: EstadoContacto;
  className?: string;
}) {
  return (
    <span
      className={`inline-flex items-center rounded-sm border px-2.5 py-1 text-label font-semibold tracking-[0.04em] whitespace-nowrap uppercase ${ESTILOS[estado]} ${className}`}
    >
      {ETIQUETAS[estado]}
    </span>
  );
}

// El contador de la cabecera: el mismo color, sin borde, con el número
// grande. "12 vencidos · 8 urgentes · 23 próximos".
export function ContadorEstado({
  estado,
  cantidad,
}: {
  estado: EstadoContacto;
  cantidad: number;
}) {
  return (
    <span
      className={`inline-flex items-baseline gap-1.5 rounded-md border px-3 py-1.5 ${ESTILOS[estado]}`}
    >
      <span className="font-brand text-lead font-bold tabular-nums">
        {cantidad}
      </span>
      <span className="text-ui">{ETIQUETAS[estado].toLowerCase()}s</span>
    </span>
  );
}

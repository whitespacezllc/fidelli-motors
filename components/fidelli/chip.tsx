// El chip de estado del admin: texto, borde de 1px, 12px, sin ícono.
//
// El rojo de marca no aparece en ningún tono: acá todo es estado, y el
// estado nunca es rojo. Lo normal va callado (neutro, gris); la excepción
// se ve (ámbar). El verde queda para las confirmaciones.
export type TonoChip = "neutro" | "apagado" | "ok" | "aviso" | "vencido" | "premio";

const TONOS: Record<TonoChip, string> = {
  neutro: "border-line bg-surface text-ink-60",
  apagado: "border-line bg-surface text-ink-40",
  ok: "border-success bg-success-soft text-success",
  aviso: "border-urgente bg-urgente-soft text-urgente",
  vencido: "border-overdue bg-overdue-soft text-overdue",
  premio: "border-reward bg-reward-soft text-ink",
};

export function Chip({
  tono = "neutro",
  title,
  children,
}: {
  tono?: TonoChip;
  title?: string;
  children: React.ReactNode;
}) {
  return (
    <span
      title={title}
      className={`inline-flex items-center rounded-sm border px-1.5 py-px text-label font-semibold whitespace-nowrap ${TONOS[tono]}`}
    >
      {children}
    </span>
  );
}

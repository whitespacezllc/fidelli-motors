// El círculo del "no leído" — la idea de Bruno: la sección avisa cuántos
// contactos te esperan, como una casilla de mensajes. En ÁMBAR y nunca en
// rojo: es un estado ("esto te espera"), no una acción, y es la misma
// escala que ya usan los chips de vencidos. Blanco sobre #B45309 da
// 6.6:1. Desaparece en cero — un "0" permanente es ruido que enseña a
// ignorar el círculo. El tope visual es 99+: tres dígitos ya no informan
// cantidad, informan "muchos", y rompen el círculo.
export function BadgePorLlamar({ cantidad }: { cantidad: number }) {
  if (cantidad <= 0) return null;
  return (
    <>
      <span
        aria-hidden
        className="flex h-5 min-w-5 shrink-0 items-center justify-center rounded-full bg-overdue px-1.5 font-ui text-label font-bold text-white tabular-nums"
      >
        {cantidad > 99 ? "99+" : cantidad}
      </span>
      <span className="sr-only">
        {cantidad === 1 ? "1 contacto por hacer" : `${cantidad} contactos por hacer`}
      </span>
    </>
  );
}

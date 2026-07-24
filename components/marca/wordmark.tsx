// El wordmark: FIDELLI hereda el color del contexto (ink en claro, blanco en
// oscuro); MOTORS va siempre en el rojo de marca. Nunito 700.
export function Wordmark({ className = "" }: { className?: string }) {
  return (
    <span
      className={`font-brand font-bold tracking-tight whitespace-nowrap ${className}`}
    >
      FIDELLI <span className="text-brand">MOTORS</span>
    </span>
  );
}

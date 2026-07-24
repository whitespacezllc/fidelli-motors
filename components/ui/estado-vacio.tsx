// Estado vacío del sistema (ver docs/Estados Visual.html): ícono en círculo,
// qué va a aparecer acá, y la acción para empezar. No se lamenta: explica.
export function EstadoVacio({
  icono,
  titulo,
  descripcion,
  children,
}: {
  icono?: React.ReactNode;
  titulo: string;
  descripcion: string;
  children?: React.ReactNode;
}) {
  return (
    <div className="surface-card px-6 py-9 text-center">
      {icono && (
        <div className="mx-auto mb-3.5 flex size-13 items-center justify-center rounded-full border border-line bg-surface text-ink-60">
          {icono}
        </div>
      )}
      <p className="font-brand text-body font-bold text-ink">{titulo}</p>
      <p className="mx-auto mt-1.5 max-w-md text-ui text-ink-60">{descripcion}</p>
      {children && <div className="mt-5 flex justify-center">{children}</div>}
    </div>
  );
}

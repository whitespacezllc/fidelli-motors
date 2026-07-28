// Placeholder de sección: título + qué va a aparecer acá.
// (El vacío "sin datos todavía" explica el futuro, no se disculpa.)
export function PlaceholderSeccion({
  titulo,
  descripcion,
}: {
  titulo: string;
  descripcion: string;
}) {
  return (
    <div>
      <h1 className="font-brand text-h2 font-bold text-ink">{titulo}</h1>
      <p className="mt-2 max-w-lg text-ui text-ink-60">
        Acá va a aparecer {descripcion}.
      </p>
    </div>
  );
}

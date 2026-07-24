// Cabecera de sección del panel: título en Nunito y la acción primaria a la
// derecha (un solo primario por pantalla).
export function CabeceraSeccion({
  titulo,
  children,
}: {
  titulo: string;
  children?: React.ReactNode;
}) {
  return (
    <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
      <h1 className="font-brand text-h2 font-bold text-ink">{titulo}</h1>
      {children}
    </div>
  );
}

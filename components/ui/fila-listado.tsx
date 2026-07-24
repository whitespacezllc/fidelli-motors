// Fila de listado (no tabla densa): contenido a la izquierda, estado y
// acciones a la derecha. El aire lo da la ausencia de ruido: separador de
// 1px, sin fondos. En pantallas angostas, si las acciones no entran
// (p. ej. con un error al lado del toggle), bajan de línea en vez de
// aplastar el contenido.
export function FilaListado({
  children,
  acciones,
}: {
  children: React.ReactNode;
  acciones?: React.ReactNode;
}) {
  return (
    <li className="flex flex-wrap items-center gap-x-4 gap-y-1.5 border-b border-line py-3.5 last:border-b-0">
      <div className="min-w-0 flex-[1_1_13rem]">{children}</div>
      {acciones && (
        <div className="ml-auto flex shrink-0 items-center gap-2">{acciones}</div>
      )}
    </li>
  );
}

import { BotonComoSeUsa } from "@/components/ayuda/boton-como-se-usa";

// Cabecera de sección del panel: título en Nunito, "¿Cómo se usa?" a su
// derecha cuando la solapa tiene videos (lo decide el botón por la ruta),
// y la acción primaria a la derecha de todo (un solo primario por pantalla).
export function CabeceraSeccion({
  titulo,
  children,
}: {
  titulo: string;
  children?: React.ReactNode;
}) {
  return (
    <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
      <div className="flex min-w-0 items-center gap-1.5 sm:gap-2.5">
        <h1 className="font-brand text-h2 font-bold text-ink">{titulo}</h1>
        <BotonComoSeUsa />
      </div>
      {children}
    </div>
  );
}

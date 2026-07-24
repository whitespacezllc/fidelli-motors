import { Wordmark } from "@/components/marca/wordmark";

// Panel visual del login (columna izquierda, solo desktop).
// Aislado a propósito: cuando haya foto, se cambia el fondo acá
// sin tocar el resto del login.
export function PanelVisual() {
  return (
    <aside className="relative hidden w-[55%] flex-col justify-between overflow-hidden bg-linear-to-br from-ink to-ink-60 p-12 lg:flex">
      <Wordmark className="text-[22px] text-white" />
      <p className="max-w-md font-brand text-h3 font-semibold leading-tight text-white">
        El cartón del parasol, ahora en el celular de tu cliente.
      </p>
    </aside>
  );
}

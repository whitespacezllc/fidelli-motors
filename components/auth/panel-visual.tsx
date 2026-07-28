import Image from "next/image";
import { Logo } from "@/components/marca/logo";

// Panel visual del login (columna izquierda, solo desktop). La foto de un
// lubricentro real ancla la marca en el oficio; el logo va arriba, en su
// versión clara. Aislado a propósito: cambiar la imagen no toca el resto
// del login.
export function PanelVisual() {
  return (
    <aside className="relative hidden w-[55%] overflow-hidden lg:block">
      <Image
        src="/assets/lubricentro-login.webp"
        alt=""
        fill
        priority
        sizes="55vw"
        className="object-cover"
      />

      {/* Velo oscuro: la foto tiene el fondo claro arriba, justo donde va el
          logo. Sin esto el logo gris se pierde. Más denso arriba, se abre
          hacia abajo para que la imagen respire. */}
      <div className="absolute inset-0 bg-gradient-to-b from-ink/75 via-ink/15 to-ink/45" />

      <div className="relative p-12">
        <Logo tono="gris" className="h-9 w-auto" priority />
      </div>
    </aside>
  );
}

import Image from "next/image";

// Dos versiones del logotipo real, una por tipo de fondo:
//   · negro — "fidelli" en negro. Para fondos claros (paneles, auth).
//   · gris  — "fidelli" en gris claro. Para fondos oscuros (el login sobre
//     la foto). "motors" va en bordo en las dos.
type Tono = "negro" | "gris";

const SRC: Record<Tono, string> = {
  negro: "/assets/logos/logo-negro_bordo.webp",
  gris: "/assets/logos/logo-gris_bordo.webp",
};

// El logotipo es apaisado (1000×127, ratio ~7.9:1). El alto se fija con la
// clase (h-*) y el ancho acompaña solo con w-auto, así se escala sin
// deformarse. width/height son las medidas intrínsecas que necesita
// next/image; el tamaño visible lo manda el className.
export function Logo({
  tono = "negro",
  className = "h-5 w-auto",
  priority = false,
}: {
  tono?: Tono;
  className?: string;
  priority?: boolean;
}) {
  return (
    <Image
      src={SRC[tono]}
      alt="Fidelli Motors"
      width={1000}
      height={127}
      priority={priority}
      // En pantalla nunca pasa de ~240px de ancho (h-5/h-6/h-8 por el
      // ratio 7.9:1). Sin `sizes`, next/image asumía el width intrínseco
      // y pedía la variante de 2048 para un hueco de 190px — en el navbar
      // de TODAS las páginas.
      sizes="240px"
      className={className}
    />
  );
}

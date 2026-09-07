import { existsSync } from "node:fs";
import path from "node:path";
import Image from "next/image";
import { AUTOR } from "@/lib/blog/seo";

// El avatar del autor. Si existe la foto en public/assets/santiago-afur.jpg
// se usa; si no, un círculo rojo con las iniciales. El rojo acá es
// identidad —es la marca—, no estado.
//
// La existencia se decide en build (las páginas del blog son estáticas):
// el día que la foto entre a public/assets, el próximo build la muestra
// sin tocar código.
const RUTA_FOTO = "/assets/santiago-afur.jpg";
const HAY_FOTO = existsSync(path.join(process.cwd(), "public", RUTA_FOTO));

const TAMANOS = {
  chico: { clase: "size-9 text-ui", px: 36 },
  grande: { clase: "size-14 text-lead", px: 56 },
} as const;

export function AvatarAutor({
  tamano = "chico",
}: {
  tamano?: keyof typeof TAMANOS;
}) {
  const { clase, px } = TAMANOS[tamano];

  if (HAY_FOTO) {
    return (
      <Image
        src={RUTA_FOTO}
        alt=""
        width={px}
        height={px}
        sizes={`${px}px`}
        className={`${clase} shrink-0 rounded-full object-cover`}
      />
    );
  }

  return (
    <span
      aria-hidden
      className={`${clase} grid shrink-0 place-items-center rounded-full bg-brand font-brand font-bold text-white`}
    >
      {AUTOR.iniciales}
    </span>
  );
}

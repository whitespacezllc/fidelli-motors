import { IconoWhatsapp } from "@/components/iconos";
import { CTA_WHATSAPP, TEXTO_CTA } from "@/lib/landing";

// El CTA de la landing. UNO SOLO, y de acá salen los cinco lugares donde
// aparece: navbar, hero, precio, cierre y la barra fija de mobile.
//
// Existe para que "una sola acción con un solo nombre" sea estructural y no
// una convención que se respeta hasta que alguien tenga apuro. Antes el
// mismo botón estaba escrito a mano cinco veces y el del cierre ya decía
// otra cosa.
//
// EL ÍCONO ES PHOSPHOR Y NO LUCIDE, y no es un olvido: Lucide no trae
// logos de marca —ni uno entre sus 6068 íconos, es política del proyecto—
// así que no existe un "ícono de WhatsApp de lucide-react". Lo más parecido
// sería un globo de diálogo genérico, que no es la marca. El logo real es el
// de Phosphor, que además ya estaba en uso en el cierre.
//
// Tamaño óptico: 1.1em. Va atado al cuerpo de texto del botón en vez de a
// un valor en píxeles, así queda igual de grande que la tipografía en los
// cinco tamaños en los que se usa, y nunca más.

type Variante = "solido" | "outline" | "solido-grafito";

const BASE =
  "inline-flex items-center justify-center gap-2 rounded-md font-bold transition-[color,background-color,filter]";

const VARIANTES: Record<Variante, string> = {
  solido: "bg-brand text-white hover:bg-brand-deep",
  // Grafito sobre blanco. Es la jerarquía que usa el navbar mientras el CTA
  // del hero está en pantalla, para que no haya dos botones rojos peleando.
  outline: "border border-ink bg-base text-ink hover:bg-surface",
  // EL MISMO ROJO, PERO ENCIMA DE #0A0A0A. Cambia solo el hover, y por una
  // razón medida: brand-deep (#B8161C) contra el grafito da 3.0:1, justo en
  // el filo del mínimo para un elemento de interfaz — el botón se hunde en
  // el fondo justo cuando el visitante lo está señalando. brand (#E01F26)
  // da 4.1:1, así que acá el hover aclara en vez de oscurecer.
  //
  // Va como filtro y no como un color nuevo a propósito: un `brand-light`
  // sería un token de sistema inventado para un solo hover.
  "solido-grafito": "bg-brand text-white hover:brightness-110",
};

export function CtaWhatsapp({
  variante = "solido",
  className = "",
  id,
}: {
  variante?: Variante;
  /** Alto, padding y tipografía los pone cada lugar donde se usa. */
  className?: string;
  id?: string;
}) {
  return (
    <a
      id={id}
      href={CTA_WHATSAPP}
      target="_blank"
      rel="noopener noreferrer"
      className={`${BASE} ${VARIANTES[variante]} ${className}`}
    >
      <IconoWhatsapp aria-hidden className="size-[1.1em] shrink-0" />
      {TEXTO_CTA}
    </a>
  );
}

// La marca como insignia tipográfica — EL ESTADO DEFINITIVO, no un
// placeholder. Ninguna de las cuatro fuentes de logos evaluadas otorga
// licencia (todas licencian la colección y desligan la marca registrada),
// así que acá no entra ni un logo. El día que haya una licencia por
// escrito, el logo entra en ESTE contenedor sin tocar el layout.
//
// La voz del instrumento: Public Sans 600 (font-ui), escalón label,
// mayúsculas, tracking abierto. Sobre surface con borde line — SIN color
// de marca: el rojo es acción y esto es un dato. Ancho fijo con elipsis
// para que una grilla no se desalinee entre "FIAT" y "MERCEDES BENZ".
// Los 112px salen de medir: VOLKSWAGEN (la marca #1 del parque) entra
// justo; solo los nombres más largos recortan, y el title los completa.
export function InsigniaMarca({ marca }: { marca: string | null }) {
  if (!marca) return null;
  return (
    <span
      title={marca}
      className="inline-block w-28 shrink-0 truncate rounded-sm border border-line bg-surface px-2 py-0.5 text-center font-ui text-label font-semibold tracking-[0.08em] text-ink-60 uppercase"
    >
      {marca}
    </span>
  );
}

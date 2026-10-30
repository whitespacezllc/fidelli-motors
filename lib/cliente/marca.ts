// Las iniciales del lubricentro cuando no hay logo: UNA regla para la
// página (components/cliente/marca-lubricentro.tsx) y para la tarjeta de
// WhatsApp (app/(cliente)/[slug]/opengraph-image.tsx). Las dos primeras
// palabras de más de dos letras («Falco Lubricantes y Servicios» → FL,
// «Lubricentro San Martín» → LS); si ninguna llega a tres letras, las dos
// primeras palabras tal cual, para que el círculo nunca quede vacío.
export function inicialesDe(nombre: string): string {
  const palabras = nombre.trim().split(/\s+/).filter(Boolean);
  const largas = palabras.filter((p) => p.length > 2);
  return (largas.length ? largas : palabras)
    .slice(0, 2)
    .map((p) => p[0])
    .join("")
    .toUpperCase();
}

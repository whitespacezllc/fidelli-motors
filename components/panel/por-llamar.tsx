import { Suspense } from "react";
import { BadgePorLlamar } from "@/components/panel/badge-por-llamar";

// El número de "A quién llamar", fuera del camino crítico. El layout del
// panel dispara contactos_por_hacer y NO lo espera: le pasa la promesa a
// este componente, que va adentro de su propio <Suspense>. La pantalla se
// dibuja sin el número y el círculo aparece un instante después, cuando
// llega. Una sola consulta aunque el círculo esté dos veces (el menú de
// escritorio y la barra del celular): los dos esperan la misma promesa.
//
// El hueco mientras tanto es del ancho del círculo, invisible: con el
// número el renglón no se mueve. `data-por-llamar` marca que ya llegó
// (scripts/regresion-esqueletos.mjs lo mira); con cero no hay círculo, como
// siempre.
async function Cantidad({ cuenta }: { cuenta: PromiseLike<number> }) {
  const cantidad = await cuenta;
  return (
    <span data-por-llamar={cantidad} className="contents">
      <BadgePorLlamar cantidad={cantidad} />
    </span>
  );
}

export function PorLlamar({ cuenta }: { cuenta: PromiseLike<number> }) {
  return (
    <Suspense fallback={<span aria-hidden className="block h-5 w-5" />}>
      <Cantidad cuenta={cuenta} />
    </Suspense>
  );
}

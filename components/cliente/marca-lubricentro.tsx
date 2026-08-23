import type { Lubricentro } from "@/lib/cliente/landing";
import { CLASE_LOGO_LANDING } from "@/lib/cliente/tema";

// La marca es marco, no obstáculo: confirma "estoy en el lugar correcto"
// y nada más. Por eso no lleva navegación ni ocupa media pantalla. El
// tamaño del logo es la única perilla (normal/grande/xl) y viene topado
// desde lib/cliente/tema: sin tope, el buscador cae abajo del pliegue.
export function MarcaLubricentro({ lubricentro }: { lubricentro: Lubricentro }) {
  const iniciales = lubricentro.nombre
    .split(" ")
    .filter((p) => p.length > 2)
    .slice(0, 2)
    .map((p) => p[0])
    .join("")
    .toUpperCase();

  return (
    <div className="text-center">
      {lubricentro.logoUrl ? (
        // El logo lo carga el lubri y puede estar en cualquier dominio, así
        // que no pasa por next/image: no podemos conocer de antemano los
        // remotePatterns de cada tenant.
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={lubricentro.logoUrl}
          alt={lubricentro.nombre}
          // rounded-lg: muchos lubris suben un logo cuadrado con fondo, y el
          // canto vivo se pelea con el resto de la superficie. El redondeo lo
          // ablanda sin recortar el logo (object-contain no lo estira).
          className={`mx-auto w-auto rounded-lg object-contain ${CLASE_LOGO_LANDING[lubricentro.logoTamano]}`}
        />
      ) : (
        <span
          aria-hidden
          className="mx-auto flex size-16 items-center justify-center rounded-full bg-tenant text-c-lead font-bold text-tenant-ink sm:size-24 sm:text-h3"
        >
          {iniciales}
        </span>
      )}

      <h1 className="mt-3 text-c-titulo font-bold sm:mt-4 sm:text-h2">
        {lubricentro.nombre}
      </h1>
    </div>
  );
}

import { formatearPatente } from "@/lib/texto";
import type { Lubricentro } from "@/lib/cliente/landing";
import { CLASE_LOGO_CABECERA } from "@/lib/cliente/tema";

// La marca del lubri acá es chica y va al costado: en la landing confirmaba
// "estoy en el lugar correcto", pero una vez adentro el protagonista es el
// auto. Debajo, el vehículo — lo que Pedro reconoce de un vistazo.
export function CabeceraVehiculo({
  lubricentro,
  vehiculo,
}: {
  lubricentro: Lubricentro;
  vehiculo: { patente: string; marca: string | null; modelo: string | null };
}) {
  const iniciales = lubricentro.nombre
    .split(" ")
    .filter((p) => p.length > 2)
    .slice(0, 2)
    .map((p) => p[0])
    .join("")
    .toUpperCase();

  const nombreVehiculo =
    [vehiculo.marca, vehiculo.modelo].filter(Boolean).join(" ") || "Tu auto";

  return (
    <header>
      <div className="flex items-center gap-3">
        {lubricentro.logoUrl ? (
          // El logo lo carga el lubri y puede estar en cualquier dominio:
          // no podemos conocer de antemano los remotePatterns de cada tenant.
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={lubricentro.logoUrl}
            alt=""
            className={`w-auto shrink-0 rounded-md object-contain ${CLASE_LOGO_CABECERA[lubricentro.logoTamano]}`}
          />
        ) : (
          <span
            aria-hidden
            className="flex size-11 shrink-0 items-center justify-center rounded-full bg-tenant text-c-body font-bold text-tenant-ink"
          >
            {iniciales}
          </span>
        )}
        <p className="min-w-0 truncate text-c-body font-bold">
          {lubricentro.nombre}
        </p>
      </div>

      <h1 className="mt-5 text-c-titulo font-bold sm:text-h3">
        {nombreVehiculo}
      </h1>
      <p className="plate mt-1 text-c-lead text-ink-60">
        {formatearPatente(vehiculo.patente)}
      </p>
    </header>
  );
}

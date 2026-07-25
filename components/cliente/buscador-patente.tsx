import { buscarPatente } from "@/app/(cliente)/[slug]/actions";
import { BotonBuscar } from "@/components/cliente/boton-buscar";
import { formatearPatente } from "@/lib/texto";

// El protagonista absoluto de la pantalla. Está diseñado para no fallar:
//
//   · Los dos formatos visibles en el placeholder, sin que haya que elegir.
//   · Mayúsculas automáticas mientras escribe, resueltas con CSS
//     (text-transform) en vez de JavaScript: es instantáneo, funciona sin
//     hidratar y la base normaliza igual del otro lado.
//   · autocapitalize + inputMode para que el celular abra el teclado
//     alfanumérico ya en mayúsculas.
//   · Tolerancia total a espacios y guiones: "ab 123 cd" entra igual que
//     "AB123CD". La normalización trabaja para el cliente, no al revés.
export function BuscadorPatente({
  slug,
  valorInicial,
}: {
  slug: string;
  valorInicial?: string;
}) {
  return (
    <form action={buscarPatente.bind(null, slug)}>
      <label
        htmlFor="patente"
        className="block text-center text-c-lead font-bold sm:text-c-titulo"
      >
        Escribí la patente de tu auto
      </label>

      <input
        id="patente"
        name="patente"
        type="text"
        required
        minLength={6}
        maxLength={12}
        autoFocus
        defaultValue={valorInicial ? formatearPatente(valorInicial) : undefined}
        placeholder="ABC 123 · AB 123 CD"
        aria-describedby="patente-ayuda"
        inputMode="text"
        autoCapitalize="characters"
        autoComplete="off"
        autoCorrect="off"
        spellCheck={false}
        enterKeyHint="search"
        className="plate mt-4 h-16 w-full rounded-md border-2 border-ink bg-base px-3 text-center text-c-plate uppercase placeholder:text-c-lead placeholder:font-normal placeholder:tracking-normal placeholder:text-ink-60 focus:border-tenant sm:mt-5 sm:h-20 sm:text-h1 lg:h-24"
      />

      <p id="patente-ayuda" className="mt-3 text-center text-c-body text-ink-60 sm:text-c-lead">
        Como figura en la chapa, con o sin espacios
      </p>

      <BotonBuscar />
    </form>
  );
}

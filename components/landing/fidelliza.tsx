import { IconoCheck } from "@/components/iconos";
import { EscenaFidelliza } from "@/components/landing/escena-fidelliza";
import { Revelar } from "@/components/landing/revelar";

// 07 · Fidelliza — el toque de marca y el último empujón antes del precio.
//
// FONDO BLANCO, como el resto de las secciones claras. El #FDECEC que
// tenía la sacaba del ritmo de la página y le robaba protagonismo a lo
// único que acá tiene que ser rojo: el personaje.
//
// Se presenta como PLUS y no como la razón principal: Bruno lo llamó "un
// plus" con esas palabras. De ahí el lugar que ocupa — después de todo lo
// demás y antes del precio.
//
// La escena —personaje y tarjeta animada— vive en un componente de
// cliente; esta sección le pasa el texto como children para que en mobile
// quede en el medio: personaje → texto → tarjeta.

const PUNTOS = [
  "El premio lo definís vos: un descuento, un service, lo que quieras",
  "La cuenta se lleva sola, service por service",
  "Ya lo estás haciendo a mano. Esto lo hace solo.",
] as const;

export function Fidelliza() {
  return (
    <section
      id="fidelliza"
      aria-labelledby="fidelliza-titulo"
      className="aire-seccion scroll-mt-14 bg-base text-ink md:scroll-mt-16"
    >
      <Revelar>
      <EscenaFidelliza>
        <div className="lg:col-start-1 lg:row-start-1 lg:self-center">
          <h2
            id="fidelliza-titulo"
            className="text-balance text-h3 font-bold sm:text-h2"
          >
            Tu cliente ve cuánto le falta para el premio. Y vuelve.
          </h2>

          <p className="mt-(--espacio-h2-lead) max-w-[46ch] text-pretty text-body text-ink-60 sm:text-lead">
            Definís el premio y cada cuántos services se gana. El sistema lleva
            la cuenta solo, y tu cliente ve cuánto le falta cada vez que escanea
            el parasol.
          </p>

          <ul className="mt-6 flex flex-col gap-3">
            {PUNTOS.map((punto) => (
              <li key={punto} className="flex gap-2.5 text-body text-ink-60">
                <IconoCheck
                  aria-hidden
                  className="mt-[0.2em] size-5 shrink-0 text-ink-60"
                />
                {punto}
              </li>
            ))}
          </ul>
        </div>
      </EscenaFidelliza>
      </Revelar>
    </section>
  );
}

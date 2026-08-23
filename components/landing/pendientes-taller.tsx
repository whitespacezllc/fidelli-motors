import { Revelar } from "@/components/landing/revelar";

// El remate de la 04 · Los trabajos pendientes.
//
// DÓNDE VA Y POR QUÉ: cierra "Qué cambia en tu lubricentro", pegado a las
// filas 03 y 04 —"sabés quién está por volver" y "le escribís en un clic"—
// porque es literalmente el mismo motor extendido: la retención por
// kilómetros contesta "a quién le toca volver"; los pendientes contestan
// "a quién le dijiste algo y nunca seguiste". Meterlo como quinta fila lo
// habría igualado a las otras cuatro, y esto no es una función más: es lo
// único del producto que no tiene nadie. Como banda de cierre, se lee
// después de haber entendido el motor y antes de irse de la sección.
//
// SIN IMAGEN, y es una decisión de peso: la sección ya tiene tres videos y
// una captura. El argumento acá es lo que el mecánico DICE, así que las dos
// frases habladas son la pieza visual — con la tipografía alcanza, y la
// página no vuelve a engordar.
//
// Le habla al taller sin abrir una sección para talleres: el ticket de una
// correa o un juego de pastillas es diez veces el de un cambio de aceite,
// y esa es la plata que hoy se pierde de palabra.

const DICHAS = [
  "Las pastillas están al 30%.",
  "La correa te queda para 15.000 km.",
] as const;

export function PendientesTaller() {
  return (
    <Revelar className="mt-(--espacio-bloque) rounded-lg bg-ink p-7 text-inverso sm:p-9 lg:p-12">
      <div className="grid gap-7 lg:grid-cols-2 lg:items-center lg:gap-14">
        <div>
          <p className="font-ui text-label font-semibold tracking-[0.08em] text-inverso-40 uppercase">
            05 · Trabajos pendientes
          </p>
          <h3 className="mt-2 text-balance text-lead font-bold text-inverso sm:text-h3">
            Lo que le dijiste y nunca siguió nadie.
          </h3>
          <p className="mt-3 max-w-[46ch] text-pretty text-body text-inverso-60">
            Lo anotás en diez segundos mientras el auto está en el pozo, con
            fecha o con kilómetros. Cuando llega el momento, ese auto aparece
            en la misma lista de a quién llamar, con el mensaje ya armado.
          </p>
        </div>

        {/* Las dos frases como lo que son: dicho de palabra, y perdido.
            El tachado no es decorativo — es el estado actual de esa plata. */}
        <ul className="flex flex-col gap-3">
          {DICHAS.map((frase) => (
            <li
              key={frase}
              className="rounded-md border border-inverso-line px-5 py-4 text-pretty text-body text-inverso sm:text-lead"
            >
              <span aria-hidden>“</span>
              {frase}
              <span aria-hidden>”</span>
            </li>
          ))}
          <li className="pt-1 text-ui text-inverso-40">
            El cliente asiente, se va, y no vuelve nadie. Es el cartón perdido
            con un ticket diez veces más grande.
          </li>
        </ul>
      </div>
    </Revelar>
  );
}

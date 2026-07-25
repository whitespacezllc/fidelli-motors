import { IconoQR, IconoBuscar, IconoHistorial } from "@/components/iconos";

// Los tres pasos, arriba del buscador. Lenguaje coloquial, cero
// tecnicismos: nadie le explicó a Pedro qué es esto y no va a leer un
// instructivo parado al lado del auto.
//
// Una frase por paso en vez de título + descripción: a 18px de piso, en un
// celular de 375px, tres columnas con dos líneas de texto cada una quedan
// desparejas. Así las tres envuelven igual y el orden lo da la posición.
const PASOS = [
  { Icono: IconoQR, texto: "Escaneá el QR" },
  { Icono: IconoBuscar, texto: "Buscá tu patente" },
  { Icono: IconoHistorial, texto: "Mirá tu historial" },
];

export function GuiaPasos() {
  return (
    <ol className="grid grid-cols-3 gap-2 sm:gap-4">
      {PASOS.map(({ Icono, texto }) => (
        <li key={texto} className="flex flex-col items-center text-center">
          <span
            aria-hidden
            className="flex size-12 items-center justify-center rounded-full bg-tenant-soft sm:size-16"
          >
            <Icono className="size-6 text-tenant sm:size-8" />
          </span>
          <span className="mt-2 text-c-body text-ink-60 sm:mt-3 sm:text-c-lead">
            {texto}
          </span>
        </li>
      ))}
    </ol>
  );
}

// Botón del sistema. Un solo primario por pantalla; las secundarias van en
// outline grafito. clasesBoton() existe para estilar triggers de Radix u
// otros elementos que no son <button> propio.

type Variante = "primario" | "secundario";
type Tam = "md" | "lg";

// whitespace-nowrap: la etiqueta de un botón nunca se parte en varias líneas.
// Con alto fijo (h-11/h-12), un texto que envuelve rompe el botón —pasó con
// «Marcar como fiado» apretado en la barra de Finanzas del presupuesto—.
const BASE =
  "inline-flex items-center justify-center gap-1.5 rounded-md whitespace-nowrap transition-colors disabled:opacity-60 disabled:pointer-events-none";

const VARIANTES: Record<Variante, string> = {
  primario: "bg-brand font-brand font-bold text-white hover:bg-brand-deep",
  secundario: "border border-line bg-base font-semibold text-ink hover:bg-surface",
};

const TAMS: Record<Tam, string> = {
  md: "h-11 px-4 text-ui",
  lg: "h-12 px-5 text-body",
};

export function clasesBoton(variante: Variante = "primario", tam: Tam = "md") {
  return `${BASE} ${VARIANTES[variante]} ${TAMS[tam]}`;
}

export function Boton({
  variante = "primario",
  tam = "md",
  className = "",
  ...props
}: React.ButtonHTMLAttributes<HTMLButtonElement> & {
  variante?: Variante;
  tam?: Tam;
}) {
  return (
    <button
      {...props}
      className={`${clasesBoton(variante, tam)} ${className}`}
    />
  );
}

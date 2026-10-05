import { Esqueleto, Pieza } from "@/components/ui/esqueleto";

// Nuevo trabajo, en gris: el título y la bajada son los reales (no dependen
// de nada) y la caja grande de la patente va en gris.
export default function CargandoNuevoTrabajo() {
  return (
    <Esqueleto className="mx-auto max-w-md lg:max-w-lg lg:pt-6">
      <h1 className="font-brand text-h3 font-bold text-ink">Nuevo trabajo</h1>
      <p className="mt-0.5 text-ui text-ink-60">Escribí la patente y listo</p>
      <Pieza className="mt-4 h-15 w-full rounded-lg" />
    </Esqueleto>
  );
}

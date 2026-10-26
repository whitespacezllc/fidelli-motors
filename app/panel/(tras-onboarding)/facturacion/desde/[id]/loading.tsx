import { Cabecera, Esqueleto } from "@/components/ui/esqueleto";

// Facturar presupuesto, en gris: la cabecera, el formulario del receptor y el
// panel del preview, lado a lado.
export default function CargandoFacturarPresupuesto() {
  return (
    <Esqueleto className="mx-auto max-w-4xl">
      <Cabecera titulo="Facturar presupuesto" />
      <div className="mb-6 h-4 w-96 rounded bg-surface" />
      <div className="grid gap-6 lg:grid-cols-2">
        <div className="flex flex-col gap-4">
          <div className="h-12 rounded-md bg-surface" />
          <div className="h-12 rounded-md bg-surface" />
          <div className="h-12 rounded-md bg-surface" />
          <div className="h-12 w-48 rounded-md bg-surface" />
        </div>
        <div className="h-64 rounded-lg bg-surface" />
      </div>
    </Esqueleto>
  );
}

import { Cabecera, Esqueleto } from "@/components/ui/esqueleto";

// Configuración fiscal, en gris: la cabecera y el formulario (punto de venta,
// IVA y modo de precios).
export default function CargandoConfigFiscal() {
  return (
    <Esqueleto className="mx-auto max-w-2xl">
      <Cabecera titulo="Configuración fiscal" />
      <div className="mb-6 h-4 w-80 rounded bg-surface" />
      <div className="grid gap-4 sm:grid-cols-2">
        <div className="h-12 rounded-md bg-surface" />
        <div className="h-12 rounded-md bg-surface" />
      </div>
      <div className="mt-6 h-28 rounded-md bg-surface" />
      <div className="mt-6 h-12 w-40 rounded-md bg-surface" />
    </Esqueleto>
  );
}

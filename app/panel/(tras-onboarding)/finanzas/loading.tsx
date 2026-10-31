import { Cabecera, Esqueleto, FilaGris, ListaGris } from "@/components/ui/esqueleto";

// Finanzas, en gris: «+ Nuevo ingreso», las tres tarjetas del día y la
// lista de ingresos (concepto, fecha, sucursal y monto).
export default function CargandoFinanzas() {
  return (
    <Esqueleto>
      <Cabecera titulo="Contable" derecha={["h-11 w-40 rounded-md"]} />
      <div className="mb-5 grid gap-3 sm:grid-cols-3">
        {[0, 1, 2].map((i) => (
          <div key={i} className="surface-card px-5 py-4">
            <div className="h-3 w-24 rounded bg-surface" />
            <div className="mt-2 h-6 w-28 rounded bg-surface" />
          </div>
        ))}
      </div>
      <ListaGris
        filas={8}
        fila={(i) => <FilaGris key={i} className="h-[66px]" lineas={["h-4 w-44", "h-3 w-24"]} derecha={["h-3 w-20", "h-4 w-24"]} />}
      />
    </Esqueleto>
  );
}

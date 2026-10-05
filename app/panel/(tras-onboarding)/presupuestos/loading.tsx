import { Cabecera, Esqueleto, FilaGris, ListaGris } from "@/components/ui/esqueleto";

// Presupuestos, en gris: «+ Nuevo presupuesto» y la lista (número, cliente,
// fecha y total).
export default function CargandoPresupuestos() {
  return (
    <Esqueleto>
      <Cabecera titulo="Presupuestos" derecha={["h-11 w-42 rounded-md"]} />
      <ListaGris
        filas={8}
        fila={(i) => <FilaGris key={i} className="h-[70px]" lineas={["h-4 w-36", "h-3 w-48"]} derecha={["h-3 w-20", "h-4 w-24"]} />}
      />
    </Esqueleto>
  );
}

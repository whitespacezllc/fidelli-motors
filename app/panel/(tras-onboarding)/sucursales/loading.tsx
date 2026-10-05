import { Cabecera, Esqueleto, FilaGris, ListaGris } from "@/components/ui/esqueleto";

// Sucursales, en gris: «+ Nueva sucursal» y la lista (nombre y dirección, y
// a la derecha si está activa y editar).
export default function CargandoSucursales() {
  return (
    <Esqueleto>
      <Cabecera titulo="Sucursales" derecha={["h-11 w-36 rounded-md"]} />
      <ListaGris
        filas={2}
        fila={(i) => <FilaGris key={i} className="h-[74px]" lineas={["h-4 w-36", "h-3 w-56"]} derecha={["h-6 w-16 rounded-sm", "h-11 w-20 rounded-md"]} />}
      />
    </Esqueleto>
  );
}

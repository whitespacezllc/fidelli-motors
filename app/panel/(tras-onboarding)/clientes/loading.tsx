import { Cabecera, Esqueleto, FilaGris, ListaGris, Pieza } from "@/components/ui/esqueleto";

// Clientes, en gris: Exportar y «+ Nuevo cliente» a la derecha del título,
// el buscador y la lista (una fila de 80 px por cliente: nombre y
// teléfono, y a la derecha los vehículos y el último service).
export default function CargandoClientes() {
  return (
    <Esqueleto>
      <Cabecera titulo="Clientes" derecha={["h-11 w-35 rounded-md", "h-11 w-33 rounded-md"]} />
      <div className="mb-5">
        <Pieza className="h-12 w-full rounded-md" />
      </div>
      <ListaGris
        filas={10}
        fila={(i) => (
          <FilaGris
            key={i}
            className="h-20"
            lineas={["h-4 w-40", "h-3 w-28"]}
            derecha={["hidden h-3 w-20 sm:block", "h-3 w-36"]}
          />
        )}
      />
    </Esqueleto>
  );
}

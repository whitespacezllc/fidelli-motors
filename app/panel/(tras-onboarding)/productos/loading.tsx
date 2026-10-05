import { Cabecera, Esqueleto, FilaGris, ListaGris, Pieza } from "@/components/ui/esqueleto";

// Productos, en gris: los botones de la cabecera, el buscador, los chips de
// categoría y una sección por categoría con su lista.
export default function CargandoProductos() {
  return (
    <Esqueleto>
      <Cabecera titulo="Productos" derecha={["h-11 w-35 rounded-md", "h-11 w-38 rounded-md"]} />
      <div className="mb-5 flex flex-col gap-3">
        <Pieza className="h-12 w-full rounded-md" />
        <div className="flex flex-wrap gap-2">
          {["w-20", "w-24", "w-28", "w-24", "w-32", "w-24"].map((ancho, i) => (
            <Pieza key={i} className={`h-11 rounded-md ${ancho}`} />
          ))}
        </div>
      </div>
      <div className="flex flex-col gap-6">
        {[0, 1].map((s) => (
          <section key={s}>
            <Pieza className="mb-2 ml-1 h-3 w-24" />
            <ListaGris
              filas={4}
              fila={(i) => <FilaGris key={i} className="h-[70px]" lineas={["h-4 w-48", "h-3 w-32"]} derecha={["h-3 w-16", "h-11 w-20 rounded-md"]} />}
            />
          </section>
        ))}
      </div>
    </Esqueleto>
  );
}

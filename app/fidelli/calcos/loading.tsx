import { Esqueleto, FilaGris, ListaGris, Pieza } from "@/components/ui/esqueleto";

// La cola de calcos de /fidelli, en gris: la bajada, las solapas por
// estado y la lista de pedidos.
export default function CargandoColaCalcos() {
  return (
    <Esqueleto>
      <h1 className="mb-1.5 font-brand text-h2 font-bold text-ink">Calcos</h1>
      <div className="mb-5 flex max-w-2xl flex-col gap-2">
        <Pieza className="h-3.5 w-full" />
        <Pieza className="h-3.5 w-2/5" />
      </div>
      <div className="mb-4 flex flex-wrap gap-1.5">
        {["w-26", "w-24", "w-34", "w-32", "w-26", "w-29", "w-20"].map((ancho, i) => (
          <Pieza key={i} className={`h-11 rounded-md ${ancho}`} />
        ))}
      </div>
      <ListaGris
        filas={6}
        fila={(i) => <FilaGris key={i} className="h-[72px]" lineas={["h-4 w-48", "h-3 w-64"]} derecha={["h-6 w-24 rounded-sm", "h-11 w-28 rounded-md"]} />}
      />
    </Esqueleto>
  );
}

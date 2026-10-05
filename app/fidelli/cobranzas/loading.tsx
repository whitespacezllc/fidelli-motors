import { Esqueleto, FilaGris, ListaGris, Pieza } from "@/components/ui/esqueleto";

// Cobranzas, en gris: la bajada y la lista de quién vence.
export default function CargandoCobranzas() {
  return (
    <Esqueleto>
      <h1 className="mb-1.5 font-brand text-h2 font-bold text-ink">Cobranzas</h1>
      <div className="mb-6 flex max-w-2xl flex-col gap-2">
        <Pieza className="h-3.5 w-full" />
        <Pieza className="h-3.5 w-1/2" />
      </div>
      <Pieza className="mb-3 h-5 w-48" />
      <ListaGris
        filas={6}
        fila={(i) => <FilaGris key={i} className="h-[72px]" lineas={["h-4 w-44", "h-3 w-60"]} derecha={["h-4 w-24", "h-11 w-28 rounded-md"]} />}
      />
    </Esqueleto>
  );
}

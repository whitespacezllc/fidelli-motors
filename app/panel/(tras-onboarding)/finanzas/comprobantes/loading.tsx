import { Cabecera, Esqueleto, FilaGris, ListaGris } from "@/components/ui/esqueleto";

// Cargar desde comprobante, en gris: la zona de subida y la lista de
// comprobantes por revisar.
export default function CargandoComprobantes() {
  return (
    <Esqueleto>
      <div className="mx-auto max-w-2xl">
        <Cabecera titulo="Cargar desde comprobante" />
        <div className="mb-4 h-4 w-80 rounded bg-surface" />
        <div className="mb-5 h-40 w-full rounded-lg bg-surface" />
        <ListaGris
          filas={4}
          fila={(i) => (
            <FilaGris key={i} className="h-[66px]" lineas={["h-4 w-48", "h-3 w-28"]} derecha={["h-8 w-20"]} />
          )}
        />
      </div>
    </Esqueleto>
  );
}

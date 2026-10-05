import { Esqueleto, Marco, Pieza } from "@/components/ui/esqueleto";

// La ficha del cliente, en gris: la miga de pan, la tarjeta con el nombre,
// los datos de contacto y sus dos botones, y los vehículos (una tarjeta
// por auto, con su historial) con «+ Agregar vehículo» al pie.
export default function CargandoFichaCliente() {
  return (
    <Esqueleto>
      <div className="mb-4 flex h-5 items-center gap-2">
        <Pieza className="h-3.5 w-14" />
        <Pieza className="h-3.5 w-28" />
      </div>
      <Marco className="surface-card mb-5 flex flex-wrap items-start justify-between gap-4 p-5">
        <div className="min-w-0">
          <Pieza className="h-8 w-56 max-w-full" />
          <Pieza className="mt-2.5 h-3.5 w-72 max-w-full" />
          <Pieza className="mt-2.5 h-3.5 w-40" />
        </div>
        <div className="flex flex-wrap gap-3">
          <Pieza className="h-11 w-44 rounded-md" />
          <Pieza className="h-11 w-28 rounded-md" />
        </div>
      </Marco>
      <section>
        <Pieza className="mb-2 ml-1 h-3 w-20" />
        <div className="flex flex-col gap-3">
          {["h-[281px]", "h-[446px]"].map((alto, i) => (
            <Marco key={i} className={`surface-card p-5 ${alto}`}>
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                  <Pieza className="h-6 w-28" />
                  <Pieza className="mt-2 h-3.5 w-40" />
                </div>
                <Pieza className="h-11 w-36 rounded-md" />
              </div>
              <div className="mt-6 flex flex-col gap-3">
                <Pieza className="h-3.5 w-full" />
                <Pieza className="h-3.5 w-4/5" />
                <Pieza className="h-3.5 w-3/5" />
              </div>
            </Marco>
          ))}
        </div>
      </section>
    </Esqueleto>
  );
}

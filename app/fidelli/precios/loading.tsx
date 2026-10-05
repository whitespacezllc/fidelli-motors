import { CampoGris, Esqueleto, Marco, Pieza } from "@/components/ui/esqueleto";

// Plan y precios, en gris: la bajada y una tarjeta por plan con sus
// precios y descuentos.
export default function CargandoPrecios() {
  return (
    <Esqueleto>
      <h1 className="mb-1.5 font-brand text-h2 font-bold text-ink">Plan y precios</h1>
      <div className="mb-6 flex max-w-2xl flex-col gap-2">
        <Pieza className="h-3.5 w-full" />
        <Pieza className="h-3.5 w-full" />
        <Pieza className="h-3.5 w-1/3" />
      </div>
      <div className="flex flex-col gap-5">
        {[0, 1, 2].map((i) => (
          <Marco key={i} className="surface-card flex h-[497px] flex-col gap-5 p-5">
            <Pieza className="h-6 w-40" />
            <div className="grid gap-4 sm:grid-cols-3">
              <CampoGris />
              <CampoGris />
              <CampoGris />
            </div>
            <CampoGris />
          </Marco>
        ))}
      </div>
    </Esqueleto>
  );
}

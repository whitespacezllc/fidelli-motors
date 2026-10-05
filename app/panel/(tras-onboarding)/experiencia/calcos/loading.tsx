import { Esqueleto, Marco, Pieza } from "@/components/ui/esqueleto";

// La hoja de calcos QR, en gris: el título, la bajada y los botones, y la
// hoja con sus nueve calcos de 5 × 8 cm.
export default function CargandoHojaCalcos() {
  return (
    <Esqueleto>
      <div className="mb-5">
        <h1 className="font-brand text-h3 font-bold text-ink">Calcos QR</h1>
        <Pieza className="mt-2 h-3.5 w-full max-w-2xl" />
        <Pieza className="mt-2 h-3.5 w-3/5 max-w-xl" />
        <div className="mt-4 flex gap-2.5">
          <Pieza className="h-11 w-36 rounded-md" />
          <Pieza className="h-11 w-36 rounded-md" />
        </div>
      </div>
      <Marco className="grid max-w-[680px] grid-cols-3 gap-3 rounded-lg border border-line p-4">
        {Array.from({ length: 9 }, (_, i) => (
          <Pieza key={i} className="aspect-[5/8] w-full rounded-md" />
        ))}
      </Marco>
    </Esqueleto>
  );
}

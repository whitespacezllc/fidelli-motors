import { Esqueleto, Marco, Pieza } from "@/components/ui/esqueleto";

// El onboarding, en gris: el título del paso con el nombre del taller, el
// indicador de pasos y la tarjeta del paso.
export default function CargandoOnboarding() {
  return (
    <Esqueleto className="mx-auto max-w-5xl">
      <div className="mb-6">
        <Pieza className="h-9 w-72 max-w-full" />
        <Pieza className="mt-2 h-4 w-48" />
      </div>
      <div className="flex gap-3">
        {[0, 1, 2].map((i) => (
          <Pieza key={i} className="h-14 flex-1 rounded-lg" />
        ))}
      </div>
      <Marco className="surface-card mt-8 flex min-h-[420px] flex-col gap-5 p-5 sm:p-6">
        <Pieza className="h-5 w-56" />
        <Pieza className="h-3.5 w-4/5" />
        <div className="grid gap-3 sm:grid-cols-2">
          <Pieza className="h-24 w-full rounded-md" />
          <Pieza className="h-24 w-full rounded-md" />
        </div>
        <Pieza className="mt-auto h-12 w-44 rounded-md" />
      </Marco>
    </Esqueleto>
  );
}

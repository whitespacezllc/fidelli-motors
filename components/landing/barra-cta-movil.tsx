import { CTA_WHATSAPP } from "@/lib/landing";

// La barra fija al pie, solo en mobile y durante TODA la página.
//
// El CTA no va en el navbar de mobile ni en un menú hamburguesa: un menú
// esconde la única acción de la página detrás de un toque de más. Acá está
// siempre a la vista y siempre al alcance del pulgar.
//
// pb con safe-area para que no quede debajo de la barra de gestos del iPhone.
export function BarraCtaMovil() {
  return (
    <div className="fixed inset-x-0 bottom-0 z-40 border-t border-line bg-base/95 px-5 pt-3 pb-[calc(0.75rem+env(safe-area-inset-bottom))] backdrop-blur-md sm:hidden">
      <a
        href={CTA_WHATSAPP}
        target="_blank"
        rel="noopener noreferrer"
        className="flex h-12 w-full items-center justify-center rounded-md bg-brand font-brand text-body font-bold text-white transition-colors hover:bg-brand-deep"
      >
        Quiero mi lugar
      </a>
    </div>
  );
}

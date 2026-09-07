import { IconoDescargar } from "@/components/iconos";

// El bloque de descarga de un artículo que trae `descarga` en el
// frontmatter. Destacado por la tarjeta, no por el color del botón: la
// única acción primaria de toda la superficie comercial es el WhatsApp del
// cierre, así que este botón va en contorno grafito, con el mismo hover que
// el del navbar cuando el CTA del hero está a la vista (bg-surface).
//
// `download` en el enlace: el clic baja el archivo en vez de intentar
// abrirlo en el navegador.
export function BloqueDescarga({
  href,
  className = "",
}: {
  href: string;
  className?: string;
}) {
  return (
    <aside
      aria-label="Descarga"
      className={`rounded-lg border border-line bg-surface p-5 sm:flex sm:items-center sm:justify-between sm:gap-6 sm:p-6 ${className}`}
    >
      <div>
        <p className="font-ui text-ui font-semibold text-ink">
          La planilla de esta guía
        </p>
        <p className="mt-1 max-w-[44ch] text-pretty font-ui text-ui text-ink-60">
          Con las columnas que se explican abajo, para Excel o Google Sheets.
        </p>
      </div>
      <a
        href={href}
        download
        className="mt-4 inline-flex h-12 shrink-0 items-center justify-center gap-2 rounded-md border border-ink bg-base px-5 font-brand text-body font-bold text-ink transition-colors hover:bg-surface sm:mt-0"
      >
        <IconoDescargar aria-hidden className="size-[1.1em] shrink-0" />
        Descargar planilla (.xlsx)
      </a>
    </aside>
  );
}

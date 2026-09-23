import { IconoDescargar } from "@/components/iconos";
import { clasesBoton } from "@/components/ui/boton";
import { hrefExportar, type ClaveRecurso, type NombreParametro } from "@/lib/fidelli/exportar";

// ============================================================
// «Exportar CSV»: un enlace con `download` a la ruta del data room
// (app/api/fidelli/exportar/[recurso]). Es un <a> y no un <button> con
// fetch porque el navegador ya sabe bajar un archivo: el nombre lo pone
// el Content-Disposition del servidor y no hace falta JavaScript. Por eso
// es un Server Component y se puede poner en cualquier cabecera del admin.
//
// Los parámetros son los del filtro VIGENTE de la pantalla que lo muestra
// (el tenant de la ficha, el estado y el canal de la pauta, el período de
// Crecimiento): el archivo tiene que ser lo que la persona está mirando.
// Los vacíos, y el «todos» de estado y canal (un centinela, no un valor),
// no viajan (hrefExportar).
//
// Estilo: el secundario del sistema (outline grafito, components/ui/boton),
// y `compacto` para las cabeceras de tarjeta, donde los 44px del botón
// completo no entran; es la misma medida de los enlaces de paginación de
// la ficha (min-h-9).
// ============================================================

const COMPACTO =
  "inline-flex min-h-9 items-center justify-center gap-1.5 rounded-md border border-line bg-base px-3 text-ui font-semibold text-ink transition-colors hover:bg-surface";

export function BotonExportar({
  recurso,
  params = {},
  compacto = false,
  etiqueta = "Exportar CSV",
  className = "",
}: {
  recurso: ClaveRecurso;
  params?: Partial<Record<NombreParametro, string | null | undefined>>;
  compacto?: boolean;
  etiqueta?: string;
  className?: string;
}) {
  return (
    <a
      href={hrefExportar(recurso, params)}
      download
      className={`${compacto ? COMPACTO : clasesBoton("secundario", "md")} ${className}`}
    >
      <IconoDescargar aria-hidden className="size-4 shrink-0" />
      {etiqueta}
    </a>
  );
}

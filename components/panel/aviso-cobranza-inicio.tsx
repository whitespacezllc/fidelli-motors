import { IconoWhatsapp } from "@/components/iconos";
import { clasesBoton } from "@/components/ui/boton";
import { textoDeCobranza, enlaceDePagoDe, esEnlaceExterno } from "@/lib/cobranza/copy";
import type { Cobranza } from "@/lib/auth/cobranza";

// ============================================================
// LA BARRA DISCRETA DE `por_vencer` — SOLO en Inicio
//
// "Barra discreta solo en Inicio. Fecha, monto y botón Pagar. En ninguna
// otra pantalla." Y la razón de que sea solo acá: el que decide pagar es el
// dueño, y el dueño entra por Inicio. El mecánico que abre el panel para
// cargar un service no tiene nada que hacer con esta información.
//
// Es el escalón más bajo de la escalera y tiene que verse como tal: gris,
// no ámbar. Todavía no pasó nada — el plan simplemente vence pronto.
// El ámbar arranca en `gracia`, cuando ya venció.
//
// El monto va acá y no en la barra de gracia porque acá se paga UNA
// consulta (`monto_de_renovacion`) en UNA pantalla; en la barra de gracia,
// que vive en el layout, sería una consulta en cada pantalla del panel.
//
// Server Component: cero JavaScript.
// ============================================================
export function AvisoCobranzaInicio({
  cobranza,
  monto,
  taller,
}: {
  cobranza: Cobranza;
  monto: string | null;
  taller: string | null;
}) {
  if (cobranza.estado !== "por_vencer") return null;

  const texto = textoDeCobranza(cobranza, monto);
  if (!texto) return null;

  const href = enlaceDePagoDe(cobranza, monto, taller);
  const externo = esEnlaceExterno(href);

  return (
    <div
      role="status"
      className="mb-6 flex flex-wrap items-center justify-between gap-3 rounded-lg border border-line bg-surface px-4 py-3 sm:px-5 print:hidden"
    >
      <div className="min-w-0">
        <p className="text-ui font-semibold text-ink">{texto.titulo}</p>
        {texto.detalle && (
          <p className="mt-0.5 text-ui text-ink-60 tabular-nums">{texto.detalle}</p>
        )}
      </div>

      <a
        href={href}
        {...(externo ? { target: "_blank", rel: "noreferrer" } : {})}
        className={`${clasesBoton("primario")} shrink-0`}
      >
        <IconoWhatsapp aria-hidden className="size-4" />
        {texto.accion}
      </a>
    </div>
  );
}

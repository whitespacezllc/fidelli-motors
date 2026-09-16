import { IconoWhatsapp } from "@/components/iconos";
import { clasesBoton } from "@/components/ui/boton";
import { textoDeCobranza, enlaceDePagoDe } from "@/lib/cobranza/copy";
import type { Cobranza } from "@/lib/auth/cobranza";

// ============================================================
// LA BARRA DE GRACIA — persistente, en todo el panel
//
// La escalera SUBE LA VISIBILIDAD, NUNCA LA FRICCIÓN. El que ve esto es el
// mecánico con las manos con aceite y un cliente esperando; el que decide
// pagar es el dueño. Por eso:
//
//   · Es una barra, no un modal. No tapa nada, no hay que cerrarla.
//   · Es un Server Component: CERO JavaScript al celular del mecánico.
//   · No hace ninguna consulta: el estado viajó con la sesión.
//   · No muestra el monto. El monto vive en la barra de Inicio, que es
//     donde lo mira el dueño; pedirlo en cada pantalla del panel sería una
//     consulta por pantalla para un número que el mecánico no usa.
//
// ÁMBAR, NUNCA ROJO: el rojo de marca es acción y nunca estado. El rojo sí
// va en el botón Pagar, que es una acción.
//
// `print:hidden` porque el panel imprime presupuestos y el cartón, y un
// aviso de cobranza no va en un papel que se le da a un cliente final.
// ============================================================
export function BarraCobranza({
  cobranza,
  taller,
}: {
  cobranza: Cobranza;
  taller: string | null;
}) {
  // Solo la gracia se muestra en todo el panel. `por_vencer` es la barra
  // discreta de Inicio y `suspendido` ya tiene `AvisoSuspension`.
  if (cobranza.estado !== "gracia") return null;

  const texto = textoDeCobranza(cobranza);
  if (!texto) return null;

  return (
    <div
      role="status"
      className="mb-6 flex flex-wrap items-center justify-between gap-3 rounded-lg border border-overdue bg-overdue-soft px-4 py-3 sm:px-5 print:hidden"
    >
      <div className="min-w-0">
        <p className="font-brand text-ui font-bold text-overdue">{texto.titulo}</p>
        {texto.detalle && (
          <p className="mt-0.5 text-ui text-ink-60">{texto.detalle}</p>
        )}
      </div>

      <a
        href={enlaceDePagoDe(cobranza, null, taller)}
        target="_blank"
        rel="noreferrer"
        className={`${clasesBoton("primario")} shrink-0`}
      >
        <IconoWhatsapp aria-hidden className="size-4" />
        {texto.accion}
      </a>
    </div>
  );
}

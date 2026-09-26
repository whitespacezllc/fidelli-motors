import { urlWhatsappSoporte } from "@/lib/config";
import { IconoWhatsapp } from "@/components/iconos";
import { clasesBoton } from "@/components/ui/boton";
import { textoDeCobranza, enlaceDePagoDe, esEnlaceExterno } from "@/lib/cobranza/copy";
import type { Cobranza } from "@/lib/auth/cobranza";

// El motivo que acompaña a cada botón apagado. Tres textos, uno por
// situación, y la elección se hace UNA vez en el layout del panel:
//
//   · MANUAL — la levanta Fidelli, la salida es WhatsApp.
//   · RELOJ  — la levanta el pago, la salida es Pagar.
//   · el NEUTRO, para los botones apagados que viven en componentes que no
//     conocen la sesión (AccionBloqueada): dice lo que es cierto en los dos
//     casos y deja el cómo a la tarjeta de arriba.
export const MOTIVO_SUSPENSION_MANUAL =
  "Tu cuenta está suspendida: escribinos por WhatsApp para reactivarla.";
export const MOTIVO_SUSPENSION_RELOJ =
  "Tu cuenta está suspendida por falta de pago: pagá desde Tu suscripción y se reactiva sola.";
export const MOTIVO_SUSPENSION =
  "Tu cuenta está suspendida: el panel está en solo lectura hasta que se reactive.";

// ============================================================
// El aviso de suspensión
//
// Va arriba de todo en el panel, en todas las pantallas. No es un error ni
// una pantalla de bloqueo: el owner entra con sus credenciales de siempre y
// ve sus clientes, sus vehículos y todo su historial intacto. Lo único que
// no puede es cargar cosas nuevas.
//
// SON DOS TARJETAS Y NO UNA, porque son dos suspensiones distintas y tienen
// salidas distintas (hallazgo #1 de la verificación del 26/09):
//
//   · `AvisoSuspension` — el interruptor MANUAL (`activo = false`). La
//     apagó Fidelli y la levanta Fidelli: pagar no la levanta, así que no
//     se ofrece pagar. El botón es WhatsApp.
//   · `AvisoSuspensionReloj` — la suspensión POR RELOJ (o el bloqueo del
//     que nunca pagó). Es derivada: en cuanto se acredita el pago, se
//     levanta sola. La salida natural del que se atrasó es pagar, no
//     escribir: el botón es Pagar, a /panel/suscripcion, y el texto sale
//     del mismo copy que el resto de la escalera (lib/cobranza/copy.ts,
//     voz por voz: cobranza, alta, trial). Hasta el 26/09 el suspendido
//     por reloj veía la tarjeta manual y para pagar tenía que adivinar el
//     camino por Mi cuenta.
//
// Quién es quién lo decide `sesion.suspensionManual` en el layout —el
// corte es `activo`, nunca el estado del reloj, que con `activo = false`
// también dice `suspendido`.
//
// ⚠ ACÁ NO SE AFIRMA NADA SOBRE LA PÁGINA PÚBLICA, y no es una omisión.
// Hasta el 17/09 este cartel decía "tu página pública tampoco está
// respondiendo: los clientes que escaneen el QR no van a encontrarla", y
// era falso por partida doble: `get_landing` perdió el filtro por `activo`
// el 22/08 a propósito (la regla 8 de CLAUDE.md, la vigila R4) y el reloj
// de cobranza NUNCA escribe `activo`. Estaba en la pantalla donde le
// pedimos plata a alguien, y era lo primero que ese alguien podía desmentir
// abriendo su propia vidriera. Lo que sí es cierto en los dos casos, desde
// 20260926200000, es que la página responde SIN el premio ni el mensaje al
// escanear (R4, R36) — y eso lo dicen los Términos, no este cartel.
//
// Ámbar, nunca rojo: el rojo de marca es acción. Sí va en el botón Pagar,
// que es una acción.
// ============================================================

function Tarjeta({
  titulo,
  lineas,
  accion,
}: {
  titulo: string;
  lineas: string[];
  accion: { href: string; texto: string; externo: boolean };
}) {
  return (
    <div
      role="status"
      className="mb-6 rounded-lg border border-overdue bg-overdue-soft px-4 py-4 sm:px-5 print:hidden"
    >
      <p className="font-brand text-body font-bold text-overdue">{titulo}</p>

      {lineas.map((linea) => (
        <p key={linea} className="mt-1.5 text-ui text-ink-60">
          {linea}
        </p>
      ))}

      {accion.externo ? (
        <a
          href={accion.href}
          target="_blank"
          rel="noreferrer"
          className="mt-4 inline-flex h-11 items-center gap-2 rounded-md bg-ink px-4 font-brand text-ui font-bold text-base transition-colors hover:bg-ink-60"
        >
          <IconoWhatsapp className="size-4" />
          {accion.texto}
        </a>
      ) : (
        <a href={accion.href} className={`${clasesBoton("primario")} mt-4`}>
          {accion.texto}
        </a>
      )}
    </div>
  );
}

/** La suspensión MANUAL: la apagó Fidelli, la levanta Fidelli. */
export function AvisoSuspension() {
  return (
    <Tarjeta
      titulo="Tu cuenta está suspendida"
      lineas={[
        "El panel pasa a solo lectura: podés consultar todos tus datos, pero no vas a poder cargar services ni dar de alta clientes, vehículos o productos hasta que se reactive.",
        "No se borró nada. Escribinos y lo resolvemos.",
      ]}
      accion={{ href: urlWhatsappSoporte(), texto: "Escribirle a Fidelli", externo: true }}
    />
  );
}

/**
 * La suspensión POR RELOJ (y el bloqueo del que nunca pagó): se levanta
 * sola con el pago. Server Component sin consultas: el estado viajó con la
 * sesión, y el monto no se muestra acá —vive en el modal de Inicio, que es
 * donde lo mira el dueño— para no pagar una consulta por pantalla.
 */
export function AvisoSuspensionReloj({
  cobranza,
  taller,
}: {
  cobranza: Cobranza;
  taller: string | null;
}) {
  const texto = textoDeCobranza(cobranza);
  // Sin copy no hay tarjeta a medias: se cae a la manual, que siempre es
  // cierta (el panel está en solo lectura) aunque no ofrezca el atajo.
  if (!texto) return <AvisoSuspension />;

  const href = enlaceDePagoDe(cobranza, null, taller);
  const externo = esEnlaceExterno(href);

  return (
    <Tarjeta
      titulo={texto.titulo}
      lineas={[
        ...(texto.detalle ? [texto.detalle] : []),
        externo
          ? "No se borró nada: tus clientes, tus vehículos y todo tu historial siguen ahí."
          : "No se borró nada. En cuanto se acredita el pago, todo vuelve a funcionar solo, sin que tengas que avisarnos.",
      ]}
      accion={{ href, texto: texto.accion, externo }}
    />
  );
}

"use client";

import { useEffect, useState } from "react";
import * as RadixDialog from "@radix-ui/react-dialog";
import { IconoWhatsapp } from "@/components/iconos";
import { clasesBoton } from "@/components/ui/boton";
import { Dialog, DialogContenido } from "@/components/ui/dialog";
import { textoDeCobranza, enlaceDePagoDe, esEnlaceExterno } from "@/lib/cobranza/copy";
import type { Cobranza } from "@/lib/auth/cobranza";

// ============================================================
// EL MODAL DE GRACIA Y DE SUSPENSIÓN — uno por día, y SOLO en Inicio
//
// Se muestra en GRACIA (venció, todavía trabaja) y en SUSPENDIDO POR RELOJ
// (el panel ya está en solo lectura). El suspendido es el que MÁS tiene
// que ver el botón de pagar: hasta el 26/09 el modal se apagaba justo al
// suspenderse y el dueño se quedaba con un cartel de WhatsApp (hallazgo #1
// de la verificación). La suspensión MANUAL no lo muestra —pagar no la
// levanta—, y quién es quién lo dice `suspensionManual`, que viene de la
// sesión: con `activo = false` el reloj también dice `suspendido`.
//
// ⚠ POR QUÉ ES IMPOSIBLE QUE APAREZCA SOBRE LA CARGA DE UN SERVICE, y no
// solo improbable: este componente se monta en UN solo lugar,
// `app/panel/(tras-onboarding)/page.tsx`, que es la PÁGINA de Inicio. No
// vive en ningún layout, y la página de Inicio no es ancestro de ninguna
// otra ruta del panel. La garantía es del árbol de rutas, no de una lista
// de exclusiones que alguien tenga que mantener al día: para que esto
// aparezca encima del cartón habría que MOVER el archivo.
//
// Se paga un costo y se acepta: el dueño que entra directo a otra pantalla
// no lo ve ese día. Es el precio de que la carga de un service no se haga
// más lenta ni un segundo, en ningún estado — que es la regla que manda.
//
// El "uno por día" vive en localStorage, por dispositivo. SI NO HAY
// STORAGE NO SE MUESTRA: un modal que no se puede cerrar para siempre es
// peor que no mostrarlo. Eso cubre incógnito, cuota llena y storage
// bloqueado, que son los tres casos donde escribir falla.
//
// Foco atrapado, Escape y scroll lock los pone el Dialog del sistema
// (Radix). No se reimplementa nada.
// ============================================================

const CLAVE = "fm_cobranza_modal";

// Hoy en Argentina, no en UTC: a las 22:00 de Buenos Aires el `toISOString`
// ya dice mañana, y el modal reaparecería esa misma noche.
function hoyEnArgentina(): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Argentina/Buenos_Aires",
  }).format(new Date());
}

export function ModalGracia({
  cobranza,
  monto,
  taller,
  suspensionManual = false,
}: {
  cobranza: Cobranza;
  monto: string | null;
  taller: string | null;
  /** `activo = false`: la suspendió Fidelli y pagar no la levanta, así que
   *  el modal no se muestra. Sin este dato, el estado `suspendido` del
   *  reloj no alcanza para distinguir las dos. */
  suspensionManual?: boolean;
}) {
  const [abierto, setAbierto] = useState(false);
  const aplica =
    cobranza.estado === "gracia" || (cobranza.estado === "suspendido" && !suspensionManual);

  useEffect(() => {
    if (!aplica) return;

    const hoy = hoyEnArgentina();
    try {
      if (window.localStorage.getItem(CLAVE) === hoy) return;
      // Se marca ANTES de abrir, no al cerrar: si se marcara al cerrar, el
      // que cierra la pestaña sin tocar nada lo vuelve a ver en la próxima
      // visita, y "uno por día" pasa a ser "uno por visita".
      window.localStorage.setItem(CLAVE, hoy);
    } catch {
      // Sin storage —incógnito, cuota llena, cookies bloqueadas— no se
      // muestra. Es deliberado: sin dónde recordar el "ya lo vi", esto
      // aparecería en cada navegación.
      return;
    }
    // La decisión depende de localStorage, que no existe en el servidor:
    // calcularla durante el render daría una mezcla de hidratación — el
    // servidor no puede saber si ESTE dispositivo ya vio el modal hoy.
    // Corre una sola vez por montaje y no se vuelve a disparar, porque el
    // efecto sale temprano cuando la fecha ya quedó marcada arriba.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setAbierto(true);
  }, [aplica]);

  if (!aplica) return null;

  const texto = textoDeCobranza(cobranza, monto);
  if (!texto) return null;

  const href = enlaceDePagoDe(cobranza, monto, taller);
  const externo = esEnlaceExterno(href);

  return (
    <Dialog open={abierto} onOpenChange={setAbierto}>
      <DialogContenido titulo={texto.titulo}>
        <p className="text-body text-ink-60">{texto.detalle}</p>

        <p className="mt-3 text-body text-ink-60">
          No se pierde nada: tus clientes, tus vehículos y todo tu historial
          quedan intactos.
        </p>

        <div className="mt-6 flex flex-col gap-2 sm:flex-row-reverse">
          <a
            href={href}
            {...(externo ? { target: "_blank", rel: "noreferrer" } : {})}
            className={clasesBoton("primario")}
          >
            {externo && <IconoWhatsapp aria-hidden className="size-4" />}
            {texto.accion}
          </a>
          <RadixDialog.Close className={clasesBoton("secundario")}>
            Ahora no
          </RadixDialog.Close>
        </div>
      </DialogContenido>
    </Dialog>
  );
}

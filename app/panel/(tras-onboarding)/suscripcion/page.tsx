import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { obtenerSesion } from "@/lib/auth/session";
import { createClient } from "@/lib/supabase/server";
import { CabeceraSeccion } from "@/components/panel/cabecera-seccion";
import { IconoWhatsapp } from "@/components/iconos";
import { PantallaPago } from "@/components/suscripcion/pantalla-pago";
import { armarPagoDelTenant } from "@/lib/suscripcion/datos-pago";
import { urlWhatsappSoporte } from "@/lib/config";

export const metadata: Metadata = { title: "Tu suscripción" };

// La pantalla donde el cliente nos da plata. No se cachea: el estado de la
// transferencia cambia entre una carga y la siguiente, y esa es toda la
// gracia.
export const dynamic = "force-dynamic";

// ⚠ TODO LO QUE ARMA `DatosPago` VIVE EN lib/suscripcion/datos-pago.ts, y no
// acá, desde el sprint del onboarding: la cuarta pantalla del onboarding
// muestra la MISMA pantalla de pago. Copiar estas ~150 líneas era la forma
// exacta de que en tres semanas una de las dos mostrara el monto viejo.
export default async function PaginaSuscripcion() {
  const sesion = await obtenerSesion();
  if (!sesion?.lubricentroId) redirect("/login");
  if (sesion.rol !== "owner") redirect("/fidelli");

  // ⚠ LA SUSPENSIÓN MANUAL NO SE PAGA. Con `activo = false` la apagó
  // Fidelli y la levanta Fidelli: una pantalla con «Quiero pagar» acá le
  // emitía un CVU a alguien cuyo pago no cambia nada (hallazgo #5 de la
  // verificación del 26/09). La orden que tuviera abierta ya la cerró la
  // base al apagarlo (trigger cerrar_ordenes_al_suspender), y la acción
  // rechaza crear otra. El suspendido POR RELOJ no entra acá: para él esta
  // pantalla es la salida.
  if (!sesion.lubricentroActivo) {
    return (
      <div>
        <CabeceraSeccion titulo="Tu suscripción" />
        <div className="surface-card px-5 py-6">
          <p className="font-brand text-lead font-bold">Tu cuenta está suspendida por Fidelli</p>
          <p className="mt-1 text-ui text-ink-60">
            Escribinos y lo resolvemos. Mientras tanto podés consultar todos tus datos.
          </p>
          <a
            href={urlWhatsappSoporte()}
            target="_blank"
            rel="noreferrer"
            className="mt-4 inline-flex h-11 items-center gap-2 rounded-md bg-ink px-4 font-brand text-ui font-bold text-base transition-colors hover:bg-ink-60"
          >
            <IconoWhatsapp className="size-4" />
            Escribirle a Fidelli
          </a>
        </div>
      </div>
    );
  }

  const supabase = await createClient();
  const r = await armarPagoDelTenant(supabase, sesion.lubricentroId, sesion.cobranza);

  if (r.tipo === "sin_suscripcion") {
    return (
      <div>
        <CabeceraSeccion titulo="Tu suscripción" />
        <p className="text-ui text-ink-60">
          No encontramos tu suscripción. Escribinos y lo resolvemos.
        </p>
      </div>
    );
  }

  if (r.tipo === "bonificado") {
    return (
      <div>
        <CabeceraSeccion titulo="Tu suscripción" />
        <div className="surface-card px-5 py-6">
          <p className="font-brand text-lead font-bold">Tu plan está bonificado</p>
          <p className="mt-1 text-ui text-ink-60">
            No tenés nada que pagar. Si necesitás una factura o cambiar algo de tu plan,
            escribinos.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div>
      <CabeceraSeccion titulo="Tu suscripción" />
      <div className="max-w-xl">
        <PantallaPago datos={r.datos} />
      </div>
    </div>
  );
}

import type { Metadata } from "next";
import { createClient } from "@/lib/supabase/server";
import { CabeceraSeccion } from "@/components/panel/cabecera-seccion";
import { IconoPremio } from "@/components/iconos";
import {
  FormularioPremio,
  type Premio,
} from "@/components/fidelizacion/formulario-premio";
import { META_MINIMA, META_MAXIMA } from "@/lib/fidelizacion";
import { obtenerSesion, featureHabilitada, panelSuspendido } from "@/lib/auth/session";
import { BloqueoPlan } from "@/components/panel/bloqueo-plan";
import { BloqueoSuspension } from "@/components/panel/bloqueo-suspension";

export const metadata: Metadata = { title: "Fidelización" };

// El programa del lubricentro: cada cuántos services y qué se lleva el
// cliente. Un solo premio activo (la base lo garantiza con un índice único
// parcial) y sin snapshots: el sistema calcula siempre contra la meta
// vigente, así que un cambio mueve a todos los vehículos al instante.
export default async function PaginaFidelizacion() {
  // EL ORDEN ES REGLA: suspendido → plan → normal. Al revés, a un moroso
  // se le sugería comprar un plan mejor cuando su problema se resuelve
  // pagando lo que ya debe.
  if (await panelSuspendido()) {
    return (
      <BloqueoSuspension
        titulo="No podés cambiar el programa mientras la cuenta está suspendida"
        descripcion="El programa que configuraste no se pierde: queda tal cual para cuando la cuenta vuelva. Para reactivarla, escribinos."
      />
    );
  }

  // Después el plan: si no incluye Fidelliza, la sección entera es la
  // pantalla que lo explica — nunca un crash ni un rechazo mudo. El menú
  // ya no la ofrece; esto atiende la URL directa y el link guardado.
  const sesion = await obtenerSesion();
  if (!featureHabilitada(sesion, "premios")) {
    return <BloqueoPlan funcion="Fidelliza" />;
  }

  const supabase = await createClient();

  const [premioRes, ciclosRes] = await Promise.all([
    supabase
      .from("premios")
      .select("meta_services, descripcion, activo")
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle(),
    // Una sola llamada para toda la flota, no una por vehículo.
    supabase.rpc("ciclos_fidelizacion"),
  ]);

  const premio: Premio = premioRes.data
    ? {
        metaServices: premioRes.data.meta_services,
        descripcion: premioRes.data.descripcion,
        activo: premioRes.data.activo,
      }
    : null;

  const ciclos = (ciclosRes.data ?? []).map((c) => c.services_ciclo ?? 0);

  // Cuántos vehículos quedarían con premio disponible para cada meta
  // posible. Comparar un contador contra un umbral es aritmética; la
  // regla —contar desde el último canje— la resolvió la base.
  const impactoPorMeta: Record<number, number> = {};
  for (let m = META_MINIMA; m <= META_MAXIMA; m++) {
    impactoPorMeta[m] = ciclos.filter((c) => c >= m).length;
  }

  const metaVigente = premio?.metaServices ?? 0;
  const enProgreso = ciclos.filter(
    (c) => c > 0 && (metaVigente === 0 || c < metaVigente),
  ).length;

  return (
    <div className="max-w-3xl">
      <CabeceraSeccion titulo="Fidelización" />

      {!premio && (
        <div className="surface-card mb-5 flex gap-3 p-5">
          <IconoPremio aria-hidden className="mt-0.5 size-6 shrink-0 text-reward" />
          <div>
            <p className="font-brand text-body font-bold text-ink">
              Todavía no tenés un programa de premios
            </p>
            <p className="mt-1 text-ui text-ink-60">
              Definí cada cuántos services le regalás algo a tus clientes. Con
              el programa activo, cada auto empieza a acumular desde su próximo
              service, el cliente ve cuánto le falta en su cartón digital, y el
              mecánico aplica el premio en el mostrador cuando llega la meta.
            </p>
          </div>
        </div>
      )}

      <div className="surface-card p-5 sm:p-6">
        <FormularioPremio
          premio={premio}
          impactoPorMeta={impactoPorMeta}
          enProgreso={enProgreso}
        />
      </div>

      {/* La frontera del descuento, explícita: la plataforma registra QUE
          se canjeó; el descuento lo aplica el lubri en su caja. */}
      <p className="mt-4 px-1 text-ui text-ink-60">
        Fidelli Motors registra que el premio se usó. El descuento lo aplicás
        vos en tu caja, como lo hacés hoy — acá no se cargan precios.
      </p>
    </div>
  );
}

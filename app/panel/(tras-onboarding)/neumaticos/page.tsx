import type { Metadata } from "next";
import { createClient } from "@/lib/supabase/server";
import { obtenerSesion, panelSuspendido, featureHabilitada } from "@/lib/auth/session";
import { CabeceraSeccion } from "@/components/panel/cabecera-seccion";
import { FormConfigNeumaticos } from "@/components/neumaticos/form-config-neumaticos";

export const metadata: Metadata = { title: "Neumáticos" };

// La configuración del módulo de gomería: los intervalos con los que
// "A quién llamar" avisa. Vive en Configuración y aparece en el menú solo
// con el módulo; por URL directa, sin el módulo, dice que no está activo
// y nada más — el panel no vende módulos.
export default async function PaginaNeumaticos() {
  const sesion = await obtenerSesion();
  const suspendido = await panelSuspendido();

  if (!featureHabilitada(sesion, "neumaticos")) {
    return (
      <div className="mx-auto max-w-2xl">
        <CabeceraSeccion titulo="Neumáticos" />
        <p className="text-ui text-ink-60">
          El módulo de gomería no está activo en esta cuenta.
        </p>
      </div>
    );
  }

  const supabase = await createClient();
  // RLS recorta al tenant: la fila es una sola y nace con la cuenta.
  const { data: config } = await supabase
    .from("config_neumaticos")
    .select(
      "km_rotacion, meses_rotacion, km_alineacion, meses_alineacion, km_reajuste, anios_antiguedad, mm_alerta, beneficio_km, beneficio_meses",
    )
    .maybeSingle();

  return (
    <div className="mx-auto max-w-2xl">
      <CabeceraSeccion titulo="Neumáticos" />
      <p className="mb-6 -mt-3 max-w-prose text-ui text-ink-60">
        Estos son los intervalos con los que el sistema te avisa. Si en tu
        zona los autos vuelven antes, cambialos.
      </p>

      {config ? (
        <FormConfigNeumaticos
          config={{ ...config, mm_alerta: Number(config.mm_alerta) }}
          deshabilitado={suspendido}
        />
      ) : (
        <p className="text-ui text-ink-60">
          No encontramos la configuración de esta cuenta. Recargá la pantalla
          en un momento; si sigue igual, escribinos.
        </p>
      )}
    </div>
  );
}

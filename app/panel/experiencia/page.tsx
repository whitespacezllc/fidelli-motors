import type { Metadata } from "next";
import { createClient } from "@/lib/supabase/server";
import { CabeceraSeccion } from "@/components/panel/cabecera-seccion";
import { EstadoVacio } from "@/components/ui/estado-vacio";
import { SubirLogo } from "@/components/experiencia/subir-logo";
import {
  FormExperiencia,
  type ConfigExperiencia,
} from "@/components/experiencia/form-experiencia";
import { PreviewCelular } from "@/components/experiencia/preview-celular";
import { obtenerSesion, featureHabilitada, panelSuspendido } from "@/lib/auth/session";
import { BloqueoPlan } from "@/components/panel/bloqueo-plan";
import { BloqueoSuspension } from "@/components/panel/bloqueo-suspension";

export const metadata: Metadata = { title: "Diseño de experiencia" };

// Donde Bruno decide cómo ve su marca el cliente final. Es lo que
// convierte la landing de un template en algo suyo, y por eso la vista
// previa es la landing REAL en un marco de celular: cambia el color,
// guarda, y lo ve. "Así lo ve tu cliente" es el argumento comercial.
export default async function PaginaExperiencia() {
  // EL ORDEN ES REGLA: suspendido → plan → normal. Ver fidelizacion/page.
  if (await panelSuspendido()) {
    return (
      <BloqueoSuspension
        titulo="No podés cambiar el diseño mientras la cuenta está suspendida"
        descripcion="El diseño que guardaste no se pierde: queda tal cual para cuando la cuenta vuelva. Para reactivarla, escribinos."
      />
    );
  }

  const supabase = await createClient();
  const sesion = await obtenerSesion();

  // Sin la feature, la sección es la pantalla que lo explica. La página
  // pública del tenant sigue funcionando con la configuración que ya
  // tiene: lo que se apaga es EDITARLA, nunca lo configurado.
  if (!featureHabilitada(sesion, "personalizacion_pagina")) {
    return <BloqueoPlan funcion="La personalización de tu página" />;
  }

  const [configRes, lubriRes] = await Promise.all([
    supabase
      .from("config_experiencia")
      .select("logo_url, color_primario, color_fondo, color_carton, campos_visibles, datos_contacto, updated_at")
      .maybeSingle(),
    supabase.from("lubricentros").select("slug").maybeSingle(),
  ]);

  const config = configRes.data;
  const slug = lubriRes.data?.slug;

  if (!config || !slug) {
    return (
      <EstadoVacio
        titulo="No encontramos la configuración de tu lubricentro"
        descripcion="Es un dato que se crea con tu cuenta. Escribinos por WhatsApp y lo resolvemos."
      />
    );
  }

  const contacto = (config.datos_contacto ?? {}) as Record<string, string | null>;
  const datos: ConfigExperiencia = {
    colorPrimario: config.color_primario,
    colorFondo: config.color_fondo ?? "",
    colorCarton: config.color_carton ?? "",
    camposVisibles: (config.campos_visibles ?? {}) as Record<string, boolean>,
    whatsapp: contacto.whatsapp ?? "",
    instagram: contacto.instagram ?? "",
    facebook: contacto.facebook ?? "",
  };

  return (
    <div>
      <CabeceraSeccion titulo="Diseño de experiencia" />

      {/* Formulario y vista previa lado a lado en desktop; en mobile la
          preview va debajo, después de guardar se scrollea solo quien
          quiere verla. */}
      <div className="grid gap-8 lg:grid-cols-[minmax(0,1fr)_auto] lg:items-start">
        <div className="flex max-w-2xl flex-col gap-6">
          <section className="surface-card p-5">
            <h2 className="mb-3 font-brand text-body font-bold text-ink">
              Tu logo
            </h2>
            <SubirLogo
              logoUrl={config.logo_url}
              nombre={sesion?.lubricentroNombre ?? "tu lubricentro"}
            />
          </section>

          <section className="surface-card p-5">
            <FormExperiencia config={datos} />
          </section>
        </div>

        <aside className="justify-self-center lg:sticky lg:top-6">
          <h2 className="mb-3 text-center font-brand text-body font-bold text-ink">
            Así lo ve tu cliente
          </h2>
          <PreviewCelular slug={slug} version={config.updated_at} />
        </aside>
      </div>
    </div>
  );
}

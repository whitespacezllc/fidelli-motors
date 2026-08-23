import type { Metadata } from "next";
import { createClient } from "@/lib/supabase/server";
import { CabeceraSeccion } from "@/components/panel/cabecera-seccion";
import { EstadoVacio } from "@/components/ui/estado-vacio";
import { PantallaExperiencia } from "@/components/experiencia/pantalla-experiencia";
import { SeccionCalcos } from "@/components/experiencia/seccion-calcos";
import type { ConfigExperiencia } from "@/components/experiencia/form-experiencia";
import { obtenerSesion, featureHabilitada, panelSuspendido } from "@/lib/auth/session";
import { BloqueoPlan } from "@/components/panel/bloqueo-plan";
import { BloqueoSuspension } from "@/components/panel/bloqueo-suspension";
import { aTema, aTamanoLogo } from "@/lib/cliente/tema";

export const metadata: Metadata = { title: "Diseño de experiencia" };

// Donde Bruno decide cómo ve su marca el cliente final. La vista previa
// es EN VIVO: los mismos componentes de la página pública pintados con
// el borrador del formulario — cambia el color o el modo y lo ve antes
// de guardar. "Así lo ve tu cliente" es el argumento comercial.
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

  // Sin la feature, la personalización se explica — pero los calcos QR
  // quedan igual: son de LOS TRES planes (sin ellos, Basic tiene una
  // página a la que nadie puede llegar). Lo que se apaga es EDITAR el
  // diseño, nunca lo configurado ni la puerta de entrada.
  if (!featureHabilitada(sesion, "personalizacion_pagina")) {
    return (
      <div className="flex flex-col gap-6">
        <BloqueoPlan funcion="La personalización de tu página" />
        <div className="max-w-2xl">
          <SeccionCalcos />
        </div>
      </div>
    );
  }

  const [configRes, lubriRes] = await Promise.all([
    supabase
      .from("config_experiencia")
      .select(
        "logo_url, color_primario, color_fondo, color_carton, tema, logo_tamano, mensaje_escaneo, mensaje_vigencia, campos_visibles, datos_contacto, updated_at",
      )
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
    tema: aTema(config.tema),
    logoTamano: aTamanoLogo(config.logo_tamano),
    mensajeEscaneo: config.mensaje_escaneo ?? "",
    mensajeVigencia: config.mensaje_vigencia ?? "",
    camposVisibles: (config.campos_visibles ?? {}) as Record<string, boolean>,
    whatsapp: contacto.whatsapp ?? "",
    instagram: contacto.instagram ?? "",
    facebook: contacto.facebook ?? "",
  };

  return (
    <div>
      <CabeceraSeccion titulo="Diseño de experiencia" />
      <PantallaExperiencia
        config={datos}
        slug={slug}
        logoUrl={config.logo_url}
        nombre={sesion?.lubricentroNombre ?? "tu lubricentro"}
        esUltra={featureHabilitada(sesion, "pagina_premium")}
      />
    </div>
  );
}

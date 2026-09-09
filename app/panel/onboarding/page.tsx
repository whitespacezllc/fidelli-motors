import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { obtenerSesion } from "@/lib/auth/session";
import { EstadoVacio } from "@/components/ui/estado-vacio";
import { IndicadorPasos } from "@/components/onboarding/indicador-pasos";
import { MarcoPaso } from "@/components/onboarding/marco-paso";
import { PasoProducto } from "@/components/onboarding/paso-producto";
import { PasoDiseno } from "@/components/onboarding/paso-diseno";
import { PasoPremio } from "@/components/onboarding/paso-premio";
import { PasoFinal } from "@/components/onboarding/paso-final";
import type { ConfigExperiencia } from "@/components/experiencia/form-experiencia";
import type { Premio } from "@/components/fidelizacion/formulario-premio";
import { aCategorias } from "@/lib/categorias";
import { aTema, aTamanoLogo } from "@/lib/cliente/tema";
import { META_MINIMA, META_MAXIMA } from "@/lib/fidelizacion";
import { videoDelPaso } from "@/lib/ayuda/videos";
import { etiquetaPlan, planEfectivo } from "@/lib/ayuda/plan";
import {
  leerEstadoOnboarding,
  pasosHechos,
  type PasoOnboarding,
} from "@/lib/onboarding/estado";

export const metadata: Metadata = { title: "Primeros pasos" };

// ============================================================
// /panel/onboarding — tres pasos (dos en Basic) y arrancás.
//
// La pantalla no guarda progreso: lo lee de los datos en cada render
// (onboarding_estado). Recargar mantiene el paso, un segundo usuario del
// mismo taller ve lo mismo, y un taller al que Fidelli le importó el
// catálogo ya tiene el paso 1 hecho. Se muestra el primer paso que falta;
// con ?paso=n se puede volver a uno ya hecho.
//
// Cada paso reutiliza el formulario del panel: el de productos, el de
// Diseño de experiencia con su vista previa, el de Fidelización. Acá solo
// se arma la pantalla y se reparten los datos que cada uno ya pedía.
// ============================================================
export default async function PaginaOnboarding({
  searchParams,
}: {
  searchParams: Promise<{ paso?: string }>;
}) {
  const sesion = await obtenerSesion();
  if (!sesion?.lubricentroId) redirect("/login");
  // Completo, o suspendido (no podría escribir): al panel.
  if (sesion.onboardingCompleto || !sesion.lubricentroActivo) redirect("/panel");

  const supabase = await createClient();
  const { data: crudo } = await supabase.rpc("onboarding_estado", {
    p_lubricentro_id: sesion.lubricentroId,
  });
  const estado = leerEstadoOnboarding(crudo);

  if (!estado) {
    return (
      <EstadoVacio
        titulo="No pudimos leer el estado de tu cuenta"
        descripcion="Recargá la pantalla en un momento. Si sigue igual, escribinos por WhatsApp desde Ayuda."
      />
    );
  }

  const nombre = sesion.lubricentroNombre ?? "Tu lubricentro";
  const hechos = pasosHechos(estado);
  const titulo = estado.pasos === 2 ? "Dos pasos y arrancás." : "Tres pasos y arrancás.";

  // Todo hecho por los datos pero sin completar: un botón, no una escritura
  // al renderizar.
  if (estado.pasoActual === null) {
    return (
      <Cabecera titulo={titulo} nombre={nombre}>
        <IndicadorPasos pasos={estado.pasos} actual={estado.pasos} hechos={hechos} />
        <div className="mt-8">
          <PasoFinal />
        </div>
      </Cabecera>
    );
  }

  // ?paso=n vuelve a un paso ya hecho; nunca adelanta.
  const { paso: pasoParam } = await searchParams;
  const pedido = Number(pasoParam);
  const paso: PasoOnboarding =
    pedido === 1 || pedido === 2 || pedido === 3
      ? pedido <= estado.pasoActual
        ? pedido
        : estado.pasoActual
      : estado.pasoActual;

  const video = videoDelPaso(paso);
  // El video del paso se ve aunque la función no esté en el plan (Basic en
  // el paso 2): con la etiqueta del plan, como en la solapa Ayuda.
  const etiquetaPlanVideo = video
    ? etiquetaPlan(video.plan, planEfectivo(sesion.capacidades))
    : null;

  let contenido: React.ReactNode;

  if (paso === 1) {
    const { data: filas } = await supabase
      .from("categorias_producto")
      .select("clave, nombre, plural")
      .eq("activa", true)
      .order("orden");

    contenido = (
      <MarcoPaso
        titulo="Cargá tu primer producto"
        bajada="Empezá por el aceite que más vendés. El resto lo cargás después desde Productos."
        video={video}
        etiquetaPlanVideo={etiquetaPlanVideo}
      >
        <PasoProducto categorias={aCategorias(filas)} />
      </MarcoPaso>
    );
  } else if (paso === 2) {
    const [configRes, lubriRes] = await Promise.all([
      supabase
        .from("config_experiencia")
        .select(
          "logo_url, color_primario, color_fondo, color_carton, tema, logo_tamano, mensaje_escaneo, mensaje_vigencia, campos_visibles, datos_contacto",
        )
        .maybeSingle(),
      supabase.from("lubricentros").select("slug").maybeSingle(),
    ]);
    const config = configRes.data;
    const slug = lubriRes.data?.slug;

    if (!config || !slug) {
      contenido = (
        <EstadoVacio
          titulo="No encontramos la configuración de tu lubricentro"
          descripcion="Es un dato que se crea con tu cuenta. Escribinos por WhatsApp desde Ayuda y lo resolvemos."
        />
      );
    } else {
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

      contenido = (
        <PasoDiseno
          config={datos}
          slug={slug}
          logoUrl={config.logo_url}
          nombre={nombre}
          personalizable={estado.aplicaPersonalizacion}
          video={video}
          etiquetaPlanVideo={etiquetaPlanVideo}
        />
      );
    }
  } else {
    const [premioRes, ciclosRes] = await Promise.all([
      supabase
        .from("premios")
        .select("meta_services, descripcion, activo, alcance")
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle(),
      supabase.rpc("ciclos_fidelizacion"),
    ]);

    const premio: Premio = premioRes.data
      ? {
          metaServices: premioRes.data.meta_services,
          descripcion: premioRes.data.descripcion,
          activo: premioRes.data.activo,
          alcance: premioRes.data.alcance === "todos" ? "todos" : "services",
        }
      : null;

    // Igual que en Fidelización: cuántos vehículos quedarían con premio
    // por cada meta posible. Para una cuenta nueva son ceros.
    const ciclos = (ciclosRes.data ?? []).map((c) => c.services_ciclo ?? 0);
    const impactoPorMeta: Record<number, number> = {};
    for (let m = META_MINIMA; m <= META_MAXIMA; m++) {
      impactoPorMeta[m] = ciclos.filter((c) => c >= m).length;
    }
    const metaVigente = premio?.metaServices ?? 0;
    const enProgreso = ciclos.filter(
      (c) => c > 0 && (metaVigente === 0 || c < metaVigente),
    ).length;

    contenido = (
      <MarcoPaso
        titulo="Premio de fidelización"
        bajada="Cada X services, Y. Es lo que hace que vuelvan a vos y no al de la esquina. Si todavía no lo tenés decidido, omitilo: se configura después desde Fidelización."
        video={video}
        etiquetaPlanVideo={etiquetaPlanVideo}
      >
        <PasoPremio premio={premio} impactoPorMeta={impactoPorMeta} enProgreso={enProgreso} />
      </MarcoPaso>
    );
  }

  return (
    <Cabecera titulo={titulo} nombre={nombre}>
      <IndicadorPasos pasos={estado.pasos} actual={paso} hechos={hechos} />
      <div className="mt-8">{contenido}</div>
    </Cabecera>
  );
}

function Cabecera({
  titulo,
  nombre,
  children,
}: {
  titulo: string;
  nombre: string;
  children: React.ReactNode;
}) {
  return (
    <div className="mx-auto max-w-5xl">
      <header className="mb-6">
        <h1 className="font-brand text-h2 font-bold text-ink sm:text-h1">{titulo}</h1>
        <p className="mt-1 text-body text-ink-60">{nombre}</p>
      </header>
      {children}
    </div>
  );
}

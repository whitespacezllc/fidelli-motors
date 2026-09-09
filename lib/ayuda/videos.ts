import type { ClavePlan } from "@/lib/planes-landing";

// ============================================================
// LOS VIDEOS DE AYUDA — la única fuente.
//
// De acá salen la solapa Ayuda del panel, el botón "¿Cómo se usa?" de cada
// solapa, el video de cada paso del onboarding y los íconos de reproducir
// de la sección de precios de la landing.
//
// ⚠ SANTIAGO: LOS IDS DE YOUTUBE SE PEGAN ACÁ, en `youtubeId`, y en ningún
// otro lado. El `id` de cada entrada es el nombre del archivo del video,
// para que pegar el ID sea trivial. Con `null` el video figura como "en
// preparación": la tarjeta existe, sin miniatura ni botón, y en la landing
// no se muestra nada (una landing no puede tener botones muertos). Al
// sumar un video, `duracion` son los segundos reales del video.
//
// Los videos se alojan en YouTube como NO LISTADOS. El reproductor no carga
// nada de YouTube hasta que alguien toca reproducir.
// ============================================================

export type SeccionAyuda =
  | "Inicio"
  | "Trabajos"
  | "Clientes"
  | "Productos"
  | "Presupuestos"
  | "Premios"
  | "Página y calcos"
  | "Exportar"
  | "Sucursales"
  | "Configuración";

/** El orden en que se agrupan en la solapa Ayuda. */
export const SECCIONES_AYUDA: readonly SeccionAyuda[] = [
  "Inicio",
  "Trabajos",
  "Clientes",
  "Productos",
  "Presupuestos",
  "Premios",
  "Página y calcos",
  "Exportar",
  "Sucursales",
  "Configuración",
] as const;

export type PasoOnboarding = 1 | 2 | 3;

export type VideoAyuda = {
  /** El nombre del archivo del video: identifica al video en los eventos. */
  id: string;
  titulo: string;
  /** Una línea, en el idioma del taller. */
  descripcion: string;
  /** El ID de YouTube. `null` = video en preparación. */
  youtubeId: string | null;
  /** Segundos reales del video. Se muestra como m:ss. */
  duracion: number;
  seccion: SeccionAyuda;
  /** La ruta del panel a la que pertenece: ahí aparece "¿Cómo se usa?". */
  solapa: string;
  /** El plan mínimo que incluye la función. */
  plan: ClavePlan;
  /** Si es el video de un paso del onboarding, cuál. */
  pasoOnboarding: PasoOnboarding | null;
  /**
   * Los textos EXACTOS de las funciones que este video explica, tal como
   * aparecen en la sección de precios de la landing (lib/planes-landing.ts:
   * las listas `incluye` de las tarjetas y los `concepto` de la comparación).
   * Un video puede cubrir más de una fila. Si acá no coincide letra por
   * letra, el ícono no aparece: se ajusta acá, nunca en la landing.
   */
  featureLanding: readonly string[] | null;
};

export const VIDEOS: readonly VideoAyuda[] = [
  {
    id: "recorrido-fidelli-motors",
    titulo: "Recorrido del panel en 90 segundos",
    descripcion: "Qué hay en cada solapa y por dónde empezar.",
    youtubeId: "ZbpK1etD71A",
    duracion: 127,
    seccion: "Inicio",
    solapa: "/panel",
    plan: "basic",
    pasoOnboarding: null,
    featureLanding: null,
  },
  {
    id: "carga-productos",
    titulo: "Cargar un producto con precio y stock",
    descripcion: "Categoría, nombre, marca y precio. El stock, solo si lo llevás.",
    youtubeId: "CByhgL56lgg",
    duracion: 111,
    seccion: "Productos",
    solapa: "/panel/productos",
    plan: "basic",
    pasoOnboarding: 1,
    featureLanding: ["Catálogo de tus productos"],
  },
  {
    id: "cargar-cliente",
    titulo: "Cargar un cliente",
    descripcion: "Nombre, teléfono y CUIT, para tener a quién avisarle.",
    youtubeId: "w84c1zYeaK0",
    duracion: 90,
    seccion: "Clientes",
    solapa: "/panel/clientes",
    plan: "basic",
    pasoOnboarding: null,
    featureLanding: null,
  },
  {
    id: "cargar-vehiculo",
    titulo: "Cargar un vehículo",
    descripcion: "La patente, la marca y el modelo, colgados de su dueño.",
    youtubeId: "RT7ZUKU_EIc",
    duracion: 78,
    seccion: "Clientes",
    solapa: "/panel/clientes",
    plan: "basic",
    pasoOnboarding: null,
    featureLanding: null,
  },
  {
    id: "cargar-service",
    titulo: "Cargar un service en menos de 90 segundos",
    descripcion: "Patente, aceite, filtros y kilómetros: el cartón, sin papel.",
    youtubeId: "8VOdAtUmH3w",
    duracion: 173,
    seccion: "Trabajos",
    solapa: "/panel/services",
    plan: "basic",
    pasoOnboarding: null,
    featureLanding: ["Carga en 90 segundos"],
  },
  {
    id: "carga-trabajo-mecanico",
    titulo: "Cargar un trabajo mecánico",
    descripcion: "Frenos, correas o lo que sea: queda en el historial del auto.",
    youtubeId: "uq0QZiiZiOg",
    duracion: 123,
    seccion: "Trabajos",
    solapa: "/panel/services",
    plan: "pro",
    pasoOnboarding: null,
    featureLanding: ["Trabajos de mecánica", "Trabajos de mecánica y pendientes"],
  },
  {
    id: "editar-service-cargado",
    titulo: "Editar un trabajo dentro de las 24 horas",
    descripcion: "Corregir un dato antes de que el trabajo quede fijado.",
    youtubeId: "licaGQVMqnU",
    duracion: 97,
    seccion: "Trabajos",
    solapa: "/panel/services",
    plan: "basic",
    pasoOnboarding: null,
    featureLanding: null,
  },
  {
    id: "seguimiento-clientes",
    titulo: "A quién le toca volver y mandar el aviso por WhatsApp",
    descripcion: "La lista de la semana por urgencia, y el aviso ya armado en tres tonos.",
    youtubeId: "AKc-ZftasH0",
    duracion: 131,
    seccion: "Inicio",
    solapa: "/panel",
    plan: "basic",
    pasoOnboarding: null,
    featureLanding: [
      "A quién llamar esta semana",
      "Mensajes ya armados",
      "Avisos por kilómetros y a quién llamar",
    ],
  },
  {
    id: "generar-presupuesto",
    titulo: "Presupuestos con tu logo en menos de un minuto",
    descripcion: "Renglones, precios y tu logo en un PDF para mandar o imprimir.",
    youtubeId: "pu5XSyQnBME",
    duracion: 117,
    seccion: "Presupuestos",
    solapa: "/panel/presupuestos",
    plan: "pro",
    pasoOnboarding: null,
    featureLanding: ["Presupuestos con tu marca"],
  },
  {
    id: "premio-fidelizacion",
    titulo: "Definir el premio de fidelización y ver el avance",
    descripcion: "Cada cuántos services hay premio y cómo lo ve cada cliente.",
    youtubeId: "dWexBvVVbPU",
    duracion: 105,
    seccion: "Premios",
    solapa: "/panel/fidelizacion",
    plan: "pro",
    pasoOnboarding: 3,
    featureLanding: ["Premios para que tus clientes vuelvan", "Premios"],
  },
  {
    id: "diseno-de-experiencia",
    titulo: "Diseño de experiencia: cómo ven tu historial tus clientes",
    descripcion: "Tu logo, tu color y el modo de la página que abre el QR.",
    youtubeId: "a16WaMz1vrU",
    duracion: 139,
    seccion: "Página y calcos",
    solapa: "/panel/experiencia",
    plan: "pro",
    pasoOnboarding: 2,
    featureLanding: ["Página del cliente personalizable", "Personalizar la página"],
  },
  {
    id: "exportar-datos",
    titulo: "Exportar clientes, vehículos, productos y trabajos",
    descripcion: "Todos tus datos en un Excel, con los filtros que tengas puestos.",
    youtubeId: "bYAaonj2jwY",
    duracion: 51,
    seccion: "Exportar",
    // Exportar no tiene solapa propia: el botón vive en Clientes, Productos
    // y Trabajos. Cuelga de Trabajos, que es donde más se exporta.
    solapa: "/panel/services",
    plan: "basic",
    pasoOnboarding: null,
    featureLanding: null,
  },
  {
    id: "carga-sucursales",
    titulo: "Sucursales",
    descripcion: "Sumar un local y ver qué se hizo en cada uno.",
    youtubeId: "OefB7DqGjpg",
    duracion: 66,
    seccion: "Sucursales",
    solapa: "/panel/sucursales",
    plan: "ultra",
    pasoOnboarding: null,
    featureLanding: ["Sucursales", "Sucursales ilimitadas"],
  },
] as const;

/** "1:30". Nunca se muestra para un video en preparación. */
export function formatearDuracion(segundos: number): string {
  const m = Math.floor(segundos / 60);
  const s = segundos % 60;
  return `${m}:${String(s).padStart(2, "0")}`;
}

/** La miniatura que YouTube publica para cualquier video, listado o no. */
export function miniaturaYoutube(youtubeId: string): string {
  return `https://i.ytimg.com/vi/${youtubeId}/hqdefault.jpg`;
}

/**
 * El embed sin cookies. `autoplay=1` arranca solo porque el iframe se
 * inserta recién al tocar reproducir: el gesto ya ocurrió.
 */
export function urlEmbedYoutube(youtubeId: string): string {
  return `https://www.youtube-nocookie.com/embed/${youtubeId}?autoplay=1&modestbranding=1&rel=0&playsinline=1`;
}

export function videoPorId(id: string): VideoAyuda | null {
  return VIDEOS.find((v) => v.id === id) ?? null;
}

/** Los videos de una solapa del panel, en el orden de la lista. */
export function videosDeSolapa(ruta: string): VideoAyuda[] {
  return VIDEOS.filter((v) => v.solapa === ruta);
}

export function videoDelPaso(paso: PasoOnboarding): VideoAyuda | null {
  return VIDEOS.find((v) => v.pasoOnboarding === paso) ?? null;
}

/**
 * El video de una función de la landing, SOLO si ya tiene ID: sin ID no
 * hay ícono, porque la landing no puede tener botones muertos. Un mismo
 * video puede cubrir varias filas.
 */
export function videoDeFuncion(funcion: string): VideoAyuda | null {
  return (
    VIDEOS.find(
      (v) => v.featureLanding?.includes(funcion) && v.youtubeId !== null,
    ) ?? null
  );
}

/** Agrupados por sección, en el orden de SECCIONES_AYUDA; sin secciones vacías. */
export function videosPorSeccion(): { seccion: SeccionAyuda; videos: VideoAyuda[] }[] {
  return SECCIONES_AYUDA.map((seccion) => ({
    seccion,
    videos: VIDEOS.filter((v) => v.seccion === seccion),
  })).filter((g) => g.videos.length > 0);
}

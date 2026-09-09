import type { ClavePlan } from "@/lib/planes-landing";

// ============================================================
// LOS VIDEOS DE AYUDA — la única fuente.
//
// De acá salen la solapa Ayuda del panel, el botón "¿Cómo se usa?" de cada
// solapa, el video de cada paso del onboarding y los íconos de reproducir
// de la sección de precios de la landing.
//
// ⚠ SANTIAGO: LOS IDS DE YOUTUBE SE PEGAN ACÁ, en `youtubeId`, y en ningún
// otro lado. Con `null` el video figura como "en preparación": la tarjeta
// existe, sin miniatura ni botón, y en la landing no se muestra nada (una
// landing no puede tener botones muertos). Al pegar el ID, corregí también
// `duracion` con los segundos reales del video: hoy son estimaciones.
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
  /** El slug: identifica al video en los eventos y en las URLs. */
  id: string;
  titulo: string;
  /** Una línea, en el idioma del taller. */
  descripcion: string;
  /** El ID de YouTube. `null` = video en preparación. */
  youtubeId: string | null;
  /** Segundos. Se muestra como m:ss. */
  duracion: number;
  seccion: SeccionAyuda;
  /** La ruta del panel a la que pertenece: ahí aparece "¿Cómo se usa?". */
  solapa: string;
  /** El plan mínimo que incluye la función. */
  plan: ClavePlan;
  /** Si es el video de un paso del onboarding, cuál. */
  pasoOnboarding: PasoOnboarding | null;
  /**
   * El texto EXACTO de la función tal como aparece en la sección de precios
   * de la landing (lib/planes-landing.ts: las listas `incluye` de las
   * tarjetas y los `concepto` de la comparación). Si acá no coincide letra
   * por letra, el ícono no aparece: se ajusta acá, nunca en la landing.
   */
  featureLanding: string | null;
};

export const VIDEOS: readonly VideoAyuda[] = [
  {
    id: "bienvenida",
    titulo: "Recorrido del panel en 90 segundos",
    descripcion: "Qué hay en cada solapa y por dónde empezar.",
    youtubeId: null,
    duracion: 90,
    seccion: "Inicio",
    solapa: "/panel",
    plan: "basic",
    pasoOnboarding: null,
    featureLanding: null,
  },
  {
    id: "producto",
    titulo: "Cargar un producto con precio y stock",
    descripcion: "Categoría, nombre, marca y precio. El stock, solo si lo llevás.",
    youtubeId: null,
    duracion: 60,
    seccion: "Productos",
    solapa: "/panel/productos",
    plan: "basic",
    pasoOnboarding: 1,
    featureLanding: "Catálogo de tus productos",
  },
  {
    id: "cliente-vehiculo",
    titulo: "Cargar un cliente y su vehículo",
    descripcion: "El cliente, su patente y el auto, en una sola alta.",
    youtubeId: null,
    duracion: 75,
    seccion: "Clientes",
    solapa: "/panel/clientes",
    plan: "basic",
    pasoOnboarding: null,
    featureLanding: null,
  },
  {
    id: "service",
    titulo: "Cargar un service en menos de 90 segundos",
    descripcion: "Patente, aceite, filtros y kilómetros: el cartón, sin papel.",
    youtubeId: null,
    duracion: 90,
    seccion: "Trabajos",
    solapa: "/panel/services",
    plan: "basic",
    pasoOnboarding: null,
    featureLanding: "Carga en 90 segundos",
  },
  {
    id: "mecanica",
    titulo: "Cargar un trabajo mecánico",
    descripcion: "Frenos, correas o lo que sea: queda en el historial del auto.",
    youtubeId: null,
    duracion: 80,
    seccion: "Trabajos",
    solapa: "/panel/services",
    plan: "pro",
    pasoOnboarding: null,
    featureLanding: "Trabajos de mecánica",
  },
  {
    id: "editar-24h",
    titulo: "Editar un trabajo dentro de las 24 horas",
    descripcion: "Corregir un dato antes de que el trabajo quede fijado.",
    youtubeId: null,
    duracion: 45,
    seccion: "Trabajos",
    solapa: "/panel/services",
    plan: "basic",
    pasoOnboarding: null,
    featureLanding: null,
  },
  {
    id: "proximos",
    titulo: "A quién le toca volver: próximos, urgentes y vencidos",
    descripcion: "La lista de la semana, ordenada por urgencia, con el aviso listo.",
    youtubeId: null,
    duracion: 90,
    seccion: "Inicio",
    solapa: "/panel/proximos",
    plan: "basic",
    pasoOnboarding: null,
    featureLanding: "A quién llamar esta semana",
  },
  {
    id: "whatsapp",
    titulo: "Mandar el aviso por WhatsApp en tres tonos",
    descripcion: "Cercano, formal o directo: el mensaje sale armado con los datos del auto.",
    youtubeId: null,
    duracion: 70,
    seccion: "Inicio",
    solapa: "/panel/mensajes",
    plan: "basic",
    pasoOnboarding: null,
    featureLanding: "Mensajes ya armados",
  },
  {
    id: "presupuestos",
    titulo: "Presupuestos con tu logo en menos de un minuto",
    descripcion: "Renglones, precios y tu logo en un PDF para mandar o imprimir.",
    youtubeId: null,
    duracion: 60,
    seccion: "Presupuestos",
    solapa: "/panel/presupuestos",
    plan: "pro",
    pasoOnboarding: null,
    featureLanding: "Presupuestos con tu marca",
  },
  {
    id: "premio",
    titulo: "Definir el premio de fidelización y ver el avance",
    descripcion: "Cada cuántos services hay premio y cómo lo ve cada cliente.",
    youtubeId: null,
    duracion: 75,
    seccion: "Premios",
    solapa: "/panel/fidelizacion",
    plan: "pro",
    pasoOnboarding: 3,
    featureLanding: "Premios para que tus clientes vuelvan",
  },
  {
    id: "pagina-calcos",
    titulo: "Tu página y tus calcos: qué ve el cliente al escanear",
    descripcion: "La página que abre el QR y la hoja de calcos para imprimir.",
    youtubeId: null,
    duracion: 80,
    seccion: "Página y calcos",
    solapa: "/panel/experiencia",
    plan: "basic",
    pasoOnboarding: 2,
    featureLanding: "Página del cliente con QR",
  },
  {
    id: "personalizacion",
    titulo: "Personalizar tu página: logo, color y mensaje",
    descripcion: "Tu logo, tu color y el modo de la página.",
    youtubeId: null,
    duracion: 70,
    seccion: "Página y calcos",
    solapa: "/panel/experiencia",
    plan: "pro",
    pasoOnboarding: null,
    featureLanding: "Página del cliente personalizable",
  },
  {
    id: "exportar",
    titulo: "Exportar clientes, vehículos, productos y trabajos",
    descripcion: "Todos tus datos en un Excel, con los filtros que tengas puestos.",
    youtubeId: null,
    duracion: 45,
    seccion: "Exportar",
    solapa: "/panel/clientes",
    plan: "basic",
    pasoOnboarding: null,
    featureLanding: null,
  },
  {
    id: "sucursales",
    titulo: "Sucursales",
    descripcion: "Sumar un local y ver qué se hizo en cada uno.",
    youtubeId: null,
    duracion: 50,
    seccion: "Sucursales",
    solapa: "/panel/sucursales",
    plan: "ultra",
    pasoOnboarding: null,
    featureLanding: "Sucursales",
  },
  {
    id: "celular",
    titulo: "Cargar desde el celular, al lado del pozo",
    descripcion: "El panel en el teléfono: cargar el trabajo sin ir al escritorio.",
    youtubeId: null,
    duracion: 60,
    seccion: "Trabajos",
    solapa: "/panel/services",
    plan: "basic",
    pasoOnboarding: null,
    featureLanding: null,
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
 * hay ícono, porque la landing no puede tener botones muertos.
 */
export function videoDeFuncion(funcion: string): VideoAyuda | null {
  return (
    VIDEOS.find((v) => v.featureLanding === funcion && v.youtubeId !== null) ??
    null
  );
}

/** Agrupados por sección, en el orden de SECCIONES_AYUDA; sin secciones vacías. */
export function videosPorSeccion(): { seccion: SeccionAyuda; videos: VideoAyuda[] }[] {
  return SECCIONES_AYUDA.map((seccion) => ({
    seccion,
    videos: VIDEOS.filter((v) => v.seccion === seccion),
  })).filter((g) => g.videos.length > 0);
}

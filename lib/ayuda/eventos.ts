// El evento de reproducción, para GA4. Si la etiqueta de Google no cargó
// (desarrollo, preview, un bloqueador) no pasa nada: el video se ve igual.

export type LugarVideo = "panel" | "landing" | "onboarding";

declare global {
  interface Window {
    gtag?: (...args: unknown[]) => void;
  }
}

export function registrarReproduccion(videoId: string, lugar: LugarVideo) {
  if (typeof window === "undefined" || typeof window.gtag !== "function") return;
  window.gtag("event", "video_play", { video_id: videoId, lugar });
}

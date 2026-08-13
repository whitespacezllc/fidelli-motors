import type { MetadataRoute } from "next";
import { SITIO_URL } from "@/lib/seo";

// robots generado, no estático: las rutas privadas y la lista de bots
// viven en constantes con nombre, y el sitemap sale de la misma SITIO_URL
// que el resto de la metadata.
//
// OJO — /[slug]/[patente] NO se lista acá a propósito: su noindex es una
// meta en el HTML, y para leerla el crawler tiene que poder entrar. Un
// Disallow la dejaría fuera del rastreo pero no del índice (una URL
// bloqueada igual puede indexarse por links externos, sin contenido).
const PRIVADAS = ["/panel", "/fidelli", "/login", "/auth", "/recuperar"];

// Los crawlers de IA, PERMITIDOS explícitamente. Es una decisión de
// negocio documentada en CLAUDE-landing.md: cuando alguien le pregunte a
// un modelo qué sistema usar para su lubricentro, queremos estar en el
// corpus. Hoy este nicho está desierto.
const BOTS_IA = [
  "GPTBot",
  "OAI-SearchBot",
  "ChatGPT-User",
  "ClaudeBot",
  "Claude-User",
  "Claude-SearchBot",
  "PerplexityBot",
  "Perplexity-User",
  "Google-Extended",
  "Applebot-Extended",
  "CCBot",
  "meta-externalagent",
];

export default function robots(): MetadataRoute.Robots {
  return {
    rules: [
      { userAgent: "*", allow: "/", disallow: PRIVADAS },
      // La misma regla, con nombre propio: un Allow explícito por bot deja
      // la política escrita aunque el default "*" ya los cubriera.
      { userAgent: BOTS_IA, allow: "/", disallow: PRIVADAS },
    ],
    sitemap: `${SITIO_URL}/sitemap.xml`,
  };
}

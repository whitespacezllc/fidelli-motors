// ============================================================
// Las cabeceras de seguridad (docs/AUDITORIA-2026-10.md § 2.2).
//
// Vercel pone HSTS solo; lo demás lo ponemos acá, por superficie:
//
//   · EN TODO: nosniff, la política de referer (la URL con patente no
//     viaja entera a GA, a Meta ni a ningún link de afuera) y la de
//     permisos, con la cámara SOLO para el propio origen —los adjuntos la
//     usan desde el teléfono del mecánico—.
//   · LO PRIVADO NO SE EMBEBE: el panel, /fidelli, el login, /auth y
//     /recuperar no se pueden mostrar adentro de un iframe ajeno
//     (clickjacking). Es la única directiva de CSP que bloquea.
//   · LA LANDING Y LA PÁGINA DEL CLIENTE llevan una CSP en modo REPORT-ONLY:
//     no bloquea nada, avisa a /api/csp qué bloquearía. Es para ver qué
//     rompe antes de imponerla. Y NUNCA frame-ancestors en la página del
//     cliente: la abren WhatsApp e Instagram adentro de su vista, y un DENY
//     ahí rompe el preview.
//
// HSTS no se toca: lo pone Vercel. Lo lee next.config.ts; lo vigila
// scripts/regresion-cabeceras.mjs. No importa nada: next.config.ts lo carga
// antes de que exista el build.
// ============================================================

type Cabecera = { key: string; value: string };
type Regla = { source: string; headers: Cabecera[] };

const EN_TODO: Cabecera[] = [
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  { key: "Permissions-Policy", value: "camera=(self), microphone=(), geolocation=()" },
];

const NO_EMBEBER: Cabecera[] = [
  { key: "Content-Security-Policy", value: "frame-ancestors 'none'" },
  // Para los navegadores que no leen frame-ancestors.
  { key: "X-Frame-Options", value: "DENY" },
];

/** Las superficies privadas: cuentas, sesiones y datos de los talleres. */
const PRIVADAS = ["panel", "fidelli", "login", "auth", "recuperar"];

/** El origen de Supabase (las imágenes de Storage y las llamadas del
 *  navegador), el de este entorno: el local, el de dev o el de producción. */
function origenSupabase(): string | null {
  try {
    return new URL(process.env.NEXT_PUBLIC_SUPABASE_URL ?? "").origin;
  } catch {
    return null;
  }
}

/** La CSP de la landing comercial y de la superficie del cliente, en modo
 *  report-only: lo que hoy cargan esas páginas —gtag.js de GA4 y de Google
 *  Ads con sus colectores, el Píxel de Meta, las miniaturas y el
 *  reproductor de YouTube, las fuentes, Storage— y nada más. La lista salió
 *  de recorrer la landing, el blog y la página de un cliente con las
 *  etiquetas cargadas y mirar qué reportaba. `'unsafe-inline'` en scripts y estilos
 *  porque Next mete su arranque en línea; sacarlo es pasar a nonces, que
 *  vuelve dinámica cada página: es otra decisión, no la de este paso. */
export function politicaReportOnly(supabase = origenSupabase()): string {
  const storage = supabase ? [supabase] : [];
  const directivas: [string, string[]][] = [
    ["default-src", ["'self'"]],
    [
      "script-src",
      [
        "'self'",
        "'unsafe-inline'",
        "https://www.googletagmanager.com",
        "https://www.google-analytics.com",
        "https://www.googleadservices.com",
        "https://*.doubleclick.net",
        "https://connect.facebook.net",
      ],
    ],
    ["style-src", ["'self'", "'unsafe-inline'", "https://fonts.googleapis.com"]],
    [
      "img-src",
      [
        "'self'",
        "data:",
        "blob:",
        ...storage,
        "https://i.ytimg.com",
        "https://www.google-analytics.com",
        "https://www.googletagmanager.com",
        "https://*.doubleclick.net",
        "https://www.google.com",
        "https://www.google.com.ar",
        "https://www.facebook.com",
      ],
    ],
    ["font-src", ["'self'", "data:", "https://fonts.gstatic.com"]],
    [
      "connect-src",
      [
        "'self'",
        ...storage,
        "https://www.google-analytics.com",
        "https://*.google-analytics.com",
        // El colector de GA4 es el dominio pelado: el comodín no lo cubre.
        "https://analytics.google.com",
        "https://*.analytics.google.com",
        "https://www.googletagmanager.com",
        // Los colectores de Google Ads (stats.g., ad., googleads.g.).
        "https://*.doubleclick.net",
        "https://www.google.com",
        "https://connect.facebook.net",
        "https://www.facebook.com",
      ],
    ],
    [
      "frame-src",
      ["https://www.youtube-nocookie.com", "https://*.doubleclick.net", "https://www.googletagmanager.com", "https://www.facebook.com"],
    ],
    ["media-src", ["'self'", ...storage]],
    ["object-src", ["'none'"]],
    ["base-uri", ["'self'"]],
    ["form-action", ["'self'"]],
    ["report-uri", ["/api/csp"]],
    ["report-to", ["csp"]],
  ];
  return directivas.map(([d, v]) => `${d} ${v.join(" ")}`).join("; ");
}

export function cabecerasDeSeguridad(): Regla[] {
  const reportOnly: Cabecera[] = [
    { key: "Content-Security-Policy-Report-Only", value: politicaReportOnly() },
    { key: "Reporting-Endpoints", value: 'csp="/api/csp"' },
  ];
  // Todo lo que no es privado ni del framework ni de la API: la landing, el
  // blog, las páginas legales y la superficie del cliente (/[slug] y
  // /[slug]/[patente]). Un slug que empieza como una superficie privada
  // («paneles-cordoba») sigue siendo del cliente: corta en la barra.
  const publicas = `/:ruta((?!(?:${[...PRIVADAS, "api", "_next"].join("|")})(?:/|$)).+)`;
  return [
    { source: "/:ruta*", headers: EN_TODO },
    ...PRIVADAS.flatMap((p) => [
      { source: `/${p}`, headers: NO_EMBEBER },
      { source: `/${p}/:ruta*`, headers: NO_EMBEBER },
    ]),
    { source: "/", headers: reportOnly },
    { source: publicas, headers: reportOnly },
  ];
}

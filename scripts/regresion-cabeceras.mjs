// Las cabeceras de seguridad (auditoría § 2.2, docs/PROMPT-velocidad-y-
// seguridad.md § 7), contra el servidor de Next (regla 13: una prueba que
// nunca se vio en rojo no existe).
//
// Lo que cubre:
//   1 · EN TODO: X-Content-Type-Options nosniff, Referrer-Policy
//       strict-origin-when-cross-origin y Permissions-Policy con la cámara
//       solo para el propio origen (los adjuntos la usan desde el teléfono).
//   2 · LO PRIVADO NO SE EMBEBE: el panel, /fidelli, el login, /auth y
//       /recuperar responden con frame-ancestors 'none' (y X-Frame-Options
//       DENY para los navegadores viejos). Nada de eso se bloquea en otro
//       lado: la CSP de bloqueo es SOLO esa directiva.
//   3 · LA PÁGINA DEL CLIENTE SÍ SE EMBEBE: /[slug] y /[slug]/[patente] no
//       llevan frame-ancestors ni X-Frame-Options (la abren WhatsApp e
//       Instagram adentro de su vista, y un DENY rompe el preview).
//   4 · LA CSP DE LA LANDING Y DEL CLIENTE ES REPORT-ONLY: Content-
//       Security-Policy-Report-Only con lo que se usa (GA, Meta, YouTube,
//       las fuentes, Supabase Storage) y el reporte a /api/csp; ninguna
//       Content-Security-Policy que bloquee.
//   5 · /api/csp recibe los dos formatos de reporte y contesta 204.
//
// Requiere el stack local con el seed y el servidor de Next (dev o start):
// Correr:  BASE_URL=http://localhost:3000 node --no-warnings scripts/regresion-cabeceras.mjs
const BASE = (process.env.BASE_URL ?? "http://localhost:3000").replace(/\/+$/, "");

let fallas = 0;
const check = (nombre, cond, detalle = "") => {
  console.log(`  ${cond ? "✓" : "✗ FALLA"} ${nombre}${cond || !detalle ? "" : `  → ${detalle}`}`);
  if (!cond) fallas++;
};
const pedir = async (ruta) => {
  const r = await fetch(`${BASE}${ruta}`, { redirect: "manual" });
  await r.arrayBuffer();
  return r;
};

// Las rutas por superficie. La patente es una del seed: la página del
// cliente registra la búsqueda en landing_busquedas, como cualquier visita.
const PRIVADAS = ["/panel", "/panel/proximos", "/fidelli", "/fidelli/calcos", "/login", "/recuperar", "/auth/enlace?tipo=invite"];
const CLIENTE = ["/demo", "/demo/ABC123"];
const LANDING = ["/", "/blog", "/terminos"];
const TODAS = [...PRIVADAS, ...CLIENTE, ...LANDING];

const respuestas = new Map();
for (const ruta of TODAS) respuestas.set(ruta, await pedir(ruta));
const h = (ruta, nombre) => respuestas.get(ruta).headers.get(nombre);

console.log("\n── 1 · en todo ──");
for (const ruta of TODAS) {
  const estado = respuestas.get(ruta).status;
  check(`${ruta} (${estado}): nosniff`, h(ruta, "x-content-type-options") === "nosniff", h(ruta, "x-content-type-options") ?? "sin cabecera");
  check(`${ruta}: Referrer-Policy strict-origin-when-cross-origin`, h(ruta, "referrer-policy") === "strict-origin-when-cross-origin", h(ruta, "referrer-policy") ?? "sin cabecera");
  check(`${ruta}: Permissions-Policy con la cámara solo propia`,
    h(ruta, "permissions-policy") === "camera=(self), microphone=(), geolocation=()", h(ruta, "permissions-policy") ?? "sin cabecera");
}

console.log("\n── 2 · lo privado no se embebe ──");
for (const ruta of PRIVADAS) {
  const csp = h(ruta, "content-security-policy") ?? "";
  check(`${ruta}: frame-ancestors 'none'`, /(^|;)\s*frame-ancestors 'none'\s*(;|$)/.test(csp), csp || "sin cabecera");
  check(`${ruta}: la CSP de bloqueo es solo frame-ancestors`, csp.split(";").map((d) => d.trim()).filter(Boolean).length === 1, csp);
  check(`${ruta}: X-Frame-Options DENY`, h(ruta, "x-frame-options") === "DENY", h(ruta, "x-frame-options") ?? "sin cabecera");
}

console.log("\n── 3 · la página del cliente se puede embeber ──");
for (const ruta of CLIENTE) {
  const todas = [h(ruta, "content-security-policy"), h(ruta, "content-security-policy-report-only")].filter(Boolean).join(" | ");
  check(`${ruta} (${respuestas.get(ruta).status}): sin frame-ancestors`, !/frame-ancestors/.test(todas), todas);
  check(`${ruta}: sin X-Frame-Options`, h(ruta, "x-frame-options") === null, h(ruta, "x-frame-options") ?? "");
}

console.log("\n── 4 · la CSP de la landing y del cliente es report-only ──");
const DEBE = [
  ["default-src", "'self'"],
  ["script-src", "https://www.googletagmanager.com"],
  ["script-src", "https://connect.facebook.net"],
  ["connect-src", "https://www.google-analytics.com"],
  ["connect-src", "https://www.facebook.com"],
  ["frame-src", "https://www.youtube-nocookie.com"],
  ["img-src", "https://i.ytimg.com"],
  ["img-src", "data:"],
  ["font-src", "https://fonts.gstatic.com"],
  ["style-src", "https://fonts.googleapis.com"],
  ["report-uri", "/api/csp"],
  ["report-to", "csp"],
];
for (const ruta of [...LANDING, ...CLIENTE]) {
  const ro = h(ruta, "content-security-policy-report-only") ?? "";
  const directivas = Object.fromEntries(ro.split(";").map((d) => d.trim()).filter(Boolean).map((d) => {
    const [nombre, ...valores] = d.split(/\s+/);
    return [nombre, valores];
  }));
  check(`${ruta}: Content-Security-Policy-Report-Only presente`, ro.length > 0, "sin cabecera");
  const faltan = DEBE.filter(([d, v]) => !(directivas[d] ?? []).includes(v)).map(([d, v]) => `${d} ${v}`);
  check(`${ruta}: permite GA, Meta, YouTube, las fuentes y reporta a /api/csp`, faltan.length === 0, `faltan: ${faltan.join(", ")}`);
  const storage = (directivas["img-src"] ?? []).some((v) => /supabase|127\.0\.0\.1|localhost/.test(v));
  check(`${ruta}: las imágenes de Supabase Storage`, storage, (directivas["img-src"] ?? []).join(" "));
  check(`${ruta}: Reporting-Endpoints con el endpoint csp`, /(^|,)\s*csp="[^"]*\/api\/csp"/.test(h(ruta, "reporting-endpoints") ?? ""), h(ruta, "reporting-endpoints") ?? "sin cabecera");
  check(`${ruta}: ninguna CSP que bloquee`, h(ruta, "content-security-policy") === null, h(ruta, "content-security-policy") ?? "");
}

console.log("\n── 5 · /api/csp recibe los reportes ──");
const viejo = await fetch(`${BASE}/api/csp`, {
  method: "POST",
  headers: { "content-type": "application/csp-report" },
  body: JSON.stringify({ "csp-report": { "document-uri": `${BASE}/`, "violated-directive": "img-src", "blocked-uri": "https://ejemplo.invalid/x.png" } }),
});
check("formato report-uri (application/csp-report) → 204", viejo.status === 204, String(viejo.status));
const nuevo = await fetch(`${BASE}/api/csp`, {
  method: "POST",
  headers: { "content-type": "application/reports+json" },
  body: JSON.stringify([{ type: "csp-violation", url: `${BASE}/`, body: { documentURL: `${BASE}/`, effectiveDirective: "script-src-elem", blockedURL: "https://ejemplo.invalid/x.js" } }]),
});
check("formato report-to (application/reports+json) → 204", nuevo.status === 204, String(nuevo.status));
const basura = await fetch(`${BASE}/api/csp`, { method: "POST", headers: { "content-type": "application/json" }, body: "esto no es json" });
check("un cuerpo que no es un reporte no rompe nada (204)", basura.status === 204, String(basura.status));
const get = await fetch(`${BASE}/api/csp`);
check("GET no existe (405)", get.status === 405, String(get.status));

console.log(fallas ? `\n✗ ${fallas} falla(s).` : "\nTodo en verde.");
process.exit(fallas ? 1 : 0);

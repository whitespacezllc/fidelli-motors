// La tarjeta de WhatsApp de cada tenant, sin nuestra marca
// (docs/PROMPT-og-tenant.md), contra el servidor de Next (regla 13: una
// prueba que nunca se vio en rojo no existe).
//
// Lo que cubre:
//   1 · LA PÁGINA DEL TENANT ENLAZA SU TARJETA: el HTML de /demo lleva
//       og:image apuntando a /demo/opengraph-image, con og:image:width 1200,
//       og:image:height 630 y og:image:type image/png —lo que WhatsApp
//       necesita para mostrar la tarjeta grande—, y twitter:image a la misma.
//   2 · og:site_name ES EL NOMBRE DEL TENANT, y NINGUNA etiqueta og:* ni
//       twitter:* de /demo dice «Fidelli» ni apunta a la imagen general
//       (/assets/og-image.jpg).
//   3 · LA PÁGINA DE LA PATENTE HEREDA LA TARJETA del tenant —/demo/ABC123 es
//       noindex pero se comparte igual— y tampoco lleva la general.
//   4 · LA TARJETA SALE SIEMPRE: /demo/opengraph-image y la de un slug que no
//       existe responden 200, image/png, 1200×630. Un slug inexistente da la
//       tarjeta neutra, nunca un error.
//   5 · LA LANDING COMERCIAL NO CAMBIA: / sigue con /assets/og-image.jpg y
//       og:site_name «Fidelli Motors».
//
// Requiere el stack local con el seed y el servidor de Next (dev o start).
// Visitar /demo/ABC123 registra una búsqueda en landing_busquedas, como
// cualquier visita. No toca nada más.
// Correr:  BASE_URL=http://localhost:3000 node --no-warnings scripts/regresion-og-tenant.mjs
import { chromium } from "playwright";
import sharp from "sharp";

const BASE = (process.env.BASE_URL ?? "http://localhost:3000").replace(/\/+$/, "");
const TENANT = { slug: "demo", nombre: "Lubricentro San Martín", patente: "ABC123" };
const GENERAL = "/assets/og-image.jpg";

let fallas = 0;
const check = (nombre, cond, detalle = "") => {
  console.log(`  ${cond ? "✓" : "✗ FALLA"} ${nombre}${cond || !detalle ? "" : `  → ${detalle}`}`);
  if (!cond) fallas++;
};

// Todas las <meta> de Open Graph y Twitter de una página, como pares
// [clave, contenido]. Next emite og:* con `property` y twitter:* con `name`.
async function metas(page, ruta) {
  await page.goto(`${BASE}${ruta}`, { waitUntil: "domcontentloaded", timeout: 60_000 });
  return page.$$eval("meta[property^='og:'], meta[name^='twitter:']", (nodos) =>
    nodos.map((m) => [m.getAttribute("property") ?? m.getAttribute("name"), m.getAttribute("content") ?? ""]),
  );
}
const valor = (lista, clave) => lista.find(([k]) => k === clave)?.[1];
const ruta = (url) => {
  try {
    return new URL(url, BASE).pathname;
  } catch {
    return url;
  }
};
// Next publica la imagen en /[slug]/opengraph-image-<id>?<hash>: el sufijo
// distingue la ruta del segmento dinámico [patente] y el hash invalida la
// caché al cambiar el archivo. Lo que se verifica es el path, no el host,
// porque metadataBase pone el dominio de producción.
const esTarjetaDe = (url, slug) => new RegExp(`^/${slug}/opengraph-image(-[a-z0-9]+)?$`).test(ruta(url));
// La misma URL, pedida a ESTE servidor (metadataBase puede apuntar a otro host).
const enLocal = (url) => {
  const u = new URL(url, BASE);
  return `${u.pathname}${u.search}`;
};

async function tarjeta(rutaImagen) {
  const r = await fetch(`${BASE}${rutaImagen}`, { signal: AbortSignal.timeout(60_000) });
  const bytes = Buffer.from(await r.arrayBuffer());
  let meta = null;
  try {
    meta = await sharp(bytes).metadata();
  } catch {
    meta = null;
  }
  return { status: r.status, tipo: r.headers.get("content-type") ?? "", meta, bytes: bytes.length };
}

const navegador = await chromium.launch();
const page = await navegador.newPage();

try {
  console.log(`\n── 1 · la página del tenant enlaza su tarjeta (${BASE}/${TENANT.slug}) ──`);
  const tenant = await metas(page, `/${TENANT.slug}`);
  const imagen = valor(tenant, "og:image") ?? "";
  check("og:image apunta a /demo/opengraph-image-<id>", esTarjetaDe(imagen, TENANT.slug), imagen || "sin og:image");
  check("og:image:width = 1200", valor(tenant, "og:image:width") === "1200", valor(tenant, "og:image:width") ?? "sin etiqueta");
  check("og:image:height = 630", valor(tenant, "og:image:height") === "630", valor(tenant, "og:image:height") ?? "sin etiqueta");
  check("og:image:type = image/png", valor(tenant, "og:image:type") === "image/png", valor(tenant, "og:image:type") ?? "sin etiqueta");
  const twitter = valor(tenant, "twitter:image") ?? "";
  check("twitter:image apunta a la misma tarjeta", twitter !== "" && twitter === imagen, twitter || "sin twitter:image");
  check("twitter:card = summary_large_image", valor(tenant, "twitter:card") === "summary_large_image", valor(tenant, "twitter:card") ?? "sin etiqueta");

  console.log("\n── 2 · cero marca Fidelli en las og:* y twitter:* del tenant ──");
  check(`og:site_name = «${TENANT.nombre}»`, valor(tenant, "og:site_name") === TENANT.nombre, valor(tenant, "og:site_name") ?? "sin etiqueta");
  // «Fidelli» con mayúscula: la marca escrita. El dominio fidellimotors.app
  // en og:url y en la URL de la imagen es la dirección del link y no se
  // controla desde acá (un dominio por tenant es otro proyecto).
  const conFidelli = tenant.filter(([, v]) => /Fidelli/.test(v));
  check("ninguna etiqueta og:* ni twitter:* dice «Fidelli»", conFidelli.length === 0, conFidelli.map(([k, v]) => `${k}=${v}`).join(" | "));
  const conGeneral = tenant.filter(([, v]) => v.includes(GENERAL));
  check("ninguna apunta a la imagen general", conGeneral.length === 0, conGeneral.map(([k]) => k).join(", "));

  console.log(`\n── 3 · la página de la patente hereda la tarjeta (/${TENANT.slug}/${TENANT.patente}) ──`);
  const patente = await metas(page, `/${TENANT.slug}/${TENANT.patente}`);
  const imagenPatente = valor(patente, "og:image") ?? "";
  check("og:image apunta a /demo/opengraph-image-<id>", esTarjetaDe(imagenPatente, TENANT.slug), imagenPatente || "sin og:image");
  check("og:image:width = 1200 y og:image:height = 630", valor(patente, "og:image:width") === "1200" && valor(patente, "og:image:height") === "630",
    `${valor(patente, "og:image:width") ?? "-"}×${valor(patente, "og:image:height") ?? "-"}`);
  const generalEnPatente = patente.filter(([, v]) => v.includes(GENERAL));
  check("ninguna apunta a la imagen general", generalEnPatente.length === 0, generalEnPatente.map(([k]) => k).join(", "));
  const fidelliEnPatente = patente.filter(([, v]) => /Fidelli/.test(v));
  check("ninguna etiqueta og:* ni twitter:* dice «Fidelli»", fidelliEnPatente.length === 0, fidelliEnPatente.map(([k, v]) => `${k}=${v}`).join(" | "));

  console.log("\n── 4 · la tarjeta sale siempre ──");
  // La neutra se pide por el link que publica el propio 404 del slug: la
  // convención de archivo también lo cubre.
  const inexistente = await metas(page, "/zz-no-existe-og");
  const imagenNeutra = valor(inexistente, "og:image") ?? "";
  check("el 404 de un slug que no existe también enlaza una tarjeta", esTarjetaDe(imagenNeutra, "zz-no-existe-og"), imagenNeutra || "sin og:image");
  for (const [nombre, url] of [
    ["la del tenant", imagen],
    ["la de un slug que no existe (neutra)", imagenNeutra],
  ]) {
    const t = await tarjeta(enLocal(url));
    check(`${nombre}: 200`, t.status === 200, `status ${t.status}`);
    check(`${nombre}: image/png`, t.tipo.startsWith("image/png"), t.tipo || "sin content-type");
    check(`${nombre}: 1200×630`, t.meta?.width === 1200 && t.meta?.height === 630, t.meta ? `${t.meta.width}×${t.meta.height}` : `no es una imagen (${t.bytes} bytes)`);
  }

  console.log("\n── 5 · la landing comercial no cambia ──");
  const portada = await metas(page, "/");
  check("og:image es la general", ruta(valor(portada, "og:image") ?? "") === GENERAL, valor(portada, "og:image") ?? "sin og:image");
  check("og:site_name = «Fidelli Motors»", valor(portada, "og:site_name") === "Fidelli Motors", valor(portada, "og:site_name") ?? "sin etiqueta");
} finally {
  await navegador.close();
}

console.log(fallas ? `\n✗ ${fallas} falla(s)` : "\n✓ todo en verde");
process.exit(fallas ? 1 : 0);

// Las seis tarjetas de WhatsApp generadas, bajadas del servidor local a
// docs/capturas/og/ (docs/PROMPT-og-tenant.md § 4): la evidencia visual del
// PR y la prueba de que la tarjeta sigue el MODO de la página del tenant y
// de que el logo sale en los tres formatos que acepta el bucket (regla 13:
// una prueba que nunca se vio en rojo no existe).
//
// Los casos: cinco tenants que el script CREA en la base local (slug
// zz-og-*) y borra al final, más un slug que no existe.
//   claro-png         modo claro sin color de fondo, logo PNG (apaisado, con
//                     transparencia) → fondo blanco, texto oscuro, el logo
//   claro-fondo-webp  modo claro con color_fondo crema, logo WebP (cuadrado)
//                     → fondo crema; satori no lee WebP, sharp lo convierte
//   claro-sin-logo    modo claro, sin logo → el círculo del color del tenant
//                     con las iniciales, texto oscuro
//   oscuro-jpg        modo oscuro, logo JPG (3:1) → fondo grafito, texto
//                     claro, el logo tal cual
//   oscuro-sin-logo   modo oscuro, sin logo, «Falco Lubricantes y Servicios»
//                     (nombre largo) → el círculo con las iniciales, blanco
//   inexistente       un slug que no existe → la tarjeta neutra
//
// El logo de prueba es una marca MAGENTA (#FF00FF) que no aparece en ninguna
// otra parte de la tarjeta: encontrar ese color en la zona del logo es la
// prueba de que el logo se dibujó, y de que NO se dibujó en el tenant sin
// logo, donde van las iniciales. El fondo se lee en una esquina: tiene que
// ser el del modo (blanco o color_fondo en claro, el grafito en oscuro),
// nunca el color primario. Cada tarjeta además tiene que ser un PNG de
// 1200×630 con status 200.
//
// Requiere el stack local (Docker) y el servidor de Next (dev o start).
// Correr:  BASE_URL=http://localhost:3000 node --no-warnings scripts/og-tenants.mjs
//   --dejar   conserva los tenants zz-og-* y sus logos en la base local
import fs from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { createClient } from "@supabase/supabase-js";
import sharp from "sharp";

const RAIZ = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const BASE = (process.env.BASE_URL ?? "http://localhost:3000").replace(/\/+$/, "");
const SALIDA = path.join(RAIZ, "docs", "capturas", "og");
const CONTENEDOR = "supabase_db_fidelli-motors";
const DEJAR = process.argv.includes("--dejar");

const ENV = Object.fromEntries(
  fs.readFileSync(path.join(RAIZ, ".env.local"), "utf8").split("\n")
    .filter((l) => /^[A-Z_]+=/.test(l))
    .map((l) => [l.slice(0, l.indexOf("=")), l.slice(l.indexOf("=") + 1).trim()]),
);
const supabase = createClient(ENV.NEXT_PUBLIC_SUPABASE_URL, ENV.SUPABASE_SERVICE_ROLE_KEY, {
  auth: { persistSession: false, autoRefreshToken: false },
});

function sql(texto) {
  return execFileSync(
    "docker",
    ["exec", "-i", CONTENEDOR, "psql", "-U", "postgres", "-d", "postgres", "-X", "-q", "-A", "-t", "-v", "ON_ERROR_STOP=1"],
    { input: texto, encoding: "utf8" },
  ).trim();
}
const lit = (s) => `'${String(s).replace(/'/g, "''")}'`;

let fallas = 0;
const check = (nombre, cond, detalle = "") => {
  console.log(`  ${cond ? "✓" : "✗ FALLA"} ${nombre}${cond || !detalle ? "" : `  → ${detalle}`}`);
  if (!cond) fallas++;
};

// ---------- Los logos de prueba: magenta, en tres formatos y tres proporciones ----------
const MAGENTA = "#FF00FF";
const svgLogo = (ancho, alto, fondoOpaco) => `
<svg xmlns="http://www.w3.org/2000/svg" width="${ancho}" height="${alto}" viewBox="0 0 ${ancho} ${alto}">
  ${fondoOpaco ? `<rect width="${ancho}" height="${alto}" fill="${MAGENTA}"/>` : ""}
  <rect x="${alto * 0.1}" y="${alto * 0.1}" width="${ancho - alto * 0.2}" height="${alto * 0.8}" rx="${alto * 0.2}" fill="${MAGENTA}"/>
  <circle cx="${ancho / 2}" cy="${alto / 2}" r="${alto * 0.22}" fill="#FFFFFF"/>
</svg>`;
const LOGOS = {
  png: { mime: "image/png", bytes: () => sharp(Buffer.from(svgLogo(600, 300, false))).png().toBuffer() },
  webp: { mime: "image/webp", bytes: () => sharp(Buffer.from(svgLogo(400, 400, false))).webp().toBuffer() },
  jpg: { mime: "image/jpeg", bytes: () => sharp(Buffer.from(svgLogo(900, 300, true))).jpeg({ quality: 90 }).toBuffer() },
};

// ---------- Los casos ----------
// `fondo` es el color que tiene que tener la esquina de la tarjeta: el de
// la página en ese modo (lib/cliente/tema.ts), no el color primario.
const GRAFITO = "#0A0A0A";
const CASOS = [
  { archivo: "claro-png", slug: "zz-og-claro-png", nombre: "Lubricentro Del Puerto", color: "#1E3A5F", tema: "claro", colorFondo: null, logo: "png", conLogo: true, fondo: "#FFFFFF" },
  { archivo: "claro-fondo-webp", slug: "zz-og-claro-fondo-webp", nombre: "Taller Hermanos Ríos", color: "#7C2D12", tema: "claro", colorFondo: "#FDF6E3", logo: "webp", conLogo: true, fondo: "#FDF6E3" },
  { archivo: "claro-sin-logo", slug: "zz-og-claro-sin-logo", nombre: "Lubri Sol", color: "#0F766E", tema: "claro", colorFondo: null, logo: null, conLogo: false, fondo: "#FFFFFF" },
  { archivo: "oscuro-jpg", slug: "zz-og-oscuro-jpg", nombre: "Brothers Oil", color: "#B45309", tema: "oscuro", colorFondo: null, logo: "jpg", conLogo: true, fondo: GRAFITO },
  { archivo: "oscuro-sin-logo", slug: "zz-og-oscuro-sin-logo", nombre: "Falco Lubricantes y Servicios", color: "#1D4ED8", tema: "oscuro", colorFondo: "#FDF6E3", logo: null, conLogo: false, fondo: GRAFITO },
  { archivo: "inexistente", slug: "zz-og-no-existe", nombre: null, conLogo: false, fondo: GRAFITO },
];
const DE_PRUEBA = CASOS.filter((c) => c.nombre);

// ---------- Alta y baja de los tenants de prueba ----------
async function borrar() {
  const ids = sql("select id from lubricentros where slug like 'zz-og-%'").split("\n").filter(Boolean);
  if (ids.length) {
    const lista = ids.map(lit).join(", ");
    sql(`begin;
      delete from landing_busquedas  where lubricentro_id in (${lista});
      delete from sucursales         where lubricentro_id in (${lista});
      delete from config_experiencia where lubricentro_id in (${lista});
      delete from lubricentros       where id in (${lista});
    commit;`);
    const archivos = ids.flatMap((id) => ["png", "jpg", "webp"].map((ext) => `${id}/logo.${ext}`));
    await supabase.storage.from("logos").remove(archivos);
  }
}

async function crear() {
  for (const caso of DE_PRUEBA) {
    const id = sql(`insert into lubricentros (nombre, slug) values (${lit(caso.nombre)}, ${lit(caso.slug)}) returning id`);
    let logoUrl = null;
    if (caso.logo) {
      const ruta = `${id}/logo.${caso.logo}`;
      const { error } = await supabase.storage.from("logos")
        .upload(ruta, await LOGOS[caso.logo].bytes(), { contentType: LOGOS[caso.logo].mime, upsert: true });
      if (error) throw new Error(`no se pudo subir el logo de ${caso.slug}: ${error.message}`);
      logoUrl = `${supabase.storage.from("logos").getPublicUrl(ruta).data.publicUrl}?v=${Date.now()}`;
    }
    sql(`begin;
      insert into config_experiencia (lubricentro_id, color_primario, tema, color_fondo, logo_url)
      values (${lit(id)}, ${lit(caso.color)}, ${lit(caso.tema)}, ${caso.colorFondo ? lit(caso.colorFondo) : "null"}, ${logoUrl ? lit(logoUrl) : "null"});
      insert into sucursales (lubricentro_id, nombre, direccion)
      values (${lit(id)}, 'Casa Central', 'Av. Siempre Viva 742');
    commit;`);
  }
}

// ---------- Los píxeles ----------
async function pixeles(png) {
  return sharp(png).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
}
// ¿Hay magenta en el rectángulo del logo (arriba a la izquierda)? Con
// tolerancia, porque el JPG del logo no devuelve el color exacto.
function hayMagenta({ data, info }, zona) {
  let n = 0;
  for (let y = zona.y; y < zona.y + zona.alto; y++) {
    for (let x = zona.x; x < zona.x + zona.ancho; x++) {
      const i = (y * info.width + x) * info.channels;
      if (data[i] > 200 && data[i + 1] < 80 && data[i + 2] > 200) n++;
    }
  }
  return n;
}
const ZONA_LOGO = { x: 40, y: 40, ancho: 560, alto: 240 };
// El color de un píxel, como hex: la esquina de arriba a la izquierda es
// fondo plano en todas las tarjetas.
function hexEn({ data, info }, x, y) {
  const i = (y * info.width + x) * info.channels;
  return "#" + [data[i], data[i + 1], data[i + 2]].map((v) => v.toString(16).padStart(2, "0").toUpperCase()).join("");
}

// ---------- Corrida ----------
fs.mkdirSync(SALIDA, { recursive: true });
await borrar();
await crear();
try {
  for (const caso of CASOS) {
    console.log(`\n── ${caso.archivo} (/${caso.slug}) ──`);
    // La URL de la tarjeta sale del HTML de la página, que es lo que lee
    // WhatsApp: Next la publica en /[slug]/opengraph-image-<id>?<hash> (el
    // sufijo la distingue del segmento [patente]). El 404 de un slug que
    // no existe también la enlaza.
    const html = await (await fetch(`${BASE}/${caso.slug}`, { signal: AbortSignal.timeout(90_000) })).text();
    const enlace = html.match(/<meta property="og:image" content="([^"]+)"/)?.[1];
    check("la página enlaza og:image", Boolean(enlace), "sin og:image en el HTML");
    if (!enlace) continue;
    const u = new URL(enlace, BASE);
    const r = await fetch(`${BASE}${u.pathname}${u.search}`, { signal: AbortSignal.timeout(90_000) });
    const bytes = Buffer.from(await r.arrayBuffer());
    const tipo = r.headers.get("content-type") ?? "";
    check("200", r.status === 200, `status ${r.status}`);
    check("image/png", tipo.startsWith("image/png"), tipo || "sin content-type");
    let meta = null;
    try {
      meta = await sharp(bytes).metadata();
    } catch {
      meta = null;
    }
    check("1200×630", meta?.width === 1200 && meta?.height === 630, meta ? `${meta.width}×${meta.height}` : `no es una imagen (${bytes.length} bytes)`);
    if (meta?.format === "png") {
      const px = await pixeles(bytes);
      const esquina = hexEn(px, 12, 12);
      check(`el fondo es el del modo (${caso.fondo})`, esquina === caso.fondo, `la esquina es ${esquina}`);
      const magenta = hayMagenta(px, ZONA_LOGO);
      check(
        caso.conLogo ? "el logo (magenta) está arriba a la izquierda" : "sin logo: no hay magenta",
        caso.conLogo ? magenta > 500 : magenta === 0,
        `${magenta} píxeles magenta en la zona del logo`,
      );
      const destino = path.join(SALIDA, `${caso.archivo}.png`);
      fs.writeFileSync(destino, bytes);
      console.log(`  → ${path.relative(RAIZ, destino)} (${(bytes.length / 1024).toFixed(0)} KB)`);
    }
  }
} finally {
  if (DEJAR) console.log("\n(--dejar: los tenants zz-og-* quedan en la base local)");
  else await borrar();
}

console.log(fallas ? `\n✗ ${fallas} falla(s)` : "\n✓ todo en verde");
process.exit(fallas ? 1 : 0);

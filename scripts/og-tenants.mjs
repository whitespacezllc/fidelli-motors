// Las cinco tarjetas de WhatsApp generadas, bajadas del servidor local a
// docs/capturas/og/ (docs/PROMPT-og-tenant.md § 4): la evidencia visual del
// PR y la prueba de que el logo sale en los tres formatos que acepta el
// bucket (regla 13: una prueba que nunca se vio en rojo no existe).
//
// Los casos: cuatro tenants que el script CREA en la base local (slug
// zz-og-*) y borra al final, más un slug que no existe.
//   oscuro-png      color oscuro, logo PNG (apaisado, con transparencia)
//                   → el logo sobre la placa blanca, texto blanco
//   webp-convertido logo WebP (cuadrado) → satori no lo lee; sharp lo
//                   convierte a PNG y el logo sale igual
//   claro-sin-logo  color claro, sin logo → las iniciales en la placa, texto
//                   oscuro
//   nombre-largo    «Falco Lubricantes y Servicios», logo JPG (3:1)
//   inexistente     un slug que no existe → la tarjeta neutra
//
// El logo de prueba es una marca MAGENTA (#FF00FF) que no aparece en ninguna
// otra parte de la tarjeta: encontrar ese color en la zona de la placa es la
// prueba de que el logo se dibujó, y de que NO se dibujó en el tenant sin
// logo, donde van las iniciales. Cada tarjeta además tiene que ser un PNG de
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
const CASOS = [
  { archivo: "oscuro-png", slug: "zz-og-oscuro-png", nombre: "Lubricentro Del Puerto", color: "#1E3A5F", logo: "png", conLogo: true },
  { archivo: "webp-convertido", slug: "zz-og-webp", nombre: "Taller Hermanos Ríos", color: "#7C2D12", logo: "webp", conLogo: true },
  { archivo: "claro-sin-logo", slug: "zz-og-claro-sin-logo", nombre: "Lubri Sol", color: "#FDE68A", logo: null, conLogo: false },
  { archivo: "nombre-largo", slug: "zz-og-nombre-largo", nombre: "Falco Lubricantes y Servicios", color: "#0F766E", logo: "jpg", conLogo: true },
  { archivo: "inexistente", slug: "zz-og-no-existe", nombre: null, conLogo: false },
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
      insert into config_experiencia (lubricentro_id, color_primario, logo_url)
      values (${lit(id)}, ${lit(caso.color)}, ${logoUrl ? lit(logoUrl) : "null"});
      insert into sucursales (lubricentro_id, nombre, direccion)
      values (${lit(id)}, 'Casa Central', 'Av. Siempre Viva 742');
    commit;`);
  }
}

// ---------- La zona de la placa del logo: arriba a la izquierda ----------
// ¿Hay magenta en el rectángulo? Con tolerancia, porque el JPG del logo
// no devuelve el color exacto.
async function hayMagenta(png, zona) {
  const { data, info } = await sharp(png).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  let n = 0;
  for (let y = zona.y; y < zona.y + zona.alto; y++) {
    for (let x = zona.x; x < zona.x + zona.ancho; x++) {
      const i = (y * info.width + x) * info.channels;
      if (data[i] > 200 && data[i + 1] < 80 && data[i + 2] > 200) n++;
    }
  }
  return n;
}
const ZONA_PLACA = { x: 40, y: 40, ancho: 560, alto: 240 };

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
      const magenta = await hayMagenta(bytes, ZONA_PLACA);
      check(
        caso.conLogo ? "el logo (magenta) está en la placa" : "sin logo: la placa no tiene magenta",
        caso.conLogo ? magenta > 500 : magenta === 0,
        `${magenta} píxeles magenta en la zona de la placa`,
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

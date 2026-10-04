// Los adjuntos de un trabajo —el PDF o la foto del diagnóstico— y el tope
// del slug, de punta a punta, contra el stack local (regla 13: una prueba
// que nunca se vio en rojo no existe — esta se vio en rojo sobre el front
// del service de caja, sin una sola pantalla de adjuntos, y cada regla de
// los helpers se rompe sola acá abajo).
//
// Lo que cubre:
//   A · Los helpers, sin navegador: lib/adjuntos.ts (el peso, el achicado,
//       el nombre limpio, el formato por los bytes, la ruta) y los del slug
//       de lib/texto.ts. Y LAS ROTURAS: cada regla se rompe sobre una
//       copia, se recompila y la comprobación que la cubre tiene que fallar.
//   B · `anon` no lee nada: ni la tabla, ni la función, ni el bucket, por
//       la API directa.
//   C · El detalle de un trabajo FIJADO, en 390 táctil: adjuntar un PDF de
//       300 KB y una foto de 4 MB (que sale a menos de 500 KB y a 1.600 px),
//       los tres rechazos antes y después de subir, el tercero, y el cuarto
//       rechazado con su mensaje —por la pantalla y por la API directa—.
//   D · «Mostrar al cliente»: apagado por defecto, y prenderlo en uno.
//   E · La página del cliente: ve SOLO el visible, debajo del papel; el
//       enlace es la ruta —en el HTML no hay ninguna URL firmada—, que
//       redirige a una URL de 60 segundos; y la ruta contesta 404 para el
//       oculto, para otro auto, para otro lubricentro y para cualquier cosa.
//   F · Quitar uno: se va la fila y se va el archivo, y entra otro.
//   G · El clip del listado y la columna «Adjuntos» del Excel.
//   H · «Adjuntar el diagnóstico» de la pantalla de guardado.
//   I · El cierre diario barre el archivo que quedó sin fila, y no el que
//       se acaba de subir ni el que tiene la suya.
//   J · El slug: el alta y Editar de /fidelli avisan desde los 18 y no
//       dejan pasar de 32.
//   K · Todos los dispositivos (360, 390, 820, 1280): sin scroll
//       horizontal y con todo lo que se toca de 44 px.
//
// Requiere el stack local con el seed y el servidor de Next:
//   supabase start && npm run dev
// Correr:
//   node --no-warnings scripts/regresion-adjuntos.mjs
//   CAPTURAS=1 node --no-warnings scripts/regresion-adjuntos.mjs
//     (además deja las capturas en docs/capturas/adjuntos/)
//   BASE_URL=http://localhost:3900 DB_CONTAINER=supabase_db_<proyecto> …
//     (otro servidor y otro stack; las claves salen de .env.local)
//
// TOCA DATOS DEL DEMO LOCAL —le cuelga adjuntos a dos trabajos del ABC 123
// y sube archivos al bucket— y LOS QUITA AL FINAL, pase lo que pase. Lo
// único que deja es un lubricentro de prueba (`zza-…`, para el Editar del
// slug): un tenant no se borra, y `supabase db reset` es la única limpieza.
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import zlib from "node:zlib";
import { execFileSync } from "node:child_process";
import { createRequire } from "node:module";
import { chromium } from "playwright";

const RAIZ = new URL("..", import.meta.url).pathname;
const require = createRequire(import.meta.url);
const BASE = process.env.BASE_URL ?? "http://localhost:3000";
const CONTENEDOR = process.env.DB_CONTAINER ?? "supabase_db_fidelli-motors";
const DIR_CAPTURAS = process.env.CAPTURAS ? path.join(RAIZ, "docs/capturas/adjuntos") : null;
const TMP = fs.mkdtempSync(path.join(os.tmpdir(), "fm-adjuntos-"));

let fallas = 0;
const check = (nombre, cond, detalle = "") => {
  console.log(`  ${cond ? "✓" : "✗ FALLA"} ${nombre}${cond || !detalle ? "" : "  → " + detalle}`);
  if (!cond) fallas++;
};
const titulo = (t) => console.log(`\n${t}`);
const igual = (a, b) => JSON.stringify(a) === JSON.stringify(b);

// Un .xlsx es un zip de XML: se lee con lo que trae Node. Devuelve el texto
// de las celdas de cada hoja, fila por fila. (El mismo lector de
// regresion-caja.mjs.)
function hojasDelXlsx(buf) {
  const fin = buf.lastIndexOf(Buffer.from([0x50, 0x4b, 0x05, 0x06]));
  const archivos = {};
  let p = buf.readUInt32LE(fin + 16);
  for (let i = 0; i < buf.readUInt16LE(fin + 10); i++) {
    const metodo = buf.readUInt16LE(p + 10);
    const tamano = buf.readUInt32LE(p + 20);
    const largoNombre = buf.readUInt16LE(p + 28);
    const local = buf.readUInt32LE(p + 42);
    const nombre = buf.toString("utf8", p + 46, p + 46 + largoNombre);
    const inicio = local + 30 + buf.readUInt16LE(local + 26) + buf.readUInt16LE(local + 28);
    const datos = buf.subarray(inicio, inicio + tamano);
    archivos[nombre] = (metodo === 0 ? datos : zlib.inflateRawSync(datos)).toString("utf8");
    p += 46 + largoNombre + buf.readUInt16LE(p + 30) + buf.readUInt16LE(p + 32);
  }
  const limpio = (t) => t.replace(/<[^>]+>/g, "")
    .replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"').replace(/&apos;/g, "'").replace(/&amp;/g, "&");
  const compartidas = [...(archivos["xl/sharedStrings.xml"] ?? "").matchAll(/<si>([\s\S]*?)<\/si>/g)].map((m) => limpio(m[1]));
  const columna = (ref) => [...ref].reduce((n, letra) => n * 26 + letra.charCodeAt(0) - 64, 0) - 1;
  return Object.keys(archivos).filter((n) => /^xl\/worksheets\/sheet\d+\.xml$/.test(n)).sort().map((n) =>
    [...archivos[n].matchAll(/<row[^>]*>([\s\S]*?)<\/row>/g)].map((fila) => {
      const celdas = [];
      for (const c of fila[1].matchAll(/<c\b([^>]*?)(?:\/>|>([\s\S]*?)<\/c>)/g)) {
        const ref = /\br="([A-Z]+)\d+"/.exec(c[1]);
        const valor = limpio(c[2] ?? "");
        celdas[ref ? columna(ref[1]) : celdas.length] = /t="s"/.test(c[1]) ? (compartidas[Number(valor)] ?? "") : valor;
      }
      return Array.from(celdas, (v) => v ?? "");
    }));
}

// ============================================================
// A · Los helpers
// ============================================================

// Sin chequeo de tipos ni resolución de imports: los dos módulos no
// importan nada.
function cargar(archivo, reemplazos = []) {
  const ts = require(path.join(RAIZ, "node_modules/typescript"));
  let fuente = fs.readFileSync(path.join(RAIZ, archivo), "utf8");
  for (const [de, a] of reemplazos) {
    if (!fuente.includes(de)) throw new Error(`EL REEMPLAZO NO MORDIÓ: «${de}» no está en ${archivo}`);
    fuente = fuente.replace(de, a);
  }
  const { outputText } = ts.transpileModule(fuente, {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  });
  const dir = fs.mkdtempSync(path.join(TMP, "lib-"));
  const salida = path.join(dir, path.basename(archivo).replace(/\.ts$/, ".js"));
  fs.writeFileSync(salida, outputText);
  return require(salida);
}

const LUB_A = "11111111-1111-4111-8111-111111111111";
const LUB_B = "22222222-2222-4222-8222-222222222222";
const SVC_A = "33333333-3333-4333-8333-333333333333";
const SVC_B = "44444444-4444-4444-8444-444444444444";
const OBJ = "55555555-5555-4555-8555-555555555555";
const bytesDe = (...n) => new Uint8Array([...n, 0, 0, 0, 0, 0, 0, 0, 0]);

function revisarAdjuntos(m) {
  if (typeof m.mimePorCabecera !== "function") {
    return [["lib/adjuntos.ts existe", false, "no está: los adjuntos no existen en esta rama"]];
  }
  const largo = `${"a".repeat(150)}.pdf`;
  return [
    ["el tope es de 3 por trabajo y 2 MB por archivo",
      m.ADJUNTOS_MAXIMO === 3 && m.ADJUNTO_MAX_BYTES === 2097152],
    ["los formatos son PDF, JPEG y PNG, con su extensión",
      igual(m.MIMES_ADJUNTO, ["application/pdf", "image/jpeg", "image/png"]) &&
        igual(m.EXTENSION_DE_MIME, { "application/pdf": "pdf", "image/jpeg": "jpg", "image/png": "png" })],
    ["la foto se achica a 1.600 px de lado mayor, en JPEG al 80 %",
      m.FOTO_LADO_MAXIMO === 1600 && m.FOTO_CALIDAD === 0.8],
    ["una foto de 4000 × 3000 queda en 1600 × 1200, y una vertical en 1200 × 1600",
      igual(m.medidasAchicadas(4000, 3000), { ancho: 1600, alto: 1200 }) &&
        igual(m.medidasAchicadas(3000, 4000), { ancho: 1200, alto: 1600 })],
    ["una foto chica no se agranda",
      igual(m.medidasAchicadas(800, 600), { ancho: 800, alto: 600 }) &&
        igual(m.medidasAchicadas(1600, 900), { ancho: 1600, alto: 900 })],
    ["el peso se lee en KB y en MB con coma",
      m.pesoLegible(412 * 1024) === "412 KB" && m.pesoLegible(1258291) === "1,2 MB" && m.pesoLegible(300) === "300 B"],
    ["el rechazo por peso dice cuánto pesa y cuál es el máximo",
      m.mensajePesoExcedido(4.7 * 1024 * 1024) === "Pesa 4,7 MB. El máximo es 2 MB."],
    ["el nombre sale sin la carpeta, sin caracteres de control y con los espacios en uno",
      m.limpiarNombre("C:\\fotos\\Escaneo  de\tcaja.pdf") === "Escaneo de caja.pdf" &&
        m.limpiarNombre("/sdcard/DCIM/IMG_2041.jpg") === "IMG_2041.jpg" &&
        m.limpiarNombre("a\u0000b\u001f.pdf") === "ab.pdf"],
    ["un nombre vacío queda «Adjunto», y uno larguísimo se corta sin perder la extensión",
      m.limpiarNombre("   ") === "Adjunto" && m.limpiarNombre(largo).length === 120 && m.limpiarNombre(largo).endsWith(".pdf")],
    ["la foto achicada cambia de extensión: sale en JPEG",
      m.nombreDeFoto("IMG_2041.HEIC") === "IMG_2041.jpg" && m.nombreDeFoto("foto cárter.png") === "foto cárter.jpg"],
    ["para el cliente, el nombre va sin la extensión",
      m.nombreSinExtension("Escaneo de caja.pdf") === "Escaneo de caja" && m.nombreSinExtension("sin extension") === "sin extension"],
    ["el formato sale de los bytes: PDF, JPEG y PNG",
      m.mimePorCabecera(bytesDe(0x25, 0x50, 0x44, 0x46)) === "application/pdf" &&
        m.mimePorCabecera(bytesDe(0xff, 0xd8, 0xff, 0xe0)) === "image/jpeg" &&
        m.mimePorCabecera(new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])) === "image/png"],
    ["lo que no es ninguno de los tres, null (un HTML, un PNG a medias, nada)",
      m.mimePorCabecera(new TextEncoder().encode("<!doctype html>")) === null &&
        m.mimePorCabecera(bytesDe(0x89, 0x50, 0x4e, 0x47)) === null &&
        m.mimePorCabecera(new Uint8Array(0)) === null],
    ["la ruta es <tenant>/<trabajo>/<uuid>.<ext>",
      m.rutaDeAdjunto(LUB_A, SVC_A, OBJ, "image/jpeg") === `${LUB_A}/${SVC_A}/${OBJ}.jpg`],
    ["una ruta propia se reconoce por su extensión",
      m.extensionDeRutaPropia(`${LUB_A}/${SVC_A}/${OBJ}.pdf`, LUB_A, SVC_A) === "pdf"],
    ["la de OTRO tenant, no",
      m.extensionDeRutaPropia(`${LUB_B}/${SVC_A}/${OBJ}.pdf`, LUB_A, SVC_A) === null],
    ["la de OTRO trabajo, no",
      m.extensionDeRutaPropia(`${LUB_A}/${SVC_B}/${OBJ}.pdf`, LUB_A, SVC_A) === null],
    ["ni una que sube de carpeta, ni un nombre que no es un uuid, ni otra extensión",
      m.extensionDeRutaPropia(`${LUB_A}/${SVC_A}/../${OBJ}.pdf`, LUB_A, SVC_A) === null &&
        m.extensionDeRutaPropia(`${LUB_A}/${SVC_A}/diagnostico.pdf`, LUB_A, SVC_A) === null &&
        m.extensionDeRutaPropia(`${LUB_A}/${SVC_A}/${OBJ}.html`, LUB_A, SVC_A) === null],
  ];
}

function revisarSlug(m) {
  if (typeof m.avisoSlugQr !== "function") {
    return [["lib/texto.ts tiene el tope del slug", false, "no está: el slug no avisa del QR en esta rama"]];
  }
  const propuesto = m.slugSugerido("Lubricentro y Gomería Los Hermanos de la Costa");
  return [
    ["el slug tiene tope de 32 y avisa desde los 18",
      m.SLUG_MAXIMO === 32 && m.SLUG_AVISO_QR === 18],
    ["con 18 caracteres no avisa", m.avisoSlugQr("a".repeat(18)) === null],
    ["con 19 avisa, con la frase y con cuántos tiene",
      m.avisoSlugQr("a".repeat(19)) === "Con más de 18 caracteres el QR del calco pierde resistencia. Este tiene 19."],
    ["el slug propuesto desde un nombre largo entra en el tope y no termina en guion",
      propuesto.length <= 32 && propuesto.length >= 28 && !propuesto.endsWith("-") && propuesto.startsWith("lubricentro-y-gomeria"),
      propuesto],
    ["y uno corto queda como siempre", m.slugSugerido("Brothers Oil") === "brothers-oil"],
  ];
}

titulo("A · Los helpers");
for (const [archivo, revisar] of [["lib/adjuntos.ts", revisarAdjuntos], ["lib/texto.ts", revisarSlug]]) {
  let filas;
  try {
    filas = revisar(fs.existsSync(path.join(RAIZ, archivo)) ? cargar(archivo) : {});
  } catch (e) {
    filas = [[`${archivo} compila`, false, String(e.message).split("\n")[0]]];
  }
  for (const [nombre, ok, detalle] of filas) check(nombre, ok, detalle ?? "");
}

if (fs.existsSync(path.join(RAIZ, "lib/adjuntos.ts"))) {
  titulo("A · Las roturas (cada una tiene que poner en rojo su comprobación)");
  const ROTURAS = [
    ["lib/adjuntos.ts", revisarAdjuntos, "el tope de 2 MB subido a 10",
      [["export const ADJUNTO_MAX_BYTES = 2 * 1024 * 1024;", "export const ADJUNTO_MAX_BYTES = 10 * 1024 * 1024;"]],
      "el tope es de 3 por trabajo y 2 MB por archivo"],
    ["lib/adjuntos.ts", revisarAdjuntos, "el tope de 3 adjuntos subido a 4",
      [["export const ADJUNTOS_MAXIMO = 3;", "export const ADJUNTOS_MAXIMO = 4;"]],
      "el tope es de 3 por trabajo y 2 MB por archivo"],
    ["lib/adjuntos.ts", revisarAdjuntos, "el lado mayor subido a 3.200 px",
      [["export const FOTO_LADO_MAXIMO = 1600;", "export const FOTO_LADO_MAXIMO = 3200;"]],
      "la foto se achica a 1.600 px de lado mayor, en JPEG al 80 %"],
    ["lib/adjuntos.ts", revisarAdjuntos, "el achicado que agranda las fotos chicas",
      [["const escala = Math.min(1, ladoMaximo / mayor);", "const escala = ladoMaximo / mayor;"]],
      "una foto chica no se agranda"],
    ["lib/adjuntos.ts", revisarAdjuntos, "el achicado que mide solo el ancho",
      [["const mayor = Math.max(ancho, alto);", "const mayor = ancho;"]],
      "una foto de 4000 × 3000 queda en 1600 × 1200, y una vertical en 1200 × 1600"],
    ["lib/adjuntos.ts", revisarAdjuntos, "el formato que acepta cualquier cosa como PDF",
      [["  return null;\n}\n\n// ---------- La ruta del objeto", '  return "application/pdf";\n}\n\n// ---------- La ruta del objeto']],
      "lo que no es ninguno de los tres, null (un HTML, un PNG a medias, nada)"],
    ["lib/adjuntos.ts", revisarAdjuntos, "el PNG reconocido por sus primeros cuatro bytes",
      [["    bytes[0] === 0x89 && bytes[1] === 0x50 && bytes[2] === 0x4e && bytes[3] === 0x47 &&\n    bytes[4] === 0x0d && bytes[5] === 0x0a && bytes[6] === 0x1a && bytes[7] === 0x0a",
        "    bytes[0] === 0x89 && bytes[1] === 0x50 && bytes[2] === 0x4e && bytes[3] === 0x47"]],
      "lo que no es ninguno de los tres, null (un HTML, un PNG a medias, nada)"],
    ["lib/adjuntos.ts", revisarAdjuntos, "la ruta que no mira el tenant",
      [["if (!m || m[1] !== lubricentroId || m[2] !== serviceId) return null;", "if (!m || m[2] !== serviceId) return null;"]],
      "la de OTRO tenant, no"],
    ["lib/adjuntos.ts", revisarAdjuntos, "la ruta que no mira el trabajo",
      [["if (!m || m[1] !== lubricentroId || m[2] !== serviceId) return null;", "if (!m || m[1] !== lubricentroId) return null;"]],
      "la de OTRO trabajo, no"],
    ["lib/adjuntos.ts", revisarAdjuntos, "el nombre con la carpeta adentro",
      [['const sinCarpeta = nombre.split(/[\\\\/]/).pop() ?? "";', "const sinCarpeta = nombre;"]],
      "el nombre sale sin la carpeta, sin caracteres de control y con los espacios en uno"],
    ["lib/adjuntos.ts", revisarAdjuntos, "el nombre largo que pierde la extensión",
      [["return limpio.slice(0, NOMBRE_MAXIMO - extension.length).trimEnd() + extension;", "return limpio.slice(0, NOMBRE_MAXIMO);"]],
      "un nombre vacío queda «Adjunto», y uno larguísimo se corta sin perder la extensión"],
    ["lib/adjuntos.ts", revisarAdjuntos, "el peso con punto en vez de coma",
      [['return `${(bytes / 1024 / 1024).toFixed(1).replace(".", ",")} MB`;', "return `${(bytes / 1024 / 1024).toFixed(1)} MB`;"]],
      "el peso se lee en KB y en MB con coma"],
    ["lib/texto.ts", revisarSlug, "el tope del slug de vuelta en 60",
      [["export const SLUG_MAXIMO = 32;", "export const SLUG_MAXIMO = 60;"]],
      "el slug tiene tope de 32 y avisa desde los 18"],
    ["lib/texto.ts", revisarSlug, "el aviso del QR desde los 18 (y no con más de 18)",
      [["if (slug.length <= SLUG_AVISO_QR) return null;", "if (slug.length < SLUG_AVISO_QR) return null;"]],
      "con 18 caracteres no avisa"],
    ["lib/texto.ts", revisarSlug, "el slug propuesto sin recortar",
      [['return slugificar(nombre).slice(0, SLUG_MAXIMO).replace(/-+$/, "");', "return slugificar(nombre);"]],
      "el slug propuesto desde un nombre largo entra en el tope y no termina en guion"],
  ];
  for (const [archivo, revisar, nombre, reemplazos, esperada] of ROTURAS) {
    let rojas;
    try {
      rojas = revisar(cargar(archivo, reemplazos)).filter(([, ok]) => !ok).map(([n]) => n);
    } catch (e) {
      check(`rota: ${nombre}`, false, String(e.message).split("\n")[0]);
      continue;
    }
    check(`rota: ${nombre}`, rojas.includes(esperada),
      rojas.length ? `se pusieron en rojo otras: ${rojas.join(" | ")}` : "SE ESCAPÓ: ninguna comprobación la vio");
  }
}

// ============================================================
// Los datos del demo: preparar y limpiar
// ============================================================

function sql(texto) {
  return execFileSync(
    "docker",
    ["exec", "-i", CONTENEDOR, "psql", "-U", "postgres", "-d", "postgres", "-X", "-q", "-A", "-t", "-v", "ON_ERROR_STOP=1"],
    { input: texto, encoding: "utf8" },
  ).trim();
}
const hayTabla = sql("select to_regclass('public.adjuntos_trabajo') is not null") === "t";

const ENV = Object.fromEntries(
  fs.readFileSync(path.join(RAIZ, ".env.local"), "utf8").split("\n")
    .filter((l) => /^[A-Z_]+=/.test(l)).map((l) => [l.slice(0, l.indexOf("=")), l.slice(l.indexOf("=") + 1).trim()]),
);
const SUPA = ENV.NEXT_PUBLIC_SUPABASE_URL;
const ANON = ENV.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const SERVICIO = ENV.SUPABASE_SERVICE_ROLE_KEY;

const LUB = sql("select id from lubricentros where slug = 'demo'");
const OWNER = sql(`select id from usuarios where lubricentro_id = '${LUB}' and rol = 'owner' limit 1`);
const SUPER = sql("select id from usuarios where rol = 'superadmin' limit 1");

// El auto con historia: el ABC 123 del seed. Su último service —FIJADO: es
// de hace semanas— es el destacado de su página; el anterior va al
// historial.
const TRABAJOS = JSON.parse(sql(`
  select coalesce(json_agg(t), '[]') from (
    select s.id, s.fecha::text as fecha, (now() - s.created_at > interval '24 hours') as fijado
    from services s join vehiculos v on v.id = s.vehiculo_id
    where v.lubricentro_id = '${LUB}' and v.patente_normalizada = 'ABC123'
      and s.tipo = 'service' and not s.anulado
    order by s.fecha desc, s.created_at desc limit 2) t;`));
const [ULTIMO, ANTERIOR] = TRABAJOS;
// Otro auto del demo, para pedir un adjunto con la patente equivocada.
const OTRA_PATENTE = sql(`select v.patente_normalizada from vehiculos v
  where v.lubricentro_id = '${LUB}' and v.patente_normalizada <> 'ABC123' order by v.created_at limit 1`);

const tocados = [ULTIMO?.id, ANTERIOR?.id].filter(Boolean);
const enLista = (ids) => (ids.length ? ids.map((id) => `'${id}'`).join(", ") : "null");

// Los archivos del bucket no se borran desde SQL: por la API de Storage,
// con la clave de servicio.
async function borrarDelBucket(rutas) {
  if (rutas.length === 0) return;
  await fetch(`${SUPA}/storage/v1/object/adjuntos`, {
    method: "DELETE",
    headers: { apikey: SERVICIO, authorization: `Bearer ${SERVICIO}`, "content-type": "application/json" },
    body: JSON.stringify({ prefixes: rutas }),
  }).catch(() => {});
}
async function limpiar() {
  if (!hayTabla) return;
  try {
    sql(`delete from adjuntos_trabajo where service_id in (${enLista(tocados)});`);
    const rutas = sql(`select coalesce(string_agg(name, E'\\n'), '') from storage.objects
      where bucket_id = 'adjuntos' and name like '${LUB}/%'`).split("\n").filter(Boolean);
    await borrarDelBucket(rutas);
  } catch (e) {
    console.log(`  ◦ NO SE PUDO LIMPIAR: ${String(e.message).split("\n")[0]}`);
  }
}
let limpio = false;
async function limpiarUnaVez() {
  if (limpio) return;
  limpio = true;
  await limpiar();
  console.log("\n  ◦ adjuntos de prueba quitados del demo");
}
process.on("SIGINT", () => { limpiarUnaVez().finally(() => process.exit(130)); });
// Lo que haya dejado una corrida que murió.
await limpiar();

// ---------- Los archivos de prueba ----------
// Un PDF de verdad (cabecera, un objeto, EOF) llevado al peso pedido con un
// comentario de relleno: es lo que hace un escáner con una hoja en blanco.
function pdfDe(bytes) {
  const cabeza = Buffer.from("%PDF-1.4\n1 0 obj\n<< /Type /Catalog >>\nendobj\n%");
  const cola = Buffer.from("\ntrailer\n<< /Root 1 0 R >>\n%%EOF\n");
  return Buffer.concat([cabeza, Buffer.alloc(bytes - cabeza.length - cola.length, 0x20), cola]);
}
const archivo = (nombre, contenido) => {
  const ruta = path.join(TMP, nombre);
  fs.writeFileSync(ruta, contenido);
  return ruta;
};
const PDF_300 = archivo("Escaneo de caja.pdf", pdfDe(300 * 1024));
const PDF_GRANDE = archivo("Manual del taller.pdf", pdfDe(Math.round(2.5 * 1024 * 1024)));
const TEXTO = archivo("notas.txt", "esto no es un PDF ni una foto\n");
const PDF_FALSO = archivo("Informe.pdf", "<!doctype html><html><body>esto dice ser un PDF</body></html>\n");

// La API directa, con el token del owner del demo.
async function tokenDelOwner() {
  const login = await fetch(`${SUPA}/auth/v1/token?grant_type=password`, {
    method: "POST",
    headers: { apikey: ANON, "content-type": "application/json" },
    body: JSON.stringify({ email: "demo@fidellimotors.app", password: "demo1234" }),
  }).then((r) => r.json());
  return login.access_token;
}
async function api(ruta, { metodo = "GET", token = ANON, cuerpo, cabeceras = {} } = {}) {
  const r = await fetch(`${SUPA}${ruta}`, {
    method: metodo,
    headers: {
      apikey: ANON,
      authorization: `Bearer ${token}`,
      ...(cuerpo ? { "content-type": "application/json" } : {}),
      ...cabeceras,
    },
    body: cuerpo ? JSON.stringify(cuerpo) : undefined,
  });
  const texto = await r.text();
  let json = null;
  try { json = JSON.parse(texto); } catch { /* no es JSON */ }
  return { status: r.status, json, texto };
}

const filasDe = (serviceId) => JSON.parse(sql(`
  select coalesce(json_agg(a order by a.created_at, a.id), '[]') from (
    select id, nombre, ruta, mime, bytes, visible_cliente, lubricentro_id, subido_por, created_at
    from adjuntos_trabajo where service_id = '${serviceId}') a;`));
// El día en que se subió un adjunto, como lo muestra la pantalla (hora
// argentina). No es «hoy»: una corrida que cruza la medianoche adjunta un
// día y mira al siguiente.
const diaDeSubida = (id) => sql(
  `select to_char(created_at at time zone 'America/Argentina/Buenos_Aires', 'DD/MM/YYYY') from adjuntos_trabajo where id = '${id}'`);
const objetosDe = (serviceId) => Number(sql(
  `select count(*) from storage.objects where bucket_id = 'adjuntos' and name like '${LUB}/${serviceId}/%'`));

// ============================================================
// B a K · Las pantallas
// ============================================================

const navegador = await chromium.launch({ args: ["--lang=es-AR"] });
if (DIR_CAPTURAS) fs.mkdirSync(DIR_CAPTURAS, { recursive: true });

async function paso(nombre, fn) {
  try {
    await fn();
  } catch (e) {
    check(nombre, false, String(e.message ?? e).split("\n")[0]);
  }
}

try {
  if (!ULTIMO || !ANTERIOR) throw new Error("el seed no tiene el ABC 123 con dos services: supabase db reset");

  async function entrar(email) {
    const ctx = await navegador.newContext();
    const p = await ctx.newPage();
    await p.goto(`${BASE}/login`, { waitUntil: "networkidle" });
    await p.fill('input[name="email"]', email);
    await p.fill('input[name="password"]', "demo1234");
    await p.click('button[type="submit"]');
    // Generoso: en frío, `next dev` compila el panel entero en el primer pedido.
    await p.waitForURL(/\/(panel|fidelli)/, { timeout: 90_000 });
    const estado = await ctx.storageState();
    await ctx.close();
    return estado;
  }
  const sesion = await entrar("demo@fidellimotors.app");
  const sesionFidelli = await entrar("santi@fidellimotors.app");

  async function abrir(vista, estado = sesion) {
    const tactil = vista.width < 768;
    const ctx = await navegador.newContext({
      viewport: vista,
      deviceScaleFactor: 2,
      locale: "es-AR",
      hasTouch: tactil,
      isMobile: tactil,
      storageState: estado ?? undefined,
    });
    // Generosos los dos: con la máquina cargada, `next dev` y el stack
    // local tardan a veces veinte segundos en contestar una página.
    ctx.setDefaultTimeout(30_000);
    // Las navegaciones, más: en frío `next dev` compila la ruta al pedirla.
    ctx.setDefaultNavigationTimeout(90_000);
    const page = await ctx.newPage();
    const tocar = (locator) => (tactil ? locator.tap() : locator.click());
    return { ctx, page, tocar };
  }

  // La ventana se estira al alto del documento: así las barras fijas no
  // quedan estampadas en el medio de la captura.
  async function capturar(page, nombre, de = null) {
    if (!DIR_CAPTURAS) return;
    await page.addStyleTag({ content: "nextjs-portal { display: none !important; }" });
    await page.evaluate(() => document.activeElement instanceof HTMLElement && document.activeElement.blur());
    const vista = page.viewportSize();
    const alto = await page.evaluate(() => document.documentElement.scrollHeight);
    await page.setViewportSize({ width: vista.width, height: alto });
    await page.evaluate(() => window.scrollTo(0, 0));
    await page.waitForTimeout(500);
    const destino = path.join(DIR_CAPTURAS, `${nombre}.png`);
    if (de) await de.screenshot({ path: destino });
    else await page.screenshot({ path: destino });
    await page.setViewportSize(vista);
    console.log(`  ◦ captura ${nombre}.png`);
  }

  // La página del cliente sale de UNA llamada a get_carton, y si esa
  // llamada falla la página contesta 404 (no distingue «no existe» de «no
  // contestó»). Con el stack recién reseteado o la máquina cargada puede
  // pasar una vez: se reintenta SOLO ante un status que no es 200, y se
  // dice. Un 200 sin el adjunto es una falla de verdad y no se reintenta.
  async function irAlCliente(page, ruta = "/demo/ABC123") {
    let respuesta = null;
    for (let intento = 1; intento <= 3; intento++) {
      respuesta = await page.goto(`${BASE}${ruta}`, { waitUntil: "networkidle" });
      if (respuesta?.status() === 200) break;
      console.log(`  ◦ ${ruta} contestó ${respuesta?.status()} (intento ${intento}): se vuelve a pedir`);
      await page.waitForTimeout(1500);
    }
    return respuesta;
  }

  const seccion = (page) => page.locator("section#adjuntos");
  const filas = (page) => seccion(page).locator("li[data-adjunto]");
  const campo = (page) => seccion(page).locator('input[type="file"]');
  const alerta = (page) => seccion(page).locator('[role="alert"]');
  const fila = (page, nombre) => filas(page).filter({ hasText: nombre });
  // Adjunta y espera a que la sección termine: una fila más, o un aviso.
  async function adjuntar(page, ruta) {
    const antes = await filas(page).count();
    await campo(page).setInputFiles(ruta);
    await page.waitForFunction((n) => {
      const s = document.querySelector("section#adjuntos");
      if (!s) return false;
      const boton = [...s.querySelectorAll("button")].find((b) => /Adjuntar PDF o foto|Achicando|Subiendo/.test(b.textContent ?? ""));
      const ocupado = boton && /Achicando|Subiendo/.test(boton.textContent ?? "");
      return !ocupado && (s.querySelectorAll("li[data-adjunto]").length > n || s.querySelector('[role="alert"]'));
    }, antes, { timeout: 90_000 });
  }

  // ------------------------------------------------------------
  titulo("B · `anon` no lee nada, por la API directa");
  await paso("anon", async () => {
    const tabla = await api("/rest/v1/adjuntos_trabajo?select=id,ruta&limit=1");
    check("la tabla: sin lectura (42501)", tabla.status >= 400 && tabla.json?.code === "42501",
      `status ${tabla.status}, ${tabla.texto.slice(0, 120)}`);
    const funcion = await api("/rest/v1/rpc/adjunto_publico", {
      metodo: "POST",
      cuerpo: { p_id: "00000000-0000-4000-8000-000000000000", p_slug: "demo", p_patente: "ABC123" },
    });
    check("adjunto_publico(): no la ejecuta", funcion.status >= 400 && funcion.status !== 404 ? funcion.json?.code === "42501" : false,
      `status ${funcion.status}, ${funcion.texto.slice(0, 120)}`);
    const lista = await api("/storage/v1/object/list/adjuntos", {
      metodo: "POST", cuerpo: { prefix: LUB, limit: 10 },
    });
    check("el bucket: listar la carpeta del demo no devuelve nada",
      lista.status >= 400 || (Array.isArray(lista.json) && lista.json.length === 0),
      `status ${lista.status}, ${lista.texto.slice(0, 120)}`);
  });

  // ------------------------------------------------------------
  titulo("C · El detalle de un trabajo fijado: adjuntar, en 390 táctil");
  let fotoGrande = null;
  let idPdf = null;
  await paso("adjuntar", async () => {
    check("el trabajo de la prueba está FIJADO (pasó su plazo de edición)", ULTIMO.fijado === true, JSON.stringify(ULTIMO));
    const { ctx, page } = await abrir({ width: 390, height: 844 });
    await page.goto(`${BASE}/panel/services/${ULTIMO.id}`, { waitUntil: "networkidle" });
    check("la pantalla dice «Registro fijado»", (await page.getByText("Registro fijado").count()) >= 1);
    check("y no ofrece Editar", (await page.getByRole("link", { name: "Editar" }).count()) === 0);
    check("y aun así tiene la sección Adjuntos", (await seccion(page).count()) === 1);
    check("con el botón «+ Adjuntar PDF o foto»",
      (await seccion(page).getByRole("button", { name: "+ Adjuntar PDF o foto" }).count()) === 1);
    check("el campo acepta PDF e imágenes, y no fuerza la cámara",
      (await campo(page).getAttribute("accept")) === "application/pdf,image/*" &&
        (await campo(page).getAttribute("capture")) === null);
    check("vacía, dice qué se puede sumar",
      /Todavía no hay archivos/.test(await seccion(page).innerText()));

    // --- el PDF de 300 KB ---
    await adjuntar(page, PDF_300);
    check("el PDF de 300 KB queda en la lista, con su nombre", (await fila(page, "Escaneo de caja.pdf").count()) === 1,
      (await alerta(page).innerText().catch(() => "")) || (await seccion(page).innerText()).slice(0, 200));
    const textoPdf = (await fila(page, "Escaneo de caja.pdf").innerText().catch(() => "")).replace(/\s+/g, " ");
    let enBase = filasDe(ULTIMO.id);
    idPdf = enBase[0]?.id ?? null;
    check("con su peso y el día en que se subió",
      textoPdf.includes("300 KB") && Boolean(idPdf) && textoPdf.includes(diaDeSubida(idPdf)), textoPdf);
    check("en la base: PDF, con el peso del archivo, en el tenant del trabajo y a nombre del owner",
      enBase.length === 1 && enBase[0].mime === "application/pdf" && enBase[0].bytes === 300 * 1024 &&
        enBase[0].lubricentro_id === LUB && enBase[0].subido_por === OWNER, JSON.stringify(enBase));
    check("y OCULTO para el cliente", enBase[0]?.visible_cliente === false);
    check("el archivo está en la carpeta del trabajo",
      new RegExp(`^${LUB}/${ULTIMO.id}/[0-9a-f-]{36}\\.pdf$`).test(enBase[0]?.ruta ?? "") && objetosDe(ULTIMO.id) === 1,
      enBase[0]?.ruta);
    check("el interruptor «Mostrar al cliente» nace apagado",
      (await fila(page, "Escaneo de caja.pdf").getByRole("switch").getAttribute("aria-checked")) === "false");

    // --- la foto de 4 MB ---
    const base64 = await page.evaluate(async () => {
      const ancho = 4000, alto = 3000, ruido = 6;
      const c = document.createElement("canvas"); c.width = ancho; c.height = alto;
      const x = c.getContext("2d");
      const g = x.createLinearGradient(0, 0, ancho, alto);
      g.addColorStop(0, "#31455c"); g.addColorStop(0.5, "#b9a27c"); g.addColorStop(1, "#3d3a36");
      x.fillStyle = g; x.fillRect(0, 0, ancho, alto);
      for (let i = 0; i < 40; i++) {
        x.fillStyle = `hsl(${(i * 37) % 360} 30% ${30 + (i % 40)}%)`;
        x.fillRect((i * 197) % ancho, (i * 313) % alto, 300 + i * 11, 200 + i * 7);
      }
      // El grano del sensor: es lo que hace pesar a una foto de celular.
      const d = x.getImageData(0, 0, ancho, alto); const px = d.data; let s = 12345;
      for (let i = 0; i < px.length; i += 4) {
        s = (s * 1103515245 + 12345) & 0x7fffffff;
        const r = ((s >> 16) % (2 * ruido + 1)) - ruido;
        px[i] += r; px[i + 1] += r; px[i + 2] += r;
      }
      x.putImageData(d, 0, 0);
      const blob = await new Promise((r) => c.toBlob(r, "image/jpeg", 0.97));
      const buf = new Uint8Array(await blob.arrayBuffer());
      let bin = "";
      for (let i = 0; i < buf.length; i += 0x8000) bin += String.fromCharCode.apply(null, buf.subarray(i, i + 0x8000));
      return btoa(bin);
    });
    fotoGrande = archivo("IMG_2041.jpg", Buffer.from(base64, "base64"));
    const pesoFoto = fs.statSync(fotoGrande).size;
    check("la foto de prueba pesa 4 MB o más (4000 × 3000)", pesoFoto >= 4 * 1024 * 1024, `${pesoFoto} bytes`);

    await adjuntar(page, fotoGrande);
    check("la foto de 4 MB entra (no se rechaza por pesada: se achica)", (await fila(page, "IMG_2041.jpg").count()) === 1,
      (await alerta(page).innerText().catch(() => "")));
    enBase = filasDe(ULTIMO.id);
    const foto = enBase.find((a) => a.nombre === "IMG_2041.jpg");
    check("sale a menos de 500 KB, en JPEG", Boolean(foto) && foto.mime === "image/jpeg" && foto.bytes < 500 * 1024,
      JSON.stringify(foto));
    check("la fila muestra su miniatura", (await fila(page, "IMG_2041.jpg").locator("img").count()) === 1);
    check("y el PDF, su ícono (sin miniatura)", (await fila(page, "Escaneo de caja.pdf").locator("img").count()) === 0);
    // Lo que quedó en el bucket, bajado con la URL firmada de la fila.
    const urlFoto = await fila(page, "IMG_2041.jpg").locator("a").first().getAttribute("href");
    const medidas = await page.evaluate(async (url) => {
      const r = await fetch(url);
      if (!r.ok) return { status: r.status };
      const blob = await r.blob();
      const mapa = await createImageBitmap(blob);
      return { status: r.status, tipo: blob.type, ancho: mapa.width, alto: mapa.height, bytes: blob.size };
    }, urlFoto);
    check("el archivo del bucket mide 1600 × 1200 (el lado mayor a 1.600, la proporción intacta)",
      medidas.ancho === 1600 && medidas.alto === 1200 && medidas.bytes === foto?.bytes, JSON.stringify(medidas));

    // --- lo que se rechaza ANTES de subir ---
    await adjuntar(page, PDF_GRANDE);
    check("un PDF de 2,5 MB se rechaza antes de subir, con lo que pesa",
      (await alerta(page).innerText().catch(() => "")).includes("Pesa 2,5 MB. El máximo es 2 MB."),
      await alerta(page).innerText().catch(() => "sin aviso"));
    await adjuntar(page, TEXTO);
    check("un .txt se rechaza: ni PDF ni foto",
      /no es un PDF ni una foto/.test(await alerta(page).innerText().catch(() => "")),
      await alerta(page).innerText().catch(() => "sin aviso"));
    check("y ninguno de los dos dejó nada: dos filas, dos archivos",
      filasDe(ULTIMO.id).length === 2 && objetosDe(ULTIMO.id) === 2,
      `${filasDe(ULTIMO.id).length} filas, ${objetosDe(ULTIMO.id)} archivos`);

    // --- lo que se rechaza DESPUÉS de subir: los bytes mandan ---
    await adjuntar(page, PDF_FALSO);
    check("un HTML con nombre de PDF sube, y el servidor lo rechaza por sus bytes",
      /no es un PDF ni una foto/.test(await alerta(page).innerText().catch(() => "")),
      await alerta(page).innerText().catch(() => "sin aviso"));
    check("sin crear la fila y BORRANDO el archivo del bucket",
      filasDe(ULTIMO.id).length === 2 && objetosDe(ULTIMO.id) === 2,
      `${filasDe(ULTIMO.id).length} filas, ${objetosDe(ULTIMO.id)} archivos`);

    // --- el tercero: un PNG con transparencia, que sale en JPEG ---
    const png64 = await page.evaluate(async () => {
      const c = document.createElement("canvas"); c.width = 900; c.height = 600;
      const x = c.getContext("2d");
      x.fillStyle = "#b45309"; x.beginPath(); x.arc(450, 300, 220, 0, Math.PI * 2); x.fill();
      x.fillStyle = "#0a0a0a"; x.font = "bold 64px sans-serif"; x.fillText("Cárter", 340, 320);
      return c.toDataURL("image/png").split(",")[1];
    });
    await adjuntar(page, archivo("Foto cárter.png", Buffer.from(png64, "base64")));
    enBase = filasDe(ULTIMO.id);
    const png = enBase.find((a) => a.nombre === "Foto cárter.jpg");
    check("el tercero entra: un PNG que se achica a JPEG y cambia de extensión",
      enBase.length === 3 && Boolean(png) && png.mime === "image/jpeg", JSON.stringify(enBase.map((a) => [a.nombre, a.mime])));
    const texto3 = (await seccion(page).innerText()).replace(/\s+/g, " ");
    check("la sección dice «3 de 3» y que ya no entra otro",
      texto3.includes("3 de 3") && texto3.includes("Este trabajo ya tiene 3 adjuntos"), texto3.slice(0, 220));
    check("y el botón queda apagado",
      await seccion(page).getByRole("button", { name: "+ Adjuntar PDF o foto" }).isDisabled());

    // --- el cuarto: rechazado, con su mensaje ---
    await adjuntar(page, archivo("El cuarto.pdf", pdfDe(20 * 1024)));
    check("el cuarto, forzado por la pantalla, se rechaza con el mensaje",
      (await alerta(page).innerText().catch(() => "")).includes("Este trabajo ya tiene 3 adjuntos. Quitá uno para sumar otro."),
      await alerta(page).innerText().catch(() => "sin aviso"));
    const token = await tokenDelOwner();
    const cuarto = await api("/rest/v1/adjuntos_trabajo", {
      metodo: "POST", token,
      cuerpo: { service_id: ULTIMO.id, nombre: "Por la API.pdf", ruta: `${LUB}/${ULTIMO.id}/${crypto.randomUUID()}.pdf`, mime: "application/pdf", bytes: 1000 },
    });
    check("y por la API directa lo frena la base: tope_adjuntos",
      cuarto.status >= 400 && /tope_adjuntos/.test(cuarto.texto), `status ${cuarto.status}, ${cuarto.texto.slice(0, 140)}`);
    check("siguen siendo tres filas y tres archivos",
      filasDe(ULTIMO.id).length === 3 && objetosDe(ULTIMO.id) === 3,
      `${filasDe(ULTIMO.id).length} filas, ${objetosDe(ULTIMO.id)} archivos`);
    // Lo que el navegador no puede mandar, aunque el trabajo tenga lugar.
    const visible = await api("/rest/v1/adjuntos_trabajo", {
      metodo: "POST", token,
      cuerpo: { service_id: ANTERIOR.id, nombre: "Visible de entrada.pdf", ruta: `${LUB}/${ANTERIOR.id}/${crypto.randomUUID()}.pdf`, mime: "application/pdf", bytes: 1000, visible_cliente: true },
    });
    check("un adjunto no puede NACER visible, ni por la API directa (42501)",
      visible.status >= 400 && visible.json?.code === "42501", `status ${visible.status}, ${visible.texto.slice(0, 140)}`);
    const editar = await api(`/rest/v1/adjuntos_trabajo?id=eq.${idPdf}`, {
      metodo: "PATCH", token, cuerpo: { nombre: "Renombrado.pdf" },
    });
    check("ni se le puede cambiar el nombre: lo único que se edita es «Mostrar al cliente» (42501)",
      editar.status >= 400 && editar.json?.code === "42501", `status ${editar.status}, ${editar.texto.slice(0, 140)}`);
    await ctx.close();
  });

  // ------------------------------------------------------------
  titulo("D · «Mostrar al cliente»");
  await paso("mostrar al cliente", async () => {
    const { ctx, page, tocar } = await abrir({ width: 390, height: 844 });
    await page.goto(`${BASE}/panel/services/${ULTIMO.id}`, { waitUntil: "networkidle" });
    const interruptores = await filas(page).getByRole("switch").evaluateAll((bs) => bs.map((b) => b.getAttribute("aria-checked")));
    check("los tres interruptores están apagados", igual(interruptores, ["false", "false", "false"]), JSON.stringify(interruptores));
    await tocar(fila(page, "Escaneo de caja.pdf").getByRole("switch"));
    await page.waitForFunction((id) =>
      document.querySelector(`li[data-adjunto="${id}"] [role="switch"]`)?.getAttribute("aria-checked") === "true", idPdf);
    await page.waitForTimeout(1200);
    const enBase = filasDe(ULTIMO.id);
    check("prender el del PDF lo deja visible en la base, y a los otros dos como estaban",
      igual(enBase.map((a) => [a.nombre, a.visible_cliente]),
        [["Escaneo de caja.pdf", true], ["IMG_2041.jpg", false], ["Foto cárter.jpg", false]]),
      JSON.stringify(enBase.map((a) => [a.nombre, a.visible_cliente])));
    await page.reload({ waitUntil: "networkidle" });
    check("y al recargar sigue prendido",
      (await fila(page, "Escaneo de caja.pdf").getByRole("switch").getAttribute("aria-checked")) === "true");
    await capturar(page, "detalle-390");
    await ctx.close();

    const ancho = await abrir({ width: 1280, height: 800 });
    await ancho.page.goto(`${BASE}/panel/services/${ULTIMO.id}`, { waitUntil: "networkidle" });
    check("a 1280 la sección va al lado del papel, no debajo",
      await ancho.page.evaluate(() => {
        const papel = document.querySelector("[data-papel]");
        const s = document.querySelector("section#adjuntos");
        return Boolean(papel && s) && s.getBoundingClientRect().left >= papel.getBoundingClientRect().right;
      }));
    await capturar(ancho.page, "detalle-1280");
    await ancho.ctx.close();
  });

  // ------------------------------------------------------------
  titulo("E · La página del cliente y la ruta del adjunto");
  await paso("el cliente", async () => {
    // Un visible también en el trabajo ANTERIOR, que va al historial.
    const rutaHistorial = `${LUB}/${ANTERIOR.id}/${crypto.randomUUID()}.pdf`;
    const idHistorial = sql(`insert into adjuntos_trabajo (service_id, nombre, ruta, mime, bytes, visible_cliente)
      values ('${ANTERIOR.id}', 'Informe de frenos.pdf', '${rutaHistorial}', 'application/pdf', 2048, true) returning id;`);

    const { ctx, page } = await abrir({ width: 390, height: 844 }, null);
    const respuesta = await irAlCliente(page);
    const html = await respuesta.text();
    const enlaces = page.locator("a[data-adjunto-cliente]");
    const ids = await enlaces.evaluateAll((as) => as.map((a) => a.getAttribute("data-adjunto-cliente")));
    check("el cliente ve DOS adjuntos: el que se prendió y el del historial; ninguno de los ocultos",
      igual([...ids].sort(), [idPdf, idHistorial].sort()), JSON.stringify(ids));
    const linea = (await page.locator(`a[data-adjunto-cliente="${idPdf}"]`).innerText().catch(() => "")).replace(/\s+/g, " ");
    check("la línea dice «Diagnóstico adjunto», el nombre sin extensión, el formato y el día en que se subió, y «Ver»",
      linea.includes("Diagnóstico adjunto") && linea.includes(`Escaneo de caja · PDF · ${diaDeSubida(idPdf)}`) && /Ver/.test(linea), linea);
    check("los nombres de los ocultos no viajan al HTML", !html.includes("IMG_2041") && !html.includes("Foto cárter"));
    check("el enlace es la ruta del adjunto, no una URL del archivo",
      (await page.locator(`a[data-adjunto-cliente="${idPdf}"]`).getAttribute("href")) === `/demo/ABC123/adjunto/${idPdf}`);
    check("en el HTML no hay ninguna URL firmada ni ninguna ruta del bucket",
      !/token=|storage\/v1|\/object\/sign/.test(html) && !html.includes(`${LUB}/${ULTIMO.id}`));
    // Debajo del papel, nunca adentro.
    const posiciones = await page.evaluate((id) => {
      const a = document.querySelector(`a[data-adjunto-cliente="${id}"]`);
      const papeles = [...document.querySelectorAll("[data-papel]")];
      const papel = papeles.find((p) => !p.closest("details")) ?? papeles[0];
      return {
        adentro: papeles.some((p) => p.contains(a)),
        debajo: Boolean(a && papel) && a.getBoundingClientRect().top >= papel.getBoundingClientRect().bottom - 1,
      };
    }, idPdf);
    check("va debajo del papel destacado, nunca adentro", posiciones.debajo && !posiciones.adentro, JSON.stringify(posiciones));
    const enHistorial = await page.evaluate((id) => {
      const a = document.querySelector(`a[data-adjunto-cliente="${id}"]`);
      const li = a?.closest("ul")?.closest("li");
      const detalle = li?.querySelector("details");
      return { enEntrada: Boolean(detalle), abierto: detalle?.open ?? null, aLaVista: Boolean(a && a.getBoundingClientRect().height > 0), adentroDelDetalle: Boolean(detalle?.contains(a)) };
    }, idHistorial);
    check("el del historial va en SU entrada, a la vista aunque el papel esté cerrado",
      enHistorial.enEntrada && enHistorial.abierto === false && enHistorial.aLaVista && !enHistorial.adentroDelDetalle,
      JSON.stringify(enHistorial));
    check("sin scroll horizontal",
      await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth));
    await capturar(page, "cliente-390", page.locator("main"));

    // --- abrir el link ---
    const ruta = `${BASE}/demo/ABC123/adjunto/${idPdf}`;
    const salto = await page.request.get(ruta, { maxRedirects: 0 });
    const destino = salto.headers()["location"] ?? "";
    check("la ruta contesta 302 a una URL firmada del bucket", salto.status() === 302 && /\/object\/sign\/adjuntos\/.+token=/.test(destino),
      `status ${salto.status()}, ${destino.slice(0, 120)}`);
    check("sin caché y sin indexar",
      /no-store/.test(salto.headers()["cache-control"] ?? "") && /noindex/.test(salto.headers()["x-robots-tag"] ?? ""),
      JSON.stringify({ c: salto.headers()["cache-control"], r: salto.headers()["x-robots-tag"] }));
    const jwt = /token=([^&]+)/.exec(destino)?.[1] ?? "";
    const carga = JSON.parse(Buffer.from(jwt.split(".")[1] ?? "", "base64url").toString("utf8") || "{}");
    check("la firma vence a los 60 segundos", carga.exp - carga.iat === 60, JSON.stringify(carga));
    const archivoBajado = await page.request.get(ruta);
    const cuerpo = await archivoBajado.body();
    check("y siguiéndola llega el PDF entero",
      archivoBajado.ok() && /application\/pdf/.test(archivoBajado.headers()["content-type"] ?? "") &&
        cuerpo.length === 300 * 1024 && cuerpo.subarray(0, 4).toString() === "%PDF",
      `status ${archivoBajado.status()}, ${archivoBajado.headers()["content-type"]}, ${cuerpo.length} bytes`);

    // --- lo que la ruta NO entrega ---
    const oculto = filasDe(ULTIMO.id).find((a) => a.nombre === "IMG_2041.jpg");
    const estado = async (url) => (await page.request.get(`${BASE}${url}`, { maxRedirects: 0 })).status();
    check("un adjunto OCULTO: 404", (await estado(`/demo/ABC123/adjunto/${oculto.id}`)) === 404);
    check("el visible, pedido con la patente de OTRO auto: 404", (await estado(`/demo/${OTRA_PATENTE}/adjunto/${idPdf}`)) === 404);
    check("pedido con el slug de un lubricentro que no existe: 404", (await estado(`/no-existe/ABC123/adjunto/${idPdf}`)) === 404);
    check("un id que no existe: 404", (await estado(`/demo/ABC123/adjunto/${crypto.randomUUID()}`)) === 404);
    check("algo que no es un id: 404", (await estado(`/demo/ABC123/adjunto/no-es-un-uuid`)) === 404);
    const noDisponible = await page.request.get(`${BASE}/demo/ABC123/adjunto/${oculto.id}`);
    check("y el 404 se entiende: dice que el archivo no está y ofrece volver al historial",
      /ya no está disponible/.test(await noDisponible.text()) && (await noDisponible.text()).includes('href="/demo/ABC123"'));
    check("con la patente como la escribe la gente también llega (ab 123)",
      (await estado(`/demo/${encodeURIComponent("abc 123")}/adjunto/${idPdf}`)) === 302);
    const directo = await api(`/storage/v1/object/adjuntos/${filasDe(ULTIMO.id)[0].ruta}`);
    check("el archivo del visible, pedido directo al bucket como anon: no",
      directo.status >= 400, `status ${directo.status}`);

    // --- apagarlo lo saca de las dos puertas ---
    sql(`update adjuntos_trabajo set visible_cliente = false where id = '${idPdf}';`);
    check("al apagar «Mostrar al cliente» la ruta pasa a 404", (await estado(`/demo/ABC123/adjunto/${idPdf}`)) === 404);
    await page.reload({ waitUntil: "networkidle" });
    check("y la página del cliente deja de listarlo",
      (await page.locator(`a[data-adjunto-cliente="${idPdf}"]`).count()) === 0 &&
        (await page.locator(`a[data-adjunto-cliente="${idHistorial}"]`).count()) === 1);
    sql(`update adjuntos_trabajo set visible_cliente = true where id = '${idPdf}';
         delete from adjuntos_trabajo where id = '${idHistorial}';`);
    await ctx.close();
  });

  // ------------------------------------------------------------
  titulo("F · Quitar uno");
  await paso("quitar", async () => {
    const { ctx, page } = await abrir({ width: 1280, height: 800 });
    await page.goto(`${BASE}/panel/services/${ULTIMO.id}`, { waitUntil: "networkidle" });
    const foto = filasDe(ULTIMO.id).find((a) => a.nombre === "IMG_2041.jpg");
    await fila(page, "IMG_2041.jpg").getByRole("button", { name: "Quitar IMG_2041.jpg" }).click();
    const dialogo = page.getByRole("dialog");
    check("quitar pide confirmación, y dice que el cartón no cambia",
      /¿Quitar este adjunto\?/.test(await dialogo.innerText()) && /El trabajo y su cartón no cambian/.test(await dialogo.innerText()),
      (await dialogo.innerText().catch(() => "")).slice(0, 200));
    await dialogo.getByRole("button", { name: "Sí, quitar" }).click();
    await page.waitForFunction(() => document.querySelectorAll("section#adjuntos li[data-adjunto]").length === 2, null, { timeout: 60_000 });
    check("la fila se fue de la pantalla y de la base",
      (await fila(page, "IMG_2041.jpg").count()) === 0 && !filasDe(ULTIMO.id).some((a) => a.id === foto.id));
    check("y el archivo se fue del bucket",
      sql(`select count(*) from storage.objects where bucket_id = 'adjuntos' and name = '${foto.ruta}'`) === "0" && objetosDe(ULTIMO.id) === 2);
    check("con dos, el botón de adjuntar vuelve a estar prendido",
      await seccion(page).getByRole("button", { name: "+ Adjuntar PDF o foto" }).isEnabled());
    check("el trabajo sigue fijado: quitar un adjunto no tocó el cartón",
      (await page.getByText("Registro fijado").count()) >= 1);
    await ctx.close();
  });

  // ------------------------------------------------------------
  titulo("G · El listado y la exportación");
  await paso("listado y exportación", async () => {
    const { ctx, page } = await abrir({ width: 1280, height: 800 });
    await page.goto(`${BASE}/panel/services?q=ABC123`, { waitUntil: "networkidle" });
    const conClip = page.locator(`a[href="/panel/services/${ULTIMO.id}"]`);
    const sinClip = page.locator(`a[href="/panel/services/${ANTERIOR.id}"]`);
    check("la fila del trabajo con adjuntos lleva el clip, y dice cuántos",
      (await conClip.getByRole("img", { name: "Tiene 2 adjuntos" }).count()) === 1);
    check("la del trabajo sin adjuntos, no", (await sinClip.getByRole("img", { name: /adjunto/ }).count()) === 0);

    const r = await page.request.get(`${BASE}/panel/services/exportar?q=ABC123`);
    const [trabajos] = r.ok() ? hojasDelXlsx(Buffer.from(await r.body())) : [];
    const cabecera = trabajos?.[0] ?? [];
    const col = cabecera.indexOf("Adjuntos");
    const idCol = cabecera.indexOf("ID de trabajo");
    const porId = Object.fromEntries((trabajos ?? []).slice(1).map((f) => [f[idCol], f[col]]));
    check("el Excel tiene la columna «Adjuntos»", col > 0, JSON.stringify(cabecera));
    check("con la cantidad: 2 en el trabajo que los tiene y 0 en el que no",
      porId[ULTIMO.id] === "2" && porId[ANTERIOR.id] === "0", JSON.stringify([porId[ULTIMO.id], porId[ANTERIOR.id]]));
    await ctx.close();
  });

  // ------------------------------------------------------------
  titulo("H · «Adjuntar el diagnóstico», desde la pantalla de guardado");
  await paso("guardado", async () => {
    const { ctx, page, tocar } = await abrir({ width: 390, height: 844 });
    await page.goto(`${BASE}/panel/services/${ANTERIOR.id}/guardado`, { waitUntil: "networkidle" });
    const boton = page.getByRole("link", { name: "Adjuntar el diagnóstico" });
    check("la pantalla de guardado ofrece «Adjuntar el diagnóstico»", (await boton.count()) === 1);
    check("como botón secundario: el primario sigue siendo «+ Nuevo trabajo»",
      await page.evaluate(() => {
        const a = [...document.querySelectorAll("a")];
        const nuevo = a.find((x) => x.textContent?.trim() === "+ Nuevo trabajo");
        const adj = a.find((x) => x.textContent?.trim() === "Adjuntar el diagnóstico");
        return Boolean(nuevo && adj) && getComputedStyle(nuevo).backgroundColor !== getComputedStyle(adj).backgroundColor
          && adj.getBoundingClientRect().height >= 44;
      }));
    await tocar(boton);
    await page.waitForURL(new RegExp(`/panel/services/${ANTERIOR.id}\\?adjuntar=1`), { timeout: 90_000 });
    await page.waitForLoadState("networkidle");
    await page.waitForTimeout(600);
    const llegada = await page.evaluate(() => {
      const s = document.querySelector("section#adjuntos");
      const r = s?.getBoundingClientRect();
      return { aLaVista: Boolean(r) && r.top >= -4 && r.top < window.innerHeight * 0.6, foco: document.activeElement?.textContent?.trim() ?? "" };
    });
    check("lleva al detalle con la sección Adjuntos a la vista y el foco en su botón",
      llegada.aLaVista && llegada.foco === "+ Adjuntar PDF o foto", JSON.stringify(llegada));
    await ctx.close();
  });

  // ------------------------------------------------------------
  titulo("I · El cierre diario barre los archivos sin fila");
  await paso("cierre diario", async () => {
    // Tres archivos en la carpeta del trabajo anterior, subidos por la API
    // con la clave de servicio: uno viejo sin fila, uno recién subido sin
    // fila, y el del PDF, que tiene la suya.
    const subir = async (nombre) => {
      const r = await fetch(`${SUPA}/storage/v1/object/adjuntos/${LUB}/${ANTERIOR.id}/${nombre}`, {
        method: "POST",
        headers: { apikey: SERVICIO, authorization: `Bearer ${SERVICIO}`, "content-type": "application/pdf" },
        body: pdfDe(4096),
      });
      return r.ok;
    };
    const viejo = `${crypto.randomUUID()}.pdf`;
    const nuevo = `${crypto.randomUUID()}.pdf`;
    check("SIN PISO: los dos archivos de prueba subieron", (await subir(viejo)) && (await subir(nuevo)));
    const conFila = filasDe(ULTIMO.id)[0].ruta;
    sql(`update storage.objects set created_at = now() - interval '2 days'
         where bucket_id = 'adjuntos' and name in ('${LUB}/${ANTERIOR.id}/${viejo}', '${conFila}');`);
    const existe = (nombre) => sql(`select count(*) from storage.objects where bucket_id = 'adjuntos' and name = '${nombre}'`) === "1";

    const sinSecreto = await fetch(`${BASE}/api/fidelli/cierre-diario`);
    check("sin el secreto del cron no entra (401) y no barre nada",
      sinSecreto.status === 401 && existe(`${LUB}/${ANTERIOR.id}/${viejo}`), `status ${sinSecreto.status}`);
    const r = await fetch(`${BASE}/api/fidelli/cierre-diario`, { headers: { authorization: `Bearer ${ENV.CRON_SECRET}` } });
    const json = await r.json().catch(() => ({}));
    check("el cierre borra el archivo sin fila de hace dos días", !existe(`${LUB}/${ANTERIOR.id}/${viejo}`),
      `status ${r.status}, ${JSON.stringify(json).slice(0, 160)}`);
    check("no toca el que se acaba de subir (la subida en vuelo)", existe(`${LUB}/${ANTERIOR.id}/${nuevo}`));
    check("ni el que tiene su fila, por viejo que sea", existe(conFila));
    // Sin cotización del día la ruta contesta 502 antes de llegar al
    // resumen: el barrido ya corrió igual, y eso es lo que se mira arriba.
    check("y lo cuenta en su respuesta (si el día cerró)",
      r.status !== 200 || json.adjuntos_barridos >= 1, `status ${r.status}, ${JSON.stringify(json).slice(0, 160)}`);
    await borrarDelBucket([`${LUB}/${ANTERIOR.id}/${nuevo}`]);
  });

  // ------------------------------------------------------------
  titulo("J · El slug: avisa desde los 18 y no pasa de 32");
  await paso("el slug", async () => {
    const { ctx, page } = await abrir({ width: 1280, height: 800 }, sesionFidelli);
    await page.goto(`${BASE}/fidelli/nuevo`, { waitUntil: "networkidle" });
    const slug = page.locator("#slug");
    const AVISO = "Con más de 18 caracteres el QR del calco pierde resistencia.";
    await page.fill("#marca", "Brothers Oil");
    check("un nombre corto propone su slug y no avisa nada",
      (await slug.inputValue()) === "brothers-oil" && (await page.getByText(AVISO).count()) === 0,
      await slug.inputValue());
    await page.fill("#marca", "Lubricentro y Gomería Los Hermanos de la Costa");
    const propuesto = await slug.inputValue();
    check("un nombre largo propone un slug que entra en el tope (32)",
      propuesto.length <= 32 && propuesto.startsWith("lubricentro-y-gomeria"), `${propuesto} (${propuesto.length})`);
    check("y avisa que el QR pierde resistencia, con cuántos caracteres tiene",
      (await page.getByText(`${AVISO} Este tiene ${propuesto.length}.`).count()) === 1);
    check("el campo no deja pasar de 32", (await slug.getAttribute("maxlength")) === "32");
    await slug.fill("");
    await slug.pressSequentially("lubricentro-y-gomeria-los-hermanos-de-la-costa", { delay: 2 });
    check("escribiendo de más, se queda en 32", (await slug.inputValue()).length === 32, await slug.inputValue());
    await slug.fill("dieciocho-letras-x");
    check("con 18 no avisa", (await slug.inputValue()).length === 18 && (await page.getByText(AVISO).count()) === 0);
    await slug.fill("diecinueve-letras-x");
    check("con 19 avisa", (await page.getByText(`${AVISO} Este tiene 19.`).count()) === 1);
    await ctx.close();

    // Editar: hace falta un lubricentro sin calcos entregadas (con calcos,
    // el slug no se toca). Se crea por la puerta real y queda: un tenant no
    // se borra.
    // Corto a propósito (12 caracteres): con más de 18 el aviso del QR ya
    // estaría a la vista al abrir Editar.
    const marca = `zza-${Date.now().toString(36)}`;
    const plan = sql("select id from planes where nombre = 'Basic'");
    const nuevo = sql(`begin;
      select set_config('request.jwt.claims', json_build_object('sub', '${SUPER}', 'role', 'authenticated')::text, true);
      select crear_lubricentro('Zz Adjuntos', '${marca}', '[{"nombre":"Centro"}]'::jsonb, '${plan}', 'mensual', 0);
      commit;`).split("\n").filter(Boolean).pop();
    const ficha = await abrir({ width: 1280, height: 800 }, sesionFidelli);
    await ficha.page.goto(`${BASE}/fidelli/${nuevo}`, { waitUntil: "networkidle" });
    await ficha.page.getByRole("button", { name: "Editar" }).first().click();
    const campoSlug = ficha.page.locator(`#ed-slug-${nuevo}`);
    await campoSlug.waitFor({ timeout: 60_000 });
    check("Editar: el campo del slug no deja pasar de 32", (await campoSlug.getAttribute("maxlength")) === "32");
    check("con su slug corto no avisa", (await ficha.page.getByText(AVISO).count()) === 0);
    await campoSlug.fill("");
    await campoSlug.pressSequentially("lubricentro-y-gomeria-los-hermanos-de-la-costa", { delay: 2 });
    check("escribiendo de más, se queda en 32 y avisa",
      (await campoSlug.inputValue()).length === 32 && (await ficha.page.getByText(`${AVISO} Este tiene 32.`).count()) === 1,
      await campoSlug.inputValue());
    // Y si alguien se saltea el tope del campo, lo frena la base, con un
    // mensaje que se entiende.
    await campoSlug.evaluate((el, valor) => {
      el.removeAttribute("maxlength");
      const set = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value").set;
      set.call(el, valor);
      el.dispatchEvent(new Event("input", { bubbles: true }));
    }, `${marca}-${"x".repeat(33 - marca.length - 1)}`);
    await ficha.page.getByRole("button", { name: /^Guardar/ }).click();
    await ficha.page.getByRole("alert").first().waitFor({ timeout: 60_000 });
    const rechazo = await ficha.page.getByRole("alert").first().innerText();
    check("con 33 por fuera del campo, la base lo rechaza y la pantalla lo explica",
      /entre 3 y 32 caracteres/.test(rechazo) && sql(`select slug from lubricentros where id = '${nuevo}'`) === marca, rechazo);
    await ficha.ctx.close();
  });

  // ------------------------------------------------------------
  titulo("K · Todos los dispositivos");
  for (const vista of [
    { width: 360, height: 780 },
    { width: 390, height: 844 },
    { width: 820, height: 1180 },
    { width: 1280, height: 800 },
  ]) {
    await paso(`${vista.width} px`, async () => {
      const { ctx, page } = await abrir(vista);
      await page.goto(`${BASE}/panel/services/${ULTIMO.id}`, { waitUntil: "networkidle" });
      const m = await page.evaluate(() => {
        const s = document.querySelector("section#adjuntos");
        const caja = s.getBoundingClientRect();
        const tocables = [...s.querySelectorAll("button, a")].map((el) => {
          const r = el.getBoundingClientRect();
          return { texto: (el.getAttribute("aria-label") ?? el.textContent ?? "").trim().slice(0, 30), alto: Math.round(r.height), derecha: r.right, izquierda: r.left };
        });
        return {
          scroll: document.documentElement.scrollWidth <= document.documentElement.clientWidth,
          bajos: tocables.filter((t) => t.alto < 44).map((t) => `${t.texto} (${t.alto})`),
          afuera: tocables.filter((t) => t.derecha > caja.right + 1 || t.izquierda < caja.left - 1).map((t) => t.texto),
          filas: s.querySelectorAll("li[data-adjunto]").length,
        };
      });
      check(`${vista.width}: sin scroll horizontal`, m.scroll);
      check(`${vista.width}: todo lo que se toca mide 44 px o más`, m.bajos.length === 0, m.bajos.join(", "));
      check(`${vista.width}: nada se sale de la sección`, m.afuera.length === 0 && m.filas === 2, `${m.afuera.join(", ")} · ${m.filas} filas`);
      await ctx.close();

      const cliente = await abrir(vista, null);
      await irAlCliente(cliente.page);
      const c = await cliente.page.evaluate(() => {
        const a = document.querySelector("a[data-adjunto-cliente]");
        const r = a?.getBoundingClientRect();
        return {
          scroll: document.documentElement.scrollWidth <= document.documentElement.clientWidth,
          alto: r ? Math.round(r.height) : 0,
          entra: r ? r.right <= document.documentElement.clientWidth : false,
          // Si la línea no está, qué había en la página: para leer la falla.
          pagina: a ? "" : (document.querySelector("main")?.innerText ?? document.body.innerText).replace(/\s+/g, " ").slice(0, 160),
        };
      });
      check(`${vista.width}: la línea del cliente entra, mide 44 px o más y no genera scroll`,
        c.scroll && c.alto >= 44 && c.entra, JSON.stringify(c));
      await cliente.ctx.close();
    });
  }
} catch (e) {
  check("la corrida", false, String(e.message ?? e).split("\n")[0]);
} finally {
  await navegador.close();
  await limpiarUnaVez();
  fs.rmSync(TMP, { recursive: true, force: true });
}

console.log(fallas === 0 ? "\nTODO EN VERDE" : `\n${fallas} FALLA(S)`);
process.exit(fallas === 0 ? 0 : 1);

// Carga el gasto de pauta por semana y canal desde un JSON (bloque
// MÉTRICAS 3, docs/METRICAS.md § 1 «Gasto de pauta»).
//
//   node --no-warnings scripts/cargar-gasto-pauta.mjs scripts/gasto-pauta.plantilla.json [--dry-run]
//
// El JSON es una lista de filas { semana, canal, monto_usd, nota }:
//   · semana    · un LUNES, "YYYY-MM-DD" (la base lo exige con un CHECK)
//   · canal     · "meta" | "google" | "otro"
//   · monto_usd · número en dólares; con null la fila SE SALTEA
//   · nota      · opcional
//
// LA PLANTILLA VIENE CON LOS MONTOS EN NULL A PROPÓSITO: no hay registro
// del gasto de agosto en ningún lado del repo y no se inventa. Santiago
// completa los números que tenga y corre el script; lo que quede en null
// no se carga. Idempotente: es un upsert por (semana, canal).
//
// Necesita NEXT_PUBLIC_SUPABASE_URL y SUPABASE_SERVICE_ROLE_KEY en el
// entorno (los lee de .env.local si no están). Escribe directo en la tabla
// con la clave de servicio —bypassea RLS—; la función fijar_gasto_pauta()
// exige una sesión de superadmin y acá no la hay. Por eso registrado_por
// queda null: la nota dice de dónde salió.
import { readFileSync, existsSync } from "node:fs";
import { createClient } from "@supabase/supabase-js";

const args = process.argv.slice(2);
const dryRun = args.includes("--dry-run");
const archivo = args.find((a) => !a.startsWith("--"));
if (!archivo) {
  console.error("Uso: node scripts/cargar-gasto-pauta.mjs <archivo.json> [--dry-run]");
  process.exit(1);
}

if (!process.env.NEXT_PUBLIC_SUPABASE_URL && existsSync(".env.local")) {
  for (const linea of readFileSync(".env.local", "utf8").split("\n")) {
    const m = linea.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
    if (m && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/^["']|["']$/g, "");
  }
}
const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const clave = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !clave) {
  console.error("Faltan NEXT_PUBLIC_SUPABASE_URL o SUPABASE_SERVICE_ROLE_KEY en el entorno.");
  process.exit(1);
}

const filas = JSON.parse(readFileSync(archivo, "utf8"));
if (!Array.isArray(filas)) {
  console.error("El JSON tiene que ser una lista de filas.");
  process.exit(1);
}

const esLunes = (iso) => {
  const [a, m, d] = iso.split("-").map(Number);
  return new Date(Date.UTC(a, m - 1, d)).getUTCDay() === 1;
};

const validas = [];
const salteadas = [];
for (const f of filas) {
  if (f.monto_usd === null || f.monto_usd === undefined || f.monto_usd === "") {
    salteadas.push(f);
    continue;
  }
  if (!/^\d{4}-\d{2}-\d{2}$/.test(String(f.semana)) || !esLunes(String(f.semana))) {
    console.error(`La semana «${f.semana}» no es un lunes en formato YYYY-MM-DD.`);
    process.exit(1);
  }
  if (!["meta", "google", "otro"].includes(f.canal)) {
    console.error(`Canal inválido en ${f.semana}: «${f.canal}».`);
    process.exit(1);
  }
  const monto = Number(f.monto_usd);
  if (!Number.isFinite(monto) || monto < 0) {
    console.error(`Monto inválido en ${f.semana} · ${f.canal}: «${f.monto_usd}».`);
    process.exit(1);
  }
  validas.push({
    semana: f.semana,
    canal: f.canal,
    monto_usd: Math.round(monto * 100) / 100,
    nota: f.nota ? String(f.nota) : "carga desde scripts/cargar-gasto-pauta.mjs",
  });
}

console.log(`${filas.length} filas en ${archivo} · ${validas.length} con monto · ${salteadas.length} en null (se saltean)`);
for (const v of validas) console.log(`  ${v.semana} · ${v.canal} · US$ ${v.monto_usd}`);

if (dryRun) {
  console.log("--dry-run: no se escribió nada.");
  process.exit(0);
}
if (validas.length === 0) {
  console.log("Nada para cargar: completá los montos en el JSON.");
  process.exit(0);
}

const supabase = createClient(url, clave, { auth: { persistSession: false } });
const { error } = await supabase.from("gasto_pauta").upsert(validas, { onConflict: "semana,canal" });
if (error) {
  console.error("No se pudo cargar:", error.message);
  process.exit(1);
}
console.log(`Listo: ${validas.length} filas de gasto_pauta.`);

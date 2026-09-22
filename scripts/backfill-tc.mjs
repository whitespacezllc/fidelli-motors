#!/usr/bin/env node
// El histórico del tipo de cambio oficial, cargado una vez
// (docs/METRICAS.md § 5).
//
// Trae la cotización oficial diaria de argentinadatos.com —histórico
// completo, con fines de semana— desde --desde (default 2026-08-16) hasta
// --hasta (default AYER en hora argentina) e inserta en `tipo_cambio` los
// días que no existan. Nunca pisa un valor cargado. fuente =
// 'argentinadatos.com/oficial'.
//
// Necesita NEXT_PUBLIC_SUPABASE_URL y SUPABASE_SERVICE_ROLE_KEY: la tabla
// no tiene policy de escritura para nadie, escribe la clave de servicio.
// Si no están en el entorno, los lee de .env.local.
//
//   node --no-warnings scripts/backfill-tc.mjs --dry-run
//   node --no-warnings scripts/backfill-tc.mjs
//   node --no-warnings scripts/backfill-tc.mjs --desde=2026-09-01 --hasta=2026-09-20
//
// Sale con 0 si terminó; 1 si la fuente no respondió o la base rechazó.

import { readFileSync } from "node:fs";
import { createClient } from "@supabase/supabase-js";

const FUENTE = "https://api.argentinadatos.com/v1/cotizaciones/dolares/oficial";
const NOMBRE_FUENTE = "argentinadatos.com/oficial";
const DESDE_DEFAULT = "2026-08-16";
const ZONA_AR = "America/Argentina/Buenos_Aires";

// ---------- entorno ----------
function cargarEnvLocal() {
  try {
    for (const linea of readFileSync(".env.local", "utf8").split("\n")) {
      const m = linea.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*?)\s*$/);
      if (m && process.env[m[1]] === undefined) process.env[m[1]] = m[2].replace(/^["']|["']$/g, "");
    }
  } catch {
    // sin .env.local: se confía en el entorno
  }
}
cargarEnvLocal();

const URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const CLAVE = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!URL || !CLAVE) {
  console.error("Faltan NEXT_PUBLIC_SUPABASE_URL y/o SUPABASE_SERVICE_ROLE_KEY en el entorno (o en .env.local).");
  process.exit(1);
}

// ---------- flags ----------
const flags = Object.fromEntries(
  process.argv.slice(2).map((a) => {
    const [k, v] = a.replace(/^--/, "").split("=");
    return [k, v ?? true];
  }),
);
const dryRun = flags["dry-run"] === true;

function hoyAR() {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: ZONA_AR, year: "numeric", month: "2-digit", day: "2-digit",
  }).format(new Date());
}
function sumarDias(iso, n) {
  const [a, m, d] = iso.split("-").map(Number);
  return new Date(Date.UTC(a, m - 1, d + n)).toISOString().slice(0, 10);
}
const FECHA = /^\d{4}-\d{2}-\d{2}$/;
const desde = typeof flags.desde === "string" ? flags.desde : DESDE_DEFAULT;
const hasta = typeof flags.hasta === "string" ? flags.hasta : sumarDias(hoyAR(), -1);
if (!FECHA.test(desde) || !FECHA.test(hasta) || hasta < desde || hasta >= hoyAR()) {
  console.error(`Rango inválido: ${desde} → ${hasta} (tiene que ser YYYY-MM-DD, desde <= hasta, y hasta anterior a hoy).`);
  process.exit(1);
}

// ---------- la fuente ----------
console.log(`Cotización oficial ${desde} → ${hasta} desde ${NOMBRE_FUENTE}${dryRun ? " (dry-run)" : ""}`);
let filas;
try {
  const r = await fetch(FUENTE, { headers: { accept: "application/json" } });
  if (!r.ok) throw new Error(`HTTP ${r.status}`);
  filas = await r.json();
  if (!Array.isArray(filas)) throw new Error("la respuesta no es una lista");
} catch (e) {
  console.error(`La fuente no respondió: ${e instanceof Error ? e.message : e}`);
  process.exit(1);
}

// Una por día, la última que aparezca; solo las del rango y con venta válida.
const porDia = new Map();
for (const f of filas) {
  const fecha = String(f?.fecha ?? "").slice(0, 10);
  const venta = Number(f?.venta);
  const compra = Number(f?.compra);
  if (!FECHA.test(fecha) || fecha < desde || fecha > hasta) continue;
  if (!Number.isFinite(venta) || venta <= 0) continue;
  porDia.set(fecha, {
    fecha,
    compra: Number.isFinite(compra) && compra > 0 ? compra : null,
    venta,
    fuente: NOMBRE_FUENTE,
  });
}
console.log(`  ${porDia.size} días con cotización en el rango`);

// ---------- lo que ya está ----------
const supabase = createClient(URL, CLAVE, { auth: { persistSession: false, autoRefreshToken: false } });
const { data: existentes, error: errLectura } = await supabase
  .from("tipo_cambio")
  .select("fecha")
  .gte("fecha", desde)
  .lte("fecha", hasta);
if (errLectura) {
  console.error(`No se pudo leer tipo_cambio: ${errLectura.message}`);
  process.exit(1);
}
const ya = new Set((existentes ?? []).map((e) => e.fecha));
const nuevas = [...porDia.values()].filter((f) => !ya.has(f.fecha)).sort((a, b) => a.fecha.localeCompare(b.fecha));
console.log(`  ${ya.size} ya cargados · ${nuevas.length} por insertar`);

// Los días del rango que la fuente no tiene: se dicen, no se inventan.
const faltantes = [];
for (let d = desde; d <= hasta; d = sumarDias(d, 1)) {
  if (!porDia.has(d) && !ya.has(d)) faltantes.push(d);
}
if (faltantes.length > 0) {
  console.log(`  sin cotización en la fuente (quedan vacíos; el cierre los repite): ${faltantes.join(", ")}`);
}

if (dryRun || nuevas.length === 0) {
  console.log(dryRun ? "Dry-run: no se escribió nada." : "Nada que insertar.");
  process.exit(0);
}

// ---------- insertar, en tandas ----------
let insertadas = 0;
for (let i = 0; i < nuevas.length; i += 200) {
  const tanda = nuevas.slice(i, i + 200);
  const { error } = await supabase.from("tipo_cambio").insert(tanda);
  if (error) {
    console.error(`La base rechazó la tanda ${i / 200 + 1}: ${error.message}`);
    process.exit(1);
  }
  insertadas += tanda.length;
}
console.log(`Listo: ${insertadas} días insertados en tipo_cambio (${nuevas[0].fecha} → ${nuevas[nuevas.length - 1].fecha}).`);

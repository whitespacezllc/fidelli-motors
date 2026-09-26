// Manda los ocho emails de cobranza (tres momentos × tres voces, menos
// vencido:alta) a UNA casilla, con datos de ejemplo, para verlos en Gmail
// al lado de la invitación. No toca la base ni el cron: es solo el correo.
//
//   RESEND_API_KEY=re_… node --no-warnings scripts/enviar-emails-de-prueba.mjs fidelli.motors@gmail.com
//
// Lee RESEND_API_KEY, EMAIL_REMITENTE y EMAIL_REPLY_TO del entorno o de
// .env.local (el entorno gana). Si RESEND_BASE_URL apunta al doble
// (scripts/doble-resend.mjs), no sale ningún email de verdad: sirve para
// probar este script sin key.
//
// ⚠ Con una key REAL manda ocho emails de verdad a la casilla que le pases.
// Compila lib/email/{marco,cobranza}.ts con tsc a un temporal, como hace
// scripts/regresion-cobranza-emails.mjs.
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { createRequire } from "node:module";
import { Resend } from "resend";

const RAIZ = new URL("..", import.meta.url).pathname;
const destinatario = process.argv[2];
if (!destinatario || !destinatario.includes("@")) {
  console.error("Uso: node --no-warnings scripts/enviar-emails-de-prueba.mjs <casilla>");
  process.exit(1);
}

const env = Object.fromEntries(
  fs.readFileSync(path.join(RAIZ, ".env.local"), "utf8").split("\n")
    .filter((l) => l.includes("=") && !l.startsWith("#"))
    .map((l) => { const i = l.indexOf("="); return [l.slice(0, i), l.slice(i + 1).trim()]; }));
const leer = (k) => process.env[k] ?? env[k];
const key = leer("RESEND_API_KEY");
if (!key) { console.error("Falta RESEND_API_KEY (entorno o .env.local). No se manda nada."); process.exit(1); }
if (leer("RESEND_BASE_URL")) process.env.RESEND_BASE_URL = leer("RESEND_BASE_URL");
const remitente = leer("EMAIL_REMITENTE") || "Fidelli Motors <hola@fidellimotors.app>";
const replyTo = leer("EMAIL_REPLY_TO") || "fidelli.motors@gmail.com";

const dir = fs.mkdtempSync(path.join(os.tmpdir(), "fm-emails-envio-"));
execFileSync(path.join(RAIZ, "node_modules/.bin/tsc"), [
  "--module", "commonjs", "--target", "es2022", "--moduleResolution", "node", "--esModuleInterop",
  "--skipLibCheck", "--outDir", dir, path.join(RAIZ, "lib/email/marco.ts"), path.join(RAIZ, "lib/email/cobranza.ts"),
], { stdio: "pipe" });
const { emailDeCobranza } = createRequire(import.meta.url)(path.join(dir, "cobranza.js"));

const enlaces = { pagar: "https://fidellimotors.app/panel/suscripcion", whatsapp: "https://wa.me/5493513736028" };
const base = { nombre: "Lubricentro de prueba", plan: "Pro", monto: 49000, periodo: "mensual", vencimiento: "2026-10-01", dias: 3, corta: true, alias: null, enlaces };
const casos = [
  ["por_vencer:cobranza", base],
  ["vencido:cobranza", { ...base, dias: 0 }],
  ["suspendido:cobranza", { ...base, dias: -9 }],
  ["por_vencer:trial", { ...base, monto: null }],
  ["vencido:trial", { ...base, monto: null, dias: 0 }],
  ["suspendido:trial", { ...base, monto: null, dias: -9 }],
  ["por_vencer:alta", { ...base, dias: 1 }],
  ["suspendido:alta", { ...base, dias: -2 }],
];

const resend = new Resend(key);
console.log(`mandando ${casos.length} emails a ${destinatario} desde ${remitente}${process.env.RESEND_BASE_URL ? ` (vía ${process.env.RESEND_BASE_URL})` : ""}`);
let fallas = 0;
for (const [clave, datos] of casos) {
  const e = emailDeCobranza(clave, datos);
  const { data, error } = await resend.emails.send({
    from: remitente, to: [destinatario], replyTo, subject: `[prueba ${clave}] ${e.asunto}`, html: e.html, text: e.text,
  });
  if (error || !data?.id) { fallas++; console.log(`  ✗ ${clave}: ${error ? `${error.name}: ${error.message}` : "sin id"}`); }
  else console.log(`  ✓ ${clave} → ${data.id}`);
}
process.exit(fallas ? 1 : 0);

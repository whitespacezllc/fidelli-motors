// Escribe los ocho emails de cobranza como HTML en un directorio, para
// mirarlos en el navegador al lado de la invitación sin mandar nada.
//
//   node --no-warnings scripts/previsualizar-emails.mjs <directorio>
//
// Compila lib/email/{marco,cobranza}.ts con tsc a un temporal (como hace
// scripts/regresion-cobranza-emails.mjs) y usa datos de ejemplo. También
// deja `invite.html` con las variables de Supabase resueltas, para la
// comparación.
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { createRequire } from "node:module";

const RAIZ = new URL("..", import.meta.url).pathname;
const destino = process.argv[2];
if (!destino) { console.error("Uso: node scripts/previsualizar-emails.mjs <directorio>"); process.exit(1); }
fs.mkdirSync(destino, { recursive: true });

const dir = fs.mkdtempSync(path.join(os.tmpdir(), "fm-emails-prev-"));
execFileSync(path.join(RAIZ, "node_modules/.bin/tsc"), [
  "--module", "commonjs", "--target", "es2022", "--moduleResolution", "node", "--esModuleInterop",
  "--skipLibCheck", "--outDir", dir, path.join(RAIZ, "lib/email/marco.ts"), path.join(RAIZ, "lib/email/cobranza.ts"),
], { stdio: "pipe" });
const { emailDeCobranza } = createRequire(import.meta.url)(path.join(dir, "cobranza.js"));

const enlaces = { pagar: "https://fidellimotors.app/panel/suscripcion", whatsapp: "https://wa.me/5493513736028" };
const base = { nombre: "Lubricentro San Martín", plan: "Pro", monto: 49000, periodo: "mensual", vencimiento: "2026-10-01", dias: 3, corta: true, alias: null, enlaces };
const casos = {
  "1-por_vencer-cobranza": ["por_vencer:cobranza", base],
  "2-vencido-cobranza": ["vencido:cobranza", { ...base, dias: 0 }],
  "3-suspendido-cobranza": ["suspendido:cobranza", { ...base, dias: -9 }],
  "1-por_vencer-trial": ["por_vencer:trial", { ...base, monto: null }],
  "2-vencido-trial": ["vencido:trial", { ...base, monto: null, dias: 0 }],
  "3-suspendido-trial": ["suspendido:trial", { ...base, monto: null, dias: -9 }],
  "1-por_vencer-alta": ["por_vencer:alta", { ...base, dias: 1 }],
  "3-suspendido-alta": ["suspendido:alta", { ...base, dias: -2 }],
};
for (const [nombre, [clave, datos]] of Object.entries(casos)) {
  const e = emailDeCobranza(clave, datos);
  fs.writeFileSync(path.join(destino, `${nombre}.html`), e.html);
  fs.writeFileSync(path.join(destino, `${nombre}.txt`), `Asunto: ${e.asunto}\n\n${e.text}`);
}

const invite = fs.readFileSync(path.join(RAIZ, "supabase/templates/invite.html"), "utf8")
  .replace(/\{\{ \.Data\.nombre \}\}/g, "Martín")
  .replace(/\{\{ \.SiteURL \}\}/g, "https://fidellimotors.app")
  .replace(/\{\{ \.TokenHash \}\}/g, "…");
fs.writeFileSync(path.join(destino, "0-invitacion.html"), invite);
console.log(`listo: ${Object.keys(casos).length} emails + la invitación en ${destino}`);

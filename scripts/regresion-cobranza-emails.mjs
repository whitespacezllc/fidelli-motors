// Las plantillas de los tres emails de cobranza, en las tres voces, contra
// el anexo de docs/PROMPT-cobranza-hoy.md (regla 13: una prueba que nunca se
// vio en rojo no existe).
//
// Lo que cubre:
//   1 · Los ocho emails (por_vencer/vencido/suspendido × cobranza/trial/alta,
//       menos vencido:alta) dicen lo que dice el anexo, con las variables
//       resueltas: fecha DD/MM, monto $49.000, período «por mes», fecha7 y
//       fecha8, el botón Pagar ahora a /panel/suscripcion y la firma de
//       Santiago. El trial sin monto y sin Pagar. El alta con «hasta mañana»
//       el día del alta y «hasta hoy» el día del vencimiento.
//   2 · No promete lo que el interruptor no hace: «el panel pasa a solo
//       lectura» solo con `corta`.
//   3 · El marco: el de la invitación (la línea roja, FIDELLI MOTORS, el
//       botón rojo, el pie), sin imágenes, con el HTML escapado; y la
//       versión de texto plano.
//   4 · El lugar del alias, condicional: sin alias la frase genérica; con
//       alias, el alias.
//   5 · Y LAS ROTURAS: cada regla se rompe a mano sobre una copia de
//       lib/email/cobranza.ts, se recompila y la comprobación que la cubre
//       tiene que fallar.
//
// Correr:  node --no-warnings scripts/regresion-cobranza-emails.mjs
//
// Compila lib/email/{marco,cobranza}.ts con tsc a CommonJS en un directorio
// temporal (los dos importan con «./marco», sin extensión, que Node no
// resuelve solo) y los carga con require. No toca la base ni la red.
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { createRequire } from "node:module";

const RAIZ = new URL("..", import.meta.url).pathname;
const TSC = path.join(RAIZ, "node_modules", ".bin", "tsc");
const require = createRequire(import.meta.url);

let fallas = 0;
const check = (nombre, cond, detalle = "") => {
  console.log(`  ${cond ? "✓" : "✗ FALLA"} ${nombre}${cond || !detalle ? "" : "  → " + detalle}`);
  if (!cond) fallas++;
};

// Compila marco.ts + cobranza.ts (con reemplazos opcionales sobre cobranza)
// y devuelve el módulo cargado.
function compilar(reemplazos = []) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "fm-emails-"));
  const src = path.join(dir, "src");
  fs.mkdirSync(src);
  fs.copyFileSync(path.join(RAIZ, "lib/email/marco.ts"), path.join(src, "marco.ts"));
  let cobranza = fs.readFileSync(path.join(RAIZ, "lib/email/cobranza.ts"), "utf8");
  for (const [de, a] of reemplazos) {
    if (!cobranza.includes(de)) throw new Error(`EL REEMPLAZO NO MORDIÓ: «${de}» no está en cobranza.ts`);
    cobranza = cobranza.replace(de, a);
  }
  fs.writeFileSync(path.join(src, "cobranza.ts"), cobranza);
  execFileSync(TSC, [
    "--module", "commonjs", "--target", "es2022", "--moduleResolution", "node",
    "--esModuleInterop", "--skipLibCheck", "--strict", "--outDir", path.join(dir, "out"),
    path.join(src, "marco.ts"), path.join(src, "cobranza.ts"),
  ], { stdio: "pipe" });
  return require(path.join(dir, "out", "cobranza.js"));
}

const enlaces = { pagar: "https://fidellimotors.app/panel/suscripcion", whatsapp: "https://wa.me/5493513736028" };
const base = {
  nombre: "Lubricentro San Martín", plan: "Pro", monto: 49000, periodo: "mensual",
  vencimiento: "2026-10-01", dias: 3, corta: true, alias: null, enlaces,
};

// Las comprobaciones, como funciones sobre el módulo: se corren en verde
// con el código real y en rojo con cada rotura.
const PRUEBAS = {
  "1 · por_vencer:cobranza dice el anexo": (m) => {
    const e = m.emailDeCobranza("por_vencer:cobranza", base);
    return e.asunto === "Tu plan de Fidelli vence el 01/10"
      && e.text.includes("Hola, Lubricentro San Martín.")
      && e.text.includes("El 01/10 vence tu plan Pro de Fidelli Motors. Son $49.000 por mes.")
      && e.text.includes("Podés pagarlo desde ahora y no se corta nada:")
      && e.text.includes("Pagar ahora: https://fidellimotors.app/panel/suscripcion")
      && e.text.includes("Transferís al alias de tu cuenta y se acredita solo.")
      && e.text.includes("Cualquier duda, respondé este mail o escribinos por WhatsApp.")
      && /Santiago\nFidelli Motors/.test(e.text);
  },
  "1 · vencido:cobranza el día 0, con el interruptor: hoy vence, 7 días, fecha7 y fecha8": (m) => {
    const e = m.emailDeCobranza("vencido:cobranza", { ...base, dias: 0 });
    return e.asunto === "Hoy vence tu plan — tenés 7 días"
      && e.text.includes("Hoy vence tu plan Pro. Todo sigue funcionando normal durante 7 días, hasta el 08/10.")
      && e.text.includes("Si para entonces no se renovó, el 09/10 el panel pasa a solo lectura")
      && e.text.includes("el programa de fidelización desaparece de tu página. No se borra nada, y en cuanto pagás vuelve todo.")
      && e.text.includes("Son $49.000.")
      && e.text.includes("Pagar ahora: https://fidellimotors.app/panel/suscripcion");
  },
  "2 · vencido:cobranza SIN el interruptor no promete el solo lectura": (m) => {
    const e = m.emailDeCobranza("vencido:cobranza", { ...base, dias: 0, corta: false });
    return !/solo lectura/.test(e.text) && !/solo lectura/.test(e.asunto) && e.text.includes("No se borra nada");
  },
  "1 · vencido:cobranza después del día 0 habla en pasado": (m) => {
    const e = m.emailDeCobranza("vencido:cobranza", { ...base, dias: -3 });
    return e.asunto === "Tu plan venció el 01/10" && e.text.includes("El 01/10 venció tu plan Pro. Todo sigue funcionando normal hasta el 08/10.");
  },
  "1 · suspendido:cobranza dice el anexo": (m) => {
    const e = m.emailDeCobranza("suspendido:cobranza", { ...base, dias: -9 });
    return e.asunto === "Tu panel pasó a solo lectura"
      && e.text.includes("Pasaron los 7 días y el pago no llegó, así que tu panel de Fidelli quedó en solo lectura.")
      && e.text.includes("Tu página pública sigue respondiendo, sin el programa de fidelización, y el historial de tus clientes quedó como estaba el 01/10.")
      && e.text.includes("No se borró nada. Pagás y en minutos vuelve todo a funcionar, sin que tengas que avisarnos.")
      && e.text.includes("Son $49.000.")
      && e.text.includes("Si pasó algo, contanos: respondé este mail o escribinos por WhatsApp.");
  },
  "1 · el trial: sin monto, sin Pagar, con WhatsApp, en sus tres momentos": (m) => {
    const t = { ...base, monto: null };
    const a = m.emailDeCobranza("por_vencer:trial", t);
    const b = m.emailDeCobranza("vencido:trial", { ...t, dias: 0 });
    const c = m.emailDeCobranza("suspendido:trial", { ...t, dias: -9 });
    return [a, b, c].every((e) => !e.text.includes("$") && !/Pagar/.test(e.text) && e.text.includes("Hablemos por WhatsApp: https://wa.me/5493513736028"))
      && a.text.includes("Tu prueba de Fidelli termina el 01/10. Si querés seguir, lo vemos por WhatsApp.")
      && b.text.includes("Hoy termina tu prueba. Tenés 7 días más para decidir.")
      && c.text.includes("Tu prueba terminó y el panel quedó en solo lectura. Tus datos siguen ahí: si querés seguir, escribinos.");
  },
  "1 · el alta: «hasta mañana» el día del alta, «hasta hoy» el día del vencimiento, y al bloquearse": (m) => {
    const a = m.emailDeCobranza("por_vencer:alta", { ...base, dias: 1 });
    const b = m.emailDeCobranza("por_vencer:alta", { ...base, dias: 0 });
    const c = m.emailDeCobranza("suspendido:alta", { ...base, dias: -2 });
    return a.text.includes("Bienvenido a Fidelli, Lubricentro San Martín.")
      && a.text.includes("Tenés hasta mañana para hacer el primer pago y dejar tu cuenta activa. Son $49.000.")
      && b.text.includes("Tenés hasta hoy para hacer el primer pago")
      && c.text.includes("Te falta el primer pago para activar tu cuenta. Todo lo que cargaste está guardado. Son $49.000.")
      && [a, c].every((e) => e.text.includes("Pagar ahora: https://fidellimotors.app/panel/suscripcion"));
  },
  "1 · vencido:alta no existe (el alta no tiene email intermedio)": (m) =>
    m.claveDeEmail("vencido", "alta") === null && m.claveDeEmail("vencido", "cobranza") === "vencido:cobranza",
  "1 · el monto del anexo: $220.500, $74.000, «por año»": (m) => {
    const e = m.emailDeCobranza("por_vencer:cobranza", { ...base, monto: 220500, periodo: "anual" });
    return m.montoCorto(220500) === "$220.500" && m.montoCorto(74000) === "$74.000" && e.text.includes("Son $220.500 por año.");
  },
  "3 · el marco es el de la invitación": (m) => {
    const e = m.emailDeCobranza("por_vencer:cobranza", base);
    return e.html.includes("FIDELLI <span style=\"color:#E01F26;\">MOTORS</span>")
      && e.html.includes("height:4px;background:#E01F26")
      && e.html.includes("background:#E01F26;border-radius:8px;")
      && e.html.includes("Fidelli Motors · fidellimotors.app")
      && e.html.includes("max-width:520px;background:#FFFFFF;border:1px solid #E4E4E4")
      && !/<img/i.test(e.html)
      && e.text.endsWith("Fidelli Motors · fidellimotors.app");
  },
  "3 · el HTML escapa lo que viene de la base": (m) => {
    const e = m.emailDeCobranza("por_vencer:cobranza", { ...base, nombre: "Taller <b>El Colo</b> & Cía" });
    return e.html.includes("Taller &lt;b&gt;El Colo&lt;/b&gt; &amp; Cía") && !e.html.includes("<b>El Colo</b>");
  },
  "4 · el alias, condicional": (m) => {
    const sin = m.emailDeCobranza("por_vencer:cobranza", base);
    const con = m.emailDeCobranza("por_vencer:cobranza", { ...base, alias: "fm.sanmartin" });
    return sin.text.includes("Transferís al alias de tu cuenta") && !sin.text.includes("fm.sanmartin")
      && con.text.includes("Transferís al alias fm.sanmartin y se acredita solo.");
  },
  "1 · fecha7 y fecha8 cruzan el mes": (m) => {
    const e = m.emailDeCobranza("vencido:cobranza", { ...base, vencimiento: "2026-10-28", dias: 0 });
    return e.text.includes("hasta el 04/11") && e.text.includes("el 05/11 el panel pasa a solo lectura");
  },
};

console.log("— en verde, con el código real");
const real = compilar();
for (const [nombre, prueba] of Object.entries(PRUEBAS)) {
  let ok = false, detalle = "";
  try { ok = prueba(real); } catch (e) { detalle = e.message; }
  check(nombre, ok, detalle);
}

// ---------- Las roturas ----------
// Cada una recompila una copia rota y espera que SU prueba falle. Una
// rotura que no rompe nada es una prueba que miente sobre lo que cubre.
const ROTURAS = [
  ["el solo lectura prometido siempre (sin mirar `corta`)",
    [["d.corta\n          ?", "true\n          ?"]], "2 · vencido:cobranza SIN el interruptor no promete el solo lectura"],
  ["el alta con «hasta hoy» y «hasta mañana» al revés",
    [['d.dias > 0 ? "Tenés hasta mañana" : "Tenés hasta hoy"', 'd.dias > 0 ? "Tenés hasta hoy" : "Tenés hasta mañana"']],
    "1 · el alta: «hasta mañana» el día del alta, «hasta hoy» el día del vencimiento, y al bloquearse"],
  ["el trial mandado a pagar",
    [["boton: CHARLAR(d),\n    firma: FIRMA,\n  }),\n  \"vencido:trial\"", "boton: PAGAR(d),\n    firma: FIRMA,\n  }),\n  \"vencido:trial\""]],
    "1 · el trial: sin monto, sin Pagar, con WhatsApp, en sus tres momentos"],
  ["el monto sin punto de miles",
    [['return "$" + String(entero).replace(/\\B(?=(\\d{3})+(?!\\d))/g, ".");', 'return "$" + String(entero);']],
    "1 · el monto del anexo: $220.500, $74.000, «por año»"],
  ["el alias ignorado",
    [["return d.alias\n    ?", "return false\n    ?"]], "4 · el alias, condicional"],
  ["fecha8 calculada como fecha7",
    [["const fecha8 = fechaCorta(sumarDias(d.vencimiento, 8));", "const fecha8 = fechaCorta(sumarDias(d.vencimiento, 7));"]],
    "1 · vencido:cobranza el día 0, con el interruptor: hoy vence, 7 días, fecha7 y fecha8"],
  ["el HTML sin escapar",
    [["return s\n    .replace(/&/g, \"&amp;\")", "return s\n    .replace(/&amp;/g, \"&amp;\")"]], null], // en marco.ts: se rompe abajo, aparte
  ["el pasado no se conjuga (siempre «Hoy vence»)",
    [["const hoy = d.dias === 0;", "const hoy = true;"]], "1 · vencido:cobranza después del día 0 habla en pasado"],
];

console.log("\n— en rojo, cada rotura contra su prueba");
for (const [nombre, reemplazos, prueba] of ROTURAS) {
  if (!prueba) continue; // la de marco.ts va abajo
  let roto;
  try { roto = compilar(reemplazos); } catch (e) { check(`${nombre} — no compiló/no mordió`, false, e.message); continue; }
  let ok = true;
  try { ok = PRUEBAS[prueba](roto); } catch { ok = false; }
  check(`${nombre} — atrapada por «${prueba}»`, ok === false);
}

// La rotura del marco: copia de marco.ts con el escape que no escapa.
{
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "fm-emails-marco-"));
  const src = path.join(dir, "src"); fs.mkdirSync(src);
  const marco = fs.readFileSync(path.join(RAIZ, "lib/email/marco.ts"), "utf8").replace(".replace(/</g, \"&lt;\")", ".replace(/<</g, \"&lt;\")");
  if (!marco.includes(".replace(/<</g")) throw new Error("EL REEMPLAZO NO MORDIÓ en marco.ts");
  fs.writeFileSync(path.join(src, "marco.ts"), marco);
  fs.copyFileSync(path.join(RAIZ, "lib/email/cobranza.ts"), path.join(src, "cobranza.ts"));
  execFileSync(TSC, ["--module", "commonjs", "--target", "es2022", "--moduleResolution", "node", "--esModuleInterop", "--skipLibCheck", "--strict", "--outDir", path.join(dir, "out"), path.join(src, "marco.ts"), path.join(src, "cobranza.ts")], { stdio: "pipe" });
  const roto = require(path.join(dir, "out", "cobranza.js"));
  let ok = true; try { ok = PRUEBAS["3 · el HTML escapa lo que viene de la base"](roto); } catch { ok = false; }
  check("el HTML sin escapar — atrapada por «3 · el HTML escapa lo que viene de la base»", ok === false);
}

console.log(fallas ? `\n✗ ${fallas} falla(s)` : "\n✓ todo en verde");
process.exit(fallas ? 1 : 0);

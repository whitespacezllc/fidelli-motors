// Las patentes de los países vecinos (26/10/2026): Lubricheck Sassi tiene
// clientes con chapa de Brasil, Uruguay, Paraguay, Bolivia y Chile y no
// podía cargarles un trabajo. La base acepta nueve formatos más
// (20261026120000) y lib/texto.ts los repite para avisar antes del rechazo
// del server. Regla 13: una prueba que nunca se vio en rojo no existe; esta
// se vio en rojo contra el lib/texto.ts de `develop` (sección A) y contra
// sus roturas (A3).
//
// Lo que cubre:
//   A · Sin navegador.
//       1 · lib/texto.ts compilado con tsc: los trece formatos entran
//           escritos de cualquier manera y lo que quedó afuera a propósito
//           no; esPatenteArgentina distingue las cuatro argentinas de las
//           nueve vecinas; patenteIncompleta (AB123C, ABC1D2, 1234AB y
//           AB123 todavía van a ser otra cosa; una válida nunca está
//           incompleta); formatearPatente con los espacios de cada chapa;
//           los largos son 5 y 7; y la propiedad que sostiene al alta:
//           tipear una patente válida de izquierda a derecha nunca pasa por
//           un estado que sea «ni incompleta ni válida».
//       2 · EL ESPEJO. Las 224 formas posibles de 5, 6 y 7 caracteres
//           (letra o número en cada lugar) se le preguntan a
//           patente_formato_valido() en la base local y a esPatenteValida,
//           y tienen que contestar lo mismo forma por forma. Es lo que
//           impide que el front y la base se desvíen en silencio.
//       3 · Roturas sobre una copia de lib/texto.ts (regla 13): un vecino
//           sacado de la lista, un vecino metido entre los argentinos, el
//           mínimo clavado en 6 y el chequeo de «principio de» sacado; cada
//           una tiene que poner en rojo lo que dice cubrir.
//   B · Con navegador (Playwright, 390×844 táctil), en «Nuevo trabajo» del
//       demo, con el cliente de prueba «Zzpat Brasil» BORRADO AL FINAL:
//       1 · «ABC1D23» no avisa, espera el debounce (ninguna consulta antes
//           de la última tecla, y la consulta parte DESPUÉS de los 300 ms)
//           y abre «¿De quién es?»; se da de alta un cliente nuevo con esa
//           patente, queda ABC1D23 en la base y /demo/ABC1D23 la muestra.
//       2 · «BBB12» (una moto chilena, cinco caracteres) abre el alta.
//       3 · «ABC123» (argentina) sigue saliendo antes de los 250 ms.
//       4 · «ABCDE1» (Chile 2026, todavía no se emite) avisa.
//
// Requiere el stack local y, para B, el servidor de Next:
//   supabase start && npm run dev
//   node --no-warnings scripts/regresion-patentes.mjs
// BASE_URL y DB_CONTAINER cambian el servidor y el contenedor de la base.
// SOLO_A=1 corre solo la parte sin navegador.
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { createRequire } from "node:module";
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const RAIZ = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const BASE = process.env.BASE_URL ?? "http://localhost:3000";
const CONTENEDOR = process.env.DB_CONTAINER ?? "supabase_db_fidelli-motors";
const TSC = path.join(RAIZ, "node_modules", ".bin", "tsc");
const require = createRequire(import.meta.url);

let fallas = 0;
const check = (nombre, cond, detalle = "") => {
  console.log(`  ${cond ? "✓" : "✗ FALLA"} ${nombre}${cond || !detalle ? "" : "  → " + detalle}`);
  if (!cond) fallas++;
};
const titulo = (t) => console.log(`\n${t}`);
async function paso(nombre, fn) {
  try {
    await fn();
  } catch (e) {
    check(nombre, false, String(e.message ?? e).split("\n")[0]);
  }
}

function sql(texto) {
  return execFileSync(
    "docker",
    ["exec", "-i", CONTENEDOR, "psql", "-U", "postgres", "-d", "postgres", "-X", "-q", "-A", "-t", "-v", "ON_ERROR_STOP=1"],
    { input: texto, encoding: "utf8" },
  ).trim();
}

// ============================================================
// Los casos. Cada uno con la patente escrita como la escribe la gente, la
// normalizada, cómo se lee en la chapa y de quién es.
// ============================================================
const ARGENTINAS = [
  ["abc 123", "ABC123", "ABC 123"],
  ["AB-123-CD", "AB123CD", "AB 123 CD"],
  ["123 abc", "123ABC", "123 ABC"],
  ["a 123 bcd", "A123BCD", "A 123 BCD"],
];
const VECINAS = [
  ["abc1d23", "ABC1D23", "ABC1D23"], // Brasil Mercosur: la chapa va sin espacios
  ["ABC-1234", "ABC1234", "ABC 1234"], // Brasil vieja / Uruguay
  ["abcd 123", "ABCD123", "ABCD 123"], // Paraguay, autos
  ["123-abcd", "123ABCD", "123 ABCD"], // Paraguay, motos
  ["1234 ABC", "1234ABC", "1234 ABC"], // Bolivia
  ["ab 12345", "AB12345", "AB 12345"], // Bolivia Mercosur
  ["BCDF·12", "BCDF12", "BCDF 12"], // Chile, autos 2007→
  ["ab-1234", "AB1234", "AB 1234"], // Chile, autos 1985-2007
  ["bbb 12", "BBB12", "BBB 12"], // Chile, motos
];
// Lo que quedó afuera a propósito, y lo que nunca fue una patente.
const AFUERA = ["AB123", "ABCDE1", "ABCD1", "A123456", "ABCD1234", "ABC1D2", "1234AB", "AB12CD", "ZZ1ZZ", "12345", "ABCDEFG", "ABCDEF", ""];
// A medio tipear: todavía pueden ser una patente y no son ninguna.
const INCOMPLETAS = ["AB123C", "ab 123 c", "A123BC", "ABC1D2", "1234AB", "AB123", "1234A", "ABCD1", "123AB", "ABC1D", "A123B", "AB12", "A", ""];

// ============================================================
// A1 · lib/texto.ts compilado con tsc
// ============================================================
function compilar(fuente) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "fm-patentes-"));
  fs.writeFileSync(path.join(dir, "texto.ts"), fuente);
  execFileSync(TSC, [
    "--module", "commonjs", "--target", "es2022", "--moduleResolution", "node",
    "--skipLibCheck", "--strict", "--outDir", path.join(dir, "out"), path.join(dir, "texto.ts"),
  ], { stdio: "pipe" });
  return require(path.join(dir, "out", "texto.js"));
}
const FUENTE = fs.readFileSync(path.join(RAIZ, "lib/texto.ts"), "utf8");

// Las comprobaciones, como funciones que devuelven la lista de fallas: las
// usa A1 sobre el lib real y A3 sobre cada copia rota, que tiene que hacer
// fallar la suya.
function fallasDeValidez(t) {
  const f = [];
  for (const [escrita, normalizada] of [...ARGENTINAS, ...VECINAS]) {
    if (!t.esPatenteValida(escrita)) f.push(`«${escrita}» (${normalizada}) tendría que ser válida`);
  }
  for (const p of AFUERA) if (t.esPatenteValida(p)) f.push(`«${p}» no tendría que ser válida`);
  return f;
}
function fallasDeArgentina(t) {
  const f = [];
  for (const [escrita] of ARGENTINAS) if (!t.esPatenteArgentina(escrita)) f.push(`«${escrita}» es argentina`);
  for (const [escrita] of VECINAS) if (t.esPatenteArgentina(escrita)) f.push(`«${escrita}» no es argentina`);
  return f;
}
function fallasDeIncompleta(t) {
  const f = [];
  for (const p of INCOMPLETAS) if (!t.patenteIncompleta(p)) f.push(`«${p}» está incompleta`);
  for (const [escrita] of [...ARGENTINAS, ...VECINAS]) if (t.patenteIncompleta(escrita)) f.push(`«${escrita}» es válida, no incompleta`);
  for (const p of ["ABCDEF", "ABCDEFG", "12345", "AB12CD", "ZZ1ZZ"]) if (t.patenteIncompleta(p)) f.push(`«${p}» no es el principio de nada`);
  return f;
}
function fallasDeFormato(t) {
  const f = [];
  for (const [escrita, , linda] of [...ARGENTINAS, ...VECINAS]) {
    if (t.formatearPatente(escrita) !== linda) f.push(`«${escrita}» → «${t.formatearPatente(escrita)}», esperaba «${linda}»`);
  }
  if (t.formatearPatente("zz 1 zz") !== "ZZ1ZZ") f.push("lo que no es patente vuelve normalizado tal cual");
  return f;
}
function fallasDeLargos(t) {
  const f = [];
  if (t.PATENTE_LARGO_MINIMO !== 5) f.push(`mínimo ${t.PATENTE_LARGO_MINIMO}, esperaba 5`);
  if (t.PATENTE_LARGO_MAXIMO !== 7) f.push(`máximo ${t.PATENTE_LARGO_MAXIMO}, esperaba 7`);
  return f;
}
// La propiedad del alta: mientras se tipea una patente válida, cada prefijo
// es incompleto (no se busca) o válido (se busca). Un prefijo que no es
// ninguna de las dos cosas se buscaría como «lo que no cierra en ningún
// formato» y abriría «¿De quién es?» a mitad de tipeo.
function fallasDeTipeo(t) {
  const f = [];
  for (const [, n] of [...ARGENTINAS, ...VECINAS]) {
    for (let i = 1; i < n.length; i++) {
      const q = n.slice(0, i);
      if (!t.patenteIncompleta(q) && !t.esPatenteValida(q)) f.push(`«${q}» (tipeando ${n}) no es incompleta ni válida`);
    }
  }
  return f;
}
const TODAS = { validez: fallasDeValidez, argentina: fallasDeArgentina, incompleta: fallasDeIncompleta, formato: fallasDeFormato, largos: fallasDeLargos, tipeo: fallasDeTipeo };

titulo("── A1 · lib/texto.ts: los trece formatos ──");
let texto = null;
await paso("lib/texto.ts compila solo", async () => {
  texto = compilar(FUENTE);
});
if (texto) {
  for (const [nombre, fn] of Object.entries(TODAS)) {
    await paso(nombre, async () => {
      const f = fn(texto);
      check(`${nombre}: ${f.length === 0 ? "todo en orden" : f.length + " falla(s)"}`, f.length === 0, f.slice(0, 4).join(" · "));
    });
  }
}

// ============================================================
// A2 · el espejo: las 224 formas, en la base y en el front
// ============================================================
titulo("── A2 · el espejo: patente_formato_valido() y esPatenteValida dicen lo mismo ──");
await paso("las 224 formas de 5, 6 y 7 caracteres", async () => {
  if (!texto) throw new Error("sin lib/texto.ts compilado");
  const formas = [];
  for (const largo of [5, 6, 7]) {
    for (let bits = 0; bits < 1 << largo; bits++) {
      let s = "";
      for (let i = 0; i < largo; i++) s += bits & (1 << i) ? "1" : "A";
      formas.push(s);
    }
  }
  const lista = formas.map((s) => `'${s}'`).join(",");
  const base = new Map(
    sql(`select s || ' ' || patente_formato_valido(s)::int from unnest(array[${lista}]) s`)
      .split("\n").filter(Boolean).map((l) => l.split(" ")).map(([s, v]) => [s, v === "1"]),
  );
  check(`la base contestó las ${formas.length} formas`, base.size === formas.length, `${base.size}`);
  const distintas = formas.filter((s) => base.get(s) !== texto.esPatenteValida(s));
  check("ninguna forma en la que la base y el front no coincidan", distintas.length === 0,
    distintas.map((s) => `${s}: base ${base.get(s)} / front ${texto.esPatenteValida(s)}`).slice(0, 6).join(" · "));
  const aceptadas = formas.filter((s) => base.get(s));
  check("la base acepta exactamente 13 formas", aceptadas.length === 13, aceptadas.join(" "));
});

// ============================================================
// A3 · las roturas, sobre una copia (regla 13)
// ============================================================
titulo("── A3 · roturas sobre una copia de lib/texto.ts ──");
const ROTURAS = [
  {
    nombre: "un vecino sacado de la lista (Chile, autos 2007→)",
    buscar: '  "LLLL NN", // Chile, autos (2007→)',
    por: "  // (sacado)",
    acusa: "validez",
  },
  {
    nombre: "un vecino metido entre los argentinos (ABC 1234 saldría sin esperar)",
    buscar: '  "L NNN LLL", // moto Mercosur',
    por: '  "L NNN LLL", "LLL NNNN", // moto Mercosur',
    acusa: "argentina",
  },
  {
    nombre: "el mínimo clavado en 6 (la moto chilena nunca se busca)",
    buscar: "export const PATENTE_LARGO_MINIMO = Math.min(...FORMAS.map((f) => f.length));",
    por: "export const PATENTE_LARGO_MINIMO = 6;",
    acusa: "largos",
  },
  {
    nombre: "el «principio de» sacado (AB123C se busca y abre «¿De quién es?»)",
    buscar: "  return FORMAS.some((f) => esPrincipioDe(n, f));",
    por: "  return false;",
    acusa: "incompleta",
  },
];
for (const r of ROTURAS) {
  await paso(r.nombre, async () => {
    const veces = FUENTE.split(r.buscar).length - 1;
    if (veces !== 1) throw new Error(`el sed no muerde (${veces} veces): «${r.buscar.slice(0, 40)}»`);
    const roto = compilar(FUENTE.replace(r.buscar, r.por));
    const f = TODAS[r.acusa](roto);
    check(`${r.nombre} → ${r.acusa} la acusa`, f.length > 0, "SE ESCAPÓ: la copia rota pasó en verde");
  });
}

if (process.env.SOLO_A) {
  console.log(fallas === 0 ? "\nTODO VERDE (solo A)" : `\n${fallas} FALLA(S)`);
  process.exit(fallas === 0 ? 0 : 1);
}

// ============================================================
// B · con navegador
// ============================================================
const { chromium } = await import("playwright");

const LUB = sql("select id from lubricentros where slug = 'demo'");
if (!LUB) {
  console.error("No está el lubricentro demo: supabase db reset");
  process.exit(1);
}
const DE_PRUEBA = `(select id from clientes where lubricentro_id = '${LUB}' and nombre like 'Zzpat %')`;
function restaurar() {
  sql(`
    delete from correcciones_patente where vehiculo_id in (select id from vehiculos where cliente_id in ${DE_PRUEBA});
    delete from services where vehiculo_id in (select id from vehiculos where cliente_id in ${DE_PRUEBA});
    delete from vehiculos where cliente_id in ${DE_PRUEBA};
    delete from clientes where id in ${DE_PRUEBA};
    delete from landing_busquedas where lubricentro_id = '${LUB}' and patente in ('ABC1D23', 'BBB12');
  `);
}
restaurar();

const navegador = await chromium.launch({ args: ["--lang=es-AR"] });

async function entrar(email, clave) {
  const ctx = await navegador.newContext();
  const p = await ctx.newPage();
  await p.goto(`${BASE}/login`, { waitUntil: "networkidle", timeout: 60_000 });
  await p.fill('input[name="email"]', email);
  await p.fill('input[name="password"]', clave);
  await p.click('button[type="submit"]');
  await p.waitForURL(/\/(panel|fidelli)/, { timeout: 120_000 });
  const sesion = await ctx.storageState();
  await ctx.close();
  return sesion;
}
async function abrir(sesion) {
  const ctx = await navegador.newContext({
    viewport: { width: 390, height: 844 },
    deviceScaleFactor: 2,
    locale: "es-AR",
    hasTouch: true,
    isMobile: true,
    ...(sesion ? { storageState: sesion } : {}),
  });
  const page = await ctx.newPage();
  page.setDefaultTimeout(120_000);
  return { ctx, page };
}

try {
  const sesionOwner = await entrar("demo@fidellimotors.app", "demo1234");
  const { ctx, page } = await abrir(sesionOwner);
  const pedidos = [];
  page.on("request", (r) => pedidos.push({ url: r.url(), t: Date.now() }));
  const desde = () => pedidos.length;
  const rpcDesde = (n) => pedidos.slice(n).filter((p) => p.url.includes("/rest/v1/rpc/buscar_vehiculo_por_patente"));
  const AVISO = "No parece una patente";

  // `next dev` compila la ruta en el primer pedido: una visita de calentamiento.
  await page.goto(`${BASE}/panel/services/nuevo`, { waitUntil: "networkidle" });
  await page.waitForSelector("#patente");

  // Devuelve el instante de la última tecla. Las primeras van con 70 ms
  // entre una y otra; la última sin `delay`, porque `page.type` con delay
  // espera ESE delay después de la tecla antes de resolver, y el instante
  // quedaría 70 ms tarde: la espera de 300 ms se medía como 236 (se vio).
  async function tipear(texto) {
    await page.fill("#patente", "");
    await page.waitForTimeout(400);
    await page.type("#patente", texto.slice(0, -1), { delay: 70 });
    await page.type("#patente", texto.slice(-1));
    return Date.now();
  }

  // ---------- B1 · la brasileña ----------
  titulo("── B1 · «ABC1D23»: espera el debounce, abre el alta y se guarda ──");
  await paso("la patente brasileña", async () => {
    const n = desde();
    const ultimaTecla = await tipear("ABC1D23");
    await page.waitForSelector("text=¿De quién es?");
    const rpc = rpcDesde(n);
    check("una consulta a /rest/v1/rpc/buscar_vehiculo_por_patente", rpc.length === 1, `${rpc.length}`);
    check("ninguna consulta antes de la última tecla (ABC1D2 está incompleta)", rpc.every((p) => p.t >= ultimaTecla));
    const salida = rpc.length ? rpc[rpc.length - 1].t - ultimaTecla : null;
    check("la consulta parte después de los 300 ms de espera (no es argentina)", salida !== null && salida >= 280 && salida < 2000, `${salida} ms`);
    const main = (await page.textContent("main")) ?? "";
    check("no avisa de formato", !main.includes(AVISO));
  });

  await paso("el alta de cliente y auto nuevos con la patente brasileña", async () => {
    await page.click("text=Es un cliente nuevo");
    await page.waitForSelector("#nombre");
    await page.fill("#nombre", "Zzpat Brasil");
    await page.fill("#telefono", "3510000048");
    await page.click("button[type='submit']:has-text('Guardar y cargar trabajo')");
    await page.waitForURL(/\/panel\/services\/nuevo\/[0-9a-f-]{36}$/, { timeout: 120_000 });
    const fila = sql(`select patente || ' ' || patente_normalizada from vehiculos where lubricentro_id = '${LUB}' and patente_normalizada = 'ABC1D23'`);
    check("queda ABC1D23 en la base, con la patente como se escribió", fila === "ABC1D23 ABC1D23", fila);
  });

  await paso("/demo/ABC1D23 muestra el auto", async () => {
    const { ctx: anon, page: cliente } = await abrir(null);
    let respuesta = null;
    for (let intento = 0; intento < 3 && (!respuesta || respuesta.status() !== 200); intento++) {
      respuesta = await cliente.goto(`${BASE}/demo/abc1d23`, { waitUntil: "networkidle", timeout: 120_000 });
    }
    check("la página del cliente contesta 200", respuesta?.status() === 200, `${respuesta?.status()}`);
    const texto = (await cliente.textContent("body")) ?? "";
    check("y muestra ABC1D23 (la chapa brasileña, sin espacios)", texto.includes("ABC1D23"));
    await anon.close();
  });

  // ---------- B2 · la moto chilena ----------
  titulo("── B2 · «BBB12»: cinco caracteres abren el alta ──");
  await paso("la moto chilena", async () => {
    await page.goto(`${BASE}/panel/services/nuevo`, { waitUntil: "networkidle" });
    await page.waitForSelector("#patente");
    const n = desde();
    await tipear("BBB12");
    await page.waitForSelector("text=¿De quién es?");
    check("busca (una consulta) y abre «¿De quién es?»", rpcDesde(n).length === 1, `${rpcDesde(n).length}`);
    check("no avisa de formato", !((await page.textContent("main")) ?? "").includes(AVISO));
  });

  // ---------- B3 · la argentina sigue saliendo ya ----------
  titulo("── B3 · «ABC123»: la argentina sigue saliendo sin esperar ──");
  await paso("la argentina", async () => {
    const n = desde();
    const ultimaTecla = await tipear("ABC123");
    await page.waitForSelector("main a[href^='/panel/services/nuevo/']");
    const rpc = rpcDesde(n);
    const salida = rpc.length ? rpc[rpc.length - 1].t - ultimaTecla : null;
    check("la consulta parte antes de 250 ms de la última tecla", salida !== null && salida < 250, `${salida} ms`);
    // Con «ABC12» en el medio: es una moto chilena válida, pero la tecla
    // siguiente llegó antes de los 300 ms y no hubo consulta por ella.
    check("una sola consulta: «ABC12» no se buscó porque el 3 llegó antes de los 300 ms", rpc.length === 1, `${rpc.length}`);
  });

  // ---------- B4 · lo que no es patente avisa ----------
  titulo("── B4 · «ABCDE1»: avisa ──");
  await paso("el formato que todavía no existe", async () => {
    await tipear("ABCDE1");
    await page.waitForSelector(`text=${AVISO}`);
    check("el aviso nombra a los vecinos", ((await page.textContent("main")) ?? "").includes("Brasil, Uruguay, Paraguay, Bolivia y Chile"));
  });

  await ctx.close();
} catch (e) {
  check("la prueba corrió hasta el final", false, String(e.message ?? e).split("\n")[0]);
} finally {
  await navegador.close().catch(() => {});
  restaurar();
}

console.log(fallas === 0 ? "\nTODO VERDE" : `\n${fallas} FALLA(S)`);
process.exit(fallas === 0 ? 0 : 1);

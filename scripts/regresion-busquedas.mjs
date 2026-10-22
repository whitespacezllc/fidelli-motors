// Las búsquedas de clientes y la patente del alta (21/10/2026): el caso de
// Brothers Oil —«KXM616» devolvía cuatro clientes: el dueño del auto y tres
// con «616» adentro del celular— y la espera de la patente en «Nuevo
// trabajo» (regla 13: una prueba que nunca se vio en rojo no existe; esta
// se vio en rojo contra el front de `develop`, con la base ya migrada).
//
// Lo que cubre:
//   A · Sin navegador.
//       1 · filtroClientes (lib/clientes.ts, compilado con tsc): LA FORMA
//           DEL TÉRMINO DICE QUÉ ES. Letras y números juntos → solo
//           patentes; solo números → teléfono por sus DÍGITOS o patente;
//           solo letras → nombre o patente; lo que no entra en una patente →
//           los tres. Nunca la rama vieja `telefono.like`, y nada de lo que
//           el usuario escriba cambia la consulta (coma, punto, paréntesis).
//       2 · patenteIncompleta (lib/texto.ts): AB123C y A123BC todavía van a
//           ser otra cosa; ABC123, AB123CD, 123ABC y A123BCD no.
//       3 · Un solo filtro en el repo: `nombre_busqueda.like` vive solo en
//           lib/clientes.ts y `telefono.like` en ningún lado; el alta busca
//           por lib/busqueda-alta.ts y sus dos búsquedas ya no son acciones.
//   B · Con navegador (Playwright, 390×844 táctil), con seis clientes
//       «Zzbusq» cargados en el demo por psql y RESTAURADOS AL FINAL:
//       1 · Clientes: «ZBQ616» trae UN cliente (el dueño), «616» trae a los
//           tres del teléfono y al dueño de la patente, «3514445522»
//           encuentra el teléfono cargado como «351 444-5522», «ZBQ 616»
//           con espacio es la misma patente, «lopez 3515591616» encuentra
//           por el teléfono, y «zzbusq» los trae a todos.
//       2 · El alta: la patente válida SALE YA (la consulta parte antes de
//           250 ms de la última tecla, sin los 300 ms de espera) y va
//           DIRECTO a PostgREST (una llamada a /rest/v1/rpc/…, ninguna
//           Server Action); «AB123C» no busca nada hasta la D; una patente
//           nueva abre «¿De quién es?», que busca por teléfono, por nombre
//           y por la patente de OTRO auto del cliente, también contra
//           /rest/v1 directo.
//       3 · /fidelli: la ficha del tenant, solapa Datos, encuentra lo mismo
//           que el panel con «ZBQ616».
//
// Requiere el stack local y el servidor de Next:
//   supabase start && npm run dev
//   node --no-warnings scripts/regresion-busquedas.mjs
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

// ============================================================
// A1 · filtroClientes y A2 · patenteIncompleta, compilados con tsc
// ============================================================
function compilarLibs() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "fm-busquedas-"));
  fs.copyFileSync(path.join(RAIZ, "lib/texto.ts"), path.join(dir, "texto.ts"));
  const clientes = fs
    .readFileSync(path.join(RAIZ, "lib/clientes.ts"), "utf8")
    .replace(/from "@\/lib\/texto"/g, 'from "./texto"');
  fs.writeFileSync(path.join(dir, "clientes.ts"), clientes);
  execFileSync(TSC, [
    "--module", "commonjs", "--target", "es2022", "--moduleResolution", "node",
    "--skipLibCheck", "--strict", "--outDir", path.join(dir, "out"),
    path.join(dir, "texto.ts"), path.join(dir, "clientes.ts"),
  ], { stdio: "pipe" });
  return {
    texto: require(path.join(dir, "out", "texto.js")),
    clientes: require(path.join(dir, "out", "clientes.js")),
  };
}

titulo("── A1 · filtroClientes: la forma del término dice qué es ──");
let libs = null;
await paso("lib/texto.ts y lib/clientes.ts compilan solos", async () => {
  libs = compilarLibs();
});

if (libs) {
  const { filtroClientes } = libs.clientes;
  const porNombre = (t) => `nombre_busqueda.like.*${t}*`;
  const porTelefono = (d) => `telefono_digitos.like.*${d}*`;
  const porPatente = (p) => `patentes.like.*${p}*`;

  const CASOS = [
    // Letras y números juntos: una patente, y nada más.
    ["KXM616", "patente", [porPatente("KXM616")]],
    ["kxm 616", "patente", [porPatente("KXM616")]],
    ["KXM6", "patente", [porPatente("KXM6")]],
    ["AB123CD", "patente", [porPatente("AB123CD")]],
    ["a 123 bcd", "patente", [porPatente("A123BCD")]],
    ["AB-123-CD", "patente", [porPatente("AB123CD")]],
    // Solo números: un teléfono (por sus dígitos) o una patente de moto vieja.
    ["616", "telefono", [porTelefono("616"), porPatente("616")]],
    ["3513172545", "telefono", [porTelefono("3513172545"), porPatente("3513172545")]],
    ["351 317-2545", "telefono", [porTelefono("3513172545"), porPatente("3513172545")]],
    // Solo letras: un nombre o las letras de una patente.
    ["bruno", "nombre", [porNombre("bruno"), porPatente("BRUNO")]],
    ["Gómez", "nombre", [porNombre("gomez"), porPatente("GMEZ")]],
    ["matias lopez", "nombre", [porNombre("matias lopez"), porPatente("MATIASLOPEZ")]],
    // Letras y números que no entran en una patente: los tres.
    ["lopez 3515591616", "todo", [porNombre("lopez 3515591616"), porTelefono("3515591616"), porPatente("LOPEZ3515591616")]],
  ];
  for (const [termino, forma, esperado] of CASOS) {
    const r = filtroClientes(termino);
    check(`«${termino}» → ${forma}`, r.forma === forma && r.filtros === esperado.join(","),
      `forma=${r.forma} filtros=${r.filtros}`);
  }
  for (const vacio of ["", "   ", undefined, ",.()*"]) {
    const r = filtroClientes(vacio);
    check(`«${vacio ?? "undefined"}» no filtra nada`, r.filtros === null && r.termino === "" && r.forma === null, JSON.stringify(r));
  }
  {
    const r = filtroClientes("go,me(z).*or");
    check("la coma, el punto, el paréntesis y el asterisco no llegan a la consulta",
      r.filtros !== null && !/[,.()*]/.test(r.filtros.replace(/\.like\.\*|\*,|\*$/g, "")) && r.termino === "go me z or",
      `${r.termino} · ${r.filtros}`);
  }
  check("ningún filtro vuelve a la rama vieja telefono.like",
    CASOS.every(([t]) => !/(^|,)telefono\.like/.test(filtroClientes(t).filtros ?? "")));

  titulo("── A2 · patenteIncompleta ──");
  // En un paso: contra el front viejo la función no existe, y eso es una
  // falla más, no el final de la corrida.
  await paso("patenteIncompleta existe", async () => {
    const { patenteIncompleta, esPatenteValida, PATENTE_LARGO_MINIMO, PATENTE_LARGO_MAXIMO } = libs.texto;
    check("los largos son 6 y 7", PATENTE_LARGO_MINIMO === 6 && PATENTE_LARGO_MAXIMO === 7);
    for (const [p, esperado] of [
      ["AB123C", true], ["ab 123 c", true], ["A123BC", true],
      ["ABC12", true], ["A", true], ["", true],
      ["ABC123", false], ["AB123CD", false], ["123ABC", false], ["A123BCD", false],
      ["KXM616", false], ["AB12CD", false], ["ABCDEF", false],
    ]) {
      check(`patenteIncompleta(«${p}») = ${esperado}`, patenteIncompleta(p) === esperado);
    }
    check("una patente válida nunca está incompleta",
      ["ABC123", "AB123CD", "123ABC", "A123BCD"].every((p) => esPatenteValida(p) && !patenteIncompleta(p)));
  });
}

// ============================================================
// A3 · un solo filtro en el repo, y el alta sin acciones de lectura
// ============================================================
titulo("── A3 · un solo filtro en el repo ──");
function archivosTs(dir) {
  const salida = [];
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    if (e.name === "node_modules" || e.name.startsWith(".")) continue;
    const p = path.join(dir, e.name);
    if (e.isDirectory()) salida.push(...archivosTs(p));
    else if (/\.tsx?$/.test(e.name)) salida.push(p);
  }
  return salida;
}
{
  const archivos = ["app", "components", "lib"].flatMap((d) => archivosTs(path.join(RAIZ, d)));
  const conNombre = archivos.filter((f) => fs.readFileSync(f, "utf8").includes("nombre_busqueda.like"));
  const conTelefono = archivos.filter((f) => /\btelefono\.like\b/.test(fs.readFileSync(f, "utf8")));
  check("«nombre_busqueda.like» vive solo en lib/clientes.ts",
    conNombre.length === 1 && conNombre[0].endsWith("lib/clientes.ts"), conNombre.map((f) => path.relative(RAIZ, f)).join(", "));
  check("«telefono.like» no vuelve en ningún archivo", conTelefono.length === 0, conTelefono.map((f) => path.relative(RAIZ, f)).join(", "));

  const acciones = fs.readFileSync(path.join(RAIZ, "app/panel/(tras-onboarding)/services/nuevo/actions.ts"), "utf8");
  check("las dos búsquedas del alta ya no son Server Actions",
    !/export async function (buscarPorPatente|buscarClientes)\b/.test(acciones) && !acciones.includes("obtenerSesion"));
  const identificar = fs.readFileSync(path.join(RAIZ, "components/services/identificar-vehiculo.tsx"), "utf8");
  const panelAlta = fs.readFileSync(path.join(RAIZ, "components/services/panel-alta.tsx"), "utf8");
  check("identificar-vehiculo y panel-alta buscan por lib/busqueda-alta.ts con el cliente del navegador",
    [identificar, panelAlta].every((s) => s.includes('from "@/lib/busqueda-alta"') && s.includes('from "@/lib/supabase/client"')));
  const busquedaAlta = fs.readFileSync(path.join(RAIZ, "lib/busqueda-alta.ts"), "utf8");
  check("el «¿De quién es?» usa el MISMO filtro que el listado (filtroClientes)",
    busquedaAlta.includes("filtroClientes(") && busquedaAlta.includes('from "@/lib/clientes"'));
}

if (process.env.SOLO_A) {
  console.log(fallas === 0 ? "\nTODO VERDE" : `\n${fallas} FALLA(S)`);
  process.exit(fallas === 0 ? 0 : 1);
}

// ============================================================
// B · con navegador
// ============================================================
const { chromium } = await import("playwright");

function sql(texto) {
  return execFileSync(
    "docker",
    ["exec", "-i", CONTENEDOR, "psql", "-U", "postgres", "-d", "postgres", "-X", "-q", "-A", "-t", "-v", "ON_ERROR_STOP=1"],
    { input: texto, encoding: "utf8" },
  ).trim();
}

const LUB = sql("select id from lubricentros where slug = 'demo'");
if (!LUB) {
  console.error("No está el lubricentro demo: supabase db reset");
  process.exit(1);
}

// Los seis clientes de prueba. Patentes propias (ZBQ…) y nombres con prefijo.
const FIXTURES = [
  { nombre: "Zzbusq Bruno", telefono: "3513172545", patentes: ["ZBQ616"] },
  { nombre: "Zzbusq Gabriel", telefono: "3516168821", patentes: ["ZBQ001"] },
  { nombre: "Zzbusq Marcela", telefono: "3516161193", patentes: ["ZBQ002"] },
  { nombre: "Zzbusq Matias Lopez", telefono: "3515591616", patentes: ["ZBQ003"] },
  { nombre: "Zzbusq Espacios", telefono: "351 444-5522", patentes: ["ZBQ004"] },
  { nombre: "Zzbusq Dosautos", telefono: "3519990000", patentes: ["ZBQ005", "ZBQ006"] },
];
const DE_PRUEBA = `(select id from clientes where lubricentro_id = '${LUB}' and nombre like 'Zzbusq %')`;

function restaurar() {
  sql(`
    delete from services where vehiculo_id in (select id from vehiculos where cliente_id in ${DE_PRUEBA});
    delete from vehiculos where cliente_id in ${DE_PRUEBA};
    delete from clientes where id in ${DE_PRUEBA};
  `);
}
restaurar();
sql(`do $$
declare v_c uuid;
begin
${FIXTURES.map((f) => `
  insert into clientes (lubricentro_id, nombre, telefono) values ('${LUB}', '${f.nombre}', '${f.telefono}') returning id into v_c;
${f.patentes.map((p) => `  insert into vehiculos (lubricentro_id, cliente_id, patente, marca, modelo) values ('${LUB}', v_c, '${p}', 'Fiat', 'Uno');`).join("\n")}`).join("\n")}
end $$;`);

const navegador = await chromium.launch({ args: ["--lang=es-AR"] });
const soloFixtures = (nombres) => nombres.filter((n) => n.startsWith("Zzbusq ")).sort();
const esperar = (nombres) => nombres.map((n) => `Zzbusq ${n}`).sort();
const igual = (a, b) => JSON.stringify(a) === JSON.stringify(b);

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
    storageState: sesion,
  });
  const page = await ctx.newPage();
  page.setDefaultTimeout(120_000);
  return { ctx, page };
}

try {
  const sesionOwner = await entrar("demo@fidellimotors.app", "demo1234");

  // ---------- B1 · Clientes ----------
  titulo("── B1 · Clientes ──");
  {
    const { ctx, page } = await abrir(sesionOwner);
    // `next dev` compila la ruta en el primer pedido: una visita de calentamiento.
    await page.goto(`${BASE}/panel/clientes`, { waitUntil: "networkidle" });

    async function filas(q) {
      await page.goto(`${BASE}/panel/clientes?q=${encodeURIComponent(q)}`, { waitUntil: "networkidle" });
      // La lista real, no el esqueleto de loading.tsx (que también tiene <li>).
      await page.waitForFunction(() => {
        const m = document.querySelector("main");
        if (!m || m.querySelector("[data-esqueleto]")) return false;
        return Boolean(m.querySelector("ul li a") || m.querySelector(".surface-card p.font-brand"));
      }, null, { timeout: 120_000 });
      // El nombre es el primer renglón del link de cada fila (FilaCliente).
      return page.$$eval("main ul li a > span:first-child > span:first-child", (els) =>
        els.map((e) => e.textContent?.trim() ?? ""));
    }

    await paso("«ZBQ616» trae un solo cliente", async () => {
      const f = await filas("ZBQ616");
      check("«ZBQ616» → solo Zzbusq Bruno", igual(soloFixtures(f), esperar(["Bruno"])) && f.length === 1,
        `${f.length} filas: ${f.slice(0, 5).join(" · ")}`);
    });
    await paso("«ZBQ 616» con espacio es la misma patente", async () => {
      const f = await filas("ZBQ 616");
      check("«ZBQ 616» → solo Zzbusq Bruno", igual(soloFixtures(f), esperar(["Bruno"])) && f.length === 1, `${f.length} filas`);
    });
    await paso("«616» es un teléfono o una patente", async () => {
      const f = await filas("616");
      check("«616» → los tres del teléfono y el dueño de ZBQ616",
        igual(soloFixtures(f), esperar(["Bruno", "Gabriel", "Marcela", "Matias Lopez"])), soloFixtures(f).join(" · "));
    });
    await paso("el teléfono cargado con espacios se encuentra por sus dígitos", async () => {
      const f = await filas("3514445522");
      check("«3514445522» → Zzbusq Espacios (cargado como «351 444-5522»)", igual(soloFixtures(f), esperar(["Espacios"])), soloFixtures(f).join(" · "));
    });
    await paso("«lopez 3515591616» encuentra por el teléfono", async () => {
      const f = await filas("lopez 3515591616");
      check("«lopez 3515591616» → Zzbusq Matias Lopez", igual(soloFixtures(f), esperar(["Matias Lopez"])), soloFixtures(f).join(" · "));
    });
    await paso("«zzbusq» los trae a todos", async () => {
      const f = await filas("zzbusq");
      check("«zzbusq» → los seis", igual(soloFixtures(f), esperar(FIXTURES.map((x) => x.nombre.slice(7)))), soloFixtures(f).join(" · "));
    });
    await paso("el export con filtro responde", async () => {
      const r = await page.request.get(`${BASE}/panel/clientes/exportar?q=ZBQ616`);
      check("GET /panel/clientes/exportar?q=ZBQ616 → 200 y un xlsx", r.status() === 200 && /spreadsheetml/.test(r.headers()["content-type"] ?? ""),
        `${r.status()} ${r.headers()["content-type"]}`);
    });
    await ctx.close();
  }

  // ---------- B2 · el alta ----------
  titulo("── B2 · el alta: la patente sale ya y va directo a PostgREST ──");
  {
    const { ctx, page } = await abrir(sesionOwner);
    const pedidos = [];
    page.on("request", (r) => pedidos.push({ url: r.url(), metodo: r.method(), accion: r.headers()["next-action"] ?? null, t: Date.now() }));
    const desde = () => pedidos.length;
    const nuevos = (n) => pedidos.slice(n);
    const aRest = (lista, que) => lista.filter((p) => p.url.includes(`/rest/v1/${que}`));
    const acciones = (lista) => lista.filter((p) => p.accion);

    await page.goto(`${BASE}/panel/services/nuevo`, { waitUntil: "networkidle" });
    await page.waitForSelector("#patente");

    async function tipear(selector, texto) {
      await page.fill(selector, "");
      for (const c of texto) await page.type(selector, c, { delay: 70 });
      return Date.now();
    }

    await paso("la patente válida sale ya y encuentra al dueño", async () => {
      const n = desde();
      const ultimaTecla = await tipear("#patente", "ZBQ616");
      await page.waitForSelector("main a[href^='/panel/services/nuevo/']");
      const ficha = Date.now();
      const rpc = aRest(nuevos(n), "rpc/buscar_vehiculo_por_patente");
      check("una llamada directa a /rest/v1/rpc/buscar_vehiculo_por_patente", rpc.length >= 1, `${rpc.length}`);
      check("ninguna Server Action en la búsqueda", acciones(nuevos(n)).length === 0, `${acciones(nuevos(n)).length} POST con next-action`);
      const salida = rpc.length ? rpc[rpc.length - 1].t - ultimaTecla : null;
      check("la consulta parte antes de 250 ms de la última tecla (sin los 300 ms de espera)", salida !== null && salida < 250, `${salida} ms`);
      const texto = await page.textContent("main");
      check("la mini-ficha dice Zzbusq Bruno", /Zzbusq Bruno/.test(texto ?? ""));
      console.log(`    ficha en pantalla a los ${ficha - ultimaTecla} ms de la última tecla (local)`);
    });

    await paso("AB123C no busca nada hasta la D", async () => {
      const n = desde();
      await tipear("#patente", "AB123C");
      await page.waitForTimeout(700);
      check("con «AB123C» no hay consulta ni «¿De quién es?»",
        aRest(nuevos(n), "rpc/").length === 0 && !(await page.textContent("main"))?.includes("¿De quién es?"));
      const m = desde();
      await page.type("#patente", "D", { delay: 70 });
      await page.waitForSelector("text=¿De quién es?");
      check("con la D busca, y la patente nueva abre «¿De quién es?»", aRest(nuevos(m), "rpc/buscar_vehiculo_por_patente").length >= 1);
    });

    await paso("«¿De quién es?» busca por teléfono, nombre y la patente de otro auto, directo a PostgREST", async () => {
      const campo = 'input[aria-label="Buscar cliente"]';
      await page.waitForSelector(campo);
      async function sugeridos(termino) {
        // Primero vacío, y a esperar que la lista anterior se vaya: si no,
        // se leería la sugerencia del término de antes.
        await page.fill(campo, "");
        await page.waitForFunction(() => !document.querySelector("main li button"), null, { timeout: 30_000 });
        const n = desde();
        for (const c of termino) await page.type(campo, c, { delay: 70 });
        await page.waitForFunction(() => {
          const m = document.querySelector("main");
          return m && (m.querySelectorAll("li button").length > 0 || /Ningún cliente/.test(m.textContent ?? ""));
        }, null, { timeout: 60_000 });
        // Deja llegar la última consulta antes de leer.
        await page.waitForTimeout(500);
        const nombres = await page.$$eval("main li button > span:first-child > span:first-child", (els) =>
          els.map((e) => e.textContent?.trim() ?? ""));
        return { nombres: soloFixtures(nombres), rest: aRest(nuevos(n), "vista_clientes").length, acciones: acciones(nuevos(n)).length };
      }
      // Las sugerencias son 8 como mucho: los términos de acá apuntan a los
      // fixtures sin depender de qué más haya en el demo.
      const q = await sugeridos("Q616");
      check("«Q616» (letras y números) → solo el dueño de ZBQ616, ningún teléfono con 616", igual(q.nombres, esperar(["Bruno"])), q.nombres.join(" · "));
      check("la búsqueda fue directa a /rest/v1/vista_clientes, sin Server Action", q.rest >= 1 && q.acciones === 0, `rest=${q.rest} acciones=${q.acciones}`);
      const t = await sugeridos("591616");
      check("«591616» (solo números) → Zzbusq Matias Lopez por el teléfono", igual(t.nombres, esperar(["Matias Lopez"])), t.nombres.join(" · "));
      const p = await sugeridos("ZBQ006");
      check("«ZBQ006» → el dueño del OTRO auto (Zzbusq Dosautos)", igual(p.nombres, esperar(["Dosautos"])), p.nombres.join(" · "));
      const nom = await sugeridos("espac");
      check("«espac» → Zzbusq Espacios", igual(nom.nombres, esperar(["Espacios"])), nom.nombres.join(" · "));
      const tel = await sugeridos("3514445522");
      check("«3514445522» → Zzbusq Espacios por los dígitos", igual(tel.nombres, esperar(["Espacios"])), tel.nombres.join(" · "));
    });
    await ctx.close();
  }

  // ---------- B3 · /fidelli ----------
  titulo("── B3 · /fidelli: la ficha encuentra lo mismo ──");
  await paso("la solapa Datos con «ZBQ616»", async () => {
    const sesionSuper = await entrar("santi@fidellimotors.app", "demo1234");
    const { ctx, page } = await abrir(sesionSuper);
    await page.goto(`${BASE}/fidelli/${LUB}?tab=datos&ver=clientes&q=ZBQ616`, { waitUntil: "networkidle", timeout: 120_000 });
    // La tabla real, no el esqueleto.
    await page.waitForFunction(() => {
      const m = document.querySelector("main");
      return m && !m.querySelector("[data-esqueleto]") && /Zzbusq|Ningún cliente/.test(m.textContent ?? "");
    }, null, { timeout: 120_000 });
    const texto = await page.textContent("main");
    const nombres = FIXTURES.map((f) => f.nombre).filter((n) => texto?.includes(n));
    check("«ZBQ616» en la ficha → solo Zzbusq Bruno", igual(nombres, ["Zzbusq Bruno"]), nombres.join(" · "));
    await ctx.close();
  });
} catch (e) {
  check("la prueba corrió hasta el final", false, String(e.message ?? e).split("\n")[0]);
} finally {
  await navegador.close().catch(() => {});
  restaurar();
}

console.log(fallas === 0 ? "\nTODO VERDE" : `\n${fallas} FALLA(S)`);
process.exit(fallas === 0 ? 0 : 1);

// La superficie del cliente cuando la base NO CONTESTA (regla 13: una
// prueba que nunca se vio en rojo no existe).
//
// El caso: `get_carton` falla —un corte entre Vercel y Supabase, el
// statement_timeout de `anon`, PostgREST recargando el schema cache— y el
// dueño del auto que escaneó el QR veía un 404 («No encontramos ese
// taller»), o «No encontramos esa patente» si venía del buscador. Las dos
// cosas son mentira: el taller existe y el historial también.
//
// SE VIO EN ROJO dos veces. Sobre `develop`, sin el arreglo: 66 fallas (un
// 404 ante cualquier falla de las dos puertas, «No encontramos esa patente»
// desde el buscador, los manifests en 404, dos llamadas a get_landing por
// pedido). Y con el arreglo puesto, rompiendo a mano cada regla nueva de a
// una —dieciséis roturas, ninguna se escapó—:
//   · get_carton repetida a ciegas (7 en rojo: la que importa es la de las
//     DOS filas en landing_busquedas) y sin repetirse nunca (13);
//   · «contestó» sin mirar el status (4: el 404 vacío de get_landing vuelve
//     a leerse como «el taller no existe»);
//   · un `null` de get_carton aceptado como respuesta (1: la página da 500);
//   · el bug original puesto de vuelta en lib/cliente/carton.ts (19);
//   · la marca de cortesía pedida como la vidriera, con reintento y sin
//     plazo (2), y sin el plazo solo (1: con get_landing colgada la página
//     no contesta en 30 segundos); obtenerLanding sin `cache` (6);
//   · el respaldo del cartón sin su 404 (1);
//   · la búsqueda sin respuesta mandando a la pantalla del auto (8: dos
//     llamadas y dos filas, el reintento ciego con otro nombre) y mandando
//     a «?nohay=» (6);
//   · el rojo Motors en el título (3), la vidriera sin respuesta indexable
//     (1), el manifest de vuelta en 404 (1), el estado sin «Reintentar» (14)
//     y los dos logs sacados (3).
// Una enseñó algo: sin `cache`, «el título dice lo mismo que la página» NO
// se pone en rojo cuando la falla es de una sola vez —el reintento la
// tapa—; la que la acusa es la cuenta de llamadas (3 en vez de 2).
//
// CÓMO SE HACE FALLAR LA LLAMADA sin tocar la base compartida: el script
// levanta un DOBLE DE SUPABASE (un proxy en el 4030) y su propio `next dev`
// (en el 3940) con NEXT_PUBLIC_SUPABASE_URL apuntando al doble. El doble
// reenvía todo al stack local tal cual, salvo cuando se le pide que una de
// las dos puertas falle, y cuenta cuántas veces se llamó a cada una.
//
// Lo que cubre:
//   A · El doble contra la realidad (regla 19): la forma del error que
//       fabrica es la que contesta el PostgREST local, medida en el momento.
//   B · La línea de base y EL CONTRACASO: con todo contestando, el cartón
//       y la vidriera responden 200; un slug que no existe sigue siendo un
//       404 de verdad (página y manifest); una patente que no existe sigue
//       siendo «No encontramos esa patente». Y la vidriera hace UNA llamada
//       a get_landing por pedido, no dos.
//   C · get_carton no contesta → la página NO es un 404: es «No pudimos
//       cargar el historial», con «Reintentar» (la misma URL), pintada con
//       la marca del lubricentro (get_landing sí contesta), noindex y sin
//       caché. Con cada forma de falla: PostgREST con código (el de
//       verdad, 42501; PGRST002; 57014), el gateway sin código (502), la
//       conexión cortada, el 404 vacío y el `null`.
//   D · EL REINTENTO, que es la mitad delicada: get_carton REGISTRA la
//       búsqueda en landing_busquedas. Se repite sola una vez SOLO cuando
//       el error trae un código de PostgREST o de Postgres (ahí la
//       transacción no se confirmó). Una falla y después contesta → el
//       cartón, dos llamadas, UNA fila. La respuesta que se pierde con la
//       función ya ejecutada → una llamada, UNA fila: no se reintenta a
//       ciegas, porque duplicaría.
//   E · Todo caído (ninguna de las dos puertas contesta) → el mismo estado,
//       neutro: sin marca, sin color de tenant; y con get_landing COLGADA
//       tampoco se queda esperándola (la marca es de cortesía, con plazo).
//       La vidriera: «No pudimos cargar la página». Los manifests: 503 sin
//       caché, no 404.
//   F · get_carton no contesta y get_landing dice que el slug no existe →
//       404: ahí sí se sabe.
//   G · get_landing, que no escribe, se repite una vez ante cualquier falla.
//   H · La búsqueda de la vidriera (con y sin JavaScript): si get_carton no
//       contesta NO dice «No encontramos esa patente»; dice «No pudimos
//       buscar la patente», con la patente escrita, y reintentar es tocar
//       el botón de nuevo.
//   I · Con navegador, en 390 táctil: ni un píxel del rojo Motors (tampoco
//       en el foco), el botón de 44 px o más, cero scroll horizontal, y
//       «Reintentar» trae el cartón cuando la base vuelve.
//
// Requiere el stack local con el seed (el tenant `demo`). El servidor de
// Next lo levanta el script; Next 16 admite UN `next dev` por directorio,
// así que si en este checkout ya hay uno corriendo hay que frenarlo, o
// pasar el propio con BASE_URL (tiene que haber arrancado con
// NEXT_PUBLIC_SUPABASE_URL=http://127.0.0.1:4030).
// Correr:
//   node --no-warnings scripts/regresion-sin-respuesta.mjs
//   CAPTURAS=1 node --no-warnings scripts/regresion-sin-respuesta.mjs
//     (además deja las capturas en docs/capturas/sin-respuesta/)
//   SOLO=CD node --no-warnings scripts/regresion-sin-respuesta.mjs
//     (solo esas secciones)
//
// Contra el build de producción, que es donde importa el «sin caché»:
//   SOLO_DOBLE=1 node scripts/regresion-sin-respuesta.mjs &     # el doble solo
//   NEXT_PUBLIC_SUPABASE_URL=http://127.0.0.1:4030 npx next build
//   (frenar el doble)
//   NEXT_PUBLIC_SUPABASE_URL=http://127.0.0.1:4030 npx next start -p 3941 &
//   BASE_URL=http://localhost:3941 PRODUCCION=1 node --no-warnings scripts/regresion-sin-respuesta.mjs
//
// Contra `next start` no se miran los logs del servidor (no es del script)
// y se suman las dos comprobaciones de `no-store`.
//
// Las búsquedas que registra en el demo local las borra al terminar. No
// toca nada fuera de local.
import fs from "node:fs";
import http from "node:http";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { spawn, execFileSync } from "node:child_process";
import { chromium } from "playwright";

const RAIZ = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const env = Object.fromEntries(
  fs.readFileSync(path.join(RAIZ, ".env.local"), "utf8").split("\n")
    .filter((l) => l.includes("=") && !l.startsWith("#"))
    .map((l) => { const i = l.indexOf("="); return [l.slice(0, i), l.slice(i + 1).trim()]; }));

const REAL = new URL(env.NEXT_PUBLIC_SUPABASE_URL ?? "http://sin-configurar");
if (!["127.0.0.1", "localhost"].includes(REAL.hostname)) {
  console.error(`.env.local apunta a ${REAL.host}: esta prueba corre SOLO contra el stack local.`);
  process.exit(1);
}
const ANON = env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

const PUERTO_DOBLE = Number(process.env.PUERTO_DOBLE ?? 4030);
const PUERTO_NEXT = Number(process.env.PUERTO_NEXT ?? 3940);
const BASE = process.env.BASE_URL ?? `http://localhost:${PUERTO_NEXT}`;
// Con BASE_URL apuntando a un `next start` (el build tiene que haberse hecho
// con NEXT_PUBLIC_SUPABASE_URL=http://127.0.0.1:4030): PRODUCCION=1 suma las
// comprobaciones que solo valen ahí.
const PRODUCCION = process.env.PRODUCCION === "1";
const CAPTURAS = process.env.CAPTURAS === "1";
// SOLO=CDG corre solo esas secciones (las letras de arriba).
const SOLO = (process.env.SOLO ?? "").toUpperCase();
const toca = (letra) => !SOLO || SOLO.includes(letra);
const DIR_CAPTURAS = path.join(RAIZ, "docs/capturas/sin-respuesta");

// Un auto del seed que ninguna otra regresión mira por la superficie del
// cliente: las cuentas de landing_busquedas son por patente.
const PATENTE = "PQR890";
const PATENTE_LEGIBLE = "PQR 890";
const SLUG_FALSO = "zz-taller-que-no-existe";
const PATENTE_FALSA = "ZZ999ZZ";

const sql = (q) => execFileSync("docker",
  ["exec", "-i", "supabase_db_fidelli-motors", "psql", "-U", "postgres", "-d", "postgres", "-X", "-q", "-tA", "-c", q],
  { encoding: "utf8" }).trim();

let fallas = 0;
const check = (nombre, cond, detalle = "") => {
  console.log(`  ${cond ? "✓" : "✗ FALLA"} ${nombre}${cond || !detalle ? "" : "  → " + detalle}`);
  if (!cond) fallas++;
};

// ════════════════════════════════════════════════════════════════════
// El doble de Supabase
// ════════════════════════════════════════════════════════════════════
//
// Cada puerta tiene un modo y una cantidad de veces; agotadas, vuelve a
// «pasa». Los modos:
//
//   pasa        reenvía al stack local, tal cual.
//   denegado    reenvía, pero a una función que `anon` no puede ejecutar:
//               el error lo contesta el PostgREST DE VERDAD (401 · 42501).
//               Es lo que se vería si alguien revocara el execute.
//   recargando  503 · PGRST002, lo que contesta PostgREST sin schema cache.
//   timeout     500 · 57014, el statement_timeout de `anon` (3 s).
//   gateway     502 sin código: quien contesta es Kong, no PostgREST.
//   vacia       404 con cuerpo vacío (postgrest-js lo vuelve data null SIN
//               error: la forma más traicionera de «no contestó»).
//   nulo        200 con `null`.
//   corta       cierra la conexión sin reenviar: la función no corrió.
//   pierde      reenvía, la función CORRE (y registra la búsqueda), y
//               cierra la conexión sin contestar: desde el servidor de
//               Next es indistinguible de «corta».
//   oscuro      reenvía y contesta lo que contestó la base, con el tema del
//               lubricentro en oscuro (para no tocarle la marca al demo).
//   cuelga      ni contesta ni corta: la conexión queda abierta.
const FIJOS = {
  recargando: [503, { code: "PGRST002", details: null, hint: null, message: "Could not query the database for the schema cache. Retrying." }],
  timeout: [500, { code: "57014", details: null, hint: null, message: "canceling statement due to statement timeout" }],
  gateway: [502, { message: "An invalid response was received from the upstream server" }],
  vacia: [404, ""],
  nulo: [200, null],
};
const FUNCION_DENEGADA = "resumen_admin";

const plan = { get_carton: { modo: "pasa", veces: 0 }, get_landing: { modo: "pasa", veces: 0 } };
const llamadas = { get_carton: 0, get_landing: 0 };
const poner = (puerta, modo, veces = Infinity) => { plan[puerta] = { modo, veces }; };
const colgados = new Set();
const limpiar = () => {
  for (const socket of colgados) socket.destroy();
  colgados.clear();
  poner("get_carton", "pasa", 0);
  poner("get_landing", "pasa", 0);
  llamadas.get_carton = 0;
  llamadas.get_landing = 0;
};

function alStackLocal(req, ruta, cuerpo, alTerminar) {
  const arriba = http.request(
    {
      hostname: REAL.hostname,
      port: REAL.port,
      path: ruta,
      method: req.method,
      // Sin accept-encoding: lo que vuelve se lee (y en «oscuro» se reescribe).
      headers: { ...req.headers, host: REAL.host, "content-length": cuerpo.length, connection: "close", "accept-encoding": "identity" },
      // Una conexión por pedido, en las dos puntas: un socket reusado que
      // el otro lado ya cerró es una falla de red de verdad, y acá las
      // fallas tienen que ser solo las que la prueba pide.
      agent: false,
    },
    (r) => {
      const partes = [];
      r.on("data", (t) => partes.push(t));
      r.on("end", () => alTerminar(r, Buffer.concat(partes)));
    },
  );
  arriba.on("error", (e) => alTerminar(null, Buffer.from(String(e))));
  arriba.end(cuerpo);
}

const doble = http.createServer((req, res) => {
  const trozos = [];
  req.on("data", (t) => trozos.push(t));
  req.on("end", () => {
    const cuerpo = Buffer.concat(trozos);
    const puerta = /\/rest\/v1\/rpc\/(get_carton|get_landing)\b/.exec(req.url ?? "")?.[1];
    let modo = "pasa";
    if (puerta) {
      llamadas[puerta]++;
      if (plan[puerta].veces > 0) {
        modo = plan[puerta].modo;
        plan[puerta].veces--;
      }
    }

    if (modo === "corta") return req.socket.destroy();
    if (modo === "cuelga") return colgados.add(req.socket);

    if (FIJOS[modo]) {
      const [status, contenido] = FIJOS[modo];
      const texto = contenido === "" ? "" : JSON.stringify(contenido);
      res.writeHead(status, {
        "content-type": "application/json; charset=utf-8",
        "content-length": Buffer.byteLength(texto),
        connection: "close",
      });
      return res.end(texto);
    }

    const denegado = modo === "denegado";
    alStackLocal(
      req,
      denegado ? `/rest/v1/rpc/${FUNCION_DENEGADA}` : req.url,
      denegado ? Buffer.from("{}") : cuerpo,
      (r, respuesta) => {
        if (modo === "pierde") return req.socket.destroy();
        if (!r) { res.writeHead(502); return res.end(respuesta); }
        if (modo === "oscuro" && r.statusCode === 200) {
          respuesta = Buffer.from(JSON.stringify({ ...JSON.parse(respuesta.toString("utf8")), tema: "oscuro" }));
        }
        const cabeceras = { ...r.headers, "content-length": respuesta.length, connection: "close" };
        delete cabeceras["transfer-encoding"];
        res.writeHead(r.statusCode ?? 502, cabeceras);
        res.end(respuesta);
      },
    );
  });
});

// ════════════════════════════════════════════════════════════════════
// El servidor de Next y los ayudantes
// ════════════════════════════════════════════════════════════════════

let next = null;
let registro = "";
function arrancarNext() {
  next = spawn(
    process.execPath,
    [path.join(RAIZ, "node_modules/next/dist/bin/next"), "dev", "-p", String(PUERTO_NEXT)],
    {
      cwd: RAIZ,
      // El entorno del proceso gana sobre .env.local: de acá sale que el
      // servidor de prueba le hable al doble y no al stack.
      env: { ...process.env, NEXT_PUBLIC_SUPABASE_URL: `http://127.0.0.1:${PUERTO_DOBLE}` },
      stdio: ["ignore", "pipe", "pipe"],
      detached: true,
    },
  );
  next.stdout.on("data", (t) => { registro += t; });
  next.stderr.on("data", (t) => { registro += t; });
  next.on("exit", (codigo) => {
    if (codigo) console.error(`\nnext dev terminó con código ${codigo}:\n${registro.slice(-1500)}`);
    next = null;
  });
}
// Se espera a que termine de verdad antes de devolver el control: el que
// arranque `next dev` en este checkout enseguida no se tiene que encontrar
// con otro a medio cerrar.
async function frenarNext() {
  if (!next) return;
  const hijo = next;
  const salio = new Promise((listo) => hijo.once("exit", listo));
  try { process.kill(-hijo.pid, "SIGTERM"); } catch { /* ya no está */ }
  await Promise.race([salio, new Promise((seguir) => setTimeout(seguir, 10_000))]);
}

// `html` es lo que el servidor DIBUJÓ: la respuesta sin los <script>. El
// payload de React viaja en scripts y lleva siempre el not-found del
// segmento («No encontramos ese taller»), se muestre o no: buscar ahí un
// texto que no tiene que estar daría rojo con la página bien.
//
// `crudo` es la respuesta entera, y hace falta para lo contrario: el 404 de
// Next NO se dibuja en el servidor —la respuesta es un documento vacío
// (`<html id="__next_error__">`) y el not-found lo arma el navegador con el
// payload—, así que su texto solo está ahí.
async function pedir(ruta, plazoMs = 120_000) {
  const r = await fetch(`${BASE}${ruta}`, {
    redirect: "manual",
    headers: { accept: "text/html" },
    signal: AbortSignal.timeout(plazoMs),
  });
  const crudo = await r.text();
  return {
    status: r.status,
    html: crudo.replace(/<script\b[\s\S]*?<\/script>/g, ""),
    crudo,
    cache: r.headers.get("cache-control") ?? "",
    reintentarEn: r.headers.get("retry-after"),
  };
}

async function esperar(pred, ms = 180_000) {
  const fin = Date.now() + ms;
  while (Date.now() < fin) {
    try { if (await pred()) return true; } catch { /* todavía no */ }
    await new Promise((r) => setTimeout(r, 1000));
  }
  return false;
}

// Las filas de landing_busquedas que dejó un paso. `desde` se toma del
// reloj de la base, antes del paso.
const ahora = () => sql("select clock_timestamp()");
const filasEncontradas = (desde) => Number(sql(
  `select count(*) from landing_busquedas lb join lubricentros l on l.id = lb.lubricentro_id
   where l.slug = 'demo' and lb.patente = '${PATENTE}' and lb.created_at >= '${desde}'`));

const tieneEstado = (html, titulo) => html.includes(titulo) && html.includes("Probá de nuevo en un momento.");
// «Reintentar» es un <a href="">: la misma URL, con su consulta, sin rearmarla.
const tieneReintentar = (html) => /<a\b[^>]*href=""[^>]*>\s*Reintentar\s*<\/a>/.test(html);
const tieneCarton = (html) => new RegExp(`<p class="plate[^"]*">${PATENTE_LEGIBLE}</p>`).test(html);
// `next start` manda «private, no-cache, no-store…» en una página dinámica;
// `next dev` manda «no-cache, must-revalidate» en todas. Lo que no puede
// pasar en ninguno de los dos es que la respuesta se pueda guardar.
const sinCache = (cabecera) =>
  /no-store|no-cache/.test(cabecera) && !/public|max-age=[1-9]|s-maxage=[1-9]/.test(cabecera);
const tituloDe = (html) => /<title>([^<]*)<\/title>/.exec(html)?.[1] ?? "";
const sinIndexar = (html) => /<meta[^>]+name="robots"[^>]+content="[^"]*noindex/.test(html);
// La vidriera del demo ya va «noindex, follow» (está en SLUGS_SIN_INDEXAR):
// lo que distingue al estado «sin respuesta» es el nofollow.
const sinIndexarNiSeguir = (html) => /<meta[^>]+name="robots"[^>]+content="noindex, nofollow"/.test(html);

const T_HISTORIAL = "No pudimos cargar el historial";
const T_PAGINA = "No pudimos cargar la página";
const T_BUSQUEDA = "No pudimos buscar la patente";
const T_SIN_TALLER = "No encontramos ese taller";
const T_SIN_PATENTE = "No encontramos esa patente";

// ════════════════════════════════════════════════════════════════════

const INICIO = ahora();
const demo = sql(`select l.nombre || '|' || coalesce(c.color_primario, '#0A0A0A')
  from lubricentros l left join config_experiencia c on c.lubricentro_id = l.id where l.slug = 'demo'`).split("|");
const [NOMBRE_DEMO, COLOR_DEMO] = [demo[0], demo[1].toUpperCase()];
if (!NOMBRE_DEMO) { console.error("No está el tenant demo: corré supabase db reset."); process.exit(1); }
if (sql(`select count(*) from vehiculos v join lubricentros l on l.id = v.lubricentro_id where l.slug = 'demo' and v.patente_normalizada = '${PATENTE}'`) !== "1") {
  console.error(`El seed no trae el auto ${PATENTE} en el demo.`); process.exit(1);
}

await new Promise((listo, mal) => {
  doble.once("error", mal);
  doble.listen(PUERTO_DOBLE, "127.0.0.1", listo);
});
let navegador = null;

if (process.env.SOLO_DOBLE === "1") {
  console.log(`doble de Supabase escuchando en http://127.0.0.1:${PUERTO_DOBLE} → ${REAL.origin} (Ctrl+C para frenarlo)`);
  await new Promise(() => {});
}

try {
  if (!process.env.BASE_URL) arrancarNext();
  console.log(`\nEsperando al servidor de Next en ${BASE} (la primera compilación tarda)…`);
  limpiar();
  const arriba = await esperar(async () => (await pedir("/demo")).status === 200);
  if (!arriba) throw new Error(`El servidor de Next no contestó en ${BASE}.\n${registro.slice(-1500)}`);
  if (llamadas.get_landing === 0) {
    throw new Error(`El servidor de ${BASE} no le habla al doble: tiene que arrancar con NEXT_PUBLIC_SUPABASE_URL=http://127.0.0.1:${PUERTO_DOBLE}.`);
  }
  // Las rutas se compilan al primer pedido: se piden una vez antes de medir.
  await pedir(`/demo/${PATENTE}`);
  await pedir(`/${SLUG_FALSO}`);
  await pedir("/demo/manifest.webmanifest");
  await pedir(`/demo/${PATENTE}/manifest.webmanifest`);

  // ---------------------------------------------------------------- A
  if (toca("A")) {
    console.log("\n— A · el doble contra la realidad (regla 19)");
    const real = async (fn, cuerpo) => {
      const r = await fetch(`${REAL.origin}/rest/v1/rpc/${fn}`, {
        method: "POST",
        headers: { apikey: ANON, authorization: `Bearer ${ANON}`, "content-type": "application/json" },
        body: JSON.stringify(cuerpo),
      });
      const texto = await r.text();
      let json; try { json = JSON.parse(texto); } catch { json = undefined; }
      return { status: r.status, texto, json };
    };
    const denegada = await real(FUNCION_DENEGADA, {});
    check("el PostgREST local rechaza a `anon` con un error con código (42501)",
      denegada.status >= 400 && denegada.json?.code === "42501", `${denegada.status} ${denegada.texto.slice(0, 120)}`);
    const claves = (o) => Object.keys(o ?? {}).sort().join(",");
    check("los errores con código que fabrica el doble tienen la forma del de verdad (code, details, hint, message)",
      claves(FIJOS.recargando[1]) === claves(denegada.json) && claves(FIJOS.timeout[1]) === claves(denegada.json),
      `real: ${claves(denegada.json)}`);
    const sinTaller = await real("get_landing", { p_slug: SLUG_FALSO });
    check("get_landing contesta 200 con `null` cuando el slug no existe (es SU «no existe»)",
      sinTaller.status === 200 && sinTaller.texto.trim() === "null", `${sinTaller.status} ${sinTaller.texto.slice(0, 80)}`);
    const sinTallerCarton = await real("get_carton", { p_slug: SLUG_FALSO, p_patente: PATENTE });
    check("get_carton contesta 200 con su error nombrado cuando el slug no existe (nunca `null`)",
      sinTallerCarton.status === 200 && sinTallerCarton.json?.error === "lubricentro_no_encontrado",
      `${sinTallerCarton.status} ${sinTallerCarton.texto.slice(0, 80)}`);
  }

  // ---------------------------------------------------------------- B
  if (toca("B")) {
    console.log("\n— B · la línea de base y el contracaso: lo que no existe sigue siendo un 404");
    limpiar();
    const carton = await pedir(`/demo/${PATENTE}`);
    check("el cartón contesta 200 con el historial", carton.status === 200 && tieneCarton(carton.html), `status ${carton.status}`);
    check("…sin el estado «sin respuesta»", !carton.html.includes(T_HISTORIAL));
    check("…con una sola llamada a get_carton y ninguna a get_landing",
      llamadas.get_carton === 1 && llamadas.get_landing === 0, JSON.stringify(llamadas));

    limpiar();
    const vidriera = await pedir("/demo");
    check("la vidriera contesta 200 con el buscador", vidriera.status === 200 && vidriera.html.includes('id="patente"'), `status ${vidriera.status}`);
    check("…con el nombre del taller en el título", tituloDe(vidriera.html).startsWith(NOMBRE_DEMO), tituloDe(vidriera.html));
    check("…y hace UNA llamada a get_landing por pedido (el título y la página comparten la respuesta)",
      llamadas.get_landing === 1, `${llamadas.get_landing} llamadas`);

    const sinTaller = await pedir(`/${SLUG_FALSO}`);
    check("CONTRACASO · un slug que no existe: la vidriera contesta 404",
      sinTaller.status === 404 && sinTaller.crudo.includes(T_SIN_TALLER), `status ${sinTaller.status}`);
    check("…sin el estado «sin respuesta»", !sinTaller.html.includes(T_PAGINA));
    const sinTallerCarton = await pedir(`/${SLUG_FALSO}/${PATENTE}`);
    check("CONTRACASO · un slug que no existe: el cartón contesta 404",
      sinTallerCarton.status === 404 && sinTallerCarton.crudo.includes(T_SIN_TALLER), `status ${sinTallerCarton.status}`);
    check("…sin el estado «sin respuesta»", !sinTallerCarton.html.includes(T_HISTORIAL));
    const manifestFalso = await pedir(`/${SLUG_FALSO}/manifest.webmanifest`);
    check("CONTRACASO · el manifest de un slug que no existe contesta 404", manifestFalso.status === 404, `status ${manifestFalso.status}`);

    const sinPatente = await pedir(`/demo/${PATENTE_FALSA}`);
    check("CONTRACASO · una patente que no existe sigue siendo «No encontramos esa patente» (un lead, no un error)",
      sinPatente.status === 200 && sinPatente.html.includes(T_SIN_PATENTE) && !sinPatente.html.includes(T_HISTORIAL),
      `status ${sinPatente.status}`);
  }

  // ---------------------------------------------------------------- C
  if (toca("C")) {
    console.log("\n— C · get_carton no contesta: no es un 404, es «No pudimos cargar el historial»");
    // [modo, qué es, cuántas llamadas a get_carton se esperan]
    const formas = [
      ["denegado", "PostgREST de verdad, 401 · 42501", 2],
      ["recargando", "503 · PGRST002", 2],
      ["timeout", "500 · 57014", 2],
      ["gateway", "502 de Kong, sin código", 1],
      ["corta", "la conexión se corta", 1],
      ["vacia", "404 con cuerpo vacío", 1],
      ["nulo", "200 con null", 1],
    ];
    for (const [modo, que, llamadasEsperadas] of formas) {
      limpiar();
      poner("get_carton", modo);
      const r = await pedir(`/demo/${PATENTE}`);
      check(`${que} → no es un 404`, r.status !== 404, `status ${r.status}`);
      check(`${que} → muestra el estado, con «Reintentar» a la misma URL`,
        r.status === 200 && tieneEstado(r.html, T_HISTORIAL) && tieneReintentar(r.html),
        `status ${r.status}`);
      check(`${que} → no dice que el taller no existe`, !r.html.includes(T_SIN_TALLER));
      check(`${que} → ${llamadasEsperadas === 2 ? "se repite una vez (trae código: no se confirmó nada)" : "NO se repite sola (no se sabe si corrió)"}`,
        llamadas.get_carton === llamadasEsperadas, `${llamadas.get_carton} llamadas a get_carton`);
    }

    limpiar();
    poner("get_carton", "recargando");
    const marcas = registro.length;
    const r = await pedir(`/demo/${PATENTE}`);
    check("pintado con la marca del lubricentro: su color en las variables del tenant",
      r.html.includes(`--color-tenant:${COLOR_DEMO}`), `se esperaba --color-tenant:${COLOR_DEMO}`);
    check("…y su pie de confianza (el nombre y cómo escribirle)",
      r.html.includes(NOMBRE_DEMO) && r.html.includes("Escribinos por WhatsApp"));
    check("…con una sola llamada a get_landing para la marca", llamadas.get_landing === 1, `${llamadas.get_landing}`);
    check("noindex", sinIndexar(r.html));
    check("sin caché", sinCache(r.cache), r.cache || "(sin cabecera)");
    if (PRODUCCION) check("…y en producción, con no-store", r.cache.includes("no-store"), r.cache);
    if (next) {
      await new Promise((r2) => setTimeout(r2, 300));
      const lineas = registro.slice(marcas).split("\n").filter((l) => l.includes("[cliente]"));
      check("la falla queda en los logs del servidor, con la puerta, el slug, el código y los intentos",
        lineas.length === 1 && /get_carton no contestó para «demo» \(dos intentos\)/.test(lineas[0]) && lineas[0].includes("PGRST002"),
        lineas.join(" | ") || "(ninguna línea)");
      check("…y sin la patente", lineas.length > 0 && !lineas.some((l) => l.includes(PATENTE)));
    }
  }

  // ---------------------------------------------------------------- D
  if (toca("D")) {
    console.log("\n— D · el reintento y la métrica de escaneo: nunca dos filas por una visita");
    for (const modo of ["recargando", "timeout", "denegado"]) {
      limpiar();
      poner("get_carton", modo, 1);
      const desde = ahora();
      const marcas = registro.length;
      const r = await pedir(`/demo/${PATENTE}`);
      check(`falla una vez (${modo}) y después contesta → el cartón, sin que el cliente vea nada`,
        r.status === 200 && tieneCarton(r.html) && !r.html.includes(T_HISTORIAL), `status ${r.status}`);
      check("…con dos llamadas a get_carton", llamadas.get_carton === 2, `${llamadas.get_carton}`);
      check("…y UNA sola fila en landing_busquedas", filasEncontradas(desde) === 1, `${filasEncontradas(desde)} filas`);
      if (next && modo === "recargando") {
        await new Promise((r2) => setTimeout(r2, 300));
        const lineas = registro.slice(marcas).split("\n").filter((l) => l.includes("[cliente]"));
        check("…y el reintento que la salvó queda igual en los logs (sin la patente)",
          lineas.length === 1 && /get_carton contestó al segundo intento para «demo»/.test(lineas[0])
            && lineas[0].includes("PGRST002") && !lineas[0].includes(PATENTE),
          lineas.join(" | ") || "(ninguna línea)");
      }
    }

    limpiar();
    poner("get_carton", "pierde");
    let desde = ahora();
    let r = await pedir(`/demo/${PATENTE}`);
    check("la función corrió y la respuesta se perdió → el estado «sin respuesta»",
      r.status === 200 && tieneEstado(r.html, T_HISTORIAL), `status ${r.status}`);
    check("…con UNA sola llamada: no se reintenta a ciegas", llamadas.get_carton === 1, `${llamadas.get_carton} llamadas`);
    check("…y UNA sola fila en landing_busquedas (la de la llamada que sí corrió): el reintento ciego dejaría dos",
      filasEncontradas(desde) === 1, `${filasEncontradas(desde)} filas`);

    limpiar();
    poner("get_carton", "corta");
    desde = ahora();
    r = await pedir(`/demo/${PATENTE}`);
    check("la conexión se cortó antes de llegar → una llamada y ninguna fila",
      llamadas.get_carton === 1 && filasEncontradas(desde) === 0, `${llamadas.get_carton} llamadas, ${filasEncontradas(desde)} filas`);

    limpiar();
    poner("get_carton", "recargando");
    desde = ahora();
    r = await pedir(`/demo/${PATENTE}`);
    check("falla dos veces con código → dos llamadas, ninguna fila, y el estado",
      llamadas.get_carton === 2 && filasEncontradas(desde) === 0 && tieneEstado(r.html, T_HISTORIAL),
      `${llamadas.get_carton} llamadas, ${filasEncontradas(desde)} filas`);
  }

  // ---------------------------------------------------------------- E
  if (toca("E")) {
    console.log("\n— E · todo caído: el mismo estado, neutro");
    limpiar();
    poner("get_carton", "corta");
    poner("get_landing", "corta");
    const carton = await pedir(`/demo/${PATENTE}`);
    check("el cartón → no es un 404, es el estado con «Reintentar»",
      carton.status === 200 && tieneEstado(carton.html, T_HISTORIAL) && tieneReintentar(carton.html),
      `status ${carton.status}`);
    check("…neutro: sin el color del taller y sin su nombre",
      !carton.html.includes(`--color-tenant:${COLOR_DEMO}`) && !carton.html.includes(NOMBRE_DEMO));
    check("…y la marca se pide UNA vez (es un intento de cortesía, sin reintento)", llamadas.get_landing === 1, `${llamadas.get_landing}`);

    // La base colgada: get_landing ni contesta ni corta. La marca es de
    // cortesía y tiene plazo (2 segundos): el estado sale igual.
    limpiar();
    poner("get_carton", "recargando");
    poner("get_landing", "cuelga");
    const desde = Date.now();
    const colgada = await pedir(`/demo/${PATENTE}`, 30_000).catch(() => null);
    const tardo = Date.now() - desde;
    check("get_landing colgada: el estado sale igual, neutro, y no se la espera más que su plazo",
      colgada?.status === 200 && tieneEstado(colgada.html, T_HISTORIAL) && !colgada.html.includes(NOMBRE_DEMO) && tardo < 10_000,
      `status ${colgada?.status ?? "(sin respuesta en 30 s)"} · ${tardo} ms`);
    limpiar();

    limpiar();
    poner("get_landing", "corta");
    const vidriera = await pedir("/demo");
    check("la vidriera → no es un 404", vidriera.status !== 404, `status ${vidriera.status}`);
    check("…es «No pudimos cargar la página», con «Reintentar» a la misma URL",
      vidriera.status === 200 && tieneEstado(vidriera.html, T_PAGINA) && tieneReintentar(vidriera.html),
      `status ${vidriera.status}`);
    check("…no dice que el taller no existe (ni en la página ni en el título)",
      !vidriera.html.includes(T_SIN_TALLER) && tituloDe(vidriera.html) === T_PAGINA, tituloDe(vidriera.html));
    check("…noindex (y sin seguir: el demo de por sí va «noindex, follow»)", sinIndexarNiSeguir(vidriera.html));
    check("…sin caché", sinCache(vidriera.cache), vidriera.cache || "(sin cabecera)");
    if (PRODUCCION) check("…y en producción, con no-store", vidriera.cache.includes("no-store"), vidriera.cache);
    check("…neutra: sin el color del taller", !vidriera.html.includes(`--color-tenant:${COLOR_DEMO}`));

    for (const ruta of ["/demo/manifest.webmanifest", `/demo/${PATENTE}/manifest.webmanifest`]) {
      limpiar();
      poner("get_landing", "corta");
      const m = await pedir(ruta);
      check(`${ruta} → 503 sin caché, no 404`, m.status === 503 && m.cache.includes("no-store"), `status ${m.status} · ${m.cache}`);
    }
    limpiar();
    const m = await pedir("/demo/manifest.webmanifest");
    check("CONTRACASO · con todo contestando, el manifest es 200 y se cachea una hora",
      m.status === 200 && m.cache.includes("max-age=3600") && m.html.includes(NOMBRE_DEMO), `status ${m.status} · ${m.cache}`);
  }

  // ---------------------------------------------------------------- F
  if (toca("F")) {
    console.log("\n— F · get_carton no contesta y get_landing dice que el slug no existe: 404");
    limpiar();
    poner("get_carton", "recargando");
    const r = await pedir(`/${SLUG_FALSO}/${PATENTE}`);
    check("ahí sí se sabe: 404 y «No encontramos ese taller»",
      r.status === 404 && r.crudo.includes(T_SIN_TALLER) && !r.html.includes(T_HISTORIAL), `status ${r.status}`);
  }

  // ---------------------------------------------------------------- G
  if (toca("G")) {
    console.log("\n— G · get_landing no escribe: se repite una vez ante cualquier falla");
    for (const modo of ["corta", "gateway", "recargando", "vacia"]) {
      limpiar();
      poner("get_landing", modo, 1);
      const r = await pedir("/demo");
      check(`falla una vez (${modo}) y después contesta → la vidriera de siempre, con dos llamadas`,
        r.status === 200 && r.html.includes('id="patente"') && !r.html.includes(T_PAGINA) && llamadas.get_landing === 2,
        `status ${r.status} · ${llamadas.get_landing} llamadas`);
      // Sin `cache`, el título y la página preguntan por separado: falla
      // la del título, contesta la de la página, y la vidriera sale entera
      // con el título «Taller no encontrado» y noindex.
      check("…y el título dice lo mismo que la página (comparten la respuesta)",
        tituloDe(r.html).startsWith(NOMBRE_DEMO), tituloDe(r.html));
    }
    limpiar();
    poner("get_landing", "vacia");
    const r = await pedir("/demo");
    check("el 404 vacío sostenido NO se lee como «el taller no existe»",
      r.status === 200 && tieneEstado(r.html, T_PAGINA) && !r.html.includes(T_SIN_TALLER), `status ${r.status}`);
    check("…con dos llamadas, no más", llamadas.get_landing === 2, `${llamadas.get_landing}`);
  }

  // ---------------------------------------------------------------- H / I
  if (toca("H") || toca("I")) navegador = await chromium.launch({ args: ["--lang=es-AR"] });
  const contexto = async (conJs = true) => {
    const ctx = await navegador.newContext({
      viewport: { width: 390, height: 844 },
      deviceScaleFactor: 2,
      locale: "es-AR",
      hasTouch: true,
      javaScriptEnabled: conJs,
    });
    // Plazos cortos: si el estado no está, cada espera serían 30 segundos.
    ctx.setDefaultTimeout(8_000);
    ctx.setDefaultNavigationTimeout(45_000);
    return ctx;
  };
  if (CAPTURAS) fs.mkdirSync(DIR_CAPTURAS, { recursive: true });
  const captura = async (page, nombre) => {
    if (!CAPTURAS) return;
    // Sin el indicador de `next dev`, y sin el foco que dejó la prueba.
    await page.addStyleTag({ content: "nextjs-portal { display: none !important }" });
    await page.evaluate(() => document.activeElement?.blur?.());
    await page.screenshot({ path: path.join(DIR_CAPTURAS, `${nombre}.png`), fullPage: true });
  };
  // El rojo Motors y sus dos tonos (globals.css): en esta superficie no
  // aparece ni un píxel.
  const rojosEn = (page) => page.evaluate(() => {
    const MOTORS = ["rgb(224, 31, 38)", "rgb(184, 22, 28)", "rgb(253, 236, 236)"];
    const props = ["color", "backgroundColor", "borderTopColor", "borderRightColor", "borderBottomColor",
      "borderLeftColor", "outlineColor", "textDecorationColor", "fill", "stroke"];
    const hallados = [];
    for (const el of document.querySelectorAll("*")) {
      const cs = getComputedStyle(el);
      for (const p of props) if (MOTORS.includes(cs[p])) hallados.push(`${el.tagName.toLowerCase()}.${p}`);
    }
    return hallados;
  });
  const medidas = (page) => page.evaluate(() => {
    const boton = [...document.querySelectorAll("a")].find((a) => a.textContent?.trim() === "Reintentar");
    const caja = boton?.getBoundingClientRect();
    return {
      alto: caja?.height ?? 0,
      ancho: caja?.width ?? 0,
      desborde: document.documentElement.scrollWidth - window.innerWidth,
      fondoBoton: boton ? getComputedStyle(boton).backgroundColor : "",
    };
  });
  // Los colores que el navegador terminó computando, y su contraste (WCAG
  // 2.1). El texto secundario lleva alfa: se compone sobre la tarjeta.
  const coloresDe = (page) => page.evaluate(() => {
    const tarjeta = document.querySelector("main section");
    const boton = [...document.querySelectorAll("a")].find((a) => a.textContent?.trim() === "Reintentar");
    const c = (el, prop) => (el ? getComputedStyle(el)[prop] : "");
    return {
      pagina: c(document.querySelector('[style*="--color-tenant"]'), "backgroundColor"),
      tarjeta: c(tarjeta, "backgroundColor"),
      titulo: c(tarjeta?.querySelector("h1"), "color"),
      texto: c(tarjeta?.querySelector("p"), "color"),
      boton: c(boton, "backgroundColor"),
      tintaBoton: c(boton, "color"),
    };
  });
  const numeros = (color) => (color.match(/[\d.]+/g) ?? [0, 0, 0]).map(Number);
  const luminancia = ([r, g, b]) => {
    const canal = (v) => { const x = v / 255; return x <= 0.03928 ? x / 12.92 : ((x + 0.055) / 1.055) ** 2.4; };
    return 0.2126 * canal(r) + 0.7152 * canal(g) + 0.0722 * canal(b);
  };
  const contraste = (frente, fondo) => {
    const [r, g, b, a = 1] = numeros(frente);
    const [R, G, B] = numeros(fondo);
    const l1 = luminancia([r * a + R * (1 - a), g * a + G * (1 - a), b * a + B * (1 - a)]);
    const l2 = luminancia([R, G, B]);
    return (Math.max(l1, l2) + 0.05) / (Math.min(l1, l2) + 0.05);
  };
  // AA: 4,5 en el cuerpo y 3 en el texto grande (el botón va en 22 px bold).
  const seLee = (c) => contraste(c.titulo, c.tarjeta) >= 4.5 && contraste(c.texto, c.tarjeta) >= 4.5 && contraste(c.tintaBoton, c.boton) >= 3;
  const contrastes = (c) => `título ${contraste(c.titulo, c.tarjeta).toFixed(1)} · texto ${contraste(c.texto, c.tarjeta).toFixed(1)} · botón ${contraste(c.tintaBoton, c.boton).toFixed(1)}`;
  const aRgb = (hex) => `rgb(${parseInt(hex.slice(1, 3), 16)}, ${parseInt(hex.slice(3, 5), 16)}, ${parseInt(hex.slice(5, 7), 16)})`;

  if (toca("I")) {
    console.log("\n— I · con navegador, 390 táctil: el estado con la marca, el neutro y «Reintentar»");
    const ctx = await contexto();
    const page = await ctx.newPage();
    // Lo que el navegador tenga para decir del estado nuevo: un error de
    // hidratación, un aviso de React por el `href=""`. En `next dev` el
    // console.error del servidor se reenvía al navegador: ese es el propio.
    const consola = [];
    page.on("console", (m) => {
      if (["error", "warning"].includes(m.type()) && !m.text().includes("[cliente]")) consola.push(m.text().slice(0, 200));
    });
    page.on("pageerror", (e) => consola.push(String(e).slice(0, 200)));

    limpiar();
    poner("get_carton", "recargando");
    let respuesta = await page.goto(`${BASE}/demo/${PATENTE}`, { waitUntil: "networkidle" });
    check("el cartón sin respuesta se ve: título, «Probá de nuevo en un momento.» y «Reintentar»",
      respuesta?.status() === 200
        && await page.getByRole("heading", { name: T_HISTORIAL }).isVisible().catch(() => false)
        && await page.getByText("Probá de nuevo en un momento.").isVisible().catch(() => false)
        && await page.getByRole("link", { name: "Reintentar" }).isVisible().catch(() => false),
      `status ${respuesta?.status()}`);
    let m = await medidas(page);
    check("«Reintentar» mide 44 px o más de alto y va pintado con el color del taller",
      m.alto >= 44 && m.fondoBoton === aRgb(COLOR_DEMO), `${m.alto}px · ${m.fondoBoton}`);
    check("cero scroll horizontal", m.desborde <= 0, `${m.desborde}px de más`);
    let rojos = await rojosEn(page);
    check("ni un píxel del rojo Motors", rojos.length === 0, rojos.slice(0, 5).join(" "));
    // Con el teclado, que es lo que prende :focus-visible. En `next dev` el
    // indicador de Next también es tabulable: se tabula hasta el botón.
    let foco = "";
    for (let i = 0; i < 6 && !foco.startsWith("Reintentar|"); i++) {
      await page.keyboard.press("Tab");
      // `transition-colors` también anima el color del anillo: se lo deja llegar.
      await page.waitForTimeout(400);
      foco = await page.evaluate(() => {
        const el = document.activeElement;
        return el ? `${el.textContent?.trim()}|${getComputedStyle(el).outlineStyle}|${getComputedStyle(el).outlineColor}` : "";
      });
    }
    check("…tampoco en el foco: el anillo es del color del taller", foco === `Reintentar|solid|${aRgb(COLOR_DEMO)}`, foco);
    let colores = await coloresDe(page);
    check("se lee: contraste AA en el título, el texto y el botón", seLee(colores), contrastes(colores));
    await captura(page, "carton-sin-respuesta-con-marca-390");

    limpiar();
    await Promise.all([
      page.waitForNavigation({ waitUntil: "networkidle" }).catch(() => null),
      page.getByRole("link", { name: "Reintentar" }).click().catch(() => null),
    ]);
    check("la base volvió: «Reintentar» trae el cartón, en la misma URL",
      page.url() === `${BASE}/demo/${PATENTE}`
        && await page.locator("p.plate", { hasText: PATENTE_LEGIBLE }).isVisible().catch(() => false)
        && !(await page.getByText(T_HISTORIAL).isVisible().catch(() => false)),
      page.url());

    limpiar();
    poner("get_carton", "corta");
    poner("get_landing", "corta");
    respuesta = await page.goto(`${BASE}/demo/${PATENTE}`, { waitUntil: "networkidle" });
    check("todo caído: el mismo estado, neutro",
      respuesta?.status() === 200 && await page.getByRole("heading", { name: T_HISTORIAL }).isVisible().catch(() => false),
      `status ${respuesta?.status()}`);
    m = await medidas(page);
    check("…«Reintentar» en grafito, 44 px o más, sin scroll horizontal",
      m.alto >= 44 && m.fondoBoton === "rgb(10, 10, 10)" && m.desborde <= 0, `${m.alto}px · ${m.fondoBoton} · ${m.desborde}`);
    rojos = await rojosEn(page);
    check("…y ni un píxel del rojo Motors", rojos.length === 0, rojos.slice(0, 5).join(" "));
    colores = await coloresDe(page);
    check("…y se lee: contraste AA", seLee(colores), contrastes(colores));
    await captura(page, "carton-sin-respuesta-neutro-390");

    // El tema es del lubricentro, para todos los que escanean (regla 7):
    // con un taller en modo oscuro, el estado va en oscuro y se lee igual.
    limpiar();
    poner("get_carton", "recargando");
    poner("get_landing", "oscuro");
    respuesta = await page.goto(`${BASE}/demo/${PATENTE}`, { waitUntil: "networkidle" });
    colores = await coloresDe(page);
    check("un taller en modo oscuro: el estado va sobre el grafito del tema",
      respuesta?.status() === 200 && colores.pagina === "rgb(10, 10, 10)" && colores.titulo === "rgb(255, 255, 255)",
      `página ${colores.pagina} · título ${colores.titulo}`);
    check("…y se lee: contraste AA", seLee(colores), contrastes(colores));
    rojos = await rojosEn(page);
    check("…sin el rojo Motors", rojos.length === 0, rojos.slice(0, 5).join(" "));
    await captura(page, "carton-sin-respuesta-oscuro-390");

    limpiar();
    poner("get_landing", "corta");
    respuesta = await page.goto(`${BASE}/demo`, { waitUntil: "networkidle" });
    check("la vidriera sin respuesta se ve: «No pudimos cargar la página» y «Reintentar»",
      respuesta?.status() === 200
        && await page.getByRole("heading", { name: T_PAGINA }).isVisible().catch(() => false)
        && await page.getByRole("link", { name: "Reintentar" }).isVisible().catch(() => false),
      `status ${respuesta?.status()}`);
    rojos = await rojosEn(page);
    check("…sin el rojo Motors", rojos.length === 0, rojos.slice(0, 5).join(" "));
    await captura(page, "vidriera-sin-respuesta-390");
    limpiar();
    await Promise.all([
      page.waitForNavigation({ waitUntil: "networkidle" }).catch(() => null),
      page.getByRole("link", { name: "Reintentar" }).click().catch(() => null),
    ]);
    check("…y «Reintentar» trae la vidriera",
      await page.locator("#patente").isVisible().catch(() => false), page.url());
    check("el navegador no acusa nada: ni errores ni avisos en la consola", consola.length === 0, consola.join(" | "));
    await ctx.close();
  }

  if (toca("H")) console.log("\n— H · la búsqueda de la vidriera: «no contestó» no es «no la encontramos»");
  for (const conJs of toca("H") ? [true, false] : []) {
    const como = conJs ? "con JavaScript" : "sin JavaScript";
    const ctx = await contexto(conJs);
    const page = await ctx.newPage();
    // No tira nunca: si el buscador no está (la pantalla anterior no era la
    // esperada), lo dice la comprobación de después y la corrida sigue.
    const buscar = async (escrito, patron) => {
      try {
        await page.fill("#patente", escrito);
        await Promise.all([
          page.waitForURL(patron, { timeout: 45_000 }),
          page.click('button[type="submit"]'),
        ]);
        await page.waitForLoadState("networkidle");
      } catch { /* ver arriba */ }
    };

    limpiar();
    await page.goto(`${BASE}/demo`, { waitUntil: "networkidle" });
    poner("get_carton", "recargando");
    await buscar("pqr 890", /\/demo(\?|\/)/);
    check(`${como} · get_carton no contesta → NO dice «No encontramos esa patente»`,
      !page.url().includes("nohay") && !(await page.getByText(T_SIN_PATENTE).isVisible().catch(() => false)), page.url());
    check(`${como} · …dice «No pudimos buscar la patente», en la vidriera`,
      page.url() === `${BASE}/demo?reintentar=${PATENTE}`
        && await page.getByRole("heading", { name: T_BUSQUEDA }).isVisible().catch(() => false)
        && await page.getByText("Probá de nuevo en un momento.").isVisible().catch(() => false),
      page.url());
    check(`${como} · …con la patente escrita en el buscador`,
      (await page.inputValue("#patente").catch(() => "")) === PATENTE_LEGIBLE, await page.inputValue("#patente").catch(() => ""));
    if (conJs) {
      const rojos = await rojosEn(page);
      check("…sin el rojo Motors", rojos.length === 0, rojos.slice(0, 5).join(" "));
      await captura(page, "busqueda-sin-respuesta-390");
    }

    limpiar();
    await buscar(PATENTE_LEGIBLE, new RegExp(`/demo/${PATENTE}$`));
    check(`${como} · la base volvió: tocar «Ver mi historial» de nuevo trae el cartón`,
      page.url() === `${BASE}/demo/${PATENTE}` && await page.locator("p.plate", { hasText: PATENTE_LEGIBLE }).isVisible().catch(() => false),
      page.url());

    // El caso ambiguo: la búsqueda corrió y la respuesta se perdió. La
    // acción no manda sola a la pantalla del auto (sería el reintento ciego
    // con otro nombre): se queda en la vidriera.
    limpiar();
    await page.goto(`${BASE}/demo`, { waitUntil: "networkidle" });
    poner("get_carton", "pierde");
    const desde = ahora();
    await buscar(PATENTE, /\/demo(\?|\/)/);
    check(`${como} · la respuesta se pierde → la vidriera con «No pudimos buscar la patente», una llamada y una fila`,
      page.url() === `${BASE}/demo?reintentar=${PATENTE}` && llamadas.get_carton === 1 && filasEncontradas(desde) === 1,
      `${page.url()} · ${llamadas.get_carton} llamadas · ${filasEncontradas(desde)} filas`);

    limpiar();
    await page.goto(`${BASE}/demo`, { waitUntil: "networkidle" });
    await buscar(PATENTE_FALSA, /\/demo(\?|\/)/);
    check(`${como} · CONTRACASO · una patente que no existe sigue yendo a «No encontramos esa patente»`,
      page.url() === `${BASE}/demo?nohay=${PATENTE_FALSA}`
        && await page.getByText(T_SIN_PATENTE).isVisible().catch(() => false)
        && !(await page.getByText(T_BUSQUEDA).isVisible().catch(() => false)),
      page.url());
    await ctx.close();
  }
} catch (e) {
  console.error(`\n✗ La corrida se cortó: ${e?.stack ?? e}`);
  fallas++;
} finally {
  await navegador?.close().catch(() => null);
  await frenarNext();
  for (const socket of colgados) socket.destroy();
  doble.close();
  doble.closeAllConnections?.();
  // Lo que la corrida registró en el demo local: las búsquedas del auto de
  // la prueba y las consultas sin resultado (que no guardan patente).
  const borradas = sql(`with b as (
      delete from landing_busquedas lb using lubricentros l
      where l.id = lb.lubricentro_id and l.slug = 'demo' and lb.created_at >= '${INICIO}'
        and (lb.patente = '${PATENTE}' or not lb.encontrada)
      returning 1)
    select count(*) from b`);
  console.log(`\n(se borraron ${borradas} búsquedas de prueba del demo local)`);
}

console.log(fallas === 0 ? "\nTODO VERDE" : `\n${fallas} FALLA(S)`);
process.exit(fallas === 0 ? 0 : 1);

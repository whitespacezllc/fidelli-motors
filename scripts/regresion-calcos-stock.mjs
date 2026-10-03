// Pedidos de calcos, PR 3: el stock de calcos y el aviso, de punta a punta
// —Mi cuenta → Calcos, el aviso del Inicio, los dos mails por el cron y la
// lista de /fidelli— contra el stack local y el doble de Resend (regla 13:
// una prueba que nunca se vio en rojo no existe). Esta se vio en rojo con la
// base ya en su lugar y ninguna pantalla todavía.
//
// Lo que cubre:
//   A · Sin navegador (compilado con tsc, sin el bundler):
//       1 · La frase del aviso —la misma del Inicio y de los mails—, cómo se
//           dicen las semanas, y la regla de «no apilar» con cobranza.
//       2 · Los dos mails de stock: asunto, frase, botón a Mi cuenta →
//           Calcos, el nombre escapado y ni una vez «m²».
//   B · Mi cuenta → Calcos, en 390 táctil: «Te quedan unas 115 · alcanzan
//       para unas 5 semanas al ritmo de 22 autos nuevos por semana», con los
//       números de la base; «Contá y corregí» cambia el número; la miniatura
//       del diseño sale por la transformación de Storage (ancho 400), no
//       cargando el archivo entero; y el botón de descarga NO está.
//   C · El aviso del Inicio: no aparece con 5 semanas; aparece bajo el
//       umbral con su texto; lleva a Mi cuenta → Calcos; se cierra con la X
//       y no vuelve en la sesión; vuelve a los 7 días; y no aparece con un
//       pedido abierto.
//   D · No se apila con cobranza: un lubricentro por vencer, con pocas
//       calcos, ve la barra de cobranza y NO el aviso de calcos; cuando paga,
//       lo ve.
//   E · /fidelli: la alerta del hub, la lista de arriba de la cola con
//       nombre, stock, ritmo, semanas y el WhatsApp armado; y el switch
//       «Imprime sus calcos por su cuenta» de la ficha, con nota.
//   F · Los que imprimen por su cuenta: ni estimación ni aviso, y aparece
//       «Descargar el archivo de impresión» (solo para ese tenant).
//   G · Los mails por el cron de las 9:00 (la ruta de avisos de cobranza):
//       la misma guarda; el de 4 semanas sale una vez y no se repite; no
//       sale con un pedido abierto; vuelve a estar disponible después de una
//       entrega nueva; y el que imprime por su cuenta no recibe nada.
//   H · 360 / 390 / 820 / 1280 en Mi cuenta → Calcos: sin scroll
//       horizontal, 44px en lo que se toca, sin «m²».
//
// Requiere el stack local RECIÉN RESETEADO y el servidor de Next:
//   supabase db reset && npm run dev
// con RESEND_BASE_URL=http://localhost:4020 y CRON_SECRET en .env.local (si
// no, se niega a correr: mandaría mails de verdad). El doble de Resend lo
// levanta —y lo apaga— este script.
//
// Correr:
//   node --no-warnings scripts/regresion-calcos-stock.mjs
//   CAPTURAS=1 node --no-warnings scripts/regresion-calcos-stock.mjs
//     (además deja las capturas en docs/capturas/calcos/)
//
// Deja en el local: el demo con una entrega de prueba, 270 vehículos, un
// diseño, un recuento y un pedido cancelado; y tres lubricentros
// `calcos-run-*` que no se pueden borrar (emails_calcos es evidencia).
// `supabase db reset` es la limpieza.
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import zlib from "node:zlib";
import { execFileSync } from "node:child_process";
import { createRequire } from "node:module";
import { chromium } from "playwright";

const RAIZ = new URL("..", import.meta.url).pathname;
const TSC = path.join(RAIZ, "node_modules", ".bin", "tsc");
const require = createRequire(import.meta.url);
const BASE = process.env.BASE_URL ?? "http://localhost:3000";
const INICIO = `${BASE}/panel`;
const CALCOS = `${BASE}/panel/cuenta/calcos`;
const CRON = `${BASE}/api/fidelli/avisos-cobranza`;
const DIR_CAPTURAS = process.env.CAPTURAS ? path.join(RAIZ, "docs/capturas/calcos") : null;

let fallas = 0;
const check = (nombre, cond, detalle = "") => {
  console.log(`  ${cond ? "✓" : "✗ FALLA"} ${nombre}${cond || !detalle ? "" : "  → " + detalle}`);
  if (!cond) fallas++;
};
const titulo = (t) => console.log(`\n${t}`);

// Un paso que falla no corta la corrida: cuenta su falla y sigue.
async function paso(nombre, fn) {
  try {
    await fn();
  } catch (e) {
    check(nombre, false, String(e.message ?? e).split("\n")[0]);
  }
}

function sql(consulta) {
  return execFileSync(
    "docker",
    ["exec", "-i", process.env.DB_CONTAINER ?? "supabase_db_fidelli-motors", "psql", "-U", "postgres", "-d", "postgres", "-X", "-q", "-A", "-t", "-v", "ON_ERROR_STOP=1"],
    { input: consulta, encoding: "utf8" },
  ).trim();
}

const env = Object.fromEntries(
  fs.readFileSync(path.join(RAIZ, ".env.local"), "utf8")
    .split("\n").filter((l) => l.includes("=") && !l.trim().startsWith("#")).map((l) => {
      const i = l.indexOf("="); return [l.slice(0, i).trim(), l.slice(i + 1).trim()];
    }));
if (env.RESEND_BASE_URL !== "http://localhost:4020" || !env.RESEND_API_KEY) {
  console.error("En .env.local tiene que estar RESEND_BASE_URL=http://localhost:4020 (el doble) y una RESEND_API_KEY cualquiera: esta prueba NO puede mandar mails de verdad.");
  process.exit(1);
}
if (!env.CRON_SECRET) {
  console.error("Falta CRON_SECRET en .env.local: la ruta del cron no se puede llamar.");
  process.exit(1);
}

// ============================================================
// A · Sin navegador
// ============================================================
titulo("A · Sin navegador");

function compilar() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "fm-stock-calcos-"));
  fs.mkdirSync(path.join(dir, "email"));
  fs.copyFileSync(path.join(RAIZ, "lib/stock-calcos.ts"), path.join(dir, "stock-calcos.ts"));
  for (const f of ["marco.ts", "calcos.ts"]) {
    fs.copyFileSync(path.join(RAIZ, "lib/email", f), path.join(dir, "email", f));
  }
  execFileSync(TSC, [
    "--module", "commonjs", "--target", "es2022", "--moduleResolution", "node",
    "--skipLibCheck", "--strict", "--outDir", path.join(dir, "out"),
    path.join(dir, "stock-calcos.ts"), path.join(dir, "email", "marco.ts"), path.join(dir, "email", "calcos.ts"),
  ], { stdio: "pipe" });
  return {
    stock: require(path.join(dir, "out", "stock-calcos.js")),
    mails: require(path.join(dir, "out", "email", "calcos.js")),
  };
}

await paso("la frase, las semanas y la regla de no apilar compilan solas", async () => {
  const { stock: m, mails } = compilar();

  check("la frase del aviso, con semanas",
    m.fraseDelAviso({ stock: 80, semanas: 3.6 }) ===
      "Te quedan unas 80 calcos, para unas 3 semanas. Producir y enviar tarda hasta 2. Pedí ahora.",
    m.fraseDelAviso({ stock: 80, semanas: 3.6 }));
  check("con menos de una semana",
    m.fraseDelAviso({ stock: 30, semanas: 0.8 }) ===
      "Te quedan unas 30 calcos, para menos de una semana. Producir y enviar tarda hasta 2. Pedí ahora.",
    m.fraseDelAviso({ stock: 30, semanas: 0.8 }));
  check("sin ritmo (20 calcos o menos): no inventa semanas",
    m.fraseDelAviso({ stock: 12, semanas: null }) ===
      "Te quedan unas 12 calcos. Producir y enviar tarda hasta 2 semanas. Pedí ahora.",
    m.fraseDelAviso({ stock: 12, semanas: null }));
  check("con pocas calcos y cobertura larga tampoco dice las semanas",
    m.fraseDelAviso({ stock: 15, semanas: 7.5 }) ===
      "Te quedan unas 15 calcos. Producir y enviar tarda hasta 2 semanas. Pedí ahora.",
    m.fraseDelAviso({ stock: 15, semanas: 7.5 }));
  check("en cero no dice «unas 0»",
    m.fraseDelAviso({ stock: 0, semanas: 0 }) ===
      "Según nuestra cuenta ya no te quedan calcos. Producir y enviar tarda hasta 2 semanas. Pedí ahora.",
    m.fraseDelAviso({ stock: 0, semanas: 0 }));

  check("las semanas: redondea para abajo, y no dice «unas 1 semanas»",
    m.semanasDichas(5.2) === "unas 5 semanas" && m.semanasDichas(3.9) === "unas 3 semanas" &&
      m.semanasDichas(1.4) === "una semana" && m.semanasDichas(0.5) === "menos de una semana" &&
      m.semanasDichas(80) === "más de un año",
    [5.2, 3.9, 1.4, 0.5, 80].map((s) => m.semanasDichas(s)).join(" | "));

  // La regla de «no apilar»: con un aviso de cobranza en pantalla, el de
  // calcos no se dibuja ese día.
  const puede = (estadoCobranza, suspendido = false) => m.puedeAvisarDeCalcos({ estadoCobranza, suspendido });
  check("no se apila: al día (o afuera del reloj) sí", puede("al_dia") === true && puede(null) === true);
  check("por vencer no (está la barra de cobranza del Inicio)", puede("por_vencer") === false);
  check("en gracia no (está la barra de gracia)", puede("gracia") === false);
  check("suspendido no (no puede pedir)", puede("suspendido") === false && puede("al_dia", true) === false);

  const base = { nombre: "Aimar <Mecánica>", enlace: "https://fidellimotors.app/panel/cuenta/calcos" };
  const frase4 = m.fraseDelAviso({ stock: 80, semanas: 3.6 });
  const frase1 = m.fraseDelAviso({ stock: 12, semanas: 0.6 });
  const cuatro = mails.emailStockDeCalcos({ ...base, tipo: "calcos_4_semanas", frase: frase4 });
  const una = mails.emailStockDeCalcos({ ...base, tipo: "calcos_1_semana", frase: frase1 });
  check("el mail de 4 semanas dice lo que dice el Inicio", cuatro.text.includes(frase4), cuatro.text);
  check("el de 1 semana, también", una.text.includes(frase1), una.text);
  check("los dos asuntos son distintos y hablan de calcos",
    cuatro.asunto !== una.asunto && /calcos/i.test(cuatro.asunto) && /calcos/i.test(una.asunto), `${cuatro.asunto} | ${una.asunto}`);
  check("el botón va a Mi cuenta → Calcos",
    [cuatro, una].every((e) => e.html.includes('href="https://fidellimotors.app/panel/cuenta/calcos"')));
  check("el nombre del lubricentro va escapado", cuatro.html.includes("Aimar &lt;Mecánica&gt;") && !cuatro.html.includes("<Mecánica>"));
  check("dicen cómo corregir la cuenta", [cuatro, una].every((e) => /contá/i.test(e.text)), cuatro.text);
  check("ninguno dice «m²»", !/m²|\bm2\b|metros? cuadrados?/i.test([cuatro, una].map((e) => e.asunto + e.html + e.text).join("\n")));
});

// ============================================================
// El doble y el estado de partida
// ============================================================
process.env.PUERTO = "4020";
// El doble acepta UNA key: la que tenga la app en .env.local, sea cual sea.
process.env.DOBLE_RESEND_KEY = env.RESEND_API_KEY;
const resend = await import("./doble-resend.mjs");
await resend.arrancar();
const enviados = async () => (await fetch("http://localhost:4020/_enviados")).json();

const tabla = (nombre) => sql(`select to_regclass('public.${nombre}') is not null;`) === "t";
if (!tabla("recuentos_calcos") || !tabla("emails_calcos")) {
  console.log("\nFalta la migración 20261003210000 (recuentos_calcos / emails_calcos): supabase db reset.");
  resend.parar();
  process.exit(1);
}
const DEMO = sql("select id from lubricentros where slug = 'demo';");
const usada =
  Number(sql(`select count(*) from recuentos_calcos;`)) > 0 ||
  Number(sql(`select count(*) from emails_calcos;`)) > 0 ||
  Number(sql(`select count(*) from pedidos_calcos where lubricentro_id = '${DEMO}';`)) !== 1 ||
  Number(sql(`select count(*) from disenos_calco where lubricentro_id = '${DEMO}';`)) > 0;
if (usada) {
  console.log("\nLa base ya tiene recuentos, mails de calcos, entregas de prueba o un diseño en el demo: esta prueba necesita la base recién reseteada (supabase db reset).");
  resend.parar();
  process.exit(1);
}

const stockDe = (id) => {
  const [stock, ritmo, semanas, base] = sql(
    `select coalesce(stock_estimado::text, '') || '|' || coalesce(ritmo_semanal::text, '') || '|' || coalesce(semanas_cobertura::text, '') || '|' || coalesce(base_recuento_at::text, '') from stock_calcos('${id}');`,
  ).split("|");
  return {
    stock: stock === "" ? null : Number(stock),
    ritmo: ritmo === "" ? null : Number(ritmo),
    semanas: semanas === "" ? null : Number(semanas),
    base: base || null,
  };
};

// ---------- El demo: 400 entregadas, 285 autos nuevos, 22 por semana ----------
// La entrega de hace 70 días (350, más las 50 del backfill) y los vehículos
// que faltan para que la cuenta dé el ejemplo del sprint: 115 calcos, 22
// autos nuevos por semana, 5 semanas. Lo que el seed ya trae se descuenta.
sql(`do $$
declare
  v_demo uuid; v_suc uuid; v_cli uuid; v_usr uuid;
  v_recientes integer; v_56 integer; v_ventana integer; v_viejos integer;
begin
  select id into v_demo from lubricentros where slug = 'demo';
  select id into v_suc from sucursales where lubricentro_id = v_demo and activa order by created_at limit 1;
  select id into v_cli from clientes where lubricentro_id = v_demo limit 1;
  select id into v_usr from usuarios where lubricentro_id = v_demo and rol = 'owner' limit 1;

  insert into pedidos_calcos (lubricentro_id, fecha, cantidad, incluidas, nota, created_at)
  values (v_demo, ((now() - interval '70 days') at time zone 'America/Argentina/Buenos_Aires')::date,
          350, true, 'prueba de stock', now() - interval '70 days');
  -- La fila entró por fuera de la puerta: el contador se pone en la suma
  -- del libro (400). (El candado solo actúa si el valor cambia de verdad.)
  update lubricentros l set calcos_entregadas = (select coalesce(sum(pc.cantidad), 0) from pedidos_calcos pc where pc.lubricentro_id = l.id) where l.id = v_demo;

  select count(*) filter (where m >= now() - interval '70 days'),
         count(*) filter (where m >= now() - interval '56 days')
    into v_recientes, v_56
  from (select min(created_at) m from services
         where lubricentro_id = v_demo and importado_de is null and not anulado
         group by vehiculo_id) x;
  v_ventana := 176 - v_56;
  v_viejos  := 285 - 176 - (v_recientes - v_56);
  if v_ventana < 0 or v_viejos < 0 then
    raise exception 'el seed del demo trae más autos nuevos de los que la prueba esperaba (% en 70 días, % en 56)', v_recientes, v_56;
  end if;

  insert into vehiculos (lubricentro_id, cliente_id, patente, patente_normalizada, marca, modelo)
  select v_demo, v_cli, 'SK' || lpad(i::text, 3, '0') || 'AA', 'SK' || lpad(i::text, 3, '0') || 'AA', 'Ford', 'Ranger'
  from generate_series(1, v_ventana + v_viejos) i;

  insert into services (lubricentro_id, sucursal_id, vehiculo_id, usuario_id, tipo, fecha, created_at,
                        kilometros, aceite_tipo, prox_service_km)
  select v_demo, v_suc, v.id, v_usr, 'service', t.at::date, t.at, 50000, '10W40', 60000
  from vehiculos v
  cross join lateral (
    select substr(v.patente, 3, 3)::integer as i
  ) n
  cross join lateral (
    -- Los primeros, repartidos en las últimas 8 semanas (22 por semana);
    -- el resto, hace 60 días: después de la entrega y afuera de la ventana.
    select case when n.i <= v_ventana
                then now() - make_interval(days => (n.i % 8) * 7 + 3)
                else now() - interval '60 days' end as at
  ) t
  where v.lubricentro_id = v_demo and v.patente like 'SK%AA';
end $$;`);

const partida = stockDe(DEMO);
if (partida.stock !== 115 || partida.ritmo !== 22 || partida.semanas !== 5.2) {
  console.log(`\nEl demo de prueba no quedó en 115 calcos / 22 por semana / 5,2 semanas (quedó en ${JSON.stringify(partida)}): no se puede seguir.`);
  resend.parar();
  process.exit(1);
}

// ---------- Tres lubricentros con login ----------
// Dos bajo el umbral: 116 entregadas hace 90 días, 81 autos nuevos (10 por
// semana) y un recuento de 25 → 2,5 semanas: aviso, mail y lista. Uno está
// al día y afuera del reloj; el otro, adentro del reloj y a 3 días de
// vencer. Y uno JOVEN: 116 entregadas hace 12 días y 81 autos nuevos hace 5
// → 35 calcos y todavía sin ritmo (menos de 2 semanas de historia).
const MARCA = Date.now().toString(36);
const slug = (n) => `calcos-run-${MARCA}-${n}`;
const mail = (n) => `owner-${slug(n)}@fidellimotors.app`;
const VERSION_LEGAL = /VERSION_LEGAL\s*=\s*"([^"]+)"/.exec(fs.readFileSync(path.join(RAIZ, "lib/legal.ts"), "utf8"))?.[1] ?? "1.0";

function crearTenant(n, nombre, { porVencer, joven = false }) {
  const entrega = joven ? "12 days" : "90 days";
  sql(`do $$
declare
  v_id uuid; v_suc uuid; v_cli uuid; v_usr uuid := gen_random_uuid(); v_plan uuid; v_super uuid; v_s uuid; k integer;
begin
  select id into v_plan from planes where nombre = 'Pro' and not heredado;
  select id into v_super from usuarios where rol = 'superadmin' limit 1;

  insert into lubricentros (nombre, slug, created_at, onboarding_completado_at, bienvenida_vista_at, pago_presentado_at, cobranza_desde)
  values ('${nombre}', '${slug(n)}', now() - interval '100 days', now(), now(), now(), ${porVencer ? "current_date - 60" : "null"})
  returning id into v_id;
  insert into sucursales (lubricentro_id, nombre, telefono) values (v_id, 'Centro', '351 555 0142') returning id into v_suc;
  insert into clientes (lubricentro_id, nombre, telefono) values (v_id, 'Cliente de prueba', '3510000000') returning id into v_cli;
  insert into suscripciones (lubricentro_id, plan_id, estado, periodo, descuento_pct, inicio, vencimiento)
  values (v_id, v_plan, 'activa', 'mensual', 0, current_date - 27, current_date + ${porVencer ? 3 : 20})
  returning id into v_s;
  insert into pagos (lubricentro_id, suscripcion_id, registrado_por, periodo_desde, periodo_hasta, monto, fecha_pago)
  values (v_id, v_s, v_super, current_date - 27, current_date + ${porVencer ? 3 : 20}, 49000, current_date - 27);

  insert into auth.users (id, instance_id, email, encrypted_password, email_confirmed_at, created_at, updated_at, aud, role,
    raw_app_meta_data, raw_user_meta_data, confirmation_token, recovery_token, email_change_token_new, email_change)
  values (v_usr, '00000000-0000-0000-0000-000000000000', '${mail(n)}', extensions.crypt('demo1234', extensions.gen_salt('bf')), now(),
    now(), now(), 'authenticated', 'authenticated', '{"provider":"email","providers":["email"]}'::jsonb,
    jsonb_build_object('rol', 'owner', 'nombre', 'Dueño ${n}', 'lubricentro_id', v_id), '', '', '', '');
  perform crear_identidad_email(v_usr, '${mail(n)}');
  insert into aceptaciones_terminos (lubricentro_id, usuario_id, version) values (v_id, v_usr, '${VERSION_LEGAL}');

  insert into vehiculos (lubricentro_id, cliente_id, patente, patente_normalizada, marca, modelo)
  select v_id, v_cli, 'RK' || lpad(i::text, 3, '0') || 'AA', 'RK' || lpad(i::text, 3, '0') || 'AA', 'Ford', 'Ranger'
  from generate_series(1, 81) i;
  insert into services (lubricentro_id, sucursal_id, vehiculo_id, usuario_id, tipo, fecha, created_at, kilometros, aceite_tipo, prox_service_km)
  select v_id, v_suc, v.id, v_super, 'service', t.at::date, t.at, 50000, '10W40', 60000
  from vehiculos v
  cross join lateral (select substr(v.patente, 3, 3)::integer as i) n
  cross join lateral (
    select ${joven
      ? "now() - interval '5 days'"
      : `case when n.i = 81 then now() - interval '60 days'
                else now() - make_interval(days => (n.i % 8) * 7 + 3) end`} as at
  ) t
  where v.lubricentro_id = v_id;

  insert into pedidos_calcos (lubricentro_id, fecha, cantidad, incluidas, nota, created_at)
  values (v_id, ((now() - interval '${entrega}') at time zone 'America/Argentina/Buenos_Aires')::date,
          116, true, 'entrega del alta', now() - interval '${entrega}');
  update lubricentros l set calcos_entregadas = (select coalesce(sum(pc.cantidad), 0) from pedidos_calcos pc where pc.lubricentro_id = l.id) where l.id = v_id;
  ${joven ? "" : `insert into recuentos_calcos (lubricentro_id, cantidad, declarado_por, created_at)
  values (v_id, 25, v_usr, now() - interval '1 hour');`}
end $$;`);
  return sql(`select id from lubricentros where slug = '${slug(n)}';`);
}
const AVISO = crearTenant("aviso", "Lubricentro Aviso", { porVencer: false });
const VENCE = crearTenant("vence", "Lubricentro Vence", { porVencer: true });
const JOVEN = crearTenant("joven", "Lubricentro Joven", { porVencer: false, joven: true });
{
  const s = stockDe(JOVEN);
  if (s.stock !== 35 || s.ritmo !== null || s.semanas !== null) {
    console.log(`\nEl lubricentro de prueba «joven» no quedó en 35 calcos y sin ritmo (${JSON.stringify(s)}): no se puede seguir.`);
    resend.parar();
    process.exit(1);
  }
}
for (const [n, id] of [["aviso", AVISO], ["vence", VENCE]]) {
  const s = stockDe(id);
  const contador = Number(sql(`select calcos_entregadas from lubricentros where id = '${id}';`));
  if (s.stock !== 25 || s.ritmo !== 10 || s.semanas !== 2.5 || contador !== 116) {
    console.log(`\nEl lubricentro de prueba «${n}» no quedó en 25 calcos / 10 por semana / 2,5 semanas (${JSON.stringify(s)}): no se puede seguir.`);
    resend.parar();
    process.exit(1);
  }
}

// Un PNG de verdad, de 1000 × 1600: más ancho que la miniatura (400), para
// que se note cuál de los dos se cargó.
function pngLiso(ancho, alto, [r, g, b]) {
  const crc = (buf) => {
    let c = ~0;
    for (const x of buf) { c ^= x; for (let k = 0; k < 8; k++) c = c & 1 ? (c >>> 1) ^ 0xedb88320 : c >>> 1; }
    return ~c >>> 0;
  };
  const trozo = (tipo, datos) => {
    const cuerpo = Buffer.concat([Buffer.from(tipo), datos]);
    const largo = Buffer.alloc(4); largo.writeUInt32BE(datos.length);
    const suma = Buffer.alloc(4); suma.writeUInt32BE(crc(cuerpo));
    return Buffer.concat([largo, cuerpo, suma]);
  };
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(ancho, 0); ihdr.writeUInt32BE(alto, 4); ihdr.set([8, 2, 0, 0, 0], 8);
  const fila = Buffer.concat([Buffer.from([0]), Buffer.alloc(ancho * 3).map((_, i) => [r, g, b][i % 3])]);
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    trozo("IHDR", ihdr),
    trozo("IDAT", zlib.deflateSync(Buffer.concat(Array.from({ length: alto }, () => fila)))),
    trozo("IEND", Buffer.alloc(0)),
  ]);
}
const TMP = fs.mkdtempSync(path.join(os.tmpdir(), "fm-calcos-stock-"));
const ARCHIVO_PNG = path.join(TMP, "calco.png");
const ANCHO_DEL_ARCHIVO = 1000;
fs.writeFileSync(ARCHIVO_PNG, pngLiso(ANCHO_DEL_ARCHIVO, 1600, [0x1f, 0x4e, 0x79]));

const navegador = await chromium.launch({ args: ["--lang=es-AR"] });
if (DIR_CAPTURAS) fs.mkdirSync(DIR_CAPTURAS, { recursive: true });

async function sesionDe(email, destino) {
  const ctx = await navegador.newContext();
  const p = await ctx.newPage();
  p.setDefaultNavigationTimeout(45_000);
  await p.goto(`${BASE}/login`, { waitUntil: "networkidle" });
  await p.fill('input[name="email"]', email);
  await p.fill('input[name="password"]', "demo1234");
  await p.click('button[type="submit"]');
  await p.waitForURL(destino, { timeout: 20_000 });
  const estado = await ctx.storageState();
  await ctx.close();
  return estado;
}
const SESION_OWNER = await sesionDe("demo@fidellimotors.app", "**/panel**");
const SESION_FIDELLI = await sesionDe("santi@fidellimotors.app", "**/fidelli**");
const SESION_AVISO = await sesionDe(mail("aviso"), "**/panel**");
const SESION_VENCE = await sesionDe(mail("vence"), "**/panel**");
const SESION_JOVEN = await sesionDe(mail("joven"), "**/panel**");

async function abrir(vista, sesion) {
  const tactil = vista.width < 768;
  const ctx = await navegador.newContext({
    viewport: vista,
    deviceScaleFactor: 2,
    locale: "es-AR",
    hasTouch: tactil,
    isMobile: tactil,
    storageState: sesion,
  });
  const page = await ctx.newPage();
  page.setDefaultTimeout(6000);
  // La primera visita a una ruta en `next dev` la compila, y con la máquina
  // cargada Storage tarda en firmar: puede tardar.
  page.setDefaultNavigationTimeout(90_000);
  const tocar = (locator) => (tactil ? locator.tap() : locator.click());
  return { ctx, page, tocar };
}

async function capturar(page, nombre) {
  if (!DIR_CAPTURAS) return;
  await page.addStyleTag({ content: "nextjs-portal { display: none !important; }" });
  const vista = page.viewportSize();
  const alto = await page.evaluate(() => document.documentElement.scrollHeight);
  await page.setViewportSize({ width: vista.width, height: Math.max(vista.height, alto) });
  await page.waitForTimeout(250);
  await page.screenshot({ path: path.join(DIR_CAPTURAS, `${nombre}.png`) });
  await page.setViewportSize(vista);
}

const sinM2 = async (page) => !/m²|\bm2\b/i.test(await page.locator("body").innerText());
const limpio = (s) => s.replace(/\s+/g, " ").trim();

const { page, tocar, ctx } = await abrir({ width: 390, height: 844 }, SESION_OWNER);
const fidelli = await abrir({ width: 1280, height: 900 }, SESION_FIDELLI);

// El aviso del Inicio se decide después de montar (lee localStorage): se le
// da un momento antes de afirmar que NO está.
async function avisoDeCalcos(p) {
  await p.waitForLoadState("networkidle");
  await p.waitForTimeout(400);
  return p.locator("[data-aviso-calcos]");
}

// ============================================================
// B · Mi cuenta → Calcos
// ============================================================
titulo("B · Mi cuenta → Calcos: cuántas te quedan");

await paso("el diseño, para la miniatura", async () => {
  const f = fidelli.page;
  await f.goto(`${BASE}/fidelli/${DEMO}?tab=calcos`, { waitUntil: "networkidle" });
  await f.getByRole("button", { name: "Subir diseño" }).first().click();
  const dialogo = f.getByRole("dialog");
  await dialogo.locator('input[type="file"]').setInputFiles(ARCHIVO_PNG);
  await dialogo.getByRole("button", { name: "Subir diseño" }).click();
  await dialogo.waitFor({ state: "hidden", timeout: 60_000 });
  check("el diseño quedó subido", sql(`select count(*) from disenos_calco where lubricentro_id = '${DEMO}' and actual;`) === "1");
});

await paso("el stock, con los números de la base", async () => {
  const r = await page.goto(CALCOS, { waitUntil: "networkidle" });
  check("la página responde", r?.status() === 200, `status ${r?.status()}`);
  const bloque = page.locator("[data-stock]");
  await bloque.waitFor({ timeout: 10_000 });
  const texto = limpio(await bloque.innerText());
  check("dice cuántas quedan, para cuántas semanas y a qué ritmo",
    texto.includes("Te quedan unas 115") && texto.includes("alcanzan para unas 5 semanas al ritmo de 22 autos nuevos por semana"), texto);
  check("el número es el de stock_calcos()", limpio(await page.locator("[data-stock-valor]").innerText()) === String(partida.stock));
  check("ofrece contar y corregir", (await bloque.getByRole("button", { name: /Contá y corregí/ }).count()) === 1);
  // Arriba del historial.
  const orden = await page.evaluate(() => {
    const s = document.querySelector("[data-stock]");
    const h = document.querySelector("[data-historial]");
    return s && h ? s.getBoundingClientRect().top < h.getBoundingClientRect().top : null;
  });
  check("está arriba del historial", orden === true);
  check("la palabra «m²» no aparece", await sinM2(page));
  check("no se ofrece descargar el archivo de impresión", (await page.locator("[data-descarga]").count()) === 0);
  await capturar(page, "mi-cuenta-stock-390");
});

await paso("la miniatura sale por la transformación de Storage", async () => {
  const img = page.locator("[data-calco] img");
  await img.waitFor({ timeout: 10_000 });
  await page.waitForFunction(() => {
    const i = document.querySelector("[data-calco] img");
    return i && i.complete && i.naturalWidth > 0;
  }, null, { timeout: 15_000 });
  const src = await img.getAttribute("src");
  const medida = await img.evaluate((i) => ({ ancho: i.naturalWidth, src: i.currentSrc }));
  // El ancho pedido viaja adentro del token firmado, no como parámetro: lo
  // que lo prueba es la imagen que llega.
  check("la URL es la de transformación, no la del archivo", /\/storage\/v1\/render\/image\/sign\/calcos\//.test(src ?? ""), src ?? "");
  check(`la imagen que se cargó mide 400 de ancho, no los ${ANCHO_DEL_ARCHIVO} del archivo`, medida.ancho === 400, `${medida.ancho}px · ${medida.src.slice(0, 90)}`);
  const enlace = await page.locator("[data-calco] a[href]").first().getAttribute("href");
  check("tocarla abre el archivo original", /\/storage\/v1\/object\/sign\/calcos\//.test(enlace ?? ""), enlace ?? "");
});

await paso("si la transformación falla, se ve el archivo entero (no un hueco)", async () => {
  const otra = await abrir({ width: 390, height: 844 }, SESION_OWNER);
  await otra.page.route("**/storage/v1/render/image/**", (ruta) => ruta.abort());
  await otra.page.goto(CALCOS, { waitUntil: "networkidle" });
  const ok = await otra.page.waitForFunction(() => {
    const i = document.querySelector("[data-calco] img");
    return i && i.complete && i.naturalWidth > 0 && /\/object\/sign\//.test(i.currentSrc);
  }, null, { timeout: 15_000 }).then(() => true).catch(() => false);
  check("la imagen cae al archivo firmado", ok);
  await otra.ctx.close();
});

await paso("con menos de 2 semanas de historia, el número a secas", async () => {
  const j = await abrir({ width: 390, height: 844 }, SESION_JOVEN);
  await j.page.goto(CALCOS, { waitUntil: "networkidle" });
  const texto = limpio(await j.page.locator("[data-stock]").innerText());
  check("dice cuántas quedan", texto.includes("Te quedan unas 35."), texto);
  check("y no promete semanas ni dice un ritmo que todavía no sabe", !/alcanzan|por semana|semanas/.test(texto), texto);
  await j.page.goto(INICIO, { waitUntil: "networkidle" });
  check("sin ritmo y con más de 20 calcos, el Inicio no avisa", (await (await avisoDeCalcos(j.page)).count()) === 0);
  await j.ctx.close();
});

await paso("con 5 semanas, el Inicio no avisa nada", async () => {
  await page.goto(INICIO, { waitUntil: "networkidle" });
  check("sin aviso de calcos", (await (await avisoDeCalcos(page)).count()) === 0);
});

await paso("«Contá y corregí» cambia el número", async () => {
  await page.goto(CALCOS, { waitUntil: "networkidle" });
  const bloque = page.locator("[data-stock]");
  await tocar(bloque.getByRole("button", { name: /Contá y corregí/ }));
  const campo = bloque.locator('input[name="cantidad"]');
  await campo.waitFor({ timeout: 6000 });
  check("pregunta cuántas quedan", limpio(await bloque.innerText()).includes("¿Cuántas te quedan?"));
  await campo.fill("80");
  await tocar(bloque.getByRole("button", { name: "Guardar" }));
  await page.waitForFunction(() => document.querySelector("[data-stock-valor]")?.textContent?.trim() === "80", null, { timeout: 15_000 });
  const texto = limpio(await bloque.innerText());
  check("ahora dice 80, para unas 3 semanas", texto.includes("Te quedan unas 80") && texto.includes("alcanzan para unas 3 semanas"), texto);
  check("y dice que la cuenta sale de su recuento", /contaste/i.test(texto), texto);
  const fila = sql(`select r.cantidad || '|' || u.email from recuentos_calcos r join usuarios u on u.id = r.declarado_por where r.lubricentro_id = '${DEMO}' order by r.created_at desc limit 1;`);
  check("el recuento quedó en la base, con el dueño que contó", fila === "80|demo@fidellimotors.app", fila);
  const s = stockDe(DEMO);
  check("y stock_calcos() parte de ahí", s.stock === 80 && s.semanas === 3.6, JSON.stringify(s));
});

// ============================================================
// C · El aviso del Inicio
// ============================================================
titulo("C · El aviso del Inicio");
const FRASE = "Te quedan unas 80 calcos, para unas 3 semanas. Producir y enviar tarda hasta 2. Pedí ahora.";

await paso("bajo el umbral, aparece", async () => {
  await page.goto(INICIO, { waitUntil: "networkidle" });
  const aviso = await avisoDeCalcos(page);
  await aviso.waitFor({ timeout: 10_000 });
  const texto = limpio(await aviso.innerText());
  check("con el texto del sprint", texto.includes(FRASE), texto);
  const enlace = aviso.locator('a[href="/panel/cuenta/calcos"]');
  check("lleva a Mi cuenta → Calcos", (await enlace.count()) === 1);
  check("no es un modal ni tapa nada", (await page.locator('[role="dialog"]').count()) === 0);
  const rojo = await aviso.evaluate((el) =>
    [el, ...el.querySelectorAll("*")].some((n) => /rgb\(224, 31, 38\)/.test(getComputedStyle(n).backgroundColor + getComputedStyle(n).color)));
  check("sin el rojo de marca: el único botón primario del Inicio sigue siendo «+ Nuevo trabajo»", !rojo);
  const chicos = await aviso.locator("a, button").evaluateAll((els) =>
    els.filter((el) => el.getBoundingClientRect().height < 44).map((el) => `${(el.getAttribute("aria-label") ?? el.textContent ?? "").trim().slice(0, 20)} (${Math.round(el.getBoundingClientRect().height)}px)`));
  check("lo que se toca mide 44px o más", chicos.length === 0, chicos.join(", "));
  const desborde = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  check("sin scroll horizontal a 390", desborde <= 0, `${desborde}px de más`);
  await capturar(page, "aviso-inicio-390");
  await tocar(enlace);
  await page.waitForURL("**/panel/cuenta/calcos", { timeout: 15_000 });
  check("el enlace abre Mi cuenta → Calcos", page.url().endsWith("/panel/cuenta/calcos"));
});

await paso("se cierra con la X y no vuelve en la sesión", async () => {
  await page.goto(INICIO, { waitUntil: "networkidle" });
  const aviso = await avisoDeCalcos(page);
  await aviso.waitFor({ timeout: 10_000 });
  await tocar(aviso.getByRole("button", { name: "Cerrar el aviso" }));
  await aviso.waitFor({ state: "detached", timeout: 6000 });
  check("cerrado, desaparece", (await page.locator("[data-aviso-calcos]").count()) === 0);
  await page.goto(INICIO, { waitUntil: "networkidle" });
  check("al recargar no vuelve", (await (await avisoDeCalcos(page)).count()) === 0);
  await page.goto(CALCOS, { waitUntil: "networkidle" });
  await page.goto(INICIO, { waitUntil: "networkidle" });
  check("ni al volver de otra pantalla", (await (await avisoDeCalcos(page)).count()) === 0);
});

await paso("vuelve a los 7 días", async () => {
  // El cierre quedó guardado en este dispositivo: se lo corre 6 y 8 días atrás.
  const clave = await page.evaluate(() => Object.keys(localStorage).find((k) => /calcos/i.test(k)) ?? null);
  check("el cierre se recuerda en localStorage", clave !== null);
  const haceDias = (d) => page.evaluate(([k, dias]) => {
    localStorage.setItem(k, new Date(Date.now() - dias * 86_400_000).toISOString());
  }, [clave, d]);
  await haceDias(6);
  await page.goto(INICIO, { waitUntil: "networkidle" });
  check("a los 6 días todavía no", (await (await avisoDeCalcos(page)).count()) === 0);
  await haceDias(8);
  await page.goto(INICIO, { waitUntil: "networkidle" });
  const aviso = await avisoDeCalcos(page);
  check("a los 8 días está de vuelta", (await aviso.count()) === 1);
});

await paso("con un pedido abierto no se avisa", async () => {
  const id = sql(`insert into encargos_calcos (lubricentro_id, incluido, cantidad, entrega, monto_pack, monto_rediseno, monto_envio, monto_total, costo_estimado, comision_estimada, estado)
    values ('${DEMO}', true, 200, 'retiro', 0, 0, 0, 0, 0, 0, 'pagado') returning id;`);
  await page.goto(INICIO, { waitUntil: "networkidle" });
  check("con un pedido pagado en camino, sin aviso", (await (await avisoDeCalcos(page)).count()) === 0);
  await page.goto(CALCOS, { waitUntil: "networkidle" });
  check("Mi cuenta → Calcos sigue diciendo cuántas quedan", limpio(await page.locator("[data-stock]").innerText()).includes("Te quedan unas 80"));
  sql(`update encargos_calcos set estado = 'cancelado' where id = '${id}';`);
  await page.goto(INICIO, { waitUntil: "networkidle" });
  check("sin el pedido, el aviso vuelve", (await (await avisoDeCalcos(page)).count()) === 1);
});

// ============================================================
// D · No se apila con cobranza
// ============================================================
titulo("D · El aviso de calcos no se apila con los de cobranza");

await paso("por vencer: está la barra de cobranza y NO el aviso de calcos", async () => {
  const v = await abrir({ width: 390, height: 844 }, SESION_VENCE);
  await v.page.goto(INICIO, { waitUntil: "networkidle" });
  const cuerpo = limpio(await v.page.locator("body").innerText());
  check("el lubricentro por vencer ve su aviso de cobranza", /vence/i.test(cuerpo) && (await v.page.getByRole("link", { name: /Pagar/ }).count()) >= 1, cuerpo.slice(0, 160));
  check("y no el de calcos, aunque le queden 2,5 semanas", (await (await avisoDeCalcos(v.page)).count()) === 0);
  check("(la base sí lo avisaría: es la pantalla la que no lo apila)", sql(`select count(*) from aviso_calcos('${VENCE}');`) === "1");

  // Paga: el vencimiento se va a un mes. La barra de cobranza desaparece.
  sql(`update suscripciones set vencimiento = current_date + 30 where lubricentro_id = '${VENCE}';`);
  await v.page.goto(INICIO, { waitUntil: "networkidle" });
  const aviso = await avisoDeCalcos(v.page);
  check("al día, el aviso de calcos aparece", (await aviso.count()) === 1);
  check("con sus números", (await aviso.count()) === 1 && limpio(await aviso.innerText()).includes("Te quedan unas 25 calcos, para unas 2 semanas."));
  sql(`update suscripciones set vencimiento = current_date + 3 where lubricentro_id = '${VENCE}';`);
  await v.ctx.close();
});

await paso("el que está al día y afuera del reloj lo ve", async () => {
  const a = await abrir({ width: 390, height: 844 }, SESION_AVISO);
  await a.page.goto(INICIO, { waitUntil: "networkidle" });
  check("aviso de calcos en el Inicio", (await (await avisoDeCalcos(a.page)).count()) === 1);
  await a.ctx.close();
});

// ============================================================
// E · /fidelli
// ============================================================
titulo("E · /fidelli: la alerta, la lista y el switch");

await paso("la alerta del hub y la lista de arriba de la cola", async () => {
  const f = fidelli.page;
  await f.goto(`${BASE}/fidelli`, { waitUntil: "networkidle" });
  const cuerpo = limpio(await f.locator("body").innerText());
  check("el hub avisa cuántos se quedan sin calcos", cuerpo.includes("2 tenants se quedan sin calcos en menos de 3 semanas."), cuerpo.match(/[^.]*sin calcos[^.]*\./)?.[0] ?? "(sin alerta)");
  const alerta = f.locator("li", { hasText: "se quedan sin calcos" }).getByRole("link");
  check("y lleva a la cola de calcos", (await alerta.getAttribute("href").catch(() => null)) === "/fidelli/calcos");

  await f.goto(`${BASE}/fidelli/calcos`, { waitUntil: "networkidle" });
  const lista = f.locator("[data-sin-stock]");
  await lista.waitFor({ timeout: 10_000 });
  const filas = lista.locator("[data-sin-stock-fila]");
  check("la lista tiene a los dos", (await filas.count()) === 2, `${await filas.count()}`);
  check("el demo no está, aunque esté bajo el umbral", (await lista.locator('[data-sin-stock-fila="demo"]').count()) === 0);
  const fila = lista.locator(`[data-sin-stock-fila="${slug("aviso")}"]`);
  const texto = limpio(await fila.innerText());
  check("con el nombre, el stock, el ritmo y las semanas",
    texto.includes("Lubricentro Aviso") && /\b25\b/.test(texto) && /10 por semana/.test(texto) && /2,5 semanas/.test(texto), texto);
  const wa = await fila.locator('a[href^="https://wa.me/"]').getAttribute("href").catch(() => null);
  const mensaje = wa ? decodeURIComponent(wa.split("?text=")[1] ?? "") : "";
  check("y el WhatsApp del lubricentro armado", wa !== null && wa.startsWith("https://wa.me/5493515550142?text="), wa ?? "(sin enlace)");
  check("que saluda al dueño y le dice cuántas le quedan", mensaje.includes("Dueño aviso") && mensaje.includes("25") && /calcos/.test(mensaje), mensaje);
  check("sin «m²» en el mensaje al dueño", !/m²/.test(mensaje));
  const arriba = await f.evaluate(() => {
    const l = document.querySelector("[data-sin-stock]");
    const t = document.querySelector("[data-calcos] nav");
    return l && t ? l.getBoundingClientRect().top < t.getBoundingClientRect().top : null;
  });
  check("la lista va arriba de la cola", arriba === true);
  await capturar(f, "lista-sin-stock-1280");
});

await paso("«Imprime sus calcos por su cuenta»: se prende desde la ficha, con nota", async () => {
  const f = fidelli.page;
  await f.goto(`${BASE}/fidelli/${AVISO}?tab=calcos`, { waitUntil: "networkidle" });
  const bloque = f.locator("[data-calcos-propias]");
  await bloque.waitFor({ timeout: 10_000 });
  check("arranca apagado", (await bloque.getAttribute("data-calcos-propias")) === "no");
  check("la ficha muestra la estimación", limpio(await f.locator("[data-stock-ficha]").innerText()).includes("25"), limpio(await f.locator("[data-stock-ficha]").innerText().catch(() => "(sin bloque)")));
  await capturar(f, "ficha-stock-1280");
  await f.getByRole("button", { name: "Imprime por su cuenta" }).click();
  const dialogo = f.getByRole("dialog");
  await dialogo.getByRole("button", { name: "Guardar" }).click();
  check("sin nota no se guarda", (await dialogo.isVisible()) && sql(`select calcos_propias from lubricentros where id = '${AVISO}';`) === "f");
  await dialogo.locator('textarea[name="nota"]').fill("Imprime con la gráfica de su cuñado, lo pidió por WhatsApp");
  await dialogo.getByRole("button", { name: "Guardar" }).click();
  await dialogo.waitFor({ state: "hidden", timeout: 15_000 });
  check("quedó prendido en la base", sql(`select calcos_propias from lubricentros where id = '${AVISO}';`) === "t");
  await f.locator('[data-calcos-propias="si"]').waitFor({ timeout: 10_000 });
  const texto = limpio(await f.locator("[data-calcos-propias]").innerText());
  check("la ficha lo dice, con la nota", texto.includes("Imprime con la gráfica de su cuñado"), texto);
  const evento = sql(`select e.motivo || '|' || u.email from tenant_eventos e join usuarios u on u.id = e.actor where e.lubricentro_id = '${AVISO}' and e.despues ->> 'calcos_propias' = 'true' order by e.created_at desc limit 1;`);
  check("con su evento, autor y nota", evento === "Imprime con la gráfica de su cuñado, lo pidió por WhatsApp|santi@fidellimotors.app", evento);

  await f.goto(`${BASE}/fidelli/${AVISO}?tab=historial`, { waitUntil: "networkidle" });
  const historial = limpio(await f.locator("body").innerText());
  check("y el historial de la ficha lo cuenta, con la nota",
    historial.includes("Imprime sus calcos por su cuenta") && historial.includes("Imprime con la gráfica de su cuñado"), historial.slice(0, 200));

  await f.goto(`${BASE}/fidelli/calcos`, { waitUntil: "networkidle" });
  check("y sale de la lista de Grego", (await f.locator(`[data-sin-stock-fila="${slug("aviso")}"]`).count()) === 0 && (await f.locator("[data-sin-stock-fila]").count()) === 1);
});

// ============================================================
// F · Los que imprimen por su cuenta
// ============================================================
titulo("F · El que imprime por su cuenta");

await paso("ni estimación ni aviso, y aparece la descarga", async () => {
  const a = await abrir({ width: 390, height: 844 }, SESION_AVISO);
  await a.page.goto(INICIO, { waitUntil: "networkidle" });
  check("sin aviso en el Inicio", (await (await avisoDeCalcos(a.page)).count()) === 0);
  await a.page.goto(CALCOS, { waitUntil: "networkidle" });
  check("sin estimación en Mi cuenta → Calcos", (await a.page.locator("[data-stock]").count()) === 0);
  check("los packs siguen ahí: no se le esconde nada", (await a.page.locator("[data-pack]").count()) === 5);
  check("y el historial", (await a.page.locator("[data-historial]").count()) === 1);
  // Todavía no tiene diseño: sin archivo no hay qué descargar.
  check("sin diseño, no hay descarga", (await a.page.locator("[data-descarga]").count()) === 0);
  await a.ctx.close();
});

await paso("con diseño: «Descargar el archivo de impresión», el archivo original", async () => {
  // El demo sí tiene diseño. Se le prende el switch por la puerta, como
  // superadmin (la pantalla de la ficha ya se probó arriba).
  const superId = sql("select id from usuarios where rol = 'superadmin' limit 1;");
  sql(`begin;
    select set_config('request.jwt.claims', json_build_object('sub', '${superId}', 'role', 'authenticated')::text, true);
    set local role authenticated;
    select marcar_calcos_propias('${DEMO}', true, 'prueba de la descarga del archivo');
    commit;`);
  await page.goto(CALCOS, { waitUntil: "networkidle" });
  const descarga = page.locator("[data-descarga]");
  check("el botón aparece", (await descarga.count()) === 1 && limpio(await descarga.innerText()).includes("Descargar el archivo de impresión"));
  const href = await descarga.getAttribute("href").catch(() => null);
  check("es la URL firmada del objeto original, para descargar", /\/storage\/v1\/object\/sign\/calcos\//.test(href ?? "") && /download=/.test(href ?? ""), href ?? "");
  const bajado = await page.evaluate(async (u) => {
    const r = await fetch(u);
    return { ok: r.ok, bytes: (await r.blob()).size, disposicion: r.headers.get("content-disposition") };
  }, href);
  check("y baja el archivo entero", bajado.ok && bajado.bytes === fs.statSync(ARCHIVO_PNG).size, JSON.stringify(bajado));
  check("mide 44px o más", (await descarga.evaluate((el) => el.getBoundingClientRect().height)) >= 44);
  check("sin estimación", (await page.locator("[data-stock]").count()) === 0);
  await page.goto(INICIO, { waitUntil: "networkidle" });
  check("ni aviso en el Inicio", (await (await avisoDeCalcos(page)).count()) === 0);

  sql(`begin;
    select set_config('request.jwt.claims', json_build_object('sub', '${superId}', 'role', 'authenticated')::text, true);
    set local role authenticated;
    select marcar_calcos_propias('${DEMO}', false, 'fin de la prueba de la descarga');
    commit;`);
  await page.goto(CALCOS, { waitUntil: "networkidle" });
  check("apagado el switch, la descarga desaparece y la estimación vuelve",
    (await page.locator("[data-descarga]").count()) === 0 && (await page.locator("[data-stock]").count()) === 1);
});

// ============================================================
// G · Los mails, por el cron de las 9:00
// ============================================================
titulo("G · Los dos mails, por el cron de los avisos de cobranza");
const llamar = async (auth = `Bearer ${env.CRON_SECRET}`) => {
  const r = await fetch(CRON, { headers: auth ? { authorization: auth } : {} });
  let j = null; try { j = await r.json(); } catch { /* sin cuerpo */ }
  return { status: r.status, j };
};
const deCalcos = (j, n) => (j?.calcos?.enviados ?? []).filter((e) => e.slug === slug(n));
const filasDe = (id) => sql(`select coalesce(string_agg(tipo, ',' order by enviado_at), '') from emails_calcos where lubricentro_id = '${id}';`);
const mailsA = async (n) => (await enviados()).filter((m) => [].concat(m.to ?? []).includes(mail(n)) && /calcos/i.test(m.subject ?? ""));

await paso("la misma guarda, y el de 4 semanas una sola vez", async () => {
  const sin = await llamar(null);
  check("sin el secreto del cron → 401 y nada registrado", sin.status === 401 && sql("select count(*) from emails_calcos;") === "0", `${sin.status}`);

  const r1 = await llamar();
  check("con el secreto → 200", r1.status === 200, `${r1.status} ${JSON.stringify(r1.j)?.slice(0, 200)}`);
  check("los avisos de cobranza salen por la misma corrida, como siempre",
    Array.isArray(r1.j?.enviados) && Array.isArray(r1.j?.fallidos) && typeof r1.j?.pendientes === "number" &&
      r1.j.enviados.some((e) => e.slug === slug("vence") && e.tipo === "por_vencer"),
    JSON.stringify({ pendientes: r1.j?.pendientes, enviados: r1.j?.enviados, fallidos: r1.j?.fallidos }).slice(0, 240));
  check("le toca al que está bajo las 4 semanas", deCalcos(r1.j, "vence").length === 1 && deCalcos(r1.j, "vence")[0]?.tipo === "calcos_4_semanas", JSON.stringify(r1.j?.calcos));
  check("no al que imprime por su cuenta", deCalcos(r1.j, "aviso").length === 0 && filasDe(AVISO) === "");
  check("no al demo", !(r1.j?.calcos?.enviados ?? []).some((e) => e.slug === "demo"));
  check("ni al que todavía no tiene ritmo y le sobran calcos", deCalcos(r1.j, "joven").length === 0);
  check("quedó registrado, uno", filasDe(VENCE) === "calcos_4_semanas", filasDe(VENCE));

  const recibidos = await mailsA("vence");
  check("el mail salió, al owner", recibidos.length === 1, `${recibidos.length}`);
  const cuerpo = `${recibidos[0]?.text ?? ""} ${recibidos[0]?.html ?? ""}`;
  check("dice lo que dice el Inicio", cuerpo.includes("Te quedan unas 25 calcos, para unas 2 semanas. Producir y enviar tarda hasta 2. Pedí ahora."), (recibidos[0]?.text ?? "").slice(0, 200));
  check("con el botón a Mi cuenta → Calcos", /\/panel\/cuenta\/calcos/.test(cuerpo));
  check("sin «m²»", !/m²/.test(cuerpo + (recibidos[0]?.subject ?? "")));

  const r2 = await llamar();
  check("al día siguiente no se repite", r2.status === 200 && deCalcos(r2.j, "vence").length === 0 && filasDe(VENCE) === "calcos_4_semanas" && (await mailsA("vence")).length === 1, JSON.stringify(r2.j?.calcos));
});

await paso("una entrega nueva habilita los escalones; con un pedido abierto no se manda", async () => {
  // Una entrega chica: sigue bajo el umbral, pero es otro ciclo.
  sql(`insert into pedidos_calcos (lubricentro_id, fecha, cantidad, incluidas, nota)
       values ('${VENCE}', (now() at time zone 'America/Argentina/Buenos_Aires')::date, 1, true, 'entrega nueva de prueba');
       update lubricentros l set calcos_entregadas = (select coalesce(sum(pc.cantidad), 0) from pedidos_calcos pc where pc.lubricentro_id = l.id) where l.id = '${VENCE}';`);
  const s = stockDe(VENCE);
  check("con la entrega nueva sigue bajo el umbral (26 calcos, 2,6 semanas)", s.stock === 26 && s.semanas === 2.6, JSON.stringify(s));

  const id = sql(`insert into encargos_calcos (lubricentro_id, incluido, cantidad, entrega, monto_pack, monto_rediseno, monto_envio, monto_total, costo_estimado, comision_estimada, estado)
    values ('${VENCE}', true, 200, 'retiro', 0, 0, 0, 0, 0, 0, 'en_produccion') returning id;`);
  const r3 = await llamar();
  check("con un pedido en producción, no se manda", r3.status === 200 && deCalcos(r3.j, "vence").length === 0 && filasDe(VENCE) === "calcos_4_semanas", JSON.stringify(r3.j?.calcos));

  sql(`update encargos_calcos set estado = 'cancelado' where id = '${id}';`);
  const r4 = await llamar();
  check("sin el pedido, el de 4 semanas vuelve a salir: es un ciclo nuevo", deCalcos(r4.j, "vence").length === 1 && filasDe(VENCE) === "calcos_4_semanas,calcos_4_semanas", `${JSON.stringify(r4.j?.calcos)} · ${filasDe(VENCE)}`);
  check("dos mails en total", (await mailsA("vence")).length === 2);

  // Y el segundo escalón: le quedan 8.
  sql(`insert into recuentos_calcos (lubricentro_id, cantidad) values ('${VENCE}', 8);`);
  const r5 = await llamar();
  check("al cruzar la semana, sale el segundo", deCalcos(r5.j, "vence")[0]?.tipo === "calcos_1_semana" && filasDe(VENCE) === "calcos_4_semanas,calcos_4_semanas,calcos_1_semana", `${JSON.stringify(r5.j?.calcos)} · ${filasDe(VENCE)}`);
  const r6 = await llamar();
  check("y tampoco se repite", deCalcos(r6.j, "vence").length === 0 && (await mailsA("vence")).length === 3, JSON.stringify(r6.j?.calcos));
  check("`?simular=1` no manda ni registra", await (async () => {
    sql(`insert into pedidos_calcos (lubricentro_id, fecha, cantidad, incluidas, nota)
         values ('${VENCE}', (now() at time zone 'America/Argentina/Buenos_Aires')::date, 1, true, 'otra entrega de prueba');
         update lubricentros l set calcos_entregadas = (select coalesce(sum(pc.cantidad), 0) from pedidos_calcos pc where pc.lubricentro_id = l.id) where l.id = '${VENCE}';`);
    const antes = filasDe(VENCE);
    const r = await fetch(`${CRON}?simular=1`, { headers: { authorization: `Bearer ${env.CRON_SECRET}` } });
    const j = await r.json();
    return r.status === 200 && deCalcos(j, "vence").length === 1 && filasDe(VENCE) === antes && (await mailsA("vence")).length === 3;
  })());
});

// ============================================================
// H · Todos los dispositivos
// ============================================================
titulo("H · Todos los dispositivos");
for (const vista of [{ width: 360, height: 740 }, { width: 390, height: 844 }, { width: 820, height: 1180 }, { width: 1280, height: 900 }]) {
  const v = await abrir(vista, SESION_OWNER);
  await paso(`a ${vista.width}`, async () => {
    await v.page.goto(CALCOS, { waitUntil: "networkidle" });
    const bloque = v.page.locator("[data-stock]");
    await bloque.waitFor({ timeout: 10_000 });
    await v.tocar(bloque.getByRole("button", { name: /Contá y corregí/ }));
    await bloque.locator('input[name="cantidad"]').waitFor({ timeout: 6000 });
    const desborde = await v.page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
    check(`${vista.width}: sin scroll horizontal`, desborde <= 0, `${desborde}px de más`);
    const chicos = await bloque.locator("button, input, a").evaluateAll((els) =>
      els.filter((el) => el.getBoundingClientRect().height > 0 && el.getBoundingClientRect().height < 44)
        .map((el) => `${(el.getAttribute("name") ?? el.textContent ?? "").trim().slice(0, 24)} (${Math.round(el.getBoundingClientRect().height)}px)`));
    check(`${vista.width}: todo lo que se toca mide 44px o más`, chicos.length === 0, chicos.join(", "));
    check(`${vista.width}: la palabra «m²» no aparece`, await sinM2(v.page));
    const rojos = await bloque.locator("*").evaluateAll((els) =>
      els.filter((el) => /rgb\(224, 31, 38\)/.test(getComputedStyle(el).color)).length);
    check(`${vista.width}: ningún número en el rojo de marca`, rojos === 0);
    if (vista.width === 1280) await capturar(v.page, "mi-cuenta-stock-1280");
  });
  await v.ctx.close();
}

await ctx.close();
await fidelli.ctx.close();
await navegador.close();
resend.parar();
fs.rmSync(TMP, { recursive: true, force: true });

console.log(fallas === 0 ? "\nTodo en verde." : `\n${fallas} falla(s).`);
process.exit(fallas === 0 ? 0 : 1);

// La grilla de «A quién llamar» (/panel/proximos): dos fallas de la tabla
// que no daban ningún error (regla 13: una prueba que nunca se vio en rojo
// no existe — las secciones A y B se vieron en rojo sobre `develop`, antes
// del arreglo, y las cuatro guardas se rompen solas en la sección R).
//
// Las dos fallas:
//   1 · La fila se salía de su tarjeta entre 1024 y ~1390 px. La grilla de
//       ocho columnas pedía ~1068 px y, con el sidebar, la tarjeta mide
//       menos hasta que la ventana pasa de ~1390: el botón de WhatsApp se
//       dibujaba AFUERA, «CONTACTADO» quedaba cortado y la página ganaba
//       scroll horizontal. Son las notebooks de los lubricentros (1280 y
//       1366).
//   2 · El encabezado quedaba corrido desde ~1390 px. La última columna
//       era `auto`: en la fila medía lo que el botón y en el encabezado,
//       que ahí no tiene nada, cero. Cada fila es una grilla aparte, así
//       que el `1fr` daba distinto en cada una y los títulos caían 44 px a
//       la derecha de su columna (62 en la fila de «Cargar teléfono»).
//
// Lo que comprueba, a 390, 768, 1024, 1100, 1280, 1366, 1440 y 1920, con
// cada fuente que ofrezca el filtro (Todo · Services · Pendientes ·
// Neumáticos, y la que se sume):
//   A · Nada se sale: cada texto y cada control de cada fila —y del
//       encabezado— queda adentro de la tarjeta, y la página no gana
//       scroll horizontal.
//   B · El encabezado y las filas son LA MISMA grilla: las mismas columnas
//       ya resueltas en píxeles, y cada título sobre su columna en TODAS
//       las filas (no solo en la primera: con una columna `auto` cada fila
//       se corre distinto según lo que tenga en la acción).
//   Y cuatro guardas del arreglo, que no cambian nada si se respetan:
//   C · No se pierde ninguna columna: desde 1024 las siete celdas de dato
//       se ven en cada fila, y la que no lleva título se lee sola.
//   D · El orden de lectura es el de siempre: cliente · vehículo · último
//       service · próximo · retorno · estado · contactado · acción.
//   E · Ninguna celda pisa a la de al lado.
//   F · El check y la acción de la fila miden 44 px o más.
//
// Desde 1024 todo corre dos veces: tal cual, y con 17 px menos de ancho.
// Es la barra de desplazamiento de Windows: la media query no la descuenta
// (a 1280 de ventana rige `xl`) pero el contenido sí la pierde. Playwright
// la esconde, y sin esa pasada el borde de cada breakpoint queda sin
// probar justo donde lo usa un lubricentro.
//
//   M · Con el motivo abierto: tocar el WhatsApp apagado de una fila ya
//       contactada muestra por qué está apagado; con eso a la vista vale
//       todo lo anterior (el mensaje no estira la columna ni corre la fila).
//   R · Las roturas: se rompe a mano, con CSS, lo que cada comprobación
//       dice cubrir —la plantilla vieja, una columna escondida, el orden
//       cambiado, una celda corrida, el botón achicado— y cada una tiene
//       que fallar.
//
// Requiere el stack local con el seed y el servidor de Next:
//   supabase start && npm run dev
// Correr:
//   node --no-warnings scripts/regresion-proximos-grilla.mjs
//   CAPTURAS=1 node --no-warnings scripts/regresion-proximos-grilla.mjs
//     (además deja las capturas en docs/capturas/proximos-grilla/;
//      CAPTURAS=antes las guarda con ese prefijo)
// BASE_URL y DB_CONTAINER cambian el servidor y el contenedor de la base.
// ANCHOS=1280,1366 recorre solo esos anchos (M y R corren siempre).
// DEJAR=1 no restaura al final (para mirar la pantalla a mano; la próxima
// corrida restaura lo que quedó).
//
// TOCA DATOS DEL DEMO LOCAL por psql —nueve clientes «Zzgrilla» con su
// auto, sus trabajos, dos pendientes y tres contactos, y el módulo de
// gomería, que el demo no tiene— y LOS RESTAURA AL FINAL, pase lo que
// pase: el SQL de restauración se escribe en un archivo temporal apenas se
// sabe qué se tocó, corre en el `finally`, ante Ctrl-C, y al arrancar si
// quedó de una corrida que murió. El historial de overrides no se borra
// (es evidencia): `supabase db reset` es su única limpieza.
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { chromium } from "playwright";

const RAIZ = new URL("..", import.meta.url).pathname;
const BASE = process.env.BASE_URL ?? "http://localhost:3000";
const CONTENEDOR = process.env.DB_CONTAINER ?? "supabase_db_fidelli-motors";
const PREFIJO = process.env.CAPTURAS && process.env.CAPTURAS !== "1" ? `${process.env.CAPTURAS}-` : "";
const DIR_CAPTURAS = process.env.CAPTURAS ? path.join(RAIZ, "docs/capturas/proximos-grilla") : null;
const DEJAR = Boolean(process.env.DEJAR);
// Con el contenedor en el nombre: lo que dejó una corrida contra una base
// no se le aplica a otra.
const ARCHIVO_RESTAURAR = path.join(os.tmpdir(), `fm-regresion-proximos-grilla-${CONTENEDOR}.sql`);

const VISTAS = [
  { width: 390, height: 844 },
  { width: 768, height: 1024 },
  { width: 1024, height: 768 },
  { width: 1100, height: 800 },
  { width: 1280, height: 800 },
  { width: 1366, height: 768 },
  { width: 1440, height: 900 },
  { width: 1920, height: 1080 },
];
const vista = (ancho) => VISTAS.find((v) => v.width === ancho);
const SOLO = process.env.ANCHOS ? process.env.ANCHOS.split(",").map(Number) : null;
// Desde acá la pantalla es una tabla con encabezado; por debajo, cada fila
// es una tarjeta que se lee sola.
const ESCRITORIO = 1024;
// La barra de desplazamiento clásica de Windows.
const BARRA = 17;

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

function sql(texto) {
  return execFileSync(
    "docker",
    ["exec", "-i", CONTENEDOR, "psql", "-U", "postgres", "-d", "postgres", "-X", "-q", "-A", "-t", "-v", "ON_ERROR_STOP=1"],
    { input: texto, encoding: "utf8" },
  ).trim();
}

// ============================================================
// Los datos del demo: preparar y restaurar
// ============================================================

// Los clientes de prueba llevan esta marca en el nombre y sus autos estas
// patentes: así se encuentran para borrarlos aunque la corrida haya muerto
// antes de anotar un solo id.
const MARCA_DE_PRUEBA = "Zzgrilla";
const AUTOS = {
  // Services. El nombre, el teléfono y el vehículo más largos que entran.
  largo: { patente: "ZZ 911 ZG", cliente: "Maximiliano Fernández Etcheverry", telefono: "+54 9 351 555-0171", marca: "Mercedes-Benz", modelo: "Sprinter 515 CDI Furgón" },
  // Un solo service (la fecha es supuesta y la fila lo dice) y siete cifras de odómetro.
  unico: { patente: "ZZ 912 ZG", cliente: "Unservice", telefono: "351 555 0172", marca: "Scania", modelo: "R 450" },
  // Ya contactado: el check tildado y el WhatsApp apagado.
  contactado: { patente: "ZZ 913 ZG", cliente: "Contactado", telefono: "351 555 0173", marca: "Renault", modelo: "Kangoo" },
  // Sin teléfono: la acción de la fila es «Cargar teléfono».
  sinTelefono: { patente: "ZZ 914 ZG", cliente: "Sintelefono", telefono: "-", marca: "Fiat", modelo: "Uno" },
  // Suprimido a su pedido: «Sin teléfono válido», sin acción.
  suprimido: { patente: "ZZ 915 ZG", cliente: "Suprimido", telefono: "-", marca: "Peugeot", modelo: "206" },
  // Pendientes: uno por fecha con la descripción larga, otro por kilómetros.
  pendienteFecha: { patente: "ZZ 916 ZG", cliente: "Pendiente Fecha", telefono: "351 555 0176", marca: "Volkswagen", modelo: "Amarok" },
  pendienteKm: { patente: "ZZ 917 ZG", cliente: "Pendiente Km", telefono: "351 555 0177", marca: "Toyota", modelo: "Corolla" },
  // Gomería: los cuatro motivos juntos, y una rotación con su km objetivo.
  gomeria: { patente: "ZZ 918 ZG", cliente: "Gomeria Vencida", telefono: "351 555 0178", marca: "Ford", modelo: "Ranger" },
  rotacion: { patente: "ZZ 919 ZG", cliente: "Gomeria Rotacion", telefono: "351 555 0179", marca: "Chevrolet", modelo: "S10" },
};
const NORMALIZADAS = Object.values(AUTOS).map((a) => `'${a.patente.replace(/ /g, "")}'`).join(", ");

const LUB = sql("select id from lubricentros where slug = 'demo'");
if (!LUB) {
  console.error("No está el lubricentro demo: supabase db reset");
  process.exit(1);
}
const DE_PRUEBA = `(select id from vehiculos where lubricentro_id = '${LUB}' and patente_normalizada in (${NORMALIZADAS}))`;

// El demo no tiene gomería (R15a se apoya en eso): para ver la tercera
// fuente se prende por la puerta real, como el superadmin —un UPDATE suelto
// lo rechaza el candado—, y la restauración la apaga si estaba apagada.
const SUPER = sql("select id from usuarios where rol = 'superadmin' limit 1");
const sqlGomeria = (prendida) => `
  begin;
  select set_config('request.jwt.claims', json_build_object('sub', '${SUPER}', 'role', 'authenticated')::text, true);
  set local role authenticated;
  select fijar_override_plan('${LUB}',
    (select ${prendida ? `plan_overrides || '{"neumaticos": true}'::jsonb` : "plan_overrides - 'neumaticos'"} from lubricentros where id = '${LUB}'),
    'regresion-proximos-grilla.mjs · neumaticos ${prendida ? "prendida" : "apagada"} para la prueba')
  where ${prendida ? "not" : ""} coalesce((select (plan_overrides ->> 'neumaticos')::boolean from lubricentros where id = '${LUB}'), false);
  commit;`;
let gomeriaPrendida = false;
// Los clientes, por id: el suprimido pierde la marca del nombre.
let clientes = [];

function sqlDeRestauracion() {
  return [
    // En el orden de las claves foráneas: lo que cuelga del auto, el auto,
    // el cliente. Las ruedas se van con su trabajo (on delete cascade).
    `delete from contactos where vehiculo_id in ${DE_PRUEBA};`,
    `delete from trabajos_pendientes where vehiculo_id in ${DE_PRUEBA};`,
    `delete from services where vehiculo_id in ${DE_PRUEBA};`,
    `delete from vehiculos where lubricentro_id = '${LUB}' and patente_normalizada in (${NORMALIZADAS});`,
    `delete from clientes where lubricentro_id = '${LUB}' and (nombre like '${MARCA_DE_PRUEBA} %'${
      clientes.length ? ` or id in (${clientes.map((id) => `'${id}'`).join(", ")})` : ""
    });`,
    gomeriaPrendida ? sqlGomeria(false) : "",
  ].join("\n");
}
const anotar = () => fs.writeFileSync(ARCHIVO_RESTAURAR, sqlDeRestauracion());
let restaurado = false;
function restaurar() {
  if (restaurado) return;
  restaurado = true;
  if (DEJAR) {
    console.log(`\n  ◦ DEJAR=1: los datos de prueba quedan en el demo. Los restaura la próxima corrida (${ARCHIVO_RESTAURAR}).`);
    return;
  }
  try {
    sql(sqlDeRestauracion());
    fs.rmSync(ARCHIVO_RESTAURAR, { force: true });
    console.log("\n  ◦ datos del demo restaurados");
  } catch (e) {
    console.log(`\n  ✗ NO SE PUDO RESTAURAR el demo: ${String(e.message).split("\n")[0]}`);
    console.log(`    El SQL quedó en ${ARCHIVO_RESTAURAR}; la próxima corrida lo aplica. O: supabase db reset`);
    fallas++;
  }
}
for (const senal of ["SIGINT", "SIGTERM"]) {
  process.on(senal, () => {
    restaurar();
    process.exit(1);
  });
}

// Una corrida anterior que murió sin restaurar (o que corrió con DEJAR=1).
if (fs.existsSync(ARCHIVO_RESTAURAR)) {
  sql(fs.readFileSync(ARCHIVO_RESTAURAR, "utf8"));
  fs.rmSync(ARCHIVO_RESTAURAR);
  console.log("\n  ◦ se restauró lo que dejó una corrida anterior");
}
anotar();

const OWNER = sql(`select id from usuarios where lubricentro_id = '${LUB}' and rol = 'owner' order by created_at limit 1`);
const SUCURSAL = sql(`select id from sucursales where lubricentro_id = '${LUB}' order by nombre limit 1`);

if (sql(`select coalesce(plan_overrides ->> 'neumaticos', 'false') from lubricentros where id = '${LUB}'`) !== "true") {
  gomeriaPrendida = true;
  anotar();
  sql(sqlGomeria(true));
}

// Los nueve autos. Como postgres: es un fixture, no pasa por el RLS.
const texto = (t) => `'${t.replace(/'/g, "''")}'`;
const filas = sql(`
  with cli as (
    insert into clientes (lubricentro_id, nombre, telefono) values
      ${Object.values(AUTOS).map((a) => `('${LUB}', ${texto(`${MARCA_DE_PRUEBA} ${a.cliente}`)}, ${texto(a.telefono)})`).join(",\n      ")}
    returning id, nombre
  ), veh as (
    insert into vehiculos (lubricentro_id, cliente_id, patente, marca, modelo, anio)
    select '${LUB}', cli.id, a.patente, a.marca, a.modelo, 2016
    from cli
    join (values
      ${Object.values(AUTOS).map((a) => `(${texto(`${MARCA_DE_PRUEBA} ${a.cliente}`)}, ${texto(a.patente)}, ${texto(a.marca)}, ${texto(a.modelo)})`).join(",\n      ")}
    ) as a(nombre, patente, marca, modelo) on a.nombre = cli.nombre
    returning id, cliente_id, patente
  )
  select patente || '=' || id || '=' || cliente_id from veh;`)
  .split("\n")
  .map((l) => l.split("="));
clientes = filas.map(([, , cliente]) => cliente);
anotar();
const V = Object.fromEntries(
  filas.map(([patente, id]) => [Object.keys(AUTOS).find((k) => AUTOS[k].patente === patente), id]),
);

// Todo con fechas relativas a hoy: el estado de cada fila no depende del
// día en que se corra.
//   largo, contactado · dos services (100 km por día), el próximo tocaba
//     hace 50 días → vencido. «contactado» lleva su contacto de este ciclo.
//   unico · un solo service hace 20 días → 40 km/día supuestos, urgente.
//   sinTelefono · dos services, le toca en 10 días → próximo.
//   suprimido · un service hace 5 días, le toca en 20 → próximo.
//   pendienteFecha · un pendiente para dentro de 3 días → urgente.
//   pendienteKm · le faltan 1.200 km → próximo, ya contactado.
//   gomeria · cuatro cubiertas de 2018 con 2,5 mm, colocadas y alineadas
//     hace 400 días → los cuatro motivos, vencido, ya contactado.
//   rotacion · rotadas hace 170 días → rotación en 12 días, con km objetivo.
sql(`
  insert into services (lubricentro_id, sucursal_id, vehiculo_id, usuario_id, fecha, kilometros, aceite_tipo, prox_service_km, created_at) values
    ('${LUB}', '${SUCURSAL}', '${V.largo}',       '${OWNER}', current_date - 200,   40000, '10W40',   50000, now() - interval '200 days'),
    ('${LUB}', '${SUCURSAL}', '${V.largo}',       '${OWNER}', current_date - 100,   50000, '10W40',   55000, now() - interval '100 days'),
    ('${LUB}', '${SUCURSAL}', '${V.unico}',       '${OWNER}', current_date - 20,  1234500, '15W40', 1235500, now() - interval '20 days'),
    ('${LUB}', '${SUCURSAL}', '${V.contactado}',  '${OWNER}', current_date - 200,   40000, '10W40',   50000, now() - interval '200 days'),
    ('${LUB}', '${SUCURSAL}', '${V.contactado}',  '${OWNER}', current_date - 100,   50000, '10W40',   55000, now() - interval '100 days'),
    ('${LUB}', '${SUCURSAL}', '${V.sinTelefono}', '${OWNER}', current_date - 110,   30000, '10W40',   40000, now() - interval '110 days'),
    ('${LUB}', '${SUCURSAL}', '${V.sinTelefono}', '${OWNER}', current_date - 10,    40000, '10W40',   42000, now() - interval '10 days'),
    ('${LUB}', '${SUCURSAL}', '${V.suprimido}',   '${OWNER}', current_date - 5,     80000, '10W40',   81000, now() - interval '5 days'),
    ('${LUB}', '${SUCURSAL}', '${V.pendienteKm}', '${OWNER}', current_date - 100,   50000, '10W40',   60000, now() - interval '100 days'),
    ('${LUB}', '${SUCURSAL}', '${V.pendienteKm}', '${OWNER}', current_date - 10,    59000, '10W40',   69000, now() - interval '10 days');

  with trabajo as (
    insert into services (lubricentro_id, sucursal_id, vehiculo_id, usuario_id, fecha, kilometros, tipo, alineacion, created_at) values
      ('${LUB}', '${SUCURSAL}', '${V.gomeria}',  '${OWNER}', current_date - 400, 60000, 'neumaticos', true,  now() - interval '400 days'),
      ('${LUB}', '${SUCURSAL}', '${V.rotacion}', '${OWNER}', current_date - 170, 20000, 'neumaticos', false, now() - interval '170 days')
    returning id, vehiculo_id
  )
  insert into service_ruedas (service_id, lubricentro_id, posicion, posicion_anterior, colocada, rotada, dot, profundidad_mm)
  select t.id, '${LUB}', r.posicion::posicion_rueda,
         case when t.vehiculo_id = '${V.rotacion}' then r.anterior::posicion_rueda end,
         t.vehiculo_id = '${V.gomeria}', t.vehiculo_id = '${V.rotacion}',
         case when t.vehiculo_id = '${V.gomeria}' then '1218' end,
         case when t.vehiculo_id = '${V.gomeria}' then 2.5 end
  from trabajo t
  cross join (values
    ('delantera_izquierda', 'trasera_izquierda'), ('delantera_derecha', 'trasera_derecha'),
    ('trasera_izquierda', 'delantera_izquierda'), ('trasera_derecha', 'delantera_derecha')
  ) as r(posicion, anterior);

  insert into trabajos_pendientes (lubricentro_id, vehiculo_id, usuario_id, descripcion, objetivo_fecha, objetivo_km, created_at) values
    ('${LUB}', '${V.pendienteFecha}', '${OWNER}', 'Cambiar la correa de distribución y la bomba de agua, y revisar los tensores', current_date + 3, null, now() - interval '30 days'),
    ('${LUB}', '${V.pendienteKm}',    '${OWNER}', 'Cambiar las pastillas de freno delanteras', null, 60200, now() - interval '9 days');

  insert into contactos (lubricentro_id, vehiculo_id, usuario_id, estado, canal, created_at) values
    ('${LUB}', '${V.contactado}',  '${OWNER}', 'vencido',    'whatsapp', now() - interval '10 days'),
    ('${LUB}', '${V.pendienteKm}', '${OWNER}', 'pendiente',  'whatsapp', now() - interval '2 days'),
    ('${LUB}', '${V.gomeria}',     '${OWNER}', 'neumaticos', 'whatsapp', now() - interval '2 days');

  -- El suprimido, con los sentinelas de anonimizar_cliente(): pierde la
  -- marca del nombre, por eso sus ids ya quedaron anotados.
  update clientes set nombre = 'Cliente eliminado'
  where id = (select cliente_id from vehiculos where id = '${V.suprimido}');`);

// ============================================================
// La medición — corre adentro de la página
// ============================================================

// Devuelve, por cada regla, la lista de lo que la rompe (vacía = bien).
// No sabe cuántas columnas ni qué plantilla usa la tabla: mira lo que se
// dibujó. Así sirve igual para la tarjeta de mobile, para la tabla y para
// lo que haya en el medio.
function medirEnPagina({ escritorio }) {
  const TOL = 0.5;
  const estilo = (el) => getComputedStyle(el);
  const rect = (b) => ({ left: b.left, right: b.right, top: b.top, bottom: b.bottom });
  const conArea = (b) => Boolean(b) && b.right - b.left > 0 && b.bottom - b.top > 0;
  const unir = (a, b) =>
    !a ? b : !b ? a : { left: Math.min(a.left, b.left), right: Math.max(a.right, b.right), top: Math.min(a.top, b.top), bottom: Math.max(a.bottom, b.bottom) };
  const cruzar = (a, b) => ({ left: Math.max(a.left, b.left), right: Math.min(a.right, b.right), top: Math.max(a.top, b.top), bottom: Math.min(a.bottom, b.bottom) });
  const px = (n) => Math.round(n * 10) / 10;
  const oculto = (el) => {
    const s = estilo(el);
    return s.display === "none" || s.visibility === "hidden";
  };

  // La caja de un elemento. `display: contents` no tiene caja propia: vale
  // la unión de las de sus hijos.
  function caja(el) {
    if (oculto(el)) return null;
    if (estilo(el).display === "contents") {
      let u = null;
      for (const h of el.children) u = unir(u, caja(h));
      return u;
    }
    const b = rect(el.getBoundingClientRect());
    return conArea(b) ? b : null;
  }

  // Dónde arranca una celda: su caja o, si es `display: contents`, la de
  // su primer hijo con caja (el control; un mensaje viene después y va a
  // su propio renglón).
  function inicio(el) {
    if (oculto(el)) return null;
    if (estilo(el).display !== "contents") return caja(el);
    for (const h of el.children) {
      const b = inicio(h);
      if (b) return b;
    }
    return null;
  }

  // Lo que se VE de una celda, pieza por pieza: cada renglón de texto y
  // cada control o caja con borde o fondo, recortados por lo que los
  // recorta (un `truncate` no desborda: corta). Piezas y no una sola caja,
  // para que un mensaje debajo del botón no cuente como si tapara la fila.
  function piezas(celda) {
    const lista = [];
    const sumar = (b, nodo, que, texto) => {
      let r = b;
      for (let el = nodo.parentElement; el; el = el.parentElement) {
        if (estilo(el).overflowX !== "visible") r = cruzar(r, rect(el.getBoundingClientRect()));
        if (el === celda) break;
      }
      if (conArea(r)) lista.push({ ...r, que, texto });
    };
    const camino = document.createTreeWalker(celda, NodeFilter.SHOW_ELEMENT | NodeFilter.SHOW_TEXT, {
      acceptNode: (n) => (n.nodeType === 1 && oculto(n) ? NodeFilter.FILTER_REJECT : NodeFilter.FILTER_ACCEPT),
    });
    for (let n = camino.nextNode(); n; n = camino.nextNode()) {
      if (n.nodeType === 3) {
        if (!n.textContent.trim()) continue;
        const rango = document.createRange();
        rango.selectNodeContents(n);
        for (const b of rango.getClientRects()) sumar(rect(b), n, n.textContent.trim().slice(0, 24), true);
        continue;
      }
      const s = estilo(n);
      if (s.display === "contents") continue;
      const control = ["INPUT", "BUTTON", "A", "svg", "IMG", "LABEL"].includes(n.tagName);
      const conBorde = parseFloat(s.borderTopWidth) > 0 || parseFloat(s.borderLeftWidth) > 0;
      const conFondo = s.backgroundColor !== "rgba(0, 0, 0, 0)" && s.backgroundColor !== "transparent";
      if (control || conBorde || conFondo) sumar(rect(n.getBoundingClientRect()), n, n.tagName.toLowerCase(), false);
    }
    return lista;
  }
  const conTexto = (celda) => piezas(celda).some((p) => p.texto);

  const lista = document.querySelector("main ul");
  if (!lista) return { sinLista: true };
  const tarjeta = lista.closest(".surface-card") ?? lista.parentElement;
  const borde = rect(tarjeta.getBoundingClientRect());
  const encabezado = [...tarjeta.children].find((el) => el !== lista && !el.contains(lista) && !oculto(el)) ?? null;
  const titulos = encabezado ? [...encabezado.children] : [];
  const tituloVisible = (i) => Boolean(titulos[i]) && Boolean(caja(titulos[i])) && Boolean(titulos[i].textContent.trim());
  const items = [...lista.querySelectorAll(":scope > li")];
  const nombre = (li) => li.querySelector(".plate")?.textContent.trim() ?? "?";

  const fuera = [];      // A · lo que se sale de la tarjeta
  const columnas = [];   // B · filas cuya grilla no es la del encabezado
  const corridos = [];   // B · títulos que no están sobre su columna
  const perdidas = [];   // C · celdas de dato que no se ven, o sin título ni texto
  const desorden = [];   // D · celdas fuera del orden de lectura
  const pisadas = [];    // E · piezas de una celda sobre las de otra
  const chicos = [];     // F · controles de menos de 44 px

  const seSale = (p) => Math.max(p.right - borde.right, borde.left - p.left);
  const mismaLinea = (a, b) => Math.min(a.bottom, b.bottom) - Math.max(a.top, b.top) > 1;
  const seTocan = (a, b) =>
    Math.min(a.right, b.right) - Math.max(a.left, b.left) > TOL && Math.min(a.bottom, b.bottom) - Math.max(a.top, b.top) > TOL;
  // Dónde ancla una caja a su columna: un título centrado se compara por
  // el centro; uno pegado al final, por la derecha; el resto, por la izquierda.
  const ancla = (b, como) => (como === "center" ? (b.left + b.right) / 2 : como === "end" ? b.right : b.left);
  const alineacion = (el) => {
    const j = estilo(el).justifySelf;
    return j.includes("center") ? "center" : j.includes("end") || j.includes("right") ? "end" : "start";
  };
  const contenido = (el) => {
    const s = estilo(el);
    return el.getBoundingClientRect().left + parseFloat(s.borderLeftWidth) + parseFloat(s.paddingLeft);
  };

  if (encabezado) {
    for (const t of titulos) {
      for (const p of piezas(t)) {
        if (seSale(p) > TOL) fuera.push({ donde: `encabezado «${t.textContent.trim()}»`, px: px(seSale(p)) });
      }
    }
    // Los títulos entre sí.
    const cajas = titulos.map((t) => piezas(t));
    for (let i = 0; i < cajas.length; i++) {
      for (let j = i + 1; j < cajas.length; j++) {
        if (cajas[i].some((a) => cajas[j].some((b) => seTocan(a, b)))) {
          pisadas.push({ donde: "encabezado", que: `«${titulos[i].textContent.trim()}» sobre «${titulos[j].textContent.trim()}»` });
        }
      }
    }
  }

  for (const li of items) {
    const celdas = [...li.children];
    const partes = celdas.map((c) => piezas(c));
    const cajas = celdas.map((c) => inicio(c));
    const quien = nombre(li);

    partes.forEach((ps, i) => {
      const peor = Math.max(0, ...ps.map(seSale));
      if (peor > TOL) fuera.push({ donde: `${quien} · celda ${i + 1}`, px: px(peor) });
    });

    if (encabezado && estilo(encabezado).display === "grid") {
      const a = estilo(encabezado);
      const b = estilo(li);
      if (
        b.display !== "grid" ||
        a.gridTemplateColumns !== b.gridTemplateColumns ||
        a.columnGap !== b.columnGap ||
        Math.abs(contenido(encabezado) - contenido(li)) > TOL
      ) {
        columnas.push({ donde: quien, fila: b.display === "grid" ? b.gridTemplateColumns : b.display, encabezado: a.gridTemplateColumns });
      }
      titulos.forEach((t, i) => {
        if (!tituloVisible(i) || !cajas[i]) return;
        const como = alineacion(t);
        const corrido = ancla(caja(t), como) - ancla(cajas[i], como);
        if (Math.abs(corrido) > 1) corridos.push({ donde: quien, titulo: t.textContent.trim(), px: px(corrido) });
      });
    }

    if (escritorio) {
      // Las siete de dato; la octava es la acción y puede no tener nada.
      for (let i = 0; i < 7; i++) {
        if (!celdas[i] || !cajas[i] || partes[i].length === 0) perdidas.push({ donde: quien, que: `la celda ${i + 1} no se ve` });
        else if (!tituloVisible(i) && !conTexto(celdas[i])) perdidas.push({ donde: quien, que: `la celda ${i + 1} no tiene título ni se lee sola` });
      }
    }

    // El orden: cada celda, después de la anterior — a su derecha en el
    // mismo renglón, o más abajo.
    const visibles = cajas.map((c, i) => ({ c, i })).filter((x) => x.c);
    for (let k = 1; k < visibles.length; k++) {
      const a = visibles[k - 1];
      const b = visibles[k];
      const antes = mismaLinea(a.c, b.c) ? b.c.left < a.c.left - TOL : b.c.bottom <= a.c.top + 1;
      if (antes) desorden.push({ donde: quien, que: `la celda ${b.i + 1} se lee antes que la ${a.i + 1}` });
    }

    for (let i = 0; i < partes.length; i++) {
      for (let j = i + 1; j < partes.length; j++) {
        const choque = partes[i].find((a) => partes[j].some((b) => seTocan(a, b)));
        if (choque) pisadas.push({ donde: quien, que: `la celda ${i + 1} («${choque.que}») sobre la ${j + 1}` });
      }
    }

    for (const control of li.querySelectorAll("label:has(input[type=checkbox]), a[href^='https://wa.me/'], button, a[href*='editar=telefono']")) {
      const b = caja(control);
      if (!b) continue;
      const ancho = b.right - b.left;
      const alto = b.bottom - b.top;
      // El check es un renglón de 44 de alto; la acción, 44 × 44.
      const minimoAncho = control.tagName === "LABEL" ? 0 : 44;
      if (alto < 44 - TOL || ancho < minimoAncho - TOL) {
        chicos.push({ donde: quien, que: `${control.tagName.toLowerCase()} de ${px(ancho)} × ${px(alto)}` });
      }
    }
  }

  const raiz = document.documentElement;
  return {
    filas: items.length,
    conEncabezado: Boolean(encabezado),
    titulos: titulos.map((t, i) => (tituloVisible(i) ? t.textContent.trim() : null)).filter(Boolean),
    scroll: raiz.scrollWidth - raiz.clientWidth,
    fuera,
    columnas,
    corridos,
    perdidas,
    desorden,
    pisadas,
    chicos,
  };
}

// ============================================================
// La pantalla
// ============================================================

const navegador = await chromium.launch({ args: ["--lang=es-AR"] });
if (DIR_CAPTURAS) fs.mkdirSync(DIR_CAPTURAS, { recursive: true });

// «3 de 21: ZZ 911 ZG · celda 8 (345 px); …» — lo justo para encontrarlo.
const resumir = (lista, decir, total) =>
  `${lista.length}${total ? ` en ${total} filas` : ""}: ${lista.slice(0, 3).map(decir).join("; ")}${lista.length > 3 ? "; …" : ""}`;

// Las comprobaciones de una medición. `que` dice de qué pasada son.
function comprobar(m, que, { escritorio, conScroll = true }) {
  if (m.sinLista) {
    check(`${que} · la lista está en pantalla`, false, "no hay ninguna fila: ¿se restauraron los datos a mitad de la corrida?");
    return;
  }
  const peor = [...m.fuera].sort((a, b) => b.px - a.px);
  check(`${que} · A · nada se sale de su tarjeta (${m.filas} filas)`, m.fuera.length === 0,
    resumir(peor, (f) => `${f.donde} (${f.px} px)`));
  if (conScroll) {
    check(`${que} · A · la página no gana scroll horizontal`, m.scroll <= 0, `${m.scroll} px de más`);
  }
  if (escritorio) {
    check(`${que} · B · el encabezado y las filas son la misma grilla`, m.conEncabezado && m.columnas.length === 0,
      m.conEncabezado
        ? resumir(m.columnas, (c) => `${c.donde}: ${c.fila} contra ${c.encabezado}`)
        : "la tabla no tiene encabezado");
    check(`${que} · B · cada título está sobre su columna`, m.corridos.length === 0,
      resumir([...m.corridos].sort((a, b) => Math.abs(b.px) - Math.abs(a.px)), (c) => `«${c.titulo}» a ${c.px} px de ${c.donde}`));
    check(`${que} · C · ninguna columna perdida`, m.perdidas.length === 0, resumir(m.perdidas, (p) => `${p.donde}: ${p.que}`));
  }
  check(`${que} · D · el orden de lectura`, m.desorden.length === 0, resumir(m.desorden, (p) => `${p.donde}: ${p.que}`));
  check(`${que} · E · ninguna celda pisa a otra`, m.pisadas.length === 0, resumir(m.pisadas, (p) => `${p.donde}: ${p.que}`));
  check(`${que} · F · el check y la acción miden 44 px o más`, m.chicos.length === 0, resumir(m.chicos, (p) => `${p.donde}: ${p.que}`));
}

try {
  let sesion;
  {
    const ctx = await navegador.newContext();
    const p = await ctx.newPage();
    await p.goto(`${BASE}/login`, { waitUntil: "networkidle", timeout: 60_000 });
    await p.fill('input[name="email"]', "demo@fidellimotors.app");
    await p.fill('input[name="password"]', "demo1234");
    await p.click('button[type="submit"]');
    await p.waitForURL("**/panel**", { timeout: 60_000 });
    sesion = await ctx.storageState();
    await ctx.close();
  }

  async function abrir(v) {
    const tactil = v.width < 768;
    const ctx = await navegador.newContext({
      viewport: v,
      deviceScaleFactor: tactil ? 2 : 1,
      locale: "es-AR",
      hasTouch: tactil,
      isMobile: tactil,
      storageState: sesion,
    });
    const page = await ctx.newPage();
    // Holgado: `next dev` compila la ruta en el primer pedido.
    page.setDefaultTimeout(15_000);
    page.setDefaultNavigationTimeout(60_000);
    return { ctx, page };
  }

  async function ir(page, fuente) {
    const url = `${BASE}/panel/proximos${fuente ? `?fuente=${fuente}` : ""}`;
    // Un segundo intento: con la máquina cargada, `next dev` a veces tarda
    // más de un minuto en contestar, y eso no es una falla de la pantalla.
    await page.goto(url, { waitUntil: "networkidle", timeout: 60_000 }).catch(() =>
      page.goto(url, { waitUntil: "networkidle", timeout: 60_000 }),
    );
    await page.evaluate(() => document.fonts.ready);
    // El cartel de `next dev` no es de la pantalla.
    await page.addStyleTag({ content: "nextjs-portal { display: none !important; }" });
  }
  const medir = (page, escritorio) => page.evaluate(medirEnPagina, { escritorio });
  // La barra de Windows: el contenido pierde su ancho y la media query no.
  const conBarra = (page) => page.addStyleTag({ content: `html { padding-right: ${BARRA}px !important; }` });
  const fila = (page, patente) => page.locator("main ul > li", { has: page.locator(".plate", { hasText: patente }) });

  // La tabla se captura entera: la ventana se estira al alto de la página
  // (con `fullPage` el menú, que es fijo, queda cortado a media captura).
  async function capturar(page, nombre, entera = true) {
    if (!DIR_CAPTURAS) return;
    const ventana = page.viewportSize();
    if (entera) {
      const alto = await page.evaluate(() => document.documentElement.scrollHeight);
      await page.setViewportSize({ width: ventana.width, height: alto });
    }
    await page.evaluate(() => window.scrollTo(0, 0));
    await page.waitForTimeout(200);
    await page.screenshot({ path: path.join(DIR_CAPTURAS, `${PREFIJO}${nombre}.png`) });
    if (entera) await page.setViewportSize(ventana);
    console.log(`  ◦ captura ${PREFIJO}${nombre}.png`);
  }

  // Las fuentes las dice la pantalla: las del filtro, más «Todo». Las tres
  // de siempre tienen que estar — si falta una, los datos de prueba no
  // están donde la prueba cree.
  let fuentes = [];
  {
    const { ctx, page } = await abrir({ width: 1280, height: 800 });
    await ir(page);
    fuentes = [
      ...new Set(
        (await page.locator('main a[href*="fuente="]').evaluateAll((as) => as.map((a) => new URL(a.href).searchParams.get("fuente")))).filter(Boolean),
      ),
    ];
    await ctx.close();
  }
  titulo("Las fuentes");
  check(`el filtro ofrece services, pendientes y neumáticos (${fuentes.join(", ") || "ninguna"})`,
    ["services", "pendientes", "neumaticos"].every((f) => fuentes.includes(f)));
  const FUENTES = [null, ...fuentes];
  const decir = (fuente) => fuente ?? "todo";

  // ---------- A a F · Cada ancho, con cada fuente ----------
  for (const v of VISTAS.filter((x) => !SOLO || SOLO.includes(x.width))) {
    const escritorio = v.width >= ESCRITORIO;
    titulo(`${v.width} × ${v.height}${escritorio ? "" : " · cada fila es una tarjeta"}`);
    const { ctx, page } = await abrir(v);
    for (const fuente of FUENTES) {
      await paso(`${decir(fuente)} · ${v.width}`, async () => {
        await ir(page, fuente);
        const m = await medir(page, escritorio);
        if (!fuente && !m.sinLista) {
          const deprueba = await page.locator("main ul > li .plate", { hasText: /^ZZ 91\d ZG$/ }).allTextContents();
          check("todo · están las nueve filas de prueba, de las tres fuentes", deprueba.length === 9,
            `hay ${deprueba.length}: ${deprueba.map((t) => t.trim()).sort().join(", ")}`);
        }
        comprobar(m, decir(fuente), { escritorio });
        if (!fuente || v.width === 1280) await capturar(page, `${decir(fuente)}-${v.width}`, escritorio);
        if (escritorio) {
          await conBarra(page);
          comprobar(await medir(page, escritorio), `${decir(fuente)} · con la barra de ${BARRA} px`, { escritorio, conScroll: false });
        }
      });
    }
    await ctx.close();
  }

  // ---------- M · Con el motivo abierto ----------
  titulo("M · El motivo del WhatsApp apagado, a la vista");
  for (const v of [390, 1024, 1280, 1440].map(vista)) {
    const escritorio = v.width >= ESCRITORIO;
    const { ctx, page } = await abrir(v);
    await paso(`el motivo · ${v.width}`, async () => {
      await ir(page);
      const apagado = fila(page, AUTOS.contactado.patente).locator('button[aria-disabled="true"]');
      // Playwright espera a que un `aria-disabled` se habilite: se lo fuerza.
      await apagado.click({ force: true });
      const motivo = fila(page, AUTOS.contactado.patente).getByRole("status");
      check(`${v.width} · tocar el WhatsApp apagado dice por qué`,
        (await motivo.count()) === 1 && /Ya contactaste/.test(await motivo.textContent()));
      comprobar(await medir(page, escritorio), `${v.width} · con el motivo`, { escritorio });
      if (v.width === 1280) await capturar(page, "motivo-1280", false);
      if (escritorio) {
        await conBarra(page);
        comprobar(await medir(page, escritorio), `${v.width} · con el motivo y la barra`, { escritorio, conScroll: false });
      }
    });
    await ctx.close();
  }

  // ---------- R · Las roturas ----------
  // Cada una rompe con CSS lo que una comprobación dice cubrir, y esa
  // comprobación tiene que acusarla. Una rotura que pasa en verde es una
  // prueba que no mira lo que dice mirar.
  titulo("R · Las roturas (cada una tiene que hacer fallar a su comprobación)");
  const VIEJA = "minmax(9rem,1fr) 7.5rem 11rem 6rem 9.5rem 6.5rem 5rem auto";
  // La tabla de antes, entera: el encabezado y cada fila con la plantilla
  // vieja, las ocho celdas a la vista y en fila, cada una en su lugar.
  const tabla = (regla) =>
    `main .surface-card > div, main ul > li { ${regla} }` +
    " main .surface-card > div > *, main ul > li > * { grid-area: auto !important; display: block !important; }";
  const ROTURAS = [
    {
      nombre: "la plantilla vieja a 1280: la fila se sale de la tarjeta",
      vista: vista(1280),
      css: tabla(`display: grid !important; grid-template-columns: ${VIEJA} !important; column-gap: 1rem !important;`),
      acusa: (m) => m.fuera.length > 0 && m.scroll > 0,
    },
    {
      nombre: "la plantilla vieja a 1440: la última columna `auto` corre el encabezado",
      vista: vista(1440),
      css: tabla(`display: grid !important; grid-template-columns: ${VIEJA} !important; column-gap: 1rem !important;`),
      acusa: (m) => m.columnas.length > 0 && m.corridos.length > 0,
    },
    {
      nombre: "una columna escondida",
      vista: vista(1280),
      css: "main ul > li > :nth-child(3) { display: none !important; }",
      acusa: (m) => m.perdidas.length > 0,
    },
    {
      nombre: "el retorno estimado antes que el cliente",
      vista: vista(1280),
      css: "main ul > li > :nth-child(5) { order: -1 !important; }",
      acusa: (m) => m.desorden.length > 0,
    },
    {
      nombre: "una celda corrida sobre la de al lado",
      vista: vista(1280),
      css: "main ul > li > :nth-child(4) { position: relative; left: -5rem; }",
      acusa: (m) => m.pisadas.length > 0,
    },
    {
      nombre: "el botón de WhatsApp achicado",
      vista: vista(1280),
      css: "main ul > li a[href^='https://wa.me/'] { min-width: 0 !important; min-height: 0 !important; padding: 0 !important; }",
      acusa: (m) => m.chicos.length > 0,
    },
  ];
  for (const rotura of ROTURAS) {
    const { ctx, page } = await abrir(rotura.vista);
    await paso(`rotura · ${rotura.nombre}`, async () => {
      await ir(page);
      const sana = await medir(page, true);
      await page.addStyleTag({ content: rotura.css });
      const rota = await medir(page, true);
      check(`${rotura.nombre}`, !rotura.acusa(sana) && rotura.acusa(rota),
        rotura.acusa(sana) ? "ya fallaba antes de romper nada" : "SE ESCAPÓ: la comprobación no la vio");
    });
    await ctx.close();
  }
} catch (e) {
  check("la prueba corrió hasta el final", false, String(e.message ?? e).split("\n")[0]);
} finally {
  await navegador.close().catch(() => {});
  restaurar();
}

console.log(fallas === 0 ? "\nTODO VERDE" : `\n${fallas} FALLA(S)`);
process.exit(fallas === 0 ? 0 : 1);

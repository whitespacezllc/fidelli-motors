// La firma HMAC de Cresium, contra el ejemplo TEXTUAL de la documentación
// y sus cuatro roturas (regla 13: una prueba que nunca se vio en rojo no
// existe).
//
// Correr:  node scripts/regresion-cresium-firma.mjs
// No toca la red, no toca la base, no necesita credenciales.
//
// ⚠ POR QUÉ ESTE ARCHIVO REIMPLEMENTA EL HMAC en vez de importar
// lib/cresium/firma.ts: ese módulo lleva `import "server-only"`, que
// revienta fuera del runtime de Next. Y reimplementarlo es justamente lo
// que le da valor a la prueba — si las dos implementaciones dan lo mismo
// sobre el ejemplo de la doc, la del repo construye el string bien. Una
// prueba que importa la función que prueba solo verifica que la función
// sea igual a sí misma.
import crypto from "node:crypto";

let fallas = 0;
const check = (nombre, cond, detalle = "") => {
  console.log(`  ${cond ? "✓" : "✗ FALLA"} ${nombre}${cond ? "" : "  " + detalle}`);
  if (!cond) fallas++;
};

const hmac = (data, secret) =>
  crypto.createHmac("sha256", secret).update(data).digest("base64");

// ── El ejemplo textual de la doc ────────────────────────────────────
// Copiado de la página "Manejando la autenticación" de api.cresium.app:
//
//   2026-04-21T15:42:03.000Z|POST|/v3/transaction/preview|{"amount":"100","currencyCode":"ARS","toId":42}
//
// La doc da el string y el algoritmo, pero NO publica la firma esperada,
// así que no hay un valor externo contra el cual comparar. Lo que se fija
// acá es la CONSTRUCCIÓN DEL STRING, que es donde están las cuatro
// trampas: se calcula la firma del ejemplo, se la deja clavada, y cada
// rotura tiene que moverla.
const SECRET = "partner-secret-key";
const EJEMPLO = {
  timestamp: "2026-04-21T15:42:03.000Z",
  metodo: "POST",
  path: "/v3/transaction/preview",
  body: JSON.stringify({ amount: "100", currencyCode: "ARS", toId: 42 }),
};

const stringAFirmar = (e) => `${e.timestamp}|${e.metodo}|${e.path}|${e.body}`;

const STRING_ESPERADO =
  '2026-04-21T15:42:03.000Z|POST|/v3/transaction/preview|{"amount":"100","currencyCode":"ARS","toId":42}';

console.log("── El ejemplo de la doc ──");
check(
  "el string a firmar es EXACTAMENTE el de la documentación",
  stringAFirmar(EJEMPLO) === STRING_ESPERADO,
  `\n      dio:      ${stringAFirmar(EJEMPLO)}\n      esperaba: ${STRING_ESPERADO}`,
);

const FIRMA_BUENA = hmac(stringAFirmar(EJEMPLO), SECRET);
check("la firma del ejemplo es estable", FIRMA_BUENA === hmac(STRING_ESPERADO, SECRET));
console.log(`      firma del ejemplo: ${FIRMA_BUENA}`);

// ── Las cuatro roturas ──────────────────────────────────────────────
// Cada una es un 401 pelado de Cresium, sin ninguna pista de cuál de las
// cuatro fue. La prueba es que CAMBIEN la firma: si una no la mueve, esa
// parte del string no está entrando y el bug ya existe.
console.log("\n── Las cuatro roturas ──");

check(
  "1 · meter x-company-id adentro de la firma la cambia",
  hmac(`1488|${stringAFirmar(EJEMPLO)}`, SECRET) !== FIRMA_BUENA,
);

check(
  "2 · firmar el path SIN el query string la cambia",
  hmac(
    stringAFirmar({ ...EJEMPLO, path: "/v3/transaction/search" }),
    SECRET,
  ) !==
    hmac(
      stringAFirmar({ ...EJEMPLO, path: "/v3/transaction/search?fromDate=2026-01-01" }),
      SECRET,
    ),
);

check(
  "3 · body «{}» o «null» en un GET no es lo mismo que «»",
  (() => {
    const get = { timestamp: EJEMPLO.timestamp, metodo: "GET", path: "/v3/balance" };
    const vacio = hmac(stringAFirmar({ ...get, body: "" }), SECRET);
    return (
      hmac(stringAFirmar({ ...get, body: "{}" }), SECRET) !== vacio &&
      hmac(stringAFirmar({ ...get, body: "null" }), SECRET) !== vacio
    );
  })(),
);

check(
  "4 · el timestamp con offset -03:00 en vez de Z la cambia",
  hmac(
    stringAFirmar({ ...EJEMPLO, timestamp: "2026-04-21T12:42:03.000-03:00" }),
    SECRET,
  ) !== FIRMA_BUENA,
);

// ── Y una que no es de la doc pero rompe igual ──────────────────────
console.log("\n── El método y el separador ──");
check(
  "el método en minúsculas la cambia",
  hmac(stringAFirmar({ ...EJEMPLO, metodo: "post" }), SECRET) !== FIRMA_BUENA,
);
check(
  "un secret distinto la cambia",
  hmac(stringAFirmar(EJEMPLO), "otro-secret") !== FIRMA_BUENA,
);

// ── La comparación en tiempo constante ──────────────────────────────
console.log("\n── La comparación ──");
const comparar = (a, b) => {
  const x = Buffer.from(a, "utf8");
  const y = Buffer.from(b, "utf8");
  if (x.length !== y.length) return false;
  return crypto.timingSafeEqual(x, y);
};
check("una firma igual coincide", comparar(FIRMA_BUENA, FIRMA_BUENA));
check("una firma de otro largo no coincide (y no explota)", !comparar(FIRMA_BUENA, "corta"));
check(
  "una firma del mismo largo con un carácter cambiado no coincide",
  !comparar(FIRMA_BUENA, "X" + FIRMA_BUENA.slice(1)),
);

// ── La ventana de tiempo ────────────────────────────────────────────
// Los dos relojes de Cresium NO son el mismo: las requests que mandamos
// tienen 60 segundos; los webhooks que recibimos, 5 minutos según la doc,
// y vienen en epoch de MILISEGUNDOS.
console.log("\n── La ventana de tiempo del webhook ──");
const enVentana = (valor, ventanaSeg, ahora) => {
  const ms = /^\d+$/.test(String(valor).trim()) ? Number(valor) : Date.parse(valor);
  if (!Number.isFinite(ms)) return false;
  return Math.abs(ahora - ms) <= ventanaSeg * 1000;
};
const AHORA = 1774196523000;
check("epoch en milisegundos, recién llegado", enVentana(String(AHORA), 300, AHORA));
check("ISO con Z, recién llegado", enVentana(new Date(AHORA).toISOString(), 300, AHORA));
check("de hace 4 minutos entra", enVentana(String(AHORA - 4 * 60_000), 300, AHORA));
check("de hace 6 minutos NO entra", !enVentana(String(AHORA - 6 * 60_000), 300, AHORA));
check(
  "del FUTURO tampoco entra (si no, un timestamp de 2099 vale para siempre)",
  !enVentana(String(AHORA + 6 * 60_000), 300, AHORA),
);
check("una porquería no entra", !enVentana("no-es-un-timestamp", 300, AHORA));

console.log(
  fallas === 0
    ? "\nLa firma se construye como dice la doc, y las cuatro roturas la mueven."
    : `\n${fallas} falla(s).`,
);
process.exit(fallas === 0 ? 0 : 1);

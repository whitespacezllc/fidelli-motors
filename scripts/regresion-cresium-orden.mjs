// La orden de pago contra el doble local, y el reintento de la referencia
// (regla 13: una prueba que nunca se vio en rojo no existe).
//
// Lo que cubre:
//   1 · El doble contesta EXACTAMENTE lo que contesta Cresium cuando el
//       externalId ya existe: 400 y EXISTING_EXTERNAL_ID, con el mensaje
//       textual. Medido en producción el 16/09/2026 (log de Vercel). El
//       doble decía 409 CONFLICT, y con eso el reintento de la acción
//       jamás se hubiera disparado en local mientras en producción sí
//       (regla 19: el doble copia la realidad, no lo que suena razonable).
//   2 · La referencia con sufijo de intento (`sub:hasta:2`) entra como
//       una orden nueva, con CVU nuevo.
//   3 · `conIntentos()` —el bucle que usa la acción— sube el número solo
//       ante ese error, corta ante cualquier otro y se rinde a las cinco.
//   4 · Los bordes de la vida de la orden: siete días, ni uno más.
//   5 · EL ALIAS FIJO (bloque B): que el alias de un tenant que lo tiene
//       asignado NO se recalcule entre períodos ni entre intentos, que uno
//       sin asignar siga por el camino por orden de siempre, y que la
//       sugerencia del formulario nunca supere el largo válido —ni con el
//       slug más largo que existe, ni con el más largo que la base permite.
//
// Correr:  node --no-warnings scripts/regresion-cresium-orden.mjs
//
// Levanta su propio doble en el puerto 4017 y lo apaga al terminar. No
// toca la base ni la red; lee .env.local solo para firmar como firma el
// doble. Importa lib/cresium/orden.ts directo —Node 22 le quita los
// tipos— y el --no-warnings calla el aviso por el "type": "module" que
// no está en el package.json de Next.
import crypto from "node:crypto";
import fs from "node:fs";

process.env.PUERTO = "4017";
const { arrancar, parar } = await import("./doble-cresium.mjs");
const { aliasParaLaOrden, conIntentos, externalIdDelIntento, estadoEfectivo, ordenVencida, DIAS_DE_VIDA_DE_LA_ORDEN } =
  await import("../lib/cresium/orden.ts");
const { aliasSugerido, esAliasValido, ALIAS_LARGO_MAXIMO } =
  await import("../lib/cresium/alias.ts");

const env = Object.fromEntries(
  fs.readFileSync(new URL("../.env.local", import.meta.url), "utf8")
    .split("\n").filter((l) => l.includes("=")).map((l) => {
      const i = l.indexOf("="); return [l.slice(0, i), l.slice(i + 1).trim()];
    }));
const BASE = "http://localhost:4017";

let fallas = 0;
const check = (nombre, cond, detalle = "") => {
  console.log(`  ${cond ? "✓" : "✗ FALLA"} ${nombre}${cond ? "" : "  " + detalle}`);
  if (!cond) fallas++;
};

// Firmada como firma lib/cresium/cliente.ts: timestamp|MÉTODO|path|body,
// y el company-id afuera de la firma.
async function pedir(metodo, path, cuerpo) {
  const body = cuerpo === undefined ? "" : JSON.stringify(cuerpo);
  const ts = String(Date.now());
  const firma = crypto.createHmac("sha256", env.CRESIUM_SECRET ?? "")
    .update(`${ts}|${metodo}|${path}|${body}`).digest("base64");
  const r = await fetch(BASE + path, {
    method: metodo,
    body: body || undefined,
    headers: {
      "content-type": "application/json",
      "x-api-key": env.CRESIUM_API_KEY ?? "",
      "x-company-id": env.CRESIUM_COMPANY_ID ?? "",
      "x-timestamp": ts,
      "x-signature": firma,
    },
  });
  const texto = await r.text();
  let json = null;
  try { json = JSON.parse(texto); } catch { /* no era JSON */ }
  return { status: r.status, texto, json };
}

const orden = (externalId, alias) => ({
  alias,
  paymentOrder: { externalId, amount: 990, title: "regresión", expiresIn: "7d" },
});
const entro = (r, externalId) =>
  (r.status === 200 || r.status === 201) && r.json?.data?.paymentOrder?.externalId === externalId;

await arrancar();
try {
  const SUB = crypto.randomUUID();
  const REF = `${SUB}:2026-10-01`;

  console.log("\n1 · El rechazo de Cresium, byte por byte");
  const primera = await pedir("POST", "/v3/payment-order/", orden(REF, "fm.regresion.aaaaaa"));
  check("la primera orden entra", entro(primera, REF), primera.texto);
  const repetida = await pedir("POST", "/v3/payment-order/", orden(REF, "fm.regresion.bbbbbb"));
  check("la repetida vuelve con 400 (no 409)", repetida.status === 400, `status ${repetida.status}`);
  check("…con el código EXISTING_EXTERNAL_ID", repetida.json?.error === "EXISTING_EXTERNAL_ID", repetida.texto);
  check("…y el mensaje textual de producción",
        repetida.json?.message === "A payment order already exists for this externalId", repetida.texto);

  console.log("\n2 · La referencia del segundo intento es una orden nueva");
  const segunda = await pedir("POST", "/v3/payment-order/", orden(externalIdDelIntento(REF, 2), "fm.regresion.cccccc"));
  check("`sub:hasta:2` entra", entro(segunda, `${REF}:2`), segunda.texto);
  check("con un CVU distinto del de la primera",
        segunda.json?.data?.depositAddress?.value &&
        segunda.json.data.depositAddress.value !== primera.json?.data?.depositAddress?.value);

  console.log("\n3 · conIntentos(): el bucle de la acción");
  const yaExiste = (e) => e instanceof Error && e.message.includes("EXISTING_EXTERNAL_ID");

  // Contra el doble de verdad: la pelada y la :2 ya existen → sale como :3.
  const crearReal = async (externalId, intento) => {
    const alias = `fm.regresion.${intento}${crypto.randomBytes(2).toString("hex")}`;
    const r = await pedir("POST", "/v3/payment-order/", orden(externalId, alias));
    if (r.status >= 300) throw new Error(`Cresium respondió ${r.status}: ${r.texto}`);
    return r.json.data;
  };
  const real = await conIntentos(REF, 1, crearReal, yaExiste);
  check("contra el doble, con dos referencias tomadas, sale como :3",
        real.ok && real.externalId === `${REF}:3` && real.intento === 3, JSON.stringify(real));

  // Con un `crear` de mentira, los bordes.
  const llamadas = [];
  const falso = (rechazos, otroError = null) => async (externalId, intento) => {
    llamadas.push(externalId);
    if (otroError && intento === 1) throw new Error(otroError);
    if (intento <= rechazos) throw new Error("400 EXISTING_EXTERNAL_ID");
    return { intento };
  };
  const B = "x:2026-01-01";

  llamadas.length = 0;
  const limpio = await conIntentos(B, 1, falso(0), yaExiste);
  check("sin rechazo, la referencia es la pelada y hay UNA llamada",
        limpio.ok && limpio.externalId === B && llamadas.length === 1);

  llamadas.length = 0;
  const desde3 = await conIntentos(B, 3, falso(0), yaExiste);
  check("arrancando en 3 (dos filas locales), la referencia es :3",
        desde3.ok && desde3.externalId === `${B}:3` && llamadas[0] === `${B}:3`);

  llamadas.length = 0;
  const cuatro = await conIntentos(B, 1, falso(4), yaExiste);
  check("cuatro rechazos → sale en el quinto", cuatro.ok && cuatro.externalId === `${B}:5` && llamadas.length === 5);

  llamadas.length = 0;
  const cinco = await conIntentos(B, 1, falso(5), yaExiste);
  check("cinco rechazos → se rinde con el último error, sin una sexta llamada",
        !cinco.ok && cinco.intento === 5 && llamadas.length === 5 && String(cinco.error?.message).includes("EXISTING"));

  llamadas.length = 0;
  const otro = await conIntentos(B, 1, falso(0, "401 Invalid signature"), yaExiste);
  check("otro error corta a la primera, sin reintentar",
        !otro.ok && llamadas.length === 1 && String(otro.error?.message).includes("signature"));

  console.log("\n4 · La vida de la orden");
  const creada = "2026-09-01T12:00:00Z";
  const dia = 86_400_000;
  const t = (ms) => new Date(Date.parse(creada) + ms);
  check("vive 7 días, los mismos que se le piden a Cresium", DIAS_DE_VIDA_DE_LA_ORDEN === 7);
  check("un segundo antes de los 7 días sigue viva", !ordenVencida(creada, t(7 * dia - 1000)));
  check("a los 7 días exactos venció", ordenVencida(creada, t(7 * dia)));
  check("NOT_PAID vieja → EXPIRED", estadoEfectivo("NOT_PAID", creada, t(10 * dia)) === "EXPIRED");
  check("PARTIAL vieja → EXPIRED", estadoEfectivo("PARTIAL", creada, t(10 * dia)) === "EXPIRED");
  check("NOT_PAID fresca sigue NOT_PAID", estadoEfectivo("NOT_PAID", creada, t(2 * dia)) === "NOT_PAID");
  check("PAID no vence nunca", estadoEfectivo("PAID", creada, t(400 * dia)) === "PAID");
  check("externalIdDelIntento(1) es la referencia pelada",
        externalIdDelIntento("a:b", 1) === "a:b" && externalIdDelIntento("a:b", 0) === "a:b");
  check("externalIdDelIntento(2) agrega :2", externalIdDelIntento("a:b", 2) === "a:b:2");
  // ════════════════════════════════════════════════════════════
  console.log("\n5 · El alias fijo por tenant");
  // ════════════════════════════════════════════════════════════
  //
  // `aliasDeOrden()` vive en lib/cresium/cliente.ts, que es `server-only` y
  // no se puede importar acá. Se reproduce su cuerpo tal cual —son dos
  // líneas— para poder contrastar los dos caminos en la misma corrida. Si
  // algún día cambia allá y no acá, este check lo dice.
  const derivado = (nombre, ext) =>
    `fm.${(nombre.replace(/[^a-z0-9]/gi, "").slice(0, 8).toLowerCase() || "taller")}.${
      crypto.createHash("sha256").update(ext).digest("hex").slice(0, 6)}`;

  const sub = "11111111-1111-1111-1111-111111111111";
  const octubre = externalIdDelIntento(`${sub}:2026-10-16`, 1);
  const noviembre = externalIdDelIntento(`${sub}:2026-11-16`, 1);
  const octubreIntento2 = externalIdDelIntento(`${sub}:2026-10-16`, 2);

  // --- El tenant CON alias: el alias no se mueve. Es el punto entero.
  const fijoOct = aliasParaLaOrden("fm.psm", () => derivado("PSM", octubre));
  const fijoNov = aliasParaLaOrden("fm.psm", () => derivado("PSM", noviembre));
  const fijoRe = aliasParaLaOrden("fm.psm", () => derivado("PSM", octubreIntento2));

  check("dos órdenes de PERÍODOS distintos dan el mismo alias",
        fijoOct.alias === fijoNov.alias, `${fijoOct.alias} vs ${fijoNov.alias}`);
  check("y el REINTENTO de la misma orden también",
        fijoOct.alias === fijoRe.alias, `${fijoOct.alias} vs ${fijoRe.alias}`);
  check("el alias fijo es el del tenant, sin tocarlo", fijoOct.alias === "fm.psm", fijoOct.alias);
  check("y se declara fijo", fijoOct.fijo === true);

  // --- El tenant SIN alias: nada cambia. Es el caso de los 17 de hoy.
  const sinOct = aliasParaLaOrden(null, () => derivado("PSM", octubre));
  const sinNov = aliasParaLaOrden(null, () => derivado("PSM", noviembre));
  check("sin alias asignado, el alias sale de la orden", sinOct.fijo === false);
  check("y CAMBIA entre períodos, exactamente como hasta hoy",
        sinOct.alias !== sinNov.alias, `${sinOct.alias} / ${sinNov.alias}`);
  check("con la forma de siempre", /^fm\.[a-z0-9]{1,8}\.[0-9a-f]{6}$/.test(sinOct.alias), sinOct.alias);
  check("una cadena vacía NO cuenta como alias asignado",
        aliasParaLaOrden("", () => "derivado").fijo === false);
  check("ni una de solo espacios", aliasParaLaOrden("   ", () => "derivado").fijo === false);

  // --- La sugerencia del formulario, contra los slugs reales y el borde.
  //     El techo NO es 29 (`lubricentro-y-gomeria-el-colo`): slug_estado()
  //     acepta hasta 60, así que el caso peor es un slug de 60.
  const slugs = [
    "psm",
    "brothers-oil",
    "ferrari-mecanica",
    "pg-taller-lubricentro",
    "lubricentro-fassetta",
    "lubricentro-y-gomeria-el-colo",
    "a".repeat(60),
  ];
  for (const slug of slugs) {
    const propuesto = aliasSugerido(slug);
    check(`sugerencia de «${slug}» (${slug.length}) → «${propuesto}» (${propuesto.length})`,
          propuesto.length <= ALIAS_LARGO_MAXIMO && propuesto !== "" && esAliasValido(propuesto),
          `largo ${propuesto.length}, válido ${esAliasValido(propuesto)}`);
  }
  check("un slug vacío no sugiere nada", aliasSugerido("") === "");
  // El camino viejo BORRA los acentos («Gomería» → «Gomera»); la sugerencia
  // los translitera. Es la diferencia que no se puede descubrir después de
  // asignar: un alias es lo que alguien tipea en su home banking.
  check("el acento se translitera, no se come",
        aliasSugerido("gomeria-el-colo").includes("gomeria") &&
        aliasSugerido("gomería-el-colo") === aliasSugerido("gomeria-el-colo"),
        aliasSugerido("gomería-el-colo"));
} finally {
  parar();
}

console.log(fallas ? `\n✗ ${fallas} falla(s)` : "\n✓ todo en verde");
process.exit(fallas ? 1 : 0);

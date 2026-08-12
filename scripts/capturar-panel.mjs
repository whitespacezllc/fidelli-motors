// Capturas REALES del panel para la landing comercial.
//
// El design system prohíbe capturas de producto generadas: el panel está en
// producción y sacarlas de verdad cuesta diez minutos. Esto automatiza esos
// diez minutos para que la captura se pueda REGENERAR cuando el panel
// cambie, en vez de quedar congelada en una imagen que nadie sabe reproducir.
//
// Corre contra el entorno LOCAL, cuyo seed ya tiene patentes ficticias
// (ABC 123, AC 891 QR…): no expone datos de ningún cliente real.
//
// Uso:
//   npm run dev            (en otra terminal)
//   node scripts/capturar-panel.mjs
import { chromium } from "playwright";
import { mkdir, unlink } from "node:fs/promises";
import sharp from "sharp";

const BASE = process.env.BASE_URL ?? "http://localhost:3000";
const SALIDA = "public/assets";

// Cada captura vive con el nombre de archivo FINAL que va a tener, para que
// reemplazarla no toque código.
const CAPTURAS = [
  {
    archivo: "panel-proximos-services",
    ruta: "/panel/proximos",
    // La lista de próximos es un <ul> de filas, no una <table>.
    esperar: "main ul li",
    // ALTA a propósito: en el hero la imagen tiene que ser más alta que el
    // espacio que le queda, porque de eso vive el recorte contra el borde
    // inferior. Con una captura apaisada (ratio ~1.6) entraba completa y
    // dejaba un hueco debajo en vez de cortarse.
    alto: 1240,
  },
];

const navegador = await chromium.launch();
const contexto = await navegador.newContext({
  viewport: { width: 1440, height: 1400 },
  // Retina: la captura se sigue viendo nítida al escalarla en la landing.
  deviceScaleFactor: 2,
});
const pagina = await contexto.newPage();

await mkdir(SALIDA, { recursive: true });

// Sesión del lubricentro demo
await pagina.goto(`${BASE}/login`, { waitUntil: "networkidle" });
await pagina.fill('input[name="email"]', "demo@fidellimotors.app");
await pagina.fill('input[name="password"]', "demo1234");
await pagina.click('button[type="submit"]');
await pagina.waitForURL("**/panel**", { timeout: 20_000 });

for (const c of CAPTURAS) {
  await pagina.goto(`${BASE}${c.ruta}`, { waitUntil: "networkidle" });
  await pagina.waitForSelector(c.esperar, { timeout: 15_000 });
  // Que asienten fuentes e imágenes antes de disparar.
  await pagina.waitForTimeout(700);

  const png = `${SALIDA}/${c.archivo}.png`;
  await pagina.screenshot({
    path: png,
    clip: { x: 0, y: 0, width: 1440, height: c.alto },
  });

  // A WebP, como el resto de los assets: la captura retina pesa 450KB en
  // PNG y 165 en WebP, y esta imagen va arriba del fold.
  const info = await sharp(png).webp({ quality: 82 }).toFile(`${SALIDA}/${c.archivo}.webp`);
  await unlink(png);

  console.log(`✓ ${c.archivo}.webp  ${Math.round(info.size / 1024)}KB  ←  ${c.ruta}`);
}

await navegador.close();

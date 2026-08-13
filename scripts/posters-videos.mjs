// El póster de cada video de la sección 04, sacado del video mismo.
//
// Por qué no se reusan las capturas del panel que ya están: el póster es lo
// que se ve ANTES de que el video arranque —y lo único que se ve con
// prefers-reduced-motion—. Si no es el primer frame exacto, al empezar la
// reproducción hay un salto. Sacándolo del propio archivo, el video parece
// una imagen que se pone en movimiento.
//
// Playwright y no ffmpeg: no hay ffmpeg en la máquina, y esto ya estaba
// instalado para las capturas del panel.
//
// Uso:
//   npm run dev            (en otra terminal)
//   node scripts/posters-videos.mjs
import { chromium } from "playwright";
import { readdir, mkdir, unlink } from "node:fs/promises";
import sharp from "sharp";

const BASE = process.env.BASE_URL ?? "http://localhost:3000";
const VIDEOS = "public/assets/videos";
const SALIDA = "public/assets/videos";

// 0.1s y no 0: el frame cero de una exportación suele venir en negro o a
// medio componer. A la décima el primer cuadro ya está entero.
const SEGUNDO = 0.1;

const navegador = await chromium.launch();
const contexto = await navegador.newContext({ deviceScaleFactor: 1 });
const pagina = await contexto.newPage();
await mkdir(SALIDA, { recursive: true });

const archivos = (await readdir(VIDEOS)).filter((f) => f.endsWith(".mp4"));

for (const archivo of archivos) {
  const nombre = archivo.replace(/\.mp4$/, "");

  await pagina.setContent(
    `<body style="margin:0;background:#fff">
       <video id="v" src="${BASE}/assets/videos/${archivo}" muted playsinline
              style="display:block;width:100%"></video>
     </body>`,
  );

  // El tamaño de la ventana se ajusta al video para que el screenshot salga
  // a resolución nativa, sin reescalar.
  const medidas = await pagina.evaluate(async (t) => {
    const v = document.getElementById("v");
    await new Promise((r) => {
      if (v.readyState >= 1) return r();
      v.onloadedmetadata = () => r();
    });
    await new Promise((r) => {
      v.onseeked = () => r();
      v.currentTime = t;
    });
    return { width: v.videoWidth, height: v.videoHeight };
  }, SEGUNDO);

  await pagina.setViewportSize(medidas);
  const png = `${SALIDA}/${nombre}.png`;
  await pagina.locator("#v").screenshot({ path: png });

  const info = await sharp(png).webp({ quality: 82 }).toFile(`${SALIDA}/${nombre}.webp`);
  await unlink(png);

  console.log(
    `✓ ${nombre}.webp  ${info.width}x${info.height}  ${Math.round(info.size / 1024)}KB`,
  );
}

await navegador.close();

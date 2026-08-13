// Capturas REALES de la superficie del cliente, para la sección 06.
//
// Hermano de capturar-panel.mjs y script aparte por dos razones, no por
// gusto: esto se mira SIN sesión —`/[slug]` es anónimo, esa es la gracia— y
// se mira en un celular, así que la ventana es un teléfono y no una
// notebook.
//
// Acá el rojo Motors no aparece: la superficie del cliente se pinta con el
// color del lubricentro.
//
// ESTAS NO SON CAPTURAS DE PANTALLA COMPLETA, SON MOMENTOS. Cada paso de la
// 06 muestra el gesto y nada más: el que escribe la patente ve un campo y
// un botón, no una página. Para eso cada captura apaga con CSS lo que no es
// el momento y recorta al rectángulo justo. Sigue siendo el producto real
// renderizándose —los mismos componentes que ve el cliente— con el resto
// del contexto fuera de cuadro.
//
// Las dos comparten ventana y proporción (4:3) para que en la landing se
// lean como una serie y no como tres piezas sueltas.
//
// Uso:
//   npm run dev            (en otra terminal)
//   node scripts/capturar-cliente.mjs
import { chromium } from "playwright";
import { mkdir, unlink } from "node:fs/promises";
import sharp from "sharp";

const BASE = process.env.BASE_URL ?? "http://localhost:3000";
const SALIDA = "public/assets";

// 380 de ancho: un celular de verdad, y el ancho que deja el cuerpo del
// cliente (18px) en la misma proporción del recorte en las dos capturas —
// que es lo que hace que se lean como serie.
const ANCHO = 380;
const PROPORCION = 3 / 4; // 4:3 apaisado

const CAPTURAS = [
  // 06 · paso 02 — "Escribe la patente". SOLO el campo y el botón: sin
  // logo, sin título y sin el texto de ayuda. El momento es escribir seis
  // caracteres.
  {
    archivo: "cliente-escribe-patente",
    ruta: "/demo",
    esperar: "input#patente",
    preparar: async (p) => {
      // Escrito a medias, como se ve en la mano: el campo en pleno uso.
      await p.fill("#patente", "ABC 12");
      // El foco se va para que no quede el cursor parpadeando ni el anillo
      // de foco, que en una imagen fija se leen como suciedad.
      await p.locator("#patente").blur();
      return p.evaluate(() => {
        const input = document.getElementById("patente");
        // Todo lo que no es el gesto: el título de arriba y la ayuda de
        // abajo. Se apagan, no se recortan, para que el botón suba y quede
        // pegado al campo como en el momento real de tocarlo.
        document.querySelector('label[for="patente"]')?.style.setProperty("display", "none");
        document.getElementById("patente-ayuda")?.style.setProperty("display", "none");
        input.style.marginTop = "0";

        // Y todo lo que rodea al formulario: la marca, la guía de tres
        // pasos y el pie. Sin esto, el recorte —más alto que el campo y el
        // botón— pescaba los renglones de al lado cortados por la mitad,
        // que es justo lo que un recorte no tiene que mostrar. Se sube por
        // la cadena de padres apagando hermanos: queda el formulario solo,
        // con aire limpio alrededor.
        let nodo = input.closest("form");
        while (nodo && nodo !== document.body) {
          [...(nodo.parentElement?.children ?? [])].forEach((el) => {
            if (el !== nodo) el.style.setProperty("display", "none");
          });
          nodo = nodo.parentElement;
        }

        const boton = input.form.querySelector("button[type='submit'], button:not([type])");
        const a = input.getBoundingClientRect();
        const b = boton.getBoundingClientRect();
        return { arriba: a.top + window.scrollY, abajo: b.bottom + window.scrollY };
      });
    },
  },

  // 06 · paso 03 — "Ve todo el historial". El logo del lubricentro arriba y
  // dos o tres cartones abajo: eso es todo el paso. El logo es el punto.
  {
    archivo: "cliente-ve-historial",
    ruta: "/demo/ABC123",
    esperar: "main",
    preparar: (p) =>
      p.evaluate(() => {
        const historial = [...document.querySelectorAll("main section")].find(
          (s) => s.querySelector("h2")?.textContent?.includes("Cartones anteriores"),
        );
        if (!historial) return null;

        const ocultar = (el) => el?.style.setProperty("display", "none");

        // De la cabecera queda SOLO la fila de la marca: el nombre del auto
        // y la patente son contexto de otra pantalla.
        const cabecera = document.querySelector("main header");
        [...(cabecera?.children ?? [])].forEach((el, i) => i > 0 && ocultar(el));

        // Entre la marca y el historial hay próximo service, cartón,
        // recomendaciones y fidelización: nada de eso es este paso.
        [...historial.parentElement.children].forEach(
          (el) => el !== historial && ocultar(el),
        );
        const grilla = historial.closest(".grid");
        [...(grilla?.children ?? [])].forEach(
          (el) => !el.contains(historial) && ocultar(el),
        );

        // La regla de las 24 horas y el sello "Registro fijado" le hablan
        // al dueño del auto sobre una garantía; en una tarjeta de la
        // landing son ruido que tapa la fecha y los kilómetros.
        ocultar(historial.querySelector("h2 + p"));
        historial.querySelectorAll("summary span span").forEach((s) => {
          if (s.textContent?.includes("Registro fijado")) ocultar(s);
        });

        const marca = cabecera?.getBoundingClientRect();
        return { arriba: (marca?.top ?? 0) + window.scrollY - 12, abajo: null };
      }),
  },
];

const navegador = await chromium.launch();
// Sin storageState: anónimo, como llega el dueño del auto.
const contexto = await navegador.newContext({
  viewport: { width: ANCHO, height: 900 },
  deviceScaleFactor: 2,
  isMobile: true,
  hasTouch: true,
});
const pagina = await contexto.newPage();

await mkdir(SALIDA, { recursive: true });

for (const c of CAPTURAS) {
  await pagina.goto(`${BASE}${c.ruta}`, { waitUntil: "networkidle" });
  await pagina.waitForSelector(c.esperar, { timeout: 15_000 });
  const region = await c.preparar(pagina);

  await pagina.addStyleTag({
    content: "nextjs-portal { display: none !important; }",
  });
  await pagina.waitForTimeout(500);

  const alto = Math.round(ANCHO * PROPORCION);
  // El recorte se centra en el momento cuando el momento es más chico que
  // el cuadro —el campo y el botón dejan aire arriba y abajo, y ese aire
  // es parte del mensaje: seis caracteres y nada más—. Si el contenido es
  // más alto que el cuadro, arranca donde empieza.
  const y = region?.abajo
    ? Math.max(0, Math.round((region.arriba + region.abajo) / 2 - alto / 2))
    : Math.max(0, Math.round(region?.arriba ?? 0));

  const png = `${SALIDA}/${c.archivo}.png`;
  await pagina.screenshot({
    path: png,
    clip: { x: 0, y, width: ANCHO, height: alto },
  });

  const info = await sharp(png).webp({ quality: 82 }).toFile(`${SALIDA}/${c.archivo}.webp`);
  await unlink(png);

  console.log(
    `✓ ${c.archivo}.webp  ${info.width}x${info.height}  ${Math.round(info.size / 1024)}KB  ←  ${c.ruta}`,
  );
}

await navegador.close();

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
//
// `preparar` corre después del goto y antes de esperar el selector: es para
// las pantallas a las que no se llega por URL —una ficha, un cartón, un
// dialog abierto—. Se navega por la interfaz, como lo haría el lubricentro.
//
// ALTO 900 en las cuatro de la sección 04: mismo recorte 16:10 para las
// cuatro filas. Que las imágenes compartan proporción es lo que hace que la
// alternancia se lea como un ritmo y no como cuatro capturas sueltas.
//
// Y la ventana se achica al mismo alto que el recorte, en vez de recortar
// una ventana alta: lo que se centra en la pantalla —un dialog— se centra
// en el alto del VIEWPORT, no en el del recorte. Con una ventana de 1400 y
// un recorte de 900, el editor de mensajes quedaba cortado justo por la
// mitad de la vista previa, que es lo único que esa fila tiene que mostrar.
// 1440 de ancho, y no menos: en la fila la captura se ve a media página, así
// que la tentación es angostar la ventana para que la letra del panel entre
// más grande. No se puede bajar de acá. El panel reserva 256px de sidebar y
// 64 de padding, y la tabla de próximos necesita 1120: a 1280 la columna
// CONTACTADO queda cortada contra el borde, que en una captura se lee como
// una imagen mal recortada.
const VISTA_FILA = { width: 1440, height: 900 };

const CAPTURAS = [
  // ---------- 02 · Hero — DOS capturas, no una recortada ----------
  //
  // La de escritorio y la de celular son fotos distintas del mismo panel,
  // no la misma imagen a dos tamaños. Encoger la de escritorio a 390px deja
  // la tabla en tipografía de 4px, y además muestra el producto en el
  // dispositivo equivocado: alguien que mira desde su teléfono tiene que
  // ver la app en un teléfono.
  {
    archivo: "panel-proximos-services",
    ruta: "/panel/proximos",
    // La lista de próximos es un <ul> de filas, no una <table>.
    esperar: "main ul li",
    // 16:10. Se ve la porción de arriba y el resto se desvanece con el
    // degradado del hero, así que no hace falta que la captura sea alta:
    // el corte lo hace el contenedor, no el archivo.
    vista: { width: 1440, height: 900 },
    alto: 900,
  },

  {
    archivo: "panel-proximos-services-celular",
    ruta: "/panel/proximos",
    // En el layout de celular la lista deja de ser tabla y pasa a tarjetas.
    esperar: "main ul li",
    // Un teléfono de verdad: 390×844 es el iPhone 15/14/13. El panel entra
    // en su layout mobile, con la barra de abajo y todo.
    vista: { width: 390, height: 844 },
    alto: 844,
  },

  // ---------- 04 · Qué cambia en tu lubricentro — una por fila ----------

  // 01 · Todo en un solo lugar. La ficha del cliente: sus autos y, debajo de
  // cada uno, cada service con su aceite y su fecha. Es la pantalla que
  // contesta "aparece todo".
  {
    archivo: "panel-ficha-cliente",
    ruta: "/panel/clientes?q=Pedro",
    // Scopeado al <li> de la lista: sin eso, el primer enlace que empieza
    // con /panel/clientes/ dentro de <main> es el de exportar a Excel, y el
    // click se lleva una descarga en vez de abrir la ficha.
    preparar: (p) => p.click('main ul li a[href^="/panel/clientes/"]'),
    esperar: 'main a[href^="/panel/services/"]',
    vista: VISTA_FILA,
    alto: VISTA_FILA.height,
  },

  // 02 · Cargalo como lo hacés a mano. El cartón, con la patente ya
  // resuelta y el service a medio cargar: kilómetros, viscosidad y dos
  // filtros. Vacío se ve un formulario; a medio cargar se ve el gesto, que
  // es lo que la fila promete.
  // El odómetro va por arriba del último service (98.450) para que no
  // aparezca el aviso de kilómetros hacia atrás.
  {
    archivo: "panel-carga-service",
    ruta: "/panel/services/nuevo",
    preparar: async (p) => {
      await p.fill("#patente", "ABC123");
      await p.click('a[href^="/panel/services/nuevo/"]');
      await p.waitForSelector("#km");
      await p.fill("#km", "102300");
      await p.click('button[aria-pressed]:text-is("10W40")');
      await p.getByRole("switch", { name: "Aceite", exact: true }).click();
      await p.getByRole("switch", { name: "Aire", exact: true }).click();
      // El foco se va del campo para que la captura no muestre el cursor
      // parpadeando ni el anillo de foco, que en una imagen quedan como
      // suciedad.
      await p.locator("#km").blur();
    },
    esperar: "#km",
    vista: VISTA_FILA,
    alto: VISTA_FILA.height,
  },

  // 03 · Sabé a quién le toca, por kilómetros. Misma pantalla que el hero y
  // otro archivo a propósito: allá es una imagen alta que se corta contra el
  // borde, acá es una apaisada que se ve entera. Un mismo recorte no sirve
  // para las dos cosas.
  {
    archivo: "panel-proximos-por-kilometros",
    ruta: "/panel/proximos",
    esperar: "main ul li",
    vista: VISTA_FILA,
    alto: VISTA_FILA.height,
  },

  // 04 · El mensaje ya escrito. El editor abierto, con la vista previa
  // resuelta contra un vehículo real del taller: el mensaje terminado, no la
  // plantilla con llaves.
  {
    archivo: "panel-mensaje-armado",
    ruta: "/panel/mensajes",
    preparar: (p) => p.click('main li button:has-text("Editar")'),
    esperar: '[role="dialog"]',
    vista: VISTA_FILA,
    alto: VISTA_FILA.height,
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
  await pagina.setViewportSize(c.vista);
  await pagina.goto(`${BASE}${c.ruta}`, { waitUntil: "networkidle" });
  if (c.preparar) await c.preparar(pagina);
  await pagina.waitForSelector(c.esperar, { timeout: 15_000 });

  // La pastilla flotante del dev overlay de Next vive abajo a la izquierda:
  // fuera del recorte alto del hero, pero adentro del de 900. No es parte
  // del producto, así que en una captura para la landing es basura. Se
  // inyecta por captura porque el <style> se va con cada navegación.
  await pagina.addStyleTag({
    content: "nextjs-portal { display: none !important; }",
  });

  // De vuelta arriba antes de disparar. `preparar` puede haber scrolleado
  // sin pedirlo: tocar un renglón del cartón que está más abajo que el
  // viewport lo trae a la vista, y la captura salía empezada por la mitad
  // del formulario, sin los kilómetros que la fila justamente promete.
  await pagina.evaluate(() => window.scrollTo(0, 0));

  // Que asienten fuentes e imágenes antes de disparar.
  await pagina.waitForTimeout(700);

  const png = `${SALIDA}/${c.archivo}.png`;
  await pagina.screenshot({
    path: png,
    clip: { x: 0, y: 0, width: c.vista.width, height: c.alto },
  });

  // A WebP, como el resto de los assets: la captura retina pesa 450KB en
  // PNG y 165 en WebP, y esta imagen va arriba del fold.
  const info = await sharp(png).webp({ quality: 82 }).toFile(`${SALIDA}/${c.archivo}.webp`);
  await unlink(png);

  console.log(`✓ ${c.archivo}.webp  ${Math.round(info.size / 1024)}KB  ←  ${c.ruta}`);
}

await navegador.close();

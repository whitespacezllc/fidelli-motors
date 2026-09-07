import { obtenerArticulos } from "@/lib/blog/articulos";
import {
  DESCRIPCION_BLOG,
  RUTA_FEED,
  URL_BLOG,
  urlArticulo,
} from "@/lib/blog/seo";
import { NOMBRE_SITIO, SITIO_URL } from "@/lib/seo";

// El feed RSS del blog. Estático: se genera en build con los artículos de
// content/blog y se sirve como archivo. Lleva el cuerpo completo de cada
// artículo en content:encoded, así un lector —o un crawler— no tiene que
// volver a la página para leerlo.
export const dynamic = "force-static";

function escapar(texto: string): string {
  return texto
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

// `]]>` dentro de un CDATA lo cerraría antes de tiempo.
function cdata(html: string): string {
  return `<![CDATA[${html.replace(/]]>/g, "]]]]><![CDATA[>")}]]>`;
}

// Los enlaces del cuerpo son relativos (`/`, `/#precio`, `/descargas/...`)
// y en un lector de feeds no tienen base: se vuelven absolutos. El atributo
// `download` solo tiene sentido en la página, así que se saca.
function absolutizar(html: string): string {
  return html
    .replace(/href="\/(?!\/)/g, `href="${SITIO_URL}/`)
    .replace(/ download(?=[ >])/g, "");
}

// RFC 822, que es lo que pide RSS. Mediodía argentino del día: el feed
// habla de un día, no de una hora, y así ningún lector lo corre al día
// anterior al pasarlo a otra zona.
function fechaRfc822(fecha: string): string {
  return new Date(`${fecha}T12:00:00-03:00`).toUTCString();
}

// La foto destacada, absoluta, al principio del cuerpo: los lectores de
// feeds la muestran como imagen del ítem.
function imagenDelFeed(a: { imagen: { src: string; alt: string } | null }): string {
  if (!a.imagen) return "";
  return `<p><img src="${SITIO_URL}${a.imagen.src}" alt="${escapar(a.imagen.alt)}" width="1920" height="1080"></p>`;
}

export async function GET() {
  const articulos = await obtenerArticulos();
  const ultima = articulos.map((a) => a.actualizado).sort().at(-1);

  const items = articulos
    .map(
      (a) => `
    <item>
      <title>${escapar(a.titulo)}</title>
      <link>${urlArticulo(a.slug)}</link>
      <guid isPermaLink="true">${urlArticulo(a.slug)}</guid>
      <pubDate>${fechaRfc822(a.fecha)}</pubDate>
      <dc:creator>${escapar(a.autor)}</dc:creator>
      <description>${escapar(a.descripcion)}</description>
      ${a.etiquetas.map((t) => `<category>${escapar(t)}</category>`).join("\n      ")}
      <content:encoded>${cdata(imagenDelFeed(a) + absolutizar(a.html))}</content:encoded>
    </item>`,
    )
    .join("");

  const xml = `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0" xmlns:atom="http://www.w3.org/2005/Atom" xmlns:dc="http://purl.org/dc/elements/1.1/" xmlns:content="http://purl.org/rss/1.0/modules/content/">
  <channel>
    <title>Blog de ${NOMBRE_SITIO}</title>
    <link>${URL_BLOG}</link>
    <description>${escapar(DESCRIPCION_BLOG)}</description>
    <language>es-AR</language>${ultima ? `\n    <lastBuildDate>${fechaRfc822(ultima)}</lastBuildDate>` : ""}
    <atom:link href="${SITIO_URL}${RUTA_FEED}" rel="self" type="application/rss+xml"/>${items}
  </channel>
</rss>
`;

  return new Response(xml, {
    headers: { "Content-Type": "application/rss+xml; charset=utf-8" },
  });
}

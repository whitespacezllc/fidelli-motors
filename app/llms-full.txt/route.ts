import { obtenerArticulos } from "@/lib/blog/articulos";
import { URL_BLOG, urlArticulo } from "@/lib/blog/seo";
import { DESCRIPCION_PORTADA, NOMBRE_SITIO, SITIO_URL } from "@/lib/seo";

// /llms-full.txt: el texto completo de los artículos del blog, para los
// modelos que prefieren un solo archivo antes que rastrear cuatro páginas.
// Es el complemento de public/llms.txt, que es el índice corto.
//
// Se genera en build desde content/blog (no es un archivo en public/ que
// haya que regenerar a mano): cuando cambia un artículo, cambia esto.
export const dynamic = "force-static";

export async function GET() {
  const articulos = await obtenerArticulos();

  const cabecera = [
    `# ${NOMBRE_SITIO} — Blog, texto completo`,
    "",
    `> ${DESCRIPCION_PORTADA}`,
    "",
    `Sitio: ${SITIO_URL}`,
    `Blog: ${URL_BLOG}`,
    `Índice corto: ${SITIO_URL}/llms.txt`,
    "",
    `Artículos: ${articulos.length}. Escribe Santiago Afur, cofundador de ${NOMBRE_SITIO}. Precios en pesos argentinos.`,
  ].join("\n");

  const cuerpos = articulos.map((a) =>
    [
      `# ${a.titulo}`,
      "",
      `URL: ${urlArticulo(a.slug)}`,
      `Autor: ${a.autor}`,
      `Publicado: ${a.fecha}`,
      `Actualizado: ${a.actualizado}`,
      `Etiquetas: ${a.etiquetas.join(", ")}`,
      `Resumen: ${a.descripcion}`,
      "",
      a.textoPlano,
    ].join("\n"),
  );

  const texto = [cabecera, ...cuerpos].join("\n\n---\n\n") + "\n";

  return new Response(texto, {
    headers: { "Content-Type": "text/plain; charset=utf-8" },
  });
}

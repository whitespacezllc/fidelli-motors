import "server-only";
import { existsSync } from "node:fs";
import { readdir, readFile } from "node:fs/promises";
import path from "node:path";
import { cache } from "react";
import matter from "gray-matter";
import type { Root as Mdast, Paragraph, RootContent } from "mdast";
import {
  aHtml,
  aTextoPlano,
  parsearMarkdown,
  textoDe,
} from "@/lib/blog/markdown";

// Los artículos del blog: archivos Markdown en content/blog, uno por
// artículo, con el frontmatter que describe CLAUDE-landing.md. Se leen en
// build —generateStaticParams, el sitemap, el feed y llms-full.txt salen
// todos de acá— y nunca en el navegador.
//
// Sin CMS a propósito: un artículo nuevo es un archivo nuevo en un PR, con
// el mismo review que el resto del copy.

const CARPETA = path.join(process.cwd(), "content", "blog");

// Tiempo de lectura: palabras / 200, redondeado, mínimo 1.
const PALABRAS_POR_MINUTO = 200;

export type PreguntaFrecuente = {
  readonly pregunta: string;
  readonly respuesta: string;
};

/** Una foto del blog: la destacada de un artículo o la portada del índice. */
export type ImagenBlog = {
  /** Ruta pública, dentro de /assets/blog. */
  readonly src: string;
  readonly alt: string;
  /** "Nombre del fotógrafo · Pexels". Opcional. */
  readonly credito: string | null;
};

export type Articulo = {
  readonly slug: string;
  readonly titulo: string;
  /** Para las migas y el BreadcrumbList: el título hasta los dos puntos. */
  readonly tituloCorto: string;
  readonly descripcion: string;
  /** Fecha de publicación, YYYY-MM-DD. */
  readonly fecha: string;
  /** Última actualización, YYYY-MM-DD. Es la que se muestra y la del sitemap. */
  readonly actualizado: string;
  readonly autor: string;
  readonly etiquetas: readonly string[];
  /** La primera etiqueta, con mayúscula inicial. */
  readonly categoria: string;
  /** Ruta pública de un archivo para descargar, si el artículo trae uno. */
  readonly descarga: string | null;
  /**
   * Completa "Hola, leí el artículo sobre ___ y quiero saber más.", el
   * mensaje de WhatsApp de quien llega por el blog (frontmatter
   * `whatsappTema`, en minúscula y corto). Si falta, va el título tal cual.
   */
  readonly whatsappTema: string;
  /** La foto destacada (frontmatter `imagen`, `imagenAlt`, `imagenCredito`). */
  readonly imagen: ImagenBlog | null;
  readonly minutosLectura: number;
  /** El cuerpo en HTML, sin la bio. */
  readonly html: string;
  /** La bio del autor (lo que viene después del último `---`), en HTML. */
  readonly bioHtml: string;
  /** Las preguntas frecuentes: cada H3 y su párrafo siguiente. */
  readonly preguntas: readonly PreguntaFrecuente[];
  /** El cuerpo en texto plano estructurado, para llms-full.txt. */
  readonly textoPlano: string;
};

// ------------------------------------------------------------
// Frontmatter — se valida en build y falla ruidoso
// ------------------------------------------------------------

function textoObligatorio(valor: unknown, campo: string, archivo: string) {
  if (typeof valor === "string" && valor.trim()) return valor.trim();
  throw new Error(`content/blog/${archivo}: falta "${campo}" en el frontmatter.`);
}

// YAML convierte `date: 2026-09-08` en un Date (UTC). Se vuelve a texto por
// el ISO y no por getDate(): en un proceso en UTC-3 el día local sería el
// anterior.
function fechaISO(valor: unknown, campo: string, archivo: string): string {
  if (valor instanceof Date) return valor.toISOString().slice(0, 10);
  if (typeof valor === "string" && /^\d{4}-\d{2}-\d{2}$/.test(valor)) return valor;
  throw new Error(
    `content/blog/${archivo}: "${campo}" tiene que ser una fecha YYYY-MM-DD.`,
  );
}

// "Sistema de gestión para lubricentro: qué tiene que tener…" → "Sistema de
// gestión para lubricentro". "Cuánto cuesta… en Argentina (2026)" → sin el
// paréntesis. Un `tituloCorto` en el frontmatter lo pisa.
function acortarTitulo(titulo: string): string {
  return titulo.split(":")[0].replace(/\s*\([^)]*\)\s*$/, "").trim();
}

function capitalizar(texto: string): string {
  return texto.charAt(0).toUpperCase() + texto.slice(1);
}

// La foto destacada, si el frontmatter la trae. Tiene que existir en
// public/ y venir con su alt: una foto sin descripción no pasa el build,
// que es mejor que una foto muda en producción.
function leerImagen(data: Record<string, unknown>, archivo: string): ImagenBlog | null {
  const src = data.imagen;
  if (typeof src !== "string" || !src) return null;
  if (!src.startsWith("/assets/blog/")) {
    throw new Error(`content/blog/${archivo}: "imagen" tiene que ser una ruta dentro de /assets/blog/.`);
  }
  if (!existsSync(path.join(process.cwd(), "public", src))) {
    throw new Error(`content/blog/${archivo}: no existe public${src}.`);
  }
  return {
    src,
    alt: textoObligatorio(data.imagenAlt, "imagenAlt", archivo),
    credito:
      typeof data.imagenCredito === "string" && data.imagenCredito.trim()
        ? data.imagenCredito.trim()
        : null,
  };
}

// ------------------------------------------------------------
// El cuerpo — se parte en tres: prosa, preguntas frecuentes, bio
// ------------------------------------------------------------

// La bio es lo que viene después del último `---`. Se separa del cuerpo
// para renderizarla como tarjeta de autor y no como párrafo suelto.
function separarBio(arbol: Mdast): {
  cuerpo: RootContent[];
  bio: Paragraph | null;
} {
  const nodos = arbol.children;
  const corte = nodos.map((n) => n.type).lastIndexOf("thematicBreak");
  if (corte === -1) return { cuerpo: nodos, bio: null };

  const bio =
    nodos
      .slice(corte + 1)
      .find((n): n is Paragraph => n.type === "paragraph") ?? null;
  return { cuerpo: nodos.slice(0, corte), bio };
}

// La bio viene entera en énfasis (*...*). En la tarjeta de autor no hay
// nada que enfatizar, así que se le saca el envoltorio y queda el texto.
function sinEnfasis(parrafo: Paragraph): Paragraph {
  const [unico] = parrafo.children;
  if (parrafo.children.length === 1 && unico.type === "emphasis") {
    return { ...parrafo, children: unico.children };
  }
  return parrafo;
}

// La sección "## Preguntas frecuentes": cada H3 es una pregunta y el
// párrafo que le sigue, su respuesta. Alimenta el FAQPage del JSON-LD; en
// la página las preguntas siguen siendo H3 literales dentro del HTML.
function extraerPreguntas(cuerpo: readonly RootContent[]): PreguntaFrecuente[] {
  const inicio = cuerpo.findIndex(
    (n) =>
      n.type === "heading" &&
      n.depth === 2 &&
      /^preguntas frecuentes$/i.test(textoDe(n).trim()),
  );
  if (inicio === -1) return [];

  const preguntas: PreguntaFrecuente[] = [];
  for (let i = inicio + 1; i < cuerpo.length; i++) {
    const nodo = cuerpo[i];
    if (nodo.type === "heading" && nodo.depth <= 2) break;
    if (nodo.type !== "heading" || nodo.depth !== 3) continue;

    const siguiente = cuerpo[i + 1];
    if (siguiente?.type === "paragraph") {
      preguntas.push({
        pregunta: textoDe(nodo).trim(),
        respuesta: textoDe(siguiente).trim(),
      });
    }
  }
  return preguntas;
}

async function leerArticulo(archivo: string): Promise<Articulo> {
  const crudo = await readFile(path.join(CARPETA, archivo), "utf8");
  const { data, content } = matter(crudo);

  const slug = textoObligatorio(data.slug, "slug", archivo);
  if (slug !== archivo.replace(/\.md$/, "")) {
    throw new Error(
      `content/blog/${archivo}: el slug del frontmatter ("${slug}") tiene que ser el nombre del archivo.`,
    );
  }
  if (!/^[a-z0-9]+(-[a-z0-9]+)*$/.test(slug) || slug.length > 60) {
    throw new Error(
      `content/blog/${archivo}: el slug va en minúsculas, con guiones y hasta 60 caracteres.`,
    );
  }

  const etiquetas = Array.isArray(data.tags) ? data.tags.map(String) : [];
  if (etiquetas.length === 0) {
    throw new Error(`content/blog/${archivo}: "tags" tiene que tener al menos una etiqueta.`);
  }

  const titulo = textoObligatorio(data.title, "title", archivo);
  const arbol = parsearMarkdown(content);
  const { cuerpo, bio } = separarBio(arbol);
  const raizCuerpo: Mdast = { type: "root", children: cuerpo };

  // Las palabras se cuentan sobre el texto plano y no sobre textoDe(): ese
  // pega los bloques sin separador ("lugar.Todo") y las celdas de una tabla
  // entre sí, y contaba un 5-8% de menos.
  const textoPlano = aTextoPlano(cuerpo);
  const palabras = textoPlano.split(/\s+/).filter(Boolean).length;

  return {
    slug,
    titulo,
    tituloCorto:
      typeof data.tituloCorto === "string" && data.tituloCorto.trim()
        ? data.tituloCorto.trim()
        : acortarTitulo(titulo),
    descripcion: textoObligatorio(data.description, "description", archivo),
    fecha: fechaISO(data.date, "date", archivo),
    actualizado: fechaISO(data.updated, "updated", archivo),
    autor: textoObligatorio(data.author, "author", archivo),
    etiquetas,
    categoria: capitalizar(etiquetas[0]),
    descarga: typeof data.descarga === "string" && data.descarga ? data.descarga : null,
    whatsappTema:
      typeof data.whatsappTema === "string" && data.whatsappTema.trim()
        ? data.whatsappTema.trim()
        : titulo,
    imagen: leerImagen(data, archivo),
    minutosLectura: Math.max(1, Math.round(palabras / PALABRAS_POR_MINUTO)),
    html: await aHtml(raizCuerpo),
    bioHtml: bio
      ? await aHtml({ type: "root", children: [sinEnfasis(bio)] })
      : "",
    preguntas: extraerPreguntas(cuerpo),
    textoPlano,
  };
}

/**
 * Todos los artículos, del más nuevo al más viejo. A igual fecha, por slug,
 * para que el orden sea el mismo en cada build.
 *
 * `cache` deduplica dentro de un mismo render: la página, su metadata y su
 * imagen OG piden lo mismo y los archivos se leen una vez.
 */
export const obtenerArticulos = cache(async (): Promise<Articulo[]> => {
  const archivos = (await readdir(CARPETA)).filter((a) => a.endsWith(".md")).sort();
  const articulos = await Promise.all(archivos.map(leerArticulo));
  return articulos.sort(
    (a, b) => b.fecha.localeCompare(a.fecha) || a.slug.localeCompare(b.slug),
  );
});

export const obtenerArticulo = cache(
  async (slug: string): Promise<Articulo | null> =>
    (await obtenerArticulos()).find((a) => a.slug === slug) ?? null,
);

/** Los demás artículos, en el orden del índice. */
export function relacionados(
  actual: Articulo,
  todos: readonly Articulo[],
): Articulo[] {
  return todos.filter((a) => a.slug !== actual.slug);
}

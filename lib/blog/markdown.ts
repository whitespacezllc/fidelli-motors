import "server-only";
import { unified } from "unified";
import remarkParse from "remark-parse";
import remarkGfm from "remark-gfm";
import remarkRehype from "remark-rehype";
import rehypeSlug from "rehype-slug";
import rehypeStringify from "rehype-stringify";
import { visit } from "unist-util-visit";
import { toString as textoDe } from "mdast-util-to-string";
import type { Root as Hast, Element } from "hast";
import type {
  Root as Mdast,
  PhrasingContent,
  RootContent,
  Table,
} from "mdast";
import { SITIO_URL } from "@/lib/seo";

// El pipeline de Markdown del blog: remark (parseo, tablas GFM) → rehype
// (ids en los títulos, enlaces, tablas) → HTML. Corre en build, una vez
// por artículo. Nada de esto llega al navegador: la página recibe HTML.
//
// Sin MDX a propósito. Los artículos son Markdown plano con tablas,
// negritas y títulos; MDX traería un compilador y JavaScript de cliente
// para renderizar prosa que no cambia.

// Los enlaces, con la regla del bloque: los internos (`/`, `/#precio`)
// quedan tal cual; los externos abren en pestaña nueva con noopener; los
// que apuntan a un archivo de /descargas/ llevan `download`, para que el
// clic baje el archivo en vez de intentar abrirlo.
function rehypeEnlaces() {
  return (arbol: Hast) => {
    visit(arbol, "element", (nodo: Element) => {
      if (nodo.tagName !== "a") return;
      const href = String(nodo.properties.href ?? "");

      const externo = /^https?:\/\//i.test(href) && !href.startsWith(SITIO_URL);
      if (externo) {
        nodo.properties.target = "_blank";
        nodo.properties.rel = ["noopener", "noreferrer"];
      }

      if (href.startsWith("/descargas/")) {
        nodo.properties.download = true;
      }
    });
  };
}

// Cada tabla va adentro de un contenedor con scroll horizontal. Es la
// única forma de que una tabla de tres columnas no rompa el ancho de la
// página en un celular: la tabla entra si puede, y si no, scrollea ella
// sola y no la página.
function rehypeTablas() {
  return (arbol: Hast) => {
    visit(arbol, "element", (nodo: Element, indice, padre) => {
      if (nodo.tagName !== "table" || !padre || indice === undefined) return;
      const yaEnvuelta =
        padre.type === "element" &&
        Array.isArray(padre.properties.className) &&
        padre.properties.className.includes("tabla");
      if (yaEnvuelta) return;

      const envoltorio: Element = {
        type: "element",
        tagName: "div",
        properties: { className: ["tabla"] },
        children: [nodo],
      };
      padre.children[indice] = envoltorio;
    });
  };
}

const procesador = unified()
  .use(remarkParse)
  .use(remarkGfm)
  .use(remarkRehype)
  .use(rehypeSlug)
  .use(rehypeEnlaces)
  .use(rehypeTablas)
  .use(rehypeStringify);

/** El árbol de Markdown (mdast) de un texto. */
export function parsearMarkdown(fuente: string): Mdast {
  return procesador.parse(fuente);
}

/** El HTML de un árbol de Markdown, ya con ids, enlaces y tablas resueltos. */
export async function aHtml(arbol: Mdast): Promise<string> {
  const hast = await procesador.run(arbol);
  return procesador.stringify(hast);
}

// ------------------------------------------------------------
// Texto plano — para llms-full.txt
//
// No es el HTML sin etiquetas: conserva la estructura que un modelo
// necesita para citar bien (títulos con su nivel, listas, filas de tabla)
// y resuelve los enlaces a su URL absoluta, porque un "Conocé cómo
// funciona" sin destino no le sirve a nadie fuera de la página.
// ------------------------------------------------------------

function urlAbsoluta(href: string): string {
  if (href.startsWith("/")) return `${SITIO_URL}${href}`;
  if (href.startsWith("#")) return `${SITIO_URL}/${href}`;
  return href;
}

function textoEnLinea(nodos: PhrasingContent[]): string {
  return nodos
    .map((nodo) => {
      switch (nodo.type) {
        case "text":
        case "inlineCode":
          return nodo.value;
        case "break":
          return "\n";
        case "link":
          return `${textoEnLinea(nodo.children)} (${urlAbsoluta(nodo.url)})`;
        case "strong":
        case "emphasis":
        case "delete":
          return textoEnLinea(nodo.children);
        default:
          return textoDe(nodo);
      }
    })
    .join("");
}

function tablaATexto(tabla: Table): string {
  return tabla.children
    .map((fila) =>
      fila.children.map((celda) => textoEnLinea(celda.children)).join(" | "),
    )
    .join("\n");
}

function bloqueATexto(nodo: RootContent): string {
  switch (nodo.type) {
    case "heading":
      return `${"#".repeat(nodo.depth)} ${textoEnLinea(nodo.children)}`;
    case "paragraph":
      return textoEnLinea(nodo.children);
    case "list":
      return nodo.children
        .map((item, i) => {
          const prefijo = nodo.ordered ? `${(nodo.start ?? 1) + i}. ` : "- ";
          const cuerpo = item.children.map(bloqueATexto).join("\n");
          return prefijo + cuerpo.replace(/\n/g, "\n  ");
        })
        .join("\n");
    case "table":
      return tablaATexto(nodo);
    case "blockquote":
      return nodo.children
        .map(bloqueATexto)
        .join("\n")
        .replace(/^/gm, "> ");
    case "code":
      return nodo.value;
    case "thematicBreak":
      return "---";
    case "html":
      return "";
    default:
      return textoDe(nodo);
  }
}

/** Los bloques de un artículo como texto plano estructurado. */
export function aTextoPlano(nodos: readonly RootContent[]): string {
  return nodos.map(bloqueATexto).filter(Boolean).join("\n\n");
}

export { textoDe };

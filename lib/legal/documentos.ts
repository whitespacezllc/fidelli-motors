import "server-only";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { cache } from "react";
import matter from "gray-matter";
import { aHtml, parsearMarkdown } from "@/lib/blog/markdown";
import {
  DOCUMENTOS_LEGALES,
  VERSION_LEGAL,
  VIGENCIA_LEGAL,
  type SlugLegal,
} from "@/lib/legal";

// Los documentos legales: un archivo Markdown por documento en
// content/legal, con el frontmatter `title · description · version ·
// vigencia`. Mismo pipeline que el blog (gray-matter + remark + rehype):
// el HTML se genera en build y llega entero del servidor.
//
// EL TEXTO NO VA INLINE EN NINGÚN TSX. Es copy aprobado y vinculante: se
// publica tal cual, sin reescribir ni "mejorar" el lenguaje.
//
// LA VERIFICACIÓN QUE FALLA: `version` y `vigencia` del frontmatter tienen
// que coincidir con VERSION_LEGAL y VIGENCIA_LEGAL de lib/legal.ts. Si no
// coinciden, el build (y cualquier render de /terminos o /privacidad) falla
// con un mensaje que dice cuál. Es lo que impide que un texto se edite sin
// subir la versión —o que la versión se suba sin tocar el texto— y que el
// modal del panel le pida a todo el mundo aceptar algo que no cambió.

const CARPETA = path.join(process.cwd(), "content", "legal");

export type DocumentoLegal = {
  readonly slug: SlugLegal;
  readonly titulo: string;
  readonly descripcion: string;
  readonly version: string;
  /** YYYY-MM-DD. */
  readonly vigencia: string;
  /** El cuerpo en HTML: secciones numeradas con el bloque de contacto al final. */
  readonly html: string;
};

function textoObligatorio(valor: unknown, campo: string, archivo: string): string {
  if (typeof valor === "string" && valor.trim()) return valor.trim();
  throw new Error(`content/legal/${archivo}: falta "${campo}" en el frontmatter.`);
}

// YAML convierte `vigencia: 2026-09-22` en un Date (UTC). Se vuelve a texto
// por el ISO y no por getDate(): en un proceso en UTC-3 el día local sería
// el anterior. Mismo criterio que lib/blog/articulos.ts.
function fechaISO(valor: unknown, campo: string, archivo: string): string {
  if (valor instanceof Date) return valor.toISOString().slice(0, 10);
  if (typeof valor === "string" && /^\d{4}-\d{2}-\d{2}$/.test(valor)) return valor;
  throw new Error(`content/legal/${archivo}: "${campo}" tiene que ser una fecha YYYY-MM-DD.`);
}

async function leerDocumento(slug: SlugLegal): Promise<DocumentoLegal> {
  const archivo = `${slug}.md`;
  const crudo = await readFile(path.join(CARPETA, archivo), "utf8");
  const { data, content } = matter(crudo);

  // `version` se lee como string aunque YAML pudiera parsear "1.0" como
  // número: en el archivo va entre comillas, y si alguien las saca esto
  // lo convierte igual antes de comparar.
  const version = String(data.version ?? "").trim();
  const vigencia = fechaISO(data.vigencia, "vigencia", archivo);

  if (version !== VERSION_LEGAL) {
    throw new Error(
      `content/legal/${archivo}: la versión del frontmatter es "${version}" y lib/legal.ts dice "${VERSION_LEGAL}". ` +
        "Las dos tienen que coincidir: cambiar el texto de forma relevante es subir VERSION_LEGAL, y subirla es actualizar el archivo.",
    );
  }
  if (vigencia !== VIGENCIA_LEGAL) {
    throw new Error(
      `content/legal/${archivo}: la vigencia del frontmatter es ${vigencia} y lib/legal.ts dice ${VIGENCIA_LEGAL}. Tienen que coincidir.`,
    );
  }

  return {
    slug,
    titulo: textoObligatorio(data.title, "title", archivo),
    descripcion: textoObligatorio(data.description, "description", archivo),
    version,
    vigencia,
    html: await aHtml(parsearMarkdown(content)),
  };
}

/** Un documento legal por su slug. `cache` deduplica página y metadata en un mismo render. */
export const obtenerDocumentoLegal = cache(
  async (slug: SlugLegal): Promise<DocumentoLegal> => leerDocumento(slug),
);

/** Los dos, en el orden del pie. Para el sitemap. */
export const obtenerDocumentosLegales = cache(
  async (): Promise<DocumentoLegal[]> =>
    Promise.all(DOCUMENTOS_LEGALES.map((d) => leerDocumento(d.slug))),
);

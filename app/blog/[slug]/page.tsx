import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { NOMBRE_SITIO } from "@/lib/seo";
import {
  obtenerArticulo,
  obtenerArticulos,
  relacionados,
} from "@/lib/blog/articulos";
import {
  ALTERNATES_FEED,
  AUTOR,
  schemaBlogPosting,
  schemaMigas,
  schemaPreguntas,
} from "@/lib/blog/seo";
import { formatearFechaLarga } from "@/lib/fechas";
import { JsonLd } from "@/components/blog/json-ld";
import { Migas } from "@/components/blog/migas";
import { AvatarAutor } from "@/components/blog/avatar-autor";
import { BloqueDescarga } from "@/components/blog/bloque-descarga";
import { ImagenDestacada } from "@/components/blog/imagen-articulo";
import { TarjetaAutor } from "@/components/blog/tarjeta-autor";
import { CierreBlog } from "@/components/blog/cierre-blog";
import { Relacionados } from "@/components/blog/relacionados";
import { ArticuloLeido } from "@/components/tracking/articulo-leido";

// Un artículo del blog. Estático en build: los slugs salen de content/blog
// y cualquier otro es 404, no una página generada al vuelo.
//
// Un solo H1 (el título). Los H2 y H3 del Markdown se respetan tal cual,
// incluidas las preguntas frecuentes, que van como H3 literales en el HTML
// servido —nada de acordeones— para que cualquier crawler las lea.
type Props = { params: Promise<{ slug: string }> };

export const dynamicParams = false;

export async function generateStaticParams() {
  return (await obtenerArticulos()).map((a) => ({ slug: a.slug }));
}

// Medianoche argentina del día: article:published_time pide un instante,
// no un día. El JSON-LD lleva la fecha sola, que para schema.org alcanza.
function instanteAR(fecha: string): string {
  return `${fecha}T00:00:00-03:00`;
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { slug } = await params;
  const articulo = await obtenerArticulo(slug);
  if (!articulo) return {};

  const ruta = `/blog/${articulo.slug}`;

  // Sin `images` en openGraph ni en twitter: la imagen sale de la
  // convención de archivo (opengraph-image.tsx), que tiene prioridad sobre
  // la metadata declarada y ya emite width, height, type y alt.
  return {
    title: articulo.titulo,
    description: articulo.descripcion,
    alternates: { canonical: ruta, types: ALTERNATES_FEED },
    robots: { index: true, follow: true },
    openGraph: {
      title: articulo.titulo,
      description: articulo.descripcion,
      url: ruta,
      siteName: NOMBRE_SITIO,
      locale: "es_AR",
      type: "article",
      publishedTime: instanteAR(articulo.fecha),
      modifiedTime: instanteAR(articulo.actualizado),
      authors: [AUTOR.nombre],
      section: articulo.categoria,
      tags: [...articulo.etiquetas],
    },
    twitter: {
      card: "summary_large_image",
      title: articulo.titulo,
      description: articulo.descripcion,
    },
  };
}

export default async function PaginaArticulo({ params }: Props) {
  const { slug } = await params;
  const articulo = await obtenerArticulo(slug);
  if (!articulo) notFound();

  const otros = relacionados(articulo, await obtenerArticulos());

  return (
    <>
      <JsonLd datos={schemaBlogPosting(articulo)} />
      {articulo.preguntas.length > 0 && (
        <JsonLd datos={schemaPreguntas(articulo)} />
      )}
      <JsonLd datos={schemaMigas(articulo)} />

      {/* Anota que se leyó este artículo: de acá sale el "leí el artículo
          sobre…" del WhatsApp. No pinta nada. */}
      <ArticuloLeido slug={articulo.slug} tema={articulo.whatsappTema} />

      <div className="contenedor aire-seccion">
        <div className="mx-auto max-w-2xl">
          <article>
            <header>
              <Migas actual={articulo.tituloCorto} />

              {/* La categoría es una etiqueta, no un estado ni una acción:
                  va sobria, en tinta secundaria y sin rojo. */}
              {/* Cada dato lleva su separador adentro del mismo span: si la
                  línea se parte en un celular, el punto baja con el texto
                  que separa en vez de quedar colgando al final del renglón. */}
              <p className="mt-6 flex flex-wrap items-center gap-x-2 gap-y-1.5 font-ui text-ui text-ink-60">
                <span className="rounded-full border border-line bg-surface px-2.5 py-0.5 text-label font-semibold tracking-[0.06em] text-ink-60 uppercase">
                  {articulo.categoria}
                </span>
                <span className="flex items-center gap-2">
                  <span aria-hidden className="text-ink-40">
                    ·
                  </span>
                  {articulo.minutosLectura} min de lectura
                </span>
                <span className="flex items-center gap-2">
                  <span aria-hidden className="text-ink-40">
                    ·
                  </span>
                  <span>
                    Actualizado el{" "}
                    <time dateTime={articulo.actualizado}>
                      {formatearFechaLarga(articulo.actualizado)}
                    </time>
                  </span>
                </span>
              </p>

              <h1 className="mt-4 text-balance text-h2 font-bold tracking-[-0.015em] sm:text-h1">
                {articulo.titulo}
              </h1>

              {/* La bajada topada: el lead es largo y en desktop se
                  estiraría más allá de los 65-75 caracteres. */}
              <p className="mt-(--espacio-h2-lead) max-w-prose text-pretty text-lead leading-[1.4] text-ink-60">
                {articulo.descripcion}
              </p>

              <div className="mt-6 flex items-center gap-3">
                <AvatarAutor tamano="chico" />
                <p className="font-ui text-ui">
                  <span className="font-semibold text-ink">{articulo.autor}</span>
                  <span aria-hidden className="text-ink-60">
                    {" · "}
                  </span>
                  <span className="text-ink-60">{AUTOR.rol}</span>
                </p>
              </div>
            </header>

            {/* La foto destacada, con prioridad: es el LCP del artículo. */}
            {articulo.imagen && (
              <ImagenDestacada
                imagen={articulo.imagen}
                prioridad
                className="mt-(--espacio-lead)"
              />
            )}

            {articulo.descarga && (
              <BloqueDescarga
                href={articulo.descarga}
                className="mt-(--espacio-lead)"
              />
            )}

            {/* El cuerpo: HTML generado en build a partir del Markdown.
                `prosa` (globals.css) pone Public Sans, la medida y el
                resto de las reglas del bloque. */}
            <div
              className="prosa mt-(--espacio-lead) max-w-prose"
              dangerouslySetInnerHTML={{ __html: articulo.html }}
            />

            <TarjetaAutor articulo={articulo} className="mt-(--espacio-bloque)" />
          </article>

          <CierreBlog className="mt-8" />

          <Relacionados articulos={otros} className="mt-(--espacio-bloque)" />
        </div>
      </div>
    </>
  );
}

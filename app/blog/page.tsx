import type { Metadata } from "next";
import Link from "next/link";
import { NOMBRE_SITIO, OG_IMAGEN } from "@/lib/seo";
import { obtenerArticulos } from "@/lib/blog/articulos";
import {
  ALTERNATES_FEED,
  BAJADA_BLOG,
  DESCRIPCION_BLOG,
  PORTADA,
  TITULO_BLOG,
  schemaIndice,
} from "@/lib/blog/seo";
import { formatearFechaLarga } from "@/lib/fechas";
import { JsonLd } from "@/components/blog/json-ld";
import { ImagenDestacada, Miniatura } from "@/components/blog/imagen-articulo";

// El índice del blog: los artículos del más nuevo al más viejo, con
// título, descripción, fecha y tiempo de lectura. Estático en build.
//
// El título declara solo su nombre y el template del layout raíz agrega
// la marca. La imagen OG es la general del sitio: el índice no tiene una
// propia, los artículos sí.
const TITULO_OG = `Blog de ${NOMBRE_SITIO}`;

export const metadata: Metadata = {
  title: TITULO_BLOG,
  description: DESCRIPCION_BLOG,
  alternates: { canonical: "/blog", types: ALTERNATES_FEED },
  robots: { index: true, follow: true },
  openGraph: {
    title: TITULO_OG,
    description: DESCRIPCION_BLOG,
    url: "/blog",
    siteName: NOMBRE_SITIO,
    locale: "es_AR",
    type: "website",
    images: [OG_IMAGEN],
  },
  twitter: {
    card: "summary_large_image",
    title: TITULO_OG,
    description: DESCRIPCION_BLOG,
    images: [OG_IMAGEN.url],
  },
};

export default async function IndiceBlog() {
  const articulos = await obtenerArticulos();

  return (
    <>
      <JsonLd datos={schemaIndice(articulos)} />

      <div className="contenedor aire-seccion">
        <div className="mx-auto max-w-2xl">
          <header>
            <h1 className="text-h2 font-bold tracking-[-0.015em] sm:text-h1">
              {TITULO_BLOG}
            </h1>
            <p className="mt-(--espacio-h2-lead) max-w-[52ch] text-pretty text-lead leading-[1.4] text-ink-60">
              {BAJADA_BLOG}
            </p>
          </header>

          {/* La foto del índice, con prioridad: es el LCP de la página. */}
          <ImagenDestacada imagen={PORTADA} prioridad className="mt-(--espacio-lead)" />

          <ol className="mt-(--espacio-bloque) divide-y divide-line border-t border-line">
            {articulos.map((a) => (
              <li key={a.slug}>
                {/* Miniatura arriba en un celular, a la izquierda desde 640px.
                    La foto también lleva al artículo, pero fuera del orden
                    de tabulación y sin nombre: el enlace que cuenta es el
                    del título. */}
                <article className="grid gap-4 py-7 sm:grid-cols-[200px_1fr] sm:gap-6 sm:py-8">
                  {a.imagen && (
                    <Link
                      href={`/blog/${a.slug}`}
                      aria-hidden
                      tabIndex={-1}
                      className="block"
                    >
                      <Miniatura
                        imagen={a.imagen}
                        sizes="(min-width: 640px) 200px, calc(100vw - 40px)"
                      />
                    </Link>
                  )}
                  <div className={a.imagen ? "" : "sm:col-span-2"}>
                    <p className="font-ui text-label font-semibold tracking-[0.06em] text-ink-60 uppercase">
                      {a.categoria}
                    </p>
                    <h2 className="mt-2 text-balance text-lead font-bold sm:text-h3">
                      <Link
                        href={`/blog/${a.slug}`}
                        className="text-ink underline-offset-4 transition-colors hover:underline"
                      >
                        {a.titulo}
                      </Link>
                    </h2>
                    <p className="mt-2 max-w-prose text-pretty text-body text-ink-60">
                      {a.descripcion}
                    </p>
                    <p className="mt-3 font-ui text-ui text-ink-60">
                      <time dateTime={a.fecha}>{formatearFechaLarga(a.fecha)}</time>
                      <span aria-hidden> · </span>
                      {a.minutosLectura} min de lectura
                    </p>
                  </div>
                </article>
              </li>
            ))}
          </ol>
        </div>
      </div>
    </>
  );
}

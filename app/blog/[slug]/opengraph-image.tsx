import { ImageResponse } from "next/og";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { obtenerArticulo, obtenerArticulos } from "@/lib/blog/articulos";
import { NOMBRE_SITIO } from "@/lib/seo";

// La tarjeta de cada artículo al compartirlo: fondo rojo de marca, el
// título en Nunito blanca y el dominio al pie. Se genera en build, una por
// artículo, y Next la enlaza sola en og:image (con width, height y type)
// y en twitter:image.
//
// LA FUENTE ES UN ARCHIVO DEL REPO, no una request a Google en el momento
// de generar: lib/blog/nunito-700.woff es la Nunito 700 (latín) de
// @fontsource/nunito, licencia OFL, en WOFF porque el motor de imágenes
// (satori) lee TTF, OTF y WOFF pero no WOFF2. Es la misma familia que
// next/font sirve en la página.
// El alt es uno solo para las cuatro tarjetas (la convención de archivo no
// admite uno por artículo sin cambiar la URL de la imagen): describe lo que
// se ve, no el título, que ya va en og:title.
export const alt = `Tarjeta roja con el título de un artículo del blog de ${NOMBRE_SITIO}`;
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

export const dynamicParams = false;

export async function generateStaticParams() {
  return (await obtenerArticulos()).map((a) => ({ slug: a.slug }));
}

export default async function ImagenArticulo({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const articulo = await obtenerArticulo(slug);
  const titulo = articulo?.titulo ?? `Blog de ${NOMBRE_SITIO}`;

  const nunito = await readFile(
    path.join(process.cwd(), "lib", "blog", "nunito-700.woff"),
  );

  // Los títulos largos bajan un escalón para entrar en tres renglones.
  const cuerpo = titulo.length > 70 ? 54 : 62;

  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          flexDirection: "column",
          justifyContent: "space-between",
          padding: "72px 80px",
          backgroundColor: "#E01F26",
          color: "#FFFFFF",
          fontFamily: "Nunito",
        }}
      >
        <div style={{ display: "flex", fontSize: 28, opacity: 0.85 }}>
          Blog · {NOMBRE_SITIO}
        </div>
        <div
          style={{
            display: "flex",
            fontSize: cuerpo,
            lineHeight: 1.1,
            letterSpacing: -1,
            textWrap: "balance",
          }}
        >
          {titulo}
        </div>
        <div style={{ display: "flex", fontSize: 28 }}>fidellimotors.app</div>
      </div>
    ),
    {
      ...size,
      fonts: [{ name: "Nunito", data: nunito, weight: 700, style: "normal" }],
    },
  );
}

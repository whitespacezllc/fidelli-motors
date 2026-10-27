import { ImageResponse } from "next/og";
import { readFile } from "node:fs/promises";
import path from "node:path";
import sharp from "sharp";
import { obtenerLandingSinSesion, type Lubricentro } from "@/lib/cliente/landing";
import { luminancia, paletaTenant } from "@/lib/cliente/color";

// La tarjeta que ve el cliente de un lubricentro cuando le comparten el
// link por WhatsApp (docs/PROMPT-og-tenant.md). Es la vidriera del TALLER,
// no la nuestra: su color de fondo, su logo y su nombre. Acá no entra nada
// de Fidelli —ni el logo, ni el rojo, ni el nombre, ni el dominio escrito—
// igual que en la página: el que la recibe es cliente de otro.
//
// Se GENERA, no se diseña: un tenant nuevo tiene su tarjeta el día que se
// da de alta, con lo que ya cargó en /panel/experiencia. Es la misma forma
// que app/blog/[slug]/opengraph-image.tsx (ImageResponse de next/og, Nunito
// desde el archivo del repo), pero dinámica: los tenants nacen todos los
// días y no hay generateStaticParams. Con `revalidate` de un día alcanza:
// si el taller cambia el color o el logo, la tarjeta nueva aparece al día
// siguiente —antes, si el panel revalida `/[slug]` en modo layout, como ya
// hace al guardar— y WhatsApp igual cachea la suya por su cuenta.
//
// Un slug que no existe da la tarjeta neutra, nunca un error: la imagen de
// una página que se comparte no puede ser un 404.
//
// El alt es uno solo y genérico: la convención de archivo no admite uno por
// tenant sin cambiar la URL, y el nombre ya va en og:title.
export const alt = "Tarjeta con el nombre y el logo del taller";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";
// Node y no edge: el logo se convierte con sharp, que es nativo.
export const runtime = "nodejs";
export const revalidate = 86400;

// Vacío a propósito: no se pre-renderiza ningún tenant en el build (nacen
// todos los días), pero sin esta función Next trata el segmento dinámico
// como una ruta de petición —cada vista previa de WhatsApp la dibuja de
// nuevo e ignora `revalidate`—. Con ella, cada slug se genera la primera
// vez que lo piden y queda guardado un día (dynamicParams es true).
export async function generateStaticParams(): Promise<{ slug: string }[]> {
  return [];
}

type Fuentes = NonNullable<NonNullable<ConstructorParameters<typeof ImageResponse>[1]>["fonts"]>;

const NEUTRO = "#0A0A0A";
const BLANCO = "#FFFFFF";
// La bajada, textual. Es lo único que dice la tarjeta además del nombre.
const BAJADA = "Ingresá tu patente y mirá el historial de tu vehículo.";
const ALTO_LOGO = 140;
const ANCHO_LOGO_MAX = 420;
const PADDING_PLACA = 12;
// Nombre y bajada caben en 760 px: lo que queda a la izquierda de la tuerca.
const ANCHO_TEXTO = 760;

// El fondo es el color del tenant, plano. Si viene vacío o inválido,
// paletaTenant ya lo vuelve neutro; si es casi blanco, la placa blanca del
// logo desaparecería y la tarjeta sería una hoja en blanco: también neutro.
function fondoDe(colorPrimario: string | null | undefined): string {
  const { primary } = paletaTenant(colorPrimario);
  return luminancia(primary) >= 0.9 ? NEUTRO : primary;
}

// El logo, listo para satori: un PNG que entra en la placa, con su tamaño.
// Los logos del bucket vienen en PNG, JPG o WebP (NOMBRES en
// experiencia/actions.ts) y satori lee PNG y JPEG pero NO WebP: por sharp
// pasan los tres —convierte el WebP y achica un logo de 2 MB a lo que la
// placa necesita (el doble del tamaño final, para que no se vea blando)—,
// sin agrandar uno chico, que saldría borroso. Cualquier falla (no baja en
// 2 s, no es una imagen, el bucket no responde) devuelve null y la tarjeta
// sale igual, con las iniciales.
type LogoListo = { src: string; width: number; height: number };

async function logoParaLaTarjeta(url: string | null): Promise<LogoListo | null> {
  if (!url) return null;
  try {
    const respuesta = await fetch(url, { signal: AbortSignal.timeout(2000) });
    if (!respuesta.ok) return null;
    const original = Buffer.from(await respuesta.arrayBuffer());
    const { data, info } = await sharp(original)
      .resize({
        width: ANCHO_LOGO_MAX * 2,
        height: ALTO_LOGO * 2,
        fit: "inside",
        withoutEnlargement: true,
      })
      .png()
      .toBuffer({ resolveWithObject: true });
    const escala = Math.min(ALTO_LOGO / info.height, ANCHO_LOGO_MAX / info.width, 1);
    return {
      src: `data:image/png;base64,${data.toString("base64")}`,
      width: Math.round(info.width * escala),
      height: Math.round(info.height * escala),
    };
  } catch {
    return null;
  }
}

// El monograma de respaldo: dos letras del nombre, sin los conectores
// («Falco Lubricantes y Servicios» → FL, «Lubricentro San Martín» → LS).
// Con una sola palabra, sus dos primeras letras.
const CONECTORES = new Set(["y", "e", "de", "del", "la", "el", "los", "las", "&"]);

function iniciales(nombre: string): string {
  const palabras = nombre.trim().split(/\s+/).filter((p) => !CONECTORES.has(p.toLowerCase()));
  const base = palabras.length ? palabras : nombre.trim().split(/\s+/);
  const letras = base.length >= 2 ? base[0][0] + base[1][0] : base[0].slice(0, 2);
  return letras.toUpperCase();
}

// El detalle del rubro: una tuerca hexagonal, grande, cortada por el borde
// derecho, en el color del texto a baja opacidad. Es textura, no
// ilustración: se intuye, no se lee. Una sola, la misma para todos.
function Tuerca({ tinta }: { tinta: string }) {
  return (
    <svg
      width="420"
      height="420"
      viewBox="0 0 420 420"
      style={{ position: "absolute", right: -110, top: 105, opacity: 0.09 }}
    >
      <path
        fill={tinta}
        fillRule="evenodd"
        d="M210 10 L383.2 110 L383.2 310 L210 410 L36.8 310 L36.8 110 Z M210 115 A95 95 0 1 0 210 305 A95 95 0 1 0 210 115 Z"
      />
    </svg>
  );
}

export default async function TarjetaTenant({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const lubricentro = await obtenerLandingSinSesion(slug);

  // La misma Nunito 700 del blog y de la página (lib/blog/nunito-700.woff:
  // la de @fontsource/nunito, OFL, en WOFF porque satori no lee WOFF2). Las
  // rutas van como literales, no por una función: el trazado del build las
  // lee del código para empaquetar SOLO esos archivos con la ruta; con un
  // join dinámico avisa que traza el proyecto entero.
  const nunito700 = await readFile(path.join(process.cwd(), "lib", "blog", "nunito-700.woff"));
  const fuentes: Fuentes = [{ name: "Nunito", data: nunito700, weight: 700, style: "normal" }];

  if (!lubricentro) return tarjetaNeutra(fuentes);

  const fondo = fondoDe(lubricentro.colorPrimario);
  // La tinta sale de la misma función que decide el texto sobre el color
  // del tenant en toda la superficie del cliente: blanco sobre oscuro,
  // casi negro sobre claro.
  const tinta = paletaTenant(fondo).ink;
  const logo = await logoParaLaTarjeta(lubricentro.logoUrl);
  if (!logo) {
    const nunito800 = await readFile(path.join(process.cwd(), "lib", "cliente", "nunito-800.woff"));
    fuentes.push({ name: "Nunito", data: nunito800, weight: 800, style: "normal" });
  }

  // El nombre es lo más grande de la tarjeta: 72 px en hasta dos renglones.
  // Satori no mide antes de dibujar, así que el escalón a 56 px se decide
  // por largo (unos 18 caracteres por renglón a 72 px); lo que tampoco
  // entre en dos renglones a 56 px lo corta lineClamp con «…».
  const cuerpo = lubricentro.nombre.length > 34 ? 56 : 72;

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
          backgroundColor: fondo,
          color: tinta,
          fontFamily: "Nunito",
          position: "relative",
          overflow: "hidden",
        }}
      >
        <Tuerca tinta={tinta} />
        <Placa lubricentro={lubricentro} logo={logo} fondo={fondo} />
        <div style={{ display: "flex", flexDirection: "column", maxWidth: ANCHO_TEXTO }}>
          <div
            style={{
              display: "block",
              fontSize: cuerpo,
              fontWeight: 700,
              lineHeight: 1.05,
              letterSpacing: -1,
              lineClamp: 2,
            }}
          >
            {lubricentro.nombre}
          </div>
          <div
            style={{
              display: "flex",
              marginTop: 24,
              fontSize: 30,
              lineHeight: 1.3,
              opacity: 0.85,
              textWrap: "balance",
            }}
          >
            {BAJADA}
          </div>
        </div>
      </div>
    ),
    { ...size, fonts: fuentes },
  );
}

// La placa blanca, siempre: es más seguro que adivinar si el logo se lee
// sobre el color. Con logo, el logo sin deformar hasta 140 px de alto; sin
// logo, las iniciales en el color del tenant.
function Placa({
  lubricentro,
  logo,
  fondo,
}: {
  lubricentro: Lubricentro;
  logo: LogoListo | null;
  fondo: string;
}) {
  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        alignSelf: "flex-start",
        padding: PADDING_PLACA,
        borderRadius: 24,
        backgroundColor: BLANCO,
      }}
    >
      {logo ? (
        <img src={logo.src} width={logo.width} height={logo.height} alt="" />
      ) : (
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            width: ALTO_LOGO,
            height: ALTO_LOGO,
            fontSize: 72,
            fontWeight: 800,
            letterSpacing: -2,
            color: fondo,
          }}
        >
          {iniciales(lubricentro.nombre)}
        </div>
      )}
    </div>
  );
}

// Para un slug que no existe: fondo neutro, la tuerca y una frase genérica.
// Sin marca tampoco.
function tarjetaNeutra(fuentes: Fuentes) {
  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          backgroundColor: NEUTRO,
          color: BLANCO,
          fontFamily: "Nunito",
          fontSize: 64,
          fontWeight: 700,
          letterSpacing: -1,
          position: "relative",
          overflow: "hidden",
        }}
      >
        <Tuerca tinta={BLANCO} />
        Historial de tu auto
      </div>
    ),
    { ...size, fonts: fuentes },
  );
}

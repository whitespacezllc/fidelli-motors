import type { Metadata } from "next";
import QRCode from "qrcode";
import { createClient } from "@/lib/supabase/server";
import { SITIO_URL } from "@/lib/seo";
import { paletaTenant } from "@/lib/cliente/color";
import { EstadoVacio } from "@/components/ui/estado-vacio";
import { BotonImprimirCalcos } from "@/components/experiencia/boton-imprimir-calcos";

export const metadata: Metadata = { title: "Calcos QR" };

// La hoja de calcos: 9 por A4, cada uno al TAMAÑO REAL de 5×8 cm con
// marcas de corte. Es lo que cierra la promesa del plan Basic — sin
// calcos físicos, esta hoja es la única forma de que un cliente llegue a
// la página — y por eso está en LOS TRES planes: lo que diferencia a Pro
// y Ultra es el vinilo, no el archivo.
//
// ES UN DOCUMENTO: sale siempre claro, tenga el tema que tenga la página
// del tenant. Un papel oscuro gasta tinta y no es lo que nadie espera de
// un papel. El QR va en tinta sobre blanco SIEMPRE — el contraste del QR
// es lo que lo hace escaneable, y ahí no se negocia con la marca; la
// marca vive en la franja superior.
//
// Las medidas van en mm: en la impresión al 100% (sin "ajustar a la
// página") un mm de CSS es un mm de regla.

const CALCO_ANCHO = "50mm";
const CALCO_ALTO = "80mm";

export default async function PaginaCalcos() {
  const supabase = await createClient();

  const [lubriRes, configRes] = await Promise.all([
    supabase.from("lubricentros").select("slug, nombre").maybeSingle(),
    supabase
      .from("config_experiencia")
      .select("logo_url, color_primario")
      .maybeSingle(),
  ]);

  const lubri = lubriRes.data;
  if (!lubri) {
    return (
      <EstadoVacio
        titulo="No encontramos tu lubricentro"
        descripcion="Es un dato que se crea con tu cuenta. Escribinos por WhatsApp y lo resolvemos."
      />
    );
  }

  const paleta = paletaTenant(configRes.data?.color_primario);
  const logoUrl = configRes.data?.logo_url ?? null;
  const url = `${SITIO_URL}/${lubri.slug}`;

  // El QR se genera en el servidor, como SVG: nítido a cualquier tamaño
  // de impresión, sin mandarle una librería al navegador. Corrección M:
  // el estándar para un QR que se imprime chico y se escanea con cámara.
  const qrSvg = await QRCode.toString(url, {
    type: "svg",
    errorCorrectionLevel: "M",
    margin: 0,
    color: { dark: "#0A0A0A", light: "#FFFFFF" },
  });

  const calco = (
    <div
      className="flex flex-col overflow-hidden"
      style={{
        width: CALCO_ANCHO,
        height: CALCO_ALTO,
        border: "0.4mm dashed #B5B5B5",
        backgroundColor: "#FFFFFF",
      }}
    >
      {/* La franja de marca: el único lugar del calco con color. */}
      <div
        className="flex items-center justify-center gap-1.5 px-2"
        style={{ backgroundColor: paleta.primary, height: "13mm" }}
      >
        {logoUrl && (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={logoUrl}
            alt=""
            style={{ maxHeight: "8mm", maxWidth: "12mm", objectFit: "contain" }}
          />
        )}
        <p
          className="min-w-0 truncate text-center font-brand font-bold"
          style={{ color: paleta.ink, fontSize: "10pt", lineHeight: 1.15 }}
        >
          {lubri.nombre}
        </p>
      </div>

      {/* El QR: tinta sobre blanco, siempre. */}
      <div className="flex flex-1 flex-col items-center justify-center gap-2 px-3">
        <div
          className="calco-qr"
          style={{ width: "34mm", height: "34mm" }}
          dangerouslySetInnerHTML={{ __html: qrSvg }}
        />
        <p
          className="text-center font-brand font-bold"
          style={{ color: "#0A0A0A", fontSize: "10pt", lineHeight: 1.25 }}
        >
          Escaneá y mirá el historial de tu auto
        </p>
        <p
          className="text-center tabular-nums"
          style={{ color: "#4A4A4A", fontSize: "7.5pt" }}
        >
          fidellimotors.app/{lubri.slug}
        </p>
      </div>
    </div>
  );

  return (
    <div>
      {/* El aislamiento de impresión es de esta página y no del layout:
          se imprime SOLO la hoja, en A4 sin márgenes, con los colores
          exactos (la franja de marca no puede salir lavada). */}
      <style>{`
        @page { size: A4 portrait; margin: 0; }
        .calco-qr svg { width: 100%; height: 100%; display: block; }
        @media print {
          body * { visibility: hidden; }
          .hoja-calcos, .hoja-calcos * { visibility: visible; }
          .hoja-calcos {
            position: absolute;
            left: 0;
            top: 0;
            margin: 0;
            box-shadow: none;
            -webkit-print-color-adjust: exact;
            print-color-adjust: exact;
          }
        }
      `}</style>

      <div className="solo-pantalla mb-5 print:hidden">
        <h1 className="font-brand text-h3 font-bold text-ink">Calcos QR</h1>
        <p className="mt-1 max-w-2xl text-ui text-ink-60">
          Nueve calcos de 5&nbsp;×&nbsp;8&nbsp;cm, tamaño real. Imprimí al
          100% —sin &ldquo;ajustar a la página&rdquo;— y recortá por la línea
          de puntos. Si tenés papel autoadhesivo, mejor todavía.
        </p>
        <div className="mt-4">
          <BotonImprimirCalcos />
        </div>
      </div>

      {/* La hoja: A4 exacto. En pantalla se ve tal cual sale. */}
      <div
        className="hoja-calcos bg-white shadow-lg"
        style={{ width: "210mm", minHeight: "297mm", padding: "15mm" }}
      >
        <div
          className="grid justify-between"
          style={{
            gridTemplateColumns: `repeat(3, ${CALCO_ANCHO})`,
            rowGap: "8mm",
          }}
        >
          {Array.from({ length: 9 }, (_, i) => (
            <div key={i}>{calco}</div>
          ))}
        </div>
      </div>
    </div>
  );
}

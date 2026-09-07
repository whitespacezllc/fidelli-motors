import type { DatosDocumento } from "./documento-presupuesto";
import { formatearFecha } from "@/lib/fechas";
import { sumarDias } from "@/lib/fidelli/plan";
import { formatearPesos, totalDe } from "@/lib/presupuestos";

// El PDF se DIBUJA con jsPDF a partir de los datos, no se rasteriza el DOM.
// La rasterización (html-to-image) dependía de que el navegador pudiera
// embeber las fuentes y hojas de estilo de la página, y se colgaba en la
// práctica — era la falla del viejo "Mandar por WhatsApp". Dibujarlo da un
// PDF vectorial: texto seleccionable, pesa unos KB, y sale igual en
// cualquier teléfono. Reproduce el papel de DocumentoPresupuesto: grilla
// con bordes de tinta, banda del total en el color del tenant, cifras a la
// derecha. Cero rojo Fidelli: el documento es del lubricentro.

const MARGEN = 12;
const A4_ANCHO = 210;
const A4_ALTO = 297;
const X0 = MARGEN;
const X1 = A4_ANCHO - MARGEN;
const ANCHO = X1 - X0;
// El piso del área dibujable: lo que caiga más abajo iría a una hoja nueva.
const LIMITE = A4_ALTO - MARGEN;
// Alto de línea al envolver texto de cuerpo (9.5pt) en mm.
const LINEA = 4.6;

// La tinta y los grises del sistema, en RGB para jsPDF.
const TINTA: [number, number, number] = [10, 10, 10];
const GRIS: [number, number, number] = [90, 90, 90];
const GRIS_SUAVE: [number, number, number] = [140, 140, 140];

function hexARgb(hex: string): [number, number, number] {
  const h = hex.replace("#", "").trim();
  const n =
    h.length === 3
      ? h.split("").map((c) => c + c).join("")
      : h.padEnd(6, "0").slice(0, 6);
  return [
    parseInt(n.slice(0, 2), 16),
    parseInt(n.slice(2, 4), 16),
    parseInt(n.slice(4, 6), 16),
  ];
}

// El color del tenant al ~10% sobre blanco: el mismo peso visual que el
// bg-[var(--tn)]/10 de la banda del total en pantalla.
function mezclarConBlanco(rgb: [number, number, number], alpha: number): [number, number, number] {
  return rgb.map((c) => Math.round(255 * (1 - alpha) + c * alpha)) as [number, number, number];
}

// El logo llega como data URL (lo inlinea el server). Se pasa por un canvas
// a PNG: jsPDF mete PNG sin sorpresas, y el canvas es API nativa del
// navegador — nada que se cuelgue embebiendo estilos.
async function logoPng(
  dataUrl: string,
): Promise<{ png: string; ancho: number; alto: number } | null> {
  try {
    const img = new Image();
    img.crossOrigin = "anonymous";
    const cargada = new Promise<void>((res, rej) => {
      img.onload = () => res();
      img.onerror = () => rej(new Error("logo no cargó"));
      // Red de seguridad: si por lo que sea la imagen no dispara ni load ni
      // error, el PDF sale igual sin logo en vez de quedar colgado.
      setTimeout(() => rej(new Error("logo tardó demasiado")), 4000);
    });
    img.src = dataUrl;
    await cargada;
    // El logo se imprime a ~45mm de ancho: más de ~500px no aporta nitidez
    // y solo infla el PDF (un webp de 1300px salía como PNG de megas). Se
    // reescala a un techo razonable manteniendo la proporción.
    const TECHO = 500;
    const escala = Math.min(1, TECHO / img.naturalWidth);
    const ancho = Math.max(1, Math.round(img.naturalWidth * escala));
    const alto = Math.max(1, Math.round(img.naturalHeight * escala));
    const canvas = document.createElement("canvas");
    canvas.width = ancho;
    canvas.height = alto;
    const ctx = canvas.getContext("2d");
    if (!ctx) return null;
    ctx.drawImage(img, 0, 0, ancho, alto);
    return {
      png: canvas.toDataURL("image/png"),
      ancho,
      alto,
    };
  } catch {
    // Sin logo el papel se sostiene igual: la marca también está en el
    // nombre. Nunca es motivo para que el PDF no salga.
    return null;
  }
}

export async function generarPdfPresupuesto(datos: DatosDocumento): Promise<void> {
  const { jsPDF } = await import("jspdf");
  const pdf = new jsPDF({ orientation: "portrait", unit: "mm", format: "a4" });
  pdf.setFont("helvetica", "normal");

  const tenant = hexARgb(datos.colorTenant || "#0A0A0A");
  const papel: [number, number, number] | null = datos.colorPapel
    ? hexARgb(datos.colorPapel)
    : null;

  // El papel de color del tenant (color_carton, siempre claro por regla de
  // la app) se pinta a hoja completa, igual que en pantalla. Se repinta en
  // cada página nueva.
  function pintarFondo() {
    if (papel) {
      pdf.setFillColor(...papel);
      pdf.rect(0, 0, A4_ANCHO, A4_ALTO, "F");
    }
  }
  // El PDF pagina a mano: jsPDF no lo hace solo, y sin esto un presupuesto
  // largo (una mecánica con muchos renglones) se cortaba en el borde de la
  // hoja y se perdían el TOTAL y la letra chica. Antes de cada bloque se
  // pide el espacio; si no entra, hoja nueva.
  function saltarSiNoEntra(alto: number): boolean {
    if (y + alto > LIMITE) {
      pdf.addPage();
      pintarFondo();
      y = MARGEN + 2;
      return true;
    }
    return false;
  }

  pintarFondo();
  let y = MARGEN + 2;

  // ---- Cabecera: marca del lubricentro a la izquierda, número a la derecha.
  const logo = datos.logoUrl ? await logoPng(datos.logoUrl) : null;
  let yIzq = y;
  if (logo) {
    // Al topar por ancho hay que bajar el alto para conservar la proporción,
    // no dejarlo fijo: un wordmark horizontal quedaba aplastado. Igual que
    // el object-contain de la pantalla.
    const ALTO_MAX = 13;
    const ANCHO_MAX = 45;
    const ratio = logo.ancho / logo.alto;
    let altoLogo = ALTO_MAX;
    let anchoLogo = ratio * altoLogo;
    if (anchoLogo > ANCHO_MAX) {
      anchoLogo = ANCHO_MAX;
      altoLogo = anchoLogo / ratio;
    }
    pdf.addImage(logo.png, "PNG", X0, yIzq, anchoLogo, altoLogo);
    yIzq += altoLogo + 3;
  }
  // El nombre se acota al ancho libre a la izquierda del bloque "N°" y
  // envuelve en varias líneas si hace falta, en vez de cruzar el margen.
  pdf.setTextColor(...TINTA);
  pdf.setFont("helvetica", "bold");
  pdf.setFontSize(15);
  yIzq += 6;
  const nombreLineas = pdf.splitTextToSize(
    datos.lubricentroNombre,
    ANCHO - 46,
  ) as string[];
  nombreLineas.forEach((linea, i) => {
    pdf.text(linea, X0, yIzq + i * 6);
  });
  yIzq += (nombreLineas.length - 1) * 6;
  if (datos.sucursal) {
    yIzq += 5;
    pdf.setFont("helvetica", "normal");
    pdf.setFontSize(9);
    pdf.setTextColor(...GRIS);
    pdf.text(datos.sucursal, X0, yIzq);
  }

  // Bloque derecho: "PRESUPUESTO" + N°.
  pdf.setFont("helvetica", "bold");
  pdf.setFontSize(8);
  pdf.setTextColor(...GRIS);
  pdf.text("PRESUPUESTO", X1, y + 1, { align: "right", charSpace: 0.5 });
  pdf.setFontSize(20);
  pdf.setTextColor(...TINTA);
  pdf.text(`N° ${datos.numero}`, X1, y + 9, { align: "right" });

  y = Math.max(yIzq, y + 12) + 8;

  // ---- Grilla de datos, con bordes de tinta como el cartón.
  const hastaCuando =
    datos.validezDias != null
      ? formatearFecha(sumarDias(datos.fecha, datos.validezDias))
      : null;
  const destino = [
    datos.destinatarioNombre,
    datos.destinatarioTelefono,
    datos.destinatarioVehiculo,
  ]
    .filter(Boolean)
    .join(" · ");

  const filasDatos: [string, string][] = [
    ["FECHA", formatearFecha(datos.fecha)],
    ...(hastaCuando ? [["VÁLIDO HASTA", hastaCuando] as [string, string]] : []),
    ...(destino ? [["PARA", destino] as [string, string]] : []),
  ];
  const LABEL_ANCHO = 34;
  const ALTO_FILA = 8;
  const VALOR_ANCHO = ANCHO - LABEL_ANCHO - 5;
  pdf.setDrawColor(...TINTA);
  pdf.setLineWidth(0.4);
  filasDatos.forEach(([label, valor]) => {
    // Alto variable: un destinatario largo (nombre · teléfono · vehículo)
    // envuelve en varias líneas en vez de perderse. Fecha y validez entran
    // siempre en una.
    const lineas = pdf.splitTextToSize(valor, VALOR_ANCHO) as string[];
    const altoFila = Math.max(ALTO_FILA, lineas.length * LINEA + 3.5);
    pdf.rect(X0, y, ANCHO, altoFila);
    pdf.line(X0 + LABEL_ANCHO, y, X0 + LABEL_ANCHO, y + altoFila);
    pdf.setFont("helvetica", "bold");
    pdf.setFontSize(7.5);
    pdf.setTextColor(...GRIS);
    pdf.text(label, X0 + 2.5, y + altoFila / 2 + 1, { baseline: "middle" });
    pdf.setFont("helvetica", "normal");
    pdf.setFontSize(9.5);
    pdf.setTextColor(...TINTA);
    const yTexto =
      lineas.length === 1 ? y + altoFila / 2 + 1 : y + 5;
    pdf.text(lineas, X0 + LABEL_ANCHO + 2.5, yTexto, {
      baseline: lineas.length === 1 ? "middle" : "alphabetic",
    });
    y += altoFila;
  });

  // ---- Tabla de renglones. Cant. e Importe a la derecha, tabular.
  const CANT_ANCHO = 20;
  const IMPORTE_ANCHO = 32;
  const DETALLE_ANCHO = ANCHO - CANT_ANCHO - IMPORTE_ANCHO;
  const xCant = X0 + DETALLE_ANCHO;
  const xImporte = X0 + DETALLE_ANCHO + CANT_ANCHO;
  const ALTO_HEAD = 7;

  // El encabezado de la tabla se redibuja al empezar cada hoja nueva, para
  // que una tabla que sigue en la página 2 no aparezca sin títulos.
  function dibujarHeadTabla() {
    pdf.setFillColor(244, 244, 244);
    pdf.rect(X0, y, ANCHO, ALTO_HEAD, "F");
    pdf.setDrawColor(...TINTA);
    pdf.rect(X0, y, ANCHO, ALTO_HEAD);
    pdf.line(xCant, y, xCant, y + ALTO_HEAD);
    pdf.line(xImporte, y, xImporte, y + ALTO_HEAD);
    pdf.setFont("helvetica", "bold");
    pdf.setFontSize(7.5);
    pdf.setTextColor(...GRIS);
    pdf.text("DETALLE", X0 + 2.5, y + ALTO_HEAD / 2 + 1, { baseline: "middle" });
    pdf.text("CANT.", xCant + CANT_ANCHO - 2.5, y + ALTO_HEAD / 2 + 1, {
      baseline: "middle",
      align: "right",
    });
    pdf.text("IMPORTE", X1 - 2.5, y + ALTO_HEAD / 2 + 1, {
      baseline: "middle",
      align: "right",
    });
    y += ALTO_HEAD;
  }

  dibujarHeadTabla();

  // Filas de items — alto variable según cuántas líneas ocupe la descripción,
  // y con salto de página cuando una fila no entra en lo que queda de hoja.
  pdf.setFont("helvetica", "normal");
  pdf.setFontSize(9.5);
  datos.items.forEach((it) => {
    const descBase =
      it.cantidad !== 1
        ? `${it.descripcion}  — ${formatearPesos(it.precioUnitario)} c/u`
        : it.descripcion;
    const lineas = pdf.splitTextToSize(descBase, DETALLE_ANCHO - 5) as string[];
    const altoFila = Math.max(8, lineas.length * LINEA + 3);
    if (saltarSiNoEntra(altoFila)) dibujarHeadTabla();
    pdf.setDrawColor(...TINTA);
    pdf.rect(X0, y, ANCHO, altoFila);
    pdf.line(xCant, y, xCant, y + altoFila);
    pdf.line(xImporte, y, xImporte, y + altoFila);
    pdf.setFont("helvetica", "normal");
    pdf.setFontSize(9.5);
    pdf.setTextColor(...TINTA);
    pdf.text(lineas, X0 + 2.5, y + 5);
    pdf.setTextColor(...GRIS);
    pdf.text(String(it.cantidad), xCant + CANT_ANCHO - 2.5, y + 5, {
      align: "right",
    });
    pdf.setFont("helvetica", "bold");
    pdf.setTextColor(...TINTA);
    pdf.text(
      formatearPesos(it.cantidad * it.precioUnitario),
      X1 - 2.5,
      y + 5,
      { align: "right" },
    );
    y += altoFila;
  });

  // Banda del total, en el color del tenant. Bloque indivisible: si no entra
  // con un respiro para la nota legal, salta de página — el número más
  // importante del papel no puede quedar cortado ni huérfano.
  const ALTO_TOTAL = 10;
  saltarSiNoEntra(ALTO_TOTAL + 8);
  pdf.setFillColor(...mezclarConBlanco(tenant, 0.12));
  pdf.rect(X0, y, ANCHO, ALTO_TOTAL, "F");
  pdf.setDrawColor(...TINTA);
  pdf.rect(X0, y, ANCHO, ALTO_TOTAL);
  pdf.setFont("helvetica", "bold");
  pdf.setFontSize(8);
  pdf.setTextColor(...GRIS);
  pdf.text("TOTAL", X0 + 2.5, y + ALTO_TOTAL / 2 + 1, { baseline: "middle" });
  pdf.setFontSize(14);
  pdf.setTextColor(...TINTA);
  pdf.text(formatearPesos(totalDe(datos.items)), X1 - 2.5, y + ALTO_TOTAL / 2 + 1, {
    baseline: "middle",
    align: "right",
  });
  y += ALTO_TOTAL + 6;

  // Observaciones.
  if (datos.observaciones) {
    pdf.setFont("helvetica", "normal");
    pdf.setFontSize(9.5);
    pdf.setTextColor(...GRIS);
    const obs = pdf.splitTextToSize(datos.observaciones, ANCHO) as string[];
    saltarSiNoEntra(obs.length * LINEA + 4);
    pdf.text(obs, X0, y);
    y += obs.length * LINEA + 4;
  }

  // La letra chica que protege la frontera: esto NO es una factura.
  let legal =
    "Precios expresados en pesos argentinos. Documento no válido como factura.";
  if (datos.validezDias != null) {
    legal += ` Presupuesto válido por ${datos.validezDias} ${datos.validezDias === 1 ? "día" : "días"}.`;
  }
  pdf.setFontSize(8);
  pdf.setTextColor(...GRIS_SUAVE);
  const legalLineas = pdf.splitTextToSize(legal, ANCHO) as string[];
  saltarSiNoEntra(legalLineas.length * 4);
  pdf.text(legalLineas, X0, y);

  pdf.save(`presupuesto-${datos.numero}.pdf`);
}

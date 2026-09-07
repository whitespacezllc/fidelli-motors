import "server-only";

import writeXlsxFile from "write-excel-file/node";
import type { Cell } from "write-excel-file/node";
import { fechaCalendarioAR, hoyISO, ZONA_AR } from "@/lib/fechas";

// ============================================================
// El .xlsx de las exportaciones del panel — una sola manera de armarlo.
//
// Las tres exportaciones (clientes, productos, trabajos) pasan por acá
// para que el archivo sea el mismo objeto en las tres: cabecera en negrita
// sobre el rojo de marca, fila congelada, autofiltro, ancho de columna
// según el contenido con tope, fechas como fechas y números como números.
// Es .xlsx y no CSV a propósito: Excel en español abre los CSV con coma
// como una sola columna, y las tildes se rompen si el encoding no es
// exacto. Un xlsx real abre bien siempre.
//
// Sin fórmulas, sin macros, sin hojas ocultas: es un export, no un
// informe. Existe para que Bruno se lleve sus datos cuando quiera.
// ============================================================

// El rojo de marca en la cabecera es identidad del archivo, no estado.
const ROJO_MARCA = "#E01F26";
const BLANCO = "#FFFFFF";

// Ancho en caracteres. El tope evita que una observación larga estire una
// columna a media pantalla; el piso, que "Año" quede ilegible.
const ANCHO_MINIMO = 8;
const ANCHO_MAXIMO = 40;

const FORMATO_FECHA = "dd/mm/yyyy";
const FORMATO_FECHA_HORA = "dd/mm/yyyy hh:mm";

export type Celda = Cell;

export type Hoja = {
  nombre: string;
  cabecera: string[];
  filas: Celda[][];
};

// ---------- Celdas ----------
// Cada helper devuelve una celda vacía (null) cuando no hay dato. Es lo que
// garantiza que en el archivo nunca aparezca "null", "undefined" ni "NaN":
// el dato ausente es una celda en blanco, no una palabra.

export function texto(valor: string | null | undefined): Celda {
  const limpio = valor?.trim();
  return limpio ? { type: String, value: limpio } : null;
}

// Teléfono, CUIT, patente: texto declarado como texto (formato "@"), así
// Excel no convierte "3515550142" en 3.515.550.142 ni le come el 0 ni el
// +54 si alguien lo vuelve a editar.
export function textoLiteral(valor: string | null | undefined): Celda {
  const limpio = valor?.trim();
  return limpio ? { type: String, value: limpio, format: "@" } : null;
}

export function patente(valor: string | null | undefined): Celda {
  return textoLiteral(valor?.toUpperCase());
}

// Los numeric de Postgres pueden llegar como string según el driver; se
// aceptan las dos formas. Lo que no sea un número finito es celda vacía.
export function numero(valor: number | string | null | undefined): Celda {
  if (valor == null || valor === "") return null;
  const n = typeof valor === "number" ? valor : Number(valor);
  return Number.isFinite(n) ? { type: Number, value: n } : null;
}

export function siNo(valor: boolean | null | undefined): Celda {
  if (valor == null) return null;
  return { type: String, value: valor ? "Sí" : "No" };
}

// La librería serializa una Date por su instante UTC (getTime), así que una
// fecha-calendario se arma con Date.UTC de sus partes: el día que se ve en
// la celda es el de la base, corra el proceso en Buenos Aires o en Vercel.
// Si llega un instante (timestamptz), primero se reduce a su día argentino,
// igual que en lib/fechas.ts.
export function fecha(iso: string | null | undefined): Celda {
  if (!iso) return null;
  const dia = iso.includes("T") ? fechaCalendarioAR(new Date(iso)) : iso.slice(0, 10);
  const [anio, mes, d] = dia.split("-").map(Number);
  if (!anio || !mes || !d) return null;
  return {
    type: Date,
    value: new Date(Date.UTC(anio, mes - 1, d)),
    format: FORMATO_FECHA,
  };
}

// Un instante, mostrado en hora argentina: se descompone en la zona del
// negocio y se vuelve a armar como UTC para que la celda diga esa hora.
export function fechaHora(iso: string | null | undefined): Celda {
  if (!iso) return null;
  const instante = new Date(iso);
  if (Number.isNaN(instante.getTime())) return null;
  const partes = new Intl.DateTimeFormat("en-CA", {
    timeZone: ZONA_AR,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hourCycle: "h23",
  }).formatToParts(instante);
  const parte = (tipo: Intl.DateTimeFormatPartTypes) =>
    Number(partes.find((p) => p.type === tipo)?.value ?? 0);
  return {
    type: Date,
    value: new Date(
      Date.UTC(
        parte("year"),
        parte("month") - 1,
        parte("day"),
        parte("hour"),
        parte("minute"),
        parte("second"),
      ),
    ),
    format: FORMATO_FECHA_HORA,
  };
}

// ---------- El archivo ----------

// "lubricentro-manuel-trabajos-2026-09-07.xlsx". hoyISO y no toISOString:
// el nombre lleva el día del negocio, no el UTC.
export function nombreArchivo(slug: string, entidad: string, ahora = new Date()): string {
  return `${slug}-${entidad}-${hoyISO(ahora)}.xlsx`;
}

export async function generarXlsx(hojas: Hoja[]): Promise<Buffer> {
  const libro = hojas.map((hoja) => ({
    sheet: hoja.nombre,
    data: [hoja.cabecera.map(celdaCabecera), ...hoja.filas],
    columns: anchos(hoja),
    // La primera fila congelada: la cabecera acompaña al scroll.
    stickyRowsCount: 1,
  }));
  return writeXlsxFile(libro, { features: [autofiltro(hojas)] }).toBuffer();
}

function celdaCabecera(titulo: string): Celda {
  return {
    value: titulo,
    fontWeight: "bold",
    backgroundColor: ROJO_MARCA,
    textColor: BLANCO,
  };
}

// Cuántos caracteres "ocupa" una celda, para el ancho de su columna.
function largo(celda: Celda): number {
  if (celda == null) return 0;
  if (celda instanceof Date) return FORMATO_FECHA.length;
  if (typeof celda === "object" && ("value" in celda || "type" in celda)) {
    const { value, format } = celda as { value?: unknown; format?: string };
    if (value instanceof Date) return (format ?? FORMATO_FECHA).length;
    return value == null ? 0 : String(value).length;
  }
  return String(celda.valueOf()).length;
}

function anchos(hoja: Hoja): { width: number }[] {
  return hoja.cabecera.map((titulo, indice) => {
    let maximo = titulo.length;
    for (const fila of hoja.filas) {
      maximo = Math.max(maximo, largo(fila[indice]));
    }
    return { width: Math.min(ANCHO_MAXIMO, Math.max(ANCHO_MINIMO, maximo + 2)) };
  });
}

// "A", "B", …, "Z", "AA", "AB", … — la letra de la columna, base 0.
function letraColumna(indice: number): string {
  let n = indice + 1;
  let letras = "";
  while (n > 0) {
    const resto = (n - 1) % 26;
    letras = String.fromCharCode(65 + resto) + letras;
    n = Math.floor((n - 1) / 26);
  }
  return letras;
}

// ---------- Autofiltro ----------
// write-excel-file no trae autofiltro, pero expone `features`: funciones
// que transforman el XML de cada hoja antes de comprimir el archivo (así
// está hecha su propia fila congelada). Acá se inserta <autoFilter> justo
// después de </sheetData>, que es el lugar que le asigna el esquema de
// OOXML (CT_Worksheet: sheetData → … → autoFilter → mergeCells → …). La
// librería no genera ninguno de los elementos que van entre los dos, así
// que pegado a sheetData queda en orden y Excel no acusa archivo dañado.
type OpcionesLibro = NonNullable<Parameters<typeof writeXlsxFile>[1]>;
type Funcionalidad = NonNullable<OpcionesLibro["features"]>[number];

function autofiltro(hojas: Hoja[]): Funcionalidad {
  return {
    files: {
      transform: {
        "xl/worksheets/sheet{id}.xml": {
          transform(xml, _opcionesDeHoja, { sheetIndex }) {
            const hoja = hojas[sheetIndex];
            if (!hoja || hoja.cabecera.length === 0) return xml;
            const cierre = "</sheetData>";
            const corte = xml.indexOf(cierre);
            if (corte === -1) return xml;
            const fin = corte + cierre.length;
            const rango = `A1:${letraColumna(hoja.cabecera.length - 1)}${hoja.filas.length + 1}`;
            return `${xml.slice(0, fin)}<autoFilter ref="${rango}"/>${xml.slice(fin)}`;
          },
        },
      },
    },
  };
}

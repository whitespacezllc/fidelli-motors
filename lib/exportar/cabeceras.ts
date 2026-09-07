// Lo que el servidor le cuenta al botón sobre el archivo que acaba de armar.
// Viaja en cabeceras HTTP porque el cuerpo de la respuesta es el .xlsx: el
// botón las lee para el aviso ("Se descargó tal archivo (312 filas)") sin
// tener que adivinar nada. Vive aparte de respuesta.ts, que es server-only,
// porque el botón corre en el navegador.
export const CABECERA_ARCHIVO = "X-Exportar-Archivo";
export const CABECERA_FILAS = "X-Exportar-Filas";

export const MIME_XLSX =
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";

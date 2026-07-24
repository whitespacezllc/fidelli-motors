// Las fechas de Postgres (date) llegan como "2026-07-21". Pasarlas por
// new Date(iso) las interpreta en UTC y, al formatearlas en Argentina
// (UTC-3), muestran el día anterior. Por eso se arman con las partes.
function aFechaLocal(iso: string): Date {
  const [anio, mes, dia] = iso.slice(0, 10).split("-").map(Number);
  return new Date(anio, mes - 1, dia);
}

// 21/07/2026
export function formatearFecha(iso: string): string {
  return new Intl.DateTimeFormat("es-AR", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  }).format(aFechaLocal(iso));
}

// "may 2026" — para la antigüedad del cliente.
export function formatearMesAnio(iso: string): string {
  return new Intl.DateTimeFormat("es-AR", {
    month: "short",
    year: "numeric",
  })
    .format(aFechaLocal(iso))
    .replace(".", "");
}

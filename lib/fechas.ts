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

// "Lunes 21 de julio, 2026" — el encabezado del panel.
export function formatearDiaLargo(iso: string): string {
  const partes = new Intl.DateTimeFormat("es-AR", {
    weekday: "long",
    day: "numeric",
    month: "long",
    year: "numeric",
  }).formatToParts(aFechaLocal(iso));

  const dato = (tipo: string) => partes.find((p) => p.type === tipo)?.value ?? "";
  const dia = dato("weekday");
  return `${dia.charAt(0).toUpperCase()}${dia.slice(1)} ${dato("day")} de ${dato("month")}, ${dato("year")}`;
}

// "julio" — para el contexto de las métricas del mes.
export function nombreDelMes(iso: string): string {
  return new Intl.DateTimeFormat("es-AR", { month: "long" }).format(
    aFechaLocal(iso),
  );
}

// "Hoy 17:42" para los del día, "21/07 17:42" para el resto — como en el
// hi-fi. En 24 horas: el a. m./p. m. rompe la columna tabular.
export function formatearFechaHora(iso: string): string {
  const f = new Date(iso);
  const hora = new Intl.DateTimeFormat("es-AR", {
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).format(f);

  const ahora = new Date();
  const esHoy =
    f.getFullYear() === ahora.getFullYear() &&
    f.getMonth() === ahora.getMonth() &&
    f.getDate() === ahora.getDate();
  if (esHoy) return `Hoy ${hora}`;

  const dia = new Intl.DateTimeFormat("es-AR", {
    day: "2-digit",
    month: "2-digit",
  }).format(f);
  return `${dia} ${hora}`;
}

// "hoy" / "ayer" / "hace 5 días" — la columna de último service del panel
// de administración, donde lo que importa es si el lubri está trabajando,
// no la fecha exacta. Devuelve null si nunca cargó ninguno.
export function haceCuanto(iso: string | null): string | null {
  if (!iso) return null;

  const hoy = new Date();
  hoy.setHours(0, 0, 0, 0);
  const dias = Math.round(
    (hoy.getTime() - aFechaLocal(iso).getTime()) / 86_400_000,
  );

  if (dias <= 0) return "hoy";
  if (dias === 1) return "ayer";
  if (dias < 30) return `hace ${dias} días`;
  if (dias < 60) return "hace un mes";
  return `hace ${Math.floor(dias / 30)} meses`;
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

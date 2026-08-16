// ============================================================
// Fechas y horas — LA REGLA DE LAS DOS FAMILIAS
//
// El negocio vive en Argentina (UTC-3). El proceso Node NO: en Vercel
// corre en UTC, y acá no se asume nunca el reloj del proceso. Cada valor
// que entra es una de dos cosas, y cada familia tiene su tratamiento:
//
//   · FECHA-CALENDARIO ("2026-07-21", columna `date`): un día, sin hora
//     ni zona. Se parsea POR PARTES y se formatea SIN timeZone — el
//     roundtrip local↔local da el mismo día en cualquier TZ del proceso.
//     Ponerle timeZone acá es EL bug: new Date(2026, 6, 21) es la
//     medianoche del proceso, y formateada "en Argentina" desde un
//     proceso UTC da el día ANTERIOR.
//
//   · INSTANTE (timestamptz, ej. created_at): un punto en el tiempo.
//     Se formatea SIEMPRE con timeZone: ZONA_AR — sin eso, Intl usa la
//     TZ del proceso y en Vercel la hora sale +3.
//
// La base también quedó en hora argentina (migración
// 20260813120000_timezone_argentina): current_date y date_trunc cortan
// el día donde lo corta el negocio. Esta capa y aquella son la misma
// decisión contada en dos idiomas.
// ============================================================

export const ZONA_AR = "America/Argentina/Buenos_Aires";

// El día calendario ARGENTINO de un instante, como "2026-07-21".
// El locale en-CA formatea YYYY-MM-DD directo — sin formatToParts.
export function fechaCalendarioAR(instante: Date): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: ZONA_AR,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(instante);
}

// "Hoy" del negocio, no del servidor. El parámetro existe para poder
// probar la franja 21:00-24:00 sin esperar a la noche.
export function hoyISO(ahora: Date = new Date()): string {
  return fechaCalendarioAR(ahora);
}

// Un string de Postgres puede ser una fecha ("2026-07-21") o un instante
// ("2026-07-21T22:15:00+00:00"). Si trae hora, primero se lo reduce a su
// día calendario ARGENTINO; recién después se parsea por partes. Así un
// timestamptz que se cuele en un formateador de fechas muestra el día
// correcto en vez del día UTC.
function aFechaLocal(iso: string): Date {
  const soloDia = iso.includes("T") ? fechaCalendarioAR(new Date(iso)) : iso;
  const [anio, mes, dia] = soloDia.slice(0, 10).split("-").map(Number);
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

// "17:42", en hora argentina. En 24 horas: el a. m./p. m. rompe la
// columna tabular. Acepta Date porque varios llamadores ya tienen el
// instante parseado (desbloqueos, vencimientos).
export function formatearHora(instante: string | Date): string {
  const f = instante instanceof Date ? instante : new Date(instante);
  return new Intl.DateTimeFormat("es-AR", {
    timeZone: ZONA_AR,
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).format(f);
}

// "Hoy 17:42" para los del día, "21/07 17:42" para el resto — como en el
// hi-fi. "Hoy" es el día calendario ARGENTINO del instante contra el
// "hoy" del negocio: comparar getDate() contra getDate() del proceso era
// exactamente el bug de la hora corrida.
export function formatearFechaHora(iso: string): string {
  const f = new Date(iso);
  const hora = formatearHora(f);
  const calendario = fechaCalendarioAR(f);

  if (calendario === hoyISO()) return `Hoy ${hora}`;

  // El "21/07" sale del YYYY-MM-DD y no de Intl: es-AR ignora el 2-digit
  // del mes en este patrón ("10/1") y una cifra de un dígito desalinea la
  // columna tabular.
  const [, mes, dia] = calendario.split("-");
  return `${dia}/${mes} ${hora}`;
}

// Días de calendario entre dos fechas ISO ("a" anterior ⇒ positivo).
// Con Date.UTC es aritmética pura de calendario: inmune a la TZ del
// proceso y a cualquier horario de verano. Reemplaza a los cuatro
// `hoy.setHours(0,0,0,0)` que había repartidos por lib/.
export function diasEntre(desdeISO: string, hastaISO: string): number {
  const [a1, m1, d1] = desdeISO.slice(0, 10).split("-").map(Number);
  const [a2, m2, d2] = hastaISO.slice(0, 10).split("-").map(Number);
  return Math.round(
    (Date.UTC(a2, m2 - 1, d2) - Date.UTC(a1, m1 - 1, d1)) / 86_400_000,
  );
}

// "hoy" / "ayer" / "hace 5 días" — la columna de último service del panel
// de administración, donde lo que importa es si el lubri está trabajando,
// no la fecha exacta. Devuelve null si nunca cargó ninguno.
export function haceCuanto(iso: string | null): string | null {
  if (!iso) return null;

  // Si llega un instante, aFechaLocal ya lo reduce al día argentino; acá
  // alcanza con recortar el string para diasEntre.
  const dia = iso.includes("T")
    ? fechaCalendarioAR(new Date(iso))
    : iso.slice(0, 10);
  const dias = diasEntre(dia, hoyISO());

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

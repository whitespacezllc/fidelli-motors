// El estado de edición de la PATENTE de un vehículo, para MOSTRARLO. La
// regla la impone la base (trigger vehiculos_patente_inmutable): esto solo
// decide si el campo se ofrece editable y qué se explica al lado. Si el
// reloj del front miente, el guardado igual falla limpio del otro lado.
//
// Es el espejo de lib/servicios.ts para los services, con una diferencia
// que importa: la ventana se mide desde el PRIMER service no anulado, no
// desde el último. Si se midiera desde el último, cargar un service nuevo
// reabriría la ventana de un auto con años de historial.

import { ZONA_AR, diasEntre, fechaCalendarioAR, formatearHora, hoyISO } from "@/lib/fechas";

/** Las mismas 72 horas que aplica el trigger. Un solo número, un solo lugar. */
export const HORAS_PARA_CORREGIR_PATENTE = 72;

export type EstadoPatente =
  /** Sin services: la patente se edita como cualquier otro dato. */
  | { tipo: "libre" }
  /** Dentro de la ventana: editable, y se avisa hasta cuándo. */
  | { tipo: "ventana"; vence: Date }
  /** Pasada la ventana: solo la corrige Fidelli, con motivo. */
  | { tipo: "fija" };

export function estadoPatente(
  primerServiceCreatedAt: string | null,
): EstadoPatente {
  if (!primerServiceCreatedAt) return { tipo: "libre" };

  const vence = new Date(
    new Date(primerServiceCreatedAt).getTime() +
      HORAS_PARA_CORREGIR_PATENTE * 3_600_000,
  );

  return vence.getTime() > Date.now() ? { tipo: "ventana", vence } : { tipo: "fija" };
}

/** El campo se ofrece editable en los dos primeros estados. */
export function patenteEditable(estado: EstadoPatente): boolean {
  return estado.tipo !== "fija";
}

// "hasta mañana a las 14:30" · "hasta el jueves 3/8 a las 14:30".
// El plazo se dice en el idioma del mostrador: cuándo se cierra, no
// cuántas horas quedan — nadie calcula 72 horas de cabeza.
//
// Todo en calendario ARGENTINO: `vence` es un instante, y leerle
// getDate()/getMonth() con el reloj del proceso (UTC en Vercel) corría el
// vencimiento de día para cualquier ventana que cruce las 21:00.
export function vencimientoLegible(vence: Date): string {
  const hora = formatearHora(vence);
  const dias = diasEntre(hoyISO(), fechaCalendarioAR(vence));

  if (dias === 0) return `hoy a las ${hora}`;
  if (dias === 1) return `mañana a las ${hora}`;

  // El día se arma a mano: Intl con weekday+day+month devuelve "sábado 8-8",
  // con guión, y todo el resto del producto escribe las fechas con barra.
  const partes = new Intl.DateTimeFormat("es-AR", {
    timeZone: ZONA_AR,
    weekday: "long",
    day: "numeric",
    month: "numeric",
  }).formatToParts(vence);
  const dato = (tipo: string) => partes.find((p) => p.type === tipo)?.value ?? "";
  return `el ${dato("weekday")} ${dato("day")}/${dato("month")} a las ${hora}`;
}

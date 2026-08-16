import type { EstadoSuscripcion } from "@/lib/fidelli/plan";
import { diasEntre, hoyISO } from "@/lib/fechas";

// ============================================================
// La salud de un tenant responde UNA pregunta: ¿a quién tengo que
// prestarle atención hoy?
//
// Es el cruce de dos ejes con la suscripción mandando: si no está pagando,
// no importa cuántos services cargue —el problema es el cobro—. Recién
// cuando la plata está en orden la actividad pasa a ser la señal.
//
// Un tenant que paga y carga todos los días no necesita nada, y tiene que
// verse tranquilo: verde y callado. La pantalla no está para felicitarlo,
// está para que el ojo pase de largo.
// ============================================================

export type Salud = "cobro_vencido" | "al_dia" | "actividad_baja" | "sin_actividad";

// Los cortes de actividad, en días desde el último service.
const AL_DIA = 3;
const ACTIVIDAD_BAJA = 7;

export const ESTILO_SALUD: Record<
  Salud,
  { etiqueta: string; punto: string; texto: string }
> = {
  // Nunca el rojo de marca: esto es estado. Ámbar oscuro para lo que
  // duele, ámbar claro para lo que avisa, verde para lo que está bien.
  cobro_vencido: {
    etiqueta: "Cobro vencido",
    punto: "bg-overdue",
    texto: "text-overdue",
  },
  sin_actividad: {
    etiqueta: "Sin actividad",
    punto: "bg-overdue",
    texto: "text-overdue",
  },
  actividad_baja: {
    etiqueta: "Actividad baja",
    punto: "bg-urgente",
    texto: "text-urgente",
  },
  al_dia: {
    etiqueta: "Al día",
    punto: "bg-success",
    texto: "text-ink-60",
  },
};

// Días de calendario ARGENTINO desde una fecha — no del calendario del
// proceso, que en Vercel corre en UTC.
function diasDesde(iso: string): number {
  return diasEntre(iso, hoyISO());
}

export function saludDe({
  estado,
  vencimiento,
  ultimoService,
}: {
  estado: EstadoSuscripcion | null;
  vencimiento: string | null;
  ultimoService: string | null;
}): Salud | null {
  // Un lubricentro cancelado no es trabajo de hoy: se fue.
  if (estado === "cancelada") return null;

  // La suscripción manda. Un trial terminado cae acá igual que un plan
  // impago: en los dos casos el producto se está usando sin que entre un
  // peso, y esa es la conversación que hay que tener antes que ninguna.
  if (vencimiento && diasDesde(vencimiento) > 0) return "cobro_vencido";

  // Con la plata en orden, la señal es si el lubricentro está trabajando.
  if (!ultimoService) return "sin_actividad";

  const dias = diasDesde(ultimoService);
  if (dias <= AL_DIA) return "al_dia";
  if (dias <= ACTIVIDAD_BAJA) return "actividad_baja";
  return "sin_actividad";
}

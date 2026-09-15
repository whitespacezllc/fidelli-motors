import type { ClaseVehiculo } from "@/lib/renglones";

// ============================================================
// La clase del vehículo: liviano o pesado.
//
// Se contesta UNA vez, en el alta, al lado de marca / modelo / año. Nunca
// en la carga del service: un camión es camión para siempre. Lo que hace
// es decidir qué viene desplegado en el cartón (los 11 de siempre o los
// 20 de camión); nunca decide qué existe — el "+" alcanza a todos.
//
// El tipo ClaseVehiculo y normalizarClase() viven en lib/renglones, que es
// quien los consume. Acá va lo del alta.
// ============================================================

// Marcas que en Argentina son camión o colectivo sin ambigüedad. Las que
// hacen las dos cosas (Mercedes-Benz, Iveco, Ford, Volvo, Renault) NO van
// acá: arrancan en Liviano y el mecánico corrige.
//
// Es una ayuda de UI, no una regla de negocio: por eso es una constante
// del front y no va a la base ni a marcas_vehiculo.
export const MARCAS_PESADAS = [
  "Scania",
  "DAF",
  "MAN",
  "Hino",
  "Agrale",
  "Kenworth",
  "Freightliner",
  "International",
  "Western Star",
];

// La pre-selección del alta. La marca es texto libre y el mecánico escribe
// "scania" o "SCANIA": se compara sin mayúsculas.
export function clasePorMarca(marca: string): ClaseVehiculo {
  const limpia = marca.trim().toLowerCase();
  return MARCAS_PESADAS.some((m) => m.toLowerCase() === limpia)
    ? "pesado"
    : "liviano";
}

export function esClaseVehiculo(valor: unknown): valor is ClaseVehiculo {
  return valor === "liviano" || valor === "pesado";
}

// Los dos botones del alta, en este orden. El detalle dice qué entra en
// cada uno: la moto es liviano (su cartón es el de siempre; el tipo se
// deriva de la chapa, no de acá).
export const CLASES: {
  valor: ClaseVehiculo;
  etiqueta: string;
  detalle: string;
}[] = [
  { valor: "liviano", etiqueta: "Liviano", detalle: "auto · camioneta · moto" },
  { valor: "pesado", etiqueta: "Pesado", detalle: "camión · colectivo" },
];

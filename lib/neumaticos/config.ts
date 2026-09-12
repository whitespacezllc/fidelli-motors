// ============================================================
// Los intervalos del módulo de gomería — el espejo tipado de
// config_neumaticos.
//
// Los rangos son los MISMOS que los CHECK de la tabla (20260912100100):
// la base es la garantía; esto es el mensaje en castellano antes de
// perder lo tipeado, y el min/max de cada input.
// ============================================================

export type ConfigNeumaticos = {
  km_rotacion: number;
  meses_rotacion: number;
  km_alineacion: number;
  meses_alineacion: number;
  km_reajuste: number;
  anios_antiguedad: number;
  mm_alerta: number;
  beneficio_km: number;
  beneficio_meses: number;
};

export type CampoConfigNeumaticos = {
  clave: keyof ConfigNeumaticos;
  etiqueta: string;
  ayuda: string;
  unidad: string;
  min: number;
  max: number;
  paso: number;
  decimal?: boolean;
  fueraDeRango: string;
  grupo: "retornos" | "recambio" | "beneficio";
};

export const CAMPOS_CONFIG_NEUMATICOS: readonly CampoConfigNeumaticos[] = [
  {
    clave: "km_rotacion",
    etiqueta: "Rotación y balanceo, cada",
    ayuda: "Desde la última colocación o rotación.",
    unidad: "km",
    min: 3000,
    max: 20000,
    paso: 500,
    fueraDeRango: "La rotación va entre 3.000 y 20.000 km.",
    grupo: "retornos",
  },
  {
    clave: "meses_rotacion",
    etiqueta: "o como mucho a los",
    ayuda: "Lo que pase primero: los km o los meses.",
    unidad: "meses",
    min: 1,
    max: 24,
    paso: 1,
    fueraDeRango: "Los meses de la rotación van de 1 a 24.",
    grupo: "retornos",
  },
  {
    clave: "km_alineacion",
    etiqueta: "Alineación, cada",
    ayuda: "Desde la última alineación (o desde la colocación, si nunca alineó acá).",
    unidad: "km",
    min: 3000,
    max: 30000,
    paso: 500,
    fueraDeRango: "La alineación va entre 3.000 y 30.000 km.",
    grupo: "retornos",
  },
  {
    clave: "meses_alineacion",
    etiqueta: "o como mucho a los",
    ayuda: "Lo que pase primero.",
    unidad: "meses",
    min: 3,
    max: 36,
    paso: 1,
    fueraDeRango: "Los meses de la alineación van de 3 a 36.",
    grupo: "retornos",
  },
  {
    clave: "km_reajuste",
    etiqueta: "Reajuste de tuercas, a los",
    ayuda: "Después de colocar una rueda. Se avisa solo dentro de los 15 días: más tarde ya no tiene sentido.",
    unidad: "km",
    min: 50,
    max: 500,
    paso: 50,
    fueraDeRango: "El reajuste va entre 50 y 500 km.",
    grupo: "retornos",
  },
  {
    clave: "anios_antiguedad",
    etiqueta: "Recambio por antigüedad, a los",
    ayuda: "Desde la fecha del DOT más viejo que tenga cargado el auto. Los fabricantes recomiendan 6.",
    unidad: "años",
    min: 3,
    max: 10,
    paso: 1,
    fueraDeRango: "La antigüedad va de 3 a 10 años.",
    grupo: "recambio",
  },
  {
    clave: "mm_alerta",
    etiqueta: "Aviso por desgaste, a",
    ayuda: "Profundidad de dibujo medida. El mínimo legal es 1,6 mm; a 3 conviene avisar.",
    unidad: "mm o menos",
    min: 1.6,
    max: 5,
    paso: 0.1,
    decimal: true,
    fueraDeRango: "El aviso por desgaste va entre 1,6 y 5 mm.",
    grupo: "recambio",
  },
  {
    clave: "beneficio_km",
    etiqueta: "Rotación y balanceo sin cargo hasta",
    ayuda: "Después de colocar dos o más cubiertas. Poné 0 si no lo das.",
    unidad: "km",
    min: 3000,
    max: 30000,
    paso: 500,
    fueraDeRango: "El beneficio va entre 3.000 y 30.000 km, o 0 para no darlo.",
    grupo: "beneficio",
  },
  {
    clave: "beneficio_meses",
    etiqueta: "o hasta los",
    ayuda: "Lo que pase primero.",
    unidad: "meses",
    min: 1,
    max: 24,
    paso: 1,
    fueraDeRango: "Los meses del beneficio van de 1 a 24.",
    grupo: "beneficio",
  },
] as const;

export const TITULO_GRUPO: Record<CampoConfigNeumaticos["grupo"], string> = {
  retornos: "Cuándo vuelve el auto",
  recambio: "Cuándo avisar el cambio de cubiertas",
  beneficio: "El beneficio de la compra",
};

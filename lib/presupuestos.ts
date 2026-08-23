// El único lugar del panel donde se formatea plata: los presupuestos.
// Los importes viven EN el presupuesto y en ningún otro módulo — si esta
// función se está importando desde services o productos, algo está mal.

const FORMATO = new Intl.NumberFormat("es-AR", {
  style: "currency",
  currency: "ARS",
  minimumFractionDigits: 0,
  maximumFractionDigits: 2,
});

export function formatearPesos(valor: number): string {
  return FORMATO.format(valor);
}

export type ItemPresupuesto = {
  descripcion: string;
  cantidad: number;
  precioUnitario: number;
};

export function totalDe(items: ItemPresupuesto[]): number {
  return items.reduce((suma, i) => suma + i.cantidad * i.precioUnitario, 0);
}

/** Validez sugerida del papel: una semana. Editable y borrable. */
export const VALIDEZ_SUGERIDA = 7;

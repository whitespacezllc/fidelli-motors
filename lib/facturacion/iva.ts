// ============================================================
// Facturación (Nivel 3) · El desglose de IVA — preview en el navegador
//
// ESPEJO de armar_comprobante_desde_presupuesto() en SQL (20261023120000).
// La base es la fuente de verdad y crea el borrador real; esto repite el
// cálculo SOLO para previsualizar en vivo mientras el taller mira la
// pantalla, sin escribir nada. Los dos tienen que dar el mismo número.
//
// La regla, idéntica a la base:
//   · La letra sale de tipoComprobantePara(emisor, receptor).
//   · En una Factura C no hay IVA: alícuota 0 en cada renglón.
//   · Si los precios del tenant son FINALES (IVA incluido), el neto se
//     saca dividiendo por (1 + alícuota/100); si son NETOS, el precio ya
//     es el neto.
//   · El redondeo es a 2 decimales en cada paso, como en SQL (round()).
// ============================================================
import {
  type Alicuota,
  type CondicionEmisor,
  type CondicionReceptor,
  type TipoComprobante,
  tipoComprobantePara,
} from "@/lib/facturacion/tipos";

export type RenglonEntrada = {
  descripcion: string;
  cantidad: number;
  /** El precio unitario tal como lo cargó el taller (final o neto). */
  precioUnitario: number;
};

export type RenglonDesglosado = RenglonEntrada & {
  alicuota: Alicuota;
  precioUnitarioNeto: number;
  importeNeto: number;
};

export type Desglose = {
  tipo: TipoComprobante;
  renglones: RenglonDesglosado[];
  netoGravado: number;
  exento: number;
  iva105: number;
  iva21: number;
  total: number;
};

export type OpcionesDesglose = {
  emisor: CondicionEmisor;
  receptor: CondicionReceptor;
  preciosIncluyenIva: boolean;
  /** La alícuota default del tenant para renglones sin alícuota propia. */
  alicuotaDefault: Alicuota;
};

const dosDecimales = (n: number): number => Math.round(n * 100) / 100;

/**
 * El desglose del comprobante. Devuelve null si el par emisor/receptor no
 * define una letra (no debería pasar con valores válidos).
 */
export function desglosarComprobante(
  renglones: RenglonEntrada[],
  opciones: OpcionesDesglose,
): Desglose | null {
  const tipo = tipoComprobantePara(opciones.emisor, opciones.receptor);
  if (!tipo) return null;

  const esC = tipo === "factura_c";
  let netoGravado = 0;
  let exento = 0;
  let iva105 = 0;
  let iva21 = 0;

  const desglosados: RenglonDesglosado[] = renglones.map((r) => {
    const alicuota: Alicuota = esC ? 0 : opciones.alicuotaDefault;
    const precioUnitarioNeto =
      opciones.preciosIncluyenIva && alicuota > 0
        ? dosDecimales(r.precioUnitario / (1 + alicuota / 100))
        : r.precioUnitario;
    const importeNeto = dosDecimales(precioUnitarioNeto * r.cantidad);

    if (alicuota === 0) {
      if (esC) netoGravado += importeNeto;
      else exento += importeNeto;
    } else {
      netoGravado += importeNeto;
      const iva = dosDecimales((importeNeto * alicuota) / 100);
      if (alicuota === 10.5) iva105 += iva;
      else iva21 += iva;
    }

    return { ...r, alicuota, precioUnitarioNeto, importeNeto };
  });

  const total = dosDecimales(netoGravado + exento + iva105 + iva21);

  return {
    tipo,
    renglones: desglosados,
    netoGravado: dosDecimales(netoGravado),
    exento: dosDecimales(exento),
    iva105: dosDecimales(iva105),
    iva21: dosDecimales(iva21),
    total,
  };
}

// ============================================================
// Facturación (Nivel 3) · La config fiscal del tenant, leída por el front
//
// Espejo de la fila de config_facturacion para la pantalla. La fuente de
// verdad y las validaciones viven en guardar_config_facturacion() (SQL);
// esto arma el objeto y los mensajes, como lib/datos-empresa.ts.
//
// El MODELO DE CREDENCIALES (delegación o certificado por tenant) queda para
// la rebanada 2: acá solo vive lo que no depende de esa decisión (punto de
// venta, modo de precios e IVA).
// ============================================================
import type { Alicuota } from "@/lib/facturacion/tipos";

export type ConfigFiscal = {
  puntoVenta: number | null;
  preciosIncluyenIva: boolean;
  alicuotaDefault: Alicuota;
};

export const CONFIG_FISCAL_VACIA: ConfigFiscal = {
  puntoVenta: null,
  preciosIncluyenIva: true,
  alicuotaDefault: 21,
};

const ALICUOTAS_VALIDAS: readonly number[] = [0, 10.5, 21];

export function configDesdeFila(
  fila:
    | {
        punto_venta: number | null;
        precios_incluyen_iva: boolean;
        iva_alicuota_default: number;
      }
    | null
    | undefined,
): ConfigFiscal {
  if (!fila) return CONFIG_FISCAL_VACIA;
  const alic = Number(fila.iva_alicuota_default);
  return {
    puntoVenta: fila.punto_venta,
    preciosIncluyenIva: fila.precios_incluyen_iva,
    alicuotaDefault: (ALICUOTAS_VALIDAS.includes(alic) ? alic : 21) as Alicuota,
  };
}

/** Las etiquetas del modo de precios, en su orden. */
export const MODOS_PRECIO: readonly { valor: "finales" | "netos"; nombre: string; ayuda: string }[] =
  [
    {
      valor: "finales",
      nombre: "Precios finales (IVA incluido)",
      ayuda: "Lo que cargás es lo que paga el cliente. El IVA se calcula hacia adentro.",
    },
    {
      valor: "netos",
      nombre: "Precios netos (sin IVA)",
      ayuda: "Lo que cargás es el neto. El IVA se suma encima al facturar.",
    },
  ];

/** Las alícuotas que se ofrecen como default del tenant. */
export const ALICUOTAS_OPCIONES: readonly { valor: Alicuota; nombre: string }[] = [
  { valor: 21, nombre: "21%" },
  { valor: 10.5, nombre: "10,5%" },
  { valor: 0, nombre: "0% (exento)" },
];

export type EstadoConfigFiscal = { error?: string; ok?: string };

/** Los rechazos de la puerta, dichos como en el resto del panel. */
export const MENSAJES_CONFIG_FISCAL: Record<string, string> = {
  punto_venta_invalido: "El punto de venta tiene que ser un número entre 1 y 99999.",
  alicuota_invalida: "Esa alícuota de IVA no está en la lista.",
  clave_desconocida: "Hubo un dato que no reconocimos. Recargá y probá de nuevo.",
};

/** Lee el formulario de config fiscal en lo que espera la puerta. */
export function leerConfigFiscal(formData: FormData): {
  punto_venta: number | null;
  precios_incluyen_iva: boolean;
  iva_alicuota_default: number;
} {
  const pvTexto = String(formData.get("punto_venta") ?? "").trim();
  const pv = pvTexto ? Number(pvTexto) : null;
  const alic = Number(formData.get("iva_alicuota_default") ?? 21);
  return {
    punto_venta: pv !== null && Number.isFinite(pv) ? pv : null,
    precios_incluyen_iva: String(formData.get("precios") ?? "finales") === "finales",
    iva_alicuota_default: ALICUOTAS_VALIDAS.includes(alic) ? alic : 21,
  };
}

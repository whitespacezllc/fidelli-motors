// ============================================================
// Pedidos de calcos: lo que comparten el panel del tenant y /fidelli.
//
// El pedido es `encargos_calcos` (20261003120000): nace sin pagar (lo que
// compra el tenant desde Mi cuenta → Calcos) o pagado (los incluidos del
// alta, que cargamos nosotros), y lo movemos hasta «entregado», que es el
// único estado que escribe en el libro de entregas (`pedidos_calcos`). Las
// reglas viven en la base; acá solo hay nombres y formatos.
//
// ⚠ ESTE MÓDULO LO IMPORTAN PANTALLAS DEL TENANT. Nada de lo que es costo
// entra acá: ni lo que nos cuesta imprimir, ni la ganancia, ni la unidad en
// la que cotiza una gráfica. Eso vive en lib/fidelli/calcos.ts, que el
// panel no importa. Lo vigila scripts/regresion-calcos-tenant.mjs.
// ============================================================
import { DIAS_DE_VIDA_DE_LA_ORDEN } from "@/lib/cresium/orden";

/**
 * La comisión de Cresium sobre lo acreditado: 0,8 % + IVA (21 %) = 0,968 %.
 * La base repite el número en `comision_cresium()`, que es la que lo congela
 * en `comision_estimada` al crear el encargo: cambian en el mismo commit
 * (lo compara scripts/regresion-calcos.mjs).
 */
export const COMISION_CRESIUM = 0.00968;

export const ESTADOS_ENCARGO = [
  "pendiente_pago",
  "pagado",
  "en_produccion",
  "enviado",
  "listo_retiro",
  "entregado",
  "vencido",
  "cancelado",
] as const;

export type EstadoEncargo = (typeof ESTADOS_ENCARGO)[number];
export type EntregaCalcos = "retiro" | "envio";

export function esEstadoEncargo(v: unknown): v is EstadoEncargo {
  return (ESTADOS_ENCARGO as readonly string[]).includes(String(v));
}

const ENTERO = new Intl.NumberFormat("es-AR", { maximumFractionDigits: 0 });

/** «1.000»: una cantidad de calcos, con punto de miles. */
export function cantidadDeCalcos(n: number): string {
  return ENTERO.format(n);
}

/** «#0012»: el número del pedido, como se lo nombra por WhatsApp. */
export function numeroDeEncargo(numero: number): string {
  return `#${String(numero).padStart(4, "0")}`;
}

/** «400 calcos · rediseño · envío a domicilio». */
export function queLleva(e: {
  cantidad: number;
  incluido: boolean;
  rediseno: boolean;
  entrega: EntregaCalcos;
}): string {
  return [
    `${ENTERO.format(e.cantidad)} calcos`,
    e.incluido ? "incluidos en el plan" : null,
    e.rediseno ? "rediseño" : null,
    e.entrega === "envio" ? "envío a domicilio" : "retiro",
  ]
    .filter(Boolean)
    .join(" · ");
}

// ============================================================
// Lo que se le promete al tenant (decisión 7 del sprint). Un solo lugar:
// lo dicen la pantalla, el éxito del pago y los dos mails.
// ============================================================

/** Cuántos días tiene para pagar: los que vive la cuenta en Cresium. */
export const DIAS_PARA_PAGAR = DIAS_DE_VIDA_DE_LA_ORDEN;

export const TIEMPO_DE_PRODUCCION = "3 a 5 días hábiles";
export const TIEMPO_DE_ENVIO = "2 a 5 días hábiles";

/**
 * El estado que hay que creerle a un pedido, que no siempre es el que quedó
 * escrito: el que vence a los pedidos sin pagar es el cierre diario, una vez
 * por día, así que entre el día 7 y el próximo cierre la fila sigue diciendo
 * `pendiente_pago` con la cuenta de Cresium ya muerta. Mismo criterio que
 * `estadoEfectivo()` de las órdenes.
 */
export function estadoDelPedido(
  estado: EstadoEncargo,
  createdAt: string,
  ahora: Date = new Date(),
): EstadoEncargo {
  if (estado !== "pendiente_pago") return estado;
  const limite = new Date(createdAt).getTime() + DIAS_PARA_PAGAR * 86_400_000;
  return ahora.getTime() >= limite ? "vencido" : "pendiente_pago";
}

/** Pagados que todavía no llegaron: lo que el tenant tiene «en camino». */
export const ESTADOS_EN_CAMINO: readonly EstadoEncargo[] = [
  "pagado",
  "en_produccion",
  "enviado",
  "listo_retiro",
];

/** Cómo se le dice cada estado AL TENANT, con el seguimiento si lo hay. */
export function estadoParaElTenant(e: {
  estado: EstadoEncargo;
  transportista: string | null;
  seguimiento: string | null;
}): string {
  switch (e.estado) {
    case "pendiente_pago":
      return "Esperando tu pago";
    case "pagado":
      return "Pagado";
    case "en_produccion":
      return "En producción";
    case "enviado":
      return ["En camino", [e.transportista, e.seguimiento].filter(Boolean).join(" ")]
        .filter(Boolean)
        .join(" · ");
    case "listo_retiro":
      return "Listo para retirar · te escribimos por WhatsApp";
    case "entregado":
      return "Entregado";
    case "vencido":
      return "Venció sin pagarse";
    case "cancelado":
      return "Cancelado";
  }
}

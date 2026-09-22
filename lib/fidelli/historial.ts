import type { Database } from "@/lib/database.types";
import { formatearFecha } from "@/lib/fechas";
import { ETIQUETA_PERIODO, pesos, porcentaje, type Periodo } from "@/lib/fidelli/plan";
import {
  ETIQUETA_ORIGEN,
  esMotivoSuspension,
  esOrigenTenant,
  type MotivoSuspension,
} from "@/lib/fidelli/eventos";

// ============================================================
// El historial de un tenant, leído por una persona.
//
// `tenant_eventos` guarda lo que pasó como datos (docs/METRICAS.md § 3);
// esto lo convierte en una oración por evento: «Suspendido por falta de
// pago», «Cambió de Basic a Pro», «Pago de ARS 49.000 · Cresium». No
// consulta nada: recibe la fila con el nombre del actor ya resuelto.
// ============================================================

export type TipoEvento = Database["public"]["Enums"]["tipo_evento_tenant"];

export type EventoHistorial = {
  id: string;
  tipo: TipoEvento;
  ocurrido_at: string;
  antes: unknown;
  despues: unknown;
  motivo: string | null;
  origen_evento: string;
  /** El nombre del autor, si se pudo resolver (actor, o el `registrado_por`
   *  / `cambiado_por` que el backfill dejó adentro de `despues`). */
  actorNombre: string | null;
};

export type LineaHistorial = {
  titulo: string;
  detalle: string | null;
  actor: string;
};

type Obj = Record<string, unknown>;

function obj(v: unknown): Obj {
  return v && typeof v === "object" && !Array.isArray(v) ? (v as Obj) : {};
}

function texto(v: unknown): string | null {
  if (v == null) return null;
  const s = String(v).trim();
  return s ? s : null;
}

function numero(v: unknown): number | null {
  if (v == null || v === "") return null;
  const n = Number(v);
  return Number.isNaN(n) ? null : n;
}

function periodoLegible(v: unknown): string {
  return typeof v === "string" && v in ETIQUETA_PERIODO
    ? ETIQUETA_PERIODO[v as Periodo].toLowerCase()
    : String(v ?? "");
}

// El motivo de una suspensión viaja como «falta_de_pago» o
// «otro · el detalle que escribió el superadmin».
function partirMotivo(motivo: string | null): { clave: MotivoSuspension | null; detalle: string | null } {
  if (!motivo) return { clave: null, detalle: null };
  const [primero, ...resto] = motivo.split(" · ");
  const clave = esMotivoSuspension(primero) ? primero : null;
  const detalle = clave ? texto(resto.join(" · ")) : texto(motivo);
  return { clave, detalle };
}

const TITULO_SUSPENSION: Record<MotivoSuspension, string> = {
  falta_de_pago: "Suspendido por falta de pago",
  pedido_del_cliente: "Suspendido a pedido del cliente",
  cierre_del_negocio: "Suspendido: cerró el negocio",
  otro: "Suspendido",
};

// El único módulo pago del catálogo (lib/planes.ts · MODULOS_PAGOS), con
// el nombre que se usa en las pantallas.
const NOMBRE_MODULO: Record<string, string> = { neumaticos: "gomería" };

function nombreModulo(codigo: unknown): string {
  const c = String(codigo ?? "");
  return NOMBRE_MODULO[c] ?? c;
}

// «Módulo gomería · pago · 12/09/2026 …» → «pago» / «bonificado».
function formaDelModulo(motivo: string | null): string | null {
  const m = motivo?.match(/·\s*(pago|bonificado)\s*·/);
  return m ? m[1] : null;
}

export function actorDe(e: EventoHistorial): string {
  if (e.origen_evento === "webhook") return "Cresium";
  return e.actorNombre ?? "Sistema";
}

export function describirEvento(e: EventoHistorial): LineaHistorial {
  const antes = obj(e.antes);
  const despues = obj(e.despues);
  const actor = actorDe(e);

  switch (e.tipo) {
    case "alta": {
      const plan = texto(despues.plan);
      const desc = numero(despues.descuento_pct) ?? 0;
      const detalle = plan
        ? `Plan ${plan} · ${periodoLegible(despues.periodo)}${desc > 0 ? ` · −${porcentaje(desc)}` : ""}`
        : "Sin suscripción al momento del alta";
      return { titulo: "Alta del lubricentro", detalle, actor };
    }

    case "suspension": {
      const { clave, detalle } = partirMotivo(e.motivo);
      return {
        titulo: clave ? TITULO_SUSPENSION[clave] : "Suspendido",
        detalle,
        actor,
      };
    }

    case "reactivacion":
      return { titulo: "Reactivado", detalle: null, actor };

    case "suspension_reloj":
      return {
        titulo: "Suspendido por el reloj de cobranza",
        detalle: "Pasó la gracia sin pago y la suspensión automática estaba prendida.",
        actor,
      };

    case "reactivacion_reloj":
      return {
        titulo: "Reactivado por el reloj de cobranza",
        detalle: "El pago entró y el reloj lo dejó volver.",
        actor,
      };

    case "cambio_plan": {
      const partes: string[] = [];
      if (texto(antes.plan) !== texto(despues.plan)) {
        partes.push(`Cambió de ${texto(antes.plan) ?? "sin plan"} a ${texto(despues.plan) ?? "sin plan"}`);
      }
      if (antes.periodo !== despues.periodo) {
        partes.push(`Pasó de ${periodoLegible(antes.periodo)} a ${periodoLegible(despues.periodo)}`);
      }
      const dAntes = numero(antes.descuento_pct) ?? 0;
      const dDespues = numero(despues.descuento_pct) ?? 0;
      if (dAntes !== dDespues) {
        partes.push(`Descuento de ${porcentaje(dAntes)} a ${porcentaje(dDespues)}`);
      }
      return {
        titulo: partes[0] ?? "Cambio de plan",
        detalle: partes.length > 1 ? partes.slice(1).join(" · ") : null,
        actor,
      };
    }

    case "pago": {
      const monto = numero(despues.monto);
      const origen = texto(despues.origen) === "cresium" ? "Cresium" : "manual";
      const desde = texto(despues.periodo_desde);
      const hasta = texto(despues.periodo_hasta);
      const fecha = texto(despues.fecha_pago);
      const detalle = [
        desde && hasta ? `Período ${formatearFecha(desde)} → ${formatearFecha(hasta)}` : null,
        fecha ? `pagado el ${formatearFecha(fecha)}` : null,
      ]
        .filter(Boolean)
        .join(" · ");
      return {
        titulo: `Pago de ${monto != null ? pesos(monto) : "—"} · ${origen}`,
        detalle: detalle || null,
        actor,
      };
    }

    case "modulo_activado": {
      const forma = formaDelModulo(e.motivo);
      return {
        titulo: `Módulo ${nombreModulo(despues.modulo)} activado${forma ? ` · ${forma}` : ""}`,
        detalle: texto(e.motivo),
        actor,
      };
    }

    case "modulo_desactivado":
      return {
        titulo: `Módulo ${nombreModulo(despues.modulo)} desactivado`,
        detalle: texto(e.motivo),
        actor,
      };

    case "reloj_encendido": {
      const desde = texto(despues.cobranza_desde);
      return {
        titulo: "Reloj de cobranza encendido",
        detalle: desde ? `Cobra desde el ${formatearFecha(desde)}` : null,
        actor,
      };
    }

    case "reloj_apagado":
      return { titulo: "Reloj de cobranza apagado", detalle: "Fuera del reloj: sin avisos ni suspensión automática.", actor };

    case "calcos":
      return {
        titulo: `Calcos entregadas: ${numero(antes.calcos_entregadas) ?? 0} → ${numero(despues.calcos_entregadas) ?? 0}`,
        detalle: (numero(despues.calcos_entregadas) ?? 0) > 0 ? "El slug quedó cerrado." : null,
        actor,
      };

    case "edicion": {
      const partes: string[] = [];
      if (texto(antes.nombre) !== texto(despues.nombre)) {
        partes.push(`Cambió el nombre de «${texto(antes.nombre) ?? ""}» a «${texto(despues.nombre) ?? ""}»`);
      }
      if (texto(antes.slug) !== texto(despues.slug)) {
        partes.push(`Cambió el slug de /${texto(antes.slug) ?? ""} a /${texto(despues.slug) ?? ""}`);
      }
      return {
        titulo: partes[0] ?? "Edición de la marca",
        detalle: partes.length > 1 ? partes.slice(1).join(" · ") : null,
        actor,
      };
    }

    case "origen": {
      const o = texto(despues.origen);
      const etiqueta = o && esOrigenTenant(o) ? ETIQUETA_ORIGEN[o] : (o ?? "sin cargar");
      return {
        titulo: `Origen: ${etiqueta}`,
        detalle: texto(despues.origen_detalle),
        actor,
      };
    }
  }

  // Un tipo que el enum agregó después de escribir esto: se muestra crudo
  // antes que esconderlo.
  return { titulo: String(e.tipo), detalle: texto(e.motivo), actor };
}

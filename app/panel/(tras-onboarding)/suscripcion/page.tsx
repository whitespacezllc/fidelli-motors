import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { obtenerSesion } from "@/lib/auth/session";
import { createClient } from "@/lib/supabase/server";
import { CabeceraSeccion } from "@/components/panel/cabecera-seccion";
import {
  PantallaPago,
  type DatosPago,
  type Renglon,
} from "@/components/suscripcion/pantalla-pago";
import { pesos, MESES_DEL_PERIODO, type Periodo } from "@/lib/fidelli/plan";
import { ETIQUETA_MODULO, MODULOS_PAGOS } from "@/lib/planes";

export const metadata: Metadata = { title: "Tu suscripción" };

// La pantalla donde el cliente nos da plata. No se cachea: el estado de la
// transferencia cambia entre una carga y la siguiente, y esa es toda la
// gracia.
export const dynamic = "force-dynamic";

type MontoBase = {
  periodo: Periodo;
  meses: number;
  precio_mensual: number;
  off_periodo: number;
  descuento_pct: number;
  plan: number;
  modulo: number;
  total: number;
};

// El desglose, línea por línea, para que el número sea VERIFICABLE: el
// dueño tiene que poder seguir la cuenta con el dedo antes de transferir.
// Se arma desde lo que devolvió la BASE, nunca recalculando en el front —
// dos cuentas que tienen que dar lo mismo terminan dando distinto.
function renglones(m: MontoBase, nombreModulo: string | null): Renglon[] {
  const r: Renglon[] = [
    { clave: "Plan", valor: `${pesos(m.precio_mensual)} / mes` },
  ];

  const moduloMensual = m.meses > 0 && m.off_periodo < 100
    ? m.modulo / m.meses / (1 - m.off_periodo / 100)
    : 0;

  if (m.modulo > 0 && nombreModulo) {
    r.push({ clave: nombreModulo, valor: `${pesos(Math.round(moduloMensual))} / mes` });
  }

  if (m.meses > 1) {
    const bruto = m.precio_mensual * m.meses + Math.round(moduloMensual) * m.meses;
    r.push({ clave: `${m.meses} meses`, valor: pesos(Math.round(bruto)) });

    if (m.off_periodo > 0) {
      const ahorro = Math.round(bruto * (m.off_periodo / 100));
      r.push({
        clave: `Descuento por pago ${m.periodo} ${m.off_periodo}%`,
        valor: `−${pesos(ahorro)}`,
        descuento: true,
      });
    }
  }

  // El descuento propio del tenant va después del de período y se nombra
  // sin decir "founding": el dueño no sabe que le decimos así.
  if (m.descuento_pct > 0) {
    r.push({
      clave: `Tu descuento ${m.descuento_pct}%`,
      valor: `−${pesos(Math.round((m.plan / (1 - m.descuento_pct / 100)) * (m.descuento_pct / 100)))}`,
      descuento: true,
    });
  }

  r.push({ clave: "Total a transferir", valor: pesos(m.total), total: true });
  return r;
}

export default async function PaginaSuscripcion() {
  const sesion = await obtenerSesion();
  if (!sesion?.lubricentroId) redirect("/login");
  if (sesion.rol !== "owner") redirect("/fidelli");

  const supabase = await createClient();

  const [{ data: sub }, { data: orden }] = await Promise.all([
    supabase
      .from("suscripciones")
      .select("id, vencimiento, periodo, descuento_pct, planes(nombre)")
      .eq("lubricentro_id", sesion.lubricentroId)
      .order("inicio", { ascending: false })
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle(),
    supabase
      .from("cresium_ordenes")
      .select("alias, cvu, estado, monto, monto_pagado, periodo_hasta")
      .eq("lubricentro_id", sesion.lubricentroId)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle(),
  ]);

  if (!sub) {
    return (
      <div>
        <CabeceraSeccion titulo="Tu suscripción" />
        <p className="text-ui text-ink-60">
          No encontramos tu suscripción. Escribinos y lo resolvemos.
        </p>
      </div>
    );
  }

  // Un tenant con el 100% de descuento no paga nada: no se le muestra una
  // pantalla para transferir cero pesos.
  if (Number(sub.descuento_pct) >= 100) {
    return (
      <div>
        <CabeceraSeccion titulo="Tu suscripción" />
        <div className="surface-card px-5 py-6">
          <p className="font-brand text-lead font-bold">Tu plan está bonificado</p>
          <p className="mt-1 text-ui text-ink-60">
            No tenés nada que pagar. Si necesitás una factura o cambiar algo de tu plan,
            escribinos.
          </p>
        </div>
      </div>
    );
  }

  // El monto de CADA período, calculado por la base. Se piden los dos para
  // que tocar el selector no dispare una consulta: el dueño compara anual
  // contra mensual en el mismo instante en que lo está decidiendo.
  const montos = await Promise.all(
    (["anual", "mensual"] as const).map(async (p) => {
      const { data } = await supabase.rpc("monto_de_renovacion_en", {
        p_lubricentro: sesion.lubricentroId!,
        p_periodo: p,
      });
      return [p, data as MontoBase | null] as const;
    }),
  );

  const porPeriodo = Object.fromEntries(montos) as Record<Periodo, MontoBase | null>;

  const nombreModulo =
    porPeriodo.anual && porPeriodo.anual.modulo > 0
      ? ETIQUETA_MODULO[MODULOS_PAGOS[0]]
      : null;

  const mensualTotal = porPeriodo.mensual?.total ?? 0;

  const opciones: DatosPago["opciones"] = {
    mensual: porPeriodo.mensual
      ? { total: porPeriodo.mensual.total, ahorro: 0, renglones: renglones(porPeriodo.mensual, nombreModulo) }
      : null,
    semestral: null,
    anual: porPeriodo.anual
      ? {
          total: porPeriodo.anual.total,
          // El ahorro EN PESOS contra pagar mes a mes: es el número que
          // mueve la decisión. "25% off" no se siente; "ahorrás $222.000" sí.
          ahorro: Math.max(0, mensualTotal * MESES_DEL_PERIODO.anual - porPeriodo.anual.total),
          renglones: renglones(porPeriodo.anual, nombreModulo),
        }
      : null,
  };

  // ¿Ya está pagada? La orden en PAID es lo que dispara la pantalla de
  // éxito, y llega ahí por el webhook: el dueño ve cambiar la pantalla sin
  // tocar nada.
  const pagada = orden?.estado === "PAID";

  const datos: DatosPago = {
    plan: (sub.planes as { nombre?: string } | null)?.nombre ?? "—",
    modulos: nombreModulo ? [nombreModulo] : [],
    vencimiento: sub.vencimiento,
    opciones,
    orden:
      orden && !pagada
        ? {
            alias: orden.alias,
            cvu: orden.cvu,
            estado: orden.estado,
            montoPagado: Number(orden.monto_pagado),
            monto: Number(orden.monto),
            periodoHasta: orden.periodo_hasta,
          }
        : null,
    alDiaHasta: pagada ? sub.vencimiento : null,
    montoCobrado: pagada && orden ? Number(orden.monto_pagado) : null,
  };

  return (
    <div>
      <CabeceraSeccion titulo="Tu suscripción" />
      <div className="max-w-xl">
        <PantallaPago datos={datos} />
      </div>
    </div>
  );
}

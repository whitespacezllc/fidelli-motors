"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";

export type DatosIngreso = {
  sucursalId: string;
  fecha: string;
  monto: number;
  concepto: string;
  /** Si el ingreso nace de un presupuesto cobrado. */
  presupuestoId?: string | null;
  clienteId?: string | null;
};

export type ResultadoIngreso = { error?: string; id?: string };

function traducir(error: { code?: string; message?: string }): string {
  if (error.code === "42501") {
    return "Finanzas no está activo en tu cuenta. Escribinos si lo querés activar.";
  }
  if (/ingreso_sin_concepto/.test(error.message ?? "")) {
    return "Escribí qué entró, aunque sea en dos palabras.";
  }
  if (/ingreso_monto_invalido/.test(error.message ?? "")) {
    return "Revisá el monto: tiene que ser 0 o más.";
  }
  // El único parcial: un presupuesto ya cobrado no se cobra de nuevo.
  if (/ingresos_presupuesto_unico_idx|duplicate key/.test(error.message ?? "")) {
    return "Este presupuesto ya figura como cobrado.";
  }
  if (/fetch|network|conexión/i.test(error.message ?? "")) {
    return "Se cortó la conexión. Probá de nuevo cuando vuelva la señal.";
  }
  return "No se pudo guardar el ingreso. Probá de nuevo.";
}

function validar(datos: DatosIngreso): string | null {
  if (!datos.sucursalId) return "Elegí la sucursal.";
  if (datos.concepto.trim().length < 2) return "Escribí qué entró, aunque sea en dos palabras.";
  if (!Number.isFinite(datos.monto) || datos.monto < 0) {
    return "Revisá el monto: tiene que ser 0 o más.";
  }
  return null;
}

export async function crearIngreso(
  _prev: ResultadoIngreso,
  datos: DatosIngreso,
): Promise<ResultadoIngreso> {
  const error = validar(datos);
  if (error) return { error };

  const supabase = await createClient();
  const { data, error: err } = await supabase.rpc("guardar_ingreso", {
    p_sucursal_id: datos.sucursalId,
    p_monto: datos.monto,
    p_concepto: datos.concepto.trim(),
    p_fecha: datos.fecha,
    p_presupuesto_id: datos.presupuestoId ?? undefined,
    p_cliente_id: datos.clienteId ?? undefined,
  });

  if (err) return { error: traducir(err) };

  revalidatePath("/panel/finanzas");
  return { id: data as string };
}

// "Marcar como cobrado" desde un presupuesto: nace un ingreso con el total,
// la sucursal y el concepto derivados del presupuesto en el SERVIDOR — el
// cliente solo manda el id. El único parcial de `ingresos` evita cobrarlo
// dos veces. No toca el presupuesto: sigue sin ser un comprobante.
export async function marcarPresupuestoCobrado(
  presupuestoId: string,
): Promise<ResultadoIngreso> {
  const supabase = await createClient();

  const { data: p } = await supabase
    .from("presupuestos")
    .select(
      "id, numero, sucursal_id, destinatario_nombre, cliente_id, presupuesto_items(cantidad, precio_unitario)",
    )
    .eq("id", presupuestoId)
    .maybeSingle();

  if (!p) return { error: "No encontramos ese presupuesto." };

  const total = (p.presupuesto_items ?? []).reduce(
    (s, i) => s + Number(i.cantidad) * Number(i.precio_unitario),
    0,
  );
  const concepto = `Presupuesto N° ${p.numero}${
    p.destinatario_nombre ? ` — ${p.destinatario_nombre}` : ""
  }`;

  const { data, error: err } = await supabase.rpc("guardar_ingreso", {
    p_sucursal_id: p.sucursal_id,
    p_monto: total,
    p_concepto: concepto,
    p_presupuesto_id: p.id,
    p_cliente_id: p.cliente_id ?? undefined,
  });

  if (err) return { error: traducir(err) };

  revalidatePath("/panel/finanzas");
  revalidatePath(`/panel/presupuestos/${presupuestoId}`);
  return { id: data as string };
}

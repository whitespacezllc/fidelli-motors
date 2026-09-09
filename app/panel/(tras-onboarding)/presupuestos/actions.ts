"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { sesionParaEscribir } from "@/lib/auth/session";

export type DatosPresupuesto = {
  sucursalId: string;
  fecha: string;
  validezDias: number | null;
  observaciones: string | null;
  destinatarioNombre: string | null;
  destinatarioTelefono: string | null;
  destinatarioVehiculo: string | null;
  clienteId: string | null;
  vehiculoId: string | null;
  items: { descripcion: string; cantidad: number; precioUnitario: number }[];
};

export type ResultadoPresupuesto = { error?: string; id?: string };

function traducir(error: { code?: string; message?: string }): string {
  if (error.code === "42501") {
    return "Los presupuestos no están en tu plan. Escribinos si los querés activar.";
  }
  if (/presupuesto_sin_renglones/.test(error.message ?? "")) {
    return "Cargá al menos un renglón con descripción.";
  }
  if (/presupuesto_no_editable/.test(error.message ?? "")) {
    return "No se pudo editar este presupuesto. Recargá la pantalla.";
  }
  if (/fetch|network|conexión/i.test(error.message ?? "")) {
    return "Se cortó la conexión. No cierres esta pantalla: lo que cargaste sigue acá. Cuando vuelva la señal, tocá Guardar de nuevo.";
  }
  return "No se pudo guardar el presupuesto. Probá de nuevo.";
}

function validar(datos: DatosPresupuesto): string | null {
  if (!datos.sucursalId) return "Elegí la sucursal.";
  const conTexto = datos.items.filter((i) => i.descripcion.trim().length >= 2);
  if (conTexto.length === 0) return "Cargá al menos un renglón con descripción.";
  if (conTexto.some((i) => !Number.isFinite(i.precioUnitario) || i.precioUnitario < 0)) {
    return "Revisá los precios: tienen que ser 0 o más.";
  }
  if (conTexto.some((i) => !Number.isFinite(i.cantidad) || i.cantidad <= 0)) {
    return "Revisá las cantidades: tienen que ser mayores a 0.";
  }
  return null;
}

function aItemsJson(datos: DatosPresupuesto) {
  return datos.items
    .filter((i) => i.descripcion.trim().length >= 2)
    .map((i) => ({
      descripcion: i.descripcion.trim(),
      cantidad: i.cantidad,
      precio_unitario: i.precioUnitario,
    }));
}

// La feature la hace cumplir la BASE (plan_permite en las policies); acá
// el error llega con palabras en vez de un 42501 crudo.
export async function crearPresupuesto(
  _prev: ResultadoPresupuesto,
  datos: DatosPresupuesto,
): Promise<ResultadoPresupuesto> {
  await sesionParaEscribir();

  const invalido = validar(datos);
  if (invalido) return { error: invalido };

  const supabase = await createClient();
  const { data, error } = await supabase.rpc("guardar_presupuesto", {
    p_sucursal_id: datos.sucursalId,
    p_items: aItemsJson(datos),
    p_fecha: datos.fecha,
    p_validez_dias: datos.validezDias ?? undefined,
    p_observaciones: datos.observaciones ?? undefined,
    p_destinatario_nombre: datos.destinatarioNombre ?? undefined,
    p_destinatario_telefono: datos.destinatarioTelefono ?? undefined,
    p_destinatario_vehiculo: datos.destinatarioVehiculo ?? undefined,
    p_cliente_id: datos.clienteId ?? undefined,
    p_vehiculo_id: datos.vehiculoId ?? undefined,
  });

  if (error) return { error: traducir(error) };

  revalidatePath("/panel/presupuestos");
  return { id: data as string };
}

export async function editarPresupuesto(
  _prev: ResultadoPresupuesto,
  datos: DatosPresupuesto & { id: string },
): Promise<ResultadoPresupuesto> {
  await sesionParaEscribir();

  const invalido = validar(datos);
  if (invalido) return { error: invalido };

  const supabase = await createClient();
  const { error } = await supabase.rpc("actualizar_presupuesto", {
    p_id: datos.id,
    p_sucursal_id: datos.sucursalId,
    p_items: aItemsJson(datos),
    p_fecha: datos.fecha,
    p_validez_dias: datos.validezDias ?? undefined,
    p_observaciones: datos.observaciones ?? undefined,
    p_destinatario_nombre: datos.destinatarioNombre ?? undefined,
    p_destinatario_telefono: datos.destinatarioTelefono ?? undefined,
    p_destinatario_vehiculo: datos.destinatarioVehiculo ?? undefined,
    p_cliente_id: datos.clienteId ?? undefined,
    p_vehiculo_id: datos.vehiculoId ?? undefined,
  });

  if (error) return { error: traducir(error) };

  revalidatePath("/panel/presupuestos");
  revalidatePath(`/panel/presupuestos/${datos.id}`);
  return { id: datos.id };
}

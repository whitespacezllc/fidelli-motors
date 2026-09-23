"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { obtenerSesion } from "@/lib/auth/session";
import {
  esCanalPauta,
  esMotivoPerdida,
  esOrigenMeta,
  type CanalPauta,
} from "@/lib/fidelli/pauta";

// ============================================================
// Las acciones de /fidelli/pauta. Cada una es una llamada a su función de
// la base (20260924101000): la validación fuerte vive allá, acá se leen
// los campos, se traduce el error y se revalida la ruta.
//
// Todas revalidan /fidelli/pauta y el Resumen (la línea de pauta cambia
// con cada contacto). El cierre revalida además el listado y la ficha del
// tenant: le puede haber fijado el origen.
// ============================================================

export type EstadoAccionPauta = { ok?: boolean; error?: string };

async function exigirSuperadmin() {
  const sesion = await obtenerSesion();
  if (!sesion) redirect("/login");
  if (sesion.rol !== "superadmin") redirect("/panel");
  return sesion;
}

const MENSAJES: Record<string, string> = {
  fecha_futura: "La fecha del primer mensaje no puede ser posterior a hoy.",
  no_existe_tenant: "Ese lubricentro ya no existe. Recargá la pantalla.",
  no_existe: "Ese contacto ya no existe. Recargá la pantalla.",
  tenant_vacio: "Elegí qué lubricentro cerró.",
  contacto_cerrado: "Este contacto ya cerró. Reabrilo antes de marcarlo perdido.",
  semana_no_es_lunes: "El gasto va por semana: la fecha tiene que ser un lunes.",
  monto_negativo: "El gasto no puede ser negativo.",
  fechas_desde_el_contacto: "Esa fecha es anterior al primer mensaje del contacto.",
  cierre_o_perdida: "Un contacto no puede estar cerrado y perdido a la vez. Reabrilo primero.",
};

function traducir(mensaje: string): string {
  if (/fetch|network|conexión|ECONNREFUSED/i.test(mensaje)) {
    return "Se cortó la conexión a internet. No cierres esta pantalla: lo que cargaste sigue acá. Cuando vuelva la señal, probá de nuevo.";
  }
  for (const [clave, texto] of Object.entries(MENSAJES)) {
    if (mensaje.includes(clave)) return texto;
  }
  return "No se pudo guardar. Probá de nuevo en un momento.";
}

function revalidar(lubricentroId?: string | null) {
  revalidatePath("/fidelli/pauta");
  revalidatePath("/fidelli");
  if (lubricentroId) {
    revalidatePath("/fidelli/lubricentros");
    revalidatePath(`/fidelli/${lubricentroId}`);
  }
}

// ---------- El alta del contacto: tres toques ----------
export async function registrarContacto(
  _prev: EstadoAccionPauta,
  formData: FormData,
): Promise<EstadoAccionPauta> {
  await exigirSuperadmin();

  const canal = String(formData.get("canal") ?? "meta");
  const origen = String(formData.get("origen") ?? "");
  const fecha = String(formData.get("fecha") ?? "").trim();
  const telefono = String(formData.get("telefono") ?? "").trim();

  if (!esCanalPauta(canal)) return { error: "Elegí el canal." };
  if (!/^\d{4}-\d{2}-\d{2}$/.test(fecha)) return { error: "Poné la fecha del primer mensaje." };

  const supabase = await createClient();
  const { error } = await supabase.rpc("registrar_contacto_pauta", {
    p_fecha: fecha,
    p_canal: canal,
    p_origen: canal === "meta" && esOrigenMeta(origen) ? origen : undefined,
    p_telefono: telefono || undefined,
  });
  if (error) return { error: traducir(error.message) };

  revalidar();
  return { ok: true };
}

export async function marcarDemoContacto(id: string): Promise<EstadoAccionPauta> {
  await exigirSuperadmin();
  const supabase = await createClient();
  const { error } = await supabase.rpc("marcar_demo", { p_id: id });
  if (error) return { error: traducir(error.message) };
  revalidar();
  return { ok: true };
}

export async function marcarCierreContacto(
  _prev: EstadoAccionPauta,
  formData: FormData,
): Promise<EstadoAccionPauta> {
  await exigirSuperadmin();

  const id = String(formData.get("id") ?? "");
  const lubricentroId = String(formData.get("lubricentro_id") ?? "");
  const fecha = String(formData.get("fecha") ?? "").trim();
  if (!lubricentroId) return { error: MENSAJES.tenant_vacio };

  const supabase = await createClient();
  const { error } = await supabase.rpc("marcar_cierre", {
    p_id: id,
    p_fecha: /^\d{4}-\d{2}-\d{2}$/.test(fecha) ? fecha : undefined,
    p_lubricentro_id: lubricentroId,
  });
  if (error) return { error: traducir(error.message) };

  revalidar(lubricentroId);
  return { ok: true };
}

export async function marcarPerdidaContacto(
  _prev: EstadoAccionPauta,
  formData: FormData,
): Promise<EstadoAccionPauta> {
  await exigirSuperadmin();

  const id = String(formData.get("id") ?? "");
  const motivo = String(formData.get("motivo") ?? "");
  const fecha = String(formData.get("fecha") ?? "").trim();

  const supabase = await createClient();
  const { error } = await supabase.rpc("marcar_perdida", {
    p_id: id,
    p_fecha: /^\d{4}-\d{2}-\d{2}$/.test(fecha) ? fecha : undefined,
    p_motivo: esMotivoPerdida(motivo) ? motivo : undefined,
  });
  if (error) return { error: traducir(error.message) };

  revalidar();
  return { ok: true };
}

export async function reabrirContacto(id: string): Promise<EstadoAccionPauta> {
  await exigirSuperadmin();
  const supabase = await createClient();
  const { error } = await supabase.rpc("reabrir_contacto_pauta", { p_id: id });
  if (error) return { error: traducir(error.message) };
  revalidar();
  return { ok: true };
}

// ---------- El gasto: un upsert por (lunes, canal); vacío borra ----------
export async function guardarGasto(
  semana: string,
  canal: CanalPauta,
  monto: number | null,
): Promise<EstadoAccionPauta> {
  await exigirSuperadmin();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(semana)) return { error: MENSAJES.semana_no_es_lunes };
  if (monto !== null && (!Number.isFinite(monto) || monto < 0)) {
    return { error: MENSAJES.monto_negativo };
  }

  const supabase = await createClient();
  // Sin monto (vacío) la puerta borra la fila: el parámetro se omite y el
  // default null de la función hace el resto.
  const { error } = await supabase.rpc("fijar_gasto_pauta", {
    p_semana: semana,
    p_canal: canal,
    ...(monto === null ? {} : { p_monto_usd: monto }),
  });
  if (error) return { error: traducir(error.message) };

  revalidar();
  return { ok: true };
}

"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { sesionParaEscribir, featureHabilitada } from "@/lib/auth/session";

export type EstadoPendienteForm = { error?: string; ok?: boolean };

const SIN_PLAN =
  "Los trabajos pendientes no están en tu plan. Escribinos si los querés activar.";

// La feature se chequea acá con mensaje propio (estas acciones viven en
// dialogs de la ficha, no en una sección con BloqueoPlan) y la hace
// cumplir la BASE: la policy de trabajos_pendientes exige
// plan_permite('pendientes') en el with check.
function refrescar() {
  revalidatePath("/panel/clientes");
  revalidatePath("/panel/proximos");
  revalidatePath("/panel");
}

export async function crearPendiente(
  _prev: EstadoPendienteForm,
  datos: {
    vehiculoId: string;
    descripcion: string;
    objetivoFecha: string | null;
    objetivoKm: number | null;
    visibleCliente: boolean;
  },
): Promise<EstadoPendienteForm> {
  const sesion = await sesionParaEscribir();
  if (!featureHabilitada(sesion, "pendientes")) return { error: SIN_PLAN };

  const descripcion = datos.descripcion.trim();
  if (descripcion.length < 5) {
    return { error: "Contá qué quedó por hacer: mínimo 5 caracteres." };
  }
  if (!datos.objetivoFecha && !datos.objetivoKm) {
    return {
      error: "Ponele una fecha o kilómetros: es lo que dispara el aviso para llamarlo.",
    };
  }

  const supabase = await createClient();
  const { error } = await supabase.from("trabajos_pendientes").insert({
    lubricentro_id: sesion.lubricentroId,
    vehiculo_id: datos.vehiculoId,
    usuario_id: sesion.usuarioId,
    descripcion,
    objetivo_fecha: datos.objetivoFecha,
    objetivo_km: datos.objetivoKm,
    visible_cliente: datos.visibleCliente,
  });

  if (error) {
    if (error.code === "42501") return { error: SIN_PLAN };
    return { error: "No se pudo guardar el pendiente. Probá de nuevo." };
  }

  refrescar();
  return { ok: true };
}

// Resolver y descartar cierran el pendiente; descartado NO se borra —
// "no lo hizo" es un dato. La base exige resuelto_en en los dos cierres.
export async function cerrarPendiente(
  id: string,
  como: "resuelto" | "descartado",
): Promise<EstadoPendienteForm> {
  const sesion = await sesionParaEscribir();
  if (!featureHabilitada(sesion, "pendientes")) return { error: SIN_PLAN };

  const supabase = await createClient();
  const { error } = await supabase
    .from("trabajos_pendientes")
    .update({ estado: como, resuelto_en: new Date().toISOString() })
    .eq("id", id)
    .eq("estado", "pendiente");

  if (error) {
    if (error.code === "42501") return { error: SIN_PLAN };
    return { error: "No se pudo cerrar el pendiente. Probá de nuevo." };
  }

  refrescar();
  return { ok: true };
}

export async function alternarVisiblePendiente(
  id: string,
  visible: boolean,
): Promise<EstadoPendienteForm> {
  const sesion = await sesionParaEscribir();
  if (!featureHabilitada(sesion, "pendientes")) return { error: SIN_PLAN };

  const supabase = await createClient();
  const { error } = await supabase
    .from("trabajos_pendientes")
    .update({ visible_cliente: visible })
    .eq("id", id);

  if (error) {
    if (error.code === "42501") return { error: SIN_PLAN };
    return { error: "No se pudo cambiar la visibilidad. Probá de nuevo." };
  }

  refrescar();
  return { ok: true };
}

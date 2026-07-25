"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { obtenerSesion } from "@/lib/auth/session";
import type { CategoriaProducto } from "@/lib/categorias";

export type ItemCargado = {
  tipo: string;
  producto_id: string | null;
  detalle: string | null;
};

export type PayloadService = {
  vehiculoId: string;
  sucursalId: string;
  fecha: string;
  kilometros: number;
  aceiteTipo: string;
  aceiteProductoId: string | null;
  aceiteNombre: string | null;
  proxServiceKm: number;
  observaciones: string | null;
  items: ItemCargado[];
  /** El toggle del cartón. El canje se registra al confirmar, no después. */
  canjearPremio?: boolean;
};

export type ResultadoGuardado = { error?: string; serviceId?: string };

// El corte de conexión no pierde nada: la acción devuelve el error, el
// formulario queda montado con todo lo cargado y el mecánico reintenta.
const SIN_CONEXION =
  "Se cortó la conexión a internet. No cierres ni recargues esta pantalla: los datos que cargaste siguen acá. Cuando vuelva la señal, tocá Confirmar de nuevo.";

// Entre que se pintó el cartón y se confirmó pudo cambiar la meta del
// programa (las reglas aplican a todos al instante) o entrar otro service
// del mismo auto. El service no se guarda a medias: la transacción vuelve
// entera y el mecánico decide de nuevo.
const PREMIO_YA_NO =
  "Este vehículo ya no tiene un premio disponible: puede que haya cambiado la meta del programa. Destildá “Aplicar premio” y confirmá de nuevo.";

function traducirError(error: { code?: string; message?: string }): string {
  if (/premio_no_disponible/.test(error.message ?? "")) return PREMIO_YA_NO;
  if (/fetch|network|conexión/i.test(error.message ?? "")) return SIN_CONEXION;
  if (error.code === "23514") {
    return "Algún dato quedó fuera de rango. Revisá los kilómetros y el próximo service.";
  }
  return "No se pudo guardar el service. No cierres esta pantalla y probá de nuevo.";
}

export async function guardarService(
  payload: PayloadService,
): Promise<ResultadoGuardado> {
  const sesion = await obtenerSesion();
  if (!sesion?.lubricentroId) redirect("/login");

  if (!payload.sucursalId) return { error: "Elegí la sucursal donde se hizo." };
  if (!Number.isFinite(payload.kilometros) || payload.kilometros < 0) {
    return { error: "Cargá los kilómetros del odómetro." };
  }
  if (payload.aceiteTipo.trim().length < 2) {
    return { error: "Cargá la viscosidad del aceite de motor." };
  }
  if (payload.proxServiceKm <= payload.kilometros) {
    return {
      error: "El próximo service tiene que ser mayor a los kilómetros de hoy.",
    };
  }

  const supabase = await createClient();
  // El guardado va por la función de la base: service y renglones se
  // escriben en una sola transacción.
  const { data, error } = await supabase.rpc("guardar_service", {
    p_vehiculo_id: payload.vehiculoId,
    p_sucursal_id: payload.sucursalId,
    p_fecha: payload.fecha,
    p_kilometros: payload.kilometros,
    p_aceite_tipo: payload.aceiteTipo,
    p_prox_service_km: payload.proxServiceKm,
    p_items: payload.items,
    p_aceite_producto_id: payload.aceiteProductoId ?? undefined,
    p_aceite_nombre: payload.aceiteNombre ?? undefined,
    p_observaciones: payload.observaciones ?? undefined,
    p_canjear_premio: payload.canjearPremio ?? false,
  });

  if (error) return { error: traducirError(error) };

  revalidatePath(`/panel/clientes`);
  revalidatePath("/panel/fidelizacion");
  return { serviceId: data as string };
}

export type ProductoNuevo = { error?: string; id?: string; nombre?: string };

// "Producto fuera de catálogo": se carga sin salir del cartón. El catálogo
// crece usándose.
export async function crearProductoRapido(
  categoria: CategoriaProducto,
  nombre: string,
  marca: string,
): Promise<ProductoNuevo> {
  const sesion = await obtenerSesion();
  if (!sesion?.lubricentroId) redirect("/login");

  const limpio = nombre.trim();
  if (limpio.length < 2) {
    return { error: "El nombre del producto necesita al menos 2 caracteres." };
  }

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("productos")
    .insert({
      lubricentro_id: sesion.lubricentroId,
      categoria,
      nombre: limpio,
      marca: marca.trim() || null,
    })
    .select("id, nombre, marca")
    .single();

  if (error) {
    if (error.code === "23505") return { error: "Ya tenés ese producto en el catálogo." };
    return { error: "No se pudo agregar el producto. Probá de nuevo." };
  }

  revalidatePath("/panel/productos");
  return {
    id: data.id,
    nombre: [data.nombre, data.marca].filter(Boolean).join(" · "),
  };
}

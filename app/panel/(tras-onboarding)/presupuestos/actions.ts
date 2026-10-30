"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { sesionParaEscribir } from "@/lib/auth/session";
import { CUIT_FORMATO, normalizarCuit } from "@/lib/cuit";
import { esPatenteValida, PATENTE_FORMATO } from "@/lib/texto";
import { hoyISO } from "@/lib/fechas";
import { esClaseVehiculo } from "@/lib/clase-vehiculo";

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

// ============================================================
// Vincular / crear el cliente + auto DESDE el presupuesto.
//
// Mismo destino que el alta de trabajo (las MISMAS RPC), pero estas acciones
// DEVUELVEN los ids en vez de redirigir: el selector del presupuesto los
// toma y los deja seteados en el formulario, que después los guarda con
// guardar_presupuesto. Así un presupuesto nace atado a un cliente y a su
// auto, y de ahí fluye al trabajo y a finanzas.
// ============================================================

export type ResultadoAltaDesdePresupuesto = {
  error?: string;
  clienteId?: string;
  vehiculoId?: string;
};

const DUPLICADO = "23505";
const CHECK_INVALIDO = "23514";

function traducirAlta(error: { code?: string; message?: string }): string {
  if (error.code === DUPLICADO) return "Ya tenés un vehículo con esa patente.";
  if (error.code === CHECK_INVALIDO) return PATENTE_FORMATO;
  if (/fetch|network|conexión/i.test(error.message ?? "")) {
    return "Se cortó la conexión. No cierres esta pantalla: lo que cargaste sigue acá.";
  }
  return "No se pudo guardar. Probá de nuevo en un momento.";
}

// Lee los campos del auto de un FormData, igual que el alta de trabajo.
function leerVehiculo(formData: FormData) {
  const patente = String(formData.get("patente") ?? "").trim();
  const marca = String(formData.get("marca") ?? "").trim() || null;
  const modelo = String(formData.get("modelo") ?? "").trim() || null;
  const anioTexto = String(formData.get("anio") ?? "").trim();
  const claseTexto = formData.get("clase");
  const clase = esClaseVehiculo(claseTexto) ? claseTexto : null;
  const maximo = Number(hoyISO().slice(0, 4)) + 1;
  const anio = anioTexto ? Number(anioTexto) : null;
  const anioValido =
    anio === null || (Number.isInteger(anio) && anio >= 1900 && anio <= maximo);
  return { patente, marca, modelo, anio, anioValido, maximo, clase };
}

// Caso B: el cliente ya existe, se le suma el auto. Devuelve los dos ids.
export async function crearVehiculoParaClienteEnPresupuesto(
  _prev: ResultadoAltaDesdePresupuesto,
  formData: FormData,
): Promise<ResultadoAltaDesdePresupuesto> {
  const sesion = await sesionParaEscribir();

  const clienteId = String(formData.get("cliente_id") ?? "");
  if (!clienteId) return { error: "Elegí de quién es el auto." };

  const v = leerVehiculo(formData);
  if (!esPatenteValida(v.patente)) return { error: PATENTE_FORMATO };
  if (!v.anioValido) return { error: `El año tiene que estar entre 1900 y ${v.maximo}.` };

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("vehiculos")
    .insert({
      lubricentro_id: sesion.lubricentroId,
      cliente_id: clienteId,
      patente: v.patente,
      marca: v.marca,
      modelo: v.modelo,
      anio: v.anio,
      clase: v.clase,
    })
    .select("id")
    .single();

  if (error) return { error: traducirAlta(error) };

  revalidatePath(`/panel/clientes/${clienteId}`);
  return { clienteId, vehiculoId: data.id };
}

// Caso C: cliente y auto nuevos, atómico por la función de la base. Devuelve
// los dos ids (el cliente se lee del auto recién creado).
export async function crearClienteYVehiculoEnPresupuesto(
  _prev: ResultadoAltaDesdePresupuesto,
  formData: FormData,
): Promise<ResultadoAltaDesdePresupuesto> {
  await sesionParaEscribir();

  const nombre = String(formData.get("nombre") ?? "").trim();
  const telefono = String(formData.get("telefono") ?? "").trim();
  const email = String(formData.get("email") ?? "").trim();
  const cuit = normalizarCuit(String(formData.get("cuit") ?? ""));

  if (nombre.length < 2) return { error: "El nombre necesita al menos 2 caracteres." };
  if (!telefono) {
    return { error: "Falta el teléfono. Es con lo que después vas a poder avisarle." };
  }
  if (cuit && cuit.length !== 11) return { error: CUIT_FORMATO };

  const v = leerVehiculo(formData);
  if (!esPatenteValida(v.patente)) return { error: PATENTE_FORMATO };
  if (!v.anioValido) return { error: `El año tiene que estar entre 1900 y ${v.maximo}.` };

  const supabase = await createClient();
  const { data: vehiculoId, error } = await supabase.rpc("crear_cliente_con_vehiculo", {
    p_nombre: nombre,
    p_telefono: telefono,
    p_email: email,
    p_patente: v.patente,
    p_marca: v.marca ?? undefined,
    p_modelo: v.modelo ?? undefined,
    p_anio: v.anio ?? undefined,
    p_cuit: cuit || undefined,
    p_clase: v.clase ?? undefined,
  });

  if (error) return { error: traducirAlta(error) };

  // El cliente lo creó la función; lo leemos del auto recién creado (RLS
  // recorta al tenant). Si por algo no vuelve, el presupuesto igual se ata
  // al auto, pero preferimos tener los dos.
  const { data: fila } = await supabase
    .from("vehiculos")
    .select("cliente_id")
    .eq("id", vehiculoId as string)
    .maybeSingle();

  revalidatePath("/panel/clientes");
  return { clienteId: fila?.cliente_id ?? undefined, vehiculoId: vehiculoId as string };
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

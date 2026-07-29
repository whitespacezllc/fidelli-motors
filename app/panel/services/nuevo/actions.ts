"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
// buscarPorPatente y buscarClientes SOLO LEEN: son las dos búsquedas del
// momento 0 de la carga. Un lubricentro suspendido tiene que poder
// consultarlas —ver sus datos es justamente lo que la suspensión no le
// quita— así que estas dos usan obtenerSesion a propósito. Las otras dos
// acciones de este archivo escriben y van por sesionParaEscribir().
// eslint-disable-next-line no-restricted-imports
import { sesionParaEscribir, obtenerSesion } from "@/lib/auth/session";
import { CUIT_FORMATO, normalizarCuit } from "@/lib/cuit";
import {
  esPatenteValida,
  normalizar,
  normalizarPatente,
  sanitizarBusqueda,
  PATENTE_FORMATO,
} from "@/lib/texto";

export type VehiculoIdentificado = {
  vehiculoId: string;
  patente: string;
  marca: string | null;
  modelo: string | null;
  anio: number | null;
  clienteNombre: string;
  ultimoServiceFecha: string | null;
  ultimoServiceKm: number | null;
  ultimoServiceSucursal: string | null;
  cantidadServices: number;
  premioDisponible: boolean;
  premioDescripcion: string | null;
};

export type ClienteSugerido = {
  id: string;
  nombre: string;
  telefono: string;
  cantidadVehiculos: number;
};

export type ResultadoBusqueda = {
  vehiculo: VehiculoIdentificado | null;
  error?: string;
};

// La búsqueda nunca se bloquea por formato: si la patente es rara igual se
// consulta, y el aviso lo da la UI aparte. Un formato inesperado no puede
// dejar al mecánico sin poder buscar.
export async function buscarPorPatente(
  patente: string,
): Promise<ResultadoBusqueda> {
  const sesion = await obtenerSesion();
  if (!sesion) redirect("/login");

  const normalizada = normalizarPatente(patente);
  if (normalizada.length < 6) return { vehiculo: null };

  const supabase = await createClient();
  const { data, error } = await supabase
    .rpc("buscar_vehiculo_por_patente", { p_patente: normalizada })
    .maybeSingle();

  if (error) {
    return {
      vehiculo: null,
      error: "No se pudo buscar la patente. Revisá la conexión y probá de nuevo.",
    };
  }
  if (!data?.vehiculo_id) return { vehiculo: null };

  return {
    vehiculo: {
      vehiculoId: data.vehiculo_id,
      patente: data.patente ?? normalizada,
      marca: data.marca,
      modelo: data.modelo,
      anio: data.anio,
      clienteNombre: data.cliente_nombre ?? "",
      ultimoServiceFecha: data.ultimo_service_fecha,
      ultimoServiceKm: data.ultimo_service_km,
      ultimoServiceSucursal: data.ultimo_service_sucursal,
      cantidadServices: data.cantidad_services ?? 0,
      premioDisponible: data.premio_disponible ?? false,
      premioDescripcion: data.premio_descripcion,
    },
  };
}

// Caso B: "¿de quién es?" — mismo criterio que el buscador de clientes.
export async function buscarClientes(
  termino: string,
): Promise<ClienteSugerido[]> {
  const sesion = await obtenerSesion();
  if (!sesion) redirect("/login");

  const limpio = sanitizarBusqueda(termino);
  if (limpio.length < 2) return [];

  const texto = normalizar(limpio);
  const soloDigitos = limpio.replace(/\D/g, "");
  const filtros = [`nombre_busqueda.like.*${texto}*`];
  if (soloDigitos) filtros.push(`telefono.like.*${soloDigitos}*`);

  const supabase = await createClient();
  const { data } = await supabase
    .from("vista_clientes")
    .select("id, nombre, telefono, cantidad_vehiculos")
    .or(filtros.join(","))
    .order("nombre")
    .limit(8);

  return (data ?? []).flatMap((c) =>
    c.id && c.nombre
      ? [
          {
            id: c.id,
            nombre: c.nombre,
            telefono: c.telefono ?? "",
            cantidadVehiculos: c.cantidad_vehiculos ?? 0,
          },
        ]
      : [],
  );
}

export type EstadoAlta = { error?: string };

const DUPLICADO = "23505";
const CHECK_INVALIDO = "23514";
const YA_EXISTE = "Ya tenés un vehículo con esa patente.";

function traducirError(error: { code?: string; message?: string }): string {
  if (error.code === DUPLICADO) return YA_EXISTE;
  if (error.code === CHECK_INVALIDO) return PATENTE_FORMATO;
  if (/fetch|network|conexión/i.test(error.message ?? "")) {
    return "Se cortó la conexión. No cierres esta pantalla: lo que cargaste sigue acá.";
  }
  return "No se pudo guardar. Probá de nuevo en un momento.";
}

function leerVehiculo(formData: FormData) {
  const patente = String(formData.get("patente") ?? "").trim();
  const marca = String(formData.get("marca") ?? "").trim() || null;
  const modelo = String(formData.get("modelo") ?? "").trim() || null;
  const anioTexto = String(formData.get("anio") ?? "").trim();

  const maximo = new Date().getFullYear() + 1;
  const anio = anioTexto ? Number(anioTexto) : null;
  const anioValido =
    anio === null || (Number.isInteger(anio) && anio >= 1900 && anio <= maximo);

  return { patente, marca, modelo, anio, anioValido, maximo };
}

// Caso B: el cliente ya existe, se le suma el auto.
export async function crearVehiculoParaCliente(
  _prev: EstadoAlta,
  formData: FormData,
): Promise<EstadoAlta> {
  const sesion = await sesionParaEscribir();

  const clienteId = String(formData.get("cliente_id") ?? "");
  if (!clienteId) return { error: "Elegí de quién es el auto." };

  const v = leerVehiculo(formData);
  if (!esPatenteValida(v.patente)) return { error: PATENTE_FORMATO };
  if (!v.anioValido) {
    return { error: `El año tiene que estar entre 1900 y ${v.maximo}.` };
  }

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
    })
    .select("id")
    .single();

  if (error) return { error: traducirError(error) };

  revalidatePath(`/panel/clientes/${clienteId}`);
  redirect(`/panel/services/nuevo/${data.id}`);
}

// Caso C: cliente y vehículo nuevos. El alta va por la función de la base
// para que sea atómica: si la patente choca, el cliente tampoco se crea.
export async function crearClienteYVehiculo(
  _prev: EstadoAlta,
  formData: FormData,
): Promise<EstadoAlta> {
  await sesionParaEscribir();

  const nombre = String(formData.get("nombre") ?? "").trim();
  const telefono = String(formData.get("telefono") ?? "").trim();
  const email = String(formData.get("email") ?? "").trim();
  const cuit = normalizarCuit(String(formData.get("cuit") ?? ""));

  if (nombre.length < 2) {
    return { error: "El nombre necesita al menos 2 caracteres." };
  }
  if (!telefono) {
    return {
      error: "Falta el teléfono. Es con lo que después vas a poder avisarle.",
    };
  }
  // Opcional, pero a medias no sirve para facturar: si escribió algo,
  // tienen que ser los 11 dígitos. El CHECK de la base rechazaría igual.
  if (cuit && cuit.length !== 11) {
    return { error: CUIT_FORMATO };
  }

  const v = leerVehiculo(formData);
  if (!esPatenteValida(v.patente)) return { error: PATENTE_FORMATO };
  if (!v.anioValido) {
    return { error: `El año tiene que estar entre 1900 y ${v.maximo}.` };
  }

  const supabase = await createClient();
  const { data, error } = await supabase.rpc("crear_cliente_con_vehiculo", {
    p_nombre: nombre,
    p_telefono: telefono,
    p_email: email,
    p_patente: v.patente,
    // Los parámetros con default en la función se tipan como opcionales:
    // omitirlos es lo que hace que tomen su default null.
    p_marca: v.marca ?? undefined,
    p_modelo: v.modelo ?? undefined,
    p_anio: v.anio ?? undefined,
    p_cuit: cuit || undefined,
  });

  if (error) return { error: traducirError(error) };

  revalidatePath("/panel/clientes");
  redirect(`/panel/services/nuevo/${data}`);
}

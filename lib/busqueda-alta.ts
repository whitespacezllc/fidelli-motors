import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/database.types";
import { filtroClientes } from "@/lib/clientes";
import { PATENTE_LARGO_MINIMO, normalizarPatente } from "@/lib/texto";

// ============================================================
// Las dos búsquedas del momento 0 de la carga —la patente, y el «¿De quién
// es?» cuando el auto es nuevo—, hechas DESDE EL NAVEGADOR contra PostgREST.
//
// Hasta el 21/10/2026 eran Server Actions. Cada búsqueda hacía, en serie:
// el POST a Vercel, el proxy (getClaims, que con la clave simétrica del
// proyecto es un viaje a Auth), la sesión otra vez (otro getClaims más la
// consulta a usuarios con sus tres campos calculados) y recién después la
// consulta que importaba; y el arranque en frío de la función, cuando
// tocaba. El mecánico esperaba «unos segundos» con el auto en el pozo por
// una consulta que en la base tarda menos de 10 ms.
//
// Desde el navegador es UN viaje, al mismo PostgREST, con el mismo JWT y el
// mismo RLS: `buscar_vehiculo_por_patente` es invoker, `vista_clientes` es
// security_invoker, y las policies hacen el recorte por tenant exactamente
// igual que cuando las llamaba el servidor. No hay nada que el servidor
// supiera y el navegador no: la sesión solo servía para redirigir a /login,
// y sin sesión PostgREST contesta un error que acá se muestra como tal. El
// cliente de navegador ya existía: sube los adjuntos y el diseño del calco.
//
// Reciben el cliente de Supabase por parámetro: el navegador les da el suyo
// y una prueba (o el servidor, si algún día hace falta) les da otro.
// ============================================================

type Cliente = SupabaseClient<Database>;

export type VehiculoIdentificado = {
  vehiculoId: string;
  /** De quién es el auto. El alta no lo usa; el presupuesto sí, para
   *  vincular el cliente y poder fiar/seguir. La RPC ya lo devuelve. */
  clienteId: string;
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

export type ResultadoPatente = {
  vehiculo: VehiculoIdentificado | null;
  error?: string;
};

export type ResultadoClientes = {
  clientes: ClienteSugerido[];
  error?: string;
};

const SIN_CONEXION_PATENTE =
  "No se pudo buscar la patente. Revisá la conexión y probá de nuevo.";
const SIN_CONEXION_CLIENTES =
  "No se pudo buscar el cliente. Revisá la conexión y probá de nuevo.";

/** Las sugerencias del «¿De quién es?» arrancan desde dos caracteres. */
export const BUSQUEDA_CLIENTES_MINIMO = 2;
export const SUGERENCIAS_MAXIMAS = 8;

// La búsqueda nunca se bloquea por formato: si la patente es rara igual se
// consulta, y el aviso lo da la UI aparte. Un formato inesperado no puede
// dejar al mecánico sin poder buscar.
export async function buscarVehiculoPorPatente(
  supabase: Cliente,
  patente: string,
): Promise<ResultadoPatente> {
  const normalizada = normalizarPatente(patente);
  if (normalizada.length < PATENTE_LARGO_MINIMO) return { vehiculo: null };

  const { data, error } = await supabase
    .rpc("buscar_vehiculo_por_patente", { p_patente: normalizada })
    .maybeSingle();

  if (error) return { vehiculo: null, error: SIN_CONEXION_PATENTE };
  if (!data?.vehiculo_id) return { vehiculo: null };

  return {
    vehiculo: {
      vehiculoId: data.vehiculo_id,
      clienteId: data.cliente_id ?? "",
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

// «¿De quién es?»: el MISMO filtro que el listado de Clientes (lib/clientes.ts),
// así el alta encuentra exactamente lo que encuentra la pantalla de Clientes,
// patente de otro auto del cliente incluida.
export async function buscarClientes(
  supabase: Cliente,
  termino: string,
): Promise<ResultadoClientes> {
  const { termino: limpio, filtros } = filtroClientes(termino);
  if (limpio.length < BUSQUEDA_CLIENTES_MINIMO || !filtros) return { clientes: [] };

  const { data, error } = await supabase
    .from("vista_clientes")
    .select("id, nombre, telefono, cantidad_vehiculos")
    .or(filtros)
    .order("nombre")
    .limit(SUGERENCIAS_MAXIMAS);

  if (error) return { clientes: [], error: SIN_CONEXION_CLIENTES };

  return {
    clientes: (data ?? []).flatMap((c) =>
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
    ),
  };
}

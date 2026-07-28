"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { sesionParaEscribir } from "@/lib/auth/session";
import { esCategoria, type CategoriaProducto } from "@/lib/categorias";

export type EstadoProducto = { error?: string; ok?: boolean };

// El error de guardado avisa que no cierre el dialog: sin borradores locales,
// el formulario abierto es lo único que conserva lo que ya se escribió.
const SIN_CONEXION =
  "Se cortó la conexión a internet. No cierres esta ventana: lo que cargaste sigue acá. Cuando vuelva la señal, tocá Guardar de nuevo.";

// El índice productos_sin_duplicados (lubricentro, categoría, nombre, marca)
// es el que dispara este código. Se traduce antes de que llegue a la pantalla.
const DUPLICADO = "23505";

const YA_EXISTE = "Ya tenés ese producto en el catálogo.";

function esErrorDeRed(error: { message?: string }): boolean {
  return /fetch|network|conexión/i.test(error.message ?? "");
}

type Campos =
  | { ok: true; categoria: CategoriaProducto; nombre: string; marca: string | null }
  | { ok: false; error: string };

function leerCampos(formData: FormData): Campos {
  const categoria = String(formData.get("categoria") ?? "");
  const nombre = String(formData.get("nombre") ?? "").trim();
  const marca = String(formData.get("marca") ?? "").trim() || null;

  if (!esCategoria(categoria)) {
    return { ok: false, error: "Elegí una categoría para el producto." };
  }
  if (nombre.length < 2) {
    return { ok: false, error: "El nombre necesita al menos 2 caracteres." };
  }
  return { ok: true, categoria, nombre, marca };
}

export async function crearProducto(
  _prev: EstadoProducto,
  formData: FormData,
): Promise<EstadoProducto> {
  const sesion = await sesionParaEscribir();

  const campos = leerCampos(formData);
  if (!campos.ok) return { error: campos.error };

  const supabase = await createClient();
  // RLS verifica el tenant en el with check; el id sale de la sesión.
  const { error } = await supabase.from("productos").insert({
    lubricentro_id: sesion.lubricentroId,
    categoria: campos.categoria,
    nombre: campos.nombre,
    marca: campos.marca,
  });

  if (error) {
    if (error.code === DUPLICADO) return { error: YA_EXISTE };
    if (esErrorDeRed(error)) return { error: SIN_CONEXION };
    return { error: "No se pudo guardar el producto. Probá de nuevo en un momento." };
  }

  revalidatePath("/panel/productos");
  return { ok: true };
}

export async function editarProducto(
  _prev: EstadoProducto,
  formData: FormData,
): Promise<EstadoProducto> {
  await sesionParaEscribir();

  const id = String(formData.get("id") ?? "");
  const campos = leerCampos(formData);
  if (!campos.ok) return { error: campos.error };

  const supabase = await createClient();
  const { error } = await supabase
    .from("productos")
    .update({
      categoria: campos.categoria,
      nombre: campos.nombre,
      marca: campos.marca,
    })
    .eq("id", id);

  if (error) {
    if (error.code === DUPLICADO) return { error: YA_EXISTE };
    if (esErrorDeRed(error)) return { error: SIN_CONEXION };
    return { error: "No se pudo guardar el producto. Probá de nuevo en un momento." };
  }

  revalidatePath("/panel/productos");
  return { ok: true };
}

export async function toggleProducto(
  _prev: EstadoProducto,
  formData: FormData,
): Promise<EstadoProducto> {
  await sesionParaEscribir();

  const id = String(formData.get("id") ?? "");
  const activar = formData.get("activar") === "true";

  const supabase = await createClient();
  // Un producto inactivo desaparece de los chips de la carga de service, pero
  // los services viejos lo conservan: services.aceite_nombre guarda el snapshot.
  const { error } = await supabase
    .from("productos")
    .update({ activo: activar })
    .eq("id", id);

  if (error) {
    if (esErrorDeRed(error)) {
      return { error: "Sin conexión a internet. Revisá la señal y probá de nuevo." };
    }
    return { error: "No se pudo cambiar el estado. Probá de nuevo en un momento." };
  }

  revalidatePath("/panel/productos");
  return { ok: true };
}

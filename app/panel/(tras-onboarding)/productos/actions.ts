"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { sesionParaEscribir } from "@/lib/auth/session";
// La categoría la valida la BASE: es una FK contra el catálogo global.

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
  | {
      ok: true;
      categoria: string;
      nombre: string;
      marca: string | null;
      precio_venta: number | null;
      stock: number | null;
      stock_minimo: number | null;
      unidad: string;
      litros_sugeridos: number | null;
    }
  | { ok: false; error: string };

// "1.500,50" y "1500.50" valen igual: el mecánico tipea como piensa.
function numeroONull(crudo: FormDataEntryValue | null): number | null {
  const texto = String(crudo ?? "").trim();
  if (texto === "") return null;
  const n = Number(texto.replace(/\./g, "").replace(",", "."));
  return Number.isFinite(n) ? n : null;
}

function leerCampos(formData: FormData): Campos {
  const categoria = String(formData.get("categoria") ?? "");
  const nombre = String(formData.get("nombre") ?? "").trim();
  const marca = String(formData.get("marca") ?? "").trim() || null;
  const unidad = formData.get("unidad") === "litro" ? "litro" : "unidad";
  const llevaStock = formData.get("lleva_stock") === "on";

  if (!categoria) {
    return { ok: false, error: "Elegí una categoría para el producto." };
  }
  if (nombre.length < 2) {
    return { ok: false, error: "El nombre necesita al menos 2 caracteres." };
  }

  const precio_venta = numeroONull(formData.get("precio_venta"));
  if (precio_venta != null && precio_venta < 0) {
    return { ok: false, error: "El precio no puede ser negativo." };
  }

  // Apagar el interruptor de stock LIMPIA los tres campos: nulo significa
  // "no llevo stock", no "cero".
  const stock = llevaStock ? numeroONull(formData.get("stock")) : null;
  const stock_minimo = llevaStock ? numeroONull(formData.get("stock_minimo")) : null;
  const litros_sugeridos =
    llevaStock && unidad === "litro"
      ? numeroONull(formData.get("litros_sugeridos"))
      : null;

  if (llevaStock && stock == null) {
    return { ok: false, error: "Poné el stock actual, o apagá el interruptor de stock." };
  }

  return {
    ok: true,
    categoria,
    nombre,
    marca,
    precio_venta,
    stock,
    stock_minimo,
    unidad,
    litros_sugeridos,
  };
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
    precio_venta: campos.precio_venta,
    stock: campos.stock,
    stock_minimo: campos.stock_minimo,
    unidad: campos.unidad,
    litros_sugeridos: campos.litros_sugeridos,
  });

  if (error) {
    if (error.code === DUPLICADO) return { error: YA_EXISTE };
    if (error.code === "23503") return { error: "Esa categoría ya no existe. Recargá la pantalla." };
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
      precio_venta: campos.precio_venta,
      stock: campos.stock,
      stock_minimo: campos.stock_minimo,
      unidad: campos.unidad,
      litros_sugeridos: campos.litros_sugeridos,
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

import { NextRequest, NextResponse } from "next/server";
import { categoriaValida, filtrarProductos } from "@/lib/productos";
import {
  contextoExportacion,
  respuestaError,
  respuestaSinFilas,
  respuestaXlsx,
} from "@/lib/exportar/respuesta";
import { paginar } from "@/lib/exportar/paginar";
import {
  fecha,
  generarXlsx,
  nombreArchivo,
  numero,
  siNo,
  texto,
  type Celda,
} from "@/lib/exportar/xlsx";

// ============================================================
// La exportación del catálogo: una hoja "Productos".
//
// Misma lógica que la solapa: se trae el catálogo entero (paginado, por
// si un día pasa de mil) y el filtro por búsqueda y categoría se aplica
// en memoria con la misma función. RLS filtra por tenant.
// ============================================================

export async function GET(request: NextRequest) {
  const contexto = await contextoExportacion();
  if (!contexto) {
    return NextResponse.redirect(new URL("/login", request.url));
  }
  const { supabase, slug } = contexto;

  const q = request.nextUrl.searchParams.get("q") ?? undefined;
  const categoria = request.nextUrl.searchParams.get("categoria") ?? undefined;

  try {
    const [productos, categoriasRes] = await Promise.all([
      paginar((desde, hasta) =>
        supabase
          .from("productos")
          .select(
            `id, nombre, marca, categoria, unidad, litros_sugeridos, precio_venta,
             stock, stock_minimo, activo, created_at`,
          )
          .order("nombre")
          .order("id")
          .range(desde, hasta),
      ),
      supabase.from("categorias_producto").select("clave, nombre, activa").order("orden"),
    ]);
    if (categoriasRes.error) throw new Error(categoriasRes.error.message);

    // Las categorías del filtro son las activas, como los chips de la
    // solapa; para el nombre en la celda sirven todas.
    const categorias = categoriasRes.data ?? [];
    const activas = categorias.filter((c) => c.activa).map((c) => c.clave);
    const nombreCategoria = new Map(categorias.map((c) => [c.clave, c.nombre]));

    const filtrados = filtrarProductos(productos, {
      q,
      categoria: categoriaValida(categoria, activas),
    });

    if (filtrados.length === 0) {
      return respuestaSinFilas(
        "No hay productos para exportar con ese filtro. Volvé al catálogo y probá con otra búsqueda.",
      );
    }

    const filas: Celda[][] = filtrados.map((p) => [
      texto(p.nombre),
      texto(p.marca),
      texto(nombreCategoria.get(p.categoria) ?? p.categoria),
      texto(p.unidad),
      numero(p.litros_sugeridos),
      numero(p.precio_venta),
      numero(p.stock),
      numero(p.stock_minimo),
      siNo(p.activo),
      fecha(p.created_at),
    ]);

    const archivo = await generarXlsx([
      {
        nombre: "Productos",
        cabecera: [
          "Nombre",
          "Marca",
          "Categoría",
          "Unidad",
          "Litros sugeridos",
          "Precio",
          "Stock",
          "Stock mínimo",
          "Activo",
          "Fecha de alta",
        ],
        filas,
      },
    ]);

    return respuestaXlsx(archivo, nombreArchivo(slug, "productos"), filtrados.length);
  } catch {
    return respuestaError();
  }
}

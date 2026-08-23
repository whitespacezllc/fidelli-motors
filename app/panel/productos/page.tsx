import type { Metadata } from "next";
import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { panelSuspendido } from "@/lib/auth/session";
import { CabeceraSeccion } from "@/components/panel/cabecera-seccion";
import { AccionBloqueada } from "@/components/panel/bloqueo-suspension";
import { EstadoVacio } from "@/components/ui/estado-vacio";
import { clasesBoton } from "@/components/ui/boton";
import { IconoCaja } from "@/components/iconos";
import { DialogProducto } from "@/components/productos/dialog-producto";
import { FilaProducto } from "@/components/productos/fila-producto";
import { FiltrosProductos } from "@/components/productos/filtros-productos";
import { aCategorias } from "@/lib/categorias";
import { normalizar } from "@/lib/texto";

export const metadata: Metadata = { title: "Productos" };

export default async function PaginaProductos({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; categoria?: string }>;
}) {
  const { q, categoria } = await searchParams;
  // El catálogo global de categorías, de la base: una nueva es un INSERT
  // de Fidelli, no una migración ni un deploy.
  const supabase = await createClient();
  const suspendido = await panelSuspendido();

  // Una sola consulta, sin filtros: el catálogo de un lubricentro son decenas
  // de filas. Filtrar en memoria evita una ida y vuelta por cada chip y deja
  // distinguir "catálogo vacío" de "el filtro no encontró nada", que son dos
  // pantallas distintas. RLS ya filtra por tenant.
  const [productosRes, categoriasRes] = await Promise.all([
    supabase
      .from("productos")
      .select(
        "id, categoria, nombre, marca, activo, precio_venta, stock, stock_minimo, unidad",
      )
      .order("activo", { ascending: false })
      .order("nombre"),
    supabase
      .from("categorias_producto")
      .select("clave, nombre, plural")
      .eq("activa", true)
      .order("orden"),
  ]);

  const todos = productosRes.data ?? [];
  const categorias = aCategorias(categoriasRes.data);

  const filtroCategoria = categorias.some((c) => c.valor === categoria)
    ? categoria
    : undefined;
  const busqueda = normalizar(q ?? "");

  const filtrados = todos.filter((p) => {
    if (filtroCategoria && p.categoria !== filtroCategoria) return false;
    if (!busqueda) return true;
    return (
      normalizar(p.nombre).includes(busqueda) ||
      normalizar(p.marca ?? "").includes(busqueda)
    );
  });

  // Grupos en el orden del catálogo; los vacíos no se dibujan.
  const grupos = categorias.map((c) => ({
    ...c,
    productos: filtrados.filter((p) => p.categoria === c.valor),
  })).filter((g) => g.productos.length > 0);

  return (
    <div>
      <CabeceraSeccion titulo="Productos">
        {todos.length > 0 &&
          (suspendido ? (
            <AccionBloqueada etiqueta="+ Nuevo producto" />
          ) : (
            <DialogProducto categorias={categorias} />
          ))}
      </CabeceraSeccion>

      {todos.length === 0 ? (
        <EstadoVacio
          icono={<IconoCaja className="size-6" />}
          titulo="Tu catálogo está vacío"
          descripcion="Cargá los aceites, filtros y líquidos que usás siempre para elegirlos con un toque en cada service."
        >
          {suspendido ? (
            <AccionBloqueada etiqueta="+ Cargar el primer producto" />
          ) : (
            <DialogProducto categorias={categorias} etiquetaTrigger="+ Cargar el primer producto" />
          )}
        </EstadoVacio>
      ) : (
        <>
          <FiltrosProductos
            categorias={categorias}
            categoria={filtroCategoria}
            q={q}
          />

          {filtrados.length === 0 ? (
            <EstadoVacio
              titulo="Ningún producto coincide con la búsqueda"
              descripcion="Probá con otro nombre o mirá todas las categorías."
            >
              <Link
                href="/panel/productos"
                className={clasesBoton("secundario", "md")}
              >
                Limpiar filtros
              </Link>
            </EstadoVacio>
          ) : (
            <div className="flex flex-col gap-6">
              {grupos.map((g) => (
                <section key={g.valor}>
                  <h2 className="mb-2 px-1 text-label font-semibold tracking-[0.06em] text-ink-40 uppercase">
                    {g.plural}
                  </h2>
                  <ul className="surface-card px-4 sm:px-5">
                    {g.productos.map((p) => (
                      <FilaProducto key={p.id} producto={p} suspendido={suspendido} categorias={categorias} />
                    ))}
                  </ul>
                </section>
              ))}
            </div>
          )}
        </>
      )}
    </div>
  );
}

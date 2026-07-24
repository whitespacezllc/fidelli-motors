import type { Metadata } from "next";
import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { CabeceraSeccion } from "@/components/panel/cabecera-seccion";
import { EstadoVacio } from "@/components/ui/estado-vacio";
import { clasesBoton } from "@/components/ui/boton";
import { IconoCaja } from "@/components/iconos";
import { DialogProducto } from "@/components/productos/dialog-producto";
import { FilaProducto } from "@/components/productos/fila-producto";
import { FiltrosProductos } from "@/components/productos/filtros-productos";
import { CATEGORIAS, esCategoria } from "@/lib/categorias";
import { normalizar } from "@/lib/texto";

export const metadata: Metadata = { title: "Productos — Fidelli Motors" };

export default async function PaginaProductos({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; categoria?: string }>;
}) {
  const { q, categoria } = await searchParams;
  const supabase = await createClient();

  // Una sola consulta, sin filtros: el catálogo de un lubricentro son decenas
  // de filas. Filtrar en memoria evita una ida y vuelta por cada chip y deja
  // distinguir "catálogo vacío" de "el filtro no encontró nada", que son dos
  // pantallas distintas. RLS ya filtra por tenant.
  const { data } = await supabase
    .from("productos")
    .select("id, categoria, nombre, marca, activo")
    .order("categoria")
    .order("activo", { ascending: false })
    .order("nombre");

  const todos = data ?? [];

  const filtroCategoria =
    categoria && esCategoria(categoria) ? categoria : undefined;
  const busqueda = normalizar(q ?? "");

  const filtrados = todos.filter((p) => {
    if (filtroCategoria && p.categoria !== filtroCategoria) return false;
    if (!busqueda) return true;
    return (
      normalizar(p.nombre).includes(busqueda) ||
      normalizar(p.marca ?? "").includes(busqueda)
    );
  });

  // Grupos en el orden del enum; los vacíos no se dibujan.
  const grupos = CATEGORIAS.map((c) => ({
    ...c,
    productos: filtrados.filter((p) => p.categoria === c.valor),
  })).filter((g) => g.productos.length > 0);

  return (
    <div>
      <CabeceraSeccion titulo="Productos">
        {todos.length > 0 && <DialogProducto />}
      </CabeceraSeccion>

      {todos.length === 0 ? (
        <EstadoVacio
          icono={<IconoCaja className="size-6" />}
          titulo="Tu catálogo está vacío"
          descripcion="Cargá los aceites, filtros y líquidos que usás siempre para elegirlos con un toque en cada service."
        >
          <DialogProducto etiquetaTrigger="+ Cargar el primer producto" />
        </EstadoVacio>
      ) : (
        <>
          <FiltrosProductos categoria={filtroCategoria} q={q} />

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
                      <FilaProducto key={p.id} producto={p} />
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

import type { Metadata } from "next";
import { BuscadorPresupuestos } from "@/components/presupuestos/buscador-presupuestos";
import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { obtenerSesion, featureHabilitada, panelSuspendido } from "@/lib/auth/session";
import { BloqueoPlan } from "@/components/panel/bloqueo-plan";
import { CabeceraSeccion } from "@/components/panel/cabecera-seccion";
import { EstadoVacio } from "@/components/ui/estado-vacio";
import { clasesBoton } from "@/components/ui/boton";
import { AccionBloqueada } from "@/components/panel/bloqueo-suspension";
import { formatearFecha } from "@/lib/fechas";
import { formatearPesos } from "@/lib/presupuestos";

export const metadata: Metadata = { title: "Presupuestos" };

const POR_PAGINA = 30;

// El archivo de cotizaciones: de acá se reimprime, se duplica y se
// vuelve a mandar. Sin estados — un presupuesto se genera y queda.
export default async function PaginaPresupuestos({
  searchParams,
}: {
  searchParams: Promise<{ pagina?: string; q?: string }>;
}) {
  const sesion = await obtenerSesion();
  if (!featureHabilitada(sesion, "presupuestos")) {
    return <BloqueoPlan funcion="Presupuestos" />;
  }

  const params = await searchParams;
  const pagina = Math.max(1, Number(params.pagina) || 1);
  const q = params.q?.trim() || undefined;
  const suspendido = await panelSuspendido();
  const supabase = await createClient();

  let consulta = supabase
    .from("presupuestos")
    .select(
      `id, numero, fecha, destinatario_nombre, destinatario_vehiculo,
       sucursales(nombre), clientes(nombre),
       presupuesto_items(cantidad, precio_unitario)`,
      { count: "exact" },
    )
    .order("numero", { ascending: false });

  // Buscar por NÚMERO o por NOMBRE, que son las dos formas en que el
  // mostrador pide un presupuesto. Si lo escrito son solo dígitos se
  // busca el número exacto: "47" tiene que traer el 47 y no los 30 que
  // contienen un 4 y un 7. Si no, va por el nombre suelto del
  // destinatario — el de un cliente de la base no se puede filtrar acá
  // porque vive en la tabla del join, así que ese caso queda para cuando
  // haga falta y se dice en el vacío.
  if (q) {
    consulta = /^\d+$/.test(q)
      ? consulta.eq("numero", Number(q))
      : consulta.ilike("destinatario_nombre", `%${q}%`);
  }

  const { data, count } = await consulta.range(
    (pagina - 1) * POR_PAGINA,
    pagina * POR_PAGINA - 1,
  );

  const filas = (data ?? []).map((p) => ({
    id: p.id,
    numero: p.numero,
    fecha: p.fecha,
    para:
      p.destinatario_nombre ??
      p.clientes?.nombre ??
      p.destinatario_vehiculo ??
      "—",
    vehiculo: p.destinatario_vehiculo,
    sucursal: p.sucursales?.nombre ?? "",
    total: (p.presupuesto_items ?? []).reduce(
      (s, i) => s + Number(i.cantidad) * Number(i.precio_unitario),
      0,
    ),
  }));

  const total = count ?? 0;
  const paginas = Math.max(1, Math.ceil(total / POR_PAGINA));

  return (
    <div>
      <CabeceraSeccion titulo="Presupuestos">
        {suspendido ? (
          <AccionBloqueada etiqueta="+ Nuevo presupuesto" />
        ) : (
          <Link
            href="/panel/presupuestos/nuevo"
            className={clasesBoton("primario", "md")}
          >
            + Nuevo presupuesto
          </Link>
        )}
      </CabeceraSeccion>

      {/* El buscador se muestra siempre que haya presupuestos cargados o
          una búsqueda activa: si desapareciera con cero resultados, el que
          buscó mal quedaría sin forma de corregir. */}
      {(total > 0 || q) && (
        <div className="mb-4">
          <BuscadorPresupuestos q={q} />
        </div>
      )}

      {filas.length > 0 ? (
        <>
          <ul className="surface-card px-4 sm:px-5">
            {filas.map((p) => (
              <li key={p.id} className="border-b border-line last:border-b-0">
                <Link
                  href={`/panel/presupuestos/${p.id}`}
                  className="flex flex-wrap items-center gap-x-4 gap-y-1 py-3 hover:bg-surface/60 lg:grid lg:grid-cols-[5rem_7.5rem_1fr_1fr_9rem_8rem] lg:gap-x-4"
                >
                  <span className="order-1 font-brand text-body font-bold text-ink tabular-nums lg:order-none">
                    N° {p.numero}
                  </span>
                  <span className="order-2 text-label text-ink-60 tabular-nums lg:order-none lg:text-ui">
                    {formatearFecha(p.fecha)}
                  </span>
                  <span className="order-3 w-full truncate text-ui text-ink lg:order-none lg:w-auto">
                    {p.para}
                  </span>
                  <span className="order-4 hidden truncate text-ui text-ink-60 sm:inline lg:order-none">
                    {p.vehiculo ?? ""}
                  </span>
                  <span className="order-5 text-label text-ink-60 lg:order-none lg:text-ui">
                    {p.sucursal}
                  </span>
                  <span className="order-6 ml-auto text-ui font-semibold text-ink tabular-nums lg:order-none lg:ml-0 lg:text-right">
                    {formatearPesos(p.total)}
                  </span>
                </Link>
              </li>
            ))}
          </ul>

          {paginas > 1 && (
            <nav
              aria-label="Paginación"
              className="mt-4 flex items-center justify-between gap-4"
            >
              {pagina > 1 ? (
                <Link
                  href={`/panel/presupuestos?pagina=${pagina - 1}`}
                  className={clasesBoton("secundario", "md")}
                >
                  ← Anteriores
                </Link>
              ) : (
                <span />
              )}
              <span className="text-ui text-ink-60 tabular-nums">
                Página {pagina} de {paginas} · {total} presupuestos
              </span>
              {pagina < paginas ? (
                <Link
                  href={`/panel/presupuestos?pagina=${pagina + 1}`}
                  className={clasesBoton("secundario", "md")}
                >
                  Siguientes →
                </Link>
              ) : (
                <span />
              )}
            </nav>
          )}
        </>
      ) : q ? (
        // Un filtro sin resultados NO es lo mismo que no tener nada: el
        // vacío por búsqueda ofrece limpiar, no crear.
        <EstadoVacio
          titulo={`Ningún presupuesto coincide con "${q}"`}
          descripcion="Probá con el número exacto, o con el nombre tal como lo escribiste en el presupuesto."
        >
          <Link
            href="/panel/presupuestos"
            className={clasesBoton("secundario", "md")}
          >
            Ver todos
          </Link>
        </EstadoVacio>
      ) : (
        <EstadoVacio
          titulo="Todavía no generaste presupuestos"
          descripcion="Cinco renglones con precio y sale un papel con tu marca, listo para descargar en PDF o imprimir en el mostrador."
        >
          {!suspendido && (
            <Link
              href="/panel/presupuestos/nuevo"
              className={clasesBoton("secundario", "md")}
            >
              Hacer el primero
            </Link>
          )}
        </EstadoVacio>
      )}
    </div>
  );
}

import type { Metadata } from "next";
import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { CabeceraSeccion } from "@/components/panel/cabecera-seccion";
import { EstadoVacio } from "@/components/ui/estado-vacio";
import { Buscador } from "@/components/ui/buscador";
import { clasesBoton } from "@/components/ui/boton";
import { IconoReloj } from "@/components/iconos";
import { FiltrosServices } from "@/components/services/filtros-services";
import { FilaService } from "@/components/services/fila-service";
import { estadoService } from "@/lib/servicios";
import { normalizarPatente } from "@/lib/texto";

export const metadata: Metadata = { title: "Services" };

// Un lubricentro activo acumula miles: se pagina siempre, no se trae todo.
const POR_PAGINA = 30;

type Params = {
  q?: string;
  sucursal?: string;
  desde?: string;
  hasta?: string;
  pagina?: string;
};

const FECHA = /^\d{4}-\d{2}-\d{2}$/;

// El registro operativo del negocio: "¿qué le hicimos al Corsa en mayo?".
// Filtros en la URL, como en clientes y productos.
export default async function PaginaServices({
  searchParams,
}: {
  searchParams: Promise<Params>;
}) {
  const params = await searchParams;
  const supabase = await createClient();

  const filtros = {
    q: params.q?.trim() || undefined,
    sucursal: params.sucursal || undefined,
    desde: params.desde && FECHA.test(params.desde) ? params.desde : undefined,
    hasta: params.hasta && FECHA.test(params.hasta) ? params.hasta : undefined,
  };
  const filtrando = Boolean(
    filtros.q || filtros.sucursal || filtros.desde || filtros.hasta,
  );
  const pagina = Math.max(1, Number(params.pagina) || 1);

  // La patente entra por el join: !inner hace que el filtro sobre el
  // vehículo recorte los services, no que venga el vehículo en null.
  const patente = filtros.q ? normalizarPatente(filtros.q) : null;

  let consulta = supabase
    .from("services")
    .select(
      `id, tipo, trabajo_descripcion, fecha, created_at, kilometros, anulado, desbloqueado_hasta,
       vehiculos!inner(patente, patente_normalizada, marca, modelo, clientes(nombre)),
       sucursales(nombre)`,
      { count: "exact" },
    )
    .order("fecha", { ascending: false })
    .order("created_at", { ascending: false })
    .range((pagina - 1) * POR_PAGINA, pagina * POR_PAGINA - 1);

  if (patente) {
    consulta = consulta.like("vehiculos.patente_normalizada", `%${patente}%`);
  }
  if (filtros.sucursal) consulta = consulta.eq("sucursal_id", filtros.sucursal);
  if (filtros.desde) consulta = consulta.gte("fecha", filtros.desde);
  if (filtros.hasta) consulta = consulta.lte("fecha", filtros.hasta);

  // Las sucursales del filtro: chica y en paralelo con la principal.
  const [serviciosRes, sucursalesRes] = await Promise.all([
    consulta,
    supabase.from("sucursales").select("id, nombre").order("nombre"),
  ]);

  const total = serviciosRes.count ?? 0;
  const paginas = Math.max(1, Math.ceil(total / POR_PAGINA));
  const services = (serviciosRes.data ?? []).map((s) => ({
    id: s.id,
    tipo: s.tipo,
    descripcion: s.trabajo_descripcion,
    creado: s.created_at,
    patente: s.vehiculos.patente,
    vehiculo:
      [s.vehiculos.marca, s.vehiculos.modelo].filter(Boolean).join(" ") || null,
    cliente: s.vehiculos.clientes?.nombre ?? null,
    sucursal: s.sucursales?.nombre ?? "",
    kilometros: s.kilometros,
    estado: estadoService(s),
  }));

  // Los links de paginación conservan los filtros.
  const urlPagina = (n: number) => {
    const p = new URLSearchParams();
    if (filtros.q) p.set("q", filtros.q);
    if (filtros.sucursal) p.set("sucursal", filtros.sucursal);
    if (filtros.desde) p.set("desde", filtros.desde);
    if (filtros.hasta) p.set("hasta", filtros.hasta);
    if (n > 1) p.set("pagina", String(n));
    const query = p.toString();
    return `/panel/services${query ? `?${query}` : ""}`;
  };

  return (
    <div>
      <CabeceraSeccion titulo="Services">
        <Link href="/panel/services/nuevo" className={clasesBoton("primario", "md")}>
          + Nuevo service
        </Link>
      </CabeceraSeccion>

      <div className="mb-5 flex flex-col gap-3">
        <Buscador
          ruta="/panel/services"
          valor={params.q}
          placeholder="Buscar por patente…"
          etiqueta="Buscar services por patente"
          paramsExtra={{
            sucursal: filtros.sucursal,
            desde: filtros.desde,
            hasta: filtros.hasta,
          }}
        />
        <FiltrosServices
          sucursales={sucursalesRes.data ?? []}
          filtros={filtros}
        />
      </div>

      {services.length > 0 ? (
        <>
          <ul className="surface-card px-4 sm:px-5">
            {services.map((s) => (
              <FilaService key={s.id} service={s} />
            ))}
          </ul>

          {paginas > 1 && (
            <nav
              aria-label="Paginación"
              className="mt-4 flex items-center justify-between gap-4"
            >
              {pagina > 1 ? (
                <Link
                  href={urlPagina(pagina - 1)}
                  className={clasesBoton("secundario", "md")}
                >
                  ← Anteriores
                </Link>
              ) : (
                <span />
              )}
              <span className="text-ui text-ink-60 tabular-nums">
                Página {pagina} de {paginas} · {total} services
              </span>
              {pagina < paginas ? (
                <Link
                  href={urlPagina(pagina + 1)}
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
      ) : filtrando ? (
        <EstadoVacio
          titulo="Ningún service coincide con esos filtros"
          descripcion="Probá con otro rango de fechas, otra sucursal, o revisá la patente."
        >
          <Link href="/panel/services" className={clasesBoton("secundario", "md")}>
            Limpiar filtros
          </Link>
        </EstadoVacio>
      ) : (
        <EstadoVacio
          icono={<IconoReloj className="size-6" />}
          titulo="Todavía no cargaste services"
          descripcion="Acá va a estar el registro completo del taller: cada service con su fecha, su auto y su sucursal, para buscar qué se le hizo a cada vehículo."
        >
          <Link
            href="/panel/services/nuevo"
            className={clasesBoton("secundario", "md")}
          >
            Cargar el primer service
          </Link>
        </EstadoVacio>
      )}
    </div>
  );
}

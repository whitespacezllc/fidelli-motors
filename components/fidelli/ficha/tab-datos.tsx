import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { Buscador } from "@/components/ui/buscador";
import { formatearFecha } from "@/lib/fechas";
import { filtroClientes } from "@/lib/clientes";
import { normalizarPatente } from "@/lib/texto";
import { estadoService } from "@/lib/servicios";
import { FilaServiceFidelli } from "./fila-service-fidelli";
import { FilaVehiculoFidelli } from "./fila-vehiculo-fidelli";
import { HistorialCorrecciones } from "./historial-correcciones";
import { VISTAS_DATOS, esVistaDatos, type Tenant, type VistaDatos } from "./tipos";
import type { ParamsFicha } from "@/app/fidelli/[id]/page";

const POR_PAGINA = 30;
const FECHA = /^\d{4}-\d{2}-\d{2}$/;

const TH =
  "px-3 py-2 text-left text-label font-semibold tracking-[0.06em] text-ink-60 uppercase whitespace-nowrap";
const TD = "px-3 py-2.5 align-middle";

// ============================================================
// El acceso operativo al tenant, para dar soporte por teléfono.
//
// SOLO LECTURA, salvo el desbloqueo. Fidelli no edita los datos de su
// cliente: si hay algo mal, se abre la ventana y lo corrige el lubri. La
// frontera es del producto — no tocamos la operación de nadie.
//
// Y las tres consultas de acá son las más expuestas al error de
// aislamiento: vista_clientes y vista_vehiculos tienen security_invoker,
// así que a un superadmin le devuelven TODOS los lubricentros. El
// .eq("lubricentro_id") de cada una es lo único que separa a este tenant
// del de al lado.
// ============================================================
export async function TabDatos({
  tenant,
  params,
}: {
  tenant: Tenant;
  params: ParamsFicha;
}) {
  const ver: VistaDatos = esVistaDatos(params.ver) ? params.ver : "clientes";
  const pagina = Math.max(1, Number(params.pagina) || 1);
  const q = params.q?.trim() || undefined;

  const url = (v: VistaDatos) => `/fidelli/${tenant.id}?tab=datos&ver=${v}`;

  return (
    <div>
      <nav
        aria-label="Datos del lubricentro"
        className="mb-4 flex gap-1 overflow-x-auto"
      >
        {VISTAS_DATOS.map((s) => {
          const activa = s.clave === ver;
          return (
            <Link
              key={s.clave}
              href={url(s.clave)}
              aria-current={activa ? "page" : undefined}
              className={`flex h-9 shrink-0 items-center rounded-md px-3 text-ui transition-colors ${
                activa
                  ? "bg-ink font-semibold text-base"
                  : "border border-line bg-base text-ink-60 hover:bg-surface"
              }`}
            >
              {s.nombre}
            </Link>
          );
        })}
      </nav>

      {ver === "clientes" && (
        <ListaClientes tenant={tenant} q={q} pagina={pagina} />
      )}
      {ver === "vehiculos" && (
        <ListaVehiculos tenant={tenant} q={q} pagina={pagina} />
      )}
      {ver === "services" && (
        <ListaServices tenant={tenant} params={params} pagina={pagina} />
      )}
    </div>
  );
}

// ---------- Paginación, compartida por las tres listas ----------
function Paginacion({
  base,
  pagina,
  total,
}: {
  base: string;
  pagina: number;
  total: number;
}) {
  const paginas = Math.max(1, Math.ceil(total / POR_PAGINA));
  if (paginas <= 1) return null;

  return (
    <div className="flex items-center justify-between gap-3 border-t border-line px-3 py-2.5 text-ui">
      <span className="text-ink-60">
        {total} en total · página {pagina} de {paginas}
      </span>
      <span className="flex gap-2">
        {pagina > 1 && (
          <Link
            href={`${base}&pagina=${pagina - 1}`}
            className="rounded-md border border-line px-3 py-1 font-semibold text-ink hover:bg-surface"
          >
            Anterior
          </Link>
        )}
        {pagina < paginas && (
          <Link
            href={`${base}&pagina=${pagina + 1}`}
            className="rounded-md border border-line px-3 py-1 font-semibold text-ink hover:bg-surface"
          >
            Siguiente
          </Link>
        )}
      </span>
    </div>
  );
}

function Vacio({ children }: { children: React.ReactNode }) {
  return <p className="px-4.5 py-6 text-ui text-ink-60">{children}</p>;
}

// ---------- Clientes ----------
async function ListaClientes({
  tenant,
  q,
  pagina,
}: {
  tenant: Tenant;
  q: string | undefined;
  pagina: number;
}) {
  const supabase = await createClient();
  const { termino, filtros } = filtroClientes(q);

  let consulta = supabase
    .from("vista_clientes")
    .select(
      "id, nombre, telefono, cantidad_vehiculos, ultimo_service_fecha, patentes_lista",
      { count: "exact" },
    )
    // vista_clientes es security_invoker: sin esto, un superadmin ve los
    // clientes de TODA la plataforma mezclados en esta tabla.
    .eq("lubricentro_id", tenant.id)
    .order("nombre")
    .range((pagina - 1) * POR_PAGINA, pagina * POR_PAGINA - 1);

  if (filtros) consulta = consulta.or(filtros);

  const { data, count } = await consulta;
  const clientes = data ?? [];

  return (
    <div className="surface-card overflow-hidden">
      <div className="border-b border-line p-3">
        <Buscador
          ruta={`/fidelli/${tenant.id}`}
          valor={q}
          placeholder="Buscar por nombre, teléfono o patente…"
          etiqueta="Buscar clientes de este lubricentro"
          paramsExtra={{ tab: "datos", ver: "clientes" }}
        />
      </div>

      {clientes.length === 0 ? (
        <Vacio>
          {termino
            ? `Ningún cliente de ${tenant.nombre} coincide con “${termino}”.`
            : `${tenant.nombre} todavía no tiene clientes cargados.`}
        </Vacio>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full min-w-[620px] border-collapse text-ui">
            <thead>
              <tr className="border-b border-line">
                <th scope="col" className={`${TH} w-full`}>Cliente</th>
                <th scope="col" className={TH}>Teléfono</th>
                <th scope="col" className={TH}>Vehículos</th>
                <th scope="col" className={TH}>Último service</th>
              </tr>
            </thead>
            <tbody>
              {clientes.map((c) => (
                <tr key={c.id} className="border-b border-line last:border-b-0">
                  <td className={TD}>
                    <span className="font-semibold text-ink">{c.nombre}</span>
                    {c.patentes_lista && (
                      <span className="block text-label text-ink-40">
                        {c.patentes_lista}
                      </span>
                    )}
                  </td>
                  <td className={`${TD} whitespace-nowrap text-ink-60`}>
                    {c.telefono}
                  </td>
                  <td className={`${TD} text-ink-60`}>{c.cantidad_vehiculos}</td>
                  <td className={`${TD} whitespace-nowrap text-ink-60`}>
                    {c.ultimo_service_fecha ? (
                      formatearFecha(c.ultimo_service_fecha)
                    ) : (
                      <span className="text-ink-40">nunca</span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <Paginacion
        base={`/fidelli/${tenant.id}?tab=datos&ver=clientes${q ? `&q=${encodeURIComponent(q)}` : ""}`}
        pagina={pagina}
        total={count ?? 0}
      />
    </div>
  );
}

// ---------- Vehículos ----------
async function ListaVehiculos({
  tenant,
  q,
  pagina,
}: {
  tenant: Tenant;
  q: string | undefined;
  pagina: number;
}) {
  const supabase = await createClient();
  const patente = q ? normalizarPatente(q) : null;

  let consulta = supabase
    .from("vista_vehiculos")
    .select(
      "id, patente, marca, modelo, anio, cantidad_services, ultimo_service_fecha, clientes(nombre)",
      { count: "exact" },
    )
    // Misma historia que vista_clientes: security_invoker, filtro explícito.
    .eq("lubricentro_id", tenant.id)
    .order("patente")
    .range((pagina - 1) * POR_PAGINA, pagina * POR_PAGINA - 1);

  if (patente) consulta = consulta.like("patente_normalizada", `%${patente}%`);

  const { data, count } = await consulta;
  const vehiculos = data ?? [];

  // El PRIMER service no anulado de cada auto de esta página: de ahí sale
  // la ventana de 72 hs. Una consulta para toda la página, no una por auto.
  const { data: primeros } = vehiculos.length
    ? await supabase
        .from("services")
        .select("vehiculo_id, created_at")
        .in("vehiculo_id", vehiculos.map((v) => v.id!))
        .eq("anulado", false)
        .order("created_at")
    : { data: [] };

  const primerServicePorVehiculo = new Map<string, string>();
  for (const s of primeros ?? []) {
    // Vienen ordenados ascendente: el primero que se ve de cada auto es el suyo.
    if (!primerServicePorVehiculo.has(s.vehiculo_id)) {
      primerServicePorVehiculo.set(s.vehiculo_id, s.created_at);
    }
  }

  return (
    <div className="flex flex-col gap-5">
    <div className="surface-card overflow-hidden">
      <div className="border-b border-line p-3">
        <Buscador
          ruta={`/fidelli/${tenant.id}`}
          valor={q}
          placeholder="Buscar por patente…"
          etiqueta="Buscar vehículos de este lubricentro"
          paramsExtra={{ tab: "datos", ver: "vehiculos" }}
        />
      </div>

      {vehiculos.length === 0 ? (
        <Vacio>
          {q
            ? `Ningún vehículo de ${tenant.nombre} coincide con “${q}”.`
            : `${tenant.nombre} todavía no tiene vehículos cargados.`}
        </Vacio>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full min-w-[720px] border-collapse text-ui">
            <thead>
              <tr className="border-b border-line">
                <th scope="col" className={TH}>Patente</th>
                <th scope="col" className={`${TH} w-full`}>Vehículo</th>
                <th scope="col" className={TH}>Cliente</th>
                <th scope="col" className={TH}>Services</th>
                <th scope="col" className={TH}>Último</th>
                <th scope="col" className={TH}>
                  <span className="sr-only">Corrección de patente</span>
                </th>
              </tr>
            </thead>
            <tbody>
              {vehiculos.map((v) => (
                <FilaVehiculoFidelli
                  key={v.id}
                  lubricentroId={tenant.id}
                  vehiculo={{
                    id: v.id!,
                    patente: v.patente!,
                    vehiculo:
                      [v.marca, v.modelo].filter(Boolean).join(" ") || null,
                    anio: v.anio,
                    cliente: v.clientes?.nombre ?? null,
                    cantidadServices: v.cantidad_services ?? 0,
                    ultimoServiceFecha: v.ultimo_service_fecha,
                    primerServiceEn:
                      primerServicePorVehiculo.get(v.id!) ?? null,
                  }}
                />
              ))}
            </tbody>
          </table>
        </div>
      )}

      <Paginacion
        base={`/fidelli/${tenant.id}?tab=datos&ver=vehiculos${q ? `&q=${encodeURIComponent(q)}` : ""}`}
        pagina={pagina}
        total={count ?? 0}
      />
    </div>

    <HistorialCorrecciones lubricentroId={tenant.id} />
    </div>
  );
}

// ---------- Services: la única lista con una acción ----------
async function ListaServices({
  tenant,
  params,
  pagina,
}: {
  tenant: Tenant;
  params: ParamsFicha;
  pagina: number;
}) {
  const supabase = await createClient();

  const q = params.q?.trim() || undefined;
  const sucursal = params.sucursal || undefined;
  const desde = params.desde && FECHA.test(params.desde) ? params.desde : undefined;
  const hasta = params.hasta && FECHA.test(params.hasta) ? params.hasta : undefined;
  const patente = q ? normalizarPatente(q) : null;

  let consulta = supabase
    .from("services")
    .select(
      `id, fecha, created_at, kilometros, anulado, desbloqueado_hasta,
       vehiculos!inner(patente, patente_normalizada, marca, modelo, clientes(nombre)),
       sucursales(nombre),
       desbloqueador:usuarios!desbloqueado_por(nombre)`,
      { count: "exact" },
    )
    // services SÍ tiene lubricentro_id propio, pero el RLS no lo usa para
    // un superadmin: el filtro va igual y explícito.
    .eq("lubricentro_id", tenant.id)
    .order("fecha", { ascending: false })
    .order("created_at", { ascending: false })
    .range((pagina - 1) * POR_PAGINA, pagina * POR_PAGINA - 1);

  if (patente) {
    consulta = consulta.like("vehiculos.patente_normalizada", `%${patente}%`);
  }
  if (sucursal) consulta = consulta.eq("sucursal_id", sucursal);
  if (desde) consulta = consulta.gte("fecha", desde);
  if (hasta) consulta = consulta.lte("fecha", hasta);

  const [serviciosRes, sucursalesRes] = await Promise.all([
    consulta,
    supabase
      .from("sucursales")
      .select("id, nombre")
      .eq("lubricentro_id", tenant.id)
      .order("nombre"),
  ]);

  const services = serviciosRes.data ?? [];
  const sucursales = sucursalesRes.data ?? [];

  const filtrosUrl = new URLSearchParams({ tab: "datos", ver: "services" });
  if (q) filtrosUrl.set("q", q);
  if (sucursal) filtrosUrl.set("sucursal", sucursal);
  if (desde) filtrosUrl.set("desde", desde);
  if (hasta) filtrosUrl.set("hasta", hasta);

  return (
    <div className="surface-card overflow-hidden">
      <div className="flex flex-col gap-3 border-b border-line p-3">
        <Buscador
          ruta={`/fidelli/${tenant.id}`}
          valor={q}
          placeholder="Buscar por patente…"
          etiqueta="Buscar services de este lubricentro"
          paramsExtra={{ tab: "datos", ver: "services", sucursal, desde, hasta }}
        />

        <form
          action={`/fidelli/${tenant.id}`}
          className="flex flex-wrap items-end gap-2"
        >
          <input type="hidden" name="tab" value="datos" />
          <input type="hidden" name="ver" value="services" />
          {q && <input type="hidden" name="q" value={q} />}

          <label className="flex flex-col gap-1 text-label text-ink-60">
            Sucursal
            <select
              name="sucursal"
              defaultValue={sucursal ?? ""}
              className="h-10 rounded-md border border-line bg-base px-2.5 text-ui text-ink"
            >
              <option value="">Todas</option>
              {sucursales.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.nombre}
                </option>
              ))}
            </select>
          </label>

          <label className="flex flex-col gap-1 text-label text-ink-60">
            Desde
            <input
              type="date"
              name="desde"
              defaultValue={desde ?? ""}
              className="h-10 rounded-md border border-line bg-base px-2.5 text-ui text-ink"
            />
          </label>

          <label className="flex flex-col gap-1 text-label text-ink-60">
            Hasta
            <input
              type="date"
              name="hasta"
              defaultValue={hasta ?? ""}
              className="h-10 rounded-md border border-line bg-base px-2.5 text-ui text-ink"
            />
          </label>

          <button
            type="submit"
            className="h-10 rounded-md border border-line bg-base px-3 text-ui font-semibold text-ink hover:bg-surface"
          >
            Filtrar
          </button>

          {(sucursal || desde || hasta) && (
            <Link
              href={`/fidelli/${tenant.id}?tab=datos&ver=services${q ? `&q=${encodeURIComponent(q)}` : ""}`}
              className="flex h-10 items-center px-2 text-ui font-semibold text-ink-60 hover:text-ink"
            >
              Limpiar
            </Link>
          )}
        </form>
      </div>

      {services.length === 0 ? (
        <Vacio>
          {q || sucursal || desde || hasta
            ? "Ningún service de este lubricentro coincide con los filtros."
            : `${tenant.nombre} todavía no cargó ningún service.`}
        </Vacio>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full min-w-[760px] border-collapse text-ui">
            <thead>
              <tr className="border-b border-line">
                <th scope="col" className={TH}>Fecha</th>
                <th scope="col" className={TH}>Patente</th>
                <th scope="col" className={`${TH} w-full`}>Vehículo</th>
                <th scope="col" className={TH}>Sucursal</th>
                <th scope="col" className={`${TH} text-right`}>Km</th>
                <th scope="col" className={TH}>Edición</th>
                <th scope="col" className={TH}>
                  <span className="sr-only">Acciones</span>
                </th>
              </tr>
            </thead>
            <tbody>
              {services.map((s) => (
                <FilaServiceFidelli
                  key={s.id}
                  lubricentroId={tenant.id}
                  service={{
                    id: s.id,
                    fecha: s.fecha,
                    patente: s.vehiculos.patente,
                    vehiculo:
                      [s.vehiculos.marca, s.vehiculos.modelo]
                        .filter(Boolean)
                        .join(" ") || null,
                    cliente: s.vehiculos.clientes?.nombre ?? null,
                    sucursal: s.sucursales?.nombre ?? "",
                    kilometros: s.kilometros,
                    desbloqueadoPor: s.desbloqueador?.nombre ?? null,
                  }}
                  estado={estadoService(s)}
                />
              ))}
            </tbody>
          </table>
        </div>
      )}

      <Paginacion
        base={`/fidelli/${tenant.id}?${filtrosUrl.toString()}`}
        pagina={pagina}
        total={serviciosRes.count ?? 0}
      />
    </div>
  );
}

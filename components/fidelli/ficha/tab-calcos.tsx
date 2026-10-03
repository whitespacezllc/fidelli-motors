import { createClient } from "@/lib/supabase/server";
import { fechaCalendarioAR, formatearFecha, hoyISO } from "@/lib/fechas";
import { pesos } from "@/lib/fidelli/plan";
import { calcosIncluidosDelPlan, leerEncargos } from "@/lib/fidelli/calcos";
import { cantidadDicha, leerStock, ritmoDicho, semanasDichas } from "@/lib/stock-calcos";
import { Chip } from "@/components/fidelli/chip";
import { TablaEncargos } from "@/components/fidelli/calcos/tabla-encargos";
import { SubirDiseno } from "@/components/fidelli/calcos/subir-diseno";
import { DialogPedidoIncluido } from "@/components/fidelli/calcos/dialog-pedido-incluido";
import { DialogCalcosPropias } from "@/components/fidelli/calcos/dialog-calcos-propias";
import { PanelFicha, Dato, SinDato } from "./panel-dato";
import { DialogPedidoCalcos } from "./dialog-pedido-calcos";
import type { Tenant } from "./tipos";

type Entrega = {
  id: string;
  fecha: string;
  cantidad: number;
  incluidas: boolean;
  monto_ars: number | null;
  nota: string | null;
};

const ENTERO = new Intl.NumberFormat("es-AR", { maximumFractionDigits: 0 });

// La URL firmada del diseño dura una hora: el bucket `calcos` es privado.
const UNA_HORA = 60 * 60;

// ============================================================
// La solapa Calcos de la ficha: el diseño, los pedidos, el stock y el libro.
//
// Son cuatro cosas distintas y conviene no mezclarlas:
//   · el DISEÑO es el archivo que se imprime, con sus versiones;
//   · el PEDIDO (encargos_calcos) tiene ciclo de vida y lo movemos desde
//     acá o desde la cola;
//   · el STOCK es una cuenta, no un dato guardado (`stock_calcos()`):
//     entregadas menos autos nuevos, o lo que el dueño contó. Acá también
//     se marca al que imprime por su cuenta, al que no se le estima nada;
//   · el LIBRO (pedidos_calcos) es la constancia de lo entregado: lo
//     escribe «Entregado», y a mano solo como corrección.
//
// Como toda la ficha: cada consulta filtra por el id del tenant, porque a
// un superadmin el RLS no le recorta nada.
// ============================================================
export async function TabCalcos({
  tenant,
  planNombre,
}: {
  tenant: Tenant;
  planNombre: string | null;
}) {
  const supabase = await createClient();

  const [disenosRes, encargosRes, libroRes, sucursalRes, stockRes, propiasRes] = await Promise.all([
    supabase
      .from("disenos_calco")
      .select("id, version, ruta, actual, nota, created_at")
      .eq("lubricentro_id", tenant.id)
      .order("version", { ascending: false }),
    // Los pedidos con su costo y su ganancia: la tabla no le da el costo a
    // `authenticated`, lo trae la función con guarda de superadmin.
    supabase.rpc("encargos_calcos_admin", { p_lubricentro_id: tenant.id }),
    supabase
      .from("pedidos_calcos")
      .select("id, fecha, cantidad, incluidas, monto_ars, nota")
      .eq("lubricentro_id", tenant.id)
      .order("fecha", { ascending: false })
      .order("created_at", { ascending: false }),
    // Para sugerir la dirección de un envío: la primera sucursal activa.
    supabase
      .from("sucursales")
      .select("direccion, telefono")
      .eq("lubricentro_id", tenant.id)
      .eq("activa", true)
      .order("created_at")
      .limit(1)
      .maybeSingle(),
    // Cuántas le quedan, según la cuenta. Null en todo sin entregas o si
    // imprime por su cuenta.
    supabase.rpc("stock_calcos", { p_lubricentro_id: tenant.id }),
    // La última vez que se movió el switch: la nota y la fecha.
    supabase
      .from("tenant_eventos")
      .select("motivo, ocurrido_at")
      .eq("lubricentro_id", tenant.id)
      .eq("tipo", "edicion")
      .not("despues->>calcos_propias", "is", null)
      .order("ocurrido_at", { ascending: false })
      .limit(1)
      .maybeSingle(),
  ]);

  const stock = leerStock(stockRes.data);
  const propias = propiasRes.data;
  const disenos = disenosRes.data ?? [];
  // En la ficha, el pedido más nuevo arriba (la cola tiene su propio orden).
  const encargos = leerEncargos(encargosRes.data).sort((a, b) => b.numero - a.numero);
  const libro = ((libroRes.data ?? []) as unknown as Entrega[]).map((p) => ({
    ...p,
    cantidad: Number(p.cantidad),
    monto_ars: p.monto_ars == null ? null : Number(p.monto_ars),
  }));

  // Una sola llamada para firmar todas las versiones.
  const firmadas = new Map<string, string>();
  if (disenos.length > 0) {
    const { data } = await supabase.storage
      .from("calcos")
      .createSignedUrls(disenos.map((d) => d.ruta), UNA_HORA);
    for (const f of data ?? []) {
      if (f.path && f.signedUrl) firmadas.set(f.path, f.signedUrl);
    }
  }

  const incluidas = libro.filter((p) => p.incluidas).reduce((n, p) => n + p.cantidad, 0);
  const cobradas = libro.filter((p) => !p.incluidas).reduce((n, p) => n + p.cantidad, 0);
  const cobradoArs = libro.reduce((n, p) => n + (p.monto_ars ?? 0), 0);

  return (
    <div className="flex flex-col gap-5" data-calcos>
      {/* ============ El diseño ============ */}
      <PanelFicha
        titulo="Diseño"
        acciones={<SubirDiseno lubricentroId={tenant.id} nombre={tenant.nombre} />}
      >
        {disenos.length === 0 ? (
          <p className="py-3 text-ui text-ink-60">
            Todavía no subimos ningún diseño para este lubricentro. La primera versión que subas
            queda como la actual.
          </p>
        ) : (
          <ul className="flex flex-wrap gap-x-5 gap-y-4 py-3">
            {disenos.map((d) => {
              const url = firmadas.get(d.ruta);
              const esPdf = d.ruta.endsWith(".pdf");
              return (
                <li
                  key={d.id}
                  data-diseno={d.version}
                  data-actual={d.actual ? "si" : "no"}
                  className="flex w-36 flex-col gap-1.5"
                >
                  {/* 5 × 8 cm: la proporción del calco. El diseño va entero
                      adentro (object-contain): un archivo de otra proporción
                      no se recorta. */}
                  <a
                    href={url}
                    target="_blank"
                    rel="noreferrer"
                    aria-label={`Abrir el diseño versión ${d.version}`}
                    className={`flex aspect-[5/8] w-24 items-center justify-center overflow-hidden rounded-md border bg-surface ${
                      d.actual ? "border-ink" : "border-line"
                    }`}
                  >
                    {esPdf || !url ? (
                      <span className="text-label font-semibold tracking-[0.06em] text-ink-60 uppercase">
                        {esPdf ? "PDF" : "Sin vista"}
                      </span>
                    ) : (
                      // <img> y no next/image: la URL es firmada, de un bucket
                      // privado y vence en una hora. El optimizador de Next la
                      // bajaría y la volvería a servir desde su propia caché.
                      // eslint-disable-next-line @next/next/no-img-element
                      <img
                        src={url}
                        alt={`Diseño versión ${d.version}`}
                        className="h-full w-full object-contain"
                      />
                    )}
                  </a>
                  <p className="flex flex-wrap items-center gap-1.5 text-ui">
                    <span className="font-semibold text-ink tabular-nums">v{d.version}</span>
                    {d.actual && <Chip tono="ok">actual</Chip>}
                  </p>
                  <p className="text-label text-ink-60 tabular-nums">
                    {formatearFecha(fechaCalendarioAR(new Date(d.created_at)))}
                  </p>
                  {d.nota && <p className="text-label text-ink-40">{d.nota}</p>}
                </li>
              );
            })}
          </ul>
        )}
        <p className="border-t border-line py-2.5 text-label text-ink-60">
          La versión marcada es la que ve el lubricentro y la que se imprime. Subir una nueva no
          borra las anteriores.
        </p>
      </PanelFicha>

      {/* ============ Los pedidos ============ */}
      <PanelFicha
        titulo="Pedidos"
        acciones={
          <DialogPedidoIncluido
            lubricentroId={tenant.id}
            nombre={tenant.nombre}
            cantidadSugerida={calcosIncluidosDelPlan(planNombre)}
            direccionSugerida={sucursalRes.data?.direccion ?? null}
            telefonoSugerido={sucursalRes.data?.telefono ?? null}
          />
        }
      >
        {encargos.length === 0 ? (
          <p className="py-3 text-ui text-ink-60">
            Este lubricentro todavía no tiene pedidos. Los calcos del alta se cargan con «+ Pedido
            incluido en el plan» y siguen el mismo camino que uno comprado.
          </p>
        ) : (
          <div className="-mx-4.5">
            <TablaEncargos encargos={encargos} />
          </div>
        )}
        <p className="border-t border-line py-2.5 text-label text-ink-60">
          «Entregado» registra la entrega en el libro con la cantidad y el monto, y el contador
          del lubricentro sube solo. Un pedido entregado no se edita.
        </p>
      </PanelFicha>

      {/* ============ El stock ============
          La estimación que ve el dueño en Mi cuenta → Calcos, y el switch
          del que imprime por su cuenta. */}
      <PanelFicha
        titulo="Stock"
        acciones={
          <DialogCalcosPropias
            lubricentroId={tenant.id}
            nombre={tenant.nombre}
            propias={tenant.calcos_propias}
          />
        }
      >
        <dl>
          <Dato etiqueta="Le quedan">
            <span data-stock-ficha>
              {stock ? (
                <>
                  <span className="font-semibold tabular-nums">
                    unas {cantidadDicha(stock.stock)}
                  </span>
                  <span className="block text-label text-ink-60 tabular-nums">
                    {stock.ritmo != null
                      ? ritmoDicho(stock.ritmo)
                      : "todavía sin ritmo: menos de 2 semanas de trabajos"}
                    {stock.semanas != null && ` · alcanzan para ${semanasDichas(stock.semanas)}`}
                  </span>
                  <span className="block text-label text-ink-40 tabular-nums">
                    {stock.baseRecuentoAt
                      ? `según su recuento del ${formatearFecha(fechaCalendarioAR(new Date(stock.baseRecuentoAt)))}`
                      : "entregadas menos autos nuevos desde la primera entrega"}
                  </span>
                </>
              ) : tenant.calcos_propias ? (
                <SinDato>sin estimación: imprime por su cuenta</SinDato>
              ) : (
                <SinDato>sin entregas en el libro: no hay nada que estimar</SinDato>
              )}
            </span>
          </Dato>
          <Dato etiqueta="Impresión">
            <span data-calcos-propias={tenant.calcos_propias ? "si" : "no"}>
              {tenant.calcos_propias ? (
                <>
                  <span className="font-semibold">Imprime sus calcos por su cuenta</span>
                  <span className="block text-label text-ink-60">
                    Sin aviso, sin mails y fuera de la lista de los que se quedan sin calcos.
                  </span>
                </>
              ) : (
                <>Se los imprimimos nosotros</>
              )}
              {propias?.motivo && (
                <span className="block text-label text-ink-40 tabular-nums">
                  {formatearFecha(fechaCalendarioAR(new Date(propias.ocurrido_at)))} · {propias.motivo}
                </span>
              )}
            </span>
          </Dato>
        </dl>
      </PanelFicha>

      {/* ============ El libro de entregas ============
          El contador es la suma de estas filas. Cada una queda para
          siempre; el slug se cierra en cuanto el total pasa de cero. */}
      <div data-libro>
        <PanelFicha
          titulo="Libro de entregas"
          acciones={
            <DialogPedidoCalcos lubricentroId={tenant.id} nombre={tenant.nombre} hoy={hoyISO()} />
          }
        >
          <dl>
            <Dato etiqueta="Entregadas">
              {tenant.calcos_entregadas > 0 ? (
                <>
                  <span className="font-semibold tabular-nums">
                    {ENTERO.format(tenant.calcos_entregadas)}
                  </span>
                  <span className="block text-label text-ink-60 tabular-nums">
                    {ENTERO.format(incluidas)} incluidas · {ENTERO.format(cobradas)} cobradas
                    {cobradoArs > 0 ? ` · ${pesos(cobradoArs)} cobrados` : ""}
                  </span>
                  <span className="block text-label text-ink-40">el slug queda cerrado</span>
                </>
              ) : (
                <SinDato>ninguna todavía · el slug se puede cambiar</SinDato>
              )}
            </Dato>
          </dl>

          {libro.length > 0 && (
            <ul className="divide-y divide-line border-t border-line">
              {libro.map((p) => (
                <li key={p.id} className="flex flex-wrap items-baseline gap-x-3 gap-y-0.5 py-2 text-ui">
                  <span className="tabular-nums text-ink-60">{formatearFecha(p.fecha)}</span>
                  <span className="font-semibold tabular-nums text-ink">
                    {ENTERO.format(p.cantidad)} calcos
                  </span>
                  <span className="text-ink-60">
                    {p.incluidas
                      ? "incluidas"
                      : `cobradas${p.monto_ars != null ? ` · ${pesos(p.monto_ars)}` : ""}`}
                  </span>
                  {p.nota && <span className="text-label text-ink-40">{p.nota}</span>}
                </li>
              ))}
            </ul>
          )}
        </PanelFicha>
      </div>
    </div>
  );
}

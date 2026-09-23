import { createClient } from "@/lib/supabase/server";
import { formatearFecha, formatearFechaHora, hoyISO } from "@/lib/fechas";
import {
  CONDICION_FOUNDING,
  abonoMensual,
  descuentoDeLista,
  esFounding,
  pesos,
  porcentaje,
} from "@/lib/fidelli/plan";
import { PanelFicha, Dato, SinDato, Metrica } from "./panel-dato";
import { DialogPedidoCalcos } from "./dialog-pedido-calcos";
import type { SuscripcionVigente, Tenant } from "./tipos";
import type { EstadoOwner } from "@/components/fidelli/tipos";

type Metricas = {
  services_mes: number;
  clientes: number;
  vehiculos: number;
  flota: number;
  escaneados: number;
  recuperados: number;
  ultimo_service: { creado: string; fecha: string; sucursal: string } | null;
};

type Activacion = {
  trabajos_7d: number;
  activado: boolean;
  fecha_alta: string;
  dia: number;
  en_curso: boolean;
};

type Uso = {
  dias: number;
  trabajos: number;
  service: number;
  mecanica: number;
  neumaticos: number;
  recordatorios: number;
  escaneos: number;
  autos_volvieron: number;
};

type Pedido = {
  id: string;
  fecha: string;
  cantidad: number;
  incluidas: boolean;
  monto_ars: number | null;
  nota: string | null;
};

const ETIQUETA_OWNER: Record<EstadoOwner, string> = {
  activo: "activo",
  pendiente: "invitación pendiente",
  sin_owner: "sin owner",
};

const COLOR_OWNER: Record<EstadoOwner, string> = {
  activo: "text-success",
  pendiente: "text-ink-60",
  sin_owner: "text-overdue",
};

const ENTERO = new Intl.NumberFormat("es-AR", { maximumFractionDigits: 0 });

export async function TabResumen({
  tenant,
  suscripcion,
  estadoOwner,
}: {
  tenant: Tenant;
  suscripcion: SuscripcionVigente | null;
  /** Lo resuelve la página (una sola llamada a estado_owner(id) para la
   *  cabecera y esta pestaña). */
  estadoOwner: EstadoOwner;
}) {
  const supabase = await createClient();

  // Las consultas de la pestaña, en paralelo. Todas llevan su
  // .eq("lubricentro_id") o el id como argumento: acá el RLS no recorta.
  const [ownerRes, sucursalesRes, configRes, metricasRes, activacionRes, usoRes, pedidosRes] =
    await Promise.all([
      supabase
        .from("usuarios")
        .select("nombre, email")
        .eq("lubricentro_id", tenant.id)
        .eq("rol", "owner")
        .maybeSingle(),
      supabase
        .from("sucursales")
        .select("nombre, telefono, activa")
        .eq("lubricentro_id", tenant.id)
        .order("activa", { ascending: false })
        .order("nombre"),
      supabase
        .from("config_experiencia")
        .select("datos_contacto")
        .eq("lubricentro_id", tenant.id)
        .maybeSingle(),
      supabase.rpc("metricas_tenant", { p_lubricentro_id: tenant.id }),
      // Bloque 3: la activación, el uso de los últimos 30 días y los
      // pedidos de calcos.
      supabase.rpc("activacion_tenant", { p_lubricentro_id: tenant.id }),
      supabase.rpc("uso_tenant", { p_lubricentro_id: tenant.id, p_dias: 30 }),
      supabase
        .from("pedidos_calcos")
        .select("id, fecha, cantidad, incluidas, monto_ars, nota")
        .eq("lubricentro_id", tenant.id)
        .order("fecha", { ascending: false })
        .order("created_at", { ascending: false }),
    ]);

  const m = (metricasRes.data ?? {}) as Partial<Metricas>;
  const owner = ownerRes.data;
  const sucursales = sucursalesRes.data ?? [];
  const contacto = (configRes.data?.datos_contacto ?? {}) as {
    telefono?: string;
  };
  const activacion = ((activacionRes.data ?? []) as unknown as Activacion[])[0] ?? null;
  const uso = (usoRes.data ?? null) as Uso | null;
  const pedidos = ((pedidosRes.data ?? []) as unknown as Pedido[]).map((p) => ({
    ...p,
    cantidad: Number(p.cantidad),
    monto_ars: p.monto_ars == null ? null : Number(p.monto_ars),
  }));

  // El teléfono de la marca es el de contacto; si no lo cargaron, el de la
  // primera sucursal que tenga uno sirve igual para llamarlo.
  const telefono =
    contacto.telefono?.trim() ||
    sucursales.find((s) => s.telefono?.trim())?.telefono ||
    null;

  const plan = suscripcion?.plan ?? null;
  const abono = plan
    ? abonoMensual(plan, suscripcion!.periodo, suscripcion!.descuento_pct)
    : null;
  const descuentoLista = plan ? descuentoDeLista(plan, suscripcion!.periodo) : 0;

  const escaneo =
    (m.flota ?? 0) > 0
      ? Math.round(((m.escaneados ?? 0) / (m.flota ?? 1)) * 100)
      : null;

  const calcosIncluidas = pedidos.filter((p) => p.incluidas).reduce((n, p) => n + p.cantidad, 0);
  const calcosCobradas = pedidos.filter((p) => !p.incluidas).reduce((n, p) => n + p.cantidad, 0);
  const cobradoArs = pedidos.reduce((n, p) => n + (p.monto_ars ?? 0), 0);

  return (
    <div className="flex flex-col gap-5">
      <div className="grid gap-5 lg:grid-cols-2">
        <PanelFicha titulo="Datos de la marca">
          <dl>
            <Dato etiqueta="Owner">
              {owner ? (
                <>
                  <span className="font-semibold">{owner.nombre}</span>
                  <span className="text-ink-60"> · {owner.email}</span>
                  <span className={`block text-label ${COLOR_OWNER[estadoOwner]}`}>
                    {ETIQUETA_OWNER[estadoOwner]}
                  </span>
                </>
              ) : (
                <span className="text-overdue">
                  Sin owner — la invitación nunca llegó a crear el usuario
                </span>
              )}
            </Dato>

            <Dato etiqueta="Teléfono">
              {telefono ?? <SinDato>sin teléfono cargado</SinDato>}
            </Dato>

            <Dato etiqueta="Sucursales">
              {sucursales.length > 0 ? (
                sucursales.map((s) => s.nombre).join(" · ")
              ) : (
                <SinDato>ninguna</SinDato>
              )}
            </Dato>
          </dl>
        </PanelFicha>

        <PanelFicha titulo="Plan vigente">
          <dl>
            {suscripcion && plan && abono !== null ? (
              <>
                <Dato etiqueta="Abono">
                  <span className="font-brand text-lead font-bold">
                    {pesos(abono)}/mes
                  </span>
                  {(suscripcion.descuento_pct > 0 || descuentoLista > 0) && (
                    <span className="block text-label text-ink-60">
                      {suscripcion.descuento_pct > 0 &&
                        `−${porcentaje(suscripcion.descuento_pct)} propio · `}
                      {descuentoLista > 0 &&
                        `−${porcentaje(descuentoLista)} por ${suscripcion.periodo} · `}
                      sobre lista {pesos(plan.precio_mensual)}
                    </span>
                  )}
                </Dato>

                <Dato etiqueta="Próximo vencimiento">
                  {formatearFecha(suscripcion.vencimiento)}
                </Dato>

                <Dato etiqueta="Plan">{plan.nombre}</Dato>

                {suscripcion.descuento_pct > 0 && (
                  <Dato etiqueta="Condición del trato">
                    {esFounding(suscripcion.descuento_pct) ? (
                      `founding: ${CONDICION_FOUNDING}`
                    ) : (
                      <SinDato>acordada fuera del sistema</SinDato>
                    )}
                  </Dato>
                )}
              </>
            ) : (
              <Dato etiqueta="Suscripción">
                <SinDato>este lubricentro no tiene ninguna</SinDato>
              </Dato>
            )}
          </dl>
        </PanelFicha>
      </div>

      <div>
        <h2 className="mb-3 font-brand text-ui font-bold tracking-[0.04em] text-ink-60 uppercase">
          Métricas del tenant
        </h2>
        <div className="grid gap-3 sm:grid-cols-3">
          <Metrica
            valor={String(m.services_mes ?? 0)}
            etiqueta="Trabajos del mes"
          />
          <Metrica
            valor={String(m.clientes ?? 0)}
            etiqueta="Clientes"
            pie={`${m.vehiculos ?? 0} vehículos`}
          />
          <Metrica
            valor={escaneo === null ? "—" : `${escaneo}%`}
            etiqueta="Escaneo de landing"
            pie={
              escaneo === null
                ? "sin flota en 12 meses"
                : `${m.escaneados ?? 0} de ${m.flota ?? 0} autos`
            }
          />
        </div>
      </div>

      {/* ============ Uso · últimos 30 días (bloque MÉTRICAS 3) ============
          Lo que el taller hace con la base: cuánto carga y de qué tipo,
          cuántos recordatorios dispara, cuántos escaneos recibe y cuántos
          autos volvieron después de un recordatorio (60 días, la
          definición nueva, que reemplaza en el admin a «recuperados del
          mes»). */}
      <div>
        <h2 className="mb-3 font-brand text-ui font-bold tracking-[0.04em] text-ink-60 uppercase">
          Uso · últimos {uso?.dias ?? 30} días
        </h2>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <Metrica
            valor={String(uso?.trabajos ?? 0)}
            etiqueta="Trabajos"
            pie={`${uso?.service ?? 0} service · ${uso?.mecanica ?? 0} mecánica · ${uso?.neumaticos ?? 0} neumáticos`}
          />
          <Metrica
            valor={String(uso?.recordatorios ?? 0)}
            etiqueta="Recordatorios disparados"
            pie="clics en WhatsApp desde el panel"
          />
          <Metrica
            valor={String(uso?.escaneos ?? 0)}
            etiqueta="Escaneos"
            pie="búsquedas de patente en su página"
          />
          <Metrica
            valor={String(uso?.autos_volvieron ?? 0)}
            etiqueta="Autos que volvieron"
            pie="con un recordatorio en los 60 días previos"
          />
        </div>
      </div>

      <div className="grid gap-5 lg:grid-cols-2">
        {/* ============ Activación (docs/METRICAS.md § 1) ============ */}
        <PanelFicha titulo="Activación">
          <dl>
            <Dato etiqueta="Primera semana">
              {activacion ? (
                <>
                  <span className="font-semibold tabular-nums">
                    {activacion.trabajos_7d}{" "}
                    {activacion.trabajos_7d === 1 ? "trabajo" : "trabajos"} en la primera semana
                  </span>
                  <span
                    className={`block text-label ${
                      activacion.activado
                        ? "text-success"
                        : activacion.en_curso
                          ? "text-ink-60"
                          : "text-overdue"
                    }`}
                  >
                    {activacion.activado
                      ? "activado"
                      : activacion.en_curso
                        ? `en curso, día ${activacion.dia} de 7`
                        : "no activado"}
                  </span>
                </>
              ) : (
                <SinDato>sin datos</SinDato>
              )}
            </Dato>
            <Dato etiqueta="La regla">
              <span className="text-ink-60">20 o más trabajos en los 7 días desde el alta</span>
            </Dato>
          </dl>
        </PanelFicha>

        <PanelFicha titulo="Actividad">
          <dl>
            <Dato etiqueta="Último service cargado">
              {m.ultimo_service ? (
                <>
                  {formatearFechaHora(m.ultimo_service.creado)}
                  <span className="text-ink-60"> · {m.ultimo_service.sucursal}</span>
                </>
              ) : (
                <SinDato>todavía no cargaron ninguno</SinDato>
              )}
            </Dato>
          </dl>
        </PanelFicha>
      </div>

      {/* ============ Calcos (bloque MÉTRICAS 3) ============
          El contador es la suma de los pedidos. Cada pedido queda para
          siempre; el slug se cierra en cuanto el total pasa de cero. */}
      <PanelFicha
        titulo="Calcos"
        acciones={<DialogPedidoCalcos lubricentroId={tenant.id} nombre={tenant.nombre} hoy={hoyISO()} />}
      >
        <dl>
          <Dato etiqueta="Entregadas">
            {tenant.calcos_entregadas > 0 ? (
              <>
                <span className="font-semibold tabular-nums">{ENTERO.format(tenant.calcos_entregadas)}</span>
                <span className="block text-label text-ink-60 tabular-nums">
                  {ENTERO.format(calcosIncluidas)} incluidas · {ENTERO.format(calcosCobradas)} cobradas
                  {cobradoArs > 0 ? ` · ${pesos(cobradoArs)} cobrados` : ""}
                </span>
                <span className="block text-label text-ink-40">el slug queda cerrado</span>
              </>
            ) : (
              <SinDato>ninguna todavía · el slug se puede cambiar</SinDato>
            )}
          </Dato>
          <Dato etiqueta="Último pedido">
            {pedidos[0] ? (
              <span className="tabular-nums">
                {formatearFecha(pedidos[0].fecha)} · {ENTERO.format(pedidos[0].cantidad)}{" "}
                {pedidos[0].incluidas ? "incluidas" : `cobradas${pedidos[0].monto_ars != null ? ` · ${pesos(pedidos[0].monto_ars)}` : ""}`}
              </span>
            ) : (
              <SinDato>—</SinDato>
            )}
          </Dato>
        </dl>

        {pedidos.length > 0 && (
          <ul className="mt-1 divide-y divide-line border-t border-line">
            {pedidos.map((p) => (
              <li key={p.id} className="flex flex-wrap items-baseline gap-x-3 gap-y-0.5 py-2 text-ui">
                <span className="tabular-nums text-ink-60">{formatearFecha(p.fecha)}</span>
                <span className="font-semibold tabular-nums text-ink">{ENTERO.format(p.cantidad)} calcos</span>
                <span className="text-ink-60">
                  {p.incluidas ? "incluidas" : `cobradas${p.monto_ars != null ? ` · ${pesos(p.monto_ars)}` : ""}`}
                </span>
                {p.nota && <span className="text-label text-ink-40">{p.nota}</span>}
              </li>
            ))}
          </ul>
        )}
      </PanelFicha>
    </div>
  );
}

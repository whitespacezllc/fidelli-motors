import { createClient } from "@/lib/supabase/server";
import { formatearFecha, formatearFechaHora } from "@/lib/fechas";
import { abonoMensual, descuentoDeLista, pesos, porcentaje } from "@/lib/fidelli/plan";
import { PanelFicha, Dato, SinDato, Metrica } from "./panel-dato";
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

export async function TabResumen({
  tenant,
  suscripcion,
}: {
  tenant: Tenant;
  suscripcion: SuscripcionVigente | null;
}) {
  const supabase = await createClient();

  // Las cuatro consultas de la pestaña, en paralelo. Las tres primeras
  // llevan su .eq("lubricentro_id") explícito: acá el RLS no recorta.
  const [ownerRes, sucursalesRes, configRes, metricasRes, ownersRes] =
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
      supabase.rpc("estados_owner"),
    ]);

  const m = (metricasRes.data ?? {}) as Partial<Metricas>;
  const owner = ownerRes.data;
  const sucursales = sucursalesRes.data ?? [];
  const contacto = (configRes.data?.datos_contacto ?? {}) as {
    telefono?: string;
  };

  const estadoOwner: EstadoOwner =
    ((ownersRes.data ?? []).find((o) => o.lubricentro_id === tenant.id)
      ?.estado as EstadoOwner) ?? "sin_owner";

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

            <Dato etiqueta="Calcos entregadas">
              {tenant.calcos_entregadas > 0 ? (
                <>
                  {tenant.calcos_entregadas}
                  <span className="block text-label text-ink-40">
                    el slug queda cerrado
                  </span>
                </>
              ) : (
                <SinDato>ninguna todavía</SinDato>
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
                    {suscripcion.descuento_pct === 50 ? (
                      "founding: case study + testimonio + referidos"
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
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <Metrica
            valor={String(m.services_mes ?? 0)}
            etiqueta="Services del mes"
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
          <Metrica
            valor={String(m.recuperados ?? 0)}
            etiqueta="Recuperados del mes"
            pie="volvieron dentro de 30 días"
          />
        </div>
      </div>

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
  );
}

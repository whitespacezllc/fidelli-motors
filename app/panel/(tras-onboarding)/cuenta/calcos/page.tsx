import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { obtenerSesion } from "@/lib/auth/session";
import { CabeceraSeccion } from "@/components/panel/cabecera-seccion";
import {
  PedidoDeCalcos,
  type CatalogoParaPedir,
  type PedidoEnPantalla,
} from "@/components/cuenta/calcos/pedido-de-calcos";
import type { OrdenDePago } from "@/components/suscripcion/pantalla-pago";
import {
  cantidadDeCalcos,
  DIAS_PARA_PAGAR,
  ESTADOS_EN_CAMINO,
  esEstadoEncargo,
  estadoDelPedido,
  estadoParaElTenant,
  numeroDeEncargo,
  type EstadoEncargo,
} from "@/lib/calcos";
import { estadoEfectivo } from "@/lib/cresium/orden";
import { fechaCalendarioAR, formatearFecha } from "@/lib/fechas";
import { pesos } from "@/lib/fidelli/plan";

export const metadata: Metadata = { title: "Calcos" };

// La pantalla de pago vive acá adentro: el estado de la transferencia
// cambia entre una carga y la siguiente. No se cachea.
export const dynamic = "force-dynamic";

// La URL firmada del diseño dura una hora: el bucket `calcos` es privado.
const UNA_HORA = 60 * 60;

// El color dice el momento, nunca con el rojo de marca: verde lo que llegó,
// ámbar lo que espera plata, gris lo que está en marcha, apagado lo que no
// siguió.
function tonoDelEstado(estado: EstadoEncargo): string {
  if (estado === "entregado") return "border-success bg-success-soft text-success";
  if (estado === "pendiente_pago") return "border-urgente bg-urgente-soft text-urgente";
  if (estado === "vencido" || estado === "cancelado") return "border-line bg-surface text-ink-40";
  return "border-line bg-surface text-ink-60";
}

function Pill({ estado, children }: { estado: EstadoEncargo; children: React.ReactNode }) {
  return (
    <span
      data-estado={estado}
      className={`inline-flex items-center rounded-sm border px-2 py-0.5 text-label font-semibold tabular-nums ${tonoDelEstado(estado)}`}
    >
      {children}
    </span>
  );
}

// ============================================================
// Mi cuenta → Calcos
//
// De arriba a abajo: tu calco y cuántos te entregamos; pedir más (o, con un
// pedido sin pagar, la pantalla de pago de ESE pedido); y tu historial.
//
// Las consultas no llevan filtro por lubricentro: en /panel el RLS ya
// recorta al tenant de la sesión. Y sobre `encargos_calcos` y
// `catalogo_calcos` las columnas van explícitas por dos razones: es la
// regla del repo, y el costo no está en el GRANT (un `select *` da 42501).
// ============================================================
export default async function PaginaCalcos() {
  const sesion = await obtenerSesion();
  if (!sesion?.lubricentroId) redirect("/login");
  if (sesion.rol !== "owner") redirect("/fidelli");

  const supabase = await createClient();

  const [lubricentroRes, disenoRes, catalogoRes, encargosRes, sucursalRes] = await Promise.all([
    supabase
      .from("lubricentros")
      .select("calcos_entregadas")
      .eq("id", sesion.lubricentroId)
      .maybeSingle(),
    supabase.from("disenos_calco").select("version, ruta").eq("actual", true).maybeSingle(),
    supabase
      .from("catalogo_calcos")
      .select("codigo, tipo, cantidad, precio_ars")
      .eq("activo", true)
      .order("orden"),
    supabase
      .from("encargos_calcos")
      .select(
        `id, numero, incluido, cantidad, rediseno, entrega, estado,
         monto_pack, monto_rediseno, monto_envio, monto_total,
         transportista, seguimiento, created_at`,
      )
      .order("numero", { ascending: false }),
    // Para sugerir la dirección de un envío: la primera sucursal activa.
    supabase
      .from("sucursales")
      .select("direccion, telefono")
      .eq("activa", true)
      .order("created_at")
      .limit(1)
      .maybeSingle(),
  ]);

  const entregadas = Number(lubricentroRes.data?.calcos_entregadas ?? 0);
  const diseno = disenoRes.data;

  const filas = catalogoRes.data ?? [];
  const precioDe = (codigo: string) => {
    const fila = filas.find((f) => f.codigo === codigo);
    return fila ? Number(fila.precio_ars) : null;
  };
  const catalogo: CatalogoParaPedir = {
    packs: filas
      .filter((f) => f.tipo === "pack" && f.cantidad != null)
      .map((f) => ({ codigo: f.codigo, cantidad: Number(f.cantidad), precio: Number(f.precio_ars) })),
    rediseno: precioDe("rediseno"),
    envio: precioDe("envio"),
  };

  // El estado que hay que creerle a cada pedido: uno sin pagar de más de
  // siete días ya venció, aunque el cierre diario todavía no lo haya escrito.
  const pedidos = (encargosRes.data ?? [])
    .filter((e) => esEstadoEncargo(e.estado))
    .map((e) => ({
      ...e,
      cantidad: Number(e.cantidad),
      monto_total: Number(e.monto_total),
      entrega: e.entrega === "envio" ? ("envio" as const) : ("retiro" as const),
      estado: estadoDelPedido(e.estado as EstadoEncargo, e.created_at),
    }));

  const enPantalla = (e: (typeof pedidos)[number]): PedidoEnPantalla => ({
    id: e.id,
    numero: e.numero,
    cantidad: e.cantidad,
    montoPack: Number(e.monto_pack),
    montoRediseno: Number(e.monto_rediseno),
    montoEnvio: Number(e.monto_envio),
    montoTotal: e.monto_total,
    pagarHasta: formatearFecha(
      fechaCalendarioAR(new Date(new Date(e.created_at).getTime() + DIAS_PARA_PAGAR * 86_400_000)),
    ),
  });

  const sinPagar = pedidos.find((e) => e.estado === "pendiente_pago") ?? null;

  // El último pedido COMPRADO, si ya está pagado: es el que la pantalla de
  // pago puede estar mirando en el momento en que se acredita.
  const ultimoComprado = pedidos.find((e) => !e.incluido) ?? null;
  const ultimoPagado =
    ultimoComprado &&
    (ultimoComprado.estado === "entregado" || ESTADOS_EN_CAMINO.includes(ultimoComprado.estado))
      ? enPantalla(ultimoComprado)
      : null;

  // La cuenta viva del pedido sin pagar, y la URL del diseño. Una orden
  // vencida o cerrada no es una orden abierta: no se pinta su alias.
  const [ordenRes, firma] = await Promise.all([
    sinPagar
      ? supabase
          .from("cresium_ordenes")
          .select("alias, cvu, estado, monto, monto_pagado, created_at")
          .eq("encargo_calcos_id", sinPagar.id)
          .order("created_at", { ascending: false })
          .limit(1)
          .maybeSingle()
      : null,
    diseno ? supabase.storage.from("calcos").createSignedUrl(diseno.ruta, UNA_HORA) : null,
  ]);

  const filaOrden = ordenRes?.data ?? null;
  const estadoOrden = filaOrden ? estadoEfectivo(filaOrden.estado, filaOrden.created_at) : null;
  const orden: OrdenDePago | null =
    filaOrden && (estadoOrden === "NOT_PAID" || estadoOrden === "PARTIAL")
      ? {
          alias: filaOrden.alias,
          cvu: filaOrden.cvu,
          estado: estadoOrden,
          montoPagado: Number(filaOrden.monto_pagado),
          monto: Number(filaOrden.monto),
        }
      : null;

  const urlDiseno = firma?.data?.signedUrl ?? null;
  const disenoEsPdf = diseno?.ruta.endsWith(".pdf") ?? false;

  const enCamino = pedidos
    .filter((e) => ESTADOS_EN_CAMINO.includes(e.estado))
    .reduce((n, e) => n + e.cantidad, 0);
  // Lo entregado antes de que existiera esta pantalla está en el contador
  // pero no en la lista de pedidos: se dice, para que la suma cierre.
  const entregadasPorPedido = pedidos
    .filter((e) => e.estado === "entregado")
    .reduce((n, e) => n + e.cantidad, 0);
  const entregasAnteriores = Math.max(0, entregadas - entregadasPorPedido);

  return (
    <div className="mx-auto flex max-w-2xl flex-col gap-6">
      <div>
        <Link
          href="/panel/cuenta"
          className="mb-2 inline-flex min-h-11 items-center text-ui font-semibold text-ink-60 hover:text-ink"
        >
          ← Mi cuenta
        </Link>
        <CabeceraSeccion titulo="Calcos" />
      </div>

      {/* ============ 1 · Tu calco ============ */}
      <section className="surface-card p-5" data-calco>
        <div className="flex flex-wrap items-center gap-5">
          {/* A tamaño real: 5 × 8 cm. */}
          {urlDiseno && !disenoEsPdf ? (
            <a
              href={urlDiseno}
              target="_blank"
              rel="noreferrer"
              aria-label="Abrir el diseño de tu calco"
              className="block shrink-0 overflow-hidden rounded-md border border-line"
              style={{ width: "5cm", height: "8cm" }}
            >
              {/* <img> y no next/image: la URL es firmada, de un bucket
                  privado y vence en una hora. El optimizador de Next la
                  bajaría y la volvería a servir desde su propia caché. */}
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={urlDiseno} alt="El diseño de tu calco" className="h-full w-full object-cover" />
            </a>
          ) : (
            <div
              className="flex shrink-0 flex-col items-center justify-center gap-2 rounded-md border border-dashed border-line bg-surface px-3 text-center"
              style={{ width: "5cm", height: "8cm" }}
            >
              {urlDiseno ? (
                <a
                  href={urlDiseno}
                  target="_blank"
                  rel="noreferrer"
                  className="inline-flex min-h-11 items-center text-ui font-semibold text-ink underline underline-offset-2"
                >
                  Abrir el diseño
                </a>
              ) : (
                <p className="text-ui text-ink-60">Estamos diseñando tu calco</p>
              )}
            </div>
          )}

          <div className="min-w-0 flex-1 basis-48">
            <h2 className="font-brand text-lead font-bold text-ink">Tu calco</h2>
            <p className="mt-1 text-ui text-ink-60">
              {diseno
                ? `Diseño v${diseno.version}, de 5 × 8 cm. Con cada pedido lo imprimimos tal cual; si querés cambiarlo, pedí el rediseño.`
                : "Todavía no está listo el diseño. Podés pedir igual: lo imprimimos con el que acordemos."}
            </p>
            <p className="mt-4 font-brand text-h2 font-bold text-ink tabular-nums" data-entregadas>
              {cantidadDeCalcos(entregadas)}
            </p>
            <p className="text-ui text-ink-60">calcos entregados hasta hoy</p>
          </div>
        </div>
      </section>

      {/* ============ 2 · Pedir, pagar, o el éxito ============
          Con un pedido sin pagar, esto ES la pantalla de pago de ese pedido.
          Un suspendido no puede generar la cuenta (es una escritura): si su
          pedido quedó sin cuenta viva, se le dice en vez de ofrecerle un
          botón que lo rebota. */}
      {sesion.suspendido && sinPagar && !orden ? (
        <section className="surface-card p-5">
          <h2 className="font-brand text-lead font-bold text-ink">
            Tu pedido {numeroDeEncargo(sinPagar.numero)}
          </h2>
          <p className="mt-1 text-ui text-ink-60">
            Está guardado y sin pagar. Con la cuenta suspendida no se puede generar la cuenta
            para transferir: cuando se reactive, lo retomás desde acá.
          </p>
        </section>
      ) : (
        <PedidoDeCalcos
          catalogo={catalogo}
          direccionSugerida={sucursalRes.data?.direccion ?? null}
          telefonoSugerido={sucursalRes.data?.telefono ?? null}
          pendiente={sinPagar ? enPantalla(sinPagar) : null}
          orden={orden}
          ultimoPagado={ultimoPagado}
          suspendido={sesion.suspendido}
        />
      )}

      {/* ============ 3 · Tu historial ============ */}
      <section className="surface-card p-5" data-historial>
        <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
          <h2 className="font-brand text-lead font-bold text-ink">Tu historial de calcos</h2>
          <p className="text-ui text-ink-60 tabular-nums" data-resumen>
            <span className="font-semibold text-ink">{cantidadDeCalcos(entregadas)} entregadas</span>
            {enCamino > 0 && ` · ${cantidadDeCalcos(enCamino)} en camino`}
          </p>
        </div>
        <p className="mt-1 text-ui text-ink-60">
          Todo lo que te mandamos desde que arrancaste: los incluidos en tu plan y los que
          pediste.
        </p>

        {pedidos.length === 0 && entregasAnteriores === 0 ? (
          <p className="mt-4 text-ui text-ink-60">
            Todavía no hay pedidos. Cuando hagas el primero, lo vas a poder seguir desde acá.
          </p>
        ) : (
          <ul className="mt-3">
            {pedidos.map((e) => (
              <li
                key={e.id}
                data-pedido={e.numero}
                className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1.5 border-t border-line py-3 first:border-t-0"
              >
                <div className="min-w-0">
                  <p className="text-body text-ink tabular-nums">
                    {[
                      `${cantidadDeCalcos(e.cantidad)} calcos`,
                      e.incluido ? "incluidos en tu plan" : null,
                      e.rediseno ? "rediseño" : null,
                      e.entrega === "envio" ? "envío a domicilio" : e.incluido ? null : "retiro",
                    ]
                      .filter(Boolean)
                      .join(" · ")}
                  </p>
                  <p className="text-ui text-ink-60 tabular-nums">
                    {numeroDeEncargo(e.numero)} ·{" "}
                    {formatearFecha(fechaCalendarioAR(new Date(e.created_at)))}
                    {e.monto_total > 0 && ` · ${pesos(e.monto_total)}`}
                  </p>
                </div>
                <Pill estado={e.estado}>{estadoParaElTenant(e)}</Pill>
              </li>
            ))}
            {entregasAnteriores > 0 && (
              <li className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1.5 border-t border-line py-3 first:border-t-0">
                <div className="min-w-0">
                  <p className="text-body text-ink tabular-nums">
                    {cantidadDeCalcos(entregasAnteriores)} calcos
                  </p>
                  <p className="text-ui text-ink-60">Entregas anteriores a esta pantalla</p>
                </div>
                <Pill estado="entregado">Entregado</Pill>
              </li>
            )}
          </ul>
        )}
      </section>
    </div>
  );
}

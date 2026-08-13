import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { obtenerSesion, panelSuspendido } from "@/lib/auth/session";
import { cerrarSesion } from "@/lib/auth/actions";
import { origenDelSitio } from "@/lib/origen";
import { urlWhatsappSoporte } from "@/lib/config";
import { CabeceraSeccion } from "@/components/panel/cabecera-seccion";
import { FormNombre } from "@/components/cuenta/form-nombre";
import { FormClavePanel } from "@/components/cuenta/form-clave";
import { CopiarLanding } from "@/components/cuenta/copiar-landing";
import {
  actualizarMiNombre,
  actualizarNombreLubricentro,
} from "@/app/panel/cuenta/actions";
import { formatearFecha } from "@/lib/fechas";
import {
  ETIQUETA_ESTADO,
  ETIQUETA_PERIODO,
  abonoMensual,
  diasHasta,
  pesos,
  porcentaje,
  type EstadoSuscripcion,
  type Periodo,
} from "@/lib/fidelli/plan";

export const metadata: Metadata = { title: "Mi cuenta" };

function Bloque({
  titulo,
  children,
}: {
  titulo: string;
  children: React.ReactNode;
}) {
  return (
    <section>
      <h2 className="mb-2 px-1 text-label font-semibold tracking-[0.06em] text-ink-40 uppercase">
        {titulo}
      </h2>
      <div className="surface-card p-5">{children}</div>
    </section>
  );
}

// Renglón de dato de solo lectura, con la etiqueta arriba como los campos.
function Dato({
  etiqueta,
  children,
}: {
  etiqueta: string;
  children: React.ReactNode;
}) {
  return (
    <div>
      <p className="mb-1.5 text-label font-semibold tracking-[0.06em] text-ink-60 uppercase">
        {etiqueta}
      </p>
      {children}
    </div>
  );
}

export default async function PaginaCuenta() {
  const sesion = await obtenerSesion();
  if (!sesion?.lubricentroId) redirect("/login");

  const suspendido = await panelSuspendido();
  const supabase = await createClient();

  // Todo lo del bloque de plan en paralelo. RLS filtra al tenant: estas
  // consultas no necesitan (ni llevan) filtro a mano.
  const [lubriRes, suscripcionRes, pagosRes, origen] = await Promise.all([
    supabase
      .from("lubricentros")
      .select("nombre, slug")
      .eq("id", sesion.lubricentroId)
      .maybeSingle(),
    supabase
      .from("suscripciones")
      .select(
        `estado, periodo, descuento_pct, vencimiento,
         planes(nombre, precio_mensual, descuento_semestral_pct, descuento_anual_pct)`,
      )
      .order("inicio", { ascending: false })
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle(),
    supabase
      .from("pagos")
      .select("id, periodo_desde, periodo_hasta, monto, fecha_pago")
      .order("periodo_hasta", { ascending: false }),
    origenDelSitio(),
  ]);

  const lubricentro = lubriRes.data;
  const sub = suscripcionRes.data;
  const pagos = pagosRes.data ?? [];
  const urlLanding = lubricentro ? `${origen}/${lubricentro.slug}` : null;

  const abono =
    sub?.planes != null
      ? abonoMensual(
          sub.planes,
          sub.periodo as Periodo,
          Number(sub.descuento_pct),
        )
      : null;
  const diasTrial = sub?.estado === "trial" ? diasHasta(sub.vencimiento) : null;

  return (
    <div className="mx-auto flex max-w-2xl flex-col gap-6">
      <CabeceraSeccion titulo="Mi cuenta" />

      <Bloque titulo="Tus datos">
        <div className="flex flex-col gap-5">
          <FormNombre
            accion={actualizarMiNombre}
            etiqueta="Tu nombre"
            valorInicial={sesion.nombre}
            deshabilitado={suspendido}
          />

          <Dato etiqueta="Email">
            <p className="text-body text-ink">{sesion.email}</p>
            <p className="mt-1.5 text-label text-ink-60">
              Es tu usuario para entrar al panel. Para cambiarlo,{" "}
              <a
                href={urlWhatsappSoporte()}
                target="_blank"
                rel="noopener noreferrer"
                className="font-semibold text-brand"
              >
                escribinos
              </a>{" "}
              y lo hacemos con vos.
            </p>
          </Dato>
        </div>
      </Bloque>

      <Bloque titulo="Tu marca">
        <div className="flex flex-col gap-5">
          <FormNombre
            accion={actualizarNombreLubricentro}
            etiqueta="Nombre del lubricentro"
            ayuda="Es tu marca: aparece en tu página pública y en el cartón que ve tu cliente."
            valorInicial={lubricentro?.nombre ?? sesion.lubricentroNombre ?? ""}
            deshabilitado={suspendido}
          />

          {urlLanding && (
            <Dato etiqueta="Tu página pública">
              <CopiarLanding url={urlLanding} />
              <p className="mt-1.5 text-label text-ink-60">
                La dirección no se puede cambiar: es la que está impresa en los
                QR de las calcos pegadas en los parasoles.
              </p>
            </Dato>
          )}
        </div>
      </Bloque>

      <Bloque titulo="Seguridad">
        <div className="flex flex-col gap-6">
          <FormClavePanel />

          <form action={cerrarSesion}>
            <button
              type="submit"
              className="min-h-11 text-ui font-semibold text-ink-60 underline underline-offset-4 hover:text-ink"
            >
              Cerrar sesión en este dispositivo
            </button>
          </form>
        </div>
      </Bloque>

      <Bloque titulo="Tu plan">
        {sub && sub.planes ? (
          <div className="flex flex-col gap-4">
            <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
              <div>
                <p className="font-brand text-lead font-bold text-ink">
                  {sub.planes.nombre} · {ETIQUETA_PERIODO[sub.periodo as Periodo]}
                </p>
                {abono !== null && (
                  <p className="mt-0.5 text-ui text-ink-60 tabular-nums">
                    {pesos(abono)}/mes
                    {Number(sub.descuento_pct) > 0 &&
                      ` — con tu descuento del ${porcentaje(Number(sub.descuento_pct))} aplicado`}
                  </p>
                )}
              </div>
              <span className="rounded-sm border border-line bg-surface px-2 py-0.5 text-label font-semibold tracking-[0.04em] text-ink-60 uppercase">
                {ETIQUETA_ESTADO[sub.estado as EstadoSuscripcion]}
              </span>
            </div>

            <p className="text-ui text-ink-60 tabular-nums">
              {sub.estado === "trial" && diasTrial !== null ? (
                diasTrial > 0 ? (
                  <>
                    Tu prueba gratuita termina el{" "}
                    <span className="font-semibold text-ink">
                      {formatearFecha(sub.vencimiento)}
                    </span>{" "}
                    — te{" "}
                    {diasTrial === 1 ? "queda 1 día" : `quedan ${diasTrial} días`}
                    .
                  </>
                ) : (
                  "Tu prueba gratuita ya terminó."
                )
              ) : (
                <>
                  Próximo vencimiento:{" "}
                  <span className="font-semibold text-ink">
                    {formatearFecha(sub.vencimiento)}
                  </span>
                </>
              )}
            </p>

            {pagos.length > 0 && (
              <div>
                <p className="mb-2 text-label font-semibold tracking-[0.06em] text-ink-60 uppercase">
                  Tus pagos
                </p>
                <ul className="rounded-md border border-line">
                  {pagos.map((p) => (
                    <li
                      key={p.id}
                      className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-0.5 border-b border-line px-3.5 py-2.5 text-ui tabular-nums last:border-b-0"
                    >
                      <span className="text-ink-60">
                        {formatearFecha(p.periodo_desde)} →{" "}
                        {formatearFecha(p.periodo_hasta)}
                      </span>
                      <span className="text-ink-60">
                        pagado {formatearFecha(p.fecha_pago)}
                      </span>
                      <span className="font-semibold text-ink">
                        {pesos(Number(p.monto))}
                      </span>
                    </li>
                  ))}
                </ul>
              </div>
            )}

            <p className="text-label text-ink-60">
              ¿Dudas con tu plan o un pago?{" "}
              <a
                href={urlWhatsappSoporte()}
                target="_blank"
                rel="noopener noreferrer"
                className="font-semibold text-brand"
              >
                Escribinos por WhatsApp
              </a>
              .
            </p>
          </div>
        ) : (
          <p className="text-ui text-ink-60">
            Tu suscripción todavía no está cargada. Escribinos y lo revisamos.
          </p>
        )}
      </Bloque>
    </div>
  );
}

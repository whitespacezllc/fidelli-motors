import { ToggleTema } from "@/components/tema/toggle-tema";
import { LineaLegal } from "@/components/panel/linea-legal";
import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { clasesBoton } from "@/components/ui/boton";
import { createClient } from "@/lib/supabase/server";
import { obtenerSesion, panelSuspendido, featureHabilitada } from "@/lib/auth/session";
import { FEATURES_PLAN, ETIQUETA_FEATURE } from "@/lib/planes";
import { IconoIncluido, IconoCerrar } from "@/components/iconos";
import { cerrarSesion } from "@/lib/auth/actions";
import { origenDelSitio } from "@/lib/origen";
import { urlWhatsappSoporte } from "@/lib/config";
import { CabeceraSeccion } from "@/components/panel/cabecera-seccion";
import { FormNombre } from "@/components/cuenta/form-nombre";
import { FormClavePanel } from "@/components/cuenta/form-clave";
import { CopiarLanding } from "@/components/cuenta/copiar-landing";
import { SolapasCuenta, esSolapaCuenta, type SolapaCuenta } from "@/components/cuenta/solapas";
import { Dato } from "@/components/suscripcion/dato-copiable";
import { FormDatosEmpresa } from "@/components/empresa/form-datos-empresa";
import { empresaDesdeFila } from "@/lib/datos-empresa";
import {
  actualizarMiNombre,
  actualizarNombreLubricentro,
  guardarDatosEmpresa,
} from "@/app/panel/(tras-onboarding)/cuenta/actions";
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

// ============================================================
// Mi cuenta, en cuatro solapas (30/10/2026)
//
// Era una columna de ocho bloques. Ahora cada solapa es una pantalla corta
// con lo suyo: Cuenta (la persona), Plan y pagos (el contrato), Tu negocio
// (el taller) y Calcos (su propia ruta). La solapa viene en la URL
// (`?tab=`): se comparte, se vuelve con «atrás», y cada una pide a la base
// solo lo que muestra.
// ============================================================

function Bloque({
  titulo,
  id,
  children,
}: {
  titulo: string;
  id?: string;
  children: React.ReactNode;
}) {
  return (
    <section id={id}>
      <h2 className="mb-2 px-1 text-label font-semibold tracking-[0.06em] text-ink-40 uppercase">
        {titulo}
      </h2>
      <div className="surface-card p-5">{children}</div>
    </section>
  );
}

// Renglón de dato de solo lectura, con la etiqueta arriba como los campos.
function DatoFijo({
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

function Escribinos({ texto = "escribinos" }: { texto?: string }) {
  return (
    <a
      href={urlWhatsappSoporte()}
      target="_blank"
      rel="noopener noreferrer"
      className="font-semibold text-brand-texto"
    >
      {texto}
    </a>
  );
}

export default async function PaginaCuenta({
  searchParams,
}: {
  searchParams: Promise<{ tab?: string }>;
}) {
  const sesion = await obtenerSesion();
  if (!sesion?.lubricentroId) redirect("/login");

  const { tab } = await searchParams;
  const solapa: SolapaCuenta = esSolapaCuenta(tab) && tab !== "calcos" ? tab : "cuenta";
  const suspendido = await panelSuspendido();

  return (
    <div className="mx-auto flex max-w-2xl flex-col gap-6">
      <div>
        <CabeceraSeccion titulo="Mi cuenta" />
        <SolapasCuenta activa={solapa} />
      </div>

      {solapa === "cuenta" && <SolapaPersona nombre={sesion.nombre} email={sesion.email} tema={sesion.tema} suspendido={suspendido} />}
      {solapa === "plan" && <SolapaPlan sesion={sesion} />}
      {solapa === "negocio" && <SolapaNegocio sesion={sesion} suspendido={suspendido} />}

      {/* Los dos documentos legales, al pie de la cuenta: es donde se
          buscan (antes estaban en el pie del sidebar y de la hoja «Más»,
          que desde el 30/10/2026 son una sola fila). */}
      <LineaLegal className="justify-center px-1 pt-1" />
    </div>
  );
}

// ============================================================
// Cuenta · la persona
// ============================================================
function SolapaPersona({
  nombre,
  email,
  tema,
  suspendido,
}: {
  nombre: string;
  email: string;
  tema: Parameters<typeof ToggleTema>[0]["tema"];
  suspendido: boolean;
}) {
  return (
    <>
      <Bloque titulo="Tus datos">
        <div className="flex flex-col gap-5">
          <FormNombre
            accion={actualizarMiNombre}
            etiqueta="Tu nombre"
            valorInicial={nombre}
            deshabilitado={suspendido}
          />

          <DatoFijo etiqueta="Email">
            <p className="text-body text-ink">{email}</p>
            <p className="mt-1.5 text-label text-ink-60">
              Es tu usuario para entrar al panel. Para cambiarlo, <Escribinos /> y lo
              hacemos con vos.
            </p>
          </DatoFijo>
        </div>
      </Bloque>

      {/* El modo del panel es de la PERSONA, no del taller: por eso vive
          acá, junto a su nombre y su clave, y no en Diseño de experiencia
          (que es la marca que ve el cliente). También está en la navegación. */}
      <Bloque titulo="Apariencia">
        <ToggleTema tema={tema} variante="bloque" />
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
    </>
  );
}

// ============================================================
// Plan y pagos · el contrato
// ============================================================
async function SolapaPlan({
  sesion,
}: {
  sesion: NonNullable<Awaited<ReturnType<typeof obtenerSesion>>>;
}) {
  const supabase = await createClient();

  // Todo lo del plan en paralelo. RLS filtra al tenant: estas consultas no
  // necesitan (ni llevan) filtro a mano.
  const [lubriRes, suscripcionRes, pagosRes, depositosRes] = await Promise.all([
    supabase
      .from("lubricentros")
      .select("cresium_alias, cresium_cvu")
      .eq("id", sesion.lubricentroId!)
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
    // Lo que entró a la cuenta fija y todavía mira Fidelli (20261031100000).
    supabase
      .from("depositos_cresium")
      .select("monto, recibido_at")
      .eq("estado", "a_confirmar")
      .order("recibido_at", { ascending: false }),
  ]);

  const sub = suscripcionRes.data;
  const pagos = pagosRes.data ?? [];
  const enRevision = depositosRes.data ?? [];
  const cuenta =
    lubriRes.data?.cresium_alias && lubriRes.data.cresium_cvu
      ? { alias: lubriRes.data.cresium_alias, cvu: lubriRes.data.cresium_cvu }
      : null;

  const abono =
    sub?.planes != null
      ? abonoMensual(sub.planes, sub.periodo as Periodo, Number(sub.descuento_pct))
      : null;
  const diasTrial = sub?.estado === "trial" ? diasHasta(sub.vencimiento) : null;
  const paga = sub != null && sub.estado !== "trial" && Number(sub.descuento_pct) < 100;

  if (!sub || !sub.planes) {
    return (
      <Bloque titulo="Tu plan">
        <p className="text-ui text-ink-60">
          Tu suscripción todavía no está cargada. <Escribinos texto="Escribinos" /> y lo
          revisamos.
        </p>
      </Bloque>
    );
  }

  return (
    <>
      <Bloque titulo="Tu plan">
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
                  <span className="font-semibold text-ink">{formatearFecha(sub.vencimiento)}</span>{" "}
                  — te {diasTrial === 1 ? "queda 1 día" : `quedan ${diasTrial} días`}.
                </>
              ) : (
                "Tu prueba gratuita ya terminó."
              )
            ) : (
              <>
                Próximo vencimiento:{" "}
                <span className="font-semibold text-ink">{formatearFecha(sub.vencimiento)}</span>
              </>
            )}
          </p>

          {/* La puerta a la pantalla de pago. Va acá y no en el sidebar a
              propósito: renovar no es una tarea de todos los días, y una
              entrada permanente en la navegación le pondría al dueño un
              recordatorio de que paga cada vez que abre el panel. Cuando el
              vencimiento se acerca de verdad, la escalera se lo trae sola. */}
          {paga && (
            <Link href="/panel/suscripcion" className={`${clasesBoton("secundario")} self-start`}>
              Pagar o renovar
            </Link>
          )}

          {/* Qué incluye el plan, YA RESUELTO por la base (con overrides).
              Lo apagado se muestra en gris, no se esconde. */}
          {sesion.capacidades && (
            <div className="border-t border-line pt-4">
              <p className="mb-2 text-label font-semibold tracking-[0.06em] text-ink-60 uppercase">
                Qué incluye
              </p>
              <ul className="grid gap-x-6 gap-y-1.5 sm:grid-cols-2">
                {FEATURES_PLAN.map((f) => {
                  const activa = sesion.capacidades?.features[f] === true;
                  return (
                    <li
                      key={f}
                      className={`flex items-center gap-2 text-ui ${activa ? "text-ink" : "text-ink-40"}`}
                    >
                      {activa ? (
                        <IconoIncluido aria-hidden className="size-4 shrink-0 text-success" />
                      ) : (
                        <IconoCerrar aria-hidden className="size-4 shrink-0 text-ink-40" />
                      )}
                      {ETIQUETA_FEATURE[f]}
                      {!activa && <span className="sr-only"> — no incluida en tu plan</span>}
                    </li>
                  );
                })}
              </ul>
              <p className="mt-2.5 text-ui text-ink-60 tabular-nums">
                {sesion.capacidades.limites.sucursales == null
                  ? "Sucursales activas: sin límite."
                  : `Hasta ${sesion.capacidades.limites.sucursales} sucursal(es) activa(s).`}
              </p>
              {FEATURES_PLAN.some((f) => sesion.capacidades?.features[f] !== true) && (
                <p className="mt-1.5 text-ui text-ink-60">
                  ¿Te interesa algo de lo que no está? <Escribinos texto="Escribinos" /> y te
                  contamos cómo sumarlo.
                </p>
              )}
            </div>
          )}
        </div>
      </Bloque>

      {/* La cuenta de cobro fija (20261031100000): siempre la misma, para
          dejarla agendada. Solo si ya se le emitió. */}
      {cuenta && paga && (
        <Bloque titulo="Tu cuenta para pagar">
          <p className="mb-1 text-ui text-ink-60">
            Es siempre la misma: podés dejarla agendada en tu home banking. Transferí el
            monto exacto de tu plan y se acredita solo; el monto lo ves en{" "}
            <Link href="/panel/suscripcion" className="font-semibold text-ink underline underline-offset-4">
              la pantalla de pago
            </Link>
            .
          </p>
          <Dato k="Alias" v={cuenta.alias} copiable />
          <Dato k="CVU" v={cuenta.cvu} copiable />
          {enRevision.length > 0 && (
            <p className="mt-3 rounded-lg border border-urgente bg-urgente-soft px-4 py-3 text-ui text-ink tabular-nums">
              Recibimos {pesos(Number(enRevision[0].monto))} el{" "}
              {formatearFecha(enRevision[0].recibido_at.slice(0, 10))} y no coincide con el
              monto de ningún período: lo estamos revisando a mano. Tu plata está.
            </p>
          )}
        </Bloque>
      )}

      <Bloque titulo="Tus pagos">
        {pagos.length > 0 ? (
          <ul className="rounded-md border border-line">
            {pagos.map((p) => (
              <li
                key={p.id}
                className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-0.5 border-b border-line px-3.5 py-2.5 text-ui tabular-nums last:border-b-0"
              >
                <span className="text-ink-60">
                  {formatearFecha(p.periodo_desde)} → {formatearFecha(p.periodo_hasta)}
                </span>
                <span className="text-ink-60">pagado {formatearFecha(p.fecha_pago)}</span>
                <span className="font-semibold text-ink">{pesos(Number(p.monto))}</span>
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-ui text-ink-60">Todavía no hay ningún pago registrado.</p>
        )}
        <p className="mt-3 text-label text-ink-60">
          ¿Dudas con tu plan o un pago? <Escribinos texto="Escribinos por WhatsApp" />.
        </p>
      </Bloque>
    </>
  );
}

// ============================================================
// Tu negocio · el taller
// ============================================================
async function SolapaNegocio({
  sesion,
  suspendido,
}: {
  sesion: NonNullable<Awaited<ReturnType<typeof obtenerSesion>>>;
  suspendido: boolean;
}) {
  const supabase = await createClient();
  // Los datos de la empresa salen solo en el presupuesto: sin esa función
  // no hay dónde usarlos, y la tarjeta ni se consulta ni se muestra.
  const conPresupuestos = featureHabilitada(sesion, "presupuestos");

  const [lubriRes, origen, empresaRes] = await Promise.all([
    supabase
      .from("lubricentros")
      .select("nombre, slug")
      .eq("id", sesion.lubricentroId!)
      .maybeSingle(),
    origenDelSitio(),
    conPresupuestos
      ? supabase
          .from("datos_empresa")
          .select("razon_social, cuit, condicion_iva, domicilio, telefono, email")
          .maybeSingle()
      : null,
  ]);

  const lubricentro = lubriRes.data;
  const urlLanding = lubricentro ? `${origen}/${lubricentro.slug}` : null;

  return (
    <>
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
            <DatoFijo etiqueta="Tu página pública">
              <CopiarLanding url={urlLanding} />
              <p className="mt-1.5 text-label text-ink-60">
                La dirección no se puede cambiar: es la que está impresa en los QR de las
                calcos pegadas en los parasoles.
              </p>
            </DatoFijo>
          )}
        </div>
      </Bloque>

      {conPresupuestos && (
        <Bloque titulo="Datos de tu empresa" id="datos-empresa">
          <FormDatosEmpresa
            accion={guardarDatosEmpresa}
            inicial={empresaDesdeFila(empresaRes?.data)}
            ayuda="Salen en el encabezado de tus presupuestos. Si los dejás vacíos, el presupuesto lleva solo tu nombre y tu logo."
            deshabilitado={suspendido}
          />
        </Bloque>
      )}
    </>
  );
}

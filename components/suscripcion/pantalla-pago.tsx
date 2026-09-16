"use client";

import { useActionState, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Boton, clasesBoton } from "@/components/ui/boton";
import { crearOrden, type EstadoOrden } from "@/app/panel/(tras-onboarding)/suscripcion/actions";
import { pesos, ETIQUETA_PERIODO, MESES_DEL_PERIODO, type Periodo } from "@/lib/fidelli/plan";
import { DIAS_DE_VIDA_DE_LA_ORDEN } from "@/lib/cresium/orden";
import { TITULAR_CVU } from "@/lib/config";

const INICIAL: EstadoOrden = {};

export type Renglon = { clave: string; valor: string; descuento?: boolean; total?: boolean };

export type OrdenAbierta = {
  alias: string;
  cvu: string | null;
  estado: string;
  montoPagado: number;
  monto: number;
  periodoHasta: string;
  /** El período que el dueño YA eligió al generar la orden. Manda sobre el
   *  selector: una vez emitido el CVU, el monto está fijado. */
  periodo: Periodo;
};

export type DatosPago = {
  plan: string;
  modulos: string[];
  vencimiento: string | null;
  /** Por período: el total y el desglose ya calculados POR LA BASE. */
  opciones: Record<Periodo, { total: number; ahorro: number; renglones: Renglon[] } | null>;
  orden: OrdenAbierta | null;
  /** La última orden venció sin pagarse: se avisa y se ofrece una nueva. */
  ordenVencida: boolean;
  /** Se muestra la pantalla de éxito: el webhook ya acreditó. */
  alDiaHasta: string | null;
  /** Lo que entró, para decirlo en el éxito. Va aparte de `orden` porque
   *  al pagar la orden deja de estar "abierta" y se anula. */
  montoCobrado: number | null;
};

function fechaLarga(iso: string | null): string {
  if (!iso) return "";
  return new Date(iso + "T00:00:00").toLocaleDateString("es-AR", {
    day: "numeric",
    month: "long",
    year: "numeric",
  });
}

// ============================================================
// El botón de copiar
//
// Área táctil de 44px: el dueño copia esto con el home banking abierto en
// la otra mano. Y el estado "Copiado" dura lo justo para verse — sin eso,
// no hay forma de saber si el toque tomó.
// ============================================================
function Copiar({ valor, que }: { valor: string; que: string }) {
  const [copiado, setCopiado] = useState(false);

  return (
    <button
      type="button"
      aria-label={`Copiar ${que}`}
      onClick={async () => {
        try {
          await navigator.clipboard.writeText(valor);
          setCopiado(true);
          setTimeout(() => setCopiado(false), 1400);
        } catch {
          // Sin permiso de portapapeles —pasa en algunos navegadores sobre
          // http— no se rompe nada: el valor está a la vista para copiarlo
          // a mano, que es lo que el dueño iba a hacer igual.
        }
      }}
      className="h-11 shrink-0 rounded-md border border-line bg-base px-3 text-ui font-semibold text-ink-60 hover:bg-surface hover:text-ink"
    >
      {copiado ? "Copiado" : "Copiar"}
    </button>
  );
}

function Dato({ k, v, copiable }: { k: string; v: string; copiable?: boolean }) {
  return (
    <div className="flex items-center gap-3 border-t border-line py-2.5 first:border-t-0">
      <span className="w-16 shrink-0 text-label font-semibold tracking-[0.05em] text-ink-40 uppercase">
        {k}
      </span>
      <span className="min-w-0 flex-1 font-brand text-body font-bold break-words tabular-nums">
        {v}
      </span>
      {copiable && <Copiar valor={v} que={k} />}
    </div>
  );
}

export function PantallaPago({ datos }: { datos: DatosPago }) {
  const router = useRouter();

  // Anual por defecto MIENTRAS SE ELIGE. Sin tarjeta no hay débito
  // automático: cada renovación es alguien abriendo su home banking, así
  // que el anual son once oportunidades menos de que se caiga en el año.
  //
  // ⚠ PERO SI YA HAY UNA ORDEN, MANDA SU PERÍODO. Con una orden abierta el
  // selector se esconde —el CVU ya está emitido y el monto fijado— y sin
  // esto el desglose seguía mostrando el total del período por DEFECTO:
  // la pantalla decía "Total a transferir ARS 4.207,50" (anual) al lado de
  // una orden de $467,50 (mensual). El dueño leía un número y la cuenta
  // esperaba otro, que es la peor cosa que puede hacer una pantalla de
  // pago.
  const [periodo, setPeriodo] = useState<Periodo>(
    datos.orden?.periodo ?? (datos.opciones.anual ? "anual" : "mensual"),
  );
  const [estado, accion, enviando] = useActionState(crearOrden, INICIAL);

  const orden = datos.orden;
  const pagado = datos.alDiaHasta !== null;

  // ---------- El success es esta misma pantalla cambiando sola ----------
  // Con una orden abierta y sin pagar, se pregunta cada 8 segundos si ya
  // entró. Es polling y no realtime a propósito: son dos o tres minutos de
  // vida por sesión —lo que tarda una transferencia—, y una suscripción a
  // realtime abierta en el panel de cada tenant cuesta más de lo que
  // resuelve. Se apaga solo al pagar y cuando la pestaña no se ve, para no
  // castigar la batería del celular que quedó en el mostrador.
  useEffect(() => {
    if (!orden || pagado) return;
    if (orden.estado === "PAID" || orden.estado === "EXPIRED") return;

    const tic = setInterval(() => {
      if (document.visibilityState === "visible") router.refresh();
    }, 8000);
    return () => clearInterval(tic);
  }, [orden, pagado, router]);

  // ---------- PAGADO ----------
  if (pagado) {
    return (
      <div className="surface-card overflow-hidden">
        <div className="flex items-center justify-between gap-3 border-b border-line bg-surface px-4 py-3">
          <span className="font-brand text-ui font-bold">Tu suscripción</span>
          <span className="text-ui text-success">Al día</span>
        </div>
        <Exito hasta={datos.alDiaHasta!} monto={datos.montoCobrado} />
      </div>
    );
  }

  // Con una orden abierta el desglose se arma sobre SU período. Y el total
  // que se muestra es el de la orden, no el que recalcula el catálogo: si
  // el precio de lista se movió entre que se emitió el CVU y ahora, lo que
  // hay que transferir sigue siendo lo que dice la orden.
  const opcion = orden
    ? (() => {
        const base = datos.opciones[orden.periodo];
        if (!base) return null;
        return {
          ...base,
          renglones: base.renglones.map((r) =>
            r.total ? { ...r, valor: pesos(orden.monto) } : r,
          ),
        };
      })()
    : datos.opciones[periodo];

  return (
    <div className="surface-card overflow-hidden">
      <div className="flex items-center justify-between gap-3 border-b border-line bg-surface px-4 py-3">
        <span className="font-brand text-ui font-bold">Tu suscripción</span>
        <span className="text-ui text-ink-60">
          {orden ? "Esperando la transferencia" : `Vence el ${fechaLarga(datos.vencimiento)}`}
        </span>
      </div>

      <div className="p-5">
        <div className="mb-1 flex flex-wrap items-baseline gap-x-3 gap-y-1">
          <span className="font-brand text-lead font-bold">Plan {datos.plan}</span>
          {datos.modulos.map((m) => (
            <span key={m} className="text-ui text-ink-60">
              + {m}
            </span>
          ))}
        </div>
        <p className="text-ui text-ink-60">
          Tu período actual termina el{" "}
          <strong className="text-ink">{fechaLarga(datos.vencimiento)}</strong>.
        </p>

        {/* ---------- El período ----------
            Se elige PERÍODO, nunca plan: cambiar de Basic a Pro es una
            conversación de venta por WhatsApp, a propósito.

            Seleccionado en INK, nunca en el rojo de marca: el rojo es
            acción y jamás estado. Mismo criterio que el selector de tipo
            de trabajo y el de clase de vehículo. */}
        {!orden && (
          <div className="my-5 grid grid-cols-2 gap-2.5" role="group" aria-label="Período">
            {(["anual", "mensual"] as const).map((p) => {
              const o = datos.opciones[p];
              if (!o) return null;
              const elegido = periodo === p;
              return (
                <button
                  key={p}
                  type="button"
                  aria-pressed={elegido}
                  onClick={() => setPeriodo(p)}
                  className={`flex min-h-[76px] flex-col items-start justify-center gap-0.5 rounded-lg border-[1.5px] px-3 py-2.5 text-left transition-colors ${
                    elegido ? "border-ink bg-surface" : "border-line bg-base hover:border-ink-40"
                  }`}
                >
                  <span className="font-brand text-ui font-bold">{ETIQUETA_PERIODO[p]}</span>
                  <span className="text-ui text-ink-60 tabular-nums">
                    {pesos(o.total)}
                    {p === "anual" ? " por 12 meses" : " por mes"}
                  </span>
                  {/* El ahorro EN PESOS, no en porcentaje: "ahorrás
                      $222.000" mueve una decisión, "25% off" no. */}
                  {o.ahorro > 0 ? (
                    <span className="text-label font-bold text-success tabular-nums">
                      Ahorrás {pesos(o.ahorro)}
                    </span>
                  ) : (
                    <span className="text-label text-ink-40">
                      Se renueva cada {MESES_DEL_PERIODO[p] * 30} días
                    </span>
                  )}
                </button>
              );
            })}
          </div>
        )}

        {/* ---------- El desglose, línea por línea ----------
            Para que el número sea VERIFICABLE. El dueño tiene que poder
            seguir la cuenta con el dedo antes de transferir. */}
        {opcion && (
          <div className="overflow-hidden rounded-lg border border-line">
            {opcion.renglones.map((r) => (
              <div
                key={r.clave}
                className={`flex items-baseline justify-between gap-3.5 border-t border-line px-3.5 py-2.5 text-ui first:border-t-0 ${
                  r.total ? "bg-surface" : ""
                }`}
              >
                <span className={r.total ? "font-brand font-bold text-ink" : "text-ink-60"}>
                  {r.clave}
                </span>
                <span
                  className={`whitespace-nowrap tabular-nums ${
                    r.total
                      ? "font-brand text-lead font-bold"
                      : r.descuento
                        ? "font-semibold text-success"
                        : "font-semibold"
                  }`}
                >
                  {r.valor}
                </span>
              </div>
            ))}
          </div>
        )}

        {estado.error && (
          <p role="alert" className="mt-4 text-ui text-overdue">
            {estado.error}
          </p>
        )}

        {/* ---------- Generar la cuenta, o mostrarla ---------- */}
        {!orden ? (
          <form action={accion} className="mt-5">
            {datos.ordenVencida && (
              <p className="mb-4 rounded-lg border border-line bg-surface px-4 py-3 text-ui text-ink-60">
                La cuenta que habías generado venció a los {DIAS_DE_VIDA_DE_LA_ORDEN} días
                sin recibir la transferencia. Elegí el período y te damos una nueva. Si
                ya habías transferido, no se pierde: escribinos y lo acreditamos.
              </p>
            )}
            <input type="hidden" name="periodo" value={periodo} />
            <Boton type="submit" tam="lg" disabled={enviando} className="w-full sm:w-auto">
              {enviando ? "Generando tu cuenta…" : "Quiero pagar"}
            </Boton>
            <p className="mt-2 text-label text-ink-40">
              Te damos una cuenta tuya para transferir desde tu home banking.
            </p>
          </form>
        ) : (
          <>
            <div className="mt-5 rounded-lg border border-line p-4">
              <h3 className="font-brand text-body font-bold">
                Transferí desde tu home banking
              </h3>
              <p className="mt-0.5 mb-1 text-ui text-ink-60">
                La cuenta es tuya y de nadie más: identifica tu pago sin que tengas que
                avisarnos.
              </p>
              <Dato k="Alias" v={orden.alias} copiable />
              {orden.cvu && <Dato k="CVU" v={orden.cvu} copiable />}
              <Dato k="Titular" v={TITULAR_CVU} />
            </div>

            <EstadoDeLaOrden orden={orden} />
          </>
        )}
      </div>
    </div>
  );
}

// ============================================================
// El estado de la transferencia
// ============================================================
function EstadoDeLaOrden({ orden }: { orden: OrdenAbierta }) {
  if (orden.estado === "PARTIAL") {
    const falta = orden.monto - orden.montoPagado;
    return (
      <div className="mt-4 flex items-start gap-3 rounded-lg border border-urgente bg-urgente-soft px-4 py-3.5">
        <span
          aria-hidden
          className="mt-0.5 grid size-[22px] shrink-0 place-items-center rounded-full bg-urgente text-label font-bold text-white"
        >
          !
        </span>
        <div className="min-w-0">
          <p className="font-brand text-body font-bold text-overdue tabular-nums">
            Recibimos {pesos(orden.montoPagado)}
          </p>
          <p className="mt-0.5 text-ui text-ink-60 tabular-nums">
            Faltan {pesos(falta)} para completar el período. Transferí la diferencia al
            mismo alias: se acumula sobre lo que ya mandaste.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="mt-4 flex items-start gap-3 rounded-lg border border-line bg-surface px-4 py-3.5">
      <span
        aria-hidden
        className="mt-0.5 grid size-[22px] shrink-0 place-items-center rounded-full bg-ink-40 text-label font-bold text-base"
      >
        ·
      </span>
      <div className="min-w-0">
        <p className="font-brand text-body font-bold">Esperando tu transferencia</p>
        <p className="mt-0.5 text-ui text-ink-60">
          No hace falta que nos avises ni que mandes el comprobante. Esta pantalla se
          actualiza sola cuando entra.
        </p>
      </div>
    </div>
  );
}

// ============================================================
// El success
//
// No es un redirect: es esta misma pantalla cambiando sola cuando entra el
// webhook, con el dueño mirándola. El disco entra, la marca se dibuja, el
// anillo se abre UNA vez y el texto sube. Nada rebota ni gira: es una
// confirmación, no una celebración.
//
// `prefers-reduced-motion` la apaga entera — está en globals.css junto al
// resto de la animación.
// ============================================================
function Exito({ hasta, monto }: { hasta: string; monto: number | null }) {
  return (
    <div className="exito-cobranza px-5 py-8 text-center">
      <svg className="tick mx-auto mb-4 block size-14 overflow-visible" viewBox="0 0 56 56" aria-hidden>
        <circle className="anillo" cx="28" cy="28" r="26" />
        <circle className="disco" cx="28" cy="28" r="26" />
        <path className="marca" d="M17 28.5 L24.5 36 L39 21" />
      </svg>
      <p className="sube font-brand text-label font-bold tracking-[0.08em] text-ink-40 uppercase">
        Tu suscripción está al día hasta el
      </p>
      <p className="sube my-1.5 font-brand text-h2 font-bold tabular-nums">{fechaLarga(hasta)}</p>
      <p className="sube mx-auto max-w-[42ch] text-ui text-ink-60">
        {monto ? `Recibimos ${pesos(monto)}. ` : ""}
        No tenés que hacer nada más: ya extendimos tu período, y tu página pública siguió
        andando todo el tiempo.
      </p>
      <div className="sube mt-5 flex flex-wrap justify-center gap-2.5">
        <Link href="/panel" className={clasesBoton("secundario")}>
          Volver al panel
        </Link>
      </div>
    </div>
  );
}

"use client";

import { useActionState, useEffect, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Boton, clasesBoton } from "@/components/ui/boton";
import { Dato } from "@/components/suscripcion/dato-copiable";
import { crearOrden, type EstadoOrden } from "@/app/panel/(tras-onboarding)/suscripcion/actions";
import { pesos, MESES_DEL_PERIODO, type Periodo } from "@/lib/fidelli/plan";
import { DIAS_DE_VIDA_DE_LA_ORDEN } from "@/lib/cresium/orden";
import { TITULAR_CVU } from "@/lib/config";

const INICIAL: EstadoOrden = {};

export type Renglon = { clave: string; valor: string; descuento?: boolean; total?: boolean };

/** Lo que cualquier orden de Cresium tiene, sea de lo que sea. */
export type OrdenDePago = {
  alias: string;
  cvu: string | null;
  estado: string;
  montoPagado: number;
  monto: number;
};

export type OrdenAbierta = OrdenDePago & {
  periodoHasta: string;
  /** El período que el dueño YA eligió al generar la orden. Manda sobre el
   *  selector: una vez emitido el CVU, el monto está fijado. */
  periodo: Periodo;
  /** La orden es NUESTRA, contra la cuenta fija del tenant (20261031100000):
   *  el CVU es el de siempre, el monto tiene que ser exacto y no hay pago
   *  parcial que se acumule. */
  dedicada?: boolean;
};

// ============================================================
// EL CONCEPTO · la misma pantalla, para algo que no es la suscripción
//
// Desde los pedidos de calcos (PR 2) esta pantalla cobra dos cosas. Lo que
// es DEL COBRO —el alias y el CVU copiables, el titular, el polling de 8
// segundos, el aviso del pago parcial («se acumula sobre lo que ya
// mandaste») y el tick— es uno solo y vive acá. Lo que es DE LO QUE SE
// COBRA entra por este prop: el título, el desglose, cuánto tiempo tiene y
// qué se le dice cuando entró la plata.
//
// Sin `concepto`, la pantalla es la de la suscripción, IDÉNTICA a la que
// era: mismo árbol, mismas clases, mismos textos. Con `concepto` no hay ni
// plan, ni período, ni selector.
//
// ⚠ Este componente lo importa el panel del tenant: el concepto trae
// textos ya armados y montos; nada de costos.
// ============================================================
export type ConceptoPago = {
  /** La cabecera: «Tu pedido #0012». */
  titulo: string;
  /** El desglose, ya armado: pack, rediseño, envío y el total. */
  renglones: Renglon[];
  /** Cuánto tiempo tiene: «Tenés 7 días para pagar.» */
  vigencia: string;
  /** Qué completa la diferencia de un pago parcial: «el pedido». */
  queSeCompleta: string;
  /** La orden abierta, o null si todavía no se pudo generar la cuenta. */
  orden: OrdenDePago | null;
  /** El webhook ya acreditó: se muestra el éxito. */
  pagado: boolean;
  /** Lo que entró, para decirlo en el éxito. */
  montoCobrado: number | null;
  /** El éxito: «Tu pedido de 400 calcos está pagado.» y lo que sigue. */
  exito: {
    titulo: string;
    texto: string;
    salida: { texto: string; onClick: () => void };
  };
  /** Sin orden abierta: la acción que genera la cuenta, y cómo se ofrece. */
  generar: {
    accion: (previo: EstadoOrden, formData: FormData) => Promise<EstadoOrden>;
    /** Por qué no hay cuenta todavía, dicho antes del botón. */
    aviso: string;
    boton: string;
    generando: string;
  };
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
  /** Por qué venció: a los 7 días (pago único) o porque el precio del
   *  período cambió desde que se generó (cuenta fija). */
  motivoVencida?: "dias" | "precio" | null;
  /** La cuenta de cobro FIJA del tenant (20261031100000), si ya tiene:
   *  siempre la misma, para dejarla agendada en el home banking. */
  cuenta?: { alias: string; cvu: string } | null;
  /** Un depósito a la cuenta fija que no coincidió con ningún período y lo
   *  está mirando Fidelli. El dueño tiene que saber que su plata llegó. */
  enRevision?: { monto: number; fecha: string } | null;
  /** LA VOZ. `renovacion` es la de siempre: "tu período actual termina
   *  el…". `alta` es la del tenant que acaba de nacer y todavía no pagó
   *  ninguna vez: decirle que su período "vence" es mentirle sobre una
   *  relación que empezó ayer. */
  voz?: "renovacion" | "alta";
  /** Se muestra la pantalla de éxito: el webhook ya acreditó. */
  alDiaHasta: string | null;
  /** LA SALIDA. Cuando la pantalla se monta al final del onboarding, el
   *  dueño tiene que poder irse al panel desde cualquiera de sus estados —
   *  con la orden generada, sin generar, o después de pagar. Sin esto la
   *  única salida es el Link de la pantalla de éxito, que solo aparece si
   *  ya transfirió: sería una pantalla de pago que bloquea, que es
   *  exactamente lo que este paso NO puede ser. */
  salida?: { texto: string; onClick: () => void; pendiente?: boolean };
  /** Lo que entró, para decirlo en el éxito. Va aparte de `orden` porque
   *  al pagar la orden deja de estar "abierta" y se anula. */
  montoCobrado: number | null;
};

// El titular, escrito como nombre propio: la constante va en mayúsculas.
const TITULAR = TITULAR_CVU.split(" ").map((w) => w[0] + w.slice(1).toLowerCase()).join(" ");

function fechaLarga(iso: string | null): string {
  if (!iso) return "";
  return new Date(iso + "T00:00:00").toLocaleDateString("es-AR", {
    day: "numeric",
    month: "long",
    year: "numeric",
  });
}

type Props =
  | { datos: DatosPago; concepto?: undefined }
  | { concepto: ConceptoPago; datos?: undefined };

export function PantallaPago({ datos, concepto }: Props) {
  const router = useRouter();

  // ---------- Mensual por defecto, anual recomendado ----------
  // Decisión de Santiago (30/10/2026): el mensual es lo que la mayoría
  // paga, así que es lo que la pantalla propone; el anual se vende al lado
  // con el ahorro en pesos y «12 meses al precio de 9», no con un «25 %».
  //
  // ⚠ PERO SI YA HAY UNA ORDEN DE PAGO ÚNICO, MANDA SU PERÍODO: el CVU ya
  // está emitido y el monto fijado, y el desglose tiene que decir ESE
  // número. Con la cuenta fija no hay orden que mande: el dueño elige y el
  // monto exacto es el del período elegido, hoy.
  const [periodo, setPeriodo] = useState<Periodo>(
    datos?.orden?.periodo ?? (datos?.opciones.mensual ? "mensual" : "anual"),
  );
  // La acción que genera la cuenta: la de la renovación, o la del concepto.
  // Las dos son Server Actions importadas por quien arma la pantalla, así
  // que la referencia es estable entre renders.
  const [estado, accion, enviando] = useActionState(
    concepto ? concepto.generar.accion : crearOrden,
    INICIAL,
  );
  // Con la cuenta fija, elegir un período registra la elección (la orden
  // interna) sin bloquear la pantalla: el monto ya está a la vista.
  const [, registrar] = useTransition();

  const ordenEnEspera: OrdenDePago | null = concepto ? concepto.orden : datos.orden;
  const pagado = concepto ? concepto.pagado : datos.alDiaHasta !== null;
  // La cuenta de cobro fija (20261031100000): sin orden que emitir, sin
  // botón que apretar. El CVU es siempre el mismo y el pago se acredita
  // solo con el monto exacto.
  const cuenta = concepto ? null : (datos.cuenta ?? null);

  // ---------- El success es esta misma pantalla cambiando sola ----------
  // Mientras se espera la transferencia, se pregunta cada 8 segundos si ya
  // entró. Es polling y no realtime a propósito: son dos o tres minutos de
  // vida por sesión —lo que tarda una transferencia—, y una suscripción a
  // realtime abierta en el panel de cada tenant cuesta más de lo que
  // resuelve. Se apaga solo al pagar y cuando la pestaña no se ve, para no
  // castigar la batería del celular que quedó en el mostrador. Con la
  // cuenta fija se pregunta siempre que haya algo por pagar: no hay orden
  // que diga «esperando».
  useEffect(() => {
    if (pagado) return;
    if (!cuenta) {
      if (!ordenEnEspera) return;
      if (ordenEnEspera.estado === "PAID" || ordenEnEspera.estado === "EXPIRED") return;
    }

    const tic = setInterval(() => {
      if (document.visibilityState === "visible") router.refresh();
    }, 8000);
    return () => clearInterval(tic);
  }, [ordenEnEspera, pagado, cuenta, router]);

  // ---------- UN CONCEPTO QUE NO ES LA SUSCRIPCIÓN ----------
  // Después de los hooks, que son los mismos para las dos formas.
  if (concepto) {
    return (
      <PagoDeUnConcepto
        concepto={concepto}
        error={estado.error}
        accion={accion}
        enviando={enviando}
      />
    );
  }

  const orden = datos.orden;
  // El tenant que todavía no pagó ninguna vez no está renovando nada.
  const esAlta = datos.voz === "alta";

  // ---------- PAGADO ----------
  if (pagado) {
    return (
      <div className="surface-card overflow-hidden">
        <Cabecera estado="Al día" tono="success" />
        {datos.enRevision && (
          <div className="px-5 pt-5">
            <EnRevision deposito={datos.enRevision} />
          </div>
        )}
        <Exito hasta={datos.alDiaHasta!} monto={datos.montoCobrado} />
        {datos.salida && <Salida salida={datos.salida} />}
      </div>
    );
  }

  // Con una orden de pago único abierta, el desglose se arma sobre SU
  // período y con SU total: si el precio de lista se movió entre que se
  // emitió el CVU y ahora, lo que hay que transferir sigue siendo lo que
  // dice la orden. Con la cuenta fija es al revés: siempre el precio de
  // hoy, que es el que el webhook va a reconocer.
  // Con la cuenta fija, la orden interna abierta no manda: el selector
  // sigue a la vista y el monto es el del período elegido hoy.
  const ordenUnica = orden && !cuenta ? orden : null;
  const opcion = ordenUnica
    ? (() => {
        const base = datos.opciones[ordenUnica.periodo];
        if (!base) return null;
        return {
          ...base,
          renglones: base.renglones.map((r) =>
            r.total ? { ...r, valor: pesos(ordenUnica.monto) } : r,
          ),
        };
      })()
    : datos.opciones[periodo];

  const elegir = (p: Periodo) => {
    setPeriodo(p);
    if (!cuenta) return;
    registrar(async () => {
      const fd = new FormData();
      fd.set("periodo", p);
      await crearOrden(INICIAL, fd);
    });
  };

  return (
    <div className="surface-card overflow-hidden">
      <Cabecera
        estado={
          orden || cuenta
            ? "Esperando la transferencia"
            : esAlta
              ? "Falta el primer pago"
              : `Vence el ${fechaLarga(datos.vencimiento)}`
        }
      />

      <div className="p-4 sm:p-5">
        <div className="mb-1 flex flex-wrap items-baseline gap-x-3 gap-y-1">
          <span className="font-brand text-lead font-bold">Plan {datos.plan}</span>
          {datos.modulos.map((m) => (
            <span key={m} className="text-ui text-ink-60">
              + {m}
            </span>
          ))}
        </div>
        {esAlta ? (
          <p className="text-ui text-ink-60">
            Tenés hasta el{" "}
            <strong className="text-ink">{fechaLarga(datos.vencimiento)}</strong> para
            hacer el primer pago. Mientras tanto podés usar el panel normalmente.
          </p>
        ) : (
          <p className="text-ui text-ink-60">
            Tu período actual termina el{" "}
            <strong className="text-ink">{fechaLarga(datos.vencimiento)}</strong>.
          </p>
        )}

        {datos.enRevision && (
          <div className="mt-4">
            <EnRevision deposito={datos.enRevision} />
          </div>
        )}

        {/* ---------- El período ----------
            Se elige PERÍODO, nunca plan: cambiar de Basic a Pro es una
            conversación de venta por WhatsApp, a propósito. Con una orden
            de pago único abierta el selector se esconde: el CVU ya está
            emitido con ese monto. */}
        {!ordenUnica && <SelectorDePeriodo opciones={datos.opciones} periodo={periodo} alElegir={elegir} />}

        {/* ---------- El desglose, línea por línea ----------
            Para que el número sea VERIFICABLE. El dueño tiene que poder
            seguir la cuenta con el dedo antes de transferir. */}
        {opcion && <Desglose renglones={opcion.renglones} />}

        {estado.error && (
          <p role="alert" className="mt-4 text-ui text-overdue">
            {estado.error}
          </p>
        )}

        {/* ---------- La cuenta ---------- */}
        {cuenta && opcion ? (
          <>
            <CajaDeTransferencia
              titulo={`Transferí exactamente ${pesos(opcion.total)}`}
              texto="Tu cuenta de cobro es siempre la misma: podés dejarla agendada en tu home banking. El monto tiene que ser exacto; con otro monto, lo revisamos a mano y demora más."
              alias={cuenta.alias}
              cvu={cuenta.cvu}
            />
            <EstadoDeLaOrden orden={null} />
          </>
        ) : !orden ? (
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
            {/* EL TITULAR, ANTES DE QUE LO VEA EL BANCO. Dicho de antemano
                es un dato; descubierto en el home banking a la hora de
                transferir, es una duda — y la duda aparece con el dedo
                sobre el botón de confirmar. */}
            <NotaDelTitular />
          </form>
        ) : (
          <>
            <CajaDeTransferencia
              titulo={orden.dedicada ? `Transferí exactamente ${pesos(orden.monto)}` : "Transferí desde tu home banking"}
              texto={
                orden.dedicada
                  ? "Tu cuenta de cobro es siempre la misma: podés dejarla agendada en tu home banking. El monto tiene que ser exacto; con otro monto, lo revisamos a mano y demora más."
                  : "La cuenta es tuya y de nadie más: identifica tu pago sin que tengas que avisarnos."
              }
              alias={orden.alias}
              cvu={orden.cvu}
            />
            <EstadoDeLaOrden orden={orden} queSeCompleta={orden.dedicada ? null : undefined} />
          </>
        )}

        {datos.salida && <Salida salida={datos.salida} />}
      </div>
    </div>
  );
}

// ============================================================
// La cabecera de la tarjeta: el título y el estado, de reojo.
// ============================================================
function Cabecera({ estado, tono = "ink-60" }: { estado: string; tono?: "success" | "ink-60" }) {
  return (
    <div className="flex items-center justify-between gap-3 border-b border-line bg-surface px-4 py-3">
      <span className="font-brand text-ui font-bold">Tu suscripción</span>
      <span className={`text-ui ${tono === "success" ? "text-success" : "text-ink-60"}`}>{estado}</span>
    </div>
  );
}

// ============================================================
// El selector de período
//
// Dos tarjetas: el mensual (lo que se propone) y el anual (lo que se
// recomienda), con el ahorro EN PESOS y «12 meses al precio de 9»: un
// «25 % off» no se siente; «ahorrás $140.250» sí. Seleccionado en INK,
// nunca en el rojo de marca: el rojo es acción y jamás estado. Mismo
// criterio que el selector de tipo de trabajo y el de clase de vehículo.
// En el celular las dos tarjetas van una abajo de la otra.
// ============================================================
function SelectorDePeriodo({
  opciones,
  periodo,
  alElegir,
}: {
  opciones: DatosPago["opciones"];
  periodo: Periodo;
  alElegir: (p: Periodo) => void;
}) {
  const mensual = opciones.mensual;
  const anual = opciones.anual;
  if (!mensual && !anual) return null;
  // «12 meses al precio de N»: lo que el anual cuesta medido en meses del
  // mensual, redondeado. Solo cuando ahorra de verdad.
  const alPrecioDe =
    mensual && anual && anual.ahorro > 0 ? Math.round(anual.total / mensual.total) : null;

  return (
    <div className="my-5 grid gap-2.5 sm:grid-cols-2" role="group" aria-label="Período">
      {mensual && (
        <TarjetaPeriodo
          nombre="Mensual"
          elegido={periodo === "mensual"}
          onClick={() => alElegir("mensual")}
          precio={`${pesos(mensual.total)} por mes`}
          nota={`Se renueva cada ${MESES_DEL_PERIODO.mensual * 30} días. Lo pagás mes a mes.`}
        />
      )}
      {anual && (
        <TarjetaPeriodo
          nombre="Anual"
          elegido={periodo === "anual"}
          onClick={() => alElegir("anual")}
          precio={`${pesos(anual.total)} por 12 meses`}
          destacado={anual.ahorro > 0 ? `Ahorrás ${pesos(anual.ahorro)}` : null}
          nota={
            alPrecioDe && alPrecioDe < 12
              ? `12 meses al precio de ${alPrecioDe}. Pagás una vez y te olvidás por un año.`
              : "Pagás una vez y te olvidás por un año."
          }
        />
      )}
    </div>
  );
}

function TarjetaPeriodo({
  nombre,
  elegido,
  onClick,
  precio,
  destacado,
  nota,
}: {
  nombre: string;
  elegido: boolean;
  onClick: () => void;
  precio: string;
  destacado?: string | null;
  nota: string;
}) {
  return (
    <button
      type="button"
      aria-pressed={elegido}
      onClick={onClick}
      className={`flex min-h-[88px] flex-col items-start justify-center gap-1 rounded-lg border-[1.5px] px-3.5 py-3 text-left transition-colors ${
        elegido ? "border-ink bg-surface" : "border-line bg-base hover:border-ink-40"
      }`}
    >
      <span className="flex w-full flex-wrap items-center gap-x-2 gap-y-1">
        <span className="font-brand text-body font-bold">{nombre}</span>
        {destacado && (
          <span className="rounded-sm bg-success-soft px-1.5 py-0.5 text-label font-bold text-success tabular-nums">
            {destacado}
          </span>
        )}
      </span>
      <span className="text-ui text-ink tabular-nums">{precio}</span>
      <span className="text-label text-ink-60">{nota}</span>
    </button>
  );
}

// ============================================================
// La caja de transferencia: el alias y el CVU copiables, el titular.
// ============================================================
function CajaDeTransferencia({
  titulo,
  texto,
  alias,
  cvu,
}: {
  titulo: string;
  texto: string;
  alias: string;
  cvu: string | null;
}) {
  return (
    <div className="mt-5 rounded-lg border border-line p-4">
      <h3 className="font-brand text-body font-bold tabular-nums">{titulo}</h3>
      <p className="mt-0.5 mb-1 text-ui text-ink-60">{texto}</p>
      <Dato k="Alias" v={alias} copiable />
      {cvu && <Dato k="CVU" v={cvu} copiable />}
      <Dato k="Titular" v={TITULAR_CVU} />
      <NotaDelTitular />
    </div>
  );
}

// ============================================================
// La salida del onboarding: desde cualquier estado, al panel.
// ============================================================
function Salida({ salida }: { salida: NonNullable<DatosPago["salida"]> }) {
  return (
    <div className="mt-5 border-t border-line px-5 pt-5 pb-5 sm:px-0 sm:pb-0">
      <Boton
        type="button"
        tam="lg"
        disabled={salida.pendiente}
        onClick={salida.onClick}
        className="w-full sm:w-auto"
      >
        {salida.pendiente ? "Entrando…" : salida.texto}
      </Boton>
      <p className="mt-2 text-label text-ink-40">
        Podés pagar ahora o después: tu panel ya está funcionando.
      </p>
    </div>
  );
}

// ============================================================
// Un depósito en revisión
//
// Entró a la cuenta fija del tenant pero no coincide con el monto exacto
// de ningún período, así que lo mira Fidelli. El dueño tiene que saber que
// su plata llegó, esté al día o no.
// ============================================================
function EnRevision({ deposito }: { deposito: { monto: number; fecha: string } }) {
  return (
    <div className="flex items-start gap-3 rounded-lg border border-urgente bg-urgente-soft px-4 py-3.5">
      <span
        aria-hidden
        className="mt-0.5 grid size-[22px] shrink-0 place-items-center rounded-full bg-urgente text-label font-bold text-base"
      >
        !
      </span>
      <div className="min-w-0">
        <p className="font-brand text-body font-bold text-overdue tabular-nums">
          Recibimos {pesos(deposito.monto)} el {fechaLarga(deposito.fecha)}
        </p>
        <p className="mt-0.5 text-ui text-ink-60">
          No coincide con el monto de ningún período, así que lo estamos revisando a mano.
          Tu plata está: si hace falta algo, te escribimos por WhatsApp.
        </p>
      </div>
    </div>
  );
}

// ============================================================
// El desglose
//
// Línea por línea, con el total al pie. Es el mismo para la renovación y
// para un pedido: lo que cambia es qué renglones trae.
// ============================================================
function Desglose({ renglones }: { renglones: Renglon[] }) {
  return (
    <div className="overflow-hidden rounded-lg border border-line">
      {renglones.map((r) => (
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
  );
}

// ============================================================
// El pago de un concepto (un pedido de calcos)
//
// La misma caja de transferencia, el mismo estado de la orden y el mismo
// tick que la renovación. Sin plan, sin período y sin selector: el monto ya
// está fijado cuando esta pantalla aparece.
// ============================================================
function PagoDeUnConcepto({
  concepto,
  error,
  accion,
  enviando,
}: {
  concepto: ConceptoPago;
  error: string | undefined;
  accion: (formData: FormData) => void;
  enviando: boolean;
}) {
  const orden = concepto.orden;

  if (concepto.pagado) {
    return (
      <div className="surface-card overflow-hidden" data-pago="pagado">
        <div className="flex items-center justify-between gap-3 border-b border-line bg-surface px-4 py-3">
          <span className="font-brand text-ui font-bold">{concepto.titulo}</span>
          <span className="text-ui text-success">Pagado</span>
        </div>
        <div className="exito-cobranza px-5 py-8 text-center">
          <Tick />
          <p className="sube font-brand text-h3 font-bold text-ink">{concepto.exito.titulo}</p>
          <p className="sube mx-auto mt-1.5 max-w-[42ch] text-ui text-ink-60 tabular-nums">
            {concepto.montoCobrado ? `Recibimos ${pesos(concepto.montoCobrado)}. ` : ""}
            {concepto.exito.texto}
          </p>
          <div className="sube mt-5 flex flex-wrap justify-center gap-2.5">
            <button
              type="button"
              onClick={concepto.exito.salida.onClick}
              className={clasesBoton("secundario")}
            >
              {concepto.exito.salida.texto}
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="surface-card overflow-hidden" data-pago={orden ? "esperando" : "sin-cuenta"}>
      <div className="flex items-center justify-between gap-3 border-b border-line bg-surface px-4 py-3">
        <span className="font-brand text-ui font-bold">{concepto.titulo}</span>
        <span className="text-ui text-ink-60">
          {orden ? "Esperando la transferencia" : "Falta la cuenta para transferir"}
        </span>
      </div>

      <div className="p-5">
        <Desglose renglones={concepto.renglones} />
        <p className="mt-3 text-ui text-ink-60">{concepto.vigencia}</p>

        {error && (
          <p role="alert" className="mt-4 text-ui text-overdue">
            {error}
          </p>
        )}

        {!orden ? (
          <form action={accion} className="mt-5">
            <p className="mb-4 rounded-lg border border-line bg-surface px-4 py-3 text-ui text-ink-60">
              {concepto.generar.aviso}
            </p>
            <Boton type="submit" tam="lg" disabled={enviando} className="w-full sm:w-auto">
              {enviando ? concepto.generar.generando : concepto.generar.boton}
            </Boton>
            <NotaDelTitular />
          </form>
        ) : (
          <>
            <div className="mt-5 rounded-lg border border-line p-4">
              <h3 className="font-brand text-body font-bold">
                Transferí desde tu home banking
              </h3>
              <p className="mt-0.5 mb-1 text-ui text-ink-60">
                La cuenta es de este pago y de nada más: lo identifica sin que tengas que
                avisarnos.
              </p>
              <Dato k="Alias" v={orden.alias} copiable />
              {orden.cvu && <Dato k="CVU" v={orden.cvu} copiable />}
              <Dato k="Titular" v={TITULAR_CVU} />
              <NotaDelTitular />
            </div>

            <EstadoDeLaOrden orden={orden} queSeCompleta={concepto.queSeCompleta} />
          </>
        )}
      </div>
    </div>
  );
}

// ============================================================
// El titular
//
// La cuenta está a nombre de una persona y no de una sociedad, y eso el
// dueño lo va a ver sí o sí cuando abra su home banking. Decirlo acá lo
// convierte en un dato; callarlo lo convierte en una duda justo cuando
// tiene el dedo sobre el botón de transferir $74.000.
// ============================================================
function NotaDelTitular() {
  return (
    <p className="mt-2 text-label text-ink-40">
      La cuenta está a nombre de {TITULAR}, fundador de Fidelli Motors: todavía no
      tenemos sociedad.
    </p>
  );
}

// ============================================================
// El estado de la transferencia
// ============================================================
function EstadoDeLaOrden({
  orden,
  queSeCompleta = "el período",
}: {
  /** Null con la cuenta fija: no hay orden, se espera igual. */
  orden: OrdenDePago | null;
  /** Lo que la diferencia termina de pagar: el período, o el pedido. Con
   *  `null` no hay pago parcial que se acumule (la cuenta fija acredita
   *  por monto exacto y nada más). */
  queSeCompleta?: string | null;
}) {
  if (orden && orden.estado === "PARTIAL" && queSeCompleta !== null) {
    const falta = orden.monto - orden.montoPagado;
    // Una sola cadena, y no `{queSeCompleta}` suelto en medio de la frase:
    // así el HTML de la renovación queda byte a byte como era.
    const resto = ` para completar ${queSeCompleta}. Transferí la diferencia al mismo alias: se acumula sobre lo que ya mandaste.`;
    return (
      <div className="mt-4 flex items-start gap-3 rounded-lg border border-urgente bg-urgente-soft px-4 py-3.5">
        <span
          aria-hidden
          className="mt-0.5 grid size-[22px] shrink-0 place-items-center rounded-full bg-urgente text-label font-bold text-base"
        >
          !
        </span>
        <div className="min-w-0">
          <p className="font-brand text-body font-bold text-overdue tabular-nums">
            Recibimos {pesos(orden.montoPagado)}
          </p>
          <p className="mt-0.5 text-ui text-ink-60 tabular-nums">
            Faltan {pesos(falta)}
            {resto}
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
          {orden === null
            ? "Se acredita sola cuando entra el monto exacto. No hace falta que nos avises ni que mandes el comprobante: esta pantalla se actualiza sola."
            : "No hace falta que nos avises ni que mandes el comprobante. Esta pantalla se actualiza sola cuando entra."}
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
function Tick() {
  return (
    <svg className="tick mx-auto mb-4 block size-14 overflow-visible" viewBox="0 0 56 56" aria-hidden>
      <circle className="anillo" cx="28" cy="28" r="26" />
      <circle className="disco" cx="28" cy="28" r="26" />
      <path className="marca" d="M17 28.5 L24.5 36 L39 21" />
    </svg>
  );
}

function Exito({ hasta, monto }: { hasta: string; monto: number | null }) {
  return (
    <div className="exito-cobranza px-5 py-8 text-center">
      <Tick />
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

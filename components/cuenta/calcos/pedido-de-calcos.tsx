"use client";

import { useActionState, useState } from "react";
import { Boton } from "@/components/ui/boton";
import {
  PantallaPago,
  type ConceptoPago,
  type OrdenDePago,
  type Renglon,
} from "@/components/suscripcion/pantalla-pago";
import {
  generarCuentaDelPedido,
  pedirCalcos,
  type EstadoPedido,
} from "@/app/panel/(tras-onboarding)/cuenta/calcos/actions";
import {
  cantidadDeCalcos,
  DIAS_PARA_PAGAR,
  numeroDeEncargo,
  TIEMPO_DE_ENVIO,
  TIEMPO_DE_PRODUCCION,
} from "@/lib/calcos";
import { pesos } from "@/lib/fidelli/plan";

const INICIAL: EstadoPedido = {};

const CLASE_CAMPO =
  "h-12 w-full rounded-md border border-line bg-base px-3.5 text-body text-ink placeholder:text-ink-40";
const CLASE_LABEL =
  "mb-1.5 block text-label font-semibold tracking-[0.06em] text-ink-60 uppercase";

export type PackDeCalcos = { codigo: string; cantidad: number; precio: number };

/** El catálogo, tal como lo dejó la base: precios de lista y nada más. */
export type CatalogoParaPedir = {
  packs: PackDeCalcos[];
  /** null = el extra no está disponible: la opción no se dibuja. */
  rediseno: number | null;
  envio: number | null;
};

/** Un pedido con sus montos ya congelados. */
export type PedidoEnPantalla = {
  id: string;
  numero: number;
  cantidad: number;
  montoPack: number;
  montoRediseno: number;
  montoEnvio: number;
  montoTotal: number;
  /** Hasta cuándo se puede pagar, ya dicho: «10/10/2026». */
  pagarHasta: string;
};

// ============================================================
// El bloque del medio de Mi cuenta → Calcos: pedir, pagar, o el éxito.
//
// Son tres caras del mismo lugar de la pantalla:
//
//   · sin pedido abierto            → el formulario;
//   · con un pedido sin pagar       → la pantalla de pago de ESE pedido, en
//                                     lugar del formulario (uno a la vez);
//   · el pedido que se estaba       → el éxito, con el tick.
//     mirando acaba de acreditarse
//
// El éxito no es un redirect: es la pantalla de pago cambiando sola cuando
// el webhook acredita, con el dueño mirándola. Para eso este componente se
// acuerda de QUÉ pedido estaba mostrando (`siguiendo`): cuando el servidor
// deja de mandarlo como «sin pagar» y lo manda como «pagado», se muestra el
// éxito hasta que el dueño toque «Listo». Si recarga la página, ve el
// formulario otra vez y su pedido, pagado, en el historial.
// ============================================================
export function PedidoDeCalcos({
  catalogo,
  direccionSugerida,
  telefonoSugerido,
  pendiente,
  orden,
  ultimoPagado,
  suspendido,
}: {
  catalogo: CatalogoParaPedir;
  direccionSugerida: string | null;
  telefonoSugerido: string | null;
  /** El pedido sin pagar del tenant, si hay uno. */
  pendiente: PedidoEnPantalla | null;
  /** La cuenta viva de ese pedido; null si todavía no se pudo generar. */
  orden: OrdenDePago | null;
  /** El último pedido comprado que ya está pagado. */
  ultimoPagado: PedidoEnPantalla | null;
  suspendido: boolean;
}) {
  const [siguiendo, setSiguiendo] = useState<string | null>(pendiente?.id ?? null);
  if (pendiente && pendiente.id !== siguiendo) setSiguiendo(pendiente.id);

  const acabaDePagarse =
    !pendiente && siguiendo !== null && ultimoPagado?.id === siguiendo ? ultimoPagado : null;
  const pedido = pendiente ?? acabaDePagarse;

  if (!pedido) {
    return (
      <FormDelPedido
        catalogo={catalogo}
        direccionSugerida={direccionSugerida}
        telefonoSugerido={telefonoSugerido}
        suspendido={suspendido}
      />
    );
  }

  const renglones: Renglon[] = [
    { clave: `${cantidadDeCalcos(pedido.cantidad)} calcos`, valor: pesos(pedido.montoPack) },
    ...(pedido.montoRediseno > 0
      ? [{ clave: "Rediseño", valor: pesos(pedido.montoRediseno) }]
      : []),
    ...(pedido.montoEnvio > 0
      ? [{ clave: "Envío a domicilio", valor: pesos(pedido.montoEnvio) }]
      : []),
    { clave: "Total a transferir", valor: pesos(pedido.montoTotal), total: true },
  ];

  const concepto: ConceptoPago = {
    titulo: `Tu pedido ${numeroDeEncargo(pedido.numero)}`,
    renglones,
    vigencia: `Tenés ${DIAS_PARA_PAGAR} días para pagar: hasta el ${pedido.pagarHasta}. Cuando se acredite te avisamos por mail y arrancamos la producción.`,
    queSeCompleta: "el pedido",
    orden: pendiente ? orden : null,
    pagado: !pendiente,
    montoCobrado: pendiente ? null : pedido.montoTotal,
    exito: {
      titulo: `Tu pedido de ${cantidadDeCalcos(pedido.cantidad)} calcos está pagado.`,
      texto: `Arrancamos la producción: ${TIEMPO_DE_PRODUCCION}.`,
      salida: { texto: "Listo", onClick: () => setSiguiendo(null) },
    },
    generar: {
      accion: generarCuentaDelPedido,
      aviso:
        "Tu pedido quedó guardado, pero no pudimos generar la cuenta para transferir. Tocá Reintentar: lo que armaste no se pierde.",
      boton: "Reintentar",
      generando: "Generando tu cuenta…",
    },
  };

  return <PantallaPago concepto={concepto} />;
}

// ============================================================
// El formulario
//
// Del formulario viaja QUÉ se pide. Los precios que se ven salen del
// catálogo (la base), y los que se cobran los congela la base al crear el
// pedido: el total de acá es una vista previa, no un dato.
//
// Lo elegido va en INK, nunca en el rojo de marca: el rojo es la acción
// (Confirmar y pagar), no el estado de un botón.
// ============================================================
function FormDelPedido({
  catalogo,
  direccionSugerida,
  telefonoSugerido,
  suspendido,
}: {
  catalogo: CatalogoParaPedir;
  direccionSugerida: string | null;
  telefonoSugerido: string | null;
  suspendido: boolean;
}) {
  // Arranca en el segundo pack, como la maqueta: el primero es el mínimo.
  const [codigo, setCodigo] = useState(
    (catalogo.packs[1] ?? catalogo.packs[0])?.codigo ?? "",
  );
  const [rediseno, setRediseno] = useState(false);
  const [conEnvio, setConEnvio] = useState(false);
  const [estado, accion, enviando] = useActionState(pedirCalcos, INICIAL);

  const pack = catalogo.packs.find((p) => p.codigo === codigo) ?? catalogo.packs[0];

  if (!pack) {
    return (
      <div className="surface-card p-5">
        <h2 className="font-brand text-lead font-bold text-ink">Pedir más calcos</h2>
        <p className="mt-1 text-ui text-ink-60">
          En este momento no hay packs disponibles. Escribinos por WhatsApp y lo vemos.
        </p>
      </div>
    );
  }

  const extraRediseno = rediseno && catalogo.rediseno !== null ? catalogo.rediseno : 0;
  const extraEnvio = conEnvio && catalogo.envio !== null ? catalogo.envio : 0;
  const total = pack.precio + extraRediseno + extraEnvio;

  return (
    <form action={accion} className="surface-card flex flex-col gap-5 p-5" data-pedido="formulario">
      <h2 className="font-brand text-lead font-bold text-ink">Pedir más calcos</h2>

      <input type="hidden" name="pack" value={pack.codigo} />
      <input type="hidden" name="rediseno" value={rediseno ? "si" : "no"} />
      <input type="hidden" name="entrega" value={conEnvio ? "envio" : "retiro"} />

      {/* ---------- La cantidad ---------- */}
      <div>
        <p className={CLASE_LABEL}>Cantidad</p>
        <div className="grid grid-cols-3 gap-2 sm:grid-cols-5" role="group" aria-label="Cantidad de calcos">
          {catalogo.packs.map((p) => {
            const elegido = p.codigo === pack.codigo;
            return (
              <button
                key={p.codigo}
                type="button"
                data-pack={p.codigo}
                aria-pressed={elegido}
                onClick={() => setCodigo(p.codigo)}
                className={`flex min-h-16 min-w-0 flex-col items-center justify-center gap-0.5 rounded-lg border-[1.5px] px-1 py-1.5 transition-colors ${
                  elegido ? "border-ink bg-surface" : "border-line bg-base hover:border-ink-40"
                }`}
              >
                <span className="font-brand text-body font-bold text-ink tabular-nums">
                  {cantidadDeCalcos(p.cantidad)}
                </span>
                <span className="text-label text-ink-60 tabular-nums">{pesos(p.precio)}</span>
              </button>
            );
          })}
        </div>
        <p className="mt-2 text-ui text-ink-60 tabular-nums">
          {pesos(Math.round(pack.precio / pack.cantidad))} por calco.
        </p>
      </div>

      {/* ---------- El rediseño ---------- */}
      {catalogo.rediseno !== null && (
        <div className="border-t border-line pt-3">
          <button
            type="button"
            role="switch"
            aria-checked={rediseno}
            onClick={() => setRediseno((v) => !v)}
            className="flex min-h-11 w-full flex-col gap-0.5 py-1 text-left"
          >
            {/* El nombre, el precio y el interruptor en una fila; la
                explicación debajo, a todo el ancho: al lado del precio, en
                un celular quedaba en una columna de cuatro renglones. */}
            <span className="flex w-full items-center justify-between gap-3">
              <span className="min-w-0 text-body text-ink">Rediseñar el calco</span>
              <span className="flex shrink-0 items-center gap-2.5">
                <span className="text-ui font-semibold whitespace-nowrap text-ink tabular-nums">
                  + {pesos(catalogo.rediseno)}
                </span>
                <span
                  aria-hidden
                  className={`flex h-6 w-10 items-center rounded-full p-0.5 transition-colors ${
                    rediseno ? "bg-ink" : "bg-line"
                  }`}
                >
                  <span
                    className={`size-5 rounded-full bg-base shadow-sm transition-transform ${
                      rediseno ? "translate-x-4" : ""
                    }`}
                  />
                </span>
              </span>
            </span>
            <span className="block text-ui text-ink-60">
              Nuevo diseño con tu marca. Lo acordamos por WhatsApp antes de imprimir.
            </span>
          </button>

          {rediseno && (
            <div className="mt-2">
              <label htmlFor="calcos-rediseno" className={CLASE_LABEL}>
                Qué querés cambiar
              </label>
              <textarea
                id="calcos-rediseno"
                name="rediseno_pedido"
                rows={3}
                placeholder="Colores, logo nuevo, texto…"
                className={`${CLASE_CAMPO} h-auto py-3`}
              />
            </div>
          )}
        </div>
      )}

      {/* ---------- La entrega ---------- */}
      <div>
        <p className={CLASE_LABEL}>Entrega</p>
        <div className="grid gap-2 sm:grid-cols-2" role="group" aria-label="Entrega">
          <button
            type="button"
            data-entrega="retiro"
            aria-pressed={!conEnvio}
            onClick={() => setConEnvio(false)}
            className={`flex min-h-[52px] flex-col items-start justify-center rounded-lg border-[1.5px] px-3 py-2 text-left transition-colors ${
              !conEnvio ? "border-ink bg-surface" : "border-line bg-base hover:border-ink-40"
            }`}
          >
            <span className="text-ui font-semibold text-ink">
              Retiro o entrega en Córdoba Capital
            </span>
            <span className="text-label text-ink-60">
              Sin cargo · lo coordinamos por WhatsApp
            </span>
          </button>

          {catalogo.envio !== null && (
            <button
              type="button"
              data-entrega="envio"
              aria-pressed={conEnvio}
              onClick={() => setConEnvio(true)}
              className={`flex min-h-[52px] flex-col items-start justify-center rounded-lg border-[1.5px] px-3 py-2 text-left transition-colors ${
                conEnvio ? "border-ink bg-surface" : "border-line bg-base hover:border-ink-40"
              }`}
            >
              <span className="text-ui font-semibold text-ink">Envío a domicilio</span>
              <span className="text-label text-ink-60 tabular-nums">
                + {pesos(catalogo.envio)} · Andreani, {TIEMPO_DE_ENVIO}
              </span>
            </button>
          )}
        </div>

        {conEnvio && (
          <div className="mt-3 flex flex-col gap-3">
            <div>
              <label htmlFor="calcos-direccion" className={CLASE_LABEL}>
                Dirección
              </label>
              <input
                id="calcos-direccion"
                name="direccion"
                required
                autoComplete="street-address"
                defaultValue={direccionSugerida ?? ""}
                placeholder="Av. Belgrano 480, Alta Gracia, Córdoba"
                className={CLASE_CAMPO}
              />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label htmlFor="calcos-cp" className={CLASE_LABEL}>
                  Código postal
                </label>
                <input
                  id="calcos-cp"
                  name="codigo_postal"
                  inputMode="numeric"
                  autoComplete="postal-code"
                  className={`${CLASE_CAMPO} tabular-nums`}
                />
              </div>
              <div>
                <label htmlFor="calcos-telefono" className={CLASE_LABEL}>
                  Teléfono de contacto
                </label>
                <input
                  id="calcos-telefono"
                  name="telefono"
                  type="tel"
                  required
                  autoComplete="tel"
                  defaultValue={telefonoSugerido ?? ""}
                  className={`${CLASE_CAMPO} tabular-nums`}
                />
              </div>
            </div>
          </div>
        )}
      </div>

      {/* ---------- Los tiempos (decisión 7 del sprint) ---------- */}
      <div className="rounded-lg bg-surface px-4 py-3">
        <p className={CLASE_LABEL}>Tiempos</p>
        <ul className="flex flex-col gap-1 text-ui text-ink-60">
          <li>
            <span className="font-semibold text-ink">Producción:</span> {TIEMPO_DE_PRODUCCION}{" "}
            desde que se acredita el pago.
          </li>
          <li>
            <span className="font-semibold text-ink">Envío:</span> Andreani, {TIEMPO_DE_ENVIO}{" "}
            según destino (hasta 7 en zonas alejadas).
          </li>
          <li>
            <span className="font-semibold text-ink">Retiro o entrega en Córdoba Capital:</span>{" "}
            cuando esté listo te escribimos por WhatsApp para coordinar.
          </li>
        </ul>
      </div>

      {/* ---------- El total, siempre a la vista ---------- */}
      <div className="flex flex-col gap-1.5 border-t border-line pt-4" data-total>
        <div className="flex justify-between gap-3 text-ui text-ink-60 tabular-nums">
          <span>{cantidadDeCalcos(pack.cantidad)} calcos</span>
          <span>{pesos(pack.precio)}</span>
        </div>
        {extraRediseno > 0 && (
          <div className="flex justify-between gap-3 text-ui text-ink-60 tabular-nums">
            <span>Rediseño</span>
            <span>{pesos(extraRediseno)}</span>
          </div>
        )}
        {extraEnvio > 0 && (
          <div className="flex justify-between gap-3 text-ui text-ink-60 tabular-nums">
            <span>Envío a domicilio</span>
            <span>{pesos(extraEnvio)}</span>
          </div>
        )}
        <div className="flex items-baseline justify-between gap-3 pt-1 font-brand text-lead font-bold text-ink tabular-nums">
          <span>Total</span>
          <span data-total-valor>{pesos(total)}</span>
        </div>
      </div>

      {estado.error && (
        <p role="alert" className="rounded-md bg-overdue-soft px-3.5 py-3 text-ui text-overdue">
          {estado.error}
        </p>
      )}

      <div>
        {/* Ancho completo: el texto cambia al enviarse y el botón no salta. */}
        <Boton type="submit" tam="lg" disabled={enviando || suspendido} className="w-full">
          {enviando ? "Generando tu cuenta…" : "Confirmar y pagar"}
        </Boton>
        <p className="mt-2 text-center text-label text-ink-60">
          {suspendido
            ? "Con la cuenta suspendida no se pueden pedir calcos."
            : "Se paga por transferencia al alias del pedido. Se acredita solo."}
        </p>
      </div>
    </form>
  );
}

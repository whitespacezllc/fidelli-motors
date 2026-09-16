import type { Metadata } from "next";
import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { IconoWhatsapp } from "@/components/iconos";
import { clasesBoton } from "@/components/ui/boton";
import { ESTADOS_COBRANZA, type EstadoCobranza } from "@/lib/auth/cobranza";
import { linkDeAviso, esAtencion } from "@/lib/fidelli/atencion";
import { pesos, ETIQUETA_PERIODO, type Periodo } from "@/lib/fidelli/plan";
import { formatearFecha } from "@/lib/fechas";

export const metadata: Metadata = { title: "Cobranzas" };

// Lo que se mira todos los días. No se cachea.
export const dynamic = "force-dynamic";

const DIAS = 15;

type Fila = {
  lubricentro_id: string;
  nombre: string;
  slug: string;
  activo: boolean;
  estado_cobranza: string;
  en_el_reloj: boolean;
  sub_estado: string;
  periodo: Periodo;
  descuento_pct: number;
  vencimiento: string;
  dias: number;
  plan_nombre: string;
  monto: number;
  monto_modulo: number;
  telefono: string | null;
  owner_nombre: string | null;
  avisado_at: string | null;
  orden_estado: string | null;
  orden_pagado: number | null;
  cortaria: boolean;
  /** ¿No tiene NINGÚN pago acreditado? Es lo que parte la pantalla en dos
   *  listas, y no es lo mismo que estar vencido: el que nunca pagó puede
   *  estar todavía en plazo. */
  nunca_pago: boolean;
};

// Ámbar y gris, nunca el rojo de marca: esto es estado, no acción. Lo
// vencido pesa más que lo que está por vencer.
const ESTILO: Record<EstadoCobranza, { etiqueta: string; clase: string }> = {
  suspendido: { etiqueta: "Suspendido", clase: "border-overdue bg-overdue-soft text-overdue" },
  gracia: { etiqueta: "En gracia", clase: "border-overdue bg-overdue-soft text-overdue" },
  por_vencer: { etiqueta: "Por vencer", clase: "border-urgente bg-urgente-soft text-urgente" },
  al_dia: { etiqueta: "Al día", clase: "border-line bg-surface text-ink-60" },
};

function esEstado(v: string): v is EstadoCobranza {
  return (ESTADOS_COBRANZA as readonly string[]).includes(v);
}

// Cuándo, dicho como lo diría una persona. El signo decide la frase: no es
// lo mismo "vence en 3 días" que "venció hace 3".
function cuando(dias: number): string {
  if (dias === 0) return "vence hoy";
  if (dias === 1) return "vence mañana";
  if (dias > 1) return `en ${dias} días`;
  if (dias === -1) return "venció ayer";
  return `hace ${Math.abs(dias)} días`;
}

export default async function PaginaCobranzas() {
  const supabase = await createClient();
  const { data } = await supabase.rpc("cobranzas_pendientes", { p_dias: DIAS });
  const filas = (data ?? []) as unknown as Fila[];

  // ============================================================
  // DOS LISTAS, Y EL PRIMER CORTE ES "NUNCA PAGÓ"
  //
  // Son dos llamados distintos: al que nunca pagó se le cierra una VENTA
  // —firmó, todavía no transfirió, y del otro lado hay un vendedor que
  // acaba de cerrarlo—; al que se atrasó se le COBRA. Mezclarlos hace que
  // el segundo mensaje se escriba con el tono del primero.
  //
  // El corte NO es el signo de `dias`, que es el que había antes: el que
  // nunca pagó tiene `dias >= 0` el día del alta y `dias < 0` al siguiente,
  // así que quedaba repartido entre los dos grupos. Es una columna de la
  // base (`nunca_pago`), no una inferencia de acá.
  // ============================================================
  const nuncaPagaron = filas.filter((f) => f.nunca_pago);
  const seAtrasaron = filas.filter((f) => !f.nunca_pago);

  // Y dentro de los que ya son clientes, los vencidos arriba: es el orden
  // en que se trabaja, no el alfabético.
  const vencidos = seAtrasaron.filter((f) => f.dias < 0);
  const porVencer = seAtrasaron.filter((f) => f.dias >= 0);

  return (
    <div>
      <h1 className="mb-1.5 font-brand text-h2 font-bold text-ink">Cobranzas</h1>
      <p className="mb-6 max-w-2xl text-ui text-ink-60">
        Quién vence en los próximos {DIAS} días y quién ya venció, con el monto ya
        calculado y el mensaje armado. No se envía nada solo: el mensaje tuyo convierte
        mejor que cualquier plantilla.
      </p>

      {filas.length === 0 ? (
        // Sin trabajo pendiente se celebra, en verde. Es la regla de copy
        // del repo y acá aplica igual que en el panel del cliente.
        <p className="surface-card px-5 py-6 text-ui text-success">
          Nadie vence en los próximos {DIAS} días. Estás al día.
        </p>
      ) : (
        <div className="flex flex-col gap-8">
          {nuncaPagaron.length > 0 && (
            <Grupo
              titulo="Todavía no hicieron el primer pago"
              ayuda="Se dieron de alta y no transfirieron nunca. Es cerrar la venta, no cobrar: del otro lado hay alguien que firmó hace días."
              filas={nuncaPagaron}
            />
          )}
          {vencidos.length > 0 && (
            <Grupo titulo="Ya vencieron" filas={vencidos} />
          )}
          {porVencer.length > 0 && (
            <Grupo titulo={`Vencen en los próximos ${DIAS} días`} filas={porVencer} />
          )}
        </div>
      )}
    </div>
  );
}

function Grupo({
  titulo,
  ayuda,
  filas,
}: {
  titulo: string;
  ayuda?: string;
  filas: Fila[];
}) {
  const total = filas.reduce((n, f) => n + Number(f.monto), 0);

  return (
    <section>
      <div className="mb-3 flex flex-wrap items-baseline justify-between gap-2">
        <h2 className="font-brand text-lead font-bold text-ink">{titulo}</h2>
        <p className="text-ui text-ink-60 tabular-nums">
          {filas.length} {filas.length === 1 ? "tenant" : "tenants"} · {pesos(total)}
        </p>
      </div>

      {ayuda && <p className="mb-3 max-w-2xl text-ui text-ink-60">{ayuda}</p>}

      <div className="flex flex-col gap-2.5">
        {filas.map((f) => (
          <FilaCobranza key={f.lubricentro_id} f={f} />
        ))}
      </div>
    </section>
  );
}

function FilaCobranza({ f }: { f: Fila }) {
  const estado = esEstado(f.estado_cobranza) ? f.estado_cobranza : "al_dia";
  const estilo = ESTILO[estado];

  // El mensaje sale con el monto DE LA BASE, el mismo que el dueño ve en su
  // pantalla de pago. Si los dos números no coinciden, la conversación
  // arranca con los dos mirando cosas distintas.
  const atencion = f.sub_estado === "trial"
    ? (f.dias < 0 ? "trial_vencido" : "trial_por_vencer")
    : (f.dias < 0 ? "cobranza_vencida" : "cobranza_por_vencer");

  const link = esAtencion(atencion)
    ? linkDeAviso({
        atencion,
        telefono: f.telefono,
        ownerNombre: f.owner_nombre,
        lubricentroNombre: f.nombre,
        vencimiento: f.vencimiento,
        periodo: f.periodo,
        descuentoPct: Number(f.descuento_pct),
        plan: null,
        montoTotal: Number(f.monto),
      })
    : null;

  return (
    <article className="surface-card flex flex-wrap items-center justify-between gap-x-5 gap-y-3 px-4 py-3.5 sm:px-5">
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-x-2.5 gap-y-1">
          <Link
            href={`/fidelli/${f.lubricentro_id}`}
            className="font-brand text-body font-bold text-ink hover:underline"
          >
            {f.nombre}
          </Link>
          <span
            className={`rounded-sm border px-1.5 py-0.5 text-label font-semibold tracking-[0.04em] uppercase ${estilo.clase}`}
          >
            {estilo.etiqueta}
          </span>
          {/* Que un tenant esté AFUERA del reloj cambia la conversación:
              no vio ninguna barra ni ningún aviso en su panel, así que no
              es que ignoró — es que no se enteró. */}
          {!f.en_el_reloj && (
            <span className="rounded-sm border border-line bg-surface px-1.5 py-0.5 text-label font-semibold tracking-[0.04em] text-ink-40 uppercase">
              Sin avisos
            </span>
          )}
          {/* Lo único que lo sostiene es el segundo interruptor apagado.
              Es LA información del segundo ciclo: mirando estos se decide
              cuándo prenderlo y a quién le cambia algo. */}
          {f.cortaria && (
            <span className="rounded-sm border border-overdue bg-overdue-soft px-1.5 py-0.5 text-label font-semibold tracking-[0.04em] text-overdue uppercase">
              Cortaría
            </span>
          )}
          {f.sub_estado === "trial" && (
            <span className="rounded-sm border border-line bg-surface px-1.5 py-0.5 text-label font-semibold tracking-[0.04em] text-ink-40 uppercase">
              Trial
            </span>
          )}
        </div>

        <p className="mt-0.5 text-ui text-ink-60 tabular-nums">
          {formatearFecha(f.vencimiento)} · {cuando(f.dias)} ·{" "}
          {ETIQUETA_PERIODO[f.periodo]} · {f.plan_nombre}
          {Number(f.monto_modulo) > 0 && " + gomería"}
          {Number(f.descuento_pct) > 0 && ` · ${f.descuento_pct}% off`}
        </p>

        {/* Lo que ya hizo el tenant, si hizo algo. Generó la cuenta y no
            transfirió es una conversación distinta de ni haber entrado. */}
        {f.orden_estado === "PARTIAL" && (
          <p className="mt-0.5 text-ui text-overdue tabular-nums">
            Transfirió {pesos(Number(f.orden_pagado))} de {pesos(Number(f.monto))}
          </p>
        )}
        {f.orden_estado === "NOT_PAID" && (
          <p className="mt-0.5 text-ui text-ink-40">
            Ya generó la cuenta para transferir
          </p>
        )}
        {f.avisado_at && (
          <p className="mt-0.5 text-ui text-ink-40">
            Ya se le avisó el {formatearFecha(f.avisado_at.slice(0, 10))}
          </p>
        )}
      </div>

      <div className="flex shrink-0 items-center gap-3">
        <p className="font-brand text-lead font-bold text-ink tabular-nums">
          {pesos(Number(f.monto))}
        </p>
        {link ? (
          <a
            href={link}
            target="_blank"
            rel="noreferrer"
            className={clasesBoton("primario")}
          >
            <IconoWhatsapp aria-hidden className="size-4" />
            Escribir
          </a>
        ) : (
          <span className="text-ui text-ink-40">Sin teléfono</span>
        )}
      </div>
    </article>
  );
}

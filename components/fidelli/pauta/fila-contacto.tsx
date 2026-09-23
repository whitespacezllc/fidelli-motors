"use client";

import Link from "next/link";
import { useActionState, useState, useTransition } from "react";
import { formatearFecha } from "@/lib/fechas";
import { Chip, type TonoChip } from "@/components/fidelli/chip";
import { CLASE_LABEL } from "@/components/fidelli/estilos";
import {
  marcarCierreContacto,
  marcarDemoContacto,
  marcarPerdidaContacto,
  reabrirContacto,
  type EstadoAccionPauta,
} from "@/app/fidelli/pauta/actions";
import {
  CANALES,
  ETIQUETA_ESTADO_CONTACTO,
  MOTIVOS_PERDIDA,
  ORIGENES_META,
  estadoDe,
  etiquetaMotivo,
  type Contacto,
  type EstadoContacto,
} from "@/lib/fidelli/pauta";

export type TenantOpcion = { id: string; nombre: string; slug: string };

const INICIAL: EstadoAccionPauta = {};

const TONO_ESTADO: Record<EstadoContacto, TonoChip> = {
  abierto: "neutro",
  demo: "aviso",
  cerrado: "ok",
  perdido: "apagado",
};

const ACCION =
  "inline-flex min-h-9 items-center rounded-md border border-line bg-base px-2.5 text-label font-semibold text-ink hover:bg-surface disabled:opacity-60";
const CAMPO =
  "h-11 rounded-md border border-line bg-base px-3 text-ui text-ink placeholder:text-ink-40";

// ============================================================
// Una fila = un contacto. Las acciones van inline según el estado y son
// reversibles con «Reabrir», así que no hay dialogs de confirmación:
//   abierto → Demo enviada · Cerró · Perdido
//   demo    → Cerró · Perdido
//   cerrado → Reabrir
//   perdido → Reabrir
// «Cerró» y «Perdido» abren un renglón debajo con lo mínimo (el tenant o
// el motivo, y la fecha con hoy) y confirman ahí mismo.
// ============================================================
export function FilaContacto({
  c,
  tenants,
  hoy,
}: {
  c: Contacto;
  tenants: TenantOpcion[];
  hoy: string;
}) {
  const estado = estadoDe(c);
  const [panel, setPanel] = useState<null | "cerro" | "perdido">(null);
  const [pendiente, iniciar] = useTransition();
  const [error, setError] = useState<string | null>(null);

  function simple(accion: () => Promise<EstadoAccionPauta>) {
    setError(null);
    iniciar(async () => {
      const r = await accion();
      if (r.error) setError(r.error);
    });
  }

  const canal = CANALES.find((x) => x.clave === c.canal)?.nombre ?? c.canal;
  const origen = ORIGENES_META.find((x) => x.clave === c.origen)?.nombre ?? null;

  return (
    <li className="px-4 py-3">
      <div className="flex flex-wrap items-start gap-x-4 gap-y-2">
        {/* Cuándo y por dónde */}
        <div className="flex min-w-0 flex-[1_1_12rem] flex-wrap items-center gap-x-2 gap-y-1">
          <span className="text-ui font-semibold text-ink tabular-nums">
            {formatearFecha(c.fecha).slice(0, 5)}
          </span>
          <Chip tono="neutro">
            {canal}
            {origen ? ` · ${origen}` : ""}
          </Chip>
          {c.telefono && <span className="text-ui text-ink-60 tabular-nums">{c.telefono}</span>}
        </div>

        {/* En qué está */}
        <div className="flex min-w-0 flex-[1_1_12rem] flex-wrap items-center gap-x-2 gap-y-1">
          <Chip tono={TONO_ESTADO[estado]}>{ETIQUETA_ESTADO_CONTACTO[estado]}</Chip>
          {estado === "cerrado" && c.lubricentro_id && (
            <Link
              href={`/fidelli/${c.lubricentro_id}`}
              className="text-ui font-semibold text-ink underline underline-offset-2"
            >
              {c.tenant_nombre ?? "ver ficha"}
            </Link>
          )}
          {estado === "cerrado" && c.cierre_at && (
            <span className="text-label text-ink-40 tabular-nums">
              el {formatearFecha(c.cierre_at).slice(0, 5)}
            </span>
          )}
          {estado === "perdido" && (
            <span className="text-ui text-ink-60">
              {etiquetaMotivo(c.motivo_perdida) ?? "sin motivo"}
              {c.perdida_at && (
                <span className="text-label text-ink-40 tabular-nums">
                  {" "}· {formatearFecha(c.perdida_at).slice(0, 5)}
                </span>
              )}
            </span>
          )}
          {estado === "demo" && c.demo_at && (
            <span className="text-label text-ink-40 tabular-nums">
              el {formatearFecha(c.demo_at).slice(0, 5)}
            </span>
          )}
        </div>

        {/* Qué se puede hacer */}
        <div className="flex flex-wrap items-center gap-1.5 sm:ml-auto">
          {(estado === "abierto") && (
            <button
              type="button"
              className={ACCION}
              disabled={pendiente}
              onClick={() => simple(() => marcarDemoContacto(c.id))}
            >
              Demo enviada
            </button>
          )}
          {(estado === "abierto" || estado === "demo") && (
            <>
              <button
                type="button"
                className={`${ACCION} ${panel === "cerro" ? "bg-surface" : ""}`}
                aria-expanded={panel === "cerro"}
                onClick={() => setPanel(panel === "cerro" ? null : "cerro")}
              >
                Cerró
              </button>
              <button
                type="button"
                className={`${ACCION} ${panel === "perdido" ? "bg-surface" : ""}`}
                aria-expanded={panel === "perdido"}
                onClick={() => setPanel(panel === "perdido" ? null : "perdido")}
              >
                Perdido
              </button>
            </>
          )}
          {(estado === "cerrado" || estado === "perdido") && (
            <button
              type="button"
              className={ACCION}
              disabled={pendiente}
              onClick={() => simple(() => reabrirContacto(c.id))}
            >
              Reabrir
            </button>
          )}
        </div>
      </div>

      {error && (
        <p role="alert" className="mt-2 text-label text-overdue">
          {error}
        </p>
      )}

      {panel === "cerro" && (
        <PanelCierre
          contactoId={c.id}
          tenants={tenants}
          hoy={hoy}
          alCerrar={() => setPanel(null)}
        />
      )}
      {panel === "perdido" && (
        <PanelPerdida contactoId={c.id} hoy={hoy} alCerrar={() => setPanel(null)} />
      )}
    </li>
  );
}

// El tenant que cerró: la lista de activos por alta descendente (el que
// acaba de nacer está primero, que es el caso normal) con un buscador.
function PanelCierre({
  contactoId,
  tenants,
  hoy,
  alCerrar,
}: {
  contactoId: string;
  tenants: TenantOpcion[];
  hoy: string;
  alCerrar: () => void;
}) {
  const [q, setQ] = useState("");
  const [estado, confirmar, confirmando] = useActionState(
    async (previo: EstadoAccionPauta, formData: FormData) => {
      const r = await marcarCierreContacto(previo, formData);
      if (r.ok) alCerrar();
      return r;
    },
    INICIAL,
  );

  const aguja = q.trim().toLowerCase();
  const visibles = aguja
    ? tenants.filter(
        (t) => t.nombre.toLowerCase().includes(aguja) || t.slug.toLowerCase().includes(aguja),
      )
    : tenants;

  return (
    <form action={confirmar} className="mt-3 flex flex-wrap items-end gap-x-3 gap-y-2 rounded-md bg-surface px-3 py-3">
      <input type="hidden" name="id" value={contactoId} />
      <div className="min-w-[12rem] flex-1">
        <label htmlFor={`cierre-buscar-${contactoId}`} className={CLASE_LABEL}>
          Lubricentro
        </label>
        <input
          id={`cierre-buscar-${contactoId}`}
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Buscar por nombre o slug"
          className={`${CAMPO} mb-1.5 w-full`}
        />
        <select
          name="lubricentro_id"
          required
          aria-label="Lubricentro que cerró"
          className={`${CAMPO} w-full`}
          defaultValue=""
        >
          <option value="" disabled>
            {visibles.length === 0 ? "Ningún lubricentro coincide" : "Elegí el lubricentro"}
          </option>
          {visibles.slice(0, 60).map((t) => (
            <option key={t.id} value={t.id}>
              {t.nombre} · /{t.slug}
            </option>
          ))}
        </select>
      </div>
      <div>
        <label htmlFor={`cierre-fecha-${contactoId}`} className={CLASE_LABEL}>
          Fecha
        </label>
        <input
          id={`cierre-fecha-${contactoId}`}
          name="fecha"
          type="date"
          defaultValue={hoy}
          max={hoy}
          className={`${CAMPO} tabular-nums`}
        />
      </div>
      <button type="submit" disabled={confirmando} className={`${ACCION} h-11 bg-ink text-base hover:bg-ink`}>
        {confirmando ? "Guardando…" : "Confirmar cierre"}
      </button>
      <button type="button" onClick={alCerrar} className={`${ACCION} h-11`}>
        Cancelar
      </button>
      {estado.error && (
        <p role="alert" className="w-full text-label text-overdue">
          {estado.error}
        </p>
      )}
    </form>
  );
}

function PanelPerdida({
  contactoId,
  hoy,
  alCerrar,
}: {
  contactoId: string;
  hoy: string;
  alCerrar: () => void;
}) {
  const [estado, confirmar, confirmando] = useActionState(
    async (previo: EstadoAccionPauta, formData: FormData) => {
      const r = await marcarPerdidaContacto(previo, formData);
      if (r.ok) alCerrar();
      return r;
    },
    INICIAL,
  );

  return (
    <form action={confirmar} className="mt-3 flex flex-wrap items-end gap-x-3 gap-y-2 rounded-md bg-surface px-3 py-3">
      <input type="hidden" name="id" value={contactoId} />
      <div>
        <label htmlFor={`perdida-motivo-${contactoId}`} className={CLASE_LABEL}>
          Motivo
        </label>
        <select
          id={`perdida-motivo-${contactoId}`}
          name="motivo"
          defaultValue=""
          className={`${CAMPO} min-w-[11rem]`}
        >
          <option value="">Sin motivo</option>
          {MOTIVOS_PERDIDA.map((m) => (
            <option key={m.clave} value={m.clave}>
              {m.nombre}
            </option>
          ))}
        </select>
      </div>
      <div>
        <label htmlFor={`perdida-fecha-${contactoId}`} className={CLASE_LABEL}>
          Fecha
        </label>
        <input
          id={`perdida-fecha-${contactoId}`}
          name="fecha"
          type="date"
          defaultValue={hoy}
          max={hoy}
          className={`${CAMPO} tabular-nums`}
        />
      </div>
      <button type="submit" disabled={confirmando} className={`${ACCION} h-11 bg-ink text-base hover:bg-ink`}>
        {confirmando ? "Guardando…" : "Confirmar"}
      </button>
      <button type="button" onClick={alCerrar} className={`${ACCION} h-11`}>
        Cancelar
      </button>
      {estado.error && (
        <p role="alert" className="w-full text-label text-overdue">
          {estado.error}
        </p>
      )}
    </form>
  );
}

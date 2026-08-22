"use client";

import { useActionState, useMemo, useState } from "react";
import { Boton } from "@/components/ui/boton";
import {
  CLASE_AYUDA,
  CLASE_CAMPO,
  CLASE_ERROR,
  CLASE_LABEL,
} from "@/components/fidelli/estilos";
import {
  fijarOverridePlan,
  type EstadoOverride,
} from "@/app/fidelli/[id]/actions";
import { FEATURES_PLAN, ETIQUETA_FEATURE, type FeaturePlan } from "@/lib/planes";

// Los TRES estados de cada clave, elegibles de forma explícita. "Según el
// plan" BORRA la clave del override — es lo que lo hace parcial: habilitar
// una función no saca al tenant de su plan para todo lo demás. Un switch
// de dos posiciones no puede decir eso.
type EstadoClave = "plan" | "si" | "no";
type EstadoTope = "plan" | "sin_limite" | "numero";

const INICIAL: EstadoOverride = {};

const OPCION =
  "h-9 rounded-md border border-line bg-base px-2 text-ui text-ink";

export function FormOverrides({
  lubricentroId,
  planNombre,
  planFeatures,
  planLimiteSucursales,
  overrides,
}: {
  lubricentroId: string;
  planNombre: string | null;
  planFeatures: Partial<Record<FeaturePlan, boolean>>;
  planLimiteSucursales: number | null;
  overrides: Record<string, boolean | number | null>;
}) {
  // Estado inicial = lo que hay guardado. El submit arma el objeto ENTERO
  // de vuelta: read-modify-write, nunca un parcial.
  const [porFeature, setPorFeature] = useState<Record<FeaturePlan, EstadoClave>>(
    () =>
      Object.fromEntries(
        FEATURES_PLAN.map((f) => [
          f,
          overrides[f] === true ? "si" : overrides[f] === false ? "no" : "plan",
        ]),
      ) as Record<FeaturePlan, EstadoClave>,
  );
  const [tope, setTope] = useState<EstadoTope>(() =>
    "sucursales" in overrides
      ? overrides.sucursales === null
        ? "sin_limite"
        : "numero"
      : "plan",
  );
  const [topeNumero, setTopeNumero] = useState<number>(() =>
    typeof overrides.sucursales === "number" ? overrides.sucursales : 1,
  );
  const [motivo, setMotivo] = useState("");

  const [resultado, enviar, enviando] = useActionState(fijarOverridePlan, INICIAL);

  const hayCambios = useMemo(() => {
    const original = (f: FeaturePlan): EstadoClave =>
      overrides[f] === true ? "si" : overrides[f] === false ? "no" : "plan";
    if (FEATURES_PLAN.some((f) => porFeature[f] !== original(f))) return true;
    const topeOriginal: EstadoTope =
      "sucursales" in overrides
        ? overrides.sucursales === null
          ? "sin_limite"
          : "numero"
        : "plan";
    if (tope !== topeOriginal) return true;
    if (tope === "numero" && overrides.sucursales !== topeNumero) return true;
    return false;
  }, [porFeature, tope, topeNumero, overrides]);

  const armarObjeto = () => {
    const obj: Record<string, boolean | number | null> = {};
    for (const f of FEATURES_PLAN) {
      if (porFeature[f] === "si") obj[f] = true;
      if (porFeature[f] === "no") obj[f] = false;
      // "plan" no escribe la clave: ese es el tercer estado.
    }
    if (tope === "sin_limite") obj.sucursales = null;
    if (tope === "numero") obj.sucursales = Math.max(1, Math.floor(topeNumero));
    return obj;
  };

  const dicePlan = (f: FeaturePlan) => (planFeatures[f] === true ? "sí" : "no");

  return (
    <form
      action={() => enviar({ lubricentroId, overrides: armarObjeto(), motivo })}
      className="flex flex-col gap-4"
    >
      <div className="overflow-x-auto">
        <table className="w-full min-w-[430px] border-collapse text-ui">
          <thead>
            <tr className="border-b border-line text-left">
              <th className="py-2 pr-3 text-label font-semibold tracking-[0.04em] text-ink-40 uppercase">
                Función
              </th>
              <th className="w-40 py-2 text-label font-semibold tracking-[0.04em] text-ink-40 uppercase">
                Override
              </th>
            </tr>
          </thead>
          <tbody>
            {FEATURES_PLAN.map((f) => (
              <tr key={f} className="border-b border-line last:border-b-0">
                <td className="py-2.5 pr-3">
                  <span className="text-ink">{ETIQUETA_FEATURE[f]}</span>
                  <span className="ml-2 text-label text-ink-40">
                    plan: {dicePlan(f)}
                  </span>
                </td>
                <td className="py-2">
                  <label className="sr-only" htmlFor={`ov-${f}`}>
                    Override de {ETIQUETA_FEATURE[f]}
                  </label>
                  <select
                    id={`ov-${f}`}
                    value={porFeature[f]}
                    onChange={(e) =>
                      setPorFeature((v) => ({
                        ...v,
                        [f]: e.target.value as EstadoClave,
                      }))
                    }
                    className={`${OPCION} w-full ${porFeature[f] !== "plan" ? "border-ink font-semibold" : "text-ink-60"}`}
                  >
                    <option value="plan">Según el plan ({dicePlan(f)})</option>
                    <option value="si">Habilitada</option>
                    <option value="no">Deshabilitada</option>
                  </select>
                </td>
              </tr>
            ))}
            <tr>
              <td className="py-2.5 pr-3">
                <span className="text-ink">Límite de sucursales</span>
                <span className="ml-2 text-label text-ink-40 tabular-nums">
                  plan: {planLimiteSucursales ?? "sin límite"}
                </span>
              </td>
              <td className="py-2">
                <div className="flex items-center gap-2">
                  <label className="sr-only" htmlFor="ov-sucursales">
                    Override del límite de sucursales
                  </label>
                  <select
                    id="ov-sucursales"
                    value={tope}
                    onChange={(e) => setTope(e.target.value as EstadoTope)}
                    className={`${OPCION} w-full ${tope !== "plan" ? "border-ink font-semibold" : "text-ink-60"}`}
                  >
                    <option value="plan">
                      Según el plan ({planLimiteSucursales ?? "sin límite"})
                    </option>
                    <option value="numero">Un número</option>
                    <option value="sin_limite">Sin límite</option>
                  </select>
                  {tope === "numero" && (
                    <input
                      type="number"
                      min={1}
                      step={1}
                      inputMode="numeric"
                      aria-label="Cantidad de sucursales"
                      value={topeNumero}
                      onChange={(e) => setTopeNumero(Number(e.target.value))}
                      className={`${CLASE_CAMPO} w-20 text-center tabular-nums`}
                    />
                  )}
                </div>
              </td>
            </tr>
          </tbody>
        </table>
      </div>

      <div>
        <label htmlFor="ov-motivo" className={CLASE_LABEL}>
          Motivo del cambio
        </label>
        <textarea
          id="ov-motivo"
          value={motivo}
          onChange={(e) => setMotivo(e.target.value)}
          rows={2}
          placeholder={`Por qué ${planNombre ? `este tenant sale del plan ${planNombre}` : "se hace la excepción"}…`}
          className={`${CLASE_CAMPO} h-auto resize-none py-2`}
        />
        <p className={CLASE_AYUDA}>
          Obligatorio, mínimo 10 caracteres. Queda en el historial con tu
          nombre: un override sin motivo, seis meses después, es un misterio
          que nadie se anima a apagar.
        </p>
      </div>

      {resultado.error && <p className={CLASE_ERROR}>{resultado.error}</p>}
      {resultado.ok && !hayCambios && (
        <p className="text-ui text-success">Override guardado.</p>
      )}

      <div>
        <Boton
          type="submit"
          disabled={enviando || !hayCambios || motivo.trim().length < 10}
          className="min-w-[170px]"
        >
          {enviando ? "Guardando…" : "Guardar overrides"}
        </Boton>
      </div>
    </form>
  );
}

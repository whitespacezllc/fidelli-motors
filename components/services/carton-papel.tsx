import {
  RENGLONES,
  GRUPOS,
  GRUPOS_CON_ETIQUETA_EN_PAPEL,
  formatearKm,
} from "@/lib/renglones";
import { formatearFecha } from "@/lib/fechas";

export type CartonDatos = {
  lubricentroNombre: string;
  colorTenant: string;
  fecha: string;
  kilometros: number;
  aceiteTipo: string;
  proxServiceKm: number;
  // tipo → detalle (o null si está marcado sin detalle)
  marcados: Record<string, string | null>;
};

function Renglon({
  papel,
  marcado,
  detalle,
  sinBorde = false,
}: {
  papel: string;
  marcado: boolean;
  detalle: string | null;
  // Dentro de un grupo con etiqueta, el último renglón no lleva borde: lo
  // pone el propio grupo. Los renglones sueltos lo llevan siempre.
  sinBorde?: boolean;
}) {
  return (
    <div
      className={`flex items-stretch ${sinBorde ? "" : "border-b border-ink"}`}
    >
      <span
        className={`flex-[1.3] px-2.5 py-2 text-ui ${
          marcado ? "text-ink" : "text-ink-40"
        }`}
      >
        {papel}
      </span>
      <span className="flex w-11 items-center justify-center border-l border-ink text-body font-bold text-[var(--tn)]">
        {marcado ? "✓" : ""}
      </span>
      <span className="flex flex-1 items-center justify-end border-l border-ink px-2.5 py-2 text-right text-label text-ink-60">
        {detalle ?? ""}
      </span>
    </div>
  );
}

// El cartón como lo ve el cliente: la versión B del hi-fi, homenaje al
// cartón físico. Troquel arriba, grilla con bordes, etiquetas verticales de
// grupo en el color del lubricentro y PROX. SERV. KMTS. al pie. Es la única
// pieza del producto donde la grilla con bordes se justifica: es el papel.
export function CartonPapel({ datos }: { datos: CartonDatos }) {
  const estilo = { "--tn": datos.colorTenant } as React.CSSProperties;

  return (
    <div
      style={estilo}
      className="rounded-t-[44px] rounded-b-lg border border-line bg-base px-4 pt-4.5 pb-4 shadow-md"
    >
      {/* El troquel del cartón que colgaba del parasol */}
      <div className="mx-auto mb-3.5 size-11 rounded-full border border-line bg-surface" />

      <div className="mb-3.5 text-center">
        <p className="font-brand text-lead font-bold text-ink">
          {datos.lubricentroNombre}
        </p>
        <p className="text-label font-semibold tracking-[0.14em] text-ink-40 uppercase">
          Lubricentro
        </p>
      </div>

      <div className="border-[1.5px] border-ink tabular-nums">
        {[
          ["Fecha", formatearFecha(datos.fecha)],
          ["Kilómetros", formatearKm(datos.kilometros)],
          ["Aceite tipo", datos.aceiteTipo],
        ].map(([clave, valor]) => (
          <div key={clave} className="flex items-stretch border-b border-ink">
            <span className="flex-[1.3] px-2.5 py-2.5 text-label font-semibold tracking-[0.03em] uppercase">
              {clave}
            </span>
            <span className="flex-1 border-l border-ink px-2.5 py-2.5 text-right text-ui font-semibold">
              {valor}
            </span>
          </div>
        ))}

        {GRUPOS.map((grupo) => {
          const delGrupo = RENGLONES.filter((r) => r.grupo === grupo);
          const conEtiqueta = GRUPOS_CON_ETIQUETA_EN_PAPEL.includes(grupo);

          const filas = delGrupo.map((r, i) => (
            <Renglon
              key={r.tipo}
              papel={r.papel}
              marcado={r.tipo in datos.marcados}
              detalle={datos.marcados[r.tipo] ?? null}
              sinBorde={conEtiqueta && i === delGrupo.length - 1}
            />
          ));

          if (!conEtiqueta) return <div key={grupo}>{filas}</div>;

          return (
            <div key={grupo} className="flex border-b border-ink">
              {/* Etiqueta vertical en el color del lubricentro */}
              <span
                className="flex w-6 items-center justify-center bg-[var(--tn)] text-[10px] font-bold tracking-[0.18em] text-white"
                style={{ writingMode: "vertical-rl", rotate: "180deg" }}
              >
                {grupo}
              </span>
              <div className="flex-1">{filas}</div>
            </div>
          );
        })}

        <div className="flex items-center bg-[var(--tn)]/10">
          <span className="flex-[1.3] px-2.5 py-2.5 text-label font-semibold tracking-[0.03em] uppercase">
            Prox. serv. kmts.
          </span>
          <span className="flex-1 px-2.5 py-2.5 text-right text-ui font-semibold">
            {formatearKm(datos.proxServiceKm)}
          </span>
        </div>
      </div>
    </div>
  );
}

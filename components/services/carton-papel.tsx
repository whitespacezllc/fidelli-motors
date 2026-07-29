import {
  RENGLONES,
  GRUPOS,
  GRUPOS_CON_ETIQUETA_EN_PAPEL,
  formatearKm,
} from "@/lib/renglones";
import { formatearFecha } from "@/lib/fechas";
import { paletaTenant } from "@/lib/cliente/color";

// Un renglón atendido: cambiado (el tilde de siempre) o revisado y en
// buen estado ("OK"). El detalle puede venir en null por cargarse sin
// producto o porque el lubri apagó "mostrar productos".
export type RenglonMarcado = { detalle: string | null; cambiado: boolean };

export type CartonDatos = {
  lubricentroNombre: string;
  colorTenant: string;
  fecha: string;
  kilometros: number;
  aceiteTipo: string;
  // El producto usado como aceite de motor ("Elaion F50 · YPF"). Va EN el
  // cartón, como renglón de la cabecera: en el papel el mecánico escribe
  // la marca al lado del tipo. null = sin producto o el lubri apagó
  // "mostrar productos" — la fila no se dibuja.
  aceiteNombre?: string | null;
  proxServiceKm: number;
  // El papel del cartón, del diseño de experiencia del tenant. null o
  // ausente = el blanco de siempre. Llega ya saneado (hexONull).
  colorPapel?: string | null;
  // tipo → estado del renglón (ausente = no se atendió)
  marcados: Record<string, RenglonMarcado>;
};

// El mismo cartón se dibuja en dos lugares con dos públicos distintos: el
// mecánico lo previsualiza en el panel antes de guardar, y el cliente lo
// abre desde el QR. Es a propósito la misma pieza —lo que ve uno es
// exactamente lo que ve el otro— pero la escala no puede ser la misma: el
// Flow del Cliente pide 18px de piso porque Pedro tiene 60 años y lo lee
// al sol, mientras que el panel es un instrumento a 25 cm de los ojos.
type Escala = "panel" | "cliente";

const ESCALAS: Record<
  Escala,
  {
    caja: string;
    nombre: string;
    bajada: string;
    claveCabecera: string;
    valorCabecera: string;
    renglon: string;
    tilde: string;
    detalle: string;
    etiqueta: string;
    celda: string;
    primeraColumna: string;
  }
> = {
  panel: {
    caja: "px-4 pt-4.5 pb-4",
    nombre: "text-lead",
    bajada: "text-label text-ink-40",
    claveCabecera: "text-label",
    valorCabecera: "text-ui",
    renglon: "text-ui",
    tilde: "w-11 text-body",
    detalle: "text-label",
    etiqueta: "w-6 text-[10px]",
    celda: "px-2.5",
    primeraColumna: "flex-[1.3]",
  },
  cliente: {
    caja: "px-3 pt-4.5 pb-4",
    nombre: "text-c-lead",
    // ink-60 y no ink-40: acá hay que leerlo al sol, y 3,5:1 no alcanza.
    bajada: "text-c-body text-ink-60",
    claveCabecera: "text-c-body",
    valorCabecera: "text-c-body",
    renglon: "text-c-body",
    tilde: "w-12 text-c-lead",
    detalle: "text-c-body",
    etiqueta: "w-8 text-c-body",
    celda: "px-2",
    primeraColumna: "flex-[1.15]",
  },
};

function Renglon({
  papel,
  marcado,
  e,
  sinBorde = false,
}: {
  papel: string;
  marcado: RenglonMarcado | undefined;
  e: (typeof ESCALAS)[Escala];
  // Dentro de un grupo con etiqueta, el último renglón no lleva borde: lo
  // pone el propio grupo. Los renglones sueltos lo llevan siempre.
  sinBorde?: boolean;
}) {
  return (
    <div
      className={`flex items-stretch ${sinBorde ? "" : "border-b border-ink"}`}
    >
      <span
        className={`${e.primeraColumna} ${e.celda} py-2 ${e.renglon} ${
          marcado ? "text-ink" : "text-ink-40"
        }`}
      >
        {papel}
      </span>
      {/* La celda del medio es el estado: el tilde de siempre para lo
          cambiado, "OK" para lo revisado que estaba bien. Como en el
          papel, donde el mecánico tilda lo que cambió y escribe OK en lo
          que solo miró. */}
      {!marcado || marcado.cambiado ? (
        <span
          className={`flex ${e.tilde} items-center justify-center border-l border-ink font-bold text-[var(--tn)]`}
        >
          {marcado ? "✓" : ""}
        </span>
      ) : (
        <span
          className={`flex ${e.tilde} items-center justify-center border-l border-ink ${e.detalle} font-bold text-ink`}
        >
          OK
        </span>
      )}
      <span
        className={`flex flex-1 items-center justify-end border-l border-ink ${e.celda} py-2 text-right ${e.detalle} text-ink-60`}
      >
        {marcado?.detalle ?? ""}
      </span>
    </div>
  );
}

// El cartón como lo ve el cliente: la versión B del hi-fi, homenaje al
// cartón físico. Troquel arriba, grilla con bordes, etiquetas verticales de
// grupo en el color del lubricentro y PROX. SERV. KMTS. al pie. Es la única
// pieza del producto donde la grilla con bordes se justifica: es el papel.
export function CartonPapel({
  datos,
  escala = "panel",
}: {
  datos: CartonDatos;
  escala?: Escala;
}) {
  const e = ESCALAS[escala];

  // La letra chica del papel: solo aparece cuando hay algún "OK" que
  // explicar — un cartón todo de tildes se lee solo, como siempre.
  const hayRevisados = Object.values(datos.marcados).some((m) => !m.cambiado);

  // La tinta de la etiqueta vertical no puede ser blanca fija: el lubri
  // elige su color y podría ser un amarillo, donde el blanco no se lee.
  const paleta = paletaTenant(datos.colorTenant);
  const estilo = {
    "--tn": paleta.primary,
    "--tn-ink": paleta.ink,
    // El papel pinta por style y no por clase: viene de la base. Sin
    // color configurado no se emite nada y manda el bg-base de siempre.
    ...(datos.colorPapel ? { backgroundColor: datos.colorPapel } : {}),
  } as React.CSSProperties;

  return (
    <div
      style={estilo}
      className={`rounded-t-[44px] rounded-b-lg border border-line bg-base ${e.caja} shadow-md`}
    >
      {/* El troquel del cartón que colgaba del parasol */}
      <div className="mx-auto mb-3.5 size-11 rounded-full border border-line bg-surface" />

      <div className="mb-3.5 text-center">
        <p className={`font-brand ${e.nombre} font-bold text-ink`}>
          {datos.lubricentroNombre}
        </p>
        <p
          className={`${e.bajada} font-semibold tracking-[0.14em] uppercase`}
        >
          Lubricentro
        </p>
      </div>

      <div className="border-[1.5px] border-ink tabular-nums">
        {[
          ["Fecha", formatearFecha(datos.fecha)],
          ["Kilómetros", formatearKm(datos.kilometros)],
          ["Aceite tipo", datos.aceiteTipo],
          ...(datos.aceiteNombre ? [["Aceite marca", datos.aceiteNombre]] : []),
        ].map(([clave, valor]) => (
          <div key={clave} className="flex items-stretch border-b border-ink">
            <span
              className={`${e.primeraColumna} ${e.celda} py-2.5 ${e.claveCabecera} font-semibold tracking-[0.03em] uppercase`}
            >
              {clave}
            </span>
            <span
              className={`flex-1 border-l border-ink ${e.celda} py-2.5 text-right ${e.valorCabecera} font-semibold`}
            >
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
              marcado={datos.marcados[r.tipo]}
              e={e}
              sinBorde={conEtiqueta && i === delGrupo.length - 1}
            />
          ));

          if (!conEtiqueta) return <div key={grupo}>{filas}</div>;

          return (
            <div key={grupo} className="flex border-b border-ink">
              {/* Etiqueta vertical en el color del lubricentro */}
              <span
                className={`flex ${e.etiqueta} items-center justify-center bg-[var(--tn)] font-bold tracking-[0.18em] text-[var(--tn-ink)]`}
                style={{ writingMode: "vertical-rl", rotate: "180deg" }}
              >
                {grupo}
              </span>
              <div className="flex-1">{filas}</div>
            </div>
          );
        })}

        <div className="flex items-center bg-[var(--tn)]/10">
          <span
            className={`${e.primeraColumna} ${e.celda} py-2.5 ${e.claveCabecera} font-semibold tracking-[0.03em] uppercase`}
          >
            Prox. serv. kmts.
          </span>
          <span
            className={`flex-1 ${e.celda} py-2.5 text-right ${e.valorCabecera} font-semibold`}
          >
            {formatearKm(datos.proxServiceKm)}
          </span>
        </div>
      </div>

      {hayRevisados && (
        <p className={`mt-2 text-center ${e.detalle} text-ink-60`}>
          <span className="font-bold text-[var(--tn)]">✓</span> se cambió ·{" "}
          <span className="font-bold text-ink">OK</span> se revisó y estaba bien
        </p>
      )}
    </div>
  );
}

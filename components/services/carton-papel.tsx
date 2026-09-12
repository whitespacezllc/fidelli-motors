import {
  RENGLONES,
  GRUPOS,
  GRUPOS_CON_ETIQUETA_EN_PAPEL,
  formatearKm,
} from "@/lib/renglones";
import { formatearFecha } from "@/lib/fechas";
import { paletaTenant } from "@/lib/cliente/color";
import {
  ACCIONES,
  ETIQUETA_ACCION,
  ETIQUETA_POSICION,
  SIGLA_POSICION,
  type PosicionRueda,
} from "@/lib/ruedas";

// Un renglón atendido: cambiado (el tilde de siempre) o revisado y en
// buen estado ("OK"). El detalle puede venir en null por cargarse sin
// producto o porque el lubri apagó "mostrar productos".
export type RenglonMarcado = {
  detalle: string | null;
  cambiado: boolean;
  /** Cuántos se pusieron. Solo se dibuja de 2 para arriba: en el papel
   *  nadie escribe "×1", y un renglón tildado ya significa uno. */
  cantidad?: number;
};

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
    // El esquema de las ruedas del trabajo de gomería. Va con sus propias
    // claves y no con tamaños hardcodeados: es el contrato que ya respetan
    // las dos piezas de arriba.
    ruedaPos: string;
    ruedaDato: string;
    carroceria: string;
    ruedaCelda: string;
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
    ruedaPos: "text-label",
    ruedaDato: "text-label",
    carroceria: "w-10",
    ruedaCelda: "px-2 py-1.5",
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
    // 12px es el piso del panel; en la superficie del cliente el piso es
    // 18 — Pedro lee esto al sol y puede tener 60 años.
    ruedaPos: "text-c-body",
    ruedaDato: "text-c-body",
    // La carrocería es angosta a propósito: el papel del cliente mide 332
    // reales en un celular de 390, y lo que tiene que entrar entero es
    // "DELANTERA IZQUIERDA" a 18px. La franja del medio es una guía de
    // lectura, no un dibujo — se le da el ancho que sobra.
    carroceria: "w-6",
    ruedaCelda: "px-1.5 py-1.5",
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
        className={`flex flex-1 items-center justify-end gap-1.5 border-l border-ink ${e.celda} py-2 text-right ${e.detalle} text-ink-60`}
      >
        {marcado?.detalle ?? ""}
        {/* El "×2": si el auto llevó dos filtros, el papel lo dice. En
            tinta plena y negrita porque es una cantidad, no un detalle —
            se lee de un vistazo aunque el nombre del producto sea largo. */}
        {marcado && (marcado.cantidad ?? 1) > 1 && (
          <b className="shrink-0 font-bold text-ink tabular-nums">
            ×{marcado.cantidad}
          </b>
        )}
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


// ============================================================
// La orden de trabajo — el papel de la mecánica
//
// El escaneo del calco es el activo viral del producto: el trabajo
// mecánico se tiene que ver TAN prolijo como un service, no como un caso
// raro. Por eso habla el mismo idioma de papel que el cartón: troquel,
// grilla con bordes, etiqueta vertical en el color del tenant y una banda
// de cierre. Lo que cambia es el contenido: descripción del trabajo y
// renglones libres, sin los 11 fijos y sin PROX. SERV. — eso es del
// cambio de aceite.
// ============================================================

export type MecanicaDatos = {
  lubricentroNombre: string;
  colorTenant: string;
  colorPapel?: string | null;
  fecha: string;
  /** Opcional en mecánica: se muestra solo si el mecánico lo anotó. */
  kilometros: number | null;
  descripcion: string;
  /** Repuestos y tareas, texto libre. */
  renglones: string[];
};

export function CartonPapelMecanica({
  datos,
  escala = "panel",
}: {
  datos: MecanicaDatos;
  escala?: Escala;
}) {
  const e = ESCALAS[escala];
  const paleta = paletaTenant(datos.colorTenant);
  const estilo = {
    "--tn": paleta.primary,
    "--tn-ink": paleta.ink,
    ...(datos.colorPapel ? { backgroundColor: datos.colorPapel } : {}),
  } as React.CSSProperties;

  return (
    <div
      style={estilo}
      className={`rounded-t-[44px] rounded-b-lg border border-line bg-base ${e.caja} shadow-md`}
    >
      <div className="mx-auto mb-3.5 size-11 rounded-full border border-line bg-surface" />

      <div className="mb-3.5 text-center">
        <p className={`font-brand ${e.nombre} font-bold text-ink`}>
          {datos.lubricentroNombre}
        </p>
        <p className={`${e.bajada} font-semibold tracking-[0.14em] uppercase`}>
          Orden de trabajo
        </p>
      </div>

      <div className="border-[1.5px] border-ink tabular-nums">
        {[
          ["Fecha", formatearFecha(datos.fecha)],
          ...(datos.kilometros != null
            ? [["Kilómetros", formatearKm(datos.kilometros)]]
            : []),
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

        {/* La descripción: qué se le hizo al auto, a lo ancho. */}
        <div className={`border-b border-ink ${e.celda} py-2.5`}>
          <p
            className={`${e.claveCabecera} font-semibold tracking-[0.03em] uppercase`}
          >
            Trabajo realizado
          </p>
          <p className={`mt-1 ${e.renglon} text-ink`}>{datos.descripcion}</p>
        </div>

        {/* Los repuestos y tareas, con la etiqueta vertical del cartón. */}
        {datos.renglones.length > 0 && (
          <div className="flex border-b border-ink">
            <span
              className={`flex ${e.etiqueta} items-center justify-center bg-[var(--tn)] font-bold tracking-[0.18em] text-[var(--tn-ink)]`}
              style={{ writingMode: "vertical-rl", rotate: "180deg" }}
            >
              REP.
            </span>
            <div className="flex-1">
              {datos.renglones.map((r, i) => (
                <div
                  key={`${r}-${i}`}
                  className={`flex items-stretch ${
                    i === datos.renglones.length - 1 ? "" : "border-b border-ink"
                  }`}
                >
                  <span className={`flex-1 ${e.celda} py-2 ${e.renglon} text-ink`}>
                    {r}
                  </span>
                  <span
                    className={`flex ${e.tilde} items-center justify-center border-l border-ink font-bold text-[var(--tn)]`}
                  >
                    ✓
                  </span>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* La banda de cierre, como el PROX. SERV. del cartón: le da el
            mismo peso visual y dice qué es esta pieza. */}
        <div className="flex items-center justify-center bg-[var(--tn)]/10">
          <span
            className={`${e.celda} py-2.5 ${e.claveCabecera} font-semibold tracking-[0.14em] uppercase`}
          >
            Trabajo de mecánica
          </span>
        </div>
      </div>
    </div>
  );
}


// ============================================================
// El papel de la gomería — el trabajo de neumáticos
//
// Mismo idioma que las otras dos piezas: troquel, grilla con bordes,
// etiqueta vertical en el color del tenant y banda de cierre. Lo que
// cambia es el cuerpo: no hay 11 renglones ni PROX. SERV. —eso es del
// cambio de aceite— y en su lugar va EL ESQUEMA DEL AUTO.
//
// El esquema va DENTRO DEL PAPEL Y FUERA DE LA GRILLA de renglones: un
// dibujo de cuatro posiciones con marca y medida no entra en el sistema
// de celdas sin pelearse con él, y afuera del papel pierde la lectura de
// documento que es justo lo que le da valor. El papel nunca pasa de
// 416px, así que está diseñado para unos 390 de contenido útil.
//
// LA PROFUNDIDAD SE MUESTRA Y NO SE INTERPRETA. Sin semáforo, sin
// alarma, sin colores de estado: es un dato, no un diagnóstico. Nuestra
// bandera es la transparencia, no la presión de venta.
// ============================================================

export type RuedaPapel = {
  posicion: PosicionRueda;
  posicionAnterior: PosicionRueda | null;
  colocada: boolean;
  rotada: boolean;
  balanceada: boolean;
  reparada: boolean;
  /** null si el tenant apagó "mostrar productos". */
  marca: string | null;
  medida: string | null;
  indiceCargaVel: string | null;
  dot: string | null;
  profundidadMm: number | null;
  presionPsi: number | null;
};

export type NeumaticosDatos = {
  lubricentroNombre: string;
  colorTenant: string;
  colorPapel?: string | null;
  fecha: string;
  kilometros: number | null;
  alineacion: boolean;
  ruedas: RuedaPapel[];
  /** El beneficio de la compra: rotación y balanceo sin cargo hasta X km
   *  o hasta tal fecha. Ausente en la previsualización (se calcula al
   *  guardar) y cuando el taller lo tiene apagado. */
  beneficio?: { hastaKm: number; hastaFecha: string } | null;
};

export function CartonPapelNeumaticos({
  datos,
  escala = "panel",
}: {
  datos: NeumaticosDatos;
  escala?: Escala;
}) {
  const e = ESCALAS[escala];
  const paleta = paletaTenant(datos.colorTenant);
  const estilo = {
    "--tn": paleta.primary,
    "--tn-ink": paleta.ink,
    ...(datos.colorPapel ? { backgroundColor: datos.colorPapel } : {}),
  } as React.CSSProperties;

  const porPosicion = new Map(datos.ruedas.map((r) => [r.posicion, r]));
  const auxilio = porPosicion.get("auxilio") ?? null;

  return (
    <div
      style={estilo}
      className={`rounded-t-[44px] rounded-b-lg border border-line bg-base ${e.caja} shadow-md`}
    >
      <div className="mx-auto mb-3.5 size-11 rounded-full border border-line bg-surface" />

      <div className="mb-3.5 text-center">
        <p className={`font-brand ${e.nombre} font-bold text-ink`}>
          {datos.lubricentroNombre}
        </p>
        <p className={`${e.bajada} font-semibold tracking-[0.14em] uppercase`}>
          Orden de trabajo
        </p>
      </div>

      <div className="border-[1.5px] border-ink tabular-nums">
        {[
          ["Fecha", formatearFecha(datos.fecha)],
          ...(datos.kilometros != null
            ? [["Kilómetros", formatearKm(datos.kilometros)]]
            : []),
          ["Alineación", datos.alineacion ? "Sí" : "No"],
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

        <div className="flex items-center justify-center bg-[var(--tn)]/10">
          <span
            className={`${e.celda} py-2.5 ${e.claveCabecera} font-semibold tracking-[0.14em] uppercase`}
          >
            Trabajo de gomería
          </span>
        </div>
      </div>

      {/* ---------- EL ESQUEMA, fuera de la grilla ---------- */}
      {datos.ruedas.length > 0 && (
        <div className="mt-3.5">
          <p
            className={`mb-2 text-center ${e.claveCabecera} font-semibold tracking-[0.14em] text-ink-60 uppercase`}
          >
            Tus cubiertas
          </p>

          {/* El auto visto desde arriba: dos columnas de ruedas con la
              carrocería en el medio. La franja central lleva el frente
              marcado para que se lea de una cuál es la trompa. */}
          {/* min-w-0 en las dos columnas: sin eso, el ancho MÍNIMO de la
              grilla es el de la palabra más larga ("IZQUIERDA"), la
              columna del historial se estira para alojarlo y la página
              del cliente se va 8px al costado en un celular de 390. El
              texto ya venía envuelto en dos renglones; lo único que
              cambia es que ahora la caja puede achicarse hasta ahí. */}
          <div className="flex items-stretch gap-1.5">
            <div className="flex min-w-0 flex-1 flex-col gap-1.5">
              <CeldaRueda rueda={porPosicion.get("delantera_izquierda")} posicion="delantera_izquierda" e={e} />
              <CeldaRueda rueda={porPosicion.get("trasera_izquierda")} posicion="trasera_izquierda" e={e} />
            </div>

            <div
              className={`${e.carroceria} flex shrink-0 flex-col items-center justify-between rounded-md border border-ink-40 py-1.5`}
              aria-hidden
            >
              <span className="h-1.5 w-1/2 rounded-full bg-ink-40" />
              <span className="text-ink-40" style={{ writingMode: "vertical-rl" }}>
                ▲
              </span>
              <span className="h-1.5 w-1/2 rounded-full bg-ink-40" />
            </div>

            <div className="flex min-w-0 flex-1 flex-col gap-1.5">
              <CeldaRueda rueda={porPosicion.get("delantera_derecha")} posicion="delantera_derecha" e={e} />
              <CeldaRueda rueda={porPosicion.get("trasera_derecha")} posicion="trasera_derecha" e={e} />
            </div>
          </div>

          {auxilio && (
            <div className="mt-1.5">
              <CeldaRueda rueda={auxilio} posicion="auxilio" e={e} />
            </div>
          )}
        </div>
      )}

      {/* EL BENEFICIO DE LA COMPRA, dentro del papel y con el mismo
          contra-reset: tinta oscura sobre papel claro. Sin colores de
          estado — es una promesa escrita en el cartón, no una alarma. */}
      {datos.beneficio && (
        <p className={`mt-3.5 text-center ${e.ruedaDato} text-ink tabular-nums`}>
          Rotación y balanceo sin cargo hasta los{" "}
          <span className="font-bold">{formatearKm(datos.beneficio.hastaKm)} km</span>{" "}
          o hasta el{" "}
          <span className="font-bold">{formatearFecha(datos.beneficio.hastaFecha)}</span>.
        </p>
      )}
    </div>
  );
}

// Una posición del esquema. Sin rueda cargada queda en gris y dice que no
// se tocó: el papel no miente por omisión.
function CeldaRueda({
  rueda,
  posicion,
  e,
}: {
  rueda: RuedaPapel | undefined;
  posicion: PosicionRueda;
  e: (typeof ESCALAS)[Escala];
}) {
  const hechas = ACCIONES.filter((a) => rueda?.[a]).map((a) => ETIQUETA_ACCION[a]);

  return (
    <div
      className={`min-w-0 flex-1 rounded-md border ${e.ruedaCelda} ${
        rueda ? "border-ink" : "border-ink-40"
      }`}
    >
      <p
        className={`${e.ruedaPos} font-semibold tracking-[0.06em] uppercase ${
          rueda ? "text-ink" : "text-ink-40"
        }`}
      >
        {ETIQUETA_POSICION[posicion]}
      </p>

      {!rueda ? (
        <p className={`${e.ruedaDato} text-ink-40`}>No se tocó</p>
      ) : (
        <>
          {rueda.marca && (
            <p className={`${e.ruedaDato} text-ink`}>{rueda.marca}</p>
          )}
          {rueda.medida && (
            <p className={`${e.ruedaDato} text-ink tabular-nums`}>
              {[rueda.medida, rueda.indiceCargaVel].filter(Boolean).join(" ")}
            </p>
          )}
          {hechas.length > 0 && (
            <p className={`${e.ruedaDato} text-ink-60`}>{hechas.join(" · ")}</p>
          )}
          {rueda.rotada && rueda.posicionAnterior && (
            <p className={`${e.ruedaDato} text-ink-60`}>
              viene de {SIGLA_POSICION[rueda.posicionAnterior]}
            </p>
          )}
          {/* La profundidad, cruda. Ningún color de estado: es un dato. */}
          {rueda.profundidadMm != null && (
            <p className={`${e.ruedaDato} text-ink-60 tabular-nums`}>
              Dibujo {formatearDecimal(rueda.profundidadMm)} mm
            </p>
          )}
          {rueda.dot && (
            <p className={`${e.ruedaDato} text-ink-60 tabular-nums`}>
              DOT {rueda.dot}
            </p>
          )}
        </>
      )}
    </div>
  );
}

// 7.5 → "7,5" y 7.0 → "7": la coma decimal del castellano, sin ceros de
// relleno que en un papel se leen como ruido.
function formatearDecimal(n: number): string {
  return n.toLocaleString("es-AR", { maximumFractionDigits: 1 });
}

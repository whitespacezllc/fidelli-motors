import { BotonExportar } from "@/components/fidelli/boton-exportar";
import { recursosDe, type GrupoRecurso, type NombreParametro, type Recurso } from "@/lib/fidelli/exportar";

// ============================================================
// «Data room»: la última sección de /fidelli/crecimiento (docs/METRICAS.md
// § 1). Una lista de todo lo que se puede bajar en CSV, con una línea que
// dice qué es cada cosa y su botón. No consulta nada: lee el registro de
// lib/fidelli/exportar.ts, así que un recurso nuevo aparece acá solo.
//
// Dos grupos, en el orden del registro: la plataforma (las tablas, fila
// por fila) y Crecimiento (las tablas de esta pantalla, un mes por fila).
// La página le pasa el período vigente en `periodo` y SOLO los botones de
// Crecimiento lo llevan: el grupo Plataforma promete el histórico entero
// (los botones de cada pantalla son los que filtran), y como siete de sus
// ocho recursos sí entienden desde/hasta, filtrar por «lo que el recurso
// entiende» no alcanza; se decide por el grupo (paramsDe).
// ============================================================

/** `desde`, `hasta` (YYYY-MM) y `moneda` de la pantalla, para los recursos que los toman. */
type Periodo = Partial<Record<Extract<NombreParametro, "desde" | "hasta" | "moneda">, string | null | undefined>>;

const GRUPOS: readonly { grupo: GrupoRecurso; titulo: string; nota: string }[] = [
  {
    grupo: "plataforma",
    titulo: "Plataforma",
    nota: "Las tablas, fila por fila. Desde acá sale el histórico entero; los botones de cada pantalla lo filtran.",
  },
  {
    grupo: "crecimiento",
    titulo: "Crecimiento",
    // La moneda la entiende solo movimientos-mrr (el único recurso que
    // convierte) y paramsDe se la pasa solo a ese botón: la nota lo dice
    // así, para que nadie la busque en los otros seis archivos.
    nota: "Las tablas de esta pantalla, un mes por fila, con el rango elegido arriba (y la moneda, en los movimientos de MRR).",
  },
];

export function DataRoom({ periodo = {} }: { periodo?: Periodo }) {
  // Plataforma: sin parámetros, el histórico entero (con el rango de la
  // pantalla, todo lo anterior a agosto desaparecería del archivo sin
  // aviso). Crecimiento: cada recurso recibe solo lo que declara, así a
  // altas-bajas no le llega una moneda que no convierte.
  const paramsDe = (r: Recurso<unknown>): Periodo =>
    r.grupo !== "crecimiento"
      ? {}
      : (Object.fromEntries(Object.entries(periodo).filter(([k]) => r.parametros.includes(k as NombreParametro))) as Periodo);

  return (
    <section className="surface-card overflow-hidden">
      <div className="px-4.5 py-3">
        <h2 className="font-brand text-ui font-bold tracking-[0.04em] text-ink-60 uppercase">Data room</h2>
        <p className="mt-1 text-ui text-ink-60">
          Cada tabla de la plataforma y cada tabla de Crecimiento en CSV, listo para abrir en Excel en español:
          separador «;», decimales con coma, fechas ISO, UTF-8. El diccionario de cada columna está en{" "}
          <code className="text-label whitespace-nowrap">docs/DATA-ROOM.md</code>; las definiciones de negocio, en{" "}
          <code className="text-label whitespace-nowrap">docs/METRICAS.md § 1</code>.
        </p>
      </div>

      {GRUPOS.map(({ grupo, titulo, nota }) => (
        <div key={grupo} className="border-t border-line">
          <div className="border-b border-line bg-surface px-4.5 py-2">
            <h3 className="text-label font-semibold tracking-[0.06em] text-ink-60 uppercase">{titulo}</h3>
            <p className="text-label text-ink-40">{nota}</p>
          </div>
          <ul className="divide-y divide-line">
            {recursosDe(grupo).map((r) => (
              <li key={r.clave} className="flex flex-col gap-2 px-4.5 py-3 sm:flex-row sm:items-center sm:gap-4">
                <div className="min-w-0 flex-1">
                  <p className="text-ui font-semibold text-ink">
                    {r.nombre} <span className="font-normal text-ink-40 tabular-nums">· {r.clave}</span>
                  </p>
                  <p className="text-ui text-ink-60">{r.descripcion}</p>
                </div>
                <BotonExportar recurso={r.clave} params={paramsDe(r)} compacto />
              </li>
            ))}
          </ul>
        </div>
      ))}
    </section>
  );
}

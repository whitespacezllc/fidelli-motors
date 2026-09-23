import Link from "next/link";
import { formatearFecha, formatearMesAnio } from "@/lib/fechas";
import {
  POCOS_CASOS,
  porcentajeDe,
  usd,
  type Agrupar,
  type CanalFiltro,
  type FilaEmbudo,
} from "@/lib/fidelli/pauta";

const TH =
  "px-3 py-2.5 text-right align-bottom text-label font-semibold tracking-[0.06em] text-ink-60 uppercase";
const TD = "px-3 py-2.5 text-right align-middle tabular-nums";

const ENTERO = new Intl.NumberFormat("es-AR", { maximumFractionDigits: 0 });
const DECIMAL = new Intl.NumberFormat("es-AR", { maximumFractionDigits: 1 });

function hrefCon(base: URLSearchParams, clave: string, valor: string): string {
  const p = new URLSearchParams(base);
  if (valor === "semana" || valor === "todos") p.delete(clave);
  else p.set(clave, valor);
  const q = p.toString();
  return `/fidelli/pauta${q ? `?${q}` : ""}`;
}

// ============================================================
// El embudo por período: la cohorte de cada semana (o mes) con sus tasas
// y su ciclo, y la plata del período con su CAC. El CAC va siempre con la
// cantidad de cierres al lado; con menos de 3 cierres, en gris y con
// «pocos casos» (docs/METRICAS.md § 1). Los selectores viven en la URL.
// ============================================================
export function TablaEmbudo({
  filas,
  agrupar,
  canal,
  params,
}: {
  /** Del período más viejo al más nuevo, como los devuelve la base. */
  filas: FilaEmbudo[];
  agrupar: Agrupar;
  canal: CanalFiltro;
  /** Los demás parámetros de la pantalla, para conservarlos en los links. */
  params: Record<string, string | undefined>;
}) {
  const base = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) if (v) base.set(k, v);

  const opcionesAgrupar: { clave: Agrupar; nombre: string }[] = [
    { clave: "semana", nombre: "Semana" },
    { clave: "mes", nombre: "Mes" },
  ];
  const opcionesCanal: { clave: CanalFiltro; nombre: string }[] = [
    { clave: "todos", nombre: "Todos" },
    { clave: "meta", nombre: "Meta" },
    { clave: "google", nombre: "Google" },
  ];

  const ordenadas = [...filas].reverse();

  return (
    <section className="surface-card overflow-hidden">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-line px-4.5 py-3">
        <h2 className="font-brand text-ui font-bold tracking-[0.04em] text-ink-60 uppercase">
          Embudo · últimas {agrupar === "semana" ? "12 semanas" : "12 meses"}
        </h2>
        <div className="flex flex-wrap items-center gap-3">
          <Selector opciones={opcionesAgrupar} valor={agrupar} clave="agrupar" base={base} etiqueta="Agrupar por" />
          <Selector opciones={opcionesCanal} valor={canal} clave="canal" base={base} etiqueta="Canal" />
        </div>
      </div>

      <div className="relative overflow-x-auto">
        <table className="w-full min-w-[720px] table-fixed border-collapse text-ui md:min-w-0">
          <thead>
            <tr className="border-b border-line">
              <th scope="col" className={`${TH} w-[14%] text-left`}>
                {agrupar === "semana" ? "Semana" : "Mes"}
              </th>
              <th scope="col" className={`${TH} w-[10%]`}>Contactos</th>
              <th scope="col" className={`${TH} w-[9%]`}>Demos</th>
              <th scope="col" className={`${TH} w-[9%]`}>Cierres</th>
              <th scope="col" className={`${TH} w-[9%]`}>% demo</th>
              <th scope="col" className={`${TH} w-[9%]`}>% cierre</th>
              <th scope="col" className={`${TH} w-[10%]`}>
                Ciclo
                <span className="block font-normal normal-case tracking-normal text-ink-40">días</span>
              </th>
              <th scope="col" className={`${TH} w-[12%]`}>
                Gasto
                <span className="block font-normal normal-case tracking-normal text-ink-40">US$</span>
              </th>
              <th scope="col" className={`${TH} w-[18%]`}>
                CAC
                <span className="block font-normal normal-case tracking-normal text-ink-40">US$ · cierres del período</span>
              </th>
            </tr>
          </thead>
          <tbody>
            {ordenadas.length === 0 ? (
              <tr>
                <td colSpan={9} className="px-4.5 py-6 text-center text-ui text-ink-60">
                  Todavía no hay contactos ni gasto en este rango.
                </td>
              </tr>
            ) : (
              ordenadas.map((f) => {
                const pocos = f.cierres_periodo < POCOS_CASOS;
                const vacia = f.contactos === 0 && f.gasto_usd === null && f.cierres_periodo === 0;
                return (
                  <tr key={f.periodo} className={`border-b border-line last:border-b-0 ${vacia ? "text-ink-40" : ""}`}>
                    <td className="px-3 py-2.5 text-left align-middle tabular-nums">
                      {agrupar === "semana"
                        ? formatearFecha(f.periodo).slice(0, 5)
                        : formatearMesAnio(f.periodo)}
                    </td>
                    <td className={`${TD} font-semibold ${vacia ? "font-normal" : "text-ink"}`}>{ENTERO.format(f.contactos)}</td>
                    <td className={TD}>{ENTERO.format(f.demos)}</td>
                    <td className={TD}>{ENTERO.format(f.cierres)}</td>
                    <td className={TD}>{porcentajeDe(f.tasa_demo)}</td>
                    <td className={TD}>{porcentajeDe(f.tasa_cierre)}</td>
                    <td className={TD}>
                      {f.ciclo_mediana_dias === null ? "—" : DECIMAL.format(f.ciclo_mediana_dias)}
                    </td>
                    <td className={TD}>{f.gasto_usd === null ? <span className="text-ink-40">sin cargar</span> : usd(f.gasto_usd)}</td>
                    <td className={`${TD} ${pocos ? "text-ink-40" : "text-ink"}`}>
                      {f.cac_usd === null ? "—" : usd(f.cac_usd)}
                      <span className="block text-label text-ink-40">
                        {f.cierres_periodo} {f.cierres_periodo === 1 ? "cierre" : "cierres"}
                        {pocos && f.cac_usd !== null ? " · pocos casos" : ""}
                      </span>
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>
    </section>
  );
}

function Selector<Clave extends string>({
  opciones,
  valor,
  clave,
  base,
  etiqueta,
}: {
  opciones: { clave: Clave; nombre: string }[];
  valor: Clave;
  clave: string;
  base: URLSearchParams;
  etiqueta: string;
}) {
  return (
    <nav aria-label={etiqueta} className="flex gap-1">
      {opciones.map((o) => {
        const activa = o.clave === valor;
        return (
          <Link
            key={o.clave}
            href={hrefCon(base, clave, o.clave)}
            aria-current={activa ? "page" : undefined}
            className={`flex h-9 items-center rounded-md px-3 text-ui transition-colors ${
              activa
                ? "bg-ink font-semibold text-base"
                : "border border-line bg-base text-ink-60 hover:bg-surface"
            }`}
          >
            {o.nombre}
          </Link>
        );
      })}
    </nav>
  );
}

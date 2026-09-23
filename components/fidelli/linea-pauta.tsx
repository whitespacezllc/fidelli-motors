import Link from "next/link";
import { POCOS_CASOS, porcentajeDe, usd, type ResumenPauta } from "@/lib/fidelli/pauta";

// ============================================================
// La oración de pauta del Resumen (bloque MÉTRICAS 3): el embudo de este
// mes en una línea, con link a /fidelli/pauta. Sin gráfico.
//   «Pauta este mes: 62 contactos → 40 demos → 4 cierres · 6,5 % ·
//    gasto US$ 101 · CAC US$ 25 (mes anterior: 5 %)»
// ============================================================
export function LineaPauta({ p }: { p: ResumenPauta }) {
  const partes: string[] = [
    `${p.contactos} ${p.contactos === 1 ? "contacto" : "contactos"}`,
    `${p.demos} ${p.demos === 1 ? "demo" : "demos"}`,
    `${p.cierres} ${p.cierres === 1 ? "cierre" : "cierres"}`,
  ];
  const tasa = p.contactos > 0 ? porcentajeDe(p.tasa_cierre) : null;
  const pocos = p.cierres_periodo < POCOS_CASOS;

  return (
    <p className="mb-5 flex flex-wrap items-baseline gap-x-2 gap-y-1 text-ui text-ink tabular-nums">
      <span className="text-ink-60">Pauta este mes:</span>
      <span>{partes.join(" → ")}</span>
      {tasa && <span className="text-ink-60">· {tasa}</span>}
      <span className="text-ink-60">
        · {p.gasto_usd === null ? "gasto sin cargar" : `gasto ${usd(p.gasto_usd)}`}
      </span>
      {p.gasto_usd !== null && p.cac_usd !== null && (
        <span className={pocos ? "text-ink-40" : "text-ink-60"}>
          · CAC {usd(p.cac_usd)}
          {pocos ? " · pocos casos" : ""}
        </span>
      )}
      {p.mes_anterior_contactos > 0 && (
        <span className="text-ink-40">(mes anterior: {porcentajeDe(p.mes_anterior_tasa_cierre)})</span>
      )}
      <Link
        href="/fidelli/pauta"
        className="font-semibold text-ink underline underline-offset-2"
      >
        Ir a pauta
      </Link>
    </p>
  );
}

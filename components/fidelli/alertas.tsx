import Link from "next/link";
import type { ResumenAdmin, TenantAlerta } from "@/lib/fidelli/resumen";

// ============================================================
// Las alertas del Resumen: oraciones con verbo y un link, ordenadas por
// urgencia. Sin semáforos ni íconos: lo que hay que hacer se lee, no se
// interpreta. Si no hay nada, se dice «Nada que atender.» en gris y ya.
//
// Orden: primero lo que rompe la medición (el cierre), después la plata
// (Cresium, vencimientos), después la operación (tenants que no cargan,
// owners que no entran) y al final el dato que falta (el origen).
// ============================================================

// El § 4 de docs/METRICAS.md, donde está escrito cómo corre el cierre y
// cómo se corre a mano.
const DOC_CIERRE =
  "https://github.com/whitespacezllc/fidelli-motors/blob/develop/docs/METRICAS.md#4--el-cierre-diario";

// Con más de este número de tenants en el mismo estado, la lista de
// nombres se vuelve ruido: va una línea con la cantidad y el link al
// listado filtrado.
const TOPE_NOMBRES = 5;

type Alerta = {
  clave: string;
  texto: string;
  href: string;
  accion: string;
  externo?: boolean;
};

function plural(n: number, uno: string, varios: string): string {
  return n === 1 ? uno : varios;
}

function diasDe(t: TenantAlerta): string {
  if (t.dias == null) return "nunca cargó un trabajo";
  return `no carga trabajos hace ${t.dias} ${plural(t.dias, "día", "días")}`;
}

export function armarAlertas(r: ResumenAdmin): Alerta[] {
  const alertas: Alerta[] = [];

  if (!r.cierre_ayer) {
    alertas.push({
      clave: "cierre",
      texto: "El cierre de ayer no corrió.",
      href: DOC_CIERRE,
      accion: "Ver cómo se corre",
      externo: true,
    });
  }

  if (r.ordenes_cresium > 0) {
    alertas.push({
      clave: "cresium",
      texto: `${r.ordenes_cresium} ${plural(r.ordenes_cresium, "tenant tiene", "tenants tienen")} la orden de Cresium vencida o parcial.`,
      href: "/fidelli/cobranzas",
      accion: "Ir a cobranzas",
    });
  }

  if (r.atencion > 0) {
    alertas.push({
      clave: "atencion",
      texto: `${r.atencion} ${plural(r.atencion, "tenant vencido o por vencer", "tenants vencidos o por vencer")}.`,
      href: "/fidelli/cobranzas",
      accion: "Ir a cobranzas",
    });
  }

  if (r.sin_trabajos.length > TOPE_NOMBRES) {
    alertas.push({
      clave: "sin-trabajos",
      texto: `${r.sin_trabajos.length} tenants activos no cargan trabajos hace más de 7 días.`,
      href: "/fidelli/lubricentros?actividad=sin",
      accion: "Ver cuáles",
    });
  } else {
    for (const t of r.sin_trabajos) {
      alertas.push({
        clave: `sin-trabajos-${t.id}`,
        texto: `${t.nombre} ${diasDe(t)}.`,
        href: `/fidelli/${t.id}`,
        accion: "Abrir la ficha",
      });
    }
  }

  if (r.owner_pendiente.length > TOPE_NOMBRES) {
    alertas.push({
      clave: "owner",
      texto: `${r.owner_pendiente.length} tenants tienen el owner sin activar hace más de 7 días.`,
      href: "/fidelli/lubricentros",
      accion: "Ver el listado",
    });
  } else {
    for (const t of r.owner_pendiente) {
      alertas.push({
        clave: `owner-${t.id}`,
        texto: `${t.nombre} tiene el owner sin activar hace ${t.dias ?? 0} ${plural(t.dias ?? 0, "día", "días")}.`,
        href: `/fidelli/${t.id}`,
        accion: "Abrir la ficha",
      });
    }
  }

  if (r.sin_origen > 0) {
    alertas.push({
      clave: "origen",
      texto: `${r.sin_origen} ${plural(r.sin_origen, "tenant sin origen cargado", "tenants sin origen cargado")}.`,
      href: "/fidelli/lubricentros?origen=sin",
      accion: "Cargarlo",
    });
  }

  return alertas;
}

export function Alertas({ r }: { r: ResumenAdmin }) {
  const alertas = armarAlertas(r);

  return (
    <section className="surface-card overflow-hidden">
      <div className="border-b border-line px-4.5 py-3">
        <h2 className="font-brand text-ui font-bold tracking-[0.04em] text-ink-60 uppercase">
          Alertas
        </h2>
      </div>

      {alertas.length === 0 ? (
        <p className="px-4.5 py-4 text-ui text-ink-60">Nada que atender.</p>
      ) : (
        <ul className="divide-y divide-line">
          {alertas.map((a) => (
            <li
              key={a.clave}
              className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1 px-4.5 py-2.5"
            >
              <span className="text-ui text-ink">{a.texto}</span>
              {a.externo ? (
                <a
                  href={a.href}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-ui font-semibold text-ink underline underline-offset-2"
                >
                  {a.accion}
                </a>
              ) : (
                <Link
                  href={a.href}
                  className="text-ui font-semibold text-ink underline underline-offset-2"
                >
                  {a.accion}
                </Link>
              )}
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

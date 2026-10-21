import type { Metadata } from "next";
import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { obtenerSesion, featureHabilitada, panelSuspendido } from "@/lib/auth/session";
import { BloqueoPlan } from "@/components/panel/bloqueo-plan";
import { CabeceraSeccion } from "@/components/panel/cabecera-seccion";
import { EstadoVacio } from "@/components/ui/estado-vacio";
import { clasesBoton } from "@/components/ui/boton";
import { AccionBloqueada } from "@/components/panel/bloqueo-suspension";
import { formatearFecha } from "@/lib/fechas";
import { formatearPesos } from "@/lib/presupuestos";

export const metadata: Metadata = { title: "Finanzas" };

const POR_PAGINA = 50;

// "El día": cuánta plata entró hoy, esta semana y este mes, y el detalle
// de los ingresos. Nivel 1 — sin costo, sin IVA, sin comprobante.
export default async function PaginaFinanzas({
  searchParams,
}: {
  searchParams: Promise<{ pagina?: string }>;
}) {
  const sesion = await obtenerSesion();
  if (!featureHabilitada(sesion, "finanzas")) {
    return <BloqueoPlan funcion="Finanzas" />;
  }

  const params = await searchParams;
  const pagina = Math.max(1, Number(params.pagina) || 1);
  const suspendido = await panelSuspendido();
  const supabase = await createClient();

  // Los totales salen de la base (resumen_ingresos): el front no suma plata.
  const [resumenRes, listaRes] = await Promise.all([
    supabase.rpc("resumen_ingresos"),
    supabase
      .from("ingresos")
      .select("id, fecha, concepto, monto, sucursales(nombre)", { count: "exact" })
      .order("fecha", { ascending: false })
      .order("created_at", { ascending: false })
      .range((pagina - 1) * POR_PAGINA, pagina * POR_PAGINA - 1),
  ]);

  const resumen = (resumenRes.data ?? { hoy: 0, semana: 0, mes: 0 }) as {
    hoy: number;
    semana: number;
    mes: number;
  };

  const filas = (listaRes.data ?? []).map((i) => ({
    id: i.id,
    fecha: i.fecha,
    concepto: i.concepto,
    monto: Number(i.monto),
    sucursal: i.sucursales?.nombre ?? "",
  }));

  const total = listaRes.count ?? 0;
  const paginas = Math.max(1, Math.ceil(total / POR_PAGINA));

  const tarjetas = [
    { titulo: "Hoy", valor: Number(resumen.hoy) },
    { titulo: "Esta semana", valor: Number(resumen.semana) },
    { titulo: "Este mes", valor: Number(resumen.mes) },
  ];

  return (
    <div>
      <CabeceraSeccion titulo="Finanzas">
        {suspendido ? (
          <AccionBloqueada etiqueta="+ Nuevo ingreso" />
        ) : (
          <Link href="/panel/finanzas/nuevo" className={clasesBoton("primario", "md")}>
            + Nuevo ingreso
          </Link>
        )}
      </CabeceraSeccion>

      {/* El día de un vistazo: tres números grandes, tabulares. */}
      <div className="mb-5 grid gap-3 sm:grid-cols-3">
        {tarjetas.map((t) => (
          <div key={t.titulo} className="surface-card px-5 py-4">
            <p className="text-label font-semibold tracking-[0.06em] text-ink-60 uppercase">
              {t.titulo}
            </p>
            <p className="mt-1 font-brand text-h3 font-bold text-ink tabular-nums">
              {formatearPesos(t.valor)}
            </p>
          </div>
        ))}
      </div>

      {filas.length > 0 ? (
        <>
          <ul className="surface-card px-4 sm:px-5">
            {filas.map((i) => (
              <li
                key={i.id}
                className="flex flex-wrap items-center gap-x-4 gap-y-1 border-b border-line py-3 last:border-b-0 lg:grid lg:grid-cols-[7.5rem_1fr_9rem_8rem] lg:gap-x-4"
              >
                <span className="order-2 text-label text-ink-60 tabular-nums lg:order-none lg:text-ui">
                  {formatearFecha(i.fecha)}
                </span>
                <span className="order-1 w-full truncate text-ui text-ink lg:order-none lg:w-auto">
                  {i.concepto}
                </span>
                <span className="order-3 text-label text-ink-60 lg:order-none lg:text-ui">
                  {i.sucursal}
                </span>
                <span className="order-4 ml-auto text-ui font-semibold text-ink tabular-nums lg:order-none lg:ml-0 lg:text-right">
                  {formatearPesos(i.monto)}
                </span>
              </li>
            ))}
          </ul>

          {paginas > 1 && (
            <nav
              aria-label="Paginación"
              className="mt-4 flex items-center justify-between gap-4"
            >
              {pagina > 1 ? (
                <Link
                  href={`/panel/finanzas?pagina=${pagina - 1}`}
                  className={clasesBoton("secundario", "md")}
                >
                  ← Anteriores
                </Link>
              ) : (
                <span />
              )}
              <span className="text-ui text-ink-60 tabular-nums">
                Página {pagina} de {paginas} · {total} ingresos
              </span>
              {pagina < paginas ? (
                <Link
                  href={`/panel/finanzas?pagina=${pagina + 1}`}
                  className={clasesBoton("secundario", "md")}
                >
                  Siguientes →
                </Link>
              ) : (
                <span />
              )}
            </nav>
          )}
        </>
      ) : (
        <EstadoVacio
          titulo="Todavía no registraste ingresos"
          descripcion="Cargá lo que entra en el día y mirá de un vistazo cuánto llevás hoy, esta semana y este mes. También podés marcar un presupuesto como cobrado."
        >
          {!suspendido && (
            <Link href="/panel/finanzas/nuevo" className={clasesBoton("secundario", "md")}>
              Registrar el primero
            </Link>
          )}
        </EstadoVacio>
      )}
    </div>
  );
}

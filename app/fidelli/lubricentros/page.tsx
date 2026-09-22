import type { Metadata } from "next";
import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { EstadoVacio } from "@/components/ui/estado-vacio";
import { IconoLubricentro } from "@/components/iconos";
import { TablaLubricentros } from "@/components/fidelli/tabla-lubricentros";
import { FiltrosListado } from "@/components/fidelli/filtros-listado";
import { BotonAlta } from "@/components/fidelli/boton-alta";
import {
  aplicarFiltro,
  armarListado,
  filtroDe,
  necesitaAtencion,
  sinActividad,
  sinOrigen,
  type FilaIndicadores,
  type FilaSalud,
  type FilaSemana,
} from "@/lib/fidelli/listado";
import type { PlanCompleto } from "@/components/fidelli/tipos";
import type { OrigenDeFila } from "@/components/fidelli/acciones-tenant";

export const metadata: Metadata = { title: "Lubricentros" };

// Las semanas del sparkline. Doce: un trimestre, que es lo que hace falta
// para ver si un taller se está apagando.
const SEMANAS = 12;

// ============================================================
// El listado de tenants. Era la raíz de /fidelli hasta el bloque MÉTRICAS 2;
// la raíz ahora es el Resumen y la tabla vive acá, con sus filtros y su
// buscador en la URL.
//
// Seis lecturas, TODAS para la plataforma entera y ninguna por fila:
// listado_lubricentros() (que no cambia), el catálogo de planes (para el
// dialog Editar), el origen de cada tenant, y las tres nuevas de
// 20260923100000: salud_tenants(), indicadores_tenants() y
// trabajos_semanales(). Se cruzan por id en lib/fidelli/listado.ts.
// ============================================================
export default async function PaginaLubricentros({
  searchParams,
}: {
  searchParams: Promise<{ atencion?: string; actividad?: string; origen?: string; q?: string }>;
}) {
  const params = await searchParams;
  const filtro = filtroDe(params);
  const q = (params.q ?? "").trim();

  const supabase = await createClient();

  const [filasRes, planesRes, origenesRes, saludRes, indicadoresRes, semanasRes] =
    await Promise.all([
      supabase.rpc("listado_lubricentros"),
      supabase
        .from("planes")
        .select("id, nombre, precio_mensual, descuento_semestral_pct, descuento_anual_pct")
        .eq("activo", true)
        .order("nombre"),
      // El origen de cada tenant, para prellenar Editar y para el chip
      // «Sin origen». Consulta aparte: listado_lubricentros() no se toca.
      supabase.from("lubricentros").select("id, origen, origen_detalle"),
      supabase.rpc("salud_tenants"),
      supabase.rpc("indicadores_tenants"),
      // Sin p_lubricentro_id: todos los tenants en una sola consulta.
      supabase.rpc("trabajos_semanales", { p_semanas: SEMANAS }),
    ]);

  const filas = filasRes.data ?? [];
  const catalogo = (planesRes.data ?? []) as PlanCompleto[];
  const origenes: Record<string, OrigenDeFila> = Object.fromEntries(
    (origenesRes.data ?? []).map((o) => [o.id, { origen: o.origen, detalle: o.origen_detalle }]),
  );

  const listado = armarListado({
    filas,
    salud: (saludRes.data ?? []) as unknown as FilaSalud[],
    indicadores: (indicadoresRes.data ?? []) as unknown as FilaIndicadores[],
    semanas: (semanasRes.data ?? []) as unknown as FilaSemana[],
    origenes,
  });

  const conteos = {
    atencion: listado.filter(necesitaAtencion).length,
    sin_actividad: listado.filter(sinActividad).length,
    sin_origen: listado.filter(sinOrigen).length,
  };
  const visibles = aplicarFiltro(listado, filtro, q);

  return (
    <div>
      <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
        <h1 className="font-brand text-h2 font-bold text-ink">Lubricentros</h1>
        {listado.length > 0 && <BotonAlta />}
      </div>

      {listado.length === 0 ? (
        <EstadoVacio
          icono={<IconoLubricentro className="size-6" />}
          titulo="Todavía no hay ningún lubricentro"
          descripcion="Acá van a aparecer todos los clientes de la plataforma con su estado, su abono, sus trabajos y su salud. Empezá dando de alta el primero."
        >
          <BotonAlta etiqueta="+ Dar de alta el primero" />
        </EstadoVacio>
      ) : (
        <>
          <FiltrosListado filtro={filtro} q={q} conteos={conteos} />

          {visibles.length === 0 ? (
            filtro === "atencion" && !q ? (
              // Sin trabajo pendiente se celebra, no se informa un vacío.
              <div className="surface-card border-success bg-success-soft px-6 py-9 text-center">
                <p className="font-brand text-body font-bold text-success">Estás al día</p>
                <p className="mx-auto mt-1.5 max-w-md text-ui text-ink-60">
                  Ningún trial ni ninguna suscripción vence en los próximos días, y no hay
                  nada vencido sin cobrar.
                </p>
              </div>
            ) : (
              <div className="surface-card px-6 py-9 text-center">
                <p className="font-brand text-body font-bold text-ink">
                  Ningún lubricentro coincide
                </p>
                <p className="mx-auto mt-1.5 max-w-md text-ui text-ink-60">
                  {q
                    ? `No hay ningún nombre ni slug con «${q}» en este filtro.`
                    : "No hay ningún lubricentro en este filtro."}
                </p>
                <Link
                  href="/fidelli/lubricentros"
                  className="mt-4 inline-flex min-h-9 items-center text-ui font-semibold text-ink underline underline-offset-2"
                >
                  Limpiar filtros
                </Link>
              </div>
            )
          ) : (
            <TablaLubricentros filas={visibles} planes={catalogo} />
          )}
        </>
      )}
    </div>
  );
}

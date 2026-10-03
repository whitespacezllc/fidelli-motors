import type { Metadata } from "next";
import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { TablaEncargos } from "@/components/fidelli/calcos/tabla-encargos";
import type { EstadoEncargo } from "@/lib/calcos";
import { ESTADOS_ABIERTOS, leerEncargos, type EncargoAdmin } from "@/lib/fidelli/calcos";

export const metadata: Metadata = { title: "Calcos" };

// Es la pantalla que se abre a la mañana. No se cachea.
export const dynamic = "force-dynamic";

// Los filtros, en el orden en que se trabaja. «Por hacer» es lo que abre:
// una cola con todo lo entregado adentro deja de ser una cola.
const FILTROS: { clave: string; nombre: string; estados: readonly EstadoEncargo[] | null }[] = [
  { clave: "abiertos", nombre: "Por hacer", estados: ESTADOS_ABIERTOS },
  { clave: "pagado", nombre: "Pagados", estados: ["pagado"] },
  { clave: "en_produccion", nombre: "En producción", estados: ["en_produccion"] },
  { clave: "despachados", nombre: "Despachados", estados: ["enviado", "listo_retiro"] },
  { clave: "pendiente_pago", nombre: "Sin pagar", estados: ["pendiente_pago"] },
  { clave: "entregado", nombre: "Entregados", estados: ["entregado"] },
  { clave: "todos", nombre: "Todos", estados: null },
];

function filtrar(encargos: EncargoAdmin[], estados: readonly EstadoEncargo[] | null) {
  return estados ? encargos.filter((e) => estados.includes(e.estado)) : encargos;
}

// ============================================================
// La cola de calcos: los pedidos de TODOS los lubricentros, uno por fila,
// en el orden en que hay que atenderlos. El orden lo trae la base
// (encargos_calcos_admin): pagados sin producir primero y los más viejos
// arriba, después lo que está en la gráfica, lo despachado sin entregar y
// lo que todavía no se pagó. La ficha es el detalle de un lubricentro;
// esto es el trabajo del día.
// ============================================================
export default async function PaginaCalcos({
  searchParams,
}: {
  searchParams: Promise<{ estado?: string }>;
}) {
  const { estado } = await searchParams;
  const filtro = FILTROS.find((f) => f.clave === estado) ?? FILTROS[0];

  const supabase = await createClient();
  const { data } = await supabase.rpc("encargos_calcos_admin");
  const todos = leerEncargos(data);
  const encargos = filtrar(todos, filtro.estados);

  return (
    <div data-calcos>
      <h1 className="mb-1.5 font-brand text-h2 font-bold text-ink">Calcos</h1>
      <p className="mb-5 max-w-2xl text-ui text-ink-60">
        Los pedidos de todos los lubricentros, en el orden en que hay que atenderlos: primero los
        pagados que esperan producción, después lo que está en la gráfica, lo despachado y lo que
        todavía no se pagó.
      </p>

      <nav aria-label="Filtrar por estado" className="mb-4 flex flex-wrap gap-1.5">
        {FILTROS.map((f) => {
          const activo = f.clave === filtro.clave;
          return (
            <Link
              key={f.clave}
              href={f.clave === "abiertos" ? "/fidelli/calcos" : `/fidelli/calcos?estado=${f.clave}`}
              aria-current={activo ? "page" : undefined}
              className={`flex h-11 items-center gap-1.5 rounded-md border px-3 text-ui whitespace-nowrap transition-colors ${
                activo
                  ? "border-ink bg-base font-semibold text-ink"
                  : "border-line bg-base text-ink-60 hover:text-ink"
              }`}
            >
              {f.nombre}
              <span className="text-ink-40 tabular-nums">{filtrar(todos, f.estados).length}</span>
            </Link>
          );
        })}
      </nav>

      {encargos.length > 0 ? (
        <section className="surface-card overflow-hidden">
          <TablaEncargos encargos={encargos} conTenant />
        </section>
      ) : filtro.clave === "abiertos" ? (
        // Sin trabajo pendiente se celebra, en verde.
        <p className="surface-card px-5 py-6 text-ui text-success">
          No hay pedidos de calcos por hacer. Estás al día.
        </p>
      ) : (
        <p className="surface-card px-5 py-6 text-ui text-ink-60">
          Ningún pedido en este estado.{" "}
          <Link href="/fidelli/calcos" className="font-semibold text-ink underline underline-offset-2">
            Ver lo que hay por hacer
          </Link>
        </p>
      )}
    </div>
  );
}

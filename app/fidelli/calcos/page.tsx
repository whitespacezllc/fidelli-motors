import type { Metadata } from "next";
import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { TablaEncargos } from "@/components/fidelli/calcos/tabla-encargos";
import { IconoWhatsapp } from "@/components/iconos";
import { clasesBoton } from "@/components/ui/boton";
import type { EstadoEncargo } from "@/lib/calcos";
import { fechaCalendarioAR, formatearFecha } from "@/lib/fechas";
import {
  ESTADOS_ABIERTOS,
  leerEncargos,
  leerPorAgotarse,
  whatsappPorCalcos,
  type EncargoAdmin,
  type PorAgotarse,
} from "@/lib/fidelli/calcos";
import { cantidadDicha } from "@/lib/stock-calcos";

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

const DECIMAL = new Intl.NumberFormat("es-AR", { maximumFractionDigits: 1 });

// ============================================================
// Los que se quedan sin calcos: la lista que se llama.
//
// Menos de 3 semanas de cobertura y sin un pedido abierto
// (`calcos_por_agotarse()`: la regla es de la base). No están los que
// imprimen por su cuenta, ni los suspendidos, ni el demo. Va arriba de la
// cola porque es lo primero del día: un lubricentro sin calcos no suma
// autos nuevos al programa.
//
// El número es una ESTIMACIÓN —entregadas menos autos nuevos, o lo que el
// dueño contó—: por eso al lado va de dónde sale.
// ============================================================
function SinStock({ filas }: { filas: PorAgotarse[] }) {
  if (filas.length === 0) return null;
  return (
    <section className="surface-card mb-5 overflow-hidden" data-sin-stock>
      <div className="border-b border-line px-4.5 py-3">
        <h2 className="font-brand text-ui font-bold tracking-[0.04em] text-ink-60 uppercase">
          Se quedan sin calcos
        </h2>
        <p className="mt-0.5 text-label text-ink-60">
          Menos de 3 semanas de calcos y ningún pedido abierto. Producir y enviar tarda hasta 2.
        </p>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full min-w-[720px] border-collapse text-ui">
          <thead>
            <tr className="border-b border-line text-left text-label font-semibold tracking-[0.04em] text-ink-60 uppercase">
              <th className="px-4.5 py-2.5 font-semibold">Lubricentro</th>
              <th className="px-4 py-2.5 font-semibold">Le quedan</th>
              <th className="px-4 py-2.5 font-semibold">Autos nuevos</th>
              <th className="px-4 py-2.5 font-semibold">Alcanza para</th>
              <th className="px-4.5 py-2.5 font-semibold">
                <span className="sr-only">Escribirle</span>
              </th>
            </tr>
          </thead>
          <tbody>
            {filas.map((f) => {
              const wa = whatsappPorCalcos(f);
              return (
                <tr
                  key={f.lubricentro_id}
                  data-sin-stock-fila={f.slug}
                  className="border-b border-line align-middle last:border-b-0"
                >
                  <td className="px-4.5 py-2.5">
                    <Link
                      href={`/fidelli/${f.lubricentro_id}?tab=calcos`}
                      className="font-semibold text-ink underline-offset-2 hover:underline"
                    >
                      {f.nombre}
                    </Link>
                    <span className="block text-label text-ink-40 tabular-nums">
                      {f.baseRecuentoAt
                        ? `según su recuento del ${formatearFecha(fechaCalendarioAR(new Date(f.baseRecuentoAt)))}`
                        : "entregadas menos autos nuevos"}
                    </span>
                  </td>
                  <td className="px-4 py-2.5 font-semibold whitespace-nowrap text-ink tabular-nums">
                    unas {cantidadDicha(f.stock)}
                  </td>
                  <td className="px-4 py-2.5 whitespace-nowrap text-ink-60 tabular-nums">
                    {f.ritmo != null ? `${DECIMAL.format(f.ritmo)} por semana` : "—"}
                  </td>
                  <td className="px-4 py-2.5 whitespace-nowrap text-ink-60 tabular-nums">
                    {f.semanas != null
                      ? `${DECIMAL.format(f.semanas)} ${f.semanas === 1 ? "semana" : "semanas"}`
                      : "—"}
                  </td>
                  <td className="px-4.5 py-1.5 text-right">
                    {wa ? (
                      <a
                        href={wa}
                        target="_blank"
                        rel="noreferrer"
                        aria-label={`Escribirle a ${f.ownerNombre ?? f.nombre} por WhatsApp`}
                        className={`${clasesBoton("secundario")} whitespace-nowrap`}
                      >
                        <IconoWhatsapp aria-hidden className="size-4" />
                        Escribirle
                      </a>
                    ) : (
                      <span className="text-ui text-ink-40">Sin teléfono cargado</span>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </section>
  );
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
  const [{ data }, { data: sinStock }] = await Promise.all([
    supabase.rpc("encargos_calcos_admin"),
    supabase.rpc("calcos_por_agotarse"),
  ]);
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

      <SinStock filas={leerPorAgotarse(sinStock)} />

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

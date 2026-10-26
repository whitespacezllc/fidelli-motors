import type { Metadata } from "next";
import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { obtenerSesion, featureHabilitada } from "@/lib/auth/session";
import { BloqueoPlan } from "@/components/panel/bloqueo-plan";
import { CabeceraSeccion } from "@/components/panel/cabecera-seccion";
import { EstadoVacio } from "@/components/ui/estado-vacio";
import { clasesBoton } from "@/components/ui/boton";
import { formatearFecha } from "@/lib/fechas";
import { formatearPesos } from "@/lib/presupuestos";
import {
  ETIQUETA_TIPO,
  ETIQUETA_CONDICION_RECEPTOR,
  type TipoComprobante,
  type CondicionReceptor,
  type EstadoComprobante,
} from "@/lib/facturacion/tipos";

export const metadata: Metadata = { title: "Facturación" };

const POR_PAGINA = 50;

const ETIQUETA_ESTADO: Record<EstadoComprobante, string> = {
  borrador: "Borrador",
  emitido: "Emitido",
  rechazado: "Rechazado",
  anulado: "Anulado",
};

// La cola de comprobantes del módulo Facturación (Nivel 3). En esta rebanada
// todos son BORRADORES: la emisión real con CAE llega después. El taller
// previsualiza acá y configura su parte fiscal en «Configuración fiscal».
export default async function PaginaFacturacion({
  searchParams,
}: {
  searchParams: Promise<{ pagina?: string }>;
}) {
  const sesion = await obtenerSesion();
  if (!featureHabilitada(sesion, "facturacion")) {
    return <BloqueoPlan funcion="Facturación" />;
  }

  const params = await searchParams;
  const pagina = Math.max(1, Number(params.pagina) || 1);
  const supabase = await createClient();

  const { data, count } = await supabase
    .from("comprobantes")
    .select("id, tipo, fecha, receptor_nombre, receptor_condicion, total, estado", {
      count: "exact",
    })
    .order("fecha", { ascending: false })
    .order("created_at", { ascending: false })
    .range((pagina - 1) * POR_PAGINA, pagina * POR_PAGINA - 1);

  const filas = (data ?? []).map((c) => ({
    id: c.id as string,
    tipo: c.tipo as TipoComprobante,
    fecha: c.fecha as string,
    receptor: (c.receptor_nombre as string) ?? "Consumidor final",
    condicion: c.receptor_condicion as CondicionReceptor,
    total: Number(c.total),
    estado: c.estado as EstadoComprobante,
  }));

  const total = count ?? 0;
  const paginas = Math.max(1, Math.ceil(total / POR_PAGINA));

  return (
    <div>
      <CabeceraSeccion titulo="Facturación">
        <Link href="/panel/facturacion/config" className={clasesBoton("secundario", "md")}>
          Configuración fiscal
        </Link>
      </CabeceraSeccion>

      {/* La factura con CAE todavía no se emite: esta rebanada previsualiza.
          Se lo decimos sin letra chica ni jerga. */}
      <div className="mb-5 rounded-lg border border-line bg-surface/60 px-4 py-3">
        <p className="text-ui text-ink-60">
          Por ahora podés <strong className="text-ink">previsualizar</strong> el comprobante de un
          presupuesto y dejar lista tu configuración fiscal. La factura electrónica con CAE llega en
          la próxima entrega.
        </p>
      </div>

      {filas.length > 0 ? (
        <>
          <ul className="surface-card px-4 sm:px-5">
            {filas.map((c) => (
              <li
                key={c.id}
                className="flex flex-wrap items-center gap-x-4 gap-y-1 border-b border-line py-3 last:border-b-0 lg:grid lg:grid-cols-[8.5rem_1fr_8rem_6rem_8rem] lg:gap-x-4"
              >
                <span className="order-1 text-ui font-semibold text-ink">
                  {ETIQUETA_TIPO[c.tipo]}
                </span>
                <span className="order-3 w-full truncate text-ui text-ink lg:order-none lg:w-auto">
                  {c.receptor}
                  <span className="ml-2 text-label text-ink-40">
                    {ETIQUETA_CONDICION_RECEPTOR[c.condicion]}
                  </span>
                </span>
                <span className="order-2 text-label text-ink-60 tabular-nums lg:order-none lg:text-ui">
                  {formatearFecha(c.fecha)}
                </span>
                <span className="order-5 text-label text-ink-60 lg:order-none lg:text-ui">
                  {ETIQUETA_ESTADO[c.estado]}
                </span>
                <span className="order-4 ml-auto text-ui font-semibold text-ink tabular-nums lg:order-none lg:ml-0 lg:text-right">
                  {formatearPesos(c.total)}
                </span>
              </li>
            ))}
          </ul>

          {paginas > 1 && (
            <nav aria-label="Paginación" className="mt-4 flex items-center justify-between gap-4">
              {pagina > 1 ? (
                <Link
                  href={`/panel/facturacion?pagina=${pagina - 1}`}
                  className={clasesBoton("secundario", "md")}
                >
                  ← Anteriores
                </Link>
              ) : (
                <span />
              )}
              <span className="text-ui text-ink-60 tabular-nums">
                Página {pagina} de {paginas} · {total} comprobantes
              </span>
              {pagina < paginas ? (
                <Link
                  href={`/panel/facturacion?pagina=${pagina + 1}`}
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
          titulo="Todavía no armaste ningún comprobante"
          descripcion="Desde un presupuesto, tocá «Facturar» para previsualizar el comprobante que corresponde: la letra, el IVA y el total, calculados según tu condición y la de tu cliente."
        >
          <Link href="/panel/presupuestos" className={clasesBoton("secundario", "md")}>
            Ir a presupuestos
          </Link>
        </EstadoVacio>
      )}
    </div>
  );
}

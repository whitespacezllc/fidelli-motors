import type { Metadata } from "next";
import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { EstadoVacio } from "@/components/ui/estado-vacio";
import { IconoLubricentro } from "@/components/iconos";
import { TablaLubricentros } from "@/components/fidelli/tabla-lubricentros";
import { BotonAlta } from "@/components/fidelli/boton-alta";
import { esAtencion } from "@/lib/fidelli/atencion";
import type { PlanCompleto } from "@/components/fidelli/tipos";

export const metadata: Metadata = { title: "Lubricentros — Fidelli Motors" };

export default async function PaginaLubricentros({
  searchParams,
}: {
  searchParams: Promise<{ atencion?: string }>;
}) {
  const { atencion } = await searchParams;
  const soloAtencion = atencion === "1";

  const supabase = await createClient();

  // Una consulta por pantalla: listado_lubricentros() ya trae la suscripción
  // vigente, la actividad del mes, el estado del owner y —desde el aviso de
  // vencimiento— qué atención necesita cada tenant, si ya se le avisó en
  // este ciclo y a qué número escribirle. Viene ordenada con lo urgente
  // arriba: el ORDER BY no puede depender de algo que se calcule acá.
  const [{ data: filas }, { data: planes }] = await Promise.all([
    supabase.rpc("listado_lubricentros"),
    supabase
      .from("planes")
      .select("id, nombre, precio_mensual, descuento_semestral_pct, descuento_anual_pct")
      .eq("activo", true)
      .order("nombre"),
  ]);

  const lubricentros = filas ?? [];
  const catalogo = (planes ?? []) as PlanCompleto[];

  const necesitanAtencion = lubricentros.filter((l) => esAtencion(l.atencion));
  const sinAvisar = necesitanAtencion.filter((l) => !l.contactado).length;
  const visibles = soloAtencion ? necesitanAtencion : lubricentros;

  return (
    <div>
      <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
        <h1 className="font-brand text-h2 font-bold text-ink">Lubricentros</h1>
        {lubricentros.length > 0 && <BotonAlta />}
      </div>

      {/*
        Acá va la franja de totales —activos, MRR normalizado, services del
        mes, trials en curso— que es de la tarea de métricas generales.
        El espacio queda reservado a propósito: entra entre el título y la
        tabla, sin mover nada de lo que ya está.
      */}

      {lubricentros.length === 0 ? (
        <EstadoVacio
          icono={<IconoLubricentro className="size-6" />}
          titulo="Todavía no hay ningún lubricentro"
          descripcion="Acá van a aparecer todos los clientes de la plataforma con su suscripción, su actividad del mes y el estado de su owner. Empezá dando de alta el primero."
        >
          <BotonAlta etiqueta="+ Dar de alta el primero" />
        </EstadoVacio>
      ) : (
        <>
          <Filtro
            soloAtencion={soloAtencion}
            cuantos={necesitanAtencion.length}
            sinAvisar={sinAvisar}
          />

          {visibles.length === 0 ? (
            // Sin trabajo pendiente se celebra, no se informa un vacío.
            <div className="surface-card border-success bg-success-soft px-6 py-9 text-center">
              <p className="font-brand text-body font-bold text-success">
                Estás al día
              </p>
              <p className="mx-auto mt-1.5 max-w-md text-ui text-ink-60">
                Ningún trial ni ninguna suscripción vence en los próximos días,
                y no hay nada vencido sin cobrar.
              </p>
            </div>
          ) : (
            <TablaLubricentros filas={visibles} planes={catalogo} />
          )}
        </>
      )}
    </div>
  );
}

// Dos enlaces y no un select: el estado queda en la URL, así el filtro se
// puede compartir y sobrevive al refresh que hace cada aviso registrado.
function Filtro({
  soloAtencion,
  cuantos,
  sinAvisar,
}: {
  soloAtencion: boolean;
  cuantos: number;
  sinAvisar: number;
}) {
  const base =
    "flex h-9 items-center gap-2 rounded-md px-3 text-ui transition-colors";

  return (
    <div className="mb-4 flex flex-wrap items-center gap-2">
      <Link
        href="/fidelli"
        aria-current={!soloAtencion ? "page" : undefined}
        className={
          soloAtencion
            ? `${base} border border-line bg-base text-ink-60 hover:bg-surface`
            : `${base} bg-ink font-semibold text-base`
        }
      >
        Todos
      </Link>

      <Link
        href="/fidelli?atencion=1"
        aria-current={soloAtencion ? "page" : undefined}
        className={
          soloAtencion
            ? `${base} bg-ink font-semibold text-base`
            : `${base} border border-line bg-base text-ink-60 hover:bg-surface`
        }
      >
        Necesitan atención
        <span
          className={`rounded-sm px-1.5 py-px text-label font-semibold ${
            cuantos === 0
              ? "bg-surface text-ink-40"
              : soloAtencion
                ? "bg-base text-ink"
                : "bg-overdue-soft text-overdue"
          }`}
        >
          {cuantos}
        </span>
      </Link>

      {sinAvisar > 0 && (
        <span className="text-ui text-ink-60">
          {sinAvisar === 1
            ? "1 sin avisar todavía"
            : `${sinAvisar} sin avisar todavía`}
        </span>
      )}
    </div>
  );
}

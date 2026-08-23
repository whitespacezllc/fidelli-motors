import type { Metadata } from "next";
import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { obtenerSesion, featureHabilitada, panelSuspendido } from "@/lib/auth/session";
import { BloqueoPlan } from "@/components/panel/bloqueo-plan";
import { EstadoVacio } from "@/components/ui/estado-vacio";
import { clasesBoton } from "@/components/ui/boton";
import { DocumentoPresupuesto } from "@/components/presupuestos/documento-presupuesto";
import { AccionesDocumento } from "@/components/presupuestos/acciones-documento";
import { formatearFechaHora } from "@/lib/fechas";

export const metadata: Metadata = { title: "Presupuesto" };

type Props = { params: Promise<{ id: string }> };

// El papel terminado, con sus tres salidas: WhatsApp, impresora y seguir
// trabajando (editar/duplicar). Un suspendido LEE, imprime y comparte lo
// ya generado — lo que no puede es cotizar de nuevo.
export default async function PaginaPresupuesto({ params }: Props) {
  const { id } = await params;
  const sesion = await obtenerSesion();
  if (!featureHabilitada(sesion, "presupuestos")) {
    return <BloqueoPlan funcion="Presupuestos" />;
  }
  const suspendido = await panelSuspendido();
  const supabase = await createClient();

  const [presupuestoRes, configRes] = await Promise.all([
    supabase
      .from("presupuestos")
      .select(
        `id, numero, fecha, validez_dias, observaciones,
         destinatario_nombre, destinatario_telefono, destinatario_vehiculo,
         cliente_id, created_at, updated_at,
         sucursales(nombre), usuarios!usuario_id(nombre),
         presupuesto_items(orden, descripcion, cantidad, precio_unitario)`,
      )
      .eq("id", id)
      .maybeSingle(),
    supabase
      .from("config_experiencia")
      .select("logo_url, color_primario, color_carton")
      .maybeSingle(),
  ]);

  const p = presupuestoRes.data;
  if (!p) {
    return (
      <EstadoVacio
        titulo="No encontramos ese presupuesto"
        descripcion="Puede que el enlace esté mal. Desde el listado podés buscarlo por número."
      >
        <Link href="/panel/presupuestos" className={clasesBoton("secundario", "md")}>
          Ir al listado
        </Link>
      </EstadoVacio>
    );
  }

  const items = [...(p.presupuesto_items ?? [])]
    .sort((a, b) => a.orden - b.orden)
    .map((i) => ({
      descripcion: i.descripcion,
      cantidad: Number(i.cantidad),
      precioUnitario: Number(i.precio_unitario),
    }));

  return (
    <div className="mx-auto max-w-2xl">
      <nav
        aria-label="Estás en"
        className="mb-4 text-ui text-ink-40 print:hidden"
      >
        <Link href="/panel/presupuestos" className="hover:text-ink-60">
          Presupuestos
        </Link>
        <span className="mx-1.5">/</span>
        <span className="font-semibold text-ink tabular-nums">
          N° {p.numero}
        </span>
      </nav>

      <div className="mb-4 flex flex-wrap items-center justify-between gap-3 print:hidden">
        <AccionesDocumento numero={p.numero} />
        {!suspendido && (
          <div className="flex gap-2.5">
            <Link
              href={`/panel/presupuestos/nuevo?desde=${p.id}`}
              className={clasesBoton("secundario", "md")}
            >
              Duplicar
            </Link>
            <Link
              href={`/panel/presupuestos/${p.id}/editar`}
              className={clasesBoton("secundario", "md")}
            >
              Editar
            </Link>
          </div>
        )}
      </div>

      {/* El id lo usa el botón de WhatsApp para serializar EXACTAMENTE
          este nodo a imagen. Lo que ves es lo que viaja. */}
      <div id="documento-presupuesto" className="print:shadow-none">
        <DocumentoPresupuesto
          datos={{
            lubricentroNombre: sesion?.lubricentroNombre ?? "Tu lubricentro",
            logoUrl: configRes.data?.logo_url ?? null,
            colorTenant: configRes.data?.color_primario ?? "#0A0A0A",
            colorPapel: configRes.data?.color_carton ?? null,
            numero: p.numero,
            fecha: p.fecha,
            validezDias: p.validez_dias,
            sucursal: p.sucursales?.nombre ?? null,
            destinatarioNombre: p.destinatario_nombre,
            destinatarioTelefono: p.destinatario_telefono,
            destinatarioVehiculo: p.destinatario_vehiculo,
            observaciones: p.observaciones,
            items,
          }}
        />
      </div>

      <p className="mt-3 text-label text-ink-40 print:hidden">
        Generado por {p.usuarios?.nombre ?? "—"} ·{" "}
        <span className="tabular-nums">{formatearFechaHora(p.created_at)}</span>
        {p.updated_at !== p.created_at && (
          <>
            {" "}
            · editado{" "}
            <span className="tabular-nums">
              {formatearFechaHora(p.updated_at)}
            </span>
          </>
        )}
        {p.cliente_id && (
          <>
            {" "}
            ·{" "}
            <Link
              href={`/panel/clientes/${p.cliente_id}`}
              className="underline underline-offset-4 hover:text-ink-60"
            >
              ver ficha del cliente
            </Link>
          </>
        )}
      </p>
    </div>
  );
}

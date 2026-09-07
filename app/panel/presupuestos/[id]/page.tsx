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

// El logo entra al documento como data URL y no como URL del storage. El
// PDF lo dibuja pasándolo por un canvas (ver generar-pdf.ts), y un canvas
// con una imagen de otro origen se "contamina" y no se puede exportar; un
// data URL cuenta como propio y esquiva ese problema sin depender de los
// headers CORS del bucket. Inlinearlo desde el server también acelera la
// pantalla. Si el fetch falla o el archivo es raro, va la URL cruda: la
// pantalla lo muestra igual.
async function logoComoDataUrl(url: string): Promise<string> {
  try {
    const res = await fetch(url, { next: { revalidate: 3600 } });
    if (!res.ok) return url;
    const tipo = res.headers.get("content-type") ?? "";
    if (!tipo.startsWith("image/")) return url;
    const bytes = await res.arrayBuffer();
    // Un logo de verdad pesa unos KB; un archivo enorme inflaría el HTML
    // de la página entera. Ante uno así, mejor la URL de siempre.
    if (bytes.byteLength > 1_000_000) return url;
    return `data:${tipo};base64,${Buffer.from(bytes).toString("base64")}`;
  } catch {
    return url;
  }
}

// El papel terminado, con sus tres salidas: PDF, impresora y seguir
// trabajando (editar/duplicar). Un suspendido LEE, imprime y descarga lo
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

  const logoUrl = configRes.data?.logo_url
    ? await logoComoDataUrl(configRes.data.logo_url)
    : null;

  // Un solo objeto para las dos salidas: el documento en pantalla (y su
  // impresión) y el PDF que dibuja AccionesDocumento. Misma fuente, cero
  // chance de que el papel y el archivo se desincronicen.
  const datos = {
    lubricentroNombre: sesion?.lubricentroNombre ?? "Tu lubricentro",
    logoUrl,
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
  };

  return (
    <div className="mx-auto max-w-2xl">
      {/* La impresión sale de esta misma página: el chrome propio y el del
          layout llevan print:hidden, y esto define la hoja. El margen es el
          mismo que usa el PDF descargado: las dos salidas entregan el mismo
          papel. print-color-adjust conserva la banda del total y el color
          de papel del tenant, que sin eso la impresora "ahorra". */}
      <style>{`
        @page { size: A4 portrait; margin: 12mm; }
        @media print {
          #documento-presupuesto, #documento-presupuesto * {
            -webkit-print-color-adjust: exact;
            print-color-adjust: exact;
          }
        }
      `}</style>
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
        <AccionesDocumento datos={datos} />
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

      {/* El id ancla la impresión y da un objetivo estable en el DOM. El
          PDF no sale de este nodo: lo dibuja AccionesDocumento con los
          mismos datos. */}
      <div id="documento-presupuesto" className="print:shadow-none">
        <DocumentoPresupuesto datos={datos} />
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

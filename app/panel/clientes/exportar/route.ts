import { NextRequest, NextResponse } from "next/server";
import writeXlsxFile from "write-excel-file/node";
import { createClient } from "@/lib/supabase/server";
import { obtenerSesion } from "@/lib/auth/session";
import { filtroClientes } from "@/lib/clientes";
import { formatearFecha, hoyISO } from "@/lib/fechas";

// La exportación de clientes a Excel. Es .xlsx y no CSV a propósito:
// Excel en español abre los CSV con coma como una sola columna, y las
// tildes se rompen si el encoding no es exacto. Un xlsx real abre bien
// siempre — y este archivo existe para que Bruno lo abra, lo filtre y
// se lo mande al contador.
//
// Se genera en el SERVIDOR: son datos del tenant y el navegador del
// taller es lento. Una sola consulta a vista_clientes, que ya trae las
// patentes y el último service agregados por Postgres — sin N+1 aunque
// haya 3.000 clientes.

// "clientes-lubricentro-san-martin-2026-07-25.xlsx"
function nombreDeArchivo(lubricentro: string, hoy: Date): string {
  const slug = lubricentro
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
  // hoyISO y no toISOString: el nombre lleva el día del negocio, no el UTC.
  const fecha = hoyISO(hoy);
  return `clientes-${slug}-${fecha}.xlsx`;
}

export async function GET(request: NextRequest) {
  const sesion = await obtenerSesion();
  if (!sesion?.lubricentroId) {
    return NextResponse.redirect(new URL("/login", request.url));
  }

  const q = request.nextUrl.searchParams.get("q") ?? undefined;
  const { filtros } = filtroClientes(q);

  const supabase = await createClient();
  let consulta = supabase
    .from("vista_clientes")
    .select(
      `nombre, telefono, email, cantidad_vehiculos, patentes_lista,
       ultimo_service_fecha, ultimo_service_km, ultimo_prox_service_km`,
    )
    .order("nombre");
  if (filtros) consulta = consulta.or(filtros);

  const { data, error } = await consulta;

  if (error) {
    return new NextResponse("No se pudo generar el archivo. Probá de nuevo.", {
      status: 500,
    });
  }

  // El botón ya avisa cuando no hay resultados; esto cubre el acceso
  // directo a la URL. Nunca un archivo vacío.
  if (!data || data.length === 0) {
    return new NextResponse(
      "No hay clientes para exportar con ese filtro. Volvé al listado y probá con otra búsqueda.",
      { status: 404, headers: { "Content-Type": "text/plain; charset=utf-8" } },
    );
  }

  // Cabecera en negrita, columnas con ancho razonable, fechas argentinas.
  // Nada de fórmulas ni formato condicional: es un export, no un informe.
  const CABECERA = [
    "Nombre",
    "Teléfono",
    "Email",
    "Cantidad de vehículos",
    "Patentes",
    "Último service",
    "Kilómetros del último service",
    "Próximo service (km)",
  ].map((titulo) => ({ value: titulo, fontWeight: "bold" as const }));

  const filas = data.map((c) => [
    { type: String, value: c.nombre ?? "" },
    { type: String, value: c.telefono ?? "" },
    { type: String, value: c.email ?? "" },
    { type: Number, value: c.cantidad_vehiculos ?? 0 },
    { type: String, value: c.patentes_lista ?? "" },
    // Sin services, celdas vacías: nunca "null" ni un 0 que mienta.
    {
      type: String,
      value: c.ultimo_service_fecha ? formatearFecha(c.ultimo_service_fecha) : "",
    },
    c.ultimo_service_km == null
      ? { type: String, value: "" }
      : { type: Number, value: c.ultimo_service_km },
    c.ultimo_prox_service_km == null
      ? { type: String, value: "" }
      : { type: Number, value: c.ultimo_prox_service_km },
  ]);

  const buffer = await writeXlsxFile([CABECERA, ...filas], {
    columns: [
      { width: 26 },
      { width: 16 },
      { width: 30 },
      { width: 20 },
      { width: 24 },
      { width: 15 },
      { width: 26 },
      { width: 20 },
    ],
  }).toBuffer();

  const archivo = nombreDeArchivo(
    sesion.lubricentroNombre ?? "lubricentro",
    new Date(),
  );

  return new NextResponse(new Uint8Array(buffer), {
    headers: {
      "Content-Type":
        "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": `attachment; filename="${archivo}"`,
      "Cache-Control": "no-store",
    },
  });
}

import { NextRequest, NextResponse } from "next/server";
import { filtroClientes } from "@/lib/clientes";
import {
  contextoExportacion,
  respuestaError,
  respuestaSinFilas,
  respuestaXlsx,
} from "@/lib/exportar/respuesta";
import { paginar, paginarPorLotes } from "@/lib/exportar/paginar";
import {
  fecha,
  generarXlsx,
  nombreArchivo,
  numero,
  patente,
  texto,
  textoLiteral,
  type Celda,
} from "@/lib/exportar/xlsx";

// ============================================================
// La exportación de clientes: dos hojas, "Clientes" y "Vehículos".
//
// Se genera en el SERVIDOR: son datos del tenant y el navegador del taller
// es lento. Cinco pasadas paginadas, cada una con sus relaciones resueltas
// por Postgres —vista_clientes y vista_vehiculos ya traen los agregados—
// y nunca una consulta por fila. RLS filtra por tenant.
//
// Con filtro (la búsqueda del listado) se exportan los clientes que
// coinciden y los vehículos de esos clientes; sin filtro, todo.
// ============================================================

// El estado de retención, con la misma etiqueta que la pantalla de "A
// quién llamar". Sale de vista_proximos_service tal cual: acá no se
// recalcula nada.
const ESTADO: Record<string, string> = {
  vencido: "Vencido",
  urgente: "Urgente",
  proximo: "Próximo",
};

export async function GET(request: NextRequest) {
  const contexto = await contextoExportacion();
  if (!contexto) {
    return NextResponse.redirect(new URL("/login", request.url));
  }
  const { supabase, slug } = contexto;

  const q = request.nextUrl.searchParams.get("q") ?? undefined;
  const { filtros } = filtroClientes(q);

  try {
    // ---------- 1 · Los clientes, como los muestra la solapa ----------
    const clientes = (
      await paginar((desde, hasta) => {
        let consulta = supabase
          .from("vista_clientes")
          .select(
            `id, nombre, telefono, email, cuit, created_at, cantidad_vehiculos,
             patentes_lista, ultimo_service_fecha, ultima_visita_fecha,
             ultimo_service_km, ultimo_prox_service_km`,
          );
        if (filtros) consulta = consulta.or(filtros);
        return consulta.order("nombre").order("id").range(desde, hasta);
      })
    ).flatMap((c) => (c.id && c.nombre ? [{ ...c, id: c.id, nombre: c.nombre }] : []));

    if (clientes.length === 0) {
      return respuestaSinFilas(
        "No hay clientes para exportar con ese filtro. Volvé al listado y probá con otra búsqueda.",
      );
    }

    // null = sin filtro, todo el tenant. Con filtro, solo los hijos de
    // estos clientes.
    const idsClientes = filtros ? clientes.map((c) => c.id) : null;
    const clientePorId = new Map(clientes.map((c) => [c.id, c]));

    // ---------- 2 · Sus vehículos ----------
    const vehiculos = (
      await paginarPorLotes(idsClientes, (lote, desde, hasta) => {
        let consulta = supabase
          .from("vista_vehiculos")
          .select(
            `id, cliente_id, patente, patente_normalizada, marca, modelo, anio,
             created_at, cantidad_trabajos, ultima_visita_fecha, ultimo_service_fecha`,
          );
        if (lote) consulta = consulta.in("cliente_id", lote);
        return consulta.order("patente_normalizada").order("id").range(desde, hasta);
      })
    )
      .flatMap((v) => (v.id && v.patente ? [{ ...v, id: v.id, patente: v.patente }] : []))
      // Por lotes el orden global se pierde: se repone acá.
      .sort((a, b) => (a.patente_normalizada ?? "").localeCompare(b.patente_normalizada ?? ""));

    const idsVehiculos = filtros ? vehiculos.map((v) => v.id) : null;

    // ---------- 3 · El último service de cada vehículo ----------
    // Km y próximo service del último service NO anulado, el mismo que
    // toma vista_proximos_service. Se pide de la tabla y no de la vista
    // porque la vista solo trae los que vencen dentro de 30 días, y estos
    // dos datos tienen que estar en todos los vehículos que tengan alguno.
    const services = await paginarPorLotes(idsVehiculos, (lote, desde, hasta) => {
      let consulta = supabase
        .from("services")
        .select("vehiculo_id, kilometros, prox_service_km")
        .eq("tipo", "service")
        .eq("anulado", false);
      if (lote) consulta = consulta.in("vehiculo_id", lote);
      return consulta
        .order("vehiculo_id")
        .order("fecha", { ascending: false })
        .order("created_at", { ascending: false })
        .range(desde, hasta);
    });
    const ultimoService = new Map<string, (typeof services)[number]>();
    for (const s of services) {
      if (!ultimoService.has(s.vehiculo_id)) ultimoService.set(s.vehiculo_id, s);
    }

    // ---------- 4 · Estado y fecha estimada: vista_proximos_service ----------
    const proximos = await paginarPorLotes(idsVehiculos, (lote, desde, hasta) => {
      let consulta = supabase
        .from("vista_proximos_service")
        .select("vehiculo_id, fecha_estimada, estado");
      if (lote) consulta = consulta.in("vehiculo_id", lote);
      return consulta.order("vehiculo_id").range(desde, hasta);
    });
    const proximoPorVehiculo = new Map(
      proximos.flatMap((p) => (p.vehiculo_id ? [[p.vehiculo_id, p] as const] : [])),
    );

    // ---------- 5 · Las notas, que en el sistema son por vehículo ----------
    const notas = await paginarPorLotes(idsVehiculos, (lote, desde, hasta) => {
      let consulta = supabase.from("notas_vehiculo").select("vehiculo_id, contenido");
      if (lote) consulta = consulta.in("vehiculo_id", lote);
      return consulta.order("vehiculo_id").order("created_at").range(desde, hasta);
    });
    const notasPorVehiculo = new Map<string, string[]>();
    for (const n of notas) {
      const lista = notasPorVehiculo.get(n.vehiculo_id) ?? [];
      lista.push(n.contenido.trim());
      notasPorVehiculo.set(n.vehiculo_id, lista);
    }

    // Trabajos por cliente: la suma de los de sus vehículos (no anulados,
    // de cualquier tipo, como cuenta vista_vehiculos).
    const trabajosPorCliente = new Map<string, number>();
    for (const v of vehiculos) {
      if (!v.cliente_id) continue;
      trabajosPorCliente.set(
        v.cliente_id,
        (trabajosPorCliente.get(v.cliente_id) ?? 0) + (v.cantidad_trabajos ?? 0),
      );
    }

    // ---------- Las hojas ----------
    const filasClientes: Celda[][] = clientes.map((c) => [
      texto(c.nombre),
      textoLiteral(c.telefono),
      texto(c.email),
      textoLiteral(c.cuit),
      texto(c.patentes_lista),
      numero(c.cantidad_vehiculos ?? 0),
      numero(trabajosPorCliente.get(c.id) ?? 0),
      fecha(c.ultima_visita_fecha),
      fecha(c.ultimo_service_fecha),
      numero(c.ultimo_service_km),
      numero(c.ultimo_prox_service_km),
      fecha(c.created_at),
    ]);

    const filasVehiculos: Celda[][] = vehiculos.map((v) => {
      const cliente = v.cliente_id ? clientePorId.get(v.cliente_id) : undefined;
      const ultimo = ultimoService.get(v.id);
      const proximo = proximoPorVehiculo.get(v.id);
      return [
        patente(v.patente),
        texto(cliente?.nombre),
        textoLiteral(cliente?.telefono),
        texto(v.marca),
        texto(v.modelo),
        numero(v.anio),
        numero(ultimo?.kilometros),
        fecha(v.ultima_visita_fecha),
        fecha(v.ultimo_service_fecha),
        numero(ultimo?.prox_service_km),
        fecha(proximo?.fecha_estimada),
        texto(proximo?.estado ? (ESTADO[proximo.estado] ?? proximo.estado) : null),
        numero(v.cantidad_trabajos ?? 0),
        texto(notasPorVehiculo.get(v.id)?.filter(Boolean).join(" · ")),
        fecha(v.created_at),
      ];
    });

    const archivo = await generarXlsx([
      {
        nombre: "Clientes",
        cabecera: [
          "Nombre",
          "Teléfono",
          "Email",
          "CUIT",
          "Vehículos",
          "Cantidad de vehículos",
          "Cantidad de trabajos",
          "Último trabajo",
          "Último service",
          "Kilómetros del último service",
          "Próximo service (km)",
          "Fecha de alta",
        ],
        filas: filasClientes,
      },
      {
        nombre: "Vehículos",
        cabecera: [
          "Patente",
          "Cliente",
          "Teléfono del cliente",
          "Marca",
          "Modelo",
          "Año",
          "Kilómetros del último service",
          "Fecha del último trabajo",
          "Fecha del último service",
          "Próximo service (km)",
          "Próximo service (fecha estimada)",
          "Estado",
          "Cantidad de trabajos",
          "Notas",
          "Fecha de alta",
        ],
        filas: filasVehiculos,
      },
    ]);

    return respuestaXlsx(archivo, nombreArchivo(slug, "clientes"), clientes.length);
  } catch {
    return respuestaError();
  }
}

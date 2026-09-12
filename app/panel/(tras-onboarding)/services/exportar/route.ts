import { NextRequest, NextResponse } from "next/server";
import {
  aplicarFiltrosTrabajos,
  filtrosTrabajos,
  ETIQUETA_TIPO,
} from "@/lib/trabajos";
import { ETIQUETA_POSICION, resumenRuedas } from "@/lib/ruedas";
import { RENGLONES, type ItemTipo } from "@/lib/renglones";
import {
  contextoExportacion,
  respuestaError,
  respuestaSinFilas,
  respuestaXlsx,
} from "@/lib/exportar/respuesta";
import { paginar } from "@/lib/exportar/paginar";
import {
  fecha,
  fechaHora,
  generarXlsx,
  nombreArchivo,
  numero,
  patente,
  siNo,
  texto,
  textoLiteral,
  type Celda,
} from "@/lib/exportar/xlsx";

// ============================================================
// La exportación de trabajos: dos hojas.
//
//  · "Trabajos": una fila por trabajo, con el vehículo, el cliente, la
//    sucursal, el aceite, los renglones del cartón y un resumen de los
//    productos del catálogo que se usaron.
//  · "Productos por trabajo": una fila por producto usado, con su
//    cantidad. Es la hoja para contabilidad y para cruzar con el stock.
//
// Los mismos filtros que la solapa (lib/trabajos.ts), paginado de a mil
// con todas las relaciones embebidas en la consulta de cada página: un
// lubricentro con 4.000 trabajos exporta 4.000 en cuatro consultas.
//
// No hay importes: en el modelo operativo no existen (regla 6 del
// CLAUDE.md), y el precio de lista de hoy no es el precio de un trabajo
// de hace seis meses.
// ============================================================

// El renglón del cartón, escrito como se lee. Los once, en el orden del
// papel.
const ETIQUETA_RENGLON: Record<ItemTipo, string> = {
  filtro_aceite: "Filtro de aceite",
  filtro_aire: "Filtro de aire",
  filtro_combustible: "Filtro de combustible",
  filtro_habitaculo: "Filtro de habitáculo",
  aceite_caja: "Aceite de caja",
  aceite_diferencial: "Aceite de diferencial",
  aceite_hidraulico: "Aceite hidráulico",
  liq_refrigerante: "Líquido refrigerante",
  liq_frenos: "Líquido de frenos",
  aditivo_motor: "Aditivo de motor",
  aditivo_transmision: "Aditivo de transmisión",
};

const ORDEN_RENGLON = new Map(RENGLONES.map((r, i) => [r.tipo, i]));

type Producto = { nombre: string; marca: string | null; unidad: string };

type Item = {
  item_tipo: ItemTipo | null;
  detalle: string | null;
  cambiado: boolean;
  cantidad: number;
  productos: Producto | null;
};

// "4" · "4,5" — como se lee en Argentina.
function cantidadTexto(valor: number | null | undefined): string {
  return valor == null ? "" : valor.toLocaleString("es-AR");
}

function nombreProducto(p: Producto): string {
  return [p.nombre, p.marca].filter(Boolean).join(" ");
}

// Los renglones en el orden del cartón; los libres (mecánica), al final.
function ordenar(items: Item[]): Item[] {
  return [...items].sort(
    (a, b) =>
      (a.item_tipo ? (ORDEN_RENGLON.get(a.item_tipo) ?? 99) : 99) -
      (b.item_tipo ? (ORDEN_RENGLON.get(b.item_tipo) ?? 99) : 99),
  );
}

// La cantidad de aceite que se movió del stock, con la MISMA regla que
// guardar_service en la base: a granel (unidad = litro) los litros del
// service; envasado, una unidad por service. Si es a granel y no se
// anotaron litros, no se movió nada y la celda queda vacía.
function cantidadAceite(aceite: Producto, litros: number | null): number | null {
  if (aceite.unidad === "litro") return litros;
  return 1;
}

type Trabajo = {
  aceite: Producto | null;
  aceite_litros: number | null;
};

// "Elaion F50 15W40 ×4 L; Filtro de aceite W712 ×1"
function resumenProductos(trabajo: Trabajo, items: Item[]): string {
  const partes: string[] = [];
  if (trabajo.aceite) {
    const cantidad = cantidadAceite(trabajo.aceite, trabajo.aceite_litros);
    const unidad = trabajo.aceite.unidad === "litro" ? " L" : "";
    partes.push(
      cantidad == null
        ? trabajo.aceite.nombre
        : `${trabajo.aceite.nombre} ×${cantidadTexto(cantidad)}${unidad}`,
    );
  }
  for (const item of items) {
    if (item.productos) {
      partes.push(`${item.productos.nombre} ×${cantidadTexto(item.cantidad)}`);
    }
  }
  return partes.join("; ");
}

// "Filtro de aceite: Mann W712 (cambiado); Filtro de aire (OK)". Los
// renglones libres de la mecánica van con su texto y su cantidad.
function renglones(items: Item[]): string {
  return items
    .map((item) => {
      const nombre =
        item.detalle?.trim() || (item.productos ? nombreProducto(item.productos) : "");
      const cantidad = item.cantidad !== 1 ? ` ×${cantidadTexto(item.cantidad)}` : "";
      if (item.item_tipo) {
        const etiqueta = ETIQUETA_RENGLON[item.item_tipo];
        const estado = item.cambiado ? "cambiado" : "OK";
        return `${etiqueta}${nombre ? `: ${nombre}` : ""}${cantidad} (${estado})`;
      }
      return nombre ? `${nombre}${cantidad}` : "";
    })
    .filter(Boolean)
    .join("; ");
}

export async function GET(request: NextRequest) {
  const contexto = await contextoExportacion();
  if (!contexto) {
    return NextResponse.redirect(new URL("/login", request.url));
  }
  const { supabase, slug } = contexto;

  const params = request.nextUrl.searchParams;
  const filtros = filtrosTrabajos({
    q: params.get("q") ?? undefined,
    sucursal: params.get("sucursal") ?? undefined,
    tipo: params.get("tipo") ?? undefined,
    desde: params.get("desde") ?? undefined,
    hasta: params.get("hasta") ?? undefined,
  });

  try {
    // Una consulta por página con todo embebido. Los joins con hint
    // (usuario_id, aceite_producto_id) desambiguan las dos claves que
    // services tiene hacia usuarios y hacia productos.
    const trabajos = await paginar((desde, hasta) => {
      const consulta = supabase.from("services").select(
        `id, tipo, trabajo_descripcion, fecha, created_at, kilometros, anulado,
         observaciones, prox_service_km, aceite_tipo, aceite_nombre, aceite_litros,
         alineacion,
         vehiculos!inner(patente, marca, modelo, clientes(nombre, telefono)),
         sucursales(nombre),
         usuarios!usuario_id(nombre),
         aceite:productos!aceite_producto_id(nombre, marca, unidad),
         service_items(item_tipo, detalle, cambiado, cantidad, productos(nombre, marca, unidad)),
         service_ruedas(posicion, colocada, rotada, balanceada, reparada,
                        marca, medida, dot, profundidad_mm,
                        productos(nombre, marca, unidad))`,
      );
      return aplicarFiltrosTrabajos(consulta, filtros)
        .order("fecha", { ascending: false })
        .order("created_at", { ascending: false })
        .order("id")
        .range(desde, hasta);
    });

    if (trabajos.length === 0) {
      return respuestaSinFilas(
        "No hay trabajos para exportar con esos filtros. Volvé al listado y probá con otro rango o sin filtros.",
      );
    }

    const filasTrabajos: Celda[][] = [];
    const filasProductos: Celda[][] = [];

    for (const t of trabajos) {
      const items = ordenar(t.service_items);
      const vehiculo = [t.vehiculos.marca, t.vehiculos.modelo].filter(Boolean).join(" ");

      filasTrabajos.push([
        fecha(t.fecha),
        fechaHora(t.created_at),
        texto(ETIQUETA_TIPO[t.tipo]),
        patente(t.vehiculos.patente),
        texto(vehiculo),
        texto(t.vehiculos.clientes?.nombre),
        textoLiteral(t.vehiculos.clientes?.telefono),
        numero(t.kilometros),
        texto(t.sucursales?.nombre),
        texto(t.aceite_tipo),
        texto(t.aceite_nombre ?? (t.aceite ? nombreProducto(t.aceite) : null)),
        numero(t.aceite_litros),
        texto(resumenProductos(t, items)),
        // La columna Detalle cuenta de qué se trató el trabajo. En
        // gomería, el resumen de las ruedas: la descripción libre es de
        // la mecánica y en neumáticos viene siempre en null.
        texto(
          t.tipo === "neumaticos"
            ? resumenRuedas(t.service_ruedas ?? [], t.alineacion ?? false)
            : t.trabajo_descripcion,
        ),
        texto(renglones(items)),
        texto(t.observaciones),
        numero(t.prox_service_km),
        texto(t.usuarios?.nombre),
        siNo(t.anulado),
        texto(t.id),
      ]);

      // Una fila por producto del catálogo: primero el aceite, después
      // los renglones que se cargaron con producto.
      if (t.aceite) {
        filasProductos.push([
          texto(t.id),
          fecha(t.fecha),
          patente(t.vehiculos.patente),
          texto("Aceite de motor"),
          texto(t.aceite.nombre),
          texto(t.aceite.marca),
          numero(cantidadAceite(t.aceite, t.aceite_litros)),
          texto(t.aceite.unidad),
          siNo(t.anulado),
        ]);
      }
      // Una cubierta COLOCADA que salió del catálogo es un producto que
      // se consumió y movió el stock: va en la misma hoja que el aceite y
      // los renglones. Una rueda solo medida no, porque no salió nada del
      // estante.
      for (const rueda of t.service_ruedas ?? []) {
        if (!rueda.productos || !rueda.colocada) continue;
        filasProductos.push([
          texto(t.id),
          fecha(t.fecha),
          patente(t.vehiculos.patente),
          texto(ETIQUETA_POSICION[rueda.posicion]),
          texto(rueda.productos.nombre),
          texto(rueda.productos.marca),
          numero(1),
          texto(rueda.productos.unidad),
          siNo(t.anulado),
        ]);
      }

      for (const item of items) {
        if (!item.productos) continue;
        filasProductos.push([
          texto(t.id),
          fecha(t.fecha),
          patente(t.vehiculos.patente),
          texto(item.item_tipo ? ETIQUETA_RENGLON[item.item_tipo] : "Libre"),
          texto(item.productos.nombre),
          texto(item.productos.marca),
          numero(item.cantidad),
          texto(item.productos.unidad),
          siNo(t.anulado),
        ]);
      }
    }

    const archivo = await generarXlsx([
      {
        nombre: "Trabajos",
        cabecera: [
          "Fecha",
          "Cargado el",
          "Tipo",
          "Patente",
          "Vehículo",
          "Cliente",
          "Teléfono",
          "Kilómetros",
          "Sucursal",
          "Viscosidad",
          "Aceite",
          "Litros de aceite",
          "Productos",
          "Detalle",
          "Renglones",
          "Observaciones",
          "Próximo service (km)",
          "Cargado por",
          "Anulado",
          "ID de trabajo",
        ],
        filas: filasTrabajos,
      },
      {
        nombre: "Productos por trabajo",
        cabecera: [
          "ID de trabajo",
          "Fecha",
          "Patente",
          "Renglón",
          "Producto",
          "Marca",
          "Cantidad",
          "Unidad",
          "Anulado",
        ],
        filas: filasProductos,
      },
    ]);

    return respuestaXlsx(archivo, nombreArchivo(slug, "trabajos"), trabajos.length);
  } catch {
    return respuestaError();
  }
}

"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { sesionParaEscribir, featureHabilitada } from "@/lib/auth/session";
import type { CategoriaProducto } from "@/lib/categorias";
import { esSaltoValido, SALTO_RANGO_ERROR } from "@/lib/renglones";
import { FEATURE_DE_TIPO, type TipoTrabajo } from "@/lib/trabajos";
import {
  DOT_FORMATO,
  MEDIDA_FORMATO,
  validarNeumaticos,
  type PosicionRueda,
} from "@/lib/ruedas";

export type ItemCargado = {
  /** Uno de los 11 renglones; ausente en un renglón libre de mecánica. */
  tipo?: string;
  producto_id: string | null;
  detalle: string | null;
  /** true = se cambió; false = se revisó y estaba bien ("OK"). */
  cambiado: boolean;
  /** Cuántos. Ausente = 1: el caso normal no pide ni un toque más. */
  cantidad?: number;
};

/** Una rueda del trabajo de gomería, tal como la escribe guardar_ruedas. */
export type RuedaCargada = {
  posicion: PosicionRueda;
  posicion_anterior: PosicionRueda | null;
  colocada: boolean;
  rotada: boolean;
  balanceada: boolean;
  reparada: boolean;
  /** Solo con `colocada`: una rueda medida no descuenta stock. */
  producto_id: string | null;
  marca: string | null;
  medida: string | null;
  indice_carga_vel: string | null;
  dot: string | null;
  /** Texto: la base lo castea. Así no se pierde el "7,5" del mecánico. */
  profundidad_mm: string | null;
  presion_psi: string | null;
};

export type PendienteNuevo = {
  descripcion: string;
  objetivoFecha: string | null;
  objetivoKm: number | null;
  visibleCliente: boolean;
};

export type PayloadService = {
  vehiculoId: string;
  /** 'service' si falta: los llamadores viejos no lo mandan. */
  tipo?: TipoTrabajo;
  trabajoDescripcion?: string | null;
  sucursalId: string;
  fecha: string;
  kilometros: number | null;
  aceiteTipo: string;
  aceiteProductoId: string | null;
  aceiteNombre: string | null;
  /** Litros usados: solo viaja si el producto lleva stock. */
  aceiteLitros?: number | null;
  proxServiceKm: number;
  observaciones: string | null;
  items: ItemCargado[];
  /** El toggle del cartón. El canje se registra al confirmar, no después. */
  canjearPremio?: boolean;
  /** Lo que quedó por hacer, anotado al cargar. */
  pendientes?: PendienteNuevo[];
  /** Los abiertos que se hicieron EN este trabajo. */
  resolverPendientes?: string[];
  /** Gomería: la alineación del vehículo. null en los otros dos tipos. */
  alineacion?: boolean | null;
  /** Gomería: una fila por rueda con sustancia. */
  ruedas?: RuedaCargada[];
};

export type ResultadoGuardado = { error?: string; serviceId?: string };

// El corte de conexión no pierde nada: la acción devuelve el error, el
// formulario queda montado con todo lo cargado y el mecánico reintenta.
const SIN_CONEXION =
  "Se cortó la conexión a internet. No cierres ni recargues esta pantalla: los datos que cargaste siguen acá. Cuando vuelva la señal, tocá Confirmar de nuevo.";

// Entre que se pintó el cartón y se confirmó pudo cambiar la meta del
// programa (las reglas aplican a todos al instante) o entrar otro service
// del mismo auto. El service no se guarda a medias: la transacción vuelve
// entera y el mecánico decide de nuevo.
const PREMIO_YA_NO =
  "Este vehículo ya no tiene un premio disponible: puede que haya cambiado la meta del programa. Destildá “Aplicar premio” y confirmá de nuevo.";

function traducirError(error: { code?: string; message?: string }): string {
  if (/premio_no_disponible/.test(error.message ?? "")) return PREMIO_YA_NO;
  if (/canje_solo_en_service/.test(error.message ?? "")) {
    return "Tu programa de premios cuenta solo services: el canje va en un service, no en un trabajo de mecánica.";
  }
  if (/descripcion_requerida/.test(error.message ?? "")) {
    return "Contá qué trabajo se hizo: es lo que va a ver tu cliente en su historial.";
  }
  if (/pendiente_sin_objetivo|pendiente_invalido/.test(error.message ?? "")) {
    return "A cada pendiente ponele qué es y una fecha o kilómetros.";
  }
  // Los errores nombrados de guardar_ruedas. Van antes del 23514 genérico
  // para que el mecánico lea qué campo corregir y no "algún dato".
  if (/neumaticos_sin_trabajo/.test(error.message ?? "")) {
    return "Marcá al menos una rueda o la alineación: un trabajo vacío no se guarda.";
  }
  if (/medida_invalida/.test(error.message ?? "")) return MEDIDA_FORMATO;
  if (/dot_invalido/.test(error.message ?? "")) return DOT_FORMATO;
  if (/profundidad_invalida/.test(error.message ?? "")) {
    return "La profundidad de dibujo va en milímetros, de 0 a 25.";
  }
  if (/presion_invalida/.test(error.message ?? "")) {
    return "La presión va en PSI, de 10 a 120.";
  }
  if (/rueda_sin_posicion|rotacion_con_origen/.test(error.message ?? "")) {
    return "Marcá de qué posición venía cada cubierta rotada.";
  }
  if (/fetch|network|conexión/i.test(error.message ?? "")) return SIN_CONEXION;
  if (error.code === "23514") {
    return "Algún dato quedó fuera de rango. Revisá los kilómetros y el próximo service.";
  }
  return "No se pudo guardar el service. No cierres esta pantalla y probá de nuevo.";
}

export async function guardarService(
  payload: PayloadService,
): Promise<ResultadoGuardado> {
  const sesion = await sesionParaEscribir();

  // La UI ya no ofrece el canje sin la feature; esto atiende el payload
  // armado a mano. Sin el chequeo, el rechazo lo daría la policy de canjes
  // AL FINAL del guardado — perdiendo el service entero con un error crudo.
  if (payload.canjearPremio && !featureHabilitada(sesion, "premios")) {
    return {
      error:
        "Fidelliza no está en tu plan, así que el premio no se puede canjear. Guardá el service sin el canje.",
    };
  }

  const tipo: TipoTrabajo = payload.tipo ?? "service";
  const esMecanica = tipo === "mecanica";
  const esNeumaticos = tipo === "neumaticos";

  // La feature la hace cumplir la base (policy condicional al tipo); esto
  // pone el mensaje ANTES de perder lo tipeado en un error al final.
  // Sale del mapa de lib/trabajos y no de un if por tipo: un cuarto tipo
  // sin feature declarada no compila.
  const feature = FEATURE_DE_TIPO[tipo];
  if (feature && !featureHabilitada(sesion, feature)) {
    return {
      error: esNeumaticos
        ? "El módulo de gomería no está activo en tu cuenta. Escribinos si lo querés activar."
        : "Los trabajos de mecánica no están en tu plan. Escribinos si los querés activar.",
    };
  }

  const pendientes = (payload.pendientes ?? []).filter(
    (tp) => tp.descripcion.trim().length >= 5,
  );
  const resolverPendientes = payload.resolverPendientes ?? [];
  if (
    (pendientes.length > 0 || resolverPendientes.length > 0) &&
    !featureHabilitada(sesion, "pendientes")
  ) {
    return {
      error: "Los trabajos pendientes no están en tu plan. Guardá sin pendientes, o escribinos si los querés activar.",
    };
  }
  if (pendientes.some((tp) => !tp.objetivoFecha && !tp.objetivoKm)) {
    return {
      error: "A cada pendiente ponele una fecha o kilómetros: es lo que dispara el aviso.",
    };
  }

  if (!payload.sucursalId) return { error: "Elegí la sucursal donde se hizo." };

  if (esMecanica) {
    if ((payload.trabajoDescripcion ?? "").trim().length < 5) {
      return {
        error: "Contá qué trabajo se hizo: es lo que va a ver tu cliente en su historial.",
      };
    }
  } else if (esNeumaticos) {
    const problema = validarNeumaticos(payload);
    if (problema) return { error: problema };
  } else {
    if (
      payload.kilometros == null ||
      !Number.isFinite(payload.kilometros) ||
      payload.kilometros < 0
    ) {
      return { error: "Cargá los kilómetros del odómetro." };
    }
    if (payload.aceiteTipo.trim().length < 2) {
      return { error: "Cargá la viscosidad del aceite de motor." };
    }
    if (payload.proxServiceKm <= payload.kilometros) {
      return {
        error: "El próximo service tiene que ser mayor a los kilómetros de hoy.",
      };
    }
    // El salto acotado también acá: la puerta al 100.000 de más se cierra
    // para el payload que no pasó por el cartón.
    if (!esSaltoValido(payload.proxServiceKm - payload.kilometros)) {
      return { error: SALTO_RANGO_ERROR };
    }
  }

  const supabase = await createClient();
  // El guardado va por la función de la base: trabajo y renglones se
  // escriben en una sola transacción.
  const { data, error } = await supabase.rpc("guardar_service", {
    p_vehiculo_id: payload.vehiculoId,
    p_sucursal_id: payload.sucursalId,
    p_fecha: payload.fecha,
    p_tipo: payload.tipo ?? "service",
    p_trabajo_descripcion: esMecanica
      ? (payload.trabajoDescripcion ?? "").trim()
      : undefined,
    // Los tres son argumentos SIN default en la función: viajan siempre,
    // con null explícito en mecánica (los CHECK condicionales los admiten).
    p_kilometros: payload.kilometros as number,
    p_aceite_tipo: (tipo === "service"
      ? payload.aceiteTipo
      : null) as unknown as string,
    p_prox_service_km: (tipo === "service"
      ? payload.proxServiceKm
      : null) as unknown as number,
    p_items: payload.items,
    p_aceite_producto_id:
      tipo === "service" ? (payload.aceiteProductoId ?? undefined) : undefined,
    p_aceite_nombre:
      tipo === "service" ? (payload.aceiteNombre ?? undefined) : undefined,
    p_observaciones: payload.observaciones ?? undefined,
    p_canjear_premio: payload.canjearPremio ?? false,
    p_aceite_litros:
      tipo === "service" ? (payload.aceiteLitros ?? undefined) : undefined,
    p_pendientes: pendientes.map((tp) => ({
      descripcion: tp.descripcion.trim(),
      objetivo_fecha: tp.objetivoFecha,
      objetivo_km: tp.objetivoKm,
      visible_cliente: tp.visibleCliente,
    })),
    p_resolver_pendientes: resolverPendientes,
    // Gomería. La alineación viaja SIEMPRE en neumáticos (true o false,
    // pero contestada: el CHECK la exige) y nunca en los otros dos.
    p_alineacion: esNeumaticos ? Boolean(payload.alineacion) : undefined,
    p_ruedas: esNeumaticos ? (payload.ruedas ?? []) : undefined,
  });

  if (error) return { error: traducirError(error) };

  revalidatePath(`/panel/clientes`);
  revalidatePath("/panel/fidelizacion");
  return { serviceId: data as string };
}

export type ProductoNuevo = { error?: string; id?: string; nombre?: string };

// "Producto fuera de catálogo": se carga sin salir del cartón. El catálogo
// crece usándose.
export async function crearProductoRapido(
  categoria: CategoriaProducto,
  nombre: string,
  marca: string,
): Promise<ProductoNuevo> {
  const sesion = await sesionParaEscribir();

  const limpio = nombre.trim();
  if (limpio.length < 2) {
    return { error: "El nombre del producto necesita al menos 2 caracteres." };
  }

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("productos")
    .insert({
      lubricentro_id: sesion.lubricentroId,
      categoria,
      // El alta rápida del cartón es siempre de aceite: nace midiéndose
      // en litros para que el stock (si después se activa) hable la
      // misma unidad que el service.
      unidad: categoria === "aceite" ? "litro" : "unidad",
      nombre: limpio,
      marca: marca.trim() || null,
    })
    .select("id, nombre, marca")
    .single();

  if (error) {
    if (error.code === "23505") return { error: "Ya tenés ese producto en el catálogo." };
    return { error: "No se pudo agregar el producto. Probá de nuevo." };
  }

  revalidatePath("/panel/productos");
  return {
    id: data.id,
    nombre: [data.nombre, data.marca].filter(Boolean).join(" · "),
  };
}

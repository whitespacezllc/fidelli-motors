"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { sesionParaEscribir, featureHabilitada } from "@/lib/auth/session";
import type { CategoriaProducto } from "@/lib/categorias";
import {
  esSaltoValido,
  errorDeCaja,
  normalizarAtf,
  SALTO_RANGO_ERROR,
  validarCaja,
} from "@/lib/renglones";
import { FEATURE_DE_TIPO, type TipoTrabajo } from "@/lib/trabajos";
import {
  DOT_FORMATO,
  MEDIDA_FORMATO,
  validarNeumaticos,
  type PosicionRueda,
} from "@/lib/ruedas";

export type ItemCargado = {
  /** Uno de los renglones del cartón; ausente en un renglón libre de mecánica. */
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
  /** Caja: el próximo service de caja, en su propia columna. null o
   *  ausente en los otros tres tipos. */
  proxCajaKm?: number | null;
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
  /** La mecánica adjunta del final del cartón (solo en un service): se
   *  guarda como segunda fila, con la fecha, los km y la sucursal del
   *  service, en la MISMA transacción. Sus renglones son libres. */
  mecanica?: { descripcion: string; items: ItemCargado[] } | null;
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

// Lo que se le dice al que manda un tipo que su cuenta no tiene. La UI ya
// no ofrece el segmento; esto atiende el payload armado a mano. Un mapa por
// feature: un tipo nuevo con feature no compila sin su mensaje.
const SIN_LA_FEATURE: Record<"mecanica" | "neumaticos" | "caja", string> = {
  mecanica:
    "Los trabajos de mecánica no están en tu plan. Escribinos si los querés activar.",
  neumaticos:
    "El módulo de gomería no está activo en tu cuenta. Escribinos si lo querés activar.",
  caja: "El service de caja automática no está activo en tu cuenta. Escribinos si lo querés activar.",
};

function traducirError(error: { code?: string; message?: string }): string {
  if (/premio_no_disponible/.test(error.message ?? "")) return PREMIO_YA_NO;
  if (/canje_solo_en_service/.test(error.message ?? "")) {
    return "Tu programa de premios cuenta solo services: el canje va en un service, no en un trabajo de mecánica.";
  }
  // Los tres errores nombrados de la rama de la caja.
  const deCaja = errorDeCaja(error.message ?? "");
  if (deCaja) return deCaja;
  if (/descripcion_requerida/.test(error.message ?? "")) {
    return "Contá qué trabajo se hizo: es lo que va a ver tu cliente en su historial.";
  }
  if (/mecanica_adjunta_solo_en_service/.test(error.message ?? "")) {
    return "La mecánica adjunta va al final de un service. Para cargarla sola, elegí Mecánica arriba del cartón.";
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
  // La policy de plan rechazó una de las filas (la mecánica adjunta en un
  // plan sin la feature). La transacción entera volvió: el service tampoco
  // quedó, y el mecánico tiene que saber qué destildar.
  if (error.code === "42501") {
    return "Tu plan no incluye ese tipo de trabajo, así que no se guardó nada. Volvé a editar, destildá la mecánica y confirmá de nuevo, o escribinos si la querés activar.";
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
  const esCaja = tipo === "caja";
  // El aceite viaja en un service (la viscosidad) y en una caja (el ATF).
  const llevaAceite = tipo === "service" || esCaja;

  // La feature la hace cumplir la base (policy condicional al tipo); esto
  // pone el mensaje ANTES de perder lo tipeado en un error al final.
  // Sale del mapa de lib/trabajos y no de un if por tipo: un cuarto tipo
  // sin feature declarada no compila.
  const feature = FEATURE_DE_TIPO[tipo];
  if (feature && !featureHabilitada(sesion, feature)) {
    return { error: SIN_LA_FEATURE[feature] };
  }

  // La mecánica adjunta: la misma feature que la mecánica sola, y solo al
  // final de un service. La base lo repite (policy y función); acá el
  // mensaje llega ANTES de perder lo tipeado — y como la transacción es
  // una, un rechazo tardío se llevaría también el service.
  const mecanica = payload.mecanica ?? null;
  if (mecanica) {
    if (tipo !== "service") {
      return {
        error:
          "La mecánica adjunta va al final de un service. Para cargarla sola, elegí Mecánica arriba del cartón.",
      };
    }
    if (!featureHabilitada(sesion, "mecanica")) {
      return {
        error:
          "Los trabajos de mecánica no están en tu plan. Destildá la mecánica para guardar el service, o escribinos si los querés activar.",
      };
    }
    if (mecanica.descripcion.trim().length < 5) {
      return {
        error:
          "Contá qué trabajo de mecánica se hizo: es lo que va a ver tu cliente en su historial.",
      };
    }
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
  } else if (esCaja) {
    // Kilómetros, aceite de caja y un próximo dentro del rango. La base
    // repite las tres con su error nombrado.
    const problema = validarCaja(payload);
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
    // El aceite: la viscosidad en un service, el ATF en una caja (tal cual
    // se escribió, sin espacios de más), null en los otros dos.
    p_aceite_tipo: (tipo === "service"
      ? payload.aceiteTipo
      : esCaja
        ? normalizarAtf(payload.aceiteTipo)
        : null) as unknown as string,
    // El próximo cambio de aceite es SOLO del service. Una caja lo manda
    // en null: su próximo viaja en p_prox_caja_km, más abajo.
    p_prox_service_km: (tipo === "service"
      ? payload.proxServiceKm
      : null) as unknown as number,
    p_items: payload.items,
    p_aceite_producto_id: llevaAceite
      ? (payload.aceiteProductoId ?? undefined)
      : undefined,
    p_aceite_nombre: llevaAceite
      ? (payload.aceiteNombre ?? undefined)
      : undefined,
    p_observaciones: payload.observaciones ?? undefined,
    p_canjear_premio: payload.canjearPremio ?? false,
    p_aceite_litros: llevaAceite
      ? (payload.aceiteLitros ?? undefined)
      : undefined,
    p_prox_caja_km: esCaja ? (payload.proxCajaKm ?? undefined) : undefined,
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
    // La mecánica adjunta viaja en el MISMO RPC: la base guarda las dos
    // filas en una transacción, con la fecha y los km del service.
    p_mecanica: mecanica
      ? { descripcion: mecanica.descripcion.trim(), items: mecanica.items }
      : undefined,
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
      // El alta rápida del cartón es de un aceite —de motor, o de caja
      // (`transmision`)—: nace midiéndose en litros para que el stock (si
      // después se activa) hable la misma unidad que el trabajo.
      unidad:
        categoria === "aceite" || categoria === "transmision"
          ? "litro"
          : "unidad",
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

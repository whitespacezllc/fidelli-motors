import { createClient } from "@/lib/supabase/server";
import { normalizarPatente } from "@/lib/texto";
import { hexONull } from "@/lib/cliente/color";
import { aTema, aTamanoLogo } from "@/lib/cliente/tema";
import type {
  DatosContacto,
  Lubricentro,
  SucursalPublica,
} from "@/lib/cliente/landing";

// Toda la pantalla del vehículo sale de una sola llamada a get_carton.
// La función ya respeta campos_visibles del tenant: si el lubri apagó
// "mostrar productos", los detalles vienen en null; si apagó la sucursal,
// viene null; si apagó la fidelización, el bloque entero viene null. Acá
// no se reimplementa nada de eso — se consume lo que llega.

export type ItemCarton = {
  /** Uno de los 11 renglones del cartón, o null: renglón libre de mecánica. */
  tipo: string | null;
  detalle: string | null;
  /** true = se cambió; false = se revisó y estaba bien ("OK"). */
  cambiado: boolean;
  /** Cuántos se pusieron. 1 no se muestra; 2 o más sí, como "×2". */
  cantidad: number;
};

export type TipoTrabajo = "service" | "mecanica";

export type ServiceCarton = {
  tipo: TipoTrabajo;
  /** Qué se hizo, en mecánica. null en un service: el cartón se describe solo. */
  trabajoDescripcion: string | null;
  fecha: string;
  /** En mecánica es opcional: null si el mecánico no lo anotó. */
  kilometros: number | null;
  aceiteTipo: string | null;
  aceiteNombre: string | null;
  proxServiceKm: number | null;
  sucursal: string | null;
  observaciones: string | null;
  /** Pasaron 24 horas: nadie lo puede retocar. */
  fijado: boolean;
  items: ItemCarton[];
};

export type NotaPublica = {
  fecha: string;
  contenido: string;
};

/** Un trabajo pendiente que el lubricentro decidió mostrarle al dueño. */
export type PendientePublico = {
  descripcion: string;
  objetivoFecha: string | null;
  objetivoKm: number | null;
  creado: string;
};

export type Fidelizacion = {
  disponible: boolean;
  servicesCiclo: number;
  metaServices: number;
  descripcion: string | null;
  /** Qué avanza el ciclo. El cartel nombra lo que de verdad suma. */
  alcance: "services" | "todos";
};

export type Carton = {
  lubricentro: Lubricentro;
  /** El mensaje del taller al escanear (pagina_premium, vigencia viva). */
  mensajeTaller: string | null;
  /** El WhatsApp de la sucursal del último trabajo (pagina_premium). */
  whatsappTaller: string | null;
  vehiculo: {
    patente: string;
    marca: string | null;
    modelo: string | null;
    anio: number | null;
  };
  /** Recomendaciones del taller sobre el auto. Solo llegan las visibles:
   *  get_carton filtra por nota, y la fecha es SIEMPRE la de creación. */
  notas: NotaPublica[];
  /** Solo los abiertos marcados visibles. Default oculto: mostrarlos es
   *  decisión del lubricentro, y llega vacío si no marcó ninguno. */
  pendientes: PendientePublico[];
  fidelizacion: Fidelizacion | null;
  services: ServiceCarton[];
};

export type ResultadoCarton =
  | { estado: "ok"; carton: Carton }
  | { estado: "patente_no_encontrada"; lubricentro: Lubricentro }
  | { estado: "lubricentro_no_encontrado" };

type LubricentroJson = {
  nombre?: string;
  logo_url?: string | null;
  color_primario?: string;
  color_fondo?: string | null;
  color_carton?: string | null;
  tema?: string;
  logo_tamano?: string;
  datos_contacto?: DatosContacto;
  sucursales?: SucursalPublica[];
};

type CartonJson = {
  error?: string;
  lubricentro?: LubricentroJson;
  mensaje_taller?: string | null;
  whatsapp_taller?: string | null;
  vehiculo?: {
    patente: string;
    marca: string | null;
    modelo: string | null;
    anio: number | null;
  };
  notas?: { fecha: string; contenido: string }[] | null;
  pendientes?:
    | {
        descripcion: string;
        objetivo_fecha: string | null;
        objetivo_km: number | null;
        creado: string;
      }[]
    | null;
  fidelizacion?: {
    disponible: boolean;
    services_ciclo: number;
    meta_services: number;
    descripcion: string | null;
    alcance?: string;
  } | null;
  services?: {
    tipo?: TipoTrabajo;
    trabajo_descripcion?: string | null;
    fecha: string;
    kilometros: number | null;
    aceite_tipo: string | null;
    aceite_nombre: string | null;
    prox_service_km: number | null;
    sucursal: string | null;
    observaciones: string | null;
    fijado: boolean;
    items: ItemCarton[] | null;
  }[];
};

// El bloque de marca que devuelve get_carton no trae el premio vigente —
// no le hace falta, porque en esta pantalla el programa se muestra con el
// progreso real del vehículo, no en abstracto.
function aLubricentro(json: LubricentroJson | undefined): Lubricentro {
  return {
    nombre: json?.nombre ?? "",
    logoUrl: json?.logo_url ?? null,
    colorPrimario: json?.color_primario ?? "#0A0A0A",
    colorFondo: hexONull(json?.color_fondo),
    colorCarton: hexONull(json?.color_carton),
    tema: aTema(json?.tema),
    logoTamano: aTamanoLogo(json?.logo_tamano),
    contacto: json?.datos_contacto ?? {},
    sucursales: json?.sucursales ?? [],
    premio: null,
  };
}

export async function obtenerCarton(
  slug: string,
  patente: string,
): Promise<ResultadoCarton> {
  const supabase = await createClient();
  const { data } = await supabase.rpc("get_carton", {
    p_slug: slug,
    p_patente: normalizarPatente(patente),
  });

  const json = data as CartonJson | null;

  if (!json || json.error === "lubricentro_no_encontrado") {
    return { estado: "lubricentro_no_encontrado" };
  }

  if (json.error === "patente_no_encontrada") {
    return {
      estado: "patente_no_encontrada",
      lubricentro: aLubricentro(json.lubricentro),
    };
  }

  return {
    estado: "ok",
    carton: {
      lubricentro: aLubricentro(json.lubricentro),
      mensajeTaller: json.mensaje_taller ?? null,
      whatsappTaller: json.whatsapp_taller ?? null,
      vehiculo: {
        patente: json.vehiculo?.patente ?? patente,
        marca: json.vehiculo?.marca ?? null,
        modelo: json.vehiculo?.modelo ?? null,
        anio: json.vehiculo?.anio ?? null,
      },
      notas: (json.notas ?? []).map((n) => ({
        fecha: n.fecha,
        contenido: n.contenido,
      })),
      pendientes: (json.pendientes ?? []).map((tp) => ({
        descripcion: tp.descripcion,
        objetivoFecha: tp.objetivo_fecha,
        objetivoKm: tp.objetivo_km,
        creado: tp.creado,
      })),
      fidelizacion: json.fidelizacion
        ? {
            disponible: json.fidelizacion.disponible,
            servicesCiclo: json.fidelizacion.services_ciclo,
            metaServices: json.fidelizacion.meta_services,
            descripcion: json.fidelizacion.descripcion,
            alcance:
              json.fidelizacion.alcance === "todos" ? "todos" : "services",
          }
        : null,
      // Vienen ordenados por fecha descendente desde la base: el primero es
      // el último service, que es el cartón grande de arriba.
      services: (json.services ?? []).map((s) => ({
        // Un JSON de antes de la migración no trae la clave: era un service.
        tipo: s.tipo ?? "service",
        trabajoDescripcion: s.trabajo_descripcion ?? null,
        fecha: s.fecha,
        kilometros: s.kilometros,
        aceiteTipo: s.aceite_tipo,
        aceiteNombre: s.aceite_nombre,
        proxServiceKm: s.prox_service_km,
        sucursal: s.sucursal,
        observaciones: s.observaciones,
        fijado: s.fijado,
        items: s.items ?? [],
      })),
    },
  };
}

// Un service marcado es la existencia de la fila; el detalle puede venir
// en null porque se cargó sin producto o porque el lubri apagó "mostrar
// productos". Para el cartón las dos cosas se ven igual, y está bien.
// El ?? true cubre un JSON viejo sin la clave: el sentido histórico del
// tilde era "se cambió".
export function marcadosDe(
  service: ServiceCarton,
): Record<
  string,
  { detalle: string | null; cambiado: boolean; cantidad: number }
> {
  return Object.fromEntries(
    service.items
      // Solo los 11 renglones del cartón: los libres (tipo null) son de
      // la orden de trabajo de mecánica y salen por renglonesLibres().
      .filter((i) => i.tipo !== null)
      .map((i) => [
        i.tipo as string,
        {
          detalle: i.detalle,
          cambiado: i.cambiado ?? true,
          // Un JSON viejo no trae la clave: era siempre uno.
          cantidad: Number(i.cantidad ?? 1),
        },
      ]),
  );
}

/** Los renglones libres de una mecánica: repuestos y tareas, en texto. */
export function renglonesLibres(service: ServiceCarton): string[] {
  return service.items
    .filter((i) => i.tipo === null && i.detalle)
    .map((i) => i.detalle as string);
}

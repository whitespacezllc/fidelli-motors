import { createClient } from "@/lib/supabase/server";
import { normalizarPatente } from "@/lib/texto";
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

export type ItemCarton = { tipo: string; detalle: string | null };

export type ServiceCarton = {
  fecha: string;
  kilometros: number;
  aceiteTipo: string;
  aceiteNombre: string | null;
  proxServiceKm: number;
  sucursal: string | null;
  observaciones: string | null;
  /** Pasaron 24 horas: nadie lo puede retocar. */
  fijado: boolean;
  items: ItemCarton[];
};

export type Fidelizacion = {
  disponible: boolean;
  servicesCiclo: number;
  metaServices: number;
  descripcion: string | null;
};

export type Carton = {
  lubricentro: Lubricentro;
  vehiculo: {
    patente: string;
    marca: string | null;
    modelo: string | null;
    anio: number | null;
  };
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
  datos_contacto?: DatosContacto;
  sucursales?: SucursalPublica[];
};

type CartonJson = {
  error?: string;
  lubricentro?: LubricentroJson;
  vehiculo?: {
    patente: string;
    marca: string | null;
    modelo: string | null;
    anio: number | null;
  };
  fidelizacion?: {
    disponible: boolean;
    services_ciclo: number;
    meta_services: number;
    descripcion: string | null;
  } | null;
  services?: {
    fecha: string;
    kilometros: number;
    aceite_tipo: string;
    aceite_nombre: string | null;
    prox_service_km: number;
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
      vehiculo: {
        patente: json.vehiculo?.patente ?? patente,
        marca: json.vehiculo?.marca ?? null,
        modelo: json.vehiculo?.modelo ?? null,
        anio: json.vehiculo?.anio ?? null,
      },
      fidelizacion: json.fidelizacion
        ? {
            disponible: json.fidelizacion.disponible,
            servicesCiclo: json.fidelizacion.services_ciclo,
            metaServices: json.fidelizacion.meta_services,
            descripcion: json.fidelizacion.descripcion,
          }
        : null,
      // Vienen ordenados por fecha descendente desde la base: el primero es
      // el último service, que es el cartón grande de arriba.
      services: (json.services ?? []).map((s) => ({
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
export function marcadosDe(service: ServiceCarton): Record<string, string | null> {
  return Object.fromEntries(service.items.map((i) => [i.tipo, i.detalle]));
}

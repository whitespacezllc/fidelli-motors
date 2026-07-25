import { createClient } from "@/lib/supabase/server";
import { normalizarPatente } from "@/lib/texto";

// La superficie del cliente no tiene sesión: `anon` no tiene permiso sobre
// ninguna tabla del schema y así debe seguir. Sus dos únicas puertas son
// funciones de Postgres:
//
//   get_landing(slug)           → el shell: marca y contacto. No escribe.
//   get_carton(slug, patente)   → la búsqueda. Registra el intento en
//                                 landing_busquedas, que es la captura de
//                                 leads del lubri.
//
// Por eso el shell no se pide con get_carton y una patente vacía: dejaría
// una fila basura por cada visita.

export type DatosContacto = {
  telefono?: string;
  whatsapp?: string;
  direccion?: string;
  horarios?: string;
  instagram?: string;
};

export type PremioVigente = {
  metaServices: number;
  descripcion: string;
};

export type Lubricentro = {
  nombre: string;
  logoUrl: string | null;
  colorPrimario: string;
  contacto: DatosContacto;
  premio: PremioVigente | null;
};

type LandingJson = {
  nombre?: string;
  logo_url?: string | null;
  color_primario?: string;
  datos_contacto?: DatosContacto;
  premio?: { meta_services: number; descripcion: string } | null;
};

/** El shell de la landing. `null` = el slug no existe o el lubri está inactivo. */
export async function obtenerLanding(slug: string): Promise<Lubricentro | null> {
  const supabase = await createClient();
  const { data } = await supabase.rpc("get_landing", { p_slug: slug });

  const json = data as LandingJson | null;
  if (!json?.nombre) return null;

  return {
    nombre: json.nombre,
    logoUrl: json.logo_url ?? null,
    colorPrimario: json.color_primario ?? "#0A0A0A",
    contacto: json.datos_contacto ?? {},
    premio: json.premio
      ? {
          metaServices: json.premio.meta_services,
          descripcion: json.premio.descripcion,
        }
      : null,
  };
}

/**
 * Busca la patente. Devuelve solo si existe: el cartón completo lo arma la
 * pantalla del vehículo. La llamada queda registrada en landing_busquedas
 * por la propia función — acá no hay que agregar nada.
 */
export async function existeVehiculo(slug: string, patente: string): Promise<boolean> {
  const supabase = await createClient();
  const { data } = await supabase.rpc("get_carton", {
    p_slug: slug,
    p_patente: normalizarPatente(patente),
  });

  const json = data as { error?: string } | null;
  return Boolean(json) && !json?.error;
}

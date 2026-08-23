import { createClient } from "@/lib/supabase/server";
import { normalizarPatente } from "@/lib/texto";
import { hexONull } from "@/lib/cliente/color";
import { aTema, aTamanoLogo, type TemaCliente, type TamanoLogo } from "@/lib/cliente/tema";

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

// La división de responsabilidades, decidida: datos_contacto es el
// contacto de la MARCA (el WhatsApp al que escribe el cliente, las
// redes); las direcciones, teléfonos y horarios son de cada SUCURSAL.
// Los campos viejos (telefono/direccion/horarios) pueden seguir viniendo
// en el jsonb de tenants anteriores, pero la landing ya no los muestra.
export type DatosContacto = {
  whatsapp?: string;
  instagram?: string;
  facebook?: string;
};

export type SucursalPublica = {
  nombre: string;
  direccion: string | null;
  telefono: string | null;
  horarios: string | null;
};

export type PremioVigente = {
  metaServices: number;
  descripcion: string;
};

export type Lubricentro = {
  nombre: string;
  logoUrl: string | null;
  colorPrimario: string;
  /** Fondo de la página pública. null = el blanco de siempre. */
  colorFondo: string | null;
  /** El papel del cartón. null = blanco. */
  colorCarton: string | null;
  /** Elección del lubricentro, para TODOS los que escanean. */
  tema: TemaCliente;
  logoTamano: TamanoLogo;
  contacto: DatosContacto;
  sucursales: SucursalPublica[];
  premio: PremioVigente | null;
};

type LandingJson = {
  nombre?: string;
  logo_url?: string | null;
  color_primario?: string;
  color_fondo?: string | null;
  color_carton?: string | null;
  tema?: string;
  logo_tamano?: string;
  datos_contacto?: DatosContacto;
  sucursales?: SucursalPublica[];
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
    // Saneados acá, en la única puerta: lo que sigue viaja a un style.
    colorFondo: hexONull(json.color_fondo),
    colorCarton: hexONull(json.color_carton),
    tema: aTema(json.tema),
    logoTamano: aTamanoLogo(json.logo_tamano),
    contacto: json.datos_contacto ?? {},
    sucursales: json.sucursales ?? [],
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
 *
 * BACKLOG · LÍMITE DE INTENTOS — decisión de producto pendiente.
 *
 * La patente es la única llave de esta puerta y hoy no hay tope: con un
 * script se puede recorrer el espacio de patentes de un lubricentro y
 * descubrir qué autos atiende. El dato para detectarlo ya existe —
 * landing_busquedas guarda cada intento con su lubricentro y si encontró—,
 * así que lo que falta no es instrumentación sino la definición: cuántos
 * intentos por ventana, contra qué se cuenta (IP, sesión anónima, slug), y
 * qué ve el que se pasa.
 *
 * No implementar sin esa definición. Un tope mal calibrado deja afuera al
 * cliente legítimo que escribe mal la patente dos veces desde el celular, y
 * ese es el usuario que menos tolerancia tiene a que la pantalla lo rechace.
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

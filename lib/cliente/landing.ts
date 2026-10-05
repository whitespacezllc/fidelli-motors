import { cache } from "react";
import {
  preguntarCarton,
  preguntarLanding,
  type Contestacion,
} from "@/lib/cliente/puerta";
import { hexONull } from "@/lib/cliente/color";
import { aTema, aTamanoLogo, type TemaCliente, type TamanoLogo } from "@/lib/cliente/tema";

// La superficie del cliente no tiene sesión: `anon` no tiene permiso sobre
// ninguna tabla del schema y así debe seguir. Sus dos únicas puertas son
// funciones de Postgres:
//
//   get_landing(slug)           → el shell: marca y contacto. No escribe.
//   get_carton(slug, patente)   → la búsqueda. Registra el intento en
//                                 landing_busquedas: la métrica de escaneo.
//                                 Desde 20260922120000 una consulta sin
//                                 resultado se cuenta pero NO guarda la
//                                 patente (Política de Privacidad): la
//                                 patente viaja en el request, y el mensaje
//                                 de WhatsApp de "no la encontramos" se arma
//                                 con la de la URL, no con la de la tabla.
//
// Por eso el shell no se pide con get_carton y una patente vacía: dejaría
// una fila basura por cada visita.
//
// Las dos llamadas salen de lib/cliente/puerta.ts, que distingue lo que la
// función contestó de la función que no contestó. Acá se lee la respuesta.

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
  /** Qué avanza el ciclo: el copy nombra lo que de verdad suma. */
  alcance: "services" | "todos";
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
  premio?: { meta_services: number; descripcion: string; alcance?: string } | null;
};

// «No existe» y «no contestó» son dos cosas, y se ven distinto: la primera
// es un 404, la segunda es «probá de nuevo». get_landing dice que el slug
// no existe contestando `null`; lo que no es una respuesta suya —un error,
// un corte— es `sin_respuesta`.
export type ResultadoLanding =
  | { estado: "ok"; lubricentro: Lubricentro }
  | { estado: "lubricentro_no_encontrado" }
  | { estado: "sin_respuesta" };

function leerLanding(respuesta: Contestacion): ResultadoLanding {
  if (!respuesta.contesto) return { estado: "sin_respuesta" };

  const json = respuesta.json as LandingJson | null;
  if (!json?.nombre) return { estado: "lubricentro_no_encontrado" };

  return {
    estado: "ok",
    lubricentro: {
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
            alcance: json.premio.alcance === "todos" ? "todos" : "services",
          }
        : null,
    },
  };
}

/**
 * El shell de la landing.
 *
 * Con `cache`: el título de la página y la página la piden en el mismo
 * pedido y tienen que leer LA MISMA respuesta. Sin esto eran dos llamadas,
 * y si fallaba una sola la página decía una cosa y su título otra.
 */
export const obtenerLanding = cache(
  async (slug: string): Promise<ResultadoLanding> =>
    leerLanding(await preguntarLanding(slug)),
);

/**
 * La marca del lubricentro para el estado «sin respuesta» del cartón: de
 * cortesía, un solo intento y con plazo. Si get_landing tampoco contesta,
 * esa pantalla queda neutra.
 */
export async function marcaSiContesta(slug: string): Promise<ResultadoLanding> {
  return leerLanding(await preguntarLanding(slug, { deCortesia: true }));
}

/**
 * Busca la patente. Devuelve solo si existe: el cartón completo lo arma la
 * pantalla del vehículo. La llamada queda registrada en landing_busquedas
 * por la propia función —sin la patente si no la encontró— y acá no hay que
 * agregar nada.
 *
 * Son TRES respuestas y no un booleano: si get_carton no contesta, la
 * patente no es que «no existe» —no se sabe—, y decirle al dueño del auto
 * «No encontramos esa patente» sería mentirle.
 *
 * BACKLOG · LÍMITE DE INTENTOS — decisión de producto pendiente.
 *
 * La patente es la única llave de esta puerta y hoy no hay tope: con un
 * script se puede recorrer el espacio de patentes de un lubricentro y
 * descubrir qué autos atiende. El dato para detectarlo ya existe —
 * landing_busquedas guarda cada intento con su lubricentro y si encontró
 * (la patente, solo cuando sí)—, así que lo que falta no es
 * instrumentación sino la definición: cuántos
 * intentos por ventana, contra qué se cuenta (IP, sesión anónima, slug), y
 * qué ve el que se pasa.
 *
 * No implementar sin esa definición. Un tope mal calibrado deja afuera al
 * cliente legítimo que escribe mal la patente dos veces desde el celular, y
 * ese es el usuario que menos tolerancia tiene a que la pantalla lo rechace.
 */
export async function buscarVehiculo(
  slug: string,
  patente: string,
): Promise<"encontrado" | "no_encontrado" | "sin_respuesta"> {
  const respuesta = await preguntarCarton(slug, patente);
  if (!respuesta.contesto) return "sin_respuesta";

  const json = respuesta.json as { error?: string };
  return json.error ? "no_encontrado" : "encontrado";
}

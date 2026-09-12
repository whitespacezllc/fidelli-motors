// El armado del mensaje de retención. Todo lo demás —el estado, si ya se
// contactó, el ritmo del vehículo— lo resuelve vista_proximos_service; acá
// solo se arma el link de WhatsApp.

export type EstadoContacto = "vencido" | "urgente" | "proximo";

/**
 * Por qué se contacta: los tres estados del service, el trabajo pendiente,
 * o el retorno de gomería. Es lo que se registra en `contactos` y lo que
 * gobierna el anti-spam — un contacto por motivo.
 */
export type MotivoContacto = EstadoContacto | "pendiente" | "neumaticos";

// ============================================================
// LOS MOTIVOS DEL RETORNO DE GOMERÍA
//
// Los calcula vista_proximos_neumaticos y viajan como text[]: una fila por
// vehículo con todos los motivos dados, porque un gomero que le escribe
// dos veces en la misma semana al mismo cliente es spam. Acá viven los
// nombres: cómo se ve cada motivo en la fila de "A quién llamar" y cómo se
// dice en el WhatsApp.
// ============================================================

export const MOTIVOS_NEUMATICOS = [
  "rotacion",
  "alineacion",
  "reajuste",
  "antiguedad",
  "desgaste",
] as const;

export type MotivoNeumaticos = (typeof MOTIVOS_NEUMATICOS)[number];

export function esMotivoNeumaticos(valor: unknown): valor is MotivoNeumaticos {
  return (MOTIVOS_NEUMATICOS as readonly unknown[]).includes(valor);
}

/** La línea secundaria de la fila. Los dos de recambio llevan su dato. */
export function etiquetaMotivo(
  motivo: MotivoNeumaticos,
  datos: { anioDot: number | null; mmMinimo: number | null },
): string {
  switch (motivo) {
    case "rotacion":
      return "Rotación y balanceo";
    case "alineacion":
      return "Alineación";
    case "reajuste":
      return "Reajuste de tuercas";
    case "antiguedad":
      return datos.anioDot ? `Cubiertas de ${datos.anioDot}` : "Cubiertas viejas";
    case "desgaste":
      return datos.mmMinimo != null
        ? `Dibujo al límite: ${formatearMm(datos.mmMinimo)} mm`
        : "Dibujo al límite";
  }
}

/**
 * {motivo} del WhatsApp, en castellano natural: "la rotación y el
 * balanceo", "la rotación y la alineación", "el cambio de cubiertas por
 * antigüedad". La rotación sola nombra al balanceo; acompañada, no — "la
 * rotación y el balanceo y la alineación" no lo dice nadie.
 */
export function fraseMotivos(motivos: readonly MotivoNeumaticos[]): string {
  const solaRotacion = motivos.length === 1 && motivos[0] === "rotacion";
  const frases = motivos.map((m) => {
    switch (m) {
      case "rotacion":
        return solaRotacion ? "la rotación y el balanceo" : "la rotación";
      case "alineacion":
        return "la alineación";
      case "reajuste":
        return "el reajuste de tuercas";
      case "antiguedad":
        return "el cambio de cubiertas por antigüedad";
      case "desgaste":
        return "el cambio de cubiertas por desgaste";
    }
  });
  if (frases.length <= 1) return frases[0] ?? "";
  return `${frases.slice(0, -1).join(", ")} y ${frases[frases.length - 1]}`;
}

// 2.5 → "2,5" y 3 → "3": la coma del castellano, sin ceros de relleno.
function formatearMm(mm: number): string {
  return mm.toLocaleString("es-AR", { maximumFractionDigits: 1 });
}

/**
 * Teléfono argentino a formato wa.me: solo dígitos, con el 54 adelante.
 *
 * El mecánico carga el teléfono como se lo dictan: "351 555 0442",
 * "0351 15 555-0442", "+54 9 351 5550442". WhatsApp quiere 5493515550442.
 * Las dos reglas locales que hay que deshacer son el 0 de larga distancia
 * y el 15 de celular, que no viajan en el formato internacional.
 */
// Un celular argentino sin el 15 son exactamente 10 dígitos (área + abonado).
const LARGO_NACIONAL = 10;

export function telefonoWhatsapp(telefono: string): string | null {
  let n = telefono.replace(/\D/g, "");
  if (!n) return null;

  // Ya viene internacional
  if (n.startsWith("54")) {
    const resto = n.slice(2);
    // El 9 de celular se conserva si está; si no, se agrega.
    return resto.startsWith("9") ? n : `549${resto}`;
  }

  // 0 de larga distancia: 0351… → 351…
  if (n.startsWith("0")) n = n.slice(1);

  // 15 de celular después del código de área: 351 15 555 0442 → 351 555 0442.
  // Solo si sacarlo deja los 10 dígitos canónicos: en "3515550442" (que ya
  // está bien) hay un "15" en el índice 2 que es parte del área 351 y del
  // abonado, y recortarlo rompería el número.
  if (n.length === LARGO_NACIONAL + 2) {
    // El área tiene 2, 3 o 4 dígitos; de más largo a más corto.
    for (const largo of [4, 3, 2]) {
      if (n.slice(largo, largo + 2) === "15") {
        n = n.slice(0, largo) + n.slice(largo + 2);
        break;
      }
    }
  }

  return `549${n}`;
}

export type VariablesMensaje = {
  nombre: string;
  vehiculo: string;
  patente: string;
  proximo_km: string;
};

/** Las variables del mensaje de un trabajo PENDIENTE: sin km de próximo
 *  service — eso sería mentirle al cliente sobre lo que se le avisa. */
export type VariablesPendiente = {
  nombre: string;
  vehiculo: string;
  patente: string;
  pendiente: string;
};

export const VARIABLES_MENSAJE_PENDIENTE: {
  clave: keyof VariablesPendiente;
  descripcion: string;
}[] = [
  { clave: "nombre", descripcion: "el nombre del cliente" },
  { clave: "vehiculo", descripcion: "marca y modelo del auto" },
  { clave: "patente", descripcion: "la patente" },
  { clave: "pendiente", descripcion: "qué quedó por hacer" },
];

/** Las variables del mensaje del RETORNO DE GOMERÍA: {motivo} son los
 *  motivos dados, ya armados en castellano (ver fraseMotivos). */
export type VariablesNeumaticos = {
  nombre: string;
  vehiculo: string;
  patente: string;
  motivo: string;
};

export const VARIABLES_MENSAJE_NEUMATICOS: {
  clave: keyof VariablesNeumaticos;
  descripcion: string;
}[] = [
  { clave: "nombre", descripcion: "el nombre del cliente" },
  { clave: "vehiculo", descripcion: "marca y modelo del auto" },
  { clave: "patente", descripcion: "la patente" },
  { clave: "motivo", descripcion: "qué le toca: la rotación, la alineación…" },
];

// El catálogo de variables, para el editor de mensajes: qué existe y qué
// significa cada una. Es la fuente única — el resolvedor y la advertencia
// de typos comparan contra estas cuatro claves.
export const VARIABLES_MENSAJE: {
  clave: keyof VariablesMensaje;
  descripcion: string;
}[] = [
  { clave: "nombre", descripcion: "el nombre del cliente" },
  { clave: "vehiculo", descripcion: "marca y modelo del auto" },
  { clave: "patente", descripcion: "la patente" },
  { clave: "proximo_km", descripcion: "los km del próximo service" },
];

// Los {algo} del texto que NO son ninguna de las cuatro variables. Un typo
// tipo {nombre_cliente} sale literal en el WhatsApp del cliente y queda
// pésimo: el editor lo advierte antes de guardar.
export function variablesDesconocidas(
  contenido: string,
  catalogo: { clave: string }[] = VARIABLES_MENSAJE,
): string[] {
  const conocidas = new Set<string>(catalogo.map((v) => v.clave));
  const vistas = new Set<string>();
  for (const [, clave] of contenido.matchAll(/\{(\w+)\}/g)) {
    if (!conocidas.has(clave)) vistas.add(clave);
  }
  return [...vistas];
}

// Las cuatro variables del template. Lo que no reconoce queda tal cual:
// si el lubri escribió {telefono} por error, se ve el error y lo corrige,
// que es mejor que un hueco silencioso en el mensaje.
export function resolverTemplate(
  contenido: string,
  variables: Record<string, string>,
): string {
  return contenido.replace(/\{(\w+)\}/g, (original, clave: string) =>
    clave in variables ? variables[clave] : original,
  );
}

export function linkWhatsapp(telefono: string, mensaje: string): string | null {
  const numero = telefonoWhatsapp(telefono);
  if (!numero) return null;
  return `https://wa.me/${numero}?text=${encodeURIComponent(mensaje)}`;
}

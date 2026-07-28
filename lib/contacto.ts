// El armado del mensaje de retención. Todo lo demás —el estado, si ya se
// contactó, el ritmo del vehículo— lo resuelve vista_proximos_service; acá
// solo se arma el link de WhatsApp.

export type EstadoContacto = "vencido" | "urgente" | "proximo";

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

// Las cuatro variables del template. Lo que no reconoce queda tal cual:
// si el lubri escribió {telefono} por error, se ve el error y lo corrige,
// que es mejor que un hueco silencioso en el mensaje.
export function resolverTemplate(
  contenido: string,
  variables: VariablesMensaje,
): string {
  return contenido.replace(/\{(\w+)\}/g, (original, clave: string) =>
    clave in variables ? variables[clave as keyof VariablesMensaje] : original,
  );
}

export function linkWhatsapp(telefono: string, mensaje: string): string | null {
  const numero = telefonoWhatsapp(telefono);
  if (!numero) return null;
  return `https://wa.me/${numero}?text=${encodeURIComponent(mensaje)}`;
}

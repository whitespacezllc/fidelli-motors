// ============================================================
// Las ruedas de un trabajo de gomería — el vocabulario compartido.
//
// Lo usan el formulario del panel, el papel del cartón y la tarjeta del
// cliente final. El enum vive en la base (posicion_rueda); esto es su
// espejo tipado, con los nombres que lee una persona.
//
// LAS ACCIONES SON BOOLEANOS Y SE COMBINAN. El caso más común del rubro
// es vender cuatro cubiertas, colocarlas y balancearlas en el mismo
// trabajo: cada rueda es colocada Y balanceada a la vez. Una rotación
// siempre viene con balanceo. Por eso no hay un enum de "qué se le hizo".
// ============================================================

export const POSICIONES = [
  "delantera_izquierda",
  "delantera_derecha",
  "trasera_izquierda",
  "trasera_derecha",
  "auxilio",
] as const;

export type PosicionRueda = (typeof POSICIONES)[number];

/** Las cuatro del esquema, sin el auxilio: el auto visto desde arriba. */
export const POSICIONES_AUTO = POSICIONES.filter(
  (p): p is Exclude<PosicionRueda, "auxilio"> => p !== "auxilio",
);

export const ETIQUETA_POSICION: Record<PosicionRueda, string> = {
  delantera_izquierda: "Delantera izquierda",
  delantera_derecha: "Delantera derecha",
  trasera_izquierda: "Trasera izquierda",
  trasera_derecha: "Trasera derecha",
  auxilio: "Auxilio",
};

/** La abreviatura del papel, donde no entra el nombre entero. */
export const SIGLA_POSICION: Record<PosicionRueda, string> = {
  delantera_izquierda: "DI",
  delantera_derecha: "DD",
  trasera_izquierda: "TI",
  trasera_derecha: "TD",
  auxilio: "AUX",
};

export function esPosicionRueda(valor: unknown): valor is PosicionRueda {
  return (POSICIONES as readonly unknown[]).includes(valor);
}

// ---------- Las cuatro acciones ----------

export const ACCIONES = ["colocada", "rotada", "balanceada", "reparada"] as const;

export type AccionRueda = (typeof ACCIONES)[number];

export const ETIQUETA_ACCION: Record<AccionRueda, string> = {
  colocada: "Colocada",
  rotada: "Rotada",
  balanceada: "Balanceada",
  reparada: "Reparada",
};

/** En plural, para el resumen: "4 cubiertas colocadas y balanceadas". */
const PLURAL_ACCION: Record<AccionRueda, string> = {
  colocada: "colocadas",
  rotada: "rotadas",
  balanceada: "balanceadas",
  reparada: "reparadas",
};

const SINGULAR_ACCION: Record<AccionRueda, string> = {
  colocada: "colocada",
  rotada: "rotada",
  balanceada: "balanceada",
  reparada: "reparada",
};

export type RuedaResumible = {
  colocada: boolean;
  rotada: boolean;
  balanceada: boolean;
  reparada: boolean;
};

// El formato de la medida, repetido del CHECK de service_ruedas para
// avisar antes de guardar. La fuente es la base (medida_formato).
export const MEDIDA_FORMATO =
  "La medida va como 205/55 R16, 225/45 ZR17 o 31.10 R15 (camioneta).";

export const DOT_AYUDA =
  "Cuatro dígitos del costado de la cubierta: semana y año. Ejemplo: 2325 es la semana 23 de 2025.";

export const DOT_FORMATO =
  "El DOT son cuatro dígitos y la semana va de 01 a 53. Ejemplo: 2325.";

export function esMedidaValida(medida: string): boolean {
  return /^(\d{3}\/\d{2} Z?R\d{2}|\d{2}\.\d{2} R\d{2})$/.test(
    medida.trim().toUpperCase(),
  );
}

/**
 * La medida escondida en el nombre de un producto del catálogo
 * ("205/55 R16 Bridgestone Turanza" → "205/55 R16"), para precargarla al
 * elegir la cubierta. El catálogo no tiene columna de medida: el gomero la
 * escribe en el nombre, que es donde la busca cuando vende. Si no hay
 * ninguna reconocible devuelve null y el campo queda vacío para que la
 * escriba — nunca se inventa un valor.
 */
export function medidaDeNombre(nombre: string): string | null {
  const m = nombre
    .toUpperCase()
    .match(/\d{3}\/\d{2} ?Z?R\d{2}|\d{2}\.\d{2} ?R\d{2}/);
  if (!m) return null;
  // El catálogo puede traerla sin el espacio ("205/55R16"); se guarda en
  // la forma canónica que valida el CHECK.
  return m[0].replace(/ ?(Z?R\d{2})$/, " $1");
}

export function esDotValido(dot: string): boolean {
  const limpio = dot.trim();
  if (!/^\d{4}$/.test(limpio)) return false;
  const semana = Number(limpio.slice(0, 2));
  return semana >= 1 && semana <= 53;
}

/**
 * El resumen de un trabajo de gomería, armado de los booleanos de sus
 * ruedas: "4 cubiertas colocadas y balanceadas", "rotación y balanceo",
 * "1 cubierta reparada", "alineación".
 *
 * Se agrupa por COMBINACIÓN de acciones y no por acción suelta, porque es
 * como lo diría el gomero: cuatro cubiertas que se colocaron y se
 * balancearon son un solo hecho, no dos.
 */
export function resumenRuedas(
  ruedas: RuedaResumible[],
  alineacion: boolean,
): string {
  const porCombinacion = new Map<string, number>();

  for (const rueda of ruedas) {
    const acciones = ACCIONES.filter((a) => rueda[a]);
    if (acciones.length === 0) continue; // medida sin vender: no es un hecho del trabajo
    const clave = acciones.join("+");
    porCombinacion.set(clave, (porCombinacion.get(clave) ?? 0) + 1);
  }

  const partes: string[] = [];

  for (const [clave, cantidad] of porCombinacion) {
    const acciones = clave.split("+") as AccionRueda[];

    // La rotación se nombra como lo que es —un trabajo del auto, no de
    // una cubierta suelta— cuando son las cuatro ruedas.
    if (acciones.includes("rotada") && cantidad >= 4) {
      partes.push(
        acciones.includes("balanceada") ? "rotación y balanceo" : "rotación",
      );
      continue;
    }

    const sustantivo = cantidad === 1 ? "cubierta" : "cubiertas";
    const participios = acciones.map((a) =>
      cantidad === 1 ? SINGULAR_ACCION[a] : PLURAL_ACCION[a],
    );
    partes.push(`${cantidad} ${sustantivo} ${enumerar(participios)}`);
  }

  // Las que solo se midieron, cuando no hubo ninguna acción: el trabajo
  // existe igual y el cliente tiene que ver de qué se trató.
  if (partes.length === 0) {
    const medidas = ruedas.length;
    if (medidas > 0) {
      partes.push(
        `${medidas} ${medidas === 1 ? "cubierta revisada" : "cubiertas revisadas"}`,
      );
    }
  }

  if (alineacion) partes.push("alineación");

  return partes.join(" · ");
}

/** "a", "a y b", "a, b y c" — el castellano de una lista corta. */
function enumerar(items: string[]): string {
  if (items.length <= 1) return items[0] ?? "";
  return `${items.slice(0, -1).join(", ")} y ${items[items.length - 1]}`;
}


// ============================================================
// La validación de un trabajo de gomería, antes de que viaje.
//
// Vive en lib y no en la Server Action por dos razones. La de forma: un
// archivo "use server" solo puede exportar funciones async, y esto es un
// validador puro. La de fondo: la usan el ALTA y la EDICIÓN, que escriben
// en la misma tabla con los mismos CHECK — si divergen, una de las dos
// pantallas pierde lo tipeado con un error crudo de Postgres.
//
// La garantía real siguen siendo los CHECK de service_ruedas. Esto es lo
// que pone el mensaje en castellano antes de perder el formulario.
// ============================================================

export type RuedaParaValidar = {
  posicion: PosicionRueda;
  posicion_anterior: PosicionRueda | null;
  rotada: boolean;
  medida: string | null;
  dot: string | null;
  /** Texto: así llega del formulario, con la coma del mecánico. */
  profundidad_mm: string | null;
  presion_psi: string | null;
};

export function validarNeumaticos(datos: {
  kilometros: number | null;
  alineacion?: boolean | null;
  ruedas?: RuedaParaValidar[];
}): string | null {
  if (
    datos.kilometros == null ||
    !Number.isFinite(datos.kilometros) ||
    datos.kilometros < 0
  ) {
    return "Cargá los kilómetros del odómetro.";
  }

  const ruedas = datos.ruedas ?? [];
  if (ruedas.length === 0 && !datos.alineacion) {
    return "Marcá al menos una rueda o la alineación: un trabajo vacío no se guarda.";
  }

  for (const r of ruedas) {
    if (r.rotada && !r.posicion_anterior) {
      return "Marcá de qué posición venía cada cubierta rotada.";
    }
    if (r.rotada && r.posicion_anterior === r.posicion) {
      return "Una cubierta rotada no puede venir de su propia posición.";
    }
    if (r.medida && !esMedidaValida(r.medida)) return MEDIDA_FORMATO;
    if (r.dot && !esDotValido(r.dot)) return DOT_FORMATO;
    if (r.profundidad_mm != null && r.profundidad_mm !== "") {
      const mm = Number(r.profundidad_mm);
      if (!Number.isFinite(mm) || mm < 0 || mm > 25) {
        return "La profundidad de dibujo va en milímetros, de 0 a 25.";
      }
    }
    if (r.presion_psi != null && r.presion_psi !== "") {
      const psi = Number(r.presion_psi);
      if (!Number.isFinite(psi) || psi < 10 || psi > 120) {
        return "La presión va en PSI, de 10 a 120.";
      }
    }
  }

  return null;
}

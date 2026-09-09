// El estado del onboarding tal como lo devuelve onboarding_estado() (jsonb),
// tipado. La verdad vive en la base: acá solo se lee.

export type PasoOnboarding = 1 | 2 | 3;

export type EstadoOnboarding = {
  productos: number;
  disenoConfirmadoAt: string | null;
  premioDefinido: boolean;
  premioOmitidoAt: string | null;
  /** El plan incluye premios: existe el paso 3. */
  aplicaPremio: boolean;
  /** El plan incluye la personalización: el paso 2 tiene formulario. */
  aplicaPersonalizacion: boolean;
  pasos: 2 | 3;
  /** El primero que falta; null = todos hechos. */
  pasoActual: PasoOnboarding | null;
  avanceAt: string | null;
  completadoAt: string | null;
  bienvenidaVistaAt: string | null;
};

function texto(v: unknown): string | null {
  return typeof v === "string" && v ? v : null;
}

export function leerEstadoOnboarding(crudo: unknown): EstadoOnboarding | null {
  if (!crudo || typeof crudo !== "object") return null;
  const d = crudo as Record<string, unknown>;
  const pasoActual = d.paso_actual;
  return {
    productos: Number(d.productos ?? 0),
    disenoConfirmadoAt: texto(d.diseno_confirmado_at),
    premioDefinido: d.premio_definido === true,
    premioOmitidoAt: texto(d.premio_omitido_at),
    aplicaPremio: d.aplica_premio === true,
    aplicaPersonalizacion: d.aplica_personalizacion === true,
    pasos: d.pasos === 2 ? 2 : 3,
    pasoActual:
      pasoActual === 1 || pasoActual === 2 || pasoActual === 3 ? pasoActual : null,
    avanceAt: texto(d.avance_at),
    completadoAt: texto(d.completado_at),
    bienvenidaVistaAt: texto(d.bienvenida_vista_at),
  };
}

/** ¿Está hecho el paso n? Se deriva de los datos, igual que en la base. */
export function pasoHecho(estado: EstadoOnboarding, paso: PasoOnboarding): boolean {
  switch (paso) {
    case 1:
      return estado.productos > 0;
    case 2:
      return estado.disenoConfirmadoAt !== null;
    case 3:
      return !estado.aplicaPremio || estado.premioDefinido || estado.premioOmitidoAt !== null;
  }
}

/** Los pasos hechos, para el indicador. */
export function pasosHechos(estado: EstadoOnboarding): PasoOnboarding[] {
  const todos: PasoOnboarding[] = estado.pasos === 3 ? [1, 2, 3] : [1, 2];
  return todos.filter((p) => pasoHecho(estado, p));
}

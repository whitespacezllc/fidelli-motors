// ============================================================
// Los datos de la empresa: quién emite el presupuesto.
//
// Razón social, CUIT, condición frente al IVA, domicilio, teléfono y email
// del lubricentro (`datos_empresa`, 20261004210000). Todos opcionales, y
// SOLO para el encabezado del presupuesto —el documento en pantalla y su
// PDF—: ni la página del cliente, ni los mails, ni el cartón los llevan.
//
// Es identificación del emisor, NO un comprobante. Acá no entran «Factura»,
// CAE, punto de venta, ingresos brutos ni inicio de actividades: un
// presupuesto no es un documento fiscal y no se lo disfraza de uno.
//
// Lo comparten Mi cuenta, la ficha de /fidelli, el documento y el PDF. No
// importa nada del servidor ni del navegador: se puede usar en los dos.
// Lo vigila scripts/regresion-datos-empresa.mjs.
// ============================================================
import { CUIT_FORMATO, formatearCuit, normalizarCuit } from "@/lib/cuit";
import { normalizar } from "@/lib/texto";

export type CondicionIva = "responsable_inscripto" | "monotributo" | "exento";

/** Cómo se escribe cada condición, entera, en el papel y en el select. */
export const ETIQUETA_IVA: Record<CondicionIva, string> = {
  responsable_inscripto: "Responsable Inscripto",
  monotributo: "Monotributo",
  exento: "Exento",
};

/** Las del select, en su orden. «Sin especificar» es el valor vacío. */
export const CONDICIONES_IVA: readonly { clave: CondicionIva; nombre: string }[] = [
  { clave: "responsable_inscripto", nombre: "Responsable Inscripto" },
  { clave: "monotributo", nombre: "Monotributo" },
  { clave: "exento", nombre: "Exento" },
];

export function esCondicionIva(valor: unknown): valor is CondicionIva {
  return typeof valor === "string" && Object.hasOwn(ETIQUETA_IVA, valor);
}

export type DatosEmpresa = {
  razonSocial: string | null;
  /** Once números pelados, como lo guarda la base. */
  cuit: string | null;
  condicionIva: string | null;
  domicilio: string | null;
  telefono: string | null;
  email: string | null;
};

export const EMPRESA_VACIA: DatosEmpresa = {
  razonSocial: null,
  cuit: null,
  condicionIva: null,
  domicilio: null,
  telefono: null,
  email: null,
};

/** Hasta dónde entra cada texto. Los mismos topes que los CHECK de la tabla. */
export const TOPE_EMPRESA = {
  razonSocial: 120,
  domicilio: 160,
  telefono: 40,
  email: 120,
} as const;

/** La fila de `datos_empresa` (o su ausencia) como la usa el front. */
export function empresaDesdeFila(
  fila: {
    razon_social: string | null;
    cuit: string | null;
    condicion_iva: string | null;
    domicilio: string | null;
    telefono: string | null;
    email: string | null;
  } | null | undefined,
): DatosEmpresa {
  if (!fila) return EMPRESA_VACIA;
  return {
    razonSocial: fila.razon_social,
    cuit: fila.cuit,
    condicionIva: fila.condicion_iva,
    domicilio: fila.domicilio,
    telefono: fila.telefono,
    email: fila.email,
  };
}

// «Vacío» es null: ni "", ni espacios.
function dato(valor: string | null | undefined): string | null {
  return typeof valor === "string" && valor.trim() ? valor.trim() : null;
}

// ---------- El encabezado del presupuesto ----------
// Lo que va debajo del nombre del lubricentro, de arriba hacia abajo:
//
//   EL CRUCE SERVICIOS SAS                            (la razón social)
//   CUIT 30-71234567-1 · IVA Responsable Inscripto
//   Av. San Martín 1450 · 5000 Córdoba                (el domicilio)
//   Tel. 351 555 0142 · ventas@example.com
//
// Cada línea sale SOLO si tiene dato, y cada mitad de una línea también.
// Sin ningún dato no sale ninguna, y el encabezado es el de siempre. Las
// etiquetas («CUIT», «IVA», «Tel.») van en el idioma del papel; los valores,
// tal cual se cargaron. La razón social no se repite si es el nombre del
// lubricentro (comparada sin mayúsculas ni tildes).
export function lineasDeEmpresa(
  empresa: DatosEmpresa | null | undefined,
  nombreLubricentro: string,
): string[] {
  if (!empresa) return [];
  const razonSocial = dato(empresa.razonSocial);
  const cuit = dato(empresa.cuit);
  const domicilio = dato(empresa.domicilio);
  const telefono = dato(empresa.telefono);
  const email = dato(empresa.email);
  const iva = esCondicionIva(empresa.condicionIva) ? ETIQUETA_IVA[empresa.condicionIva] : null;

  const cuitEIva = [cuit ? `CUIT ${formatearCuit(cuit)}` : null, iva ? `IVA ${iva}` : null]
    .filter(Boolean)
    .join(" · ");
  const contacto = [telefono ? `Tel. ${telefono}` : null, email].filter(Boolean).join(" · ");

  return [
    razonSocial && normalizar(razonSocial) !== normalizar(nombreLubricentro) ? razonSocial : "",
    ...[cuitEIva, domicilio ?? "", contacto],
  ].filter((linea) => linea.length > 0);
}

export function hayDatosDeEmpresa(empresa: DatosEmpresa | null | undefined): boolean {
  if (!empresa) return false;
  return [
    empresa.razonSocial,
    empresa.cuit,
    empresa.condicionIva,
    empresa.domicilio,
    empresa.telefono,
    empresa.email,
  ].some((valor) => dato(valor) !== null);
}

// ---------- El CUIT, mientras se escribe ----------
// XX-XXXXXXXX-X. Se arma siempre desde los números: lo que no es número se
// ignora y de los once no pasa, así que pegar «30.712.345/671» da lo mismo
// que tipearlo. Lo que se guarda son los once números pelados.
export function mascaraCuit(texto: string): string {
  const d = normalizarCuit(texto).slice(0, 11);
  if (d.length > 10) return `${d.slice(0, 2)}-${d.slice(2, 10)}-${d.slice(10)}`;
  if (d.length > 2) return `${d.slice(0, 2)}-${d.slice(2)}`;
  return d;
}

// ---------- El formulario, leído ----------
export type EstadoEmpresa = { error?: string; ok?: string };

/** Lo que recibe guardar_datos_empresa(): las seis claves, siempre. */
export type CamposEmpresa = {
  razon_social: string;
  cuit: string;
  condicion_iva: string;
  domicilio: string;
  telefono: string;
  email: string;
};

// Lo que el formulario manda, validado como en clientes: el CUIT es
// opcional, pero a medias no sirve —si se escribió algo, son los once
// números—, y el dígito verificador NO bloquea (el formulario ya avisó).
// El email no se valida con formato, igual que el de un cliente. La base
// vuelve a recortar y a validar: esto es para contestar con el mensaje de
// siempre, no la defensa.
export function leerCamposEmpresa(
  formData: FormData,
): { ok: true; campos: CamposEmpresa } | { ok: false; error: string } {
  const texto = (clave: string) => String(formData.get(clave) ?? "").trim();
  const cuit = normalizarCuit(texto("cuit"));
  if (cuit && cuit.length !== 11) return { ok: false, error: CUIT_FORMATO };
  const condicion = texto("condicion_iva");
  if (condicion && !esCondicionIva(condicion)) {
    return { ok: false, error: MENSAJES_EMPRESA.condicion_iva_invalida };
  }
  const campos: CamposEmpresa = {
    razon_social: texto("razon_social"),
    cuit,
    condicion_iva: condicion,
    domicilio: texto("domicilio"),
    telefono: texto("telefono"),
    email: texto("email"),
  };
  if (
    campos.razon_social.length > TOPE_EMPRESA.razonSocial ||
    campos.domicilio.length > TOPE_EMPRESA.domicilio ||
    campos.telefono.length > TOPE_EMPRESA.telefono ||
    campos.email.length > TOPE_EMPRESA.email
  ) {
    return { ok: false, error: MENSAJES_EMPRESA.dato_demasiado_largo };
  }
  return { ok: true, campos };
}

/** Los rechazos de la puerta, dichos como en el resto del panel. */
export const MENSAJES_EMPRESA: Record<string, string> = {
  cuit_invalido: CUIT_FORMATO,
  condicion_iva_invalida:
    "Esa condición frente al IVA no está en la lista. Elegí una de las tres, o dejala sin especificar.",
  dato_demasiado_largo: `Alguno de los datos es demasiado largo: la razón social y el email entran hasta ${TOPE_EMPRESA.razonSocial} caracteres, el domicilio hasta ${TOPE_EMPRESA.domicilio} y el teléfono hasta ${TOPE_EMPRESA.telefono}.`,
};

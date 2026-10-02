import { normalizar, normalizarPatente, sanitizarBusqueda } from "@/lib/texto";

// El único buscador del listado de clientes pega contra los tres campos.
// El filtro vive acá porque lo usan DOS lugares —la pantalla y el export a
// Excel— y tienen que coincidir siempre: lo que Bruno ve filtrado es
// exactamente lo que se lleva en el archivo.
export function filtroClientes(q: string | undefined) {
  const termino = sanitizarBusqueda(q ?? "");
  if (!termino) return { termino: "", filtros: null };

  // El más usado es la patente: el mecánico tiene el auto adelante.
  const texto = normalizar(termino);
  const soloDigitos = termino.replace(/\D/g, "");
  const patente = normalizarPatente(termino);

  const filtros = [`nombre_busqueda.like.*${texto}*`];
  if (soloDigitos) filtros.push(`telefono.like.*${soloDigitos}*`);
  if (patente) filtros.push(`patentes.like.*${patente}*`);

  return { termino, filtros: filtros.join(",") };
}

// ============================================================
// La supresión de un cliente final — anonimizar_cliente() (20260922130000)
//
// Cuando un cliente pide que borren sus datos, la base pisa su nombre y su
// contacto con SENTINELAS fijos y deja intactos los vehículos y los
// trabajos: los trabajos quedan, la persona desaparece. Los sentinelas los
// escribe la base; acá se repiten SOLO para reconocerlos en pantalla (la
// ficha no ofrece "Editar datos" ni "Eliminar" a un cliente ya suprimido, y
// la fila del listado no muestra "-" como teléfono).
//
// El teléfono sentinela no tiene dígitos a propósito: telefonoWhatsapp()
// devuelve null y "A quién llamar" apaga solo el botón de WhatsApp.
// ============================================================

export const CLIENTE_SUPRIMIDO = { nombre: "Cliente eliminado", telefono: "-" } as const;

export function clienteSuprimido(cliente: { nombre: string; telefono: string }): boolean {
  return (
    cliente.nombre === CLIENTE_SUPRIMIDO.nombre &&
    cliente.telefono === CLIENTE_SUPRIMIDO.telefono
  );
}

// ============================================================
// El cliente que llegó sin datos — una importación de planilla (20261002120000)
//
// La planilla de un taller casi nunca trae nombre ni teléfono: el auto entra
// igual, con un cliente `'Sin nombre'` / `'-'`, y el taller lo completa en el
// mostrador cuando el auto vuelve. Es un sentinela DISTINTO al de la
// supresión a propósito: uno dice «faltan datos», el otro «se borraron».
// Los dos comparten el teléfono `'-'`, que no tiene dígitos, así que
// telefonoWhatsapp() devuelve null y nunca se arma un wa.me/null.
//
// «Sin nombre» se muestra tal cual, pero en ink-60 y sin negrita: es un
// hueco, no un nombre. Y nunca viaja a un mensaje: «Hola Sin» no es un saludo.
// ============================================================

export const CLIENTE_SIN_DATOS = { nombre: "Sin nombre", telefono: "-" } as const;

export function sinNombre(nombre: string | null | undefined): boolean {
  return (nombre ?? "").trim() === CLIENTE_SIN_DATOS.nombre;
}

/** Sin un solo dígito: el sentinela `'-'` o el vacío de una importación vieja. */
export function sinTelefono(telefono: string | null | undefined): boolean {
  return !/\d/.test(telefono ?? "");
}

/** El nombre para un mensaje: el de pila, o nada si el cliente no tiene. */
export function nombreParaMensaje(nombre: string | null | undefined): string {
  return sinNombre(nombre) ? "" : (nombre ?? "").trim().split(" ")[0];
}

/** Lo que devuelven las dos acciones de supresión (panel y /fidelli). */
export type EstadoSupresion = { error?: string; ok?: boolean };

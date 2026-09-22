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

/** Lo que devuelven las dos acciones de supresión (panel y /fidelli). */
export type EstadoSupresion = { error?: string; ok?: boolean };

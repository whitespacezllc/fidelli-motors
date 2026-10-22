import {
  PATENTE_LARGO_MAXIMO,
  normalizar,
  normalizarPatente,
  sanitizarBusqueda,
} from "@/lib/texto";

// ============================================================
// El buscador de clientes: LA FORMA DEL TÉRMINO DICE QUÉ ES
//
// Pega contra tres campos de vista_clientes —el nombre, el teléfono y las
// patentes—, pero no contra los tres a la vez. Hasta el 21/10/2026 sí, y
// «KXM616» devolvía cuatro clientes en Brothers Oil: el dueño del auto y
// tres cuyo celular tenía «616» adentro, porque los dígitos de la patente
// se buscaban también en todos los teléfonos.
//
//   · Letras y números juntos, hasta 7 («KXM616», «ab 123», «A123BCD»):
//     una patente, entera o el pedazo que lleva tipeado. Un nombre no trae
//     números y un teléfono no trae letras. Solo patentes.
//   · Solo números («616», «3513172545»): un teléfono, o una patente que
//     arranca con números (123ABC). Las dos.
//   · Solo letras («gomez», «kxm»): un nombre, o las letras de una patente.
//     Las dos.
//   · Letras y números que no entran en una patente («lopez 3515591616»):
//     los tres campos.
//
// El teléfono se compara por sus DÍGITOS (`telefono_digitos`, desde
// 20261021120000): «351 317-2545» se encuentra escribiendo 3513172545.
//
// Vive acá porque lo usan CUATRO lugares —el listado, su export a Excel,
// la ficha del tenant en /fidelli y el «¿De quién es?» del alta— y tienen
// que coincidir siempre: lo que Bruno ve filtrado es exactamente lo que se
// lleva en el archivo, y el alta encuentra lo mismo que el listado.
// ============================================================

export type FormaDeBusqueda = "patente" | "telefono" | "nombre" | "todo";

export function filtroClientes(q: string | undefined): {
  termino: string;
  filtros: string | null;
  forma: FormaDeBusqueda | null;
} {
  const termino = sanitizarBusqueda(q ?? "");
  if (!termino) return { termino: "", filtros: null, forma: null };

  const texto = normalizar(termino);
  const soloDigitos = termino.replace(/\D/g, "");
  const patente = normalizarPatente(termino);
  const tieneLetras = /\p{L}/u.test(termino);
  const tieneNumeros = soloDigitos.length > 0;

  const porNombre = `nombre_busqueda.like.*${texto}*`;
  const porTelefono = `telefono_digitos.like.*${soloDigitos}*`;
  const porPatente = `patentes.like.*${patente}*`;

  let forma: FormaDeBusqueda;
  let filtros: string[];
  if (tieneLetras && tieneNumeros) {
    if (patente.length <= PATENTE_LARGO_MAXIMO) {
      forma = "patente";
      filtros = [porPatente];
    } else {
      forma = "todo";
      filtros = [porNombre, porTelefono, porPatente];
    }
  } else if (tieneNumeros) {
    forma = "telefono";
    filtros = [porTelefono, porPatente];
  } else {
    forma = "nombre";
    filtros = [porNombre, porPatente];
  }

  return { termino, filtros: filtros.join(","), forma };
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

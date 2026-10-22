"use server";

import { redirect } from "next/navigation";
import { buscarVehiculo } from "@/lib/cliente/landing";
import { normalizarPatente } from "@/lib/texto";

// La búsqueda de la landing. Siempre termina en un redirect, así que la
// pantalla no necesita estado de cliente: el formulario funciona igual con
// JavaScript y sin él, que es lo que corresponde en un celular viejo con 4G.
//
// El resultado no vuelve por querystring de la búsqueda sino por `?nohay=`
// para que recargar la página con el mensaje de "no encontramos" no dispare
// una segunda búsqueda: cada llamada a get_carton escribe un lead.
export async function buscarPatente(slug: string, formData: FormData) {
  const escrito = String(formData.get("patente") ?? "");
  const patente = normalizarPatente(escrito);

  // Sin patente no hay búsqueda: el input ya lo pide, pero sin JavaScript
  // el submit vacío llega igual y no tiene sentido registrarlo como lead.
  if (patente.length < 6) redirect(`/${slug}`);

  const resultado = await buscarVehiculo(slug, patente);

  if (resultado === "encontrado") redirect(`/${slug}/${patente}`);

  // get_carton no contestó: no se sabe si la patente existe. Ni «no la
  // encontramos» —sería mentira— ni mandarlo a la pantalla del auto para
  // que pregunte de nuevo: esa segunda llamada es un reintento a ciegas, y
  // si la primera llegó a registrarse deja dos búsquedas por una (ver
  // lib/cliente/puerta.ts). Vuelve a la vidriera con la patente escrita, y
  // reintentar es tocar el botón.
  if (resultado === "sin_respuesta") redirect(`/${slug}?reintentar=${patente}`);

  redirect(`/${slug}?nohay=${patente}`);
}

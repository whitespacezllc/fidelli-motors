"use server";

import { redirect } from "next/navigation";
import { existeVehiculo } from "@/lib/cliente/landing";
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

  if (await existeVehiculo(slug, patente)) redirect(`/${slug}/${patente}`);

  redirect(`/${slug}?nohay=${patente}`);
}

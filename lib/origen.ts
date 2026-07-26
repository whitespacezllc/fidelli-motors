import "server-only";

import { headers } from "next/headers";

// El origen real desde el que se está sirviendo la request.
//
// Se lee de los headers y no de una variable de entorno a propósito: el
// mismo build corre en localhost, en los previews de Vercel (un dominio
// distinto por rama) y en producción, y el enlace de la invitación tiene
// que volver al lugar del que salió. Una variable fija mandaría al owner
// invitado desde un preview a producción.
export async function origenDelSitio(): Promise<string> {
  const h = await headers();
  const host = h.get("x-forwarded-host") ?? h.get("host") ?? "localhost:3000";
  const proto = h.get("x-forwarded-proto") ?? (host.startsWith("localhost") ? "http" : "https");
  return `${proto}://${host}`;
}

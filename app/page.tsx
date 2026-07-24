import { redirect } from "next/navigation";
import { obtenerSesion } from "@/lib/auth/session";

// La raíz solo enruta: cada rol tiene su superficie.
export default async function Raiz() {
  const sesion = await obtenerSesion();
  if (!sesion) redirect("/login");
  redirect(sesion.rol === "superadmin" ? "/fidelli" : "/panel");
}

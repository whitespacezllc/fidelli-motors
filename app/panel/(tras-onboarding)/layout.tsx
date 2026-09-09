import { redirect } from "next/navigation";
import { obtenerSesion } from "@/lib/auth/session";

// ============================================================
// El gate del onboarding.
//
// Todo lo que cuelga de este grupo de rutas —Inicio, A quién llamar,
// Clientes, Trabajos, Productos, Fidelización, Presupuestos, Diseño de
// experiencia, Mensajes, Sucursales, Mi cuenta— exige que el onboarding
// esté completo. Lo que queda AFUERA del grupo, y por eso se ve siempre:
// /panel/onboarding (los pasos), /panel/ayuda (los videos) y cerrar
// sesión, que es una acción y no una ruta.
//
// Es un grupo de rutas y no un chequeo de pathname a propósito: un layout
// de Next no sabe en qué URL está, y meter la ruta en un header desde el
// proxy es un truco que el próximo que lea no tiene por qué conocer. Con
// el grupo, "qué está bloqueado" se lee en el árbol de archivos.
//
// La condición viene con la sesión (onboarding_completado_at viaja en el
// mismo select que el rol y el plan): cero consultas extra. La cuenta
// suspendida no se gatea: el onboarding es pura escritura y un suspendido
// no puede escribir — vería un callejón. Le queda el panel con su aviso.
// ============================================================
export default async function LayoutTrasOnboarding({
  children,
}: {
  children: React.ReactNode;
}) {
  const sesion = await obtenerSesion();

  if (
    sesion?.rol === "owner" &&
    sesion.lubricentroActivo &&
    !sesion.onboardingCompleto
  ) {
    redirect("/panel/onboarding");
  }

  return children;
}

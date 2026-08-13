import type { Metadata } from "next";
import { panelSuspendido } from "@/lib/auth/session";
import { IdentificarVehiculo } from "@/components/services/identificar-vehiculo";
import { BloqueoSuspension } from "@/components/panel/bloqueo-suspension";

export const metadata: Metadata = { title: "Nuevo service" };

// Momento 0 del flow: un solo input y la búsqueda decide el camino. Todo
// pasa en esta pantalla — el mecánico no navega ni elige entre caminos.
//
// La columna angosta se mantiene en todos los tamaños a propósito: es una
// sola tarea con un solo campo, y estirarla en desktop haría que la patente
// quedara perdida en el ancho. Lo que cambia es el aire alrededor.
export default async function PaginaNuevoService() {
  // Con la cuenta suspendida el botón de arriba está apagado, pero la URL
  // sigue existiendo: sin este chequeo, entrar a mano mostraría el
  // formulario completo y la carga fallaría recién al final.
  if (await panelSuspendido()) {
    return (
      <BloqueoSuspension
        titulo="No podés cargar services mientras la cuenta está suspendida"
        descripcion="Todo lo que ya cargaste sigue acá y lo podés seguir consultando. Para volver a cargar services, escribinos y reactivamos la cuenta."
      />
    );
  }

  return (
    <div className="mx-auto max-w-md lg:max-w-lg lg:pt-6">
      <IdentificarVehiculo />
    </div>
  );
}

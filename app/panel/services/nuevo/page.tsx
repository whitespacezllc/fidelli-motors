import type { Metadata } from "next";
import { IdentificarVehiculo } from "@/components/services/identificar-vehiculo";

export const metadata: Metadata = { title: "Nuevo service — Fidelli Motors" };

// Momento 0 del flow: un solo input y la búsqueda decide el camino. Todo
// pasa en esta pantalla — el mecánico no navega ni elige entre caminos.
//
// La columna angosta se mantiene en todos los tamaños a propósito: es una
// sola tarea con un solo campo, y estirarla en desktop haría que la patente
// quedara perdida en el ancho. Lo que cambia es el aire alrededor.
export default function PaginaNuevoService() {
  return (
    <div className="mx-auto max-w-md lg:max-w-lg lg:pt-6">
      <IdentificarVehiculo />
    </div>
  );
}

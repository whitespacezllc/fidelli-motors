import type { Metadata } from "next";
import { IdentificarVehiculo } from "@/components/services/identificar-vehiculo";

export const metadata: Metadata = { title: "Nuevo service — Fidelli Motors" };

// Momento 0 del flow: un solo input y la búsqueda decide el camino. Todo
// pasa en esta pantalla — el mecánico no navega ni elige entre caminos.
// El ancho angosto es a propósito: se usa en el celular del taller.
export default function PaginaNuevoService() {
  return (
    <div className="mx-auto max-w-md">
      <IdentificarVehiculo />
    </div>
  );
}

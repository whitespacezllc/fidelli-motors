import type { Metadata } from "next";
import { exigirRol } from "@/lib/auth/session";
import { cerrarSesion } from "@/lib/auth/actions";
import { Sidebar } from "@/components/panel/sidebar";
import { BarraMobile } from "@/components/panel/barra-mobile";
import { AvisoSuspension } from "@/components/panel/aviso-suspension";

// La autorización vive acá, no en el proxy: /panel es del rol owner.
// Superficie privada: nunca en el índice. El robots.txt además la
// excluye del rastreo; esto cubre el caso de una URL llegada por link.
export const metadata: Metadata = {
  robots: { index: false, follow: false },
};

export default async function LayoutPanel({
  children,
}: {
  children: React.ReactNode;
}) {
  const sesion = await exigirRol("owner");
  const suspendido = !sesion.lubricentroActivo;

  return (
    <div className="min-h-dvh bg-surface/40">
      <Sidebar
        lubricentroNombre={sesion.lubricentroNombre ?? "Tu lubricentro"}
        suspendido={suspendido}
      />
      <div className="lg:pl-64">
        {/* pb extra en mobile para que la barra inferior no tape contenido */}
        <main className="mx-auto max-w-6xl px-4 py-6 pb-28 lg:px-8 lg:py-8">
          {/* Arriba de todo y en todas las pantallas: la suspensión no es de
              una sección, es de la cuenta. */}
          {suspendido && <AvisoSuspension />}
          {children}
        </main>
      </div>
      <BarraMobile cerrarSesion={cerrarSesion} suspendido={suspendido} />
    </div>
  );
}

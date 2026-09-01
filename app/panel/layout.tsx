import type { Metadata } from "next";
import { createClient } from "@/lib/supabase/server";
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
  // Resueltas por la base y viajaron con la sesión: acá solo se reparten.
  const features = sesion.capacidades?.features ?? {};

  // El badge de "A quién llamar": los contactos que están esperando, como
  // los no leídos de una casilla. Se calcula en la MISMA función que
  // definen las vistas de la pantalla (contactos_por_hacer, R12), así el
  // número del círculo y las filas sin tildar no pueden divergir. El
  // layout es dinámico —cada navegación lo re-renderiza— y la acción de
  // registrar contacto ya revalida /panel, así que el número baja solo
  // apenas contactás, sin polling ni estado en el cliente.
  const supabase = await createClient();
  const { data: porLlamar } = await supabase.rpc("contactos_por_hacer");

  return (
    <div className="min-h-dvh bg-surface/40">
      <Sidebar
        lubricentroNombre={sesion.lubricentroNombre ?? "Tu lubricentro"}
        suspendido={suspendido}
        features={features}
        porLlamar={porLlamar ?? 0}
      />
      {/* En print se apagan el corrimiento del sidebar y los paddings: la
          hoja la definen los márgenes de @page, y el pb-28 de la barra
          llegaba a regalar una página en blanco al final. */}
      <div className="lg:pl-64 print:pl-0">
        {/* pb extra en mobile para que la barra inferior no tape contenido */}
        <main className="mx-auto max-w-6xl px-4 py-6 pb-28 lg:px-8 lg:py-8 print:p-0">
          {/* Arriba de todo y en todas las pantallas: la suspensión no es de
              una sección, es de la cuenta. */}
          {suspendido && <AvisoSuspension />}
          {children}
        </main>
      </div>
      <BarraMobile
        cerrarSesion={cerrarSesion}
        suspendido={suspendido}
        features={features}
        porLlamar={porLlamar ?? 0}
      />
    </div>
  );
}

import { exigirRol } from "@/lib/auth/session";
import { cerrarSesion } from "@/lib/auth/actions";
import { Sidebar } from "@/components/panel/sidebar";
import { BarraMobile } from "@/components/panel/barra-mobile";

// La autorización vive acá, no en el proxy: /panel es del rol owner.
export default async function LayoutPanel({
  children,
}: {
  children: React.ReactNode;
}) {
  const sesion = await exigirRol("owner");

  return (
    <div className="min-h-dvh bg-surface/40">
      <Sidebar lubricentroNombre={sesion.lubricentroNombre ?? "Tu lubricentro"} />
      <div className="lg:pl-64">
        {/* pb extra en mobile para que la barra inferior no tape contenido */}
        <main className="mx-auto max-w-6xl px-4 py-6 pb-28 lg:px-8 lg:py-8">
          {children}
        </main>
      </div>
      <BarraMobile cerrarSesion={cerrarSesion} />
    </div>
  );
}

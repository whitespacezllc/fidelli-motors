import type { Metadata } from "next";
import { createClient } from "@/lib/supabase/server";
import { exigirRol, featureHabilitada } from "@/lib/auth/session";
import { cerrarSesion } from "@/lib/auth/actions";
import { Sidebar } from "@/components/panel/sidebar";
import { BarraMobile } from "@/components/panel/barra-mobile";
import { AvisoSuspension } from "@/components/panel/aviso-suspension";
import { BarraCobranza } from "@/components/panel/barra-cobranza";
import { ModalTerminos } from "@/components/panel/modal-terminos";
import { metadataPwa } from "@/lib/pwa";

// La autorización vive acá, no en el proxy: /panel es del rol owner.
// Superficie privada: nunca en el índice. El robots.txt además la
// excluye del rastreo; esto cubre el caso de una URL llegada por link.
export const metadata: Metadata = {
  robots: { index: false, follow: false },
  // Su propio manifest: agregar el panel a la pantalla de inicio tiene que
  // abrir el panel, no la landing comercial. Reemplaza al del layout raíz.
  ...metadataPwa("/panel/manifest.webmanifest", "Mi panel"),
};

export default async function LayoutPanel({
  children,
}: {
  children: React.ReactNode;
}) {
  const sesion = await exigirRol("owner");
  // El ÚNICO predicado de suspensión, calculado en obtenerSesion(): cubre
  // el interruptor manual (`activo = false`) y el reloj de cobranza a la
  // vez. Los cinco gates leen este mismo campo — que discrepen es lo que
  // arma un ping-pong de redirects o apaga el AvisoSuspension dejando al
  // suspendido con un panel de apariencia normal que lo rebota sin
  // decirle por qué.
  const suspendido = sesion.suspendido;
  // Resueltas por la base y viajaron con la sesión: acá solo se reparten.
  const features = sesion.capacidades?.features ?? {};

  // El onboarding (migración 20260909180000). Mientras no terminó, la
  // navegación va con candado salvo Ayuda, y el grupo (tras-onboarding)
  // redirige a los pasos. Un suspendido no se bloquea: no podría escribir.
  // Recién completado y con la bienvenida sin ver, los ítems nacen con
  // candado y se desbloquean uno por uno cuando el telón se levanta.
  const bloqueado = !suspendido && !sesion.onboardingCompleto;
  // ⚠ Y NO MIENTRAS ESTÉ LA CUARTA PANTALLA. `bienvenidaPendiente` se
  // prende en el MISMO render en que se escribe `onboarding_completado_at`,
  // así que sin el `&& !pagoPendiente` la coreografía de desbloqueo corre
  // detrás de la pantalla de pago, sin telón: cuando el dueño finalmente
  // entra, el telón se levanta sobre un sidebar que ya se desbloqueó solo.
  // Todo el CSS está escrito sobre la premisa de que telón y nav se pintan
  // en el mismo render (globals.css · "La bienvenida").
  const desbloqueando = sesion.bienvenidaPendiente && !sesion.pagoPendiente;
  const pasosOnboarding = featureHabilitada(sesion, "premios") ? 3 : 2;

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
        bloqueado={bloqueado}
        pasosOnboarding={pasosOnboarding}
        desbloqueando={desbloqueando}
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
          {/* La ventana de gracia, en TODAS las pantallas del panel: ya
              venció y todavía se puede trabajar. `por_vencer` NO va acá —
              es la barra discreta de Inicio— y `suspendido` ya lo cuenta
              AvisoSuspension. El componente decide solo: con cualquier
              otro estado devuelve null.

              Es un Server Component sin consultas propias: el estado viajó
              con la sesión. La carga de un service no hace ni un fetch más
              que antes. */}
          {sesion.cobranza && (
            <BarraCobranza cobranza={sesion.cobranza} taller={sesion.lubricentroNombre} />
          )}
          {children}
        </main>
      </div>
      <BarraMobile
        cerrarSesion={cerrarSesion}
        suspendido={suspendido}
        features={features}
        porLlamar={porLlamar ?? 0}
        bloqueado={bloqueado}
        pasosOnboarding={pasosOnboarding}
        desbloqueando={desbloqueando}
      />
      {/* EL GATE DE TÉRMINOS, encima de todo el panel y antes que el del
          onboarding: el tenant que no aceptó la versión vigente de los
          documentos legales (VERSION_LEGAL) ve el modal bloqueante en
          cualquier ruta —el onboarding y Ayuda incluidos— hasta que acepta.
          El dato viajó con la sesión (campo calculado aceptaciones_legales);
          el superadmin y el demo nunca lo ven. Al aceptar, la acción
          revalida este layout y el modal deja de existir. */}
      {sesion.terminosPendientes && (
        <ModalTerminos taller={sesion.lubricentroNombre ?? "tu lubricentro"} />
      )}
    </div>
  );
}

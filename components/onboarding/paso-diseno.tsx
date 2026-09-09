"use client";

import { useCallback, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Boton } from "@/components/ui/boton";
import { SubirLogo } from "@/components/experiencia/subir-logo";
import {
  FormExperiencia,
  type ConfigExperiencia,
} from "@/components/experiencia/form-experiencia";
import { PreviewVivo } from "@/components/experiencia/preview-vivo";
import type { BorradorExperiencia } from "@/components/experiencia/pantalla-experiencia";
import { MarcoPaso } from "@/components/onboarding/marco-paso";
import { confirmarDiseno } from "@/app/panel/onboarding/actions";
import type { VideoAyuda } from "@/lib/ayuda/videos";

// Paso 2 · "Así van a ver tu historial tus clientes".
//
// Con la personalización en el plan es el formulario de Diseño de
// experiencia tal cual, con la vista previa viva al lado (los mismos
// componentes de la página pública pintados con el borrador). Guardar
// —aunque no se haya cambiado nada— confirma el paso.
//
// En Basic no hay formulario: solo la vista previa y "Así está bien".
export function PasoDiseno({
  config,
  slug,
  logoUrl,
  nombre,
  personalizable,
  video,
}: {
  config: ConfigExperiencia;
  slug: string;
  logoUrl: string | null;
  nombre: string;
  personalizable: boolean;
  video: VideoAyuda | null;
}) {
  const router = useRouter();
  const [pendiente, iniciar] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const avisado = useRef(false);

  const [borrador, setBorrador] = useState<BorradorExperiencia>({
    color: config.colorPrimario,
    colorFondo: config.colorFondo,
    colorCarton: config.colorCarton,
    tema: config.tema,
    logoTamano: config.logoTamano,
  });
  const cambiar = (parcial: Partial<BorradorExperiencia>) =>
    setBorrador((b) => ({ ...b, ...parcial }));

  const confirmar = useCallback(() => {
    if (avisado.current) return;
    avisado.current = true;
    iniciar(async () => {
      const r = await confirmarDiseno();
      if (r.error) {
        avisado.current = false;
        setError(r.error);
        return;
      }
      router.replace(r.completado ? "/panel" : "/panel/onboarding");
      router.refresh();
    });
  }, [router, iniciar]);

  // El logo se sube con su propio formulario: al cambiar, la página se
  // vuelve a pedir para que la vista previa lo muestre.
  const alCambiarLogo = useCallback(() => router.refresh(), [router]);

  const preview = (
    <div>
      <p className="mb-3 text-center font-brand text-body font-bold text-ink">
        Así lo ve tu cliente
      </p>
      <PreviewVivo borrador={borrador} logoUrl={logoUrl} nombre={nombre} slug={slug} />
    </div>
  );

  const aviso = error && (
    <p role="alert" className="rounded-md bg-overdue-soft px-3.5 py-3 text-ui text-overdue">
      {error}
    </p>
  );

  if (!personalizable) {
    return (
      <MarcoPaso
        titulo="Así van a ver tu historial tus clientes"
        bajada="Esto es lo que aparece cuando escanean la calco."
        video={video}
        lateral={preview}
      >
        <div className="flex flex-col gap-4">
          {aviso}
          <Boton type="button" tam="lg" onClick={confirmar} disabled={pendiente} className="sm:self-start">
            {pendiente ? "Guardando…" : "Así está bien"}
          </Boton>
        </div>
      </MarcoPaso>
    );
  }

  return (
    <MarcoPaso
      titulo="Así van a ver tu historial tus clientes"
      bajada="Esto es lo que aparece cuando escanean la calco. Revisá el logo y elegí el color."
      video={video}
      lateral={preview}
    >
      <div className="flex flex-col gap-6">
        {aviso}
        <section className="surface-card p-5">
          <h3 className="mb-3 font-brand text-body font-bold text-ink">Tu logo</h3>
          <SubirLogo logoUrl={logoUrl} nombre={nombre} alCambiar={alCambiarLogo} />
          {!logoUrl && (
            <p className="mt-3 text-ui text-ink-60">
              Si no lo tenés a mano, seguí igual: lo subís después desde Diseño
              de experiencia.
            </p>
          )}
        </section>

        <section className="surface-card p-5">
          <FormExperiencia
            config={config}
            borrador={borrador}
            alCambiar={cambiar}
            etiquetaGuardar="Guardar diseño"
            alGuardar={confirmar}
          />
        </section>
      </div>
    </MarcoPaso>
  );
}

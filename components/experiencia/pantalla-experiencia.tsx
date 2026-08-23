"use client";

import { useState } from "react";
import { SubirLogo } from "@/components/experiencia/subir-logo";
import {
  FormExperiencia,
  type ConfigExperiencia,
} from "@/components/experiencia/form-experiencia";
import { PreviewVivo } from "@/components/experiencia/preview-vivo";
import { SeccionMensaje } from "@/components/experiencia/seccion-mensaje";
import { SeccionCalcos } from "@/components/experiencia/seccion-calcos";
import type { TamanoLogo, TemaCliente } from "@/lib/cliente/tema";

// El borrador: lo que el formulario tiene AHORA, guardado o no. Vive acá
// arriba porque lo comparten el formulario (edita) y la vista previa
// (muestra). Es la diferencia entre "guardá y mirá" y "mirá y guardá".
export type BorradorExperiencia = {
  color: string;
  colorFondo: string;
  colorCarton: string;
  tema: TemaCliente;
  logoTamano: TamanoLogo;
};

export function PantallaExperiencia({
  config,
  slug,
  logoUrl,
  nombre,
  esUltra,
}: {
  config: ConfigExperiencia;
  slug: string;
  logoUrl: string | null;
  nombre: string;
  esUltra: boolean;
}) {
  const [borrador, setBorrador] = useState<BorradorExperiencia>({
    color: config.colorPrimario,
    colorFondo: config.colorFondo,
    colorCarton: config.colorCarton,
    tema: config.tema,
    logoTamano: config.logoTamano,
  });

  const cambiar = (parcial: Partial<BorradorExperiencia>) =>
    setBorrador((b) => ({ ...b, ...parcial }));

  return (
    <div className="grid gap-8 lg:grid-cols-[minmax(0,1fr)_auto] lg:items-start">
      <div className="flex max-w-2xl flex-col gap-6">
        <section className="surface-card p-5">
          <h2 className="mb-3 font-brand text-body font-bold text-ink">
            Tu logo
          </h2>
          <SubirLogo logoUrl={logoUrl} nombre={nombre} />
        </section>

        <section className="surface-card p-5">
          <FormExperiencia
            config={config}
            borrador={borrador}
            alCambiar={cambiar}
          />
        </section>

        {esUltra && (
          <section className="surface-card p-5">
            <SeccionMensaje config={config} borrador={borrador} nombre={nombre} />
          </section>
        )}

        <SeccionCalcos />
      </div>

      <aside className="justify-self-center lg:sticky lg:top-6">
        <h2 className="mb-3 text-center font-brand text-body font-bold text-ink">
          Así lo ve tu cliente
        </h2>
        <PreviewVivo
          borrador={borrador}
          logoUrl={logoUrl}
          nombre={nombre}
          slug={slug}
        />
      </aside>
    </div>
  );
}

"use client";

import { MarcaLubricentro } from "@/components/cliente/marca-lubricentro";
import { GuiaPasos } from "@/components/cliente/guia-pasos";
import { BuscadorPatente } from "@/components/cliente/buscador-patente";
import { paletaTenant, variablesTenant, hexONull } from "@/lib/cliente/color";
import { estilosTema } from "@/lib/cliente/tema";
import type { Lubricentro } from "@/lib/cliente/landing";
import type { BorradorExperiencia } from "@/components/experiencia/pantalla-experiencia";

// La vista previa EN VIVO: lo que el dueño está por guardar, antes de
// guardarlo. No es una maqueta que se le parece — son LOS MISMOS
// componentes de la página pública (marca, guía, buscador), renderizados
// con el borrador del formulario dentro del marco de celular. Cambiás el
// color o el modo y se ve al instante; guardás y la página real queda
// exactamente así.
//
// El ancho real de la página es 375 (celular chico) y el marco es de
// 296: se renderiza a 375 y se escala, para que las clases responsive
// se comporten como en el teléfono de verdad.
const ANCHO_REAL = 375;
const ANCHO_MARCO = 284;
const ALTO_MARCO = 592;
const ESCALA = ANCHO_MARCO / ANCHO_REAL;

export function PreviewVivo({
  borrador,
  logoUrl,
  nombre,
  slug,
}: {
  borrador: BorradorExperiencia;
  logoUrl: string | null;
  nombre: string;
  slug: string;
}) {
  // El mismo objeto que arma lib/cliente/landing, pero desde el borrador.
  const lubricentro: Lubricentro = {
    nombre,
    logoUrl,
    colorPrimario: borrador.color,
    colorFondo: hexONull(borrador.colorFondo),
    colorCarton: hexONull(borrador.colorCarton),
    tema: borrador.tema,
    logoTamano: borrador.logoTamano,
    contacto: {},
    sucursales: [],
    premio: null,
  };
  const paleta = paletaTenant(borrador.color, borrador.tema);

  return (
    <div className="flex flex-col items-center gap-2.5">
      <div className="h-[604px] w-[296px] overflow-hidden rounded-[36px] border-[6px] border-ink bg-base shadow-lg">
        <div
          aria-hidden
          className="pointer-events-none origin-top-left select-none"
          style={{
            width: ANCHO_REAL,
            height: ALTO_MARCO / ESCALA,
            transform: `scale(${ESCALA})`,
          }}
        >
          {/* La misma estructura del shell público de /[slug]. */}
          <div
            style={{
              ...variablesTenant(paleta),
              ...estilosTema(borrador.tema, hexONull(borrador.colorFondo)),
            }}
            className="flex min-h-full flex-col"
          >
            <main className="flex flex-1 flex-col px-5 py-8">
              <div className="m-auto w-full max-w-md">
                <MarcaLubricentro lubricentro={lubricentro} />
                <div className="mt-8">
                  <GuiaPasos />
                </div>
                <div className="mt-8">
                  <BuscadorPatente slug={slug} />
                </div>
              </div>
            </main>
          </div>
        </div>
      </div>
      <p className="max-w-[296px] text-center text-label text-ink-60">
        La vista previa muestra lo que tenés en el formulario, guardado o no.
      </p>
      <a
        href={`/${slug}`}
        target="_blank"
        rel="noopener noreferrer"
        className="min-h-11 content-center text-ui font-semibold text-ink-60 underline underline-offset-4 hover:text-ink"
      >
        Abrir la página real
      </a>
    </div>
  );
}

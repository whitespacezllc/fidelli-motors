import { Revelar } from "@/components/landing/revelar";
import { SimuladorCarga } from "@/components/landing/simulador-carga";

// 03 · La prueba de que es fácil — matar la duda número uno.
//
// Se responde HACIENDO, no mostrando: el visitante carga un service él
// mismo, en una simulación construida con los componentes reales del
// formulario (components/services/campos-carton.tsx). Reemplazó al video:
// un video se mira, esto se prueba — y no depende de material que todavía
// no existe.
//
// La sección en sí es Server Component; lo interactivo vive adentro de
// SimuladorCarga, que además renderiza su estado final completo desde el
// servidor: sin JavaScript se ve la carga terminada, nunca un hueco.

// Los tres pasos ya no viven acá: son components/landing/pasos-guia.tsx,
// que los renderiza SimuladorCarga junto al teléfono. Se marcan solos a
// medida que el visitante avanza, y para eso tienen que leer el estado de
// la simulación — desde esta sección no lo verían sin duplicarlo.

export function Prueba() {
  return (
    <section
      id="como-funciona"
      aria-labelledby="como-funciona-titulo"
      className="aire-seccion scroll-mt-14 bg-base md:scroll-mt-16"
    >
      <div className="contenedor">
        <Revelar className="mx-auto max-w-2xl text-center">
          <h2
            id="como-funciona-titulo"
            className="text-balance text-h3 font-bold sm:text-h2"
          >
            Cargá un service ahora mismo. Sin instalar nada.
          </h2>
          <p className="mt-(--espacio-h2-lead) text-pretty text-body text-ink-60 sm:text-lead">
            Es el flujo real del producto, tal cual lo ve tu mecánico.
          </p>
        </Revelar>

        {/* La simulación trae su propia grilla: teléfono y guía de pasos
            van juntos porque comparten estado. */}
        <Revelar className="mt-(--espacio-lead)">
          <SimuladorCarga />
        </Revelar>
      </div>
    </section>
  );
}

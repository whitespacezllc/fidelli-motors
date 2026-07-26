import { BotonAviso } from "@/components/fidelli/boton-aviso";
import {
  ESTILO_ATENCION,
  esAtencion,
  linkDeAviso,
  motivoDe,
  textoDeVencimiento,
} from "@/lib/fidelli/atencion";
import type { Periodo } from "@/lib/fidelli/plan";
import type { PlanCompleto } from "@/components/fidelli/tipos";

const BADGE =
  "inline-flex items-center rounded-sm border px-2 py-0.5 text-label font-semibold tracking-[0.04em] uppercase whitespace-nowrap";

// La columna del ritual: qué le pasa a este lubricentro y el tap para
// resolverlo. Todo lo que decide qué se muestra viene calculado de la base
// —el estado, el motivo, el check, el teléfono—; acá solo se arma el link.
export function CeldaAtencion({
  lubricentroId,
  nombre,
  atencion,
  contactado,
  telefono,
  ownerNombre,
  vencimiento,
  periodo,
  descuentoPct,
  plan,
}: {
  lubricentroId: string;
  nombre: string;
  atencion: string | null;
  contactado: boolean;
  telefono: string | null;
  ownerNombre: string | null;
  vencimiento: string | null;
  periodo: Periodo | null;
  descuentoPct: number;
  plan: PlanCompleto | null;
}) {
  if (!esAtencion(atencion) || !vencimiento || !periodo) {
    return <span className="text-ink-40">—</span>;
  }

  const estilo = ESTILO_ATENCION[atencion];

  return (
    <span className="inline-flex flex-col items-start gap-1.5">
      <span className="flex flex-col items-start gap-0.5">
        <span className={`${BADGE} ${estilo.clase}`}>{estilo.etiqueta}</span>
        <span className="text-label text-ink-60">
          {textoDeVencimiento(vencimiento)}
        </span>
      </span>

      <BotonAviso
        lubricentroId={lubricentroId}
        motivo={motivoDe(atencion)}
        contactado={contactado}
        nombre={nombre}
        link={linkDeAviso({
          atencion,
          telefono,
          ownerNombre,
          lubricentroNombre: nombre,
          vencimiento,
          periodo,
          descuentoPct,
          plan,
        })}
      />
    </span>
  );
}

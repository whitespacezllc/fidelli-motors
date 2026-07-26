import { ESTILO_SALUD, saludDe } from "@/lib/fidelli/salud";
import type { EstadoSuscripcion } from "@/lib/fidelli/plan";

// Un punto de color y su etiqueta, como en el hi-fi. El punto solo no
// alcanza —cuatro tonos de ámbar no se distinguen de un vistazo, y hay
// gente que no los distingue nunca— así que la palabra va siempre.
export function CeldaSalud({
  estado,
  vencimiento,
  ultimoService,
}: {
  estado: EstadoSuscripcion | null;
  vencimiento: string | null;
  ultimoService: string | null;
}) {
  const salud = saludDe({ estado, vencimiento, ultimoService });

  if (!salud) return <span className="text-ink-40">—</span>;

  const estilo = ESTILO_SALUD[salud];

  return (
    <span className={`flex items-center gap-2 whitespace-nowrap ${estilo.texto}`}>
      <span aria-hidden className={`inline-block size-2 shrink-0 rounded-full ${estilo.punto}`} />
      {estilo.etiqueta}
    </span>
  );
}

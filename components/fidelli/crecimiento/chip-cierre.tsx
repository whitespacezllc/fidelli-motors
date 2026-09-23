import { Chip } from "@/components/fidelli/chip";
import { cierreDelMes } from "@/lib/fidelli/crecimiento";

// El chip que acompaña al mes que no cerró, el mismo en las tres tablas por
// mes de /fidelli/crecimiento para que el criterio sea uno solo
// (`cierreDelMes` en lib/fidelli/crecimiento.ts): «en curso» para el mes
// actual, «sin cierre» para un mes pasado sin la foto del último día. El
// `title` dice qué es el número que se ve en esa fila, porque cambia por
// tabla: el dato de la última foto en los movimientos, la suma hasta la
// última foto en los trabajos, el conteo hasta hoy en el churn.
export function ChipCierre({
  mes,
  enCurso,
  mesEnCurso,
  dato,
}: {
  /** «2026-09-01» o «2026-09». */
  mes: string;
  /** La bandera `en_curso` de la función; false si la función no la trae. */
  enCurso: boolean;
  /** «2026-09»: el mes en curso en hora argentina. */
  mesEnCurso: string;
  /** Qué muestra la fila mientras el mes no cierra: «el dato del último día con foto». */
  dato: string;
}) {
  const cierre = cierreDelMes(mes, enCurso, mesEnCurso);
  if (cierre === null) return null;
  const porque =
    cierre === "en curso"
      ? `El mes no terminó: es ${dato}.`
      : `Falta la foto del último día del mes: es ${dato}.`;
  return <Chip title={porque}>{cierre}</Chip>;
}

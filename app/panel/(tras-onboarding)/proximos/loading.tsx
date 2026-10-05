import { Cabecera, Esqueleto, Marco, Pieza } from "@/components/ui/esqueleto";
import { EncabezadoProximos } from "@/components/proximos/fila-proximo";
import {
  GRILLA_PROXIMOS,
  LUGAR_ACCION,
  LUGAR_CHECK,
  LUGAR_CONTACTADO,
} from "@/components/proximos/grilla";

// «A quién llamar», en gris: la cabecera con su título real y el lugar de
// «Recuperados este mes»; los tres contadores de estado y los dos filtros;
// y la tabla con su encabezado de columnas REAL (es fijo) y filas grises
// armadas con la MISMA plantilla de grilla que FilaProximo
// (components/proximos/grilla.ts), así cada barra cae debajo de su título.
// En el celular cada fila es una tarjeta, igual que la real.
function FilaGrisProximo() {
  return (
    <li
      className={`border-b border-line px-4 py-4 last:border-b-0 sm:px-5 lg:items-start lg:py-3 lg:*:min-w-0 xl:items-center ${GRILLA_PROXIMOS}`}
    >
      <div className="min-w-0">
        <Pieza className="h-4.5 w-36 max-w-full lg:h-4" />
        <Pieza className="mt-1.5 h-3 w-24" />
      </div>
      <div className="mt-2.5 flex flex-wrap items-center gap-2 lg:mt-0 lg:block">
        <Pieza className="h-5 w-20" />
        <Pieza className="h-3 w-24 lg:mt-1.5" />
      </div>
      <div className="mt-2 hidden lg:mt-0 lg:block">
        <Pieza className="h-3.5 w-32 max-w-full" />
        <Pieza className="mt-1.5 h-3 w-20" />
      </div>
      <div className="hidden lg:block">
        <Pieza className="h-3.5 w-16" />
      </div>
      <div className="mt-2.5 lg:mt-0">
        <Pieza className="h-4 w-48 max-w-full lg:h-3.5 lg:w-24" />
      </div>
      <div className="mt-2.5 lg:mt-0 lg:self-center">
        <Pieza className="h-6 w-20 rounded-sm lg:h-5" />
      </div>
      <div className={`mt-2.5 lg:mt-0 lg:self-center xl:contents ${LUGAR_CONTACTADO}`}>
        <Pieza className={`h-5 w-28 lg:h-6 lg:w-6 ${LUGAR_CHECK}`} />
      </div>
      <div className="mt-3.5 lg:col-span-2 lg:mt-0 lg:self-center lg:justify-self-end xl:contents">
        <Pieza className={`h-11 w-28 rounded-md xl:w-11 ${LUGAR_ACCION}`} />
      </div>
    </li>
  );
}

export default function CargandoProximos() {
  return (
    <Esqueleto>
      <Cabecera titulo="A quién llamar" derecha={["h-[43px] w-56 rounded-md"]} />
      <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-2">
          <Pieza className="h-[43px] w-[101px] rounded-md" />
          <Pieza className="h-[43px] w-[102px] rounded-md" />
          <Pieza className="h-[43px] w-[104px] rounded-md" />
        </div>
        <div className="flex flex-wrap items-center gap-2.5">
          <Pieza className="h-11 w-44 rounded-md" />
          <Pieza className="h-11 w-40 rounded-md" />
        </div>
      </div>
      <Marco className="surface-card">
        <EncabezadoProximos />
        <ul>
          {Array.from({ length: 8 }, (_, i) => (
            <FilaGrisProximo key={i} />
          ))}
        </ul>
      </Marco>
    </Esqueleto>
  );
}

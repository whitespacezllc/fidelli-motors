"use client";

import { ANIO_MAX, ANIO_MIN } from "@/lib/fidelli/crecimiento";

// ============================================================
// El <input type="month"> de la barra de rango, con una sola cosa de
// cliente: al elegir un mes del selector nativo, el formulario se envía
// solo (requestSubmit, que respeta la validación y el method="get"). Es
// navegación de servidor: la URL cambia y la page vuelve a leer; acá no
// hay fetch ni estado.
//
// POR QUÉ SE FILTRA EL AÑO: Chrome dispara `change` en cuanto el valor es
// válido, y mientras alguien tipea «2026» a mano el campo pasa por
// 0002-08, 0020-08 y 0202-08, los tres válidos. Sin el filtro, la pantalla
// navegaría tres veces a rangos que no existen antes de terminar de
// escribir. Con un año de la misma ventana que acepta el servidor
// (ANIO_MIN–ANIO_MAX, lib/fidelli/crecimiento.ts) se navega; si no, el
// botón «Ver» (o Enter) envía cuando la persona termina.
//
// `min` y `max` son los del servidor también (el 2000 y el mes en curso):
// el selector nativo apaga lo que no se puede pedir, y un mes tipeado
// fuera de rango no navega —el navegador lo dice en el campo— en vez de
// ir al servidor para que este lo acote en silencio.
// ============================================================
export function CampoMes({
  id,
  name,
  defaultValue,
  min,
  max,
  className,
}: {
  id: string;
  name: "desde" | "hasta";
  defaultValue: string;
  /** «2000-01». */
  min: string;
  /** El mes en curso, «2026-09». */
  max: string;
  className: string;
}) {
  return (
    <input
      id={id}
      type="month"
      name={name}
      defaultValue={defaultValue}
      min={min}
      max={max}
      className={className}
      onChange={(e) => {
        const valor = e.currentTarget.value;
        const anio = Number(valor.slice(0, 4));
        if (
          /^\d{4}-\d{2}$/.test(valor) &&
          anio >= ANIO_MIN &&
          anio <= ANIO_MAX
        ) {
          e.currentTarget.form?.requestSubmit();
        }
      }}
    />
  );
}

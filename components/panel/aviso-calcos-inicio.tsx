"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { IconoCerrar } from "@/components/iconos";
import { clasesBoton } from "@/components/ui/boton";

// ============================================================
// EL AVISO DE CALCOS — SOLO en Inicio, y nunca arriba de uno de cobranza
//
// «Te quedan unas 80 calcos, para unas 3 semanas. Producir y enviar tarda
// hasta 2. Pedí ahora.» No es un modal y no bloquea nada: es una barra con
// la misma forma que la de `por_vencer` (AvisoCobranzaInicio), en gris.
//
// CUÁNDO se muestra no se decide acá: la página se lo pregunta a la base
// (`aviso_calcos()`: menos de 4 semanas de cobertura —o 20 calcos o menos—
// y sin un pedido abierto) y no lo monta si hay un aviso de cobranza en
// pantalla (`puedeAvisarDeCalcos()` en lib/stock-calcos.ts). Acá solo llega
// la frase, ya armada: la misma que va en los mails.
//
// SE CIERRA CON LA X Y VUELVE A LOS 7 DÍAS. El «ya lo vi» vive en
// localStorage, por dispositivo, igual que el modal de gracia. Por eso es
// un componente de cliente y por eso arranca escondido: el servidor no
// puede saber si ESTE dispositivo lo cerró, y dibujarlo para sacarlo
// después sería un parpadeo en cada visita del que ya lo cerró.
//
// SI NO HAY STORAGE NO SE MUESTRA, como el modal: sin dónde recordar la X,
// volvería en cada navegación.
//
// El botón es secundario a propósito: el único primario del Inicio es
// «+ Nuevo trabajo».
// ============================================================

const CLAVE = "fm_calcos_aviso";
const DIAS_CERRADO = 7;

export function AvisoCalcosInicio({ frase }: { frase: string }) {
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    try {
      const cerrado = window.localStorage.getItem(CLAVE);
      const hace = cerrado ? Date.now() - new Date(cerrado).getTime() : Number.NaN;
      // Una fecha que no se entiende cuenta como «nunca lo cerró».
      if (Number.isFinite(hace) && hace < DIAS_CERRADO * 86_400_000) return;
    } catch {
      return;
    }
    // Depende de localStorage, que no existe en el servidor: calcularlo
    // durante el render daría una mezcla de hidratación. Corre una vez por
    // montaje.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setVisible(true);
  }, []);

  if (!visible) return null;

  function cerrar() {
    try {
      window.localStorage.setItem(CLAVE, new Date().toISOString());
    } catch {
      // Sin storage no hubiera llegado a mostrarse.
    }
    setVisible(false);
  }

  return (
    <div
      role="status"
      data-aviso-calcos
      className="mb-6 flex flex-wrap items-center justify-between gap-x-3 gap-y-2 rounded-lg border border-line bg-surface py-2 pr-1.5 pl-4 sm:pl-5 print:hidden"
    >
      <p className="min-w-0 flex-1 basis-56 py-1 text-ui text-ink tabular-nums">{frase}</p>

      <div className="flex shrink-0 items-center gap-0.5">
        <Link href="/panel/cuenta/calcos" className={clasesBoton("secundario")}>
          Pedir calcos
        </Link>
        <button
          type="button"
          onClick={cerrar}
          aria-label="Cerrar el aviso"
          className="flex size-11 items-center justify-center rounded-md text-ink-60 hover:bg-base hover:text-ink"
        >
          <IconoCerrar aria-hidden className="size-5" />
        </button>
      </div>
    </div>
  );
}

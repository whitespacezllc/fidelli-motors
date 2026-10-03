"use client";

import { useActionState, useState } from "react";
import { Dialog, DialogTrigger, DialogContenido } from "@/components/ui/dialog";
import { Boton, clasesBoton } from "@/components/ui/boton";
import {
  CLASE_AYUDA,
  CLASE_CAMPO,
  CLASE_ERROR,
  CLASE_LABEL,
} from "@/components/fidelli/estilos";
import { marcarCalcosPropias, type EstadoAccionCalcos } from "@/app/fidelli/calcos/actions";

const INICIAL: EstadoAccionCalcos = {};

// ============================================================
// El switch «Imprime sus calcos por su cuenta», con su nota.
//
// Es un diálogo y no un interruptor suelto porque el cambio pide una nota
// (quién lo pidió, con qué gráfica imprime) y deja un evento en el
// historial del lubricentro. Sirve para las dos direcciones.
// ============================================================
export function DialogCalcosPropias({
  lubricentroId,
  nombre,
  propias,
}: {
  lubricentroId: string;
  nombre: string;
  /** El estado de HOY: el diálogo ofrece el contrario. */
  propias: boolean;
}) {
  const [abierto, setAbierto] = useState(false);
  const [estado, guardar, guardando] = useActionState(
    async (previo: EstadoAccionCalcos, formData: FormData) => {
      const r = await marcarCalcosPropias(previo, formData);
      if (r.ok) setAbierto(false);
      return r;
    },
    INICIAL,
  );

  return (
    <Dialog open={abierto} onOpenChange={setAbierto}>
      <DialogTrigger className={`${clasesBoton("secundario")} whitespace-nowrap`}>
        {propias ? "Vuelve a pedirnos los calcos" : "Imprime por su cuenta"}
      </DialogTrigger>

      <DialogContenido
        titulo={
          propias
            ? `${nombre} vuelve a pedirnos los calcos`
            : `${nombre} imprime sus calcos por su cuenta`
        }
      >
        <form action={guardar} className="flex flex-col gap-4">
          {estado.error && (
            <p role="alert" className={CLASE_ERROR}>
              {estado.error}
            </p>
          )}

          <input type="hidden" name="lubricentro_id" value={lubricentroId} />
          <input type="hidden" name="propias" value={propias ? "no" : "si"} />

          <p className="text-ui text-ink-60">
            {propias
              ? "Vuelve la estimación de cuántas le quedan, el aviso en su Inicio, los mails y la lista de los que se quedan sin calcos. Deja de ver la descarga del archivo de impresión."
              : "Deja de recibir el aviso y los mails de que se queda sin calcos, sale de la lista de los que hay que llamar, y en su Mi cuenta → Calcos aparece «Descargar el archivo de impresión». Puede seguir pidiendo calcos cuando quiera."}
          </p>

          <div>
            <label htmlFor="calcos-propias-nota" className={CLASE_LABEL}>
              Nota
            </label>
            <textarea
              id="calcos-propias-nota"
              name="nota"
              rows={2}
              required
              minLength={10}
              placeholder={
                propias
                  ? "Cerró la gráfica con la que imprimía"
                  : "Imprime con una gráfica de su zona, lo pidió por WhatsApp"
              }
              className={`${CLASE_CAMPO} h-auto py-3`}
            />
            <p className={CLASE_AYUDA}>Queda en el historial del lubricentro, con tu nombre y la fecha.</p>
          </div>

          <Boton type="submit" tam="lg" disabled={guardando} className="mt-1 w-full">
            {guardando ? "Guardando…" : "Guardar"}
          </Boton>
        </form>
      </DialogContenido>
    </Dialog>
  );
}

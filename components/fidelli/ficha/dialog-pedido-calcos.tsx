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
import {
  registrarPedidoCalcos,
  type EstadoPedidoCalcos,
} from "@/app/fidelli/[id]/actions";

const INICIAL: EstadoPedidoCalcos = {};

// ============================================================
// Registrar una entrega de calcos (bloque MÉTRICAS 3): fecha, cantidad,
// incluidas o cobradas, el monto si se cobraron, y una nota. La fila queda
// para siempre (append-only) y el contador del tenant pasa a ser la suma.
// ============================================================
export function DialogPedidoCalcos({
  lubricentroId,
  nombre,
  hoy,
}: {
  lubricentroId: string;
  nombre: string;
  hoy: string;
}) {
  const [abierto, setAbierto] = useState(false);
  const [cobradas, setCobradas] = useState(false);

  const [estado, registrar, registrando] = useActionState(
    async (previo: EstadoPedidoCalcos, formData: FormData) => {
      const r = await registrarPedidoCalcos(previo, formData);
      if (r.ok) {
        setAbierto(false);
        setCobradas(false);
      }
      return r;
    },
    INICIAL,
  );

  return (
    <Dialog open={abierto} onOpenChange={setAbierto}>
      <DialogTrigger className={clasesBoton("secundario", "md")}>Registrar pedido</DialogTrigger>

      <DialogContenido titulo={`Calcos para ${nombre}`}>
        <form action={registrar} className="flex flex-col gap-4">
          {estado.error && (
            <p role="alert" className={CLASE_ERROR}>
              {estado.error}
            </p>
          )}

          <input type="hidden" name="lubricentro_id" value={lubricentroId} />

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label htmlFor="calcos-fecha" className={CLASE_LABEL}>
                Fecha
              </label>
              <input
                id="calcos-fecha"
                name="fecha"
                type="date"
                required
                defaultValue={hoy}
                max={hoy}
                className={`${CLASE_CAMPO} tabular-nums`}
              />
            </div>
            <div>
              <label htmlFor="calcos-cantidad" className={CLASE_LABEL}>
                Cantidad
              </label>
              <input
                id="calcos-cantidad"
                name="cantidad"
                type="number"
                inputMode="numeric"
                min={1}
                step={1}
                required
                className={`${CLASE_CAMPO} tabular-nums`}
              />
            </div>
          </div>

          <fieldset>
            <legend className={CLASE_LABEL}>Cómo se entregaron</legend>
            <div className="flex flex-wrap gap-4">
              <label className="inline-flex min-h-11 cursor-pointer items-center gap-2 text-ui text-ink">
                <input
                  type="radio"
                  name="incluidas"
                  value="si"
                  checked={!cobradas}
                  onChange={() => setCobradas(false)}
                  className="size-4 accent-ink"
                />
                Incluidas en el plan
              </label>
              <label className="inline-flex min-h-11 cursor-pointer items-center gap-2 text-ui text-ink">
                <input
                  type="radio"
                  name="incluidas"
                  value="no"
                  checked={cobradas}
                  onChange={() => setCobradas(true)}
                  className="size-4 accent-ink"
                />
                Cobradas
              </label>
            </div>
          </fieldset>

          {cobradas && (
            <div>
              <label htmlFor="calcos-monto" className={CLASE_LABEL}>
                Monto cobrado
              </label>
              <div className="flex items-center gap-2">
                <span className="text-ui text-ink-60">ARS</span>
                <input
                  id="calcos-monto"
                  name="monto"
                  type="number"
                  inputMode="decimal"
                  min={0}
                  step="0.01"
                  required={cobradas}
                  className={`${CLASE_CAMPO} tabular-nums`}
                />
              </div>
            </div>
          )}

          <div>
            <label htmlFor="calcos-nota" className={CLASE_LABEL}>
              Nota <span className="text-ink-40 normal-case">(opcional)</span>
            </label>
            <input
              id="calcos-nota"
              name="nota"
              placeholder="Segunda tanda, para la sucursal norte…"
              className={CLASE_CAMPO}
            />
            <p className={CLASE_AYUDA}>
              El pedido queda registrado para siempre y el contador del lubricentro pasa a ser
              la suma de sus pedidos.
            </p>
          </div>

          <Boton type="submit" tam="lg" disabled={registrando} className="mt-1 w-full">
            {registrando ? "Registrando…" : "Registrar pedido"}
          </Boton>
        </form>
      </DialogContenido>
    </Dialog>
  );
}

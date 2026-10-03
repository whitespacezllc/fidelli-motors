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
import { crearEncargoIncluido, type EstadoAccionCalcos } from "@/app/fidelli/calcos/actions";

const INICIAL: EstadoAccionCalcos = {};

// ============================================================
// «+ Pedido incluido en el plan»: los calcos del alta. Sin pago, nace
// pagado y sigue el mismo camino que un pedido comprado. Es lo que se carga
// en cada alta.
//
// La cantidad llega con lo que incluye el plan (200, 400 en Ultra) y la
// dirección con la de la sucursal: son sugerencias de un alta, se pueden
// pisar. La dirección solo viaja si la entrega es con envío.
// ============================================================
export function DialogPedidoIncluido({
  lubricentroId,
  nombre,
  cantidadSugerida,
  direccionSugerida,
  telefonoSugerido,
}: {
  lubricentroId: string;
  nombre: string;
  cantidadSugerida: number;
  direccionSugerida: string | null;
  telefonoSugerido: string | null;
}) {
  const [abierto, setAbierto] = useState(false);
  const [conEnvio, setConEnvio] = useState(false);

  const [estado, crear, creando] = useActionState(
    async (previo: EstadoAccionCalcos, formData: FormData) => {
      const r = await crearEncargoIncluido(previo, formData);
      if (r.ok) {
        setAbierto(false);
        setConEnvio(false);
      }
      return r;
    },
    INICIAL,
  );

  return (
    <Dialog open={abierto} onOpenChange={setAbierto}>
      <DialogTrigger className={`${clasesBoton("secundario", "md")} shrink-0 whitespace-nowrap`}>
        + Pedido incluido en el plan
      </DialogTrigger>

      <DialogContenido titulo={`Calcos incluidos para ${nombre}`}>
        <form action={crear} className="flex flex-col gap-4">
          {estado.error && (
            <p role="alert" className={CLASE_ERROR}>
              {estado.error}
            </p>
          )}

          <input type="hidden" name="lubricentro_id" value={lubricentroId} />

          <div>
            <label htmlFor="incluido-cantidad" className={CLASE_LABEL}>
              Cantidad de calcos
            </label>
            <input
              id="incluido-cantidad"
              name="cantidad"
              type="number"
              inputMode="numeric"
              min={1}
              step={1}
              required
              defaultValue={cantidadSugerida}
              className={`${CLASE_CAMPO} tabular-nums`}
            />
            <p className={CLASE_AYUDA}>
              Los del alta: sin pago. El pedido arranca en pagado y sigue el mismo camino que uno
              comprado.
            </p>
          </div>

          <fieldset>
            <legend className={CLASE_LABEL}>Entrega</legend>
            <div className="flex flex-col">
              <label className="inline-flex min-h-11 cursor-pointer items-center gap-2 text-ui text-ink">
                <input
                  type="radio"
                  name="entrega"
                  value="retiro"
                  checked={!conEnvio}
                  onChange={() => setConEnvio(false)}
                  className="size-4 accent-ink"
                />
                Retiro o entrega en Córdoba Capital
              </label>
              <label className="inline-flex min-h-11 cursor-pointer items-center gap-2 text-ui text-ink">
                <input
                  type="radio"
                  name="entrega"
                  value="envio"
                  checked={conEnvio}
                  onChange={() => setConEnvio(true)}
                  className="size-4 accent-ink"
                />
                Envío a domicilio
              </label>
            </div>
          </fieldset>

          {conEnvio && (
            <>
              <div>
                <label htmlFor="incluido-direccion" className={CLASE_LABEL}>
                  Dirección
                </label>
                <input
                  id="incluido-direccion"
                  name="direccion"
                  required
                  defaultValue={direccionSugerida ?? ""}
                  className={CLASE_CAMPO}
                />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label htmlFor="incluido-localidad" className={CLASE_LABEL}>
                    Localidad
                  </label>
                  <input id="incluido-localidad" name="localidad" className={CLASE_CAMPO} />
                </div>
                <div>
                  <label htmlFor="incluido-cp" className={CLASE_LABEL}>
                    Código postal
                  </label>
                  <input
                    id="incluido-cp"
                    name="codigo_postal"
                    inputMode="numeric"
                    className={`${CLASE_CAMPO} tabular-nums`}
                  />
                </div>
              </div>
              <div>
                <label htmlFor="incluido-telefono" className={CLASE_LABEL}>
                  Teléfono de contacto
                </label>
                <input
                  id="incluido-telefono"
                  name="telefono"
                  type="tel"
                  required
                  defaultValue={telefonoSugerido ?? ""}
                  className={`${CLASE_CAMPO} tabular-nums`}
                />
              </div>
            </>
          )}

          <div>
            <label htmlFor="incluido-nota" className={CLASE_LABEL}>
              Nota <span className="text-ink-40 normal-case">(opcional)</span>
            </label>
            <input
              id="incluido-nota"
              name="nota"
              placeholder="Los del alta, segunda tanda para la sucursal norte…"
              className={CLASE_CAMPO}
            />
          </div>

          <Boton type="submit" tam="lg" disabled={creando} className="mt-1 w-full">
            Cargar pedido
          </Boton>
        </form>
      </DialogContenido>
    </Dialog>
  );
}

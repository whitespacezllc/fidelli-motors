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
import { avanzarEncargo, type EstadoAccionCalcos } from "@/app/fidelli/calcos/actions";
import { numeroDeEncargo, type EntregaCalcos, type EstadoEncargo } from "@/lib/calcos";

const INICIAL: EstadoAccionCalcos = {};

export type EncargoParaAccion = {
  id: string;
  lubricentro_id: string;
  numero: number;
  estado: EstadoEncargo;
  entrega: EntregaCalcos;
  incluido: boolean;
  cantidad: number;
};

// ============================================================
// Lo que se puede hacer con un pedido según su estado. Es la misma columna
// en la ficha y en la cola.
//
// Qué botón se ofrece lo decide esta pantalla; si la transición vale lo
// decide la base (avanzar_encargo_calcos). Un paso de rutina va con un
// toque; lo que pide un dato —el seguimiento, la nota— o no tiene vuelta
// —entregado escribe en el libro— abre un dialog.
// ============================================================
export function AccionesEncargo({ encargo }: { encargo: EncargoParaAccion }) {
  const numero = numeroDeEncargo(encargo.numero);

  switch (encargo.estado) {
    case "pendiente_pago":
      return (
        <div className="flex gap-2">
          <DialogAvanzar
            encargo={encargo}
            a="pagado"
            etiqueta="Marcar pagado a mano"
            titulo={`Marcar pagado el pedido ${numero}`}
            confirmar="Marcar pagado"
            campos="nota"
            ayudaNota="Es la excepción, no la regla: lo normal es que lo acredite el pago. Contá cómo pagó."
            placeholderNota="Transfirió al CBU viejo, mandó el comprobante por WhatsApp…"
          />
          <DialogAvanzar
            encargo={encargo}
            a="cancelado"
            etiqueta="Cancelar"
            titulo={`Cancelar el pedido ${numero}`}
            confirmar="Cancelar el pedido"
            campos="nota-opcional"
            ayudaNota="El lubricentro puede volver a pedir cuando quiera."
            placeholderNota="Se arrepintió, pidió otro pack…"
          />
        </div>
      );

    case "pagado":
      return (
        <div className="flex gap-2">
          <BotonAvanzar encargo={encargo} a="en_produccion" etiqueta="En producción" />
          {/* Cancelar un pagado es solo para los incluidos: uno cargado por
              error no tiene plata que devolver. */}
          {encargo.incluido && (
            <DialogAvanzar
              encargo={encargo}
              a="cancelado"
              etiqueta="Cancelar"
              titulo={`Cancelar el pedido ${numero}`}
              confirmar="Cancelar el pedido"
              campos="nota"
              ayudaNota="Para un pedido incluido que se cargó por error. No pasa por el libro ni mueve el contador."
              placeholderNota="Se cargó dos veces, era de otro lubricentro…"
            />
          )}
        </div>
      );

    case "en_produccion":
      return encargo.entrega === "envio" ? (
        <DialogAvanzar
          encargo={encargo}
          a="enviado"
          etiqueta="Enviado"
          titulo={`Despachar el pedido ${numero}`}
          confirmar="Marcar enviado"
          campos="envio"
        />
      ) : (
        <BotonAvanzar encargo={encargo} a="listo_retiro" etiqueta="Listo para retirar" />
      );

    case "enviado":
    case "listo_retiro":
      return (
        <DialogAvanzar
          encargo={encargo}
          a="entregado"
          etiqueta="Entregado"
          titulo={`Entregar el pedido ${numero}`}
          confirmar="Marcar entregado"
          campos="ninguno"
          aviso={`Registra la entrega de ${new Intl.NumberFormat("es-AR").format(encargo.cantidad)} calcos en el libro y suma al contador del lubricentro. El libro no se edita: un pedido entregado queda así.`}
        />
      );

    case "entregado":
      return <span className="text-label text-ink-40">En el libro</span>;

    default:
      return <span className="text-ink-40">—</span>;
  }
}

function Ocultos({ encargo, a }: { encargo: EncargoParaAccion; a: EstadoEncargo }) {
  return (
    <>
      <input type="hidden" name="encargo_id" value={encargo.id} />
      <input type="hidden" name="lubricentro_id" value={encargo.lubricentro_id} />
      <input type="hidden" name="estado" value={a} />
    </>
  );
}

// El paso de rutina: un toque. El botón se deshabilita apenas se toca y no
// cambia de texto, así que no salta el ancho de la columna.
function BotonAvanzar({
  encargo,
  a,
  etiqueta,
}: {
  encargo: EncargoParaAccion;
  a: EstadoEncargo;
  etiqueta: string;
}) {
  const [estado, accion, enviando] = useActionState(avanzarEncargo, INICIAL);

  return (
    <form action={accion} className="flex flex-col items-start gap-1">
      <Ocultos encargo={encargo} a={a} />
      <Boton type="submit" variante="secundario" disabled={enviando} className="whitespace-nowrap">
        {etiqueta}
      </Boton>
      {estado.error && (
        <p role="alert" className="max-w-60 text-label text-overdue">
          {estado.error}
        </p>
      )}
    </form>
  );
}

function DialogAvanzar({
  encargo,
  a,
  etiqueta,
  titulo,
  confirmar,
  campos,
  aviso,
  ayudaNota,
  placeholderNota,
}: {
  encargo: EncargoParaAccion;
  a: EstadoEncargo;
  etiqueta: string;
  titulo: string;
  confirmar: string;
  campos: "ninguno" | "nota" | "nota-opcional" | "envio";
  aviso?: string;
  ayudaNota?: string;
  placeholderNota?: string;
}) {
  const [abierto, setAbierto] = useState(false);
  const [estado, accion, enviando] = useActionState(
    async (previo: EstadoAccionCalcos, formData: FormData) => {
      const r = await avanzarEncargo(previo, formData);
      if (r.ok) setAbierto(false);
      return r;
    },
    INICIAL,
  );
  // El id del pedido en los campos: en la cola hay un dialog por fila.
  const idCampo = (nombre: string) => `calcos-${nombre}-${a}-${encargo.id}`;

  return (
    <Dialog open={abierto} onOpenChange={setAbierto}>
      <DialogTrigger className={`${clasesBoton("secundario", "md")} whitespace-nowrap`}>
        {etiqueta}
      </DialogTrigger>

      <DialogContenido titulo={titulo}>
        <form action={accion} className="flex flex-col gap-4">
          {estado.error && (
            <p role="alert" className={CLASE_ERROR}>
              {estado.error}
            </p>
          )}

          <Ocultos encargo={encargo} a={a} />

          {aviso && <p className="text-ui text-ink-60">{aviso}</p>}

          {campos === "envio" && (
            <>
              <div>
                <label htmlFor={idCampo("transportista")} className={CLASE_LABEL}>
                  Transportista
                </label>
                <input
                  id={idCampo("transportista")}
                  name="transportista"
                  required
                  defaultValue="Andreani"
                  className={CLASE_CAMPO}
                />
              </div>
              <div>
                <label htmlFor={idCampo("seguimiento")} className={CLASE_LABEL}>
                  Número de seguimiento
                </label>
                <input
                  id={idCampo("seguimiento")}
                  name="seguimiento"
                  required
                  inputMode="numeric"
                  autoComplete="off"
                  className={`${CLASE_CAMPO} tabular-nums`}
                />
                <p className={CLASE_AYUDA}>
                  Es el que va a ver el lubricentro para seguir el paquete.
                </p>
              </div>
            </>
          )}

          {(campos === "nota" || campos === "nota-opcional") && (
            <div>
              <label htmlFor={idCampo("nota")} className={CLASE_LABEL}>
                Nota{" "}
                {campos === "nota-opcional" && (
                  <span className="text-ink-40 normal-case">(opcional)</span>
                )}
              </label>
              <textarea
                id={idCampo("nota")}
                name="nota"
                rows={3}
                required={campos === "nota"}
                minLength={campos === "nota" ? 10 : undefined}
                placeholder={placeholderNota}
                className={`${CLASE_CAMPO} h-auto py-3`}
              />
              {ayudaNota && <p className={CLASE_AYUDA}>{ayudaNota}</p>}
            </div>
          )}

          <Boton type="submit" tam="lg" disabled={enviando} className="mt-1 w-full">
            {confirmar}
          </Boton>
        </form>
      </DialogContenido>
    </Dialog>
  );
}

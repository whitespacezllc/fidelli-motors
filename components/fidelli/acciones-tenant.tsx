"use client";

import { useActionState, useState } from "react";
import { Dialog, DialogTrigger, DialogContenido } from "@/components/ui/dialog";
import { Boton } from "@/components/ui/boton";
import {
  CLASE_AYUDA,
  CLASE_CAMPO,
  CLASE_ERROR,
  CLASE_LABEL,
} from "@/components/fidelli/estilos";
import {
  cambiarEstadoLubricentro,
  type EstadoEdicion,
} from "@/app/fidelli/actions";
import { DOMINIO_SITIO } from "@/lib/seo";
import type { FilaLubricentro, PlanCompleto } from "@/components/fidelli/tipos";
import {
  ETIQUETA_MOTIVO_SUSPENSION,
  MOTIVOS_SUSPENSION,
  type MotivoSuspension,
} from "@/lib/fidelli/eventos";
import {
  CLASE_ACCION_FILA,
  DialogEditar,
  type OrigenDeFila,
} from "@/components/fidelli/dialog-editar";

// El tipo se movió a dialog-editar.tsx (bloque MÉTRICAS 3); se re-exporta
// para que los que lo importaban de acá sigan andando.
export type { OrigenDeFila };

const INICIAL: EstadoEdicion = {};
const CLASE_ACCION = CLASE_ACCION_FILA;

export function AccionesTenant({
  fila,
  planes,
  origen,
}: {
  fila: FilaLubricentro;
  planes: PlanCompleto[];
  origen: OrigenDeFila;
}) {
  return (
    // flex-wrap: en la columna angosta del listado las dos acciones se
    // apilan en vez de desbordar hacia la celda de al lado.
    <span className="flex flex-wrap items-center justify-end gap-x-1 gap-y-0.5">
      <DialogEditar
        datos={{
          id: fila.id,
          nombre: fila.nombre,
          slug: fila.slug,
          calcos_entregadas: fila.calcos_entregadas,
          plan_id: fila.plan_id,
          sub_periodo: fila.sub_periodo,
          sub_descuento_pct: Number(fila.sub_descuento_pct ?? 0),
          sub_vencimiento: fila.sub_vencimiento,
        }}
        planes={planes}
        origen={origen}
      />
      <DialogEstado fila={fila} />
    </span>
  );
}

function DialogEstado({ fila }: { fila: FilaLubricentro }) {
  const [abierto, setAbierto] = useState(false);
  const [estado, cambiar, cambiando] = useActionState(
    async (previo: EstadoEdicion, formData: FormData) => {
      const r = await cambiarEstadoLubricentro(previo, formData);
      if (r.ok) setAbierto(false);
      return r;
    },
    INICIAL,
  );

  const suspender = fila.activo;

  // El motivo de la suspensión (docs/METRICAS.md § 1 "Baja"): obligatorio,
  // y con «Otro» el detalle también. Es lo que separa el churn voluntario
  // del involuntario. Al reactivar no se pregunta nada.
  const [motivo, setMotivo] = useState<MotivoSuspension | "">("");
  const [detalle, setDetalle] = useState("");
  const faltaMotivo = suspender && (motivo === "" || (motivo === "otro" && detalle.trim() === ""));

  return (
    <Dialog open={abierto} onOpenChange={setAbierto}>
      <DialogTrigger className={CLASE_ACCION}>
        {suspender ? "Suspender" : "Reactivar"}
      </DialogTrigger>

      <DialogContenido
        titulo={`${suspender ? "Suspender" : "Reactivar"} ${fila.nombre}`}
      >
        <form action={cambiar} className="flex flex-col gap-4">
          {estado.error && (
            <p role="alert" className={CLASE_ERROR}>
              {estado.error}
            </p>
          )}

          <input type="hidden" name="id" value={fila.id} />
          <input type="hidden" name="activar" value={suspender ? "false" : "true"} />

          {suspender ? (
            <div className="flex flex-col gap-3 text-ui text-ink-60">
              <p>
                <span className="font-semibold text-ink">
                  {DOMINIO_SITIO}/{fila.slug} sigue respondiendo.
                </span>{" "}
                Los calcos ya pegados en los parasoles siguen funcionando: el
                cliente que escanee el QR ve su historial igual. Lo que se
                apaga es lo que la página le ofrece: el premio y el mensaje al
                escanear, los que tenga configurados —no se promete un
                beneficio que el local no puede entregar—. Y el slug sale del
                sitemap.
              </p>
              <p>
                El dueño sigue pudiendo entrar al panel con su contraseña y
                sigue viendo todos sus datos, pero el panel le queda en solo
                lectura: no va a poder cargar services ni editar nada hasta que
                se reactive. Le mostramos un aviso con el WhatsApp de Fidelli.
              </p>
              <p>
                <span className="font-semibold text-ink">No se borra nada.</span>{" "}
                Clientes, vehículos e historial quedan intactos y vuelven tal
                cual al reactivar.
              </p>

              <div>
                <label htmlFor={`sus-motivo-${fila.id}`} className={CLASE_LABEL}>
                  Motivo
                </label>
                <select
                  id={`sus-motivo-${fila.id}`}
                  name="motivo"
                  required
                  value={motivo}
                  onChange={(e) => setMotivo(e.target.value as MotivoSuspension | "")}
                  className={CLASE_CAMPO}
                >
                  <option value="">Elegí un motivo</option>
                  {MOTIVOS_SUSPENSION.map((m) => (
                    <option key={m} value={m}>
                      {ETIQUETA_MOTIVO_SUSPENSION[m]}
                    </option>
                  ))}
                </select>
                <p className={CLASE_AYUDA}>
                  Queda en el historial del lubricentro con tu nombre y la fecha.
                </p>
              </div>

              <div>
                <label htmlFor={`sus-detalle-${fila.id}`} className={CLASE_LABEL}>
                  Detalle{" "}
                  <span className="text-ink-40 normal-case">
                    {motivo === "otro" ? "(obligatorio con «Otro»)" : "(opcional)"}
                  </span>
                </label>
                <input
                  id={`sus-detalle-${fila.id}`}
                  name="detalle"
                  required={motivo === "otro"}
                  value={detalle}
                  onChange={(e) => setDetalle(e.target.value)}
                  className={CLASE_CAMPO}
                />
              </div>
            </div>
          ) : (
            <div className="flex flex-col gap-3 text-ui text-ink-60">
              <p>
                El owner recupera la carga de services al instante, y{" "}
                <span className="font-semibold text-ink">
                  {DOMINIO_SITIO}/{fila.slug}
                </span>{" "}
                vuelve a ofrecer el premio y el mensaje al escanear que tenga
                configurados.
              </p>
              <p>El aviso de suspensión desaparece de su panel.</p>
            </div>
          )}

          <Boton
            type="submit"
            tam="lg"
            disabled={cambiando || faltaMotivo}
            className="mt-1 w-full"
          >
            {cambiando
              ? suspender
                ? "Suspendiendo…"
                : "Reactivando…"
              : suspender
                ? "Suspender lubricentro"
                : "Reactivar lubricentro"}
          </Boton>
        </form>
      </DialogContenido>
    </Dialog>
  );
}

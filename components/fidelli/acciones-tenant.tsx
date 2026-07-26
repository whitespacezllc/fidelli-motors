"use client";

import { useActionState, useState } from "react";
import { Dialog, DialogTrigger, DialogContenido } from "@/components/ui/dialog";
import { Boton } from "@/components/ui/boton";
import { IconoCandado } from "@/components/iconos";
import { CamposPlan, type ValoresPlan } from "@/components/fidelli/campos-plan";
import {
  CLASE_AYUDA,
  CLASE_CAMPO,
  CLASE_ERROR,
  CLASE_LABEL,
} from "@/components/fidelli/estilos";
import {
  editarLubricentro,
  cambiarEstadoLubricentro,
  type EstadoEdicion,
} from "@/app/fidelli/actions";
import type { Periodo } from "@/lib/fidelli/plan";
import type { FilaLubricentro, PlanCompleto } from "@/components/fidelli/tipos";

const INICIAL: EstadoEdicion = {};

const CLASE_ACCION =
  "inline-flex min-h-8 items-center rounded-sm px-2 py-1 text-label font-semibold text-ink underline underline-offset-2 hover:bg-surface disabled:opacity-60";

export function AccionesTenant({
  fila,
  planes,
}: {
  fila: FilaLubricentro;
  planes: PlanCompleto[];
}) {
  return (
    <span className="flex items-center justify-end gap-1 whitespace-nowrap">
      <DialogEditar fila={fila} planes={planes} />
      <DialogEstado fila={fila} />
    </span>
  );
}

function DialogEditar({
  fila,
  planes,
}: {
  fila: FilaLubricentro;
  planes: PlanCompleto[];
}) {
  const [abierto, setAbierto] = useState(false);

  const [plan, setPlan] = useState<ValoresPlan>({
    planId: fila.plan_id ?? planes[0]?.id ?? "",
    periodo: (fila.sub_periodo ?? "mensual") as Periodo,
    descuentoPct: Number(fila.sub_descuento_pct ?? 0),
  });

  // El dialog se cierra dentro de la acción, no en un efecto: cerrarse es la
  // consecuencia de haber guardado, no una sincronización con nada externo.
  const [estado, guardar, guardando] = useActionState(
    async (previo: EstadoEdicion, formData: FormData) => {
      const r = await editarLubricentro(previo, formData);
      if (r.ok) setAbierto(false);
      return r;
    },
    INICIAL,
  );

  // El slug está impreso en las calcos pegadas en los parasoles: si ya se
  // entregó una sola, cambiarlo rompe los QR de esos autos. La base lo
  // verifica igual contra el valor guardado — esto es para que se entienda
  // antes de intentarlo, no para reemplazar aquel chequeo.
  const calcos = fila.calcos_entregadas;
  const slugBloqueado = calcos > 0;

  return (
    <Dialog open={abierto} onOpenChange={setAbierto}>
      <DialogTrigger className={CLASE_ACCION}>Editar</DialogTrigger>

      <DialogContenido titulo={`Editar ${fila.nombre}`}>
        <form action={guardar} className="flex flex-col gap-4">
          {estado.error && (
            <p role="alert" className={CLASE_ERROR}>
              {estado.error}
            </p>
          )}

          <input type="hidden" name="id" value={fila.id} />

          <div>
            <label htmlFor={`ed-nombre-${fila.id}`} className={CLASE_LABEL}>
              Nombre de la marca
            </label>
            <input
              id={`ed-nombre-${fila.id}`}
              name="nombre"
              required
              defaultValue={fila.nombre}
              className={CLASE_CAMPO}
            />
          </div>

          <div>
            <label htmlFor={`ed-slug-${fila.id}`} className={CLASE_LABEL}>
              Slug público
            </label>
            <input
              id={`ed-slug-${fila.id}`}
              name="slug"
              defaultValue={fila.slug}
              // readOnly y no disabled: el campo tiene que seguir viajando en
              // el submit. Lo que llega es el slug actual, y la función lo ve
              // como "no cambió".
              readOnly={slugBloqueado}
              aria-describedby={slugBloqueado ? `ed-slug-motivo-${fila.id}` : undefined}
              pattern="[a-z0-9]+(-[a-z0-9]+)*"
              minLength={3}
              maxLength={60}
              className={CLASE_CAMPO}
            />
            {slugBloqueado ? (
              <p
                id={`ed-slug-motivo-${fila.id}`}
                className="mt-1.5 flex items-start gap-1.5 rounded-md bg-overdue-soft px-3 py-2 text-label text-overdue"
              >
                <IconoCandado className="mt-px size-3.5 shrink-0" />
                <span>
                  Ya se entregaron {calcos} calcos con este QR. Cambiar el slug
                  las rompería.
                </span>
              </p>
            ) : (
              <p className={CLASE_AYUDA}>
                fidellimotors.app/{fila.slug} — todavía se puede cambiar porque
                no hay calcos entregadas.
              </p>
            )}
          </div>

          <div>
            <label htmlFor={`ed-calcos-${fila.id}`} className={CLASE_LABEL}>
              Calcos entregadas
            </label>
            <input
              id={`ed-calcos-${fila.id}`}
              name="calcos_entregadas"
              type="number"
              min={0}
              step={1}
              inputMode="numeric"
              defaultValue={calcos}
              className={`${CLASE_CAMPO} max-w-[140px]`}
            />
            <p className={CLASE_AYUDA}>
              En cuanto pasa de cero, el slug queda cerrado para siempre.
            </p>
          </div>

          <CamposPlan
            planes={planes}
            valores={plan}
            alCambiar={(p) => setPlan((v) => ({ ...v, ...p }))}
            prefijo={`ed-${fila.id}`}
          />

          <div>
            <label htmlFor={`ed-vence-${fila.id}`} className={CLASE_LABEL}>
              Vencimiento
            </label>
            <input
              id={`ed-vence-${fila.id}`}
              name="vencimiento"
              type="date"
              required
              defaultValue={fila.sub_vencimiento ?? ""}
              className={`${CLASE_CAMPO} max-w-[200px]`}
            />
          </div>

          <Boton type="submit" tam="lg" disabled={guardando} className="mt-1 w-full">
            {guardando ? "Guardando…" : "Guardar cambios"}
          </Boton>
        </form>
      </DialogContenido>
    </Dialog>
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
                  fidellimotors.app/{fila.slug} deja de responder.
                </span>{" "}
                Los clientes que escaneen el QR van a ver que la página no
                existe.
              </p>
              <p>
                Bruno sigue pudiendo entrar al panel con su contraseña y sigue
                viendo todos sus datos, pero no va a poder cargar services ni
                editar nada hasta que se reactive. Le mostramos un aviso con el
                WhatsApp de Fidelli.
              </p>
              <p>
                <span className="font-semibold text-ink">No se borra nada.</span>{" "}
                Clientes, vehículos e historial quedan intactos y vuelven tal
                cual al reactivar.
              </p>
            </div>
          ) : (
            <div className="flex flex-col gap-3 text-ui text-ink-60">
              <p>
                Vuelve a responder{" "}
                <span className="font-semibold text-ink">
                  fidellimotors.app/{fila.slug}
                </span>{" "}
                y el owner recupera la carga de services al instante.
              </p>
              <p>El aviso de suspensión desaparece de su panel.</p>
            </div>
          )}

          <Boton type="submit" tam="lg" disabled={cambiando} className="mt-1 w-full">
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

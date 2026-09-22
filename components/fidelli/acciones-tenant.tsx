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
import {
  ETIQUETA_MOTIVO_SUSPENSION,
  ETIQUETA_ORIGEN,
  MOTIVOS_SUSPENSION,
  ORIGENES_TENANT,
  type MotivoSuspension,
  type OrigenTenant,
} from "@/lib/fidelli/eventos";

/** El origen ya cargado del tenant, para prellenar la edición. Null en
 *  los dos campos = todavía no se cargó (los anteriores al 22/09/2026). */
export type OrigenDeFila = {
  origen: OrigenTenant | null;
  detalle: string | null;
};

const INICIAL: EstadoEdicion = {};

const CLASE_ACCION =
  "inline-flex min-h-8 items-center rounded-sm px-2 py-1 text-label font-semibold text-ink underline underline-offset-2 hover:bg-surface disabled:opacity-60";

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
    <span className="flex items-center justify-end gap-1 whitespace-nowrap">
      <DialogEditar fila={fila} planes={planes} origen={origen} />
      <DialogEstado fila={fila} />
    </span>
  );
}

function DialogEditar({
  fila,
  planes,
  origen,
}: {
  fila: FilaLubricentro;
  planes: PlanCompleto[];
  origen: OrigenDeFila;
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

          {/* El origen (docs/METRICAS.md § 1). Acá es opcional: es donde se
              cargan a mano los tenants que existían antes del campo. Cada
              cambio deja un evento `origen`. */}
          <div>
            <label htmlFor={`ed-origen-${fila.id}`} className={CLASE_LABEL}>
              ¿Cómo llegó?
            </label>
            <select
              id={`ed-origen-${fila.id}`}
              name="origen"
              defaultValue={origen.origen ?? ""}
              className={CLASE_CAMPO}
            >
              <option value="">Sin cargar</option>
              {ORIGENES_TENANT.map((o) => (
                <option key={o} value={o}>
                  {ETIQUETA_ORIGEN[o]}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label htmlFor={`ed-origen-detalle-${fila.id}`} className={CLASE_LABEL}>
              Detalle del origen
            </label>
            <input
              id={`ed-origen-detalle-${fila.id}`}
              name="origen_detalle"
              defaultValue={origen.detalle ?? ""}
              placeholder="Quién lo refirió, qué distribuidor, qué campaña…"
              className={CLASE_CAMPO}
            />
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
                  fidellimotors.app/{fila.slug} sigue respondiendo.
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
                  fidellimotors.app/{fila.slug}
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

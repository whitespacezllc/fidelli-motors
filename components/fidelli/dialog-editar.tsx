"use client";

import { useActionState, useState, type ReactNode } from "react";
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
import { editarLubricentro, type EstadoEdicion } from "@/app/fidelli/actions";
import type { Periodo } from "@/lib/fidelli/plan";
import { DOMINIO_SITIO } from "@/lib/seo";
import type { PlanCompleto } from "@/components/fidelli/tipos";
import {
  ETIQUETA_ORIGEN,
  ORIGENES_TENANT,
  type OrigenTenant,
} from "@/lib/fidelli/eventos";

/** El origen ya cargado del tenant, para prellenar la edición. Null en
 *  los dos campos = todavía no se cargó (los anteriores al 22/09/2026). */
export type OrigenDeFila = {
  origen: OrigenTenant | null;
  detalle: string | null;
};

/** Lo que el dialog necesita del tenant. La fila del listado y la ficha
 *  lo arman desde sus propias lecturas: es EL MISMO dialog en los dos
 *  lados (bloque MÉTRICAS 3), no dos copias. */
export type DatosEdicion = {
  id: string;
  nombre: string;
  slug: string;
  calcos_entregadas: number;
  plan_id: string | null;
  sub_periodo: Periodo | null;
  sub_descuento_pct: number;
  sub_vencimiento: string | null;
};

const INICIAL: EstadoEdicion = {};

export const CLASE_ACCION_FILA =
  "inline-flex min-h-8 items-center rounded-sm px-2 py-1 text-label font-semibold whitespace-nowrap text-ink underline underline-offset-2 hover:bg-surface disabled:opacity-60";

export function DialogEditar({
  datos,
  planes,
  origen,
  trigger = "Editar",
  triggerClassName = CLASE_ACCION_FILA,
}: {
  datos: DatosEdicion;
  planes: PlanCompleto[];
  origen: OrigenDeFila;
  /** El contenido del disparador: «Editar» en la fila y en la cabecera,
   *  «Sin origen · cargar» en el chip de la ficha. */
  trigger?: ReactNode;
  triggerClassName?: string;
}) {
  const [abierto, setAbierto] = useState(false);

  const [plan, setPlan] = useState<ValoresPlan>({
    planId: datos.plan_id ?? planes[0]?.id ?? "",
    periodo: datos.sub_periodo ?? "mensual",
    descuentoPct: Number(datos.sub_descuento_pct ?? 0),
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
  const calcos = datos.calcos_entregadas;
  const slugBloqueado = calcos > 0;
  const id = datos.id;

  return (
    <Dialog open={abierto} onOpenChange={setAbierto}>
      <DialogTrigger className={triggerClassName}>{trigger}</DialogTrigger>

      <DialogContenido titulo={`Editar ${datos.nombre}`}>
        <form action={guardar} className="flex flex-col gap-4">
          {estado.error && (
            <p role="alert" className={CLASE_ERROR}>
              {estado.error}
            </p>
          )}

          <input type="hidden" name="id" value={id} />

          <div>
            <label htmlFor={`ed-nombre-${id}`} className={CLASE_LABEL}>
              Nombre de la marca
            </label>
            <input
              id={`ed-nombre-${id}`}
              name="nombre"
              required
              defaultValue={datos.nombre}
              className={CLASE_CAMPO}
            />
          </div>

          <div>
            <label htmlFor={`ed-slug-${id}`} className={CLASE_LABEL}>
              Slug público
            </label>
            <input
              id={`ed-slug-${id}`}
              name="slug"
              defaultValue={datos.slug}
              // readOnly y no disabled: el campo tiene que seguir viajando en
              // el submit. Lo que llega es el slug actual, y la función lo ve
              // como "no cambió".
              readOnly={slugBloqueado}
              aria-describedby={slugBloqueado ? `ed-slug-motivo-${id}` : undefined}
              pattern="[a-z0-9]+(-[a-z0-9]+)*"
              minLength={3}
              maxLength={60}
              className={CLASE_CAMPO}
            />
            {slugBloqueado ? (
              <p
                id={`ed-slug-motivo-${id}`}
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
                {DOMINIO_SITIO}/{datos.slug} — todavía se puede cambiar porque
                no hay calcos entregadas.
              </p>
            )}
          </div>

          {/* Desde el bloque MÉTRICAS 3 el contador es la suma de los
              pedidos (registrar_pedido_calcos). Acá se muestra y viaja tal
              cual: la función de edición lo ve igual y no lo toca. */}
          <div>
            <label htmlFor={`ed-calcos-${id}`} className={CLASE_LABEL}>
              Calcos entregadas
            </label>
            <input
              id={`ed-calcos-${id}`}
              name="calcos_entregadas"
              type="number"
              readOnly
              value={calcos}
              aria-describedby={`ed-calcos-nota-${id}`}
              className={`${CLASE_CAMPO} max-w-[140px] bg-surface text-ink-40`}
            />
            <p id={`ed-calcos-nota-${id}`} className={CLASE_AYUDA}>
              Se registran desde la ficha, en el bloque Calcos: cada pedido
              con su fecha, si se cobró y cuánto.
            </p>
          </div>

          {/* El origen (docs/METRICAS.md § 1). Acá es opcional: es donde se
              cargan a mano los tenants que existían antes del campo. Cada
              cambio deja un evento `origen`. */}
          <div>
            <label htmlFor={`ed-origen-${id}`} className={CLASE_LABEL}>
              ¿Cómo llegó?
            </label>
            <select
              id={`ed-origen-${id}`}
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
            <label htmlFor={`ed-origen-detalle-${id}`} className={CLASE_LABEL}>
              Detalle del origen
            </label>
            <input
              id={`ed-origen-detalle-${id}`}
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
            prefijo={`ed-${id}`}
          />

          <div>
            <label htmlFor={`ed-vence-${id}`} className={CLASE_LABEL}>
              Vencimiento
            </label>
            <input
              id={`ed-vence-${id}`}
              name="vencimiento"
              type="date"
              required
              defaultValue={datos.sub_vencimiento ?? ""}
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

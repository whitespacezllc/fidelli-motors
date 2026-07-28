"use client";

import { useActionState, useState } from "react";
import { Dialog, DialogTrigger, DialogContenido } from "@/components/ui/dialog";
import { Boton } from "@/components/ui/boton";
import {
  invitarOwner,
  reenviarInvitacion,
  type EstadoInvitacion,
} from "@/app/fidelli/actions";
import type { EstadoOwner } from "@/components/fidelli/tipos";

const INICIAL: EstadoInvitacion = {};

const CLASE_CAMPO =
  "h-12 w-full rounded-md border border-line bg-base px-3.5 text-body text-ink placeholder:text-ink-40";
const CLASE_LABEL =
  "mb-1.5 block text-label font-semibold tracking-[0.06em] text-ink-60 uppercase";

// Botón de acción de fila: más chico que el táctil de 44px porque esta
// superficie es de escritorio y las filas van a densidad alta, pero con
// área suficiente para no fallar el clic.
const CLASE_ACCION =
  "mt-1 inline-flex min-h-8 items-center rounded-sm px-1.5 py-1 -ml-1.5 text-label font-semibold text-ink underline underline-offset-2 hover:bg-surface disabled:opacity-60 disabled:no-underline";

function Punto({ clase }: { clase: string }) {
  return (
    <span aria-hidden className={`inline-block size-2 shrink-0 rounded-full ${clase}`} />
  );
}

export function CeldaOwner({
  lubricentroId,
  nombre,
  estado,
}: {
  lubricentroId: string;
  nombre: string;
  estado: EstadoOwner;
}) {
  const [reenvio, reenviar, reenviando] = useActionState(
    reenviarInvitacion,
    INICIAL,
  );

  if (estado === "activo") {
    return (
      <span className="flex items-center gap-2 whitespace-nowrap text-ink">
        <Punto clase="bg-success" />
        Activo
      </span>
    );
  }

  if (estado === "pendiente") {
    return (
      <div>
        <span className="flex items-center gap-2 whitespace-nowrap text-ink-60">
          <Punto clase="bg-upcoming" />
          Invitación pendiente
        </span>

        {reenvio.ok ? (
          <p className="mt-1 text-label text-success">{reenvio.ok}</p>
        ) : (
          <form action={reenviar}>
            <input type="hidden" name="lubricentro_id" value={lubricentroId} />
            <button type="submit" disabled={reenviando} className={CLASE_ACCION}>
              {reenviando ? "Reenviando…" : "Reenviar invitación"}
            </button>
          </form>
        )}

        {reenvio.error && (
          <p role="alert" className="mt-1 max-w-[220px] text-label text-overdue">
            {reenvio.error}
          </p>
        )}
      </div>
    );
  }

  // Sin owner: la invitación nunca llegó a crear el usuario. El tenant está
  // completo y funcionando; lo único que falta es que alguien pueda entrar.
  return (
    <div>
      <span className="flex items-center gap-2 whitespace-nowrap text-overdue">
        <Punto clase="bg-overdue" />
        Sin owner
      </span>
      <DialogInvitar lubricentroId={lubricentroId} nombre={nombre} />
    </div>
  );
}

function DialogInvitar({
  lubricentroId,
  nombre,
}: {
  lubricentroId: string;
  nombre: string;
}) {
  const [abierto, setAbierto] = useState(false);
  const [estado, invitar, invitando] = useActionState(invitarOwner, INICIAL);

  return (
    <Dialog
      open={abierto}
      onOpenChange={(v) => setAbierto(v)}
    >
      <DialogTrigger className={CLASE_ACCION}>Invitar owner</DialogTrigger>

      <DialogContenido titulo={`Invitar al owner de ${nombre}`}>
        <form action={invitar} className="flex flex-col gap-4">
          {estado.error && (
            <p
              role="alert"
              className="rounded-md bg-overdue-soft px-3.5 py-3 text-ui text-overdue"
            >
              {estado.error}
            </p>
          )}

          {estado.ok && (
            <p className="rounded-md bg-success-soft px-3.5 py-3 text-ui text-success">
              {estado.ok} Ya podés cerrar esta ventana.
            </p>
          )}

          <input type="hidden" name="lubricentro_id" value={lubricentroId} />

          <div>
            <label htmlFor={`owner-nombre-${lubricentroId}`} className={CLASE_LABEL}>
              Nombre del owner
            </label>
            <input
              id={`owner-nombre-${lubricentroId}`}
              name="nombre"
              required
              className={CLASE_CAMPO}
            />
          </div>

          <div>
            <label htmlFor={`owner-email-${lubricentroId}`} className={CLASE_LABEL}>
              Email
            </label>
            <input
              id={`owner-email-${lubricentroId}`}
              name="email"
              type="email"
              required
              className={CLASE_CAMPO}
            />
            <p className="mt-1.5 text-label text-ink-60">
              Le llega un mail para elegir su contraseña y entrar por primera vez.
              El enlace vence en 24 horas.
            </p>
          </div>

          <Boton type="submit" tam="lg" disabled={invitando} className="mt-1 w-full">
            {invitando ? "Enviando…" : "Enviar invitación"}
          </Boton>
        </form>
      </DialogContenido>
    </Dialog>
  );
}

"use client";

import { useActionState } from "react";
import Link from "next/link";
import { pedirInvitacionNueva, type EstadoAccion } from "@/lib/auth/actions";
import { clasesBoton } from "@/components/ui/boton";
import { urlWhatsappSoporte } from "@/lib/config";

const ESTADO_INICIAL: EstadoAccion = {};

const CLASE_SECUNDARIO =
  "flex min-h-11 items-center justify-center text-ui font-semibold text-ink-60 hover:text-ink";

// ============================================================
// La salida de una invitación vencida.
//
// Antes esto era un callejón: "escribinos y te mandamos otra". Un owner
// que abrió el mail a la tarde —lo más normal del mundo— quedaba parado,
// dependiendo de que alguien de Fidelli viera el WhatsApp. Ahora se pide
// la invitación solo, con el mail al que le llegó, y le entra en el
// momento. Fidelli sigue ahí como segundo camino.
//
// La confirmación es la misma exista o no el mail: no se revela quién
// tiene cuenta. La única excepción es un fallo real del envío, que sí se
// cuenta, porque decirle "listo" a alguien a quien no le va a llegar nada
// es peor.
// ============================================================

export function FormularioInvitacionVencida() {
  const [estado, accion, pendiente] = useActionState(
    pedirInvitacionNueva,
    ESTADO_INICIAL,
  );

  if (estado.ok) {
    return (
      <div>
        <h1 className="mb-3 font-brand text-h3 font-bold text-ink">
          Revisá tu correo
        </h1>
        <p className="text-body text-ink-60">
          Si <span className="font-semibold text-ink">{estado.email}</span>{" "}
          tiene una invitación pendiente, te acabamos de mandar una nueva.
          Vale 24 horas. Si no aparece en unos minutos, mirá en el correo no
          deseado.
        </p>
        <p className="mt-4 text-body text-ink-60">
          ¿Ya habías elegido una contraseña? Entonces entrá desde el login o
          pedí una nueva desde &ldquo;¿Olvidaste tu contraseña?&rdquo;.
        </p>
        <div className="mt-8 flex flex-col gap-3">
          <Link href="/login" className={clasesBoton("primario", "lg")}>
            Ir al login
          </Link>
          <a
            href={urlWhatsappSoporte()}
            target="_blank"
            rel="noopener noreferrer"
            className={CLASE_SECUNDARIO}
          >
            No me llega nada, escribirle a Fidelli
          </a>
        </div>
      </div>
    );
  }

  return (
    <div>
      <h1 className="mb-2 font-brand text-h3 font-bold text-ink">
        La invitación ya venció
      </h1>
      <p className="mb-6 text-body text-ink-60">
        Los enlaces de invitación duran 24 horas y sirven una sola vez.
        Escribí el email al que te la mandamos y te llega una nueva ahora
        mismo.
      </p>

      <form action={accion} className="flex flex-col gap-5">
        {estado.error && (
          <p
            role="alert"
            className="rounded-md bg-overdue-soft px-3.5 py-3 text-ui text-overdue"
          >
            {estado.error}
          </p>
        )}

        <div>
          <label
            htmlFor="email"
            className="mb-1.5 block text-label font-semibold tracking-[0.06em] text-ink-60 uppercase"
          >
            Email
          </label>
          <input
            id="email"
            name="email"
            type="email"
            required
            autoComplete="email"
            inputMode="email"
            className="h-12 w-full rounded-md border border-line bg-base px-3.5 text-body text-ink placeholder:text-ink-40"
          />
        </div>

        <button
          type="submit"
          disabled={pendiente}
          className={clasesBoton("primario", "lg")}
        >
          {pendiente ? "Enviando…" : "Mandarme una invitación nueva"}
        </button>

        <div className="flex flex-col gap-1">
          <a
            href={urlWhatsappSoporte()}
            target="_blank"
            rel="noopener noreferrer"
            className={CLASE_SECUNDARIO}
          >
            Escribirle a Fidelli
          </a>
          <Link href="/login" className={CLASE_SECUNDARIO}>
            Ya tengo contraseña, quiero entrar
          </Link>
        </div>
      </form>
    </div>
  );
}

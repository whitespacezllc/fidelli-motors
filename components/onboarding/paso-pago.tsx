"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { Boton } from "@/components/ui/boton";
import { PantallaPago, type DatosPago } from "@/components/suscripcion/pantalla-pago";
import { marcarPagoPresentado } from "@/app/panel/onboarding/actions";

// ============================================================
// LA CUARTA PANTALLA · el paso de pago, que NO bloquea
//
// Alguien que acaba de cargar sus productos y confirmar su diseño no puede
// quedar afuera de su propio panel esperando una transferencia. Y eso no
// depende de este botón: cuando esta pantalla se muestra, la base YA
// escribió `onboarding_completado_at`, así que el gate de (tras-onboarding)
// está abierto y el panel entero funciona detrás. "Entrar al panel" es una
// navegación, no un desbloqueo — si el botón fallara, el dueño escribe
// /panel en la barra y entra igual.
//
// Se reusa `PantallaPago`, la misma que /panel/suscripcion, con dos props:
// la VOZ (este tenant no está renovando: le falta el primer pago) y la
// SALIDA (el botón, que la pantalla de renovación no tiene).
// ============================================================
export function PasoPago({ datos }: { datos: DatosPago }) {
  const router = useRouter();
  const [pendiente, iniciar] = useTransition();

  function entrar() {
    iniciar(async () => {
      // La marca se escribe al SALIR y no al entrar: si se escribiera al
      // renderizar, un dueño que cierra la pestaña sin leer nada nunca
      // volvería a ver la pantalla. Y si la escritura falla, se entra
      // igual — quedarse encerrado por no poder registrar que vio un
      // cartel sería el peor final posible para este paso.
      await marcarPagoPresentado();
      router.replace("/panel");
      router.refresh();
    });
  }

  return (
    <div className="flex flex-col gap-5">
      <div>
        <h2 className="font-brand text-h3 font-bold text-ink">
          Ya está todo listo.
        </h2>
        <p className="mt-1.5 max-w-prose text-body text-ink-60">
          Tu catálogo y tu diseño están cargados y tu panel ya funciona. Lo único
          que falta es el primer pago — podés hacerlo ahora o entrar y resolverlo
          después.
        </p>
      </div>

      <PantallaPago
        datos={{
          ...datos,
          voz: "alta",
          salida: { texto: "Entrar al panel", onClick: entrar, pendiente },
        }}
      />
    </div>
  );
}

// El bonificado no ve una pantalla para transferir cero pesos. Termina su
// onboarding igual, con la misma salida.
export function PasoPagoBonificado() {
  const router = useRouter();
  const [pendiente, iniciar] = useTransition();

  return (
    <div className="surface-card flex flex-col items-start gap-4 p-5 sm:p-6">
      <div>
        <h2 className="font-brand text-h3 font-bold text-ink">Ya está todo listo.</h2>
        <p className="mt-1.5 max-w-prose text-body text-ink-60">
          Tu plan está bonificado: no tenés nada que pagar. Entrá al panel y cargá
          el primer trabajo con el próximo auto que entre.
        </p>
      </div>
      <Boton
        type="button"
        tam="lg"
        disabled={pendiente}
        onClick={() =>
          iniciar(async () => {
            await marcarPagoPresentado();
            router.replace("/panel");
            router.refresh();
          })
        }
      >
        {pendiente ? "Entrando…" : "Entrar al panel"}
      </Boton>
    </div>
  );
}

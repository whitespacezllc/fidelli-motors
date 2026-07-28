import type { Metadata } from "next";
import Link from "next/link";
import { Logo } from "@/components/marca/logo";
import { clasesBoton } from "@/components/ui/boton";
import { urlWhatsappSoporte } from "@/lib/config";

export const metadata: Metadata = { title: "El enlace no sirve — Fidelli Motors" };

// ============================================================
// Dónde aterriza un enlace de email que no se pudo canjear.
//
// Antes esto era un redirect al login con un aviso gris al costado, y para
// el caso que más importa —un owner invitado cuyo enlace venció— era un
// callejón sin salida: el formulario de login no le sirve, porque nunca
// llegó a tener contraseña.
//
// Dos cosas hacen falta acá y ninguna es un formulario: entender qué pasó,
// y tener a mano el camino para conseguir otro enlace. Ese camino no es el
// mismo según de qué enlace se trate, y por eso el texto cambia.
// ============================================================

type Caso = { titulo: string; cuerpo: string; accion: "recuperar" | "fidelli" };

function leerCaso(motivo?: string, tipo?: string): Caso {
  if (motivo === "sin_token") {
    return {
      titulo: "Esta dirección no lleva a ningún lado",
      cuerpo:
        "Llegaste acá sin un enlace de correo. Si estabas tratando de entrar, hacelo desde el login; si te mandamos un mail, abrí el enlace desde ahí.",
      accion: "recuperar",
    };
  }

  // Una invitación vencida no se resuelve sola: el owner no puede pedirse
  // otra a sí mismo, la manda Fidelli desde el panel de administración.
  if (tipo === "invite") {
    return {
      titulo: "La invitación ya venció",
      cuerpo:
        "Los enlaces de invitación duran 24 horas, y este ya pasó ese plazo o se usó antes. No lo podés renovar vos: escribinos y te mandamos uno nuevo en el momento.",
      accion: "fidelli",
    };
  }

  return {
    titulo: "El enlace ya se usó o venció",
    cuerpo:
      "Los enlaces de correo duran 24 horas y sirven una sola vez. Pedí uno nuevo y te llega al toque.",
    accion: "recuperar",
  };
}

export default async function PaginaEnlace({
  searchParams,
}: {
  searchParams: Promise<{ motivo?: string; tipo?: string }>;
}) {
  const { motivo, tipo } = await searchParams;
  const caso = leerCaso(motivo, tipo);

  return (
    <main className="flex min-h-dvh items-center justify-center px-6 py-10">
      <div className="w-full max-w-[420px]">
        <Logo className="mb-8 h-6 w-auto" priority />

        <h1 className="mb-2 font-brand text-h3 font-bold text-ink">
          {caso.titulo}
        </h1>
        <p className="mb-6 text-body text-ink-60">{caso.cuerpo}</p>

        {caso.accion === "recuperar" ? (
          <div className="flex flex-col gap-3">
            <Link href="/recuperar" className={clasesBoton("primario", "lg")}>
              Pedir un enlace nuevo
            </Link>
            <Link
              href="/login"
              className="flex min-h-11 items-center justify-center text-ui font-semibold text-ink-60 hover:text-ink"
            >
              Volver al login
            </Link>
          </div>
        ) : (
          <div className="flex flex-col gap-3">
            <a
              href={urlWhatsappSoporte()}
              target="_blank"
              rel="noopener noreferrer"
              className={clasesBoton("primario", "lg")}
            >
              Escribirle a Fidelli
            </a>
            <Link
              href="/login"
              className="flex min-h-11 items-center justify-center text-ui font-semibold text-ink-60 hover:text-ink"
            >
              Ya tengo contraseña, quiero entrar
            </Link>
          </div>
        )}
      </div>
    </main>
  );
}

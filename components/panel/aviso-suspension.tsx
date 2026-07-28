import { urlWhatsappSoporte } from "@/lib/config";
import { IconoWhatsapp } from "@/components/iconos";

// El motivo que acompaña a cada botón apagado. Uno solo, en un lugar: si
// cambia la explicación, cambia en todas las pantallas a la vez.
export const MOTIVO_SUSPENSION =
  "Tu cuenta está suspendida: escribinos por WhatsApp para reactivarla.";

// ============================================================
// El aviso de suspensión
//
// Va arriba de todo en el panel, en todas las pantallas. No es un error ni
// una pantalla de bloqueo: el owner entra con sus credenciales de siempre y
// ve sus clientes, sus vehículos y todo su historial intacto. Lo único que
// no puede es cargar cosas nuevas.
//
// Cortarle el acceso sería peor que inútil: alguien que se atrasó un día
// tiene que poder mirar sus datos y entender qué pasó — y sobre todo, tiene
// que poder resolverlo. Por eso lo importante del aviso no es la advertencia
// sino el botón de WhatsApp: la salida está a un toque.
//
// Ámbar, nunca rojo: el rojo de marca es acción y acá no hay ninguna que el
// producto pueda ofrecerle.
// ============================================================
export function AvisoSuspension() {
  return (
    <div
      role="status"
      className="mb-6 rounded-lg border border-overdue bg-overdue-soft px-4 py-4 sm:px-5"
    >
      <p className="font-brand text-body font-bold text-overdue">
        Tu cuenta está suspendida
      </p>

      <p className="mt-1.5 text-ui text-ink-60">
        Podés consultar todos tus datos, pero no vas a poder cargar services
        ni dar de alta clientes, vehículos o productos hasta que se reactive.
        Tu página pública tampoco está respondiendo: los clientes que escaneen
        el QR no van a encontrarla.
      </p>

      <p className="mt-1.5 text-ui text-ink-60">
        No se borró nada. Escribinos y lo resolvemos.
      </p>

      <a
        href={urlWhatsappSoporte()}
        target="_blank"
        rel="noreferrer"
        className="mt-4 inline-flex h-11 items-center gap-2 rounded-md bg-ink px-4 font-brand text-ui font-bold text-base transition-colors hover:bg-ink-60"
      >
        <IconoWhatsapp className="size-4" />
        Escribirle a Fidelli
      </a>
    </div>
  );
}

import type { Metadata } from "next";
import { obtenerSesion } from "@/lib/auth/session";
import { CabeceraSeccion } from "@/components/panel/cabecera-seccion";
import { TarjetaVideo } from "@/components/ayuda/tarjeta-video";
import { IconoWhatsapp } from "@/components/iconos";
import { urlWhatsappSoporte } from "@/lib/config";
import { videosPorSeccion } from "@/lib/ayuda/videos";
import { etiquetaPlan, planEfectivo } from "@/lib/ayuda/plan";

export const metadata: Metadata = { title: "Ayuda" };

// "Página y calcos" → "pagina-y-calcos": un id no lleva espacios ni tildes.
function idDe(texto: string): string {
  return texto
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-");
}

// La solapa Ayuda: un video corto por cada cosa que se puede hacer,
// agrupados por sección en el orden de lib/ayuda/videos.ts. Se ve también
// con el onboarding a medias —vive fuera del grupo bloqueado— porque es
// justo ahí donde más sirve.
//
// Sin buscador, sin comentarios, sin valoraciones: son quince videos y el
// que no encuentra lo suyo escribe por WhatsApp desde la tarjeta del pie.
export default async function PaginaAyuda() {
  const sesion = await obtenerSesion();
  const plan = planEfectivo(sesion?.capacidades ?? null);
  const grupos = videosPorSeccion();

  return (
    <div>
      <CabeceraSeccion titulo="Ayuda" />
      <p className="-mt-3 mb-7 max-w-prose text-pretty text-ui text-ink-60">
        Un video corto por cada cosa que podés hacer. Grabados en una cuenta
        real, sin vueltas.
      </p>

      <div className="flex flex-col gap-8">
        {grupos.map((grupo) => (
          <section key={grupo.seccion} aria-labelledby={`ayuda-${idDe(grupo.seccion)}`}>
            <h2
              id={`ayuda-${idDe(grupo.seccion)}`}
              className="mb-3 px-1 font-ui text-label font-semibold tracking-[0.06em] text-ink-40 uppercase"
            >
              {grupo.seccion}
            </h2>
            <ul className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
              {grupo.videos.map((video) => (
                <TarjetaVideo
                  key={video.id}
                  video={video}
                  etiquetaPlan={etiquetaPlan(video.plan, plan)}
                />
              ))}
            </ul>
          </section>
        ))}
      </div>

      {/* La salida para lo que no está en la lista: el mismo WhatsApp de
          soporte del resto del panel, en grafito y no en rojo — la única
          acción roja del panel es cargar un trabajo. */}
      <section className="surface-card mt-9 flex flex-wrap items-center justify-between gap-4 p-5 sm:p-6">
        <div>
          <p className="font-brand text-body font-bold text-ink">
            ¿No encontraste lo que buscabas?
          </p>
          <p className="mt-1 text-ui text-ink-60">
            Escribinos y te lo mostramos por WhatsApp.
          </p>
        </div>
        <a
          href={urlWhatsappSoporte()}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex h-11 items-center gap-2 rounded-md bg-ink px-4 font-brand text-ui font-bold text-base transition-colors hover:bg-ink-60"
        >
          <IconoWhatsapp className="size-4" />
          Escribir por WhatsApp
        </a>
      </section>
    </div>
  );
}

import { ColumnaVideo } from "@/components/onboarding/columna-video";
import type { VideoAyuda } from "@/lib/ayuda/videos";

// La pantalla de un paso: dos columnas en escritorio —el formulario a la
// izquierda, el video del paso a la derecha— y una en el celular, con el
// video arriba, plegado. `lateral` es lo que el paso quiera poner debajo
// del video (el paso 2 pone la vista previa del celular).
export function MarcoPaso({
  titulo,
  bajada,
  video,
  lateral,
  children,
}: {
  titulo: string;
  bajada: React.ReactNode;
  video: VideoAyuda | null;
  lateral?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <section
      aria-labelledby="paso-titulo"
      className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,22rem)] lg:items-start lg:gap-10 xl:grid-cols-[minmax(0,1fr)_minmax(0,24rem)]"
    >
      <div className="order-2 min-w-0 lg:order-1">
        <h2 id="paso-titulo" className="font-brand text-h3 font-bold text-ink">
          {titulo}
        </h2>
        <p className="mt-1.5 max-w-prose text-pretty text-body text-ink-60">{bajada}</p>
        <div className="mt-5">{children}</div>
      </div>

      <aside className="order-1 flex flex-col gap-6 lg:order-2 lg:sticky lg:top-6">
        <ColumnaVideo video={video} />
        {lateral}
      </aside>
    </section>
  );
}

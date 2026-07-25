import {
  IconoTelefono,
  IconoUbicacion,
  IconoReloj,
  IconoPremio,
} from "@/components/iconos";
import type { Lubricentro } from "@/lib/cliente/landing";

// El marco de confianza: quién es este lubricentro y cómo se lo encuentra.
// Va al pie porque es respaldo, no tarea — la única tarea de la pantalla
// es buscar. El programa de premios va acá mismo, discreto: es un motivo
// para volver, no un llamado a la acción que compita con el buscador.
export function PieConfianza({ lubricentro }: { lubricentro: Lubricentro }) {
  const { telefono, direccion, horarios } = lubricentro.contacto;
  const { premio } = lubricentro;

  const datos = [
    telefono && {
      Icono: IconoTelefono,
      texto: telefono,
      href: `tel:${telefono.replace(/\s/g, "")}`,
    },
    direccion && { Icono: IconoUbicacion, texto: direccion, href: null },
    horarios && { Icono: IconoReloj, texto: horarios, href: null },
  ].filter(Boolean) as {
    Icono: typeof IconoTelefono;
    texto: string;
    href: string | null;
  }[];

  if (datos.length === 0 && !premio) return null;

  return (
    <footer className="border-t border-line px-5 py-8 sm:px-8 sm:py-10 lg:py-8">
      <div className="mx-auto w-full max-w-md sm:max-w-xl lg:max-w-5xl">
        {premio && (
          <p className="flex items-center justify-center gap-2 text-center text-c-body text-ink-60">
            <IconoPremio aria-hidden className="size-6 shrink-0 text-tenant" />
            <span>
              Cada {premio.metaServices} services,{" "}
              <span className="text-ink">{premio.descripcion.toLowerCase()}</span>
            </span>
          </p>
        )}

        {datos.length > 0 && (
          <ul
            className={`grid gap-4 text-c-body text-ink-60 lg:grid-cols-3 lg:gap-6 ${
              premio ? "mt-6 sm:mt-8" : ""
            }`}
          >
            {datos.map(({ Icono, texto, href }) => (
              <li
                key={texto}
                className="flex items-start justify-center gap-2 text-center lg:items-center"
              >
                <Icono aria-hidden className="mt-0.5 size-6 shrink-0 text-tenant lg:mt-0" />
                {href ? (
                  <a href={href} className="underline underline-offset-4">
                    {texto}
                  </a>
                ) : (
                  <span>{texto}</span>
                )}
              </li>
            ))}
          </ul>
        )}
      </div>
    </footer>
  );
}

import {
  IconoTelefono,
  IconoUbicacion,
  IconoReloj,
  IconoPremio,
} from "@/components/iconos";
import type { Lubricentro, SucursalPublica } from "@/lib/cliente/landing";

// El marco de confianza: quién es este lubricentro y dónde se lo
// encuentra. Va al pie porque es respaldo, no tarea.
//
// La división de responsabilidades: los locales (dirección, teléfono,
// horarios) salen de las SUCURSALES activas — dónde voy. El WhatsApp y
// las redes salen de datos_contacto — cómo escribo. Antes todo venía de
// datos_contacto y se rompía en cuanto había dos sucursales.
function Sucursal({ sucursal, sola }: { sucursal: SucursalPublica; sola: boolean }) {
  const filas = [
    sucursal.direccion && { Icono: IconoUbicacion, texto: sucursal.direccion, href: null },
    sucursal.telefono && {
      Icono: IconoTelefono,
      texto: sucursal.telefono,
      href: `tel:${sucursal.telefono.replace(/\s/g, "")}`,
    },
    sucursal.horarios && { Icono: IconoReloj, texto: sucursal.horarios, href: null },
  ].filter(Boolean) as {
    Icono: typeof IconoUbicacion;
    texto: string;
    href: string | null;
  }[];

  return (
    <li className="flex flex-col items-center gap-1.5 text-center">
      {/* Con una sola sucursal el nombre es ruido: es "el" local. */}
      {!sola && (
        <p className="font-bold text-ink">{sucursal.nombre}</p>
      )}
      {filas.map(({ Icono, texto, href }) => (
        <p key={texto} className="flex items-start justify-center gap-2 text-c-body text-ink-60">
          <Icono aria-hidden className="mt-0.5 size-6 shrink-0 text-tenant" />
          {href ? (
            <a href={href} className="underline underline-offset-4 tabular-nums">
              {texto}
            </a>
          ) : (
            <span className="tabular-nums">{texto}</span>
          )}
        </p>
      ))}
    </li>
  );
}

function urlRed(base: string, valor: string): string {
  if (/^https?:\/\//.test(valor)) return valor;
  return `${base}/${valor.replace(/^@/, "")}`;
}

export function PieConfianza({ lubricentro }: { lubricentro: Lubricentro }) {
  const { premio, sucursales } = lubricentro;
  const { instagram, facebook } = lubricentro.contacto;

  const redes = [
    instagram && { nombre: "Instagram", url: urlRed("https://instagram.com", instagram) },
    facebook && { nombre: "Facebook", url: urlRed("https://facebook.com", facebook) },
  ].filter(Boolean) as { nombre: string; url: string }[];

  if (sucursales.length === 0 && !premio && redes.length === 0) return null;

  return (
    <footer className="border-t border-line px-5 py-8 sm:px-8 sm:py-10 lg:py-8">
      <div className="mx-auto w-full max-w-md sm:max-w-xl lg:max-w-5xl">
        {premio && (
          <p className="flex items-center justify-center gap-2 text-center text-c-body text-ink-60">
            <IconoPremio aria-hidden className="size-6 shrink-0 text-tenant" />
            <span>
              Cada {premio.metaServices}{" "}
              {premio.alcance === "todos" ? "trabajos" : "services"},{" "}
              <span className="text-ink">{premio.descripcion.toLowerCase()}</span>
            </span>
          </p>
        )}

        {sucursales.length > 0 && (
          <ul
            className={`grid gap-6 lg:gap-8 ${
              sucursales.length > 1 ? "sm:grid-cols-2 lg:grid-cols-[repeat(auto-fit,minmax(0,20rem))] lg:justify-center" : ""
            } ${premio ? "mt-6 sm:mt-8" : ""}`}
          >
            {sucursales.map((s) => (
              <Sucursal key={s.nombre} sucursal={s} sola={sucursales.length === 1} />
            ))}
          </ul>
        )}

        {redes.length > 0 && (
          <p className="mt-6 flex justify-center gap-5 text-c-body text-ink-60 sm:mt-8">
            {redes.map((r) => (
              <a
                key={r.nombre}
                href={r.url}
                target="_blank"
                rel="noopener noreferrer"
                className="underline underline-offset-4"
              >
                {r.nombre}
              </a>
            ))}
          </p>
        )}
      </div>
    </footer>
  );
}

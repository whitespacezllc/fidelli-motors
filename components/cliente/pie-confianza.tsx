import {
  IconoTelefono,
  IconoUbicacion,
  IconoReloj,
  IconoPremio,
  IconoWhatsapp,
} from "@/components/iconos";
import { telefonoWhatsapp } from "@/lib/contacto";
import { URL_PRIVACIDAD } from "@/lib/legal";
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

  // El WhatsApp del taller. El encabezado de este archivo ya decía que
  // "el WhatsApp y las redes salen de datos_contacto — cómo escribo",
  // pero solo se renderizaban las redes: el número estaba cargado y no
  // se veía en ningún lado de la vidriera. Solo aparecía en el cartón,
  // o sea recién DESPUÉS de escribir una patente.
  //
  // Importa más de lo que parece para un tenant suspendido: su página
  // sigue viva a propósito (regla 8), y lo único que tiene que poder
  // hacer el cliente final es llegar igual a su taller. Un `tel:` lo
  // resuelve a medias — acá se escribe por WhatsApp.
  const whatsapp = lubricentro.contacto.whatsapp
    ? telefonoWhatsapp(lubricentro.contacto.whatsapp)
    : null;

  const redes = [
    instagram && { nombre: "Instagram", url: urlRed("https://instagram.com", instagram) },
    facebook && { nombre: "Facebook", url: urlRed("https://facebook.com", facebook) },
  ].filter(Boolean) as { nombre: string; url: string }[];

  const conDatos =
    sucursales.length > 0 || !!premio || redes.length > 0 || !!whatsapp;

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

        {whatsapp && (
          <p className={`flex justify-center ${sucursales.length > 0 || premio ? "mt-6 sm:mt-8" : ""}`}>
            <a
              href={`https://wa.me/${whatsapp}`}
              target="_blank"
              rel="noopener noreferrer"
              // 44px de área táctil: el cliente final puede tener 60 años
              // y estar parado al lado del auto. Y en el color del tenant,
              // nunca el rojo de marca: esta superficie es del lubricentro.
              className="inline-flex h-11 items-center gap-2 rounded-md border border-tenant px-4 text-c-body font-bold text-tenant"
            >
              <IconoWhatsapp aria-hidden className="size-5 shrink-0" />
              Escribinos por WhatsApp
            </a>
          </p>
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

        {/* La única mención de Fidelli en toda la página del cliente: una
            línea, tinta terciaria, 12px. De quién es la página y quién
            provee la tecnología —lo que la sección 8 de los Términos
            promete— con el enlace a la Política de Privacidad en NUESTRO
            dominio. Sin el rojo de marca, ni un píxel: esta superficie es
            del lubricentro, y hasta el subrayado va en la tinta de la
            página. Se muestra siempre, también cuando el pie no tiene
            sucursales, premio ni contacto que mostrar. */}
        <p
          className={`text-center text-label text-ink-40 ${conDatos ? "mt-8 sm:mt-10" : ""}`}
        >
          Esta página es de {lubricentro.nombre}. Fidelli Motors provee la
          tecnología
          <span aria-hidden> · </span>
          <a
            href={URL_PRIVACIDAD}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex min-h-11 items-center underline underline-offset-4 hover:text-ink-60"
          >
            Privacidad
          </a>
        </p>
      </div>
    </footer>
  );
}

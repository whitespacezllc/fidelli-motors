import { IconoWhatsapp } from "@/components/iconos";
import { formatearPatente } from "@/lib/texto";
import type { Lubricentro } from "@/lib/cliente/landing";

// Que la patente no aparezca NO es un error: es un lead. El vacío se
// convierte en una conversación comercial para el lubricentro, así que el
// mensaje nombra las dos causas posibles —está mal escrita, o es la primera
// visita— y ofrece el WhatsApp con el texto ya armado.
//
// Ni rojo de marca ni tono de error: el borde y el fondo son del tenant.
export function PatenteNoEncontrada({
  patente,
  lubricentro,
}: {
  patente: string;
  lubricentro: Lubricentro;
}) {
  const formateada = formatearPatente(patente);
  const whatsapp = lubricentro.contacto.whatsapp?.replace(/\D/g, "");

  const mensaje = encodeURIComponent(
    `Hola! Escaneé el QR y busqué la patente ${formateada}, pero no la encontré. ¿Me ayudan?`,
  );

  return (
    <section
      aria-live="polite"
      className="rounded-lg border border-tenant bg-tenant-soft p-5 sm:p-6"
    >
      <h2 className="text-c-lead font-bold sm:text-c-titulo">
        No encontramos esa patente
      </h2>
      <p className="mt-2 text-c-body text-ink-60">
        Verificá que <span className="plate text-ink">{formateada}</span> esté
        bien escrita — o si es tu primera visita, tu historial se crea con tu
        primer service en {lubricentro.nombre}.
      </p>

      {whatsapp && (
        <a
          href={`https://wa.me/${whatsapp}?text=${mensaje}`}
          target="_blank"
          rel="noopener noreferrer"
          // 18px y no 22 como el botón de buscar: en un celular de 375 el
          // texto no entra en una línea al lado del ícono, y buscar sigue
          // siendo la acción principal de la pantalla.
          className="mt-5 flex min-h-16 w-full items-center justify-center gap-2 rounded-md border-2 border-tenant bg-base px-4 py-3 text-c-body font-bold text-tenant transition-colors hover:bg-tenant-soft"
        >
          <IconoWhatsapp aria-hidden className="size-6 shrink-0" />
          Escribinos por WhatsApp
        </a>
      )}
    </section>
  );
}

// Un manifest POR SUPERFICIE, no uno solo para todo el sitio.
//
// Con un único manifest —el de `app/manifest.ts`, que Next enlaza en todas
// las páginas— el `start_url` es siempre "/", así que "agregar a la pantalla
// de inicio" desde cualquier lado terminaba abriendo la landing comercial.
// El lubricentro que se guarda el acceso quiere SU PANEL, y el cliente que
// escanea el QR quiere el cartón de su auto.
//
// Cada superficie declara el suyo con `metadata.manifest` (Next reemplaza
// el del layout raíz, no lo duplica) y lo sirve un route handler. El `id`
// es lo que hace que el navegador las trate como aplicaciones distintas y
// se puedan tener varias instaladas a la vez.

// Lo que declara una superficie para ser instalable con identidad propia.
// Se usa desde el `metadata` de cada layout/página: `manifest` reemplaza al
// del layout raíz (Next lo pisa, no lo duplica).
export function metadataPwa(manifest: string, titulo: string) {
  return {
    manifest,
    appleWebApp: { capable: true, title: titulo },
    // Next emite el `mobile-web-app-capable` estándar, que Safari entiende
    // recién desde iOS 16.4. Abajo de esa versión solo vale el de Apple, y
    // sin él el acceso directo abre con la barra del navegador en vez de
    // como app. El cliente que escanea el QR puede tener un teléfono viejo,
    // así que se emiten los dos.
    other: { "apple-mobile-web-app-capable": "yes" },
  };
}

export type ManifestPwa = {
  id: string;
  name: string;
  short_name: string;
  description?: string;
  start_url: string;
  scope: string;
  display: "standalone";
  background_color: string;
  theme_color: string;
  icons: { src: string; sizes: string; type?: string }[];
};

// Los dos PNG del isotipo de marca, generados desde app/icon.svg.
export const ICONOS_MARCA = [
  { src: "/icon-192.png", sizes: "192x192", type: "image/png" },
  { src: "/icon-512.png", sizes: "512x512", type: "image/png" },
];

// El manifest se pide sin cookies y cambia poco: una hora de caché alcanza
// y evita una consulta por visita. La app ya instalada no se re-lee en cada
// apertura, así que un cambio de marca tarda un rato en verse igual.
export function respuestaManifest(manifest: ManifestPwa): Response {
  return new Response(JSON.stringify(manifest), {
    headers: {
      "content-type": "application/manifest+json; charset=utf-8",
      "cache-control": "public, max-age=3600",
    },
  });
}

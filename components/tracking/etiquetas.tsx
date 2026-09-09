import Script from "next/script";
import { ADS_ID, GA4_ID, PIXEL_META_ID } from "@/lib/analitica";

// Las etiquetas de terceros, montadas desde el layout raíz y solo con
// `analiticaActiva` (lib/analitica.ts).
//
// LAS DOS CARGAN DESPUÉS DE LA HIDRATACIÓN (`afterInteractive`, la
// estrategia diferida de next/script): ningún script de terceros toca el
// hilo principal antes del primer pintado, que es lo que CLAUDE.md pide
// para todo lo que no es la página. Son los mismos snippets que dan Google
// y Meta, con los IDs sacados de lib/analitica.ts en vez de pegados a mano.

/**
 * La etiqueta de Google: UNA sola carga de gtag.js —con el ID de GA4, la
 * librería es la misma para todos los productos— y dos `config`: la
 * propiedad de GA4 y la cuenta de Google Ads. Con eso, un solo `gtag('event')`
 * puede ir a GA4 (`whatsapp_click`) o a Ads (`conversion`) según su
 * `send_to`. Los eventos del clic están en lib/tracking/eventos.ts.
 */
export function EtiquetaGoogle() {
  return (
    <>
      <Script id="gtag-init" strategy="afterInteractive">
        {`window.dataLayer = window.dataLayer || [];
function gtag(){dataLayer.push(arguments);}
gtag('js', new Date());
gtag('config', '${GA4_ID}');
gtag('config', '${ADS_ID}');`}
      </Script>
      <Script
        id="gtag-js"
        src={`https://www.googletagmanager.com/gtag/js?id=${GA4_ID}`}
        strategy="afterInteractive"
      />
    </>
  );
}

/**
 * El código base del Píxel de Meta, tal cual lo entrega Meta: define `fbq`
 * con su cola, carga fbevents.js asíncrono, inicializa el conjunto de datos
 * y manda el PageView de la carga. Los PageView de las navegaciones
 * internas los manda components/tracking/tracking.tsx, porque Next no
 * recarga la página.
 */
export function PixelMeta() {
  return (
    <Script id="meta-pixel" strategy="afterInteractive">
      {`!function(f,b,e,v,n,t,s)
{if(f.fbq)return;n=f.fbq=function(){n.callMethod?
n.callMethod.apply(n,arguments):n.queue.push(arguments)};
if(!f._fbq)f._fbq=n;n.push=n;n.loaded=!0;n.version='2.0';
n.queue=[];t=b.createElement(e);t.async=!0;
t.src=v;s=b.getElementsByTagName(e)[0];
s.parentNode.insertBefore(t,s)}(window, document,'script',
'https://connect.facebook.net/en_US/fbevents.js');
fbq('init', '${PIXEL_META_ID}');
fbq('track', 'PageView');`}
    </Script>
  );
}

/**
 * El <noscript> del Píxel, como lo pide Meta: es lo único que registra una
 * visita cuando el visitante tiene JavaScript apagado. Con JS activo el
 * navegador ni lo pide — el contenido de un <noscript> no se descarga.
 */
export function PixelMetaSinJs() {
  return (
    <noscript>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        height="1"
        width="1"
        style={{ display: "none" }}
        alt=""
        src={`https://www.facebook.com/tr?id=${PIXEL_META_ID}&ev=PageView&noscript=1`}
      />
    </noscript>
  );
}

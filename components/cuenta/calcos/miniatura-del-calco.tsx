"use client";

import { useEffect, useRef, useState } from "react";

// ============================================================
// La miniatura del diseño, a 5 × 8 cm.
//
// Sale por la TRANSFORMACIÓN de Storage (ancho 400), no cargando el archivo:
// un diseño pesa hasta 10 MB y acá se ve a 5 centímetros. La URL firmada de
// transformación la arma el servidor (la página); este componente solo
// existe por el RESPALDO: si la transformación no contesta —el proyecto no
// la tiene habilitada, el servicio de imágenes está caído—, se muestra el
// archivo original. Un calco que no se ve es peor que uno que tarda.
//
// El `onError` no alcanza: la imagen llega dibujada desde el servidor y
// puede fallar ANTES de que React enganche el manejador. Por eso al montar
// se mira también si ya falló.
// ============================================================
export function MiniaturaDelCalco({
  miniatura,
  original,
  alt,
}: {
  /** La URL firmada con la transformación. Null si no se pudo firmar. */
  miniatura: string | null;
  /** La URL firmada del archivo entero: el respaldo. */
  original: string;
  alt: string;
}) {
  const [src, setSrc] = useState(miniatura ?? original);
  const ref = useRef<HTMLImageElement>(null);

  useEffect(() => {
    const img = ref.current;
    if (img && img.complete && img.naturalWidth === 0 && src !== original) {
      // Falló antes de la hidratación: no hay evento que escuchar.
      setSrc(original);
    }
  }, [src, original]);

  return (
    // <img> y no next/image: la URL es firmada, de un bucket privado y vence
    // en una hora. El optimizador de Next la bajaría y la volvería a servir
    // desde su propia caché.
    // eslint-disable-next-line @next/next/no-img-element
    <img
      ref={ref}
      src={src}
      alt={alt}
      onError={() => {
        if (src !== original) setSrc(original);
      }}
      className="h-full w-full object-cover"
    />
  );
}

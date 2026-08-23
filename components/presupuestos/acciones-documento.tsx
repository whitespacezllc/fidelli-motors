"use client";

import { useRef, useState } from "react";
import { toPng } from "html-to-image";
import { Boton } from "@/components/ui/boton";
import { IconoWhatsapp } from "@/components/iconos";

// Las tres salidas del papel: imprimir, WhatsApp y seguir trabajando
// (editar / duplicar). El COMPARTIR es la clave del bloque: el mecánico
// toca un botón EN EL CELULAR y aparece WhatsApp con el archivo listo.
//
// El mecanismo: el documento (el nodo real que se ve en pantalla) se
// serializa a PNG a 2x con html-to-image y se entrega vía Web Share API
// con archivo — en el celular eso abre la hoja de compartir del sistema
// con WhatsApp ahí mismo, sin computadora, sin enlace público y sin
// exponer una superficie nueva con nombre y teléfono de una persona: la
// imagen viaja por el WhatsApp del lubricentro, como cualquier foto.
// Donde no hay Web Share con archivos (desktop), se descarga el PNG.
export function AccionesDocumento({ numero }: { numero: number }) {
  const [ocupado, setOcupado] = useState(false);
  const [aviso, setAviso] = useState<string | null>(null);
  const enCurso = useRef(false);

  async function compartir() {
    if (enCurso.current) return;
    enCurso.current = true;
    setOcupado(true);
    setAviso(null);
    try {
      const nodo = document.getElementById("documento-presupuesto");
      if (!nodo) throw new Error("sin nodo");

      const png = await toPng(nodo, {
        pixelRatio: 2,
        backgroundColor: "#ffffff",
        cacheBust: true,
      });
      const blob = await (await fetch(png)).blob();
      const archivo = new File([blob], `presupuesto-${numero}.png`, {
        type: "image/png",
      });

      if (navigator.canShare?.({ files: [archivo] })) {
        await navigator.share({
          files: [archivo],
          title: `Presupuesto N° ${numero}`,
        });
      } else {
        // Desktop: se descarga y se manda desde WhatsApp Web como
        // cualquier imagen. El botón no miente: avisa qué pasó.
        const enlace = document.createElement("a");
        enlace.href = png;
        enlace.download = `presupuesto-${numero}.png`;
        enlace.click();
        setAviso(
          "Imagen descargada. Desde el celular, este mismo botón abre WhatsApp directo.",
        );
      }
    } catch (e) {
      // Cancelar la hoja de compartir no es un error.
      if ((e as Error).name !== "AbortError") {
        setAviso("No se pudo generar la imagen. Probá de nuevo.");
      }
    } finally {
      enCurso.current = false;
      setOcupado(false);
    }
  }

  return (
    <div className="print:hidden">
      <div className="flex flex-wrap items-center gap-2.5">
        <Boton onClick={compartir} disabled={ocupado} className="min-w-[210px]">
          <IconoWhatsapp aria-hidden className="mr-1.5 size-4" />
          {ocupado ? "Preparando…" : "Mandar por WhatsApp"}
        </Boton>
        <Boton variante="secundario" onClick={() => window.print()}>
          Imprimir
        </Boton>
      </div>
      {aviso && <p className="mt-2 text-ui text-ink-60">{aviso}</p>}
    </div>
  );
}

"use client";

import { useRef, useState } from "react";
import { Boton } from "@/components/ui/boton";
import { IconoDescargar, IconoImprimir } from "@/components/iconos";
import type { DatosDocumento } from "./documento-presupuesto";
import { generarPdfPresupuesto } from "./generar-pdf";

// Las dos salidas del papel: el PDF que se guarda y se manda por donde
// sea —WhatsApp incluido, como cualquier archivo— y la impresora.
// Reemplazan al viejo "Mandar por WhatsApp" (rasterizaba el documento con
// html-to-image y lo pasaba por la hoja de compartir del sistema): esa
// cadena dependía del navegador de cada teléfono y en la práctica se
// colgaba al serializar el DOM. El PDF se dibuja con jsPDF a partir de los
// datos —ver generar-pdf.ts—, así que sale igual en cualquier dispositivo.
export function AccionesDocumento({ datos }: { datos: DatosDocumento }) {
  const [ocupado, setOcupado] = useState(false);
  const [aviso, setAviso] = useState<string | null>(null);
  const enCurso = useRef(false);

  async function descargarPdf() {
    if (enCurso.current) return;
    enCurso.current = true;
    setOcupado(true);
    setAviso(null);
    try {
      await generarPdfPresupuesto(datos);
    } catch {
      setAviso("No se pudo armar el PDF. Probá de nuevo.");
    } finally {
      enCurso.current = false;
      setOcupado(false);
    }
  }

  return (
    <div className="print:hidden">
      <div className="flex flex-wrap items-center gap-2.5">
        <Boton onClick={descargarPdf} disabled={ocupado} className="min-w-[190px]">
          <IconoDescargar aria-hidden className="mr-1.5 size-4" />
          {ocupado ? "Preparando…" : "Descargar en PDF"}
        </Boton>
        <Boton variante="secundario" onClick={() => window.print()}>
          <IconoImprimir aria-hidden className="mr-1.5 size-4" />
          Imprimir
        </Boton>
      </div>
      {aviso && <p className="mt-2 text-ui text-ink-60">{aviso}</p>}
    </div>
  );
}

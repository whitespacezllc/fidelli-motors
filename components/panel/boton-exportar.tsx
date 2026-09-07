"use client";

import { useRef, useState } from "react";
import { clasesBoton } from "@/components/ui/boton";
import { IconoDescargar } from "@/components/iconos";
import { Toast, type AvisoToast } from "@/components/ui/toast";
import { CABECERA_ARCHIVO, CABECERA_FILAS, MIME_XLSX } from "@/lib/exportar/cabeceras";

// ============================================================
// El botón "Exportar" de las solapas del panel.
//
// Uno solo para Clientes, Productos y Trabajos: misma posición, mismo
// componente. Exporta lo que la solapa muestra —si hay filtros activos,
// el botón lo dice con el conteo— y descarga un .xlsx que arma el
// servidor (ver app/panel/*/exportar/route.ts) con la sesión del usuario.
//
// Se descarga con fetch y no con un <a download>: así el botón sabe cuándo
// terminó, puede decir "Exportando…" mientras tanto y confirmar con el
// nombre del archivo y la cantidad de filas. El trabajo pesado corre en el
// servidor; acá solo se recibe el archivo y se le pasa al navegador.
// ============================================================

const NADA_PARA_EXPORTAR = "Nada para exportar";
const FALLO = "No se pudo exportar. Probá de nuevo.";

export function BotonExportar({
  url,
  cantidad,
  filtrando,
}: {
  /** La ruta de exportación, con los mismos filtros que la solapa. */
  url: string;
  /** Filas que la solapa muestra con los filtros actuales. */
  cantidad: number;
  /** Con filtros activos el botón muestra el conteo. */
  filtrando: boolean;
}) {
  const [ocupado, setOcupado] = useState(false);
  const [aviso, setAviso] = useState<AvisoToast | null>(null);
  const [motivoVisible, setMotivoVisible] = useState(false);
  const enCurso = useRef(false);

  // Con cero filas no se genera un archivo vacío. Apagado y con el motivo:
  // en title para el mouse y al tocarlo para el táctil, donde no hay hover.
  if (cantidad === 0) {
    return (
      <span className="inline-flex flex-col items-end gap-1">
        <button
          type="button"
          aria-disabled="true"
          title={NADA_PARA_EXPORTAR}
          onClick={() => setMotivoVisible((v) => !v)}
          className={`${clasesBoton("secundario", "md")} cursor-not-allowed opacity-60`}
        >
          <IconoDescargar aria-hidden className="size-4 shrink-0" />
          Exportar
        </button>
        {motivoVisible && (
          <span role="status" className="text-label text-ink-60">
            {NADA_PARA_EXPORTAR}
          </span>
        )}
      </span>
    );
  }

  async function exportar() {
    if (enCurso.current) return;
    enCurso.current = true;
    setOcupado(true);
    setAviso(null);
    try {
      const respuesta = await fetch(url, {
        credentials: "same-origin",
        headers: { Accept: MIME_XLSX },
      });
      if (!respuesta.ok) throw new Error(`Exportación rechazada: ${respuesta.status}`);

      const archivo = respuesta.headers.get(CABECERA_ARCHIVO) ?? "exportacion.xlsx";
      const filas = Number(respuesta.headers.get(CABECERA_FILAS) ?? cantidad);
      descargar(await respuesta.blob(), archivo);

      setAviso({
        tipo: "ok",
        texto: `Se descargó ${archivo} (${filas.toLocaleString("es-AR")} ${filas === 1 ? "fila" : "filas"})`,
      });
    } catch {
      setAviso({ tipo: "error", texto: FALLO });
    } finally {
      enCurso.current = false;
      setOcupado(false);
    }
  }

  const etiqueta = ocupado
    ? "Exportando…"
    : filtrando
      ? `Exportar (${cantidad.toLocaleString("es-AR")})`
      : "Exportar";

  return (
    <>
      <button
        type="button"
        onClick={exportar}
        disabled={ocupado}
        aria-busy={ocupado}
        // Ancho mínimo para que "Exportando…" no mueva el botón de al lado.
        className={`${clasesBoton("secundario", "md")} min-w-[8.75rem]`}
      >
        <IconoDescargar aria-hidden className="size-4 shrink-0" />
        <span className="tabular-nums">{etiqueta}</span>
      </button>
      {aviso && <Toast aviso={aviso} alCerrar={() => setAviso(null)} />}
    </>
  );
}

// Le entrega el archivo al navegador como una descarga común: un <a> con
// download sobre un object URL, un click, y se libera la URL después.
function descargar(contenido: Blob, archivo: string) {
  const href = URL.createObjectURL(contenido);
  const enlace = document.createElement("a");
  enlace.href = href;
  enlace.download = archivo;
  document.body.appendChild(enlace);
  enlace.click();
  enlace.remove();
  setTimeout(() => URL.revokeObjectURL(href), 10_000);
}

"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { Dialog, DialogTrigger, DialogContenido } from "@/components/ui/dialog";
import { Boton, clasesBoton } from "@/components/ui/boton";
import {
  CLASE_AYUDA,
  CLASE_CAMPO,
  CLASE_ERROR,
  CLASE_LABEL,
} from "@/components/fidelli/estilos";
import { prepararSubidaDiseno, registrarDiseno } from "@/app/fidelli/calcos/actions";

const SIN_CONEXION =
  "Se cortó la conexión a internet. No cierres esta pantalla: el archivo sigue elegido. Cuando vuelva la señal, tocá Subir diseño de nuevo.";

// ============================================================
// Subir una versión nueva del diseño del calco.
//
// El archivo NO pasa por una Server Action (hasta 10 MB no entra en un
// request a Vercel): el servidor entrega una URL firmada de subida, el
// navegador manda el archivo directo al bucket privado `calcos`, y el
// servidor valida los bytes de lo que llegó antes de registrar la versión.
// Ver app/fidelli/calcos/actions.ts.
// ============================================================
export function SubirDiseno({
  lubricentroId,
  nombre,
}: {
  lubricentroId: string;
  nombre: string;
}) {
  const router = useRouter();
  const [abierto, setAbierto] = useState(false);
  const [subiendo, setSubiendo] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function subir(evento: React.FormEvent<HTMLFormElement>) {
    evento.preventDefault();
    const formData = new FormData(evento.currentTarget);
    const archivo = formData.get("archivo");
    if (!(archivo instanceof File) || archivo.size === 0) {
      setError("Elegí un archivo primero.");
      return;
    }

    setSubiendo(true);
    setError(null);
    try {
      const subida = await prepararSubidaDiseno({
        lubricentroId,
        tipo: archivo.type,
        tamano: archivo.size,
      });
      if ("error" in subida) {
        setError(subida.error);
        return;
      }

      const { error: errorSubida } = await createClient()
        .storage.from("calcos")
        .uploadToSignedUrl(subida.ruta, subida.token, archivo, { contentType: archivo.type });
      if (errorSubida) {
        setError("No se pudo subir el archivo. Revisá la conexión y probá de nuevo.");
        return;
      }

      const registro = await registrarDiseno({
        lubricentroId,
        ruta: subida.ruta,
        nota: String(formData.get("nota") ?? ""),
      });
      if (registro.error) {
        setError(registro.error);
        return;
      }

      setAbierto(false);
      router.refresh();
    } catch {
      setError(SIN_CONEXION);
    } finally {
      setSubiendo(false);
    }
  }

  return (
    <Dialog
      open={abierto}
      onOpenChange={(v) => {
        setAbierto(v);
        if (!v) setError(null);
      }}
    >
      <DialogTrigger className={`${clasesBoton("secundario", "md")} shrink-0 whitespace-nowrap`}>
        Subir diseño
      </DialogTrigger>

      <DialogContenido titulo={`Diseño del calco de ${nombre}`}>
        <form onSubmit={subir} className="flex flex-col gap-4">
          {error && (
            <p role="alert" className={CLASE_ERROR}>
              {error}
            </p>
          )}

          <div>
            <label htmlFor="diseno-archivo" className={CLASE_LABEL}>
              Archivo
            </label>
            <input
              id="diseno-archivo"
              name="archivo"
              type="file"
              required
              accept="image/png,application/pdf"
              className="block w-full text-ui text-ink file:mr-3 file:h-11 file:cursor-pointer file:rounded-md file:border file:border-solid file:border-line file:bg-base file:px-4 file:text-ui file:font-semibold file:text-ink"
            />
            <p className={CLASE_AYUDA}>
              PNG o PDF, hasta 10 MB. A 300 dpi, 5 × 8 cm. Queda como la versión actual: es la
              que ve el lubricentro y la que se imprime. Las anteriores no se borran.
            </p>
          </div>

          <div>
            <label htmlFor="diseno-nota" className={CLASE_LABEL}>
              Nota <span className="text-ink-40 normal-case">(opcional)</span>
            </label>
            <input
              id="diseno-nota"
              name="nota"
              placeholder="Con el logo nuevo, fondo más oscuro…"
              className={CLASE_CAMPO}
            />
          </div>

          <Boton type="submit" tam="lg" disabled={subiendo} className="mt-1 w-full">
            {subiendo ? "Subiendo…" : "Subir diseño"}
          </Boton>
        </form>
      </DialogContenido>
    </Dialog>
  );
}

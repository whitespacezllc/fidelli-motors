"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { Dialog, DialogTrigger, DialogContenido } from "@/components/ui/dialog";
import { Boton, clasesBoton } from "@/components/ui/boton";
import { IconoPdf } from "@/components/iconos";
import { formatearFecha } from "@/lib/fechas";
import {
  ADJUNTOS_MAXIMO,
  ADJUNTO_MAX_BYTES,
  MENSAJE_FORMATO,
  MENSAJE_TOPE,
  esImagen,
  mensajePesoExcedido,
  nombreDeFoto,
  pesoLegible,
} from "@/lib/adjuntos";
import { achicarFoto } from "@/lib/adjuntos-navegador";
import {
  mostrarAdjuntoAlCliente,
  prepararSubidaAdjunto,
  quitarAdjunto,
  registrarAdjunto,
} from "@/app/panel/(tras-onboarding)/services/[serviceId]/actions";

export type AdjuntoDelTrabajo = {
  id: string;
  nombre: string;
  mime: string;
  bytes: number;
  /** created_at: cuándo se subió. */
  creado: string;
  visibleCliente: boolean;
  /** URL firmada, armada en el servidor con la sesión del owner. null si
   *  Storage no contestó: el adjunto se lista igual, sin enlace. */
  url: string | null;
};

const SIN_CONEXION =
  "Se cortó la conexión a internet. No cierres esta pantalla: cuando vuelva la señal, elegí el archivo de nuevo.";

// ============================================================
// Los adjuntos de un trabajo: el PDF del escaneo o la foto del diagnóstico.
//
// ADJUNTAR NO EDITA EL CARTÓN. Por eso esta sección está siempre, también
// en un trabajo fijado hace un año: lo que se fija es el papel, y un
// adjunto no está en el papel.
//
// El archivo NO pasa por una Server Action: el servidor entrega una URL
// firmada de subida, el navegador manda el archivo directo al bucket
// privado `adjuntos`, y el servidor valida los bytes de lo que llegó antes
// de registrarlo. Las fotos se achican ACÁ, antes de pedir la URL. Ver
// app/panel/(tras-onboarding)/services/[serviceId]/actions.ts.
// ============================================================
export function AdjuntosTrabajo({
  serviceId,
  adjuntos,
  soloLectura = false,
  anulado = false,
  resaltar = false,
}: {
  serviceId: string;
  adjuntos: AdjuntoDelTrabajo[];
  /** El lubricentro está suspendido: lee, pero no escribe. */
  soloLectura?: boolean;
  /** El trabajo está anulado: el cliente no lo ve, tampoco sus adjuntos. */
  anulado?: boolean;
  /** Se llegó desde «Adjuntar el diagnóstico» del guardado: la sección se
   *  trae a la vista y el foco queda en el botón. */
  resaltar?: boolean;
}) {
  const router = useRouter();
  const seccion = useRef<HTMLElement>(null);
  const boton = useRef<HTMLButtonElement>(null);
  const campo = useRef<HTMLInputElement>(null);
  const [paso, setPaso] = useState<"achicando" | "subiendo" | null>(null);
  const [error, setError] = useState<string | null>(null);
  // Lo que el usuario acaba de tocar, mientras el servidor contesta: el
  // interruptor responde al dedo, no al viaje de ida y vuelta.
  const [tocados, setTocados] = useState<Record<string, boolean>>({});

  const lleno = adjuntos.length >= ADJUNTOS_MAXIMO;
  const ocupado = paso !== null;

  useEffect(() => {
    if (!resaltar) return;
    seccion.current?.scrollIntoView({ block: "start" });
    boton.current?.focus({ preventScroll: true });
  }, [resaltar]);

  async function adjuntar(evento: React.ChangeEvent<HTMLInputElement>) {
    const archivo = evento.target.files?.[0];
    // Se vacía el campo: elegir dos veces el mismo archivo tiene que
    // volver a disparar el cambio.
    evento.target.value = "";
    if (!archivo) return;

    setError(null);
    try {
      let cuerpo: Blob = archivo;
      let nombre = archivo.name;
      let mime: string;

      if (archivo.type.startsWith("image/")) {
        setPaso("achicando");
        const foto = await achicarFoto(archivo);
        if (!foto) {
          setError("No pudimos leer esa foto. Probá con otra, o sacala de nuevo.");
          return;
        }
        cuerpo = foto;
        nombre = nombreDeFoto(archivo.name);
        mime = "image/jpeg";
      } else if (
        archivo.type === "application/pdf" ||
        archivo.name.toLowerCase().endsWith(".pdf")
      ) {
        mime = "application/pdf";
      } else {
        setError(MENSAJE_FORMATO);
        return;
      }

      // Un PDF no se puede achicar acá: si pasa los 2 MB se dice antes de
      // subir, con lo que pesa.
      if (cuerpo.size > ADJUNTO_MAX_BYTES) {
        setError(mensajePesoExcedido(cuerpo.size));
        return;
      }

      setPaso("subiendo");
      const subida = await prepararSubidaAdjunto({ serviceId, mime, bytes: cuerpo.size });
      if ("error" in subida) {
        setError(subida.error);
        return;
      }

      const { error: errorSubida } = await createClient()
        .storage.from("adjuntos")
        .uploadToSignedUrl(subida.ruta, subida.token, cuerpo, { contentType: mime });
      if (errorSubida) {
        setError("No se pudo subir el archivo. Revisá la conexión y probá de nuevo.");
        return;
      }

      const registro = await registrarAdjunto({ serviceId, ruta: subida.ruta, nombre });
      if (registro.error) {
        setError(registro.error);
        return;
      }

      router.refresh();
    } catch {
      setError(SIN_CONEXION);
    } finally {
      setPaso(null);
    }
  }

  async function mostrar(adjunto: AdjuntoDelTrabajo, visible: boolean) {
    setError(null);
    setTocados((previo) => ({ ...previo, [adjunto.id]: visible }));
    try {
      const resultado = await mostrarAdjuntoAlCliente(adjunto.id, visible);
      if (resultado.error) {
        setTocados((previo) => ({ ...previo, [adjunto.id]: !visible }));
        setError(resultado.error);
        return;
      }
      router.refresh();
    } catch {
      setTocados((previo) => ({ ...previo, [adjunto.id]: !visible }));
      setError(SIN_CONEXION);
    }
  }

  return (
    <section
      ref={seccion}
      id="adjuntos"
      aria-labelledby="adjuntos-titulo"
      className="surface-card scroll-mt-4 p-4 sm:p-5"
    >
      <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-2.5">
        <h2 id="adjuntos-titulo" className="font-brand text-body font-bold text-ink">
          Adjuntos
          {adjuntos.length > 0 && (
            <span className="ml-2 font-ui text-ui font-normal text-ink-60 tabular-nums">
              {adjuntos.length} de {ADJUNTOS_MAXIMO}
            </span>
          )}
        </h2>
        {!soloLectura && (
          <>
            {/* A lo ancho en el celular; desde tablet, ancho fijo: el texto
                cambia mientras sube y el botón no puede saltar. */}
            <button
              ref={boton}
              type="button"
              onClick={() => campo.current?.click()}
              disabled={ocupado || lleno}
              className={`${clasesBoton("secundario", "md")} w-full whitespace-nowrap sm:w-auto sm:min-w-[12.5rem]`}
            >
              {paso === "achicando"
                ? "Achicando la foto…"
                : paso === "subiendo"
                  ? "Subiendo…"
                  : "+ Adjuntar PDF o foto"}
            </button>
            {/* Sin `capture`: en el celular el sistema ofrece la cámara, la
                galería y los archivos, y el mecánico elige. */}
            <input
              ref={campo}
              type="file"
              accept="application/pdf,image/*"
              onChange={adjuntar}
              aria-label="Adjuntar PDF o foto"
              className="sr-only"
              tabIndex={-1}
            />
          </>
        )}
      </div>

      {error && (
        <p role="alert" className="mt-3 rounded-md bg-overdue-soft px-3.5 py-3 text-ui text-overdue">
          {error}
        </p>
      )}
      {!soloLectura && lleno && !error && (
        <p className="mt-3 text-ui text-ink-60">{MENSAJE_TOPE}</p>
      )}

      {adjuntos.length === 0 ? (
        <p className="mt-3 text-ui text-ink-60">
          Todavía no hay archivos. Sumá el PDF del escaneo o una foto del
          diagnóstico: hasta {ADJUNTOS_MAXIMO} por trabajo, de 2 MB cada uno.
          Las fotos se achican solas antes de subir.
        </p>
      ) : (
        <ul className="mt-3 overflow-hidden rounded-md border border-line">
          {adjuntos.map((adjunto) => {
            const visible = tocados[adjunto.id] ?? adjunto.visibleCliente;
            return (
              <li
                key={adjunto.id}
                data-adjunto={adjunto.id}
                className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1 border-t border-line px-3 py-2.5 first:border-t-0"
              >
                <Archivo adjunto={adjunto} />

                {!soloLectura && (
                  <div className="flex items-center gap-1">
                    <button
                      type="button"
                      role="switch"
                      aria-checked={visible}
                      aria-label={`Mostrar al cliente: ${adjunto.nombre}`}
                      onClick={() => mostrar(adjunto, !visible)}
                      className="flex min-h-11 items-center gap-2 text-ui text-ink-60"
                    >
                      Mostrar al cliente
                      <span
                        className={`flex h-6 w-10 shrink-0 items-center rounded-full p-0.5 transition-colors ${
                          visible ? "bg-ink" : "bg-line"
                        }`}
                      >
                        <span
                          className={`size-5 rounded-full bg-base shadow-sm transition-transform ${
                            visible ? "translate-x-4" : "translate-x-0"
                          }`}
                        />
                      </span>
                    </button>
                    <QuitarAdjunto adjunto={adjunto} alQuitar={() => router.refresh()} />
                  </div>
                )}
              </li>
            );
          })}
        </ul>
      )}

      <p className="mt-3 text-label text-ink-60">
        {anulado
          ? "Este trabajo está anulado: el cliente no lo ve, y sus adjuntos tampoco."
          : "Un adjunto con «Mostrar al cliente» prendido aparece en su historial como «Diagnóstico adjunto». Apagado, solo lo ve el taller."}
      </p>
    </section>
  );
}

// El archivo: su miniatura si es una foto, su nombre —que lo abre en una
// pestaña nueva— y, debajo, cuánto pesa y cuándo se subió.
function Archivo({ adjunto }: { adjunto: AdjuntoDelTrabajo }) {
  const detalle = `${pesoLegible(adjunto.bytes)} · ${formatearFecha(adjunto.creado)}`;
  const miniatura =
    esImagen(adjunto.mime) && adjunto.url ? (
      // Una URL firmada de Storage: next/image no puede optimizarla (cambia
      // en cada carga) y la foto ya viene achicada.
      // eslint-disable-next-line @next/next/no-img-element
      <img
        src={adjunto.url}
        alt=""
        loading="lazy"
        className="size-11 shrink-0 rounded-sm border border-line object-cover"
      />
    ) : (
      <span className="flex size-11 shrink-0 items-center justify-center rounded-sm border border-line bg-surface text-ink-60">
        <IconoPdf aria-hidden className="size-6" />
      </span>
    );

  const texto = (
    <span className="min-w-0">
      <span
        title={adjunto.nombre}
        className="block truncate text-ui font-semibold text-ink underline-offset-4 group-hover:underline"
      >
        {adjunto.nombre}
      </span>
      <span className="block text-label text-ink-60 tabular-nums">{detalle}</span>
    </span>
  );

  // basis-44: lo mínimo que ocupa el archivo antes de mandar los
  // controles al renglón de abajo. En el celular bajan; en una pantalla
  // ancha quedan a la derecha, en la misma línea.
  const clases = "flex min-h-11 min-w-0 flex-1 basis-44 items-center gap-3";
  return adjunto.url ? (
    <a
      href={adjunto.url}
      target="_blank"
      rel="noopener noreferrer"
      className={`group ${clases}`}
    >
      {miniatura}
      {texto}
    </a>
  ) : (
    <span className={clases}>
      {miniatura}
      {texto}
    </span>
  );
}

// Quitar es la excepción escrita a «acá no se borra nada»: lo que se va es
// un archivo, no el registro del trabajo. Igual se confirma: no hay
// papelera.
function QuitarAdjunto({
  adjunto,
  alQuitar,
}: {
  adjunto: AdjuntoDelTrabajo;
  alQuitar: () => void;
}) {
  const [abierto, setAbierto] = useState(false);
  const [quitando, setQuitando] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function confirmar() {
    setQuitando(true);
    setError(null);
    try {
      const resultado = await quitarAdjunto(adjunto.id);
      if (resultado.error) {
        setError(resultado.error);
        return;
      }
      setAbierto(false);
      alQuitar();
    } catch {
      setError("Se cortó la conexión a internet. Cuando vuelva la señal, probá de nuevo.");
    } finally {
      setQuitando(false);
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
      <DialogTrigger
        aria-label={`Quitar ${adjunto.nombre}`}
        className="flex min-h-11 items-center px-2 text-ui font-semibold text-ink-60 underline underline-offset-4 hover:text-ink"
      >
        Quitar
      </DialogTrigger>
      <DialogContenido titulo="¿Quitar este adjunto?">
        <p className="text-ui text-ink-60">
          Vas a quitar{" "}
          <span className="font-semibold break-words text-ink">{adjunto.nombre}</span>. El
          archivo se borra
          {adjunto.visibleCliente ? " y el cliente deja de verlo en su historial" : ""}. El
          trabajo y su cartón no cambian.
        </p>

        {error && (
          <p role="alert" className="mt-4 rounded-md bg-overdue-soft px-3.5 py-3 text-ui text-overdue">
            {error}
          </p>
        )}

        <div className="mt-5 flex gap-2.5">
          <Boton
            variante="secundario"
            className="flex-1"
            onClick={() => setAbierto(false)}
            disabled={quitando}
          >
            Volver
          </Boton>
          {/* Primario porque acá adentro ES la acción; el ancho fijo evita
              el salto de layout al pasar a "Quitando…". */}
          <Boton className="flex-1" onClick={confirmar} disabled={quitando}>
            {quitando ? "Quitando…" : "Sí, quitar"}
          </Boton>
        </div>
      </DialogContenido>
    </Dialog>
  );
}

"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { Boton, clasesBoton } from "@/components/ui/boton";
import { IconoPdf } from "@/components/iconos";
import { formatearFecha } from "@/lib/fechas";
import { formatearPesos } from "@/lib/presupuestos";
import { MEDIOS_PAGO, ETIQUETA_MEDIO, parsearMonto, type MedioPago } from "@/lib/finanzas";
import {
  COMPROBANTE_MAX_BYTES,
  conceptoSugerido,
  fechaSugerida,
  montoSugerido,
  type ComprobanteExtraido,
} from "@/lib/comprobantes";
import { MENSAJE_FORMATO, mensajePesoExcedido, nombreDeFoto } from "@/lib/adjuntos";
import { achicarFoto } from "@/lib/adjuntos-navegador";
import {
  confirmarComprobante,
  descartarComprobante,
  prepararSubidaComprobante,
  registrarComprobante,
  urlComprobante,
} from "@/app/panel/(tras-onboarding)/finanzas/comprobantes/actions";

type Sucursal = { id: string; nombre: string };
type Pendiente = { id: string; nombre: string; creado: string; extraido: ComprobanteExtraido };
type EnRevision = { id: string; nombre: string; extraido: ComprobanteExtraido; leido: boolean };

const SIN_CONEXION =
  "Se cortó la conexión a internet. No cierres esta pantalla: cuando vuelva la señal, elegí el archivo de nuevo.";
const CLASE_CAMPO =
  "h-12 w-full rounded-md border border-line bg-base px-3.5 text-body text-ink placeholder:text-ink-40";
const CLASE_LABEL =
  "mb-1.5 block text-label font-semibold tracking-[0.06em] text-ink-60 uppercase";

// ============================================================
// Cargar un egreso desde la foto o el PDF de una factura de proveedor.
//
// El archivo NO pasa por una Server Action: el servidor firma la URL de
// subida, el navegador sube directo al bucket privado `comprobantes`, y el
// servidor valida los bytes y LEE el comprobante con IA. Las fotos se
// achican acá antes de subir. Después la IA PROPONE y el dueño CONFIRMA:
// nunca se guarda solo.
// ============================================================
export function PanelComprobantes({
  sucursales,
  sucursalInicial,
  hoy,
  pendientes,
}: {
  sucursales: Sucursal[];
  sucursalInicial: string;
  hoy: string;
  pendientes: Pendiente[];
}) {
  const router = useRouter();
  const campo = useRef<HTMLInputElement>(null);
  const [paso, setPaso] = useState<"achicando" | "subiendo" | "leyendo" | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [arrastrando, setArrastrando] = useState(false);
  const [revisando, setRevisando] = useState<EnRevision | null>(null);

  const ocupado = paso !== null;

  async function tomar(archivo: File | undefined | null) {
    if (!archivo || ocupado) return;
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
      } else if (archivo.type === "application/pdf" || archivo.name.toLowerCase().endsWith(".pdf")) {
        mime = "application/pdf";
      } else {
        setError(MENSAJE_FORMATO);
        return;
      }

      if (cuerpo.size > COMPROBANTE_MAX_BYTES) {
        setError(mensajePesoExcedido(cuerpo.size));
        return;
      }

      setPaso("subiendo");
      const subida = await prepararSubidaComprobante({ mime, bytes: cuerpo.size });
      if ("error" in subida) {
        setError(subida.error);
        return;
      }

      const { error: errorSubida } = await createClient()
        .storage.from("comprobantes")
        .uploadToSignedUrl(subida.ruta, subida.token, cuerpo, { contentType: mime });
      if (errorSubida) {
        setError("No se pudo subir el archivo. Revisá la conexión y probá de nuevo.");
        return;
      }

      setPaso("leyendo");
      const registro = await registrarComprobante({ ruta: subida.ruta, nombre });
      if ("error" in registro) {
        setError(registro.error);
        return;
      }

      setRevisando({
        id: registro.id,
        nombre,
        extraido: registro.extraido,
        leido: registro.leido,
      });
      router.refresh();
    } catch {
      setError(SIN_CONEXION);
    } finally {
      setPaso(null);
    }
  }

  // Pegar (Ctrl+V) una imagen o un PDF desde el portapapeles: el camino más
  // rápido en la compu, sin tocar el celular.
  function pegar(evento: React.ClipboardEvent) {
    const archivo = Array.from(evento.clipboardData.files)[0];
    if (archivo) {
      evento.preventDefault();
      void tomar(archivo);
    }
  }

  if (revisando) {
    return (
      <RevisarComprobante
        comprobante={revisando}
        sucursales={sucursales}
        sucursalInicial={sucursalInicial}
        hoy={hoy}
        onListo={() => {
          router.push("/panel/finanzas");
          router.refresh();
        }}
        onVolver={() => {
          setRevisando(null);
          router.refresh();
        }}
      />
    );
  }

  return (
    <div onPaste={pegar}>
      {/* La zona de subida: clic, arrastrar o pegar. */}
      <div
        onDragOver={(e) => {
          e.preventDefault();
          setArrastrando(true);
        }}
        onDragLeave={() => setArrastrando(false)}
        onDrop={(e) => {
          e.preventDefault();
          setArrastrando(false);
          void tomar(e.dataTransfer.files?.[0]);
        }}
        className={`flex flex-col items-center gap-3 rounded-lg border border-dashed px-6 py-10 text-center transition-colors ${
          arrastrando ? "border-brand bg-brand-soft" : "border-line bg-surface"
        }`}
      >
        <p className="text-ui text-ink-60">
          {paso === "achicando"
            ? "Achicando la foto…"
            : paso === "subiendo"
              ? "Subiendo…"
              : paso === "leyendo"
                ? "Leyendo el comprobante…"
                : "Arrastrá el archivo acá, pegalo (Ctrl+V), o elegilo. PDF o foto, hasta 2 MB."}
        </p>
        <button
          type="button"
          onClick={() => campo.current?.click()}
          disabled={ocupado}
          className={`${clasesBoton("primario", "md")} min-w-[12rem]`}
        >
          {ocupado ? "Procesando…" : "Elegir archivo"}
        </button>
        <input
          ref={campo}
          type="file"
          accept="application/pdf,image/*"
          onChange={(e) => {
            const archivo = e.target.files?.[0];
            e.target.value = "";
            void tomar(archivo);
          }}
          aria-label="Elegir comprobante"
          className="sr-only"
          tabIndex={-1}
        />
      </div>

      {error && (
        <p role="alert" className="mt-3 rounded-md bg-overdue-soft px-3.5 py-3 text-ui text-overdue">
          {error}
        </p>
      )}

      {pendientes.length > 0 && (
        <div className="mt-6">
          <h2 className="mb-2 text-label font-semibold tracking-[0.06em] text-ink-60 uppercase">
            Por revisar
          </h2>
          <ul className="surface-card overflow-hidden">
            {pendientes.map((p) => (
              <FilaPendiente
                key={p.id}
                pendiente={p}
                onRevisar={() =>
                  setRevisando({ id: p.id, nombre: p.nombre, extraido: p.extraido, leido: true })
                }
              />
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}

function FilaPendiente({
  pendiente,
  onRevisar,
}: {
  pendiente: Pendiente;
  onRevisar: () => void;
}) {
  const router = useRouter();
  const [descartando, setDescartando] = useState(false);
  const titulo = conceptoSugerido(pendiente.extraido) || pendiente.nombre;

  async function descartar() {
    setDescartando(true);
    try {
      await descartarComprobante(pendiente.id, "Descartado desde la bandeja");
      router.refresh();
    } finally {
      setDescartando(false);
    }
  }

  return (
    <li className="flex flex-wrap items-center gap-x-3 gap-y-2 border-b border-line px-4 py-3 last:border-b-0">
      <span className="flex size-9 shrink-0 items-center justify-center rounded-sm border border-line bg-surface text-ink-60">
        <IconoPdf aria-hidden className="size-5" />
      </span>
      <span className="min-w-0 flex-1 basis-40">
        <span className="block truncate text-ui font-semibold text-ink">{titulo}</span>
        <span className="block text-label text-ink-60 tabular-nums">
          {pendiente.extraido.total != null ? `${formatearPesos(pendiente.extraido.total)} · ` : ""}
          {formatearFecha(pendiente.creado)}
        </span>
      </span>
      <div className="ml-auto flex items-center gap-2">
        <button
          type="button"
          onClick={descartar}
          disabled={descartando}
          className="min-h-11 px-2 text-ui font-semibold text-ink-60 underline underline-offset-4 hover:text-ink"
        >
          {descartando ? "…" : "Descartar"}
        </button>
        <button type="button" onClick={onRevisar} className={clasesBoton("secundario", "md")}>
          Revisar
        </button>
      </div>
    </li>
  );
}

function RevisarComprobante({
  comprobante,
  sucursales,
  sucursalInicial,
  hoy,
  onListo,
  onVolver,
}: {
  comprobante: EnRevision;
  sucursales: Sucursal[];
  sucursalInicial: string;
  hoy: string;
  onListo: () => void;
  onVolver: () => void;
}) {
  const e = comprobante.extraido;
  const [sucursalId, setSucursalId] = useState(sucursalInicial);
  const [fecha, setFecha] = useState(fechaSugerida(e, hoy));
  const [concepto, setConcepto] = useState(conceptoSugerido(e));
  const [monto, setMonto] = useState(() => {
    const m = montoSugerido(e);
    return m != null ? m.toLocaleString("es-AR") : "";
  });
  const [medio, setMedio] = useState<MedioPago>("efectivo");
  const [guardando, setGuardando] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const listo = concepto.trim().length >= 2 && monto.trim() !== "" && parsearMonto(monto) >= 0;

  async function confirmar() {
    setGuardando(true);
    setError(null);
    try {
      const r = await confirmarComprobante({
        id: comprobante.id,
        sucursalId,
        fecha,
        monto: parsearMonto(monto),
        concepto,
        medio,
      });
      if (r.error) {
        setError(r.error);
        return;
      }
      onListo();
    } catch {
      setError(SIN_CONEXION);
    } finally {
      setGuardando(false);
    }
  }

  async function ver() {
    const r = await urlComprobante(comprobante.id);
    if (r.url) window.open(r.url, "_blank", "noopener,noreferrer");
  }

  return (
    <div className="flex flex-col gap-4">
      {!comprobante.leido && (
        <p className="rounded-md border border-line bg-surface px-3.5 py-3 text-ui text-ink">
          No pudimos leer este comprobante automáticamente. Completá los datos a
          mano; el archivo quedó guardado.
        </p>
      )}

      {/* Lo que leímos: referencia, no se edita acá. */}
      {comprobante.leido && (
        <div className="surface-card px-5 py-4">
          <div className="mb-2 flex items-center justify-between gap-3">
            <p className="text-label font-semibold tracking-[0.06em] text-ink-60 uppercase">
              Lo que leímos
            </p>
            <button
              type="button"
              onClick={ver}
              className="text-ui font-semibold text-ink-60 underline underline-offset-4 hover:text-ink"
            >
              Ver el archivo
            </button>
          </div>
          <dl className="grid grid-cols-2 gap-x-4 gap-y-1.5 text-ui sm:grid-cols-3">
            <Dato rotulo="Proveedor" valor={e.razon_social} className="col-span-2 sm:col-span-3" />
            <Dato rotulo="CUIT" valor={e.cuit} />
            <Dato rotulo="Comprobante" valor={[e.tipo, e.numero].filter(Boolean).join(" ") || null} />
            <Dato rotulo="Neto" valor={e.neto != null ? formatearPesos(e.neto) : null} />
            <Dato rotulo="IVA" valor={e.iva != null ? formatearPesos(e.iva) : null} />
            <Dato rotulo="Total" valor={e.total != null ? formatearPesos(e.total) : null} />
          </dl>
          {e.advertencias.length > 0 && (
            <p className="mt-3 text-label text-overdue">
              Revisá: {e.advertencias.join(" · ")}
            </p>
          )}
        </div>
      )}

      {/* El egreso que se va a registrar: prellenado, editable. */}
      <div className="flex flex-col gap-4">
        <div>
          <label htmlFor="c-concepto" className={CLASE_LABEL}>
            Qué salió
          </label>
          <input
            id="c-concepto"
            value={concepto}
            onChange={(ev) => setConcepto(ev.target.value)}
            placeholder="Proveedor, compra…"
            className={CLASE_CAMPO}
          />
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <label htmlFor="c-monto" className={CLASE_LABEL}>
              Monto
            </label>
            <input
              id="c-monto"
              inputMode="decimal"
              value={monto}
              onChange={(ev) => setMonto(ev.target.value)}
              placeholder="0"
              className={`${CLASE_CAMPO} tabular-nums`}
            />
          </div>
          <div>
            <label htmlFor="c-fecha" className={CLASE_LABEL}>
              Fecha
            </label>
            <input
              id="c-fecha"
              type="date"
              value={fecha}
              onChange={(ev) => setFecha(ev.target.value)}
              className={`${CLASE_CAMPO} tabular-nums`}
            />
          </div>
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <label htmlFor="c-medio" className={CLASE_LABEL}>
              Cómo se pagó
            </label>
            <select
              id="c-medio"
              value={medio}
              onChange={(ev) => setMedio(ev.target.value as MedioPago)}
              className={CLASE_CAMPO}
            >
              {MEDIOS_PAGO.map((m) => (
                <option key={m} value={m}>
                  {ETIQUETA_MEDIO[m]}
                </option>
              ))}
            </select>
          </div>
          {sucursales.length > 1 && (
            <div>
              <label htmlFor="c-sucursal" className={CLASE_LABEL}>
                Sucursal
              </label>
              <select
                id="c-sucursal"
                value={sucursalId}
                onChange={(ev) => setSucursalId(ev.target.value)}
                className={CLASE_CAMPO}
              >
                {sucursales.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.nombre}
                  </option>
                ))}
              </select>
            </div>
          )}
        </div>
      </div>

      {error && (
        <p role="alert" className="rounded-md bg-overdue-soft px-3.5 py-3 text-ui text-overdue">
          {error}
        </p>
      )}

      <div className="flex gap-2.5">
        <Boton variante="secundario" className="flex-1" onClick={onVolver} disabled={guardando}>
          Volver
        </Boton>
        <Boton className="flex-1" onClick={confirmar} disabled={guardando || !listo}>
          {guardando ? "Guardando…" : "Confirmar egreso"}
        </Boton>
      </div>
    </div>
  );
}

function Dato({
  rotulo,
  valor,
  className = "",
}: {
  rotulo: string;
  valor: string | null;
  className?: string;
}) {
  return (
    <div className={className}>
      <dt className="text-label text-ink-60">{rotulo}</dt>
      <dd className="truncate font-semibold text-ink tabular-nums">{valor ?? "—"}</dd>
    </div>
  );
}

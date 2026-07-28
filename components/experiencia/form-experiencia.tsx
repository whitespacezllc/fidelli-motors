"use client";

import { useActionState, useState } from "react";
import Link from "next/link";
import { Boton } from "@/components/ui/boton";
import { luminancia, paletaTenant } from "@/lib/cliente/color";
import {
  guardarExperiencia,
  type EstadoExperiencia,
} from "@/app/panel/experiencia/actions";

const ESTADO_INICIAL: EstadoExperiencia = {};

const CLASE_CAMPO =
  "h-12 w-full rounded-md border border-line bg-base px-3.5 text-body text-ink placeholder:text-ink-40";
const CLASE_LABEL =
  "mb-1.5 block text-label font-semibold tracking-[0.06em] text-ink-60 uppercase";

const HEX = /^#[0-9A-Fa-f]{6}$/;

// Los cuatro toggles, en el idioma de Bruno: cada uno dice qué pasa si
// lo apaga, no cómo se llama la columna.
const CAMPOS_VISIBLES = [
  {
    clave: "mostrar_productos",
    titulo: "Marcas de productos",
    detalle:
      "Tus clientes ven qué marca de aceite y filtros usás. Si lo apagás, ven que se hizo el cambio pero no la marca.",
  },
  {
    clave: "mostrar_sucursal",
    titulo: "Sucursal de cada service",
    detalle: "Tus clientes ven en qué local se hizo cada service.",
  },
  {
    clave: "mostrar_fidelizacion",
    titulo: "Progreso del premio",
    detalle: "Tus clientes ven su progreso hacia el próximo premio.",
  },
  {
    clave: "mostrar_observaciones",
    titulo: "Observaciones del service",
    detalle:
      "Tus clientes ven las notas que escribís en cada service. Viene apagado: suelen ser notas internas del taller.",
  },
] as const;

export type ConfigExperiencia = {
  colorPrimario: string;
  camposVisibles: Record<string, boolean>;
  whatsapp: string;
  instagram: string;
  facebook: string;
};

function AvisoContraste({ hex }: { hex: string }) {
  if (!HEX.test(hex)) return null;
  const luz = luminancia(hex);
  const paleta = paletaTenant(hex);

  // No se bloquea nada: es la marca del lubri y la elige él. Pero lo que
  // va a pasar con el texto se dice antes, no después.
  let aviso: string | null = null;
  if (luz > 0.82) {
    aviso =
      "Ese color es muy claro: los botones casi no se van a distinguir del fondo blanco, y el texto sobre ellos va a ser negro.";
  } else if (luz > 0.45) {
    aviso = "Con este color, el texto sobre los botones va a ser negro para que se lea.";
  } else if (luz < 0.02) {
    aviso =
      "Ese color es muy oscuro: los botones se van a ver casi negros, igual que el texto de la página.";
  }

  return (
    <div className="mt-2.5 flex flex-wrap items-center gap-3">
      {/* La muestra dice más que el aviso: así va a verse el botón. */}
      <span
        className="inline-flex h-10 items-center rounded-md px-4 text-ui font-bold"
        style={{ backgroundColor: paleta.primary, color: paleta.ink }}
      >
        Ver mi historial
      </span>
      {aviso && <span className="flex-1 basis-52 text-ui text-urgente">{aviso}</span>}
    </div>
  );
}

export function FormExperiencia({ config }: { config: ConfigExperiencia }) {
  const [estado, accion, guardando] = useActionState(
    guardarExperiencia,
    ESTADO_INICIAL,
  );
  const [color, setColor] = useState(config.colorPrimario);

  const colorValido = HEX.test(color);

  return (
    <form action={accion} className="flex flex-col gap-6">
      {estado.error && (
        <p role="alert" className="rounded-md bg-overdue-soft px-3.5 py-3 text-ui text-overdue">
          {estado.error}
        </p>
      )}
      {estado.ok && (
        <p className="rounded-md bg-success-soft px-3.5 py-3 text-ui text-success">
          Guardado. Así lo ve tu cliente ahora — mirá la vista previa.
        </p>
      )}

      {/* ---------- El color ---------- */}
      <section>
        <h2 className="mb-3 font-brand text-body font-bold text-ink">Tu color</h2>
        <div className="flex flex-wrap items-center gap-3">
          <input
            type="color"
            value={colorValido ? color : "#0A0A0A"}
            onChange={(e) => setColor(e.target.value.toUpperCase())}
            aria-label="Elegir color"
            className="h-12 w-16 shrink-0 cursor-pointer rounded-md border border-line bg-base p-1"
          />
          <div className="w-36">
            <input
              name="color"
              value={color}
              onChange={(e) => {
                const v = e.target.value.trim();
                setColor(v.startsWith("#") || v === "" ? v.toUpperCase() : `#${v.toUpperCase()}`);
              }}
              aria-label="Código hex del color"
              className={`${CLASE_CAMPO} plate text-center`}
            />
          </div>
          <span className="text-label text-ink-60">
            Si tenés manual de marca, pegá el código acá.
          </span>
        </div>
        <AvisoContraste hex={color} />
      </section>

      {/* ---------- Qué ve el cliente ---------- */}
      <section>
        <h2 className="mb-1 font-brand text-body font-bold text-ink">
          Qué ve tu cliente en su cartón
        </h2>
        <p className="mb-3 text-ui text-ink-60">
          Todo lo que apagues deja de verse al instante en la página pública.
        </p>
        <ul className="flex flex-col overflow-hidden rounded-lg border border-line">
          {CAMPOS_VISIBLES.map((campo) => (
            <li key={campo.clave} className="border-b border-line last:border-b-0">
              <label className="flex cursor-pointer items-start gap-3 px-4 py-3">
                <input
                  type="checkbox"
                  name={campo.clave}
                  defaultChecked={config.camposVisibles[campo.clave] ?? campo.clave !== "mostrar_observaciones"}
                  className="mt-0.5 size-5 shrink-0 cursor-pointer accent-ink"
                />
                <span className="min-w-0">
                  <span className="block text-body font-semibold text-ink">
                    {campo.titulo}
                  </span>
                  <span className="block text-ui text-ink-60">{campo.detalle}</span>
                </span>
              </label>
            </li>
          ))}
        </ul>
      </section>

      {/* ---------- El contacto de la marca ---------- */}
      <section>
        <h2 className="mb-1 font-brand text-body font-bold text-ink">
          Contacto de tu marca
        </h2>
        <p className="mb-3 text-ui text-ink-60">
          El WhatsApp es el número al que te escriben tus clientes para pedir
          turno. Las direcciones y horarios de tus locales se editan en{" "}
          <Link
            href="/panel/sucursales"
            className="font-semibold text-ink underline underline-offset-4"
          >
            Sucursales
          </Link>
          .
        </p>
        <div className="flex flex-col gap-4">
          <div>
            <label htmlFor="whatsapp" className={CLASE_LABEL}>
              WhatsApp
            </label>
            <input
              id="whatsapp"
              name="whatsapp"
              type="tel"
              inputMode="tel"
              defaultValue={config.whatsapp}
              className={`${CLASE_CAMPO} tabular-nums`}
            />
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <label htmlFor="instagram" className={CLASE_LABEL}>
                Instagram <span className="text-ink-40 normal-case">(opcional)</span>
              </label>
              <input
                id="instagram"
                name="instagram"
                defaultValue={config.instagram}
                className={CLASE_CAMPO}
              />
            </div>
            <div>
              <label htmlFor="facebook" className={CLASE_LABEL}>
                Facebook <span className="text-ink-40 normal-case">(opcional)</span>
              </label>
              <input
                id="facebook"
                name="facebook"
                defaultValue={config.facebook}
                className={CLASE_CAMPO}
              />
            </div>
          </div>
        </div>
      </section>

      <Boton type="submit" tam="lg" disabled={guardando || !colorValido} className="sm:self-start">
        {guardando ? "Guardando…" : "Guardar cambios"}
      </Boton>
    </form>
  );
}

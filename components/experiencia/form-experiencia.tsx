"use client";

import { useActionState, useState } from "react";
import Link from "next/link";
import { Boton } from "@/components/ui/boton";
import { esTonoClaro, luminancia, paletaTenant } from "@/lib/cliente/color";
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
  /** "" = el blanco de siempre. */
  colorFondo: string;
  colorCarton: string;
  camposVisibles: Record<string, boolean>;
  whatsapp: string;
  instagram: string;
  facebook: string;
};

// Tonos curados para fondo y papel: todos claros (pasan la guarda de
// luminancia con margen). El picker libre existe igual — pero estos son
// el camino de una sola tocada.
const TONOS_FONDO = [
  { nombre: "Crema", hex: "#FAF3E3" },
  { nombre: "Arena", hex: "#F1EAE0" },
  { nombre: "Perla", hex: "#F4F4F5" },
  { nombre: "Celeste", hex: "#E9F1F7" },
  { nombre: "Verde suave", hex: "#EBF3EC" },
];

const TONOS_CARTON = [
  { nombre: "Papel crema", hex: "#FBF5E6" },
  { nombre: "Arena", hex: "#F1EAE0" },
  { nombre: "Perla", hex: "#F4F4F5" },
];

// El selector de un tono claro: Blanco + los curados + un picker libre.
// El estado vive acá y viaja en un input hidden; "" significa "blanco de
// siempre" y se guarda como null.
function SelectorTono({
  nombre,
  etiqueta,
  ayuda,
  tonos,
  valorInicial,
}: {
  nombre: string;
  etiqueta: string;
  ayuda: string;
  tonos: { nombre: string; hex: string }[];
  valorInicial: string;
}) {
  const [valor, setValor] = useState(valorInicial.toUpperCase());

  const esPreset =
    valor === "" || tonos.some((t) => t.hex.toUpperCase() === valor);
  const valorValido = valor === "" || HEX.test(valor);
  // La guarda de claridad: el texto de la landing es tinta oscura fija y
  // se lee al sol. La action rechaza igual — acá se avisa antes.
  const muyOscuro = valor !== "" && HEX.test(valor) && !esTonoClaro(valor);

  const claseChip = (activo: boolean) =>
    `flex min-h-11 items-center gap-2 rounded-md border px-3 text-ui transition-colors ${
      activo
        ? "border-ink font-semibold text-ink"
        : "border-line text-ink-60 hover:bg-surface"
    }`;

  return (
    <div>
      <p className="mb-1.5 text-label font-semibold tracking-[0.06em] text-ink-60 uppercase">
        {etiqueta}
      </p>
      <input type="hidden" name={nombre} value={valor} />
      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          onClick={() => setValor("")}
          aria-pressed={valor === ""}
          className={claseChip(valor === "")}
        >
          <span className="size-5 rounded-full border border-line bg-white" />
          Blanco
        </button>
        {tonos.map((t) => (
          <button
            key={t.hex}
            type="button"
            onClick={() => setValor(t.hex.toUpperCase())}
            aria-pressed={valor === t.hex.toUpperCase()}
            className={claseChip(valor === t.hex.toUpperCase())}
          >
            <span
              className="size-5 rounded-full border border-line"
              style={{ backgroundColor: t.hex }}
            />
            {t.nombre}
          </button>
        ))}
        {/* El tono libre: el picker nativo limitado por la misma guarda */}
        <label
          className={`${claseChip(!esPreset)} cursor-pointer`}
          title="Elegir otro tono"
        >
          <input
            type="color"
            value={valorValido && valor !== "" ? valor : "#FFFFFF"}
            onChange={(e) => setValor(e.target.value.toUpperCase())}
            className="size-5 cursor-pointer rounded-full border-0 bg-transparent p-0"
            aria-label={`Otro tono para ${etiqueta.toLowerCase()}`}
          />
          Otro…
        </label>
      </div>
      <p className="mt-1.5 text-label text-ink-60">{ayuda}</p>
      {muyOscuro && (
        <p className="mt-2 rounded-md bg-urgente-soft px-3.5 py-3 text-ui text-urgente">
          Ese tono es muy oscuro para acá: el texto de la página es oscuro y
          tu cliente la lee al sol. Elegí un tono claro — no se puede guardar
          uno oscuro.
        </p>
      )}
    </div>
  );
}

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

      {/* ---------- Los colores ---------- */}
      <section>
        <h2 className="mb-1 font-brand text-body font-bold text-ink">
          Los colores de tu página
        </h2>
        <p className="mb-3 text-ui text-ink-60">
          Tu color de marca pinta botones y detalles; el fondo y el papel del
          cartón son el ambiente. Mirá la vista previa al guardar.
        </p>
        <div className="flex flex-col gap-5">
          <div>
            <p className="mb-1.5 text-label font-semibold tracking-[0.06em] text-ink-60 uppercase">
              Color de tu marca
            </p>
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
          </div>

          <SelectorTono
            nombre="color_fondo"
            etiqueta="Fondo de la página"
            ayuda="El color detrás de todo, en tu página y en la del cartón."
            tonos={TONOS_FONDO}
            valorInicial={config.colorFondo}
          />

          <SelectorTono
            nombre="color_carton"
            etiqueta="Papel del cartón"
            ayuda="El color de la tarjeta que ve tu cliente — como elegir el papel."
            tonos={TONOS_CARTON}
            valorInicial={config.colorCarton}
          />
        </div>
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

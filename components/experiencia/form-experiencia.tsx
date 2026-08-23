"use client";

import { useActionState } from "react";
import Link from "next/link";
import { Boton } from "@/components/ui/boton";
import {
  contrasteWCAG,
  esTonoClaro,
  hexONull,
  luminancia,
  paletaTenant,
} from "@/lib/cliente/color";
import type { TamanoLogo, TemaCliente } from "@/lib/cliente/tema";
import type { BorradorExperiencia } from "@/components/experiencia/pantalla-experiencia";
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
  tema: TemaCliente;
  logoTamano: TamanoLogo;
  /** "" = sin mensaje. Solo lo edita Ultra (pagina_premium). */
  mensajeEscaneo: string;
  mensajeVigencia: string;
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
  valor,
  alCambiar,
}: {
  nombre: string;
  etiqueta: string;
  ayuda: string;
  tonos: { nombre: string; hex: string }[];
  valor: string;
  alCambiar: (v: string) => void;
}) {
  const setValor = alCambiar;

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

// LA GUARDA DE CONTRASTE. El lubricentro elige su color y también el
// modo — y un verde oscuro que se leía perfecto sobre blanco DESAPARECE
// sobre el grafito del modo oscuro. La razón WCAG se calcula contra el
// fondo del MODO ACTIVO del formulario, y la muestra se pinta sobre ese
// mismo fondo: el aviso se lee y se VE. Se avisa, nunca se corrige en
// silencio: es su marca y la decisión es suya.
function AvisoContraste({
  hex,
  tema,
  colorFondo,
}: {
  hex: string;
  tema: TemaCliente;
  colorFondo: string;
}) {
  if (!HEX.test(hex)) return null;
  const luz = luminancia(hex);
  const paleta = paletaTenant(hex, tema);

  const fondoActivo =
    tema === "oscuro" ? "#0A0A0A" : (hexONull(colorFondo) ?? "#FFFFFF");
  // 3:1 es el piso de WCAG para componentes de interfaz: por debajo, el
  // botón se funde con el fondo.
  const razon = contrasteWCAG(hex, fondoActivo);

  let aviso: string | null = null;
  if (razon < 3) {
    aviso =
      tema === "oscuro"
        ? "Ese color casi no se distingue del fondo oscuro: tus botones van a desaparecer. Es tu marca y la decisión es tuya — mirá la muestra y la vista previa."
        : "Ese color casi no se distingue del fondo de la página: tus botones van a desaparecer. Mirá la muestra y la vista previa.";
  } else if (luz > 0.45 && tema === "claro") {
    aviso = "Con este color, el texto sobre los botones va a ser negro para que se lea.";
  } else if (luz < 0.02 && tema === "claro") {
    aviso =
      "Ese color es muy oscuro: los botones se van a ver casi negros, igual que el texto de la página.";
  }

  return (
    <div className="mt-2.5 flex flex-wrap items-center gap-3">
      {/* La muestra dice más que el aviso: el botón SOBRE el fondo del
          modo elegido, no sobre el blanco del panel. */}
      <span
        className="inline-flex items-center rounded-md p-2"
        style={{ backgroundColor: fondoActivo }}
      >
        <span
          className="inline-flex h-10 items-center rounded-md px-4 text-ui font-bold"
          style={{ backgroundColor: paleta.primary, color: paleta.ink }}
        >
          Ver mi historial
        </span>
      </span>
      {aviso && <span className="flex-1 basis-52 text-ui text-urgente">{aviso}</span>}
    </div>
  );
}

export function FormExperiencia({
  config,
  borrador,
  alCambiar,
}: {
  config: ConfigExperiencia;
  borrador: BorradorExperiencia;
  alCambiar: (parcial: Partial<BorradorExperiencia>) => void;
}) {
  const [estado, accion, guardando] = useActionState(
    guardarExperiencia,
    ESTADO_INICIAL,
  );
  const color = borrador.color;
  const setColor = (v: string) => alCambiar({ color: v });

  const colorValido = HEX.test(color);

  return (
    <form action={accion} className="flex flex-col gap-6">
      {/* El modo y el tamaño viajan como el resto: FormData. */}
      <input type="hidden" name="tema" value={borrador.tema} />
      <input type="hidden" name="logo_tamano" value={borrador.logoTamano} />
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
            <AvisoContraste
              hex={color}
              tema={borrador.tema}
              colorFondo={borrador.colorFondo}
            />
          </div>

          {/* ---------- El modo ---------- */}
          <div>
            <p className="mb-1.5 text-label font-semibold tracking-[0.06em] text-ink-60 uppercase">
              Modo de tu página
            </p>
            <div className="flex flex-wrap gap-2" role="radiogroup" aria-label="Modo de tu página">
              {(
                [
                  ["claro", "Claro"],
                  ["oscuro", "Oscuro"],
                ] as const
              ).map(([valor, etiqueta]) => (
                <button
                  key={valor}
                  type="button"
                  role="radio"
                  aria-checked={borrador.tema === valor}
                  onClick={() => alCambiar({ tema: valor })}
                  className={`flex min-h-11 items-center gap-2 rounded-md border px-4 text-ui transition-colors ${
                    borrador.tema === valor
                      ? "border-ink font-semibold text-ink"
                      : "border-line text-ink-60 hover:bg-surface"
                  }`}
                >
                  <span
                    className="size-5 rounded-full border border-line"
                    style={{ backgroundColor: valor === "oscuro" ? "#0A0A0A" : "#FFFFFF" }}
                  />
                  {etiqueta}
                </button>
              ))}
            </div>
            <p className="mt-1.5 text-label text-ink-60">
              Lo ven así TODOS los que escanean, sin importar cómo tengan el
              celular. El cartón sigue siendo papel claro: es un recibo sobre
              el mostrador.
            </p>
          </div>

          {borrador.tema === "oscuro" ? (
            <p className="rounded-md bg-surface px-3.5 py-3 text-ui text-ink-60">
              En modo oscuro el fondo es el gris grafito del sistema. El tono
              de fondo que tenías queda guardado para cuando vuelvas a claro.
            </p>
          ) : (
            <SelectorTono
              nombre="color_fondo"
              etiqueta="Fondo de la página"
              ayuda="El color detrás de todo, en tu página y en la del cartón."
              tonos={TONOS_FONDO}
              valor={borrador.colorFondo}
              alCambiar={(v) => alCambiar({ colorFondo: v })}
            />
          )}
          {/* En oscuro el valor guardado sigue viajando: no se pierde. */}
          {borrador.tema === "oscuro" && (
            <input type="hidden" name="color_fondo" value={borrador.colorFondo} />
          )}

          <SelectorTono
            nombre="color_carton"
            etiqueta="Papel del cartón"
            ayuda="El color de la tarjeta que ve tu cliente — como elegir el papel."
            tonos={TONOS_CARTON}
            valor={borrador.colorCarton}
            alCambiar={(v) => alCambiar({ colorCarton: v })}
          />

          {/* ---------- El tamaño del logo ---------- */}
          <div>
            <p className="mb-1.5 text-label font-semibold tracking-[0.06em] text-ink-60 uppercase">
              Tamaño de tu logo
            </p>
            <div className="flex flex-wrap gap-2" role="radiogroup" aria-label="Tamaño de tu logo">
              {(
                [
                  ["normal", "Normal"],
                  ["grande", "Grande"],
                  ["xl", "Extra grande"],
                ] as const
              ).map(([valor, etiqueta]) => (
                <button
                  key={valor}
                  type="button"
                  role="radio"
                  aria-checked={borrador.logoTamano === valor}
                  onClick={() => alCambiar({ logoTamano: valor })}
                  className={`flex min-h-11 items-center rounded-md border px-4 text-ui transition-colors ${
                    borrador.logoTamano === valor
                      ? "border-ink font-semibold text-ink"
                      : "border-line text-ink-60 hover:bg-surface"
                  }`}
                >
                  {etiqueta}
                </button>
              ))}
            </div>
            <p className="mt-1.5 text-label text-ink-60">
              Vale para tu página y para la del cartón. Con cualquier tamaño,
              el buscador de patente queda a la vista — mirá la vista previa.
            </p>
          </div>
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

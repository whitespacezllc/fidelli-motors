"use client";

import { useEffect, useRef, useState } from "react";
import { Boton } from "@/components/ui/boton";
import {
  CampoPatente,
  MiniFicha,
  CabeceraCarton,
  CampoKilometros,
  SelectorViscosidad,
  SelectorProductoAceite,
  RenglonInterruptor,
} from "@/components/services/campos-carton";
import { PasosGuia, type EstadoPaso } from "@/components/landing/pasos-guia";
import { RENGLONES, formatearKm } from "@/lib/renglones";
import { formatearPatente, normalizarPatente } from "@/lib/texto";
import type { VehiculoIdentificado } from "@/app/panel/services/nuevo/actions";

// 03 · La simulación de carga — el visitante carga un service él mismo.
//
// LA REGLA QUE SOSTIENE TODO ESTO: los campos son los REALES del flujo de
// carga, importados de components/services/campos-carton.tsx — los mismos
// que renderiza el panel. Acá no hay una maqueta: si el formulario cambia,
// esta simulación cambia sola. Lo único propio de este archivo es la
// coreografía (pantallas, cronómetro, datos de ejemplo).
//
// SIN backend: no busca, no valida contra nada, no persiste. La "búsqueda"
// de la patente es un timeout que siempre encuentra el mismo Corsa de
// ejemplo — el punto no es la base de datos, es el gesto.
//
// EL FALLBACK ES EL ESTADO INICIAL, no un caso aparte: el componente se
// renderiza en el servidor con el formulario ya COMPLETO (modo "vitrina").
// Sin JavaScript, sin interacción o con cualquier falla, eso es lo que se
// ve: la carga terminada, nunca una pantalla vacía. "Probá cargar un service" es lo
// único que arranca el modo interactivo, y necesita JS por definición.

// El mismo vehículo demo que el resto de la landing: el Corsa de Pedro,
// con su último service en los números que muestran las capturas de las
// otras secciones. La patente que se muestra es la que escribió el
// visitante — el auto que "aparece" es siempre este.
const DEMO = {
  vehiculoId: "demo",
  marca: "Chevrolet",
  modelo: "Corsa",
  anio: 2011,
  clienteNombre: "Pedro Gómez",
  ultimoServiceFecha: "2026-06-13",
  ultimoServiceKm: 98450,
  ultimoServiceSucursal: "Casa Central",
  cantidadServices: 4,
  premioDisponible: false,
  premioDescripcion: null,
} satisfies Omit<VehiculoIdentificado, "patente">;

const ULTIMO_SERVICE = { fecha: "2026-06-13", kilometros: 98450 };

// Tres aceites, como un catálogo chico de verdad — los mismos productos
// del entorno demo que se ven en la captura de la ficha del cliente.
const ACEITES_DEMO = [
  { id: "shell-10w40", nombre: "Shell Helix HX7 10W40" },
  { id: "ypf-15w40", nombre: "YPF Elaion F50 15W40" },
  { id: "castrol-5w30", nombre: "Castrol Magnatec 5W30" },
];

const FILTROS = RENGLONES.filter((r) => r.grupo === "FILTROS");

// El estado "vitrina": el formulario completo que se ve sin interactuar.
const VITRINA = {
  patente: "ABC 123",
  km: "102300",
  aceiteTipo: "10W40",
  aceiteProductoId: "shell-10w40",
  marcados: { filtro_aceite: true, filtro_aire: true } as Record<string, boolean>,
};

type Pantalla = "patente" | "carton" | "exito";

function formatearTiempo(ms: number): string {
  const total = Math.max(0, Math.floor(ms / 1000));
  const m = Math.floor(total / 60);
  const s = String(total % 60).padStart(2, "0");
  return `${m}:${s}`;
}

export function SimuladorCarga() {
  // Arranca en vitrina SIEMPRE: es lo que renderiza el servidor, así que
  // también es lo que queda si el JS no llega. Sin salto de hidratación.
  const [vitrina, setVitrina] = useState(true);
  const [pantalla, setPantalla] = useState<Pantalla>("carton");

  const [patente, setPatente] = useState(VITRINA.patente);
  const [buscando, setBuscando] = useState(false);
  const [encontrado, setEncontrado] = useState(false);
  const [km, setKm] = useState(VITRINA.km);
  const [aceiteTipo, setAceiteTipo] = useState(VITRINA.aceiteTipo);
  const [aceiteProductoId, setAceiteProductoId] = useState(
    VITRINA.aceiteProductoId,
  );
  const [marcados, setMarcados] = useState(VITRINA.marcados);

  // El cronómetro: arranca al tocar el primer campo, para al confirmar.
  const [inicio, setInicio] = useState<number | null>(null);
  const [fin, setFin] = useState<number | null>(null);
  const [ahora, setAhora] = useState(0);

  const temporizador = useRef<ReturnType<typeof setTimeout> | null>(null);
  // La pantalla actual, para llevarle el foco en cada transición.
  const refPantalla = useRef<HTMLDivElement | null>(null);
  // El foco programático NO es un toque del visitante: no arma el reloj.
  const focoProgramatico = useRef(false);

  useEffect(() => {
    if (inicio === null || fin !== null) return;
    const intervalo = setInterval(() => setAhora(Date.now()), 500);
    return () => clearInterval(intervalo);
  }, [inicio, fin]);

  useEffect(() => () => {
    if (temporizador.current) clearTimeout(temporizador.current);
  }, []);

  // CADA TRANSICIÓN LLEVA EL FOCO A LA PANTALLA NUEVA. Sin esto, el botón
  // que se acaba de apretar ("Probá cargar un service", "Cargar service", "Confirmar
  // service", "Volver a empezar") se desmonta con el foco puesto, el foco
  // cae al <body> y el próximo Tab arranca desde el navbar. Y de paso
  // resuelve el anuncio para lectores de pantalla: enfocar el contenedor
  // hace que VoiceOver/NVDA lean la pantalla nueva — incluido el
  // "✓ Service guardado" y el tiempo, que son el remate de la sección.
  // Se enfoca el CONTENEDOR y no el primer input para que el teléfono no
  // abra el teclado sin que nadie lo haya pedido.
  useEffect(() => {
    if (vitrina) return;
    focoProgramatico.current = true;
    refPantalla.current?.focus();
    const liberar = setTimeout(() => {
      focoProgramatico.current = false;
    }, 0);
    return () => clearTimeout(liberar);
  }, [pantalla, vitrina]);

  // La "búsqueda" de la patente: debounce + un instante de esqueleto, el
  // mismo ritmo del flujo real. Con reduced-motion no se hace esperar a
  // nadie: la ficha aparece al toque.
  function alEscribirPatente(valor: string) {
    alTocar();
    const enMayusculas = valor.toUpperCase();
    setPatente(enMayusculas);
    setEncontrado(false);
    setBuscando(false);
    if (temporizador.current) clearTimeout(temporizador.current);
    if (normalizarPatente(enMayusculas).length < 6) return;

    const sinMovimiento = window.matchMedia(
      "(prefers-reduced-motion: reduce)",
    ).matches;
    if (sinMovimiento) {
      setEncontrado(true);
      return;
    }
    temporizador.current = setTimeout(() => {
      setBuscando(true);
      temporizador.current = setTimeout(() => {
        setBuscando(false);
        setEncontrado(true);
      }, 450);
    }, 300);
  }

  // Cualquier primer contacto con el formulario arma el cronómetro: un
  // foco que entra por teclado, un dedo en un chip o el primer carácter
  // tipeado valen igual — los handlers de los campos también la llaman,
  // por si algún entorno no entrega foco ni pointerdown.
  function alTocar() {
    if (focoProgramatico.current) {
      focoProgramatico.current = false;
      return;
    }
    if (!vitrina && inicio === null && pantalla !== "exito") {
      setInicio(Date.now());
      setAhora(Date.now());
    }
  }

  function empezar() {
    setVitrina(false);
    setPantalla("patente");
    setPatente("");
    setBuscando(false);
    setEncontrado(false);
    setKm("");
    setAceiteTipo("");
    setAceiteProductoId("");
    setMarcados({});
    setInicio(null);
    setFin(null);
  }

  function confirmar() {
    setFin(Date.now());
    setPantalla("exito");
  }

  const kmNum = Number(km.replace(/\D/g, ""));
  // Más estricto que el cartón real en UNA cosa: exige al menos un dígito
  // (kmNum > 0). En el panel el mecánico tipea con teclado numérico; acá
  // el visitante tiene teclado físico, y "asd" convertido a 0 habilitaba
  // confirmar y terminaba en un "· 0 km" en la pantalla de éxito.
  const kmCargado = Number.isFinite(kmNum) && kmNum > 0;
  // La misma condición del cartón real, sin el próximo service (que acá
  // no se elige): kilómetros y viscosidad.
  const listo = kmCargado && aceiteTipo.trim().length >= 2;

  const patenteLinda = formatearPatente(patente) || VITRINA.patente;
  const corriendo = inicio !== null && fin === null;
  const tiempoFinal = inicio !== null && fin !== null ? fin - inicio : 0;

  // ---------- Los tres pasos de la guía ----------
  //
  // DERIVADOS, no un estado aparte: salen de lo que la simulación ya sabe
  // —en qué pantalla está, si hay kilómetros, si hay viscosidad—, así que
  // no pueden desincronizarse del teléfono.
  //
  // En vitrina van los tres en pendiente y no en completado: nadie hizo
  // nada todavía. Además es lo que el servidor renderiza, así que el
  // primer pintado del cliente es idéntico y no hay salto de hidratación.
  //
  // El paso 1 abarca patente Y kilómetros, que viven en dos pantallas
  // distintas: se da por hecho recién cuando los kilómetros están.
  const aceiteListo = aceiteTipo.trim().length >= 2;
  const enExito = pantalla === "exito";
  const estadosPasos: EstadoPaso[] = vitrina
    ? ["pendiente", "pendiente", "pendiente"]
    : [
        enExito || kmCargado ? "completado" : "activo",
        enExito || aceiteListo
          ? "completado"
          : kmCargado
            ? "activo"
            : "pendiente",
        enExito ? "completado" : listo ? "activo" : "pendiente",
      ];

  // La grilla vive acá y no en la sección porque las cards LEEN este
  // estado: separarlas obligaba a un contexto o a duplicar el estado.
  // Desktop: teléfono a la izquierda, guía a la derecha. Mobile: la
  // simulación a ancho completo y las cards apiladas abajo.
  return (
    <div className="grid items-start gap-8 lg:grid-cols-[minmax(0,26rem)_1fr] lg:gap-14">
      {/* En desktop esta columna mide EXACTAMENTE lo que el marco del
          teléfono, y no lo que mide la pista de la grilla. Antes era
          `w-full`: el marco, con su ancho fijo de 320px, quedaba pegado a la
          izquierda de una columna de 26rem, y el botón de abajo se centraba
          respecto de la columna. Los dos "centrados" no coincidían y el
          botón salía corrido unos 50px a la derecha. Con la columna del
          ancho del marco, `justify-self-center` centra el conjunto y el
          botón queda alineado con el teléfono por construcción. */}
      <div className="w-full lg:w-[320px] lg:justify-self-center">
        {/* El marco de celular, solo desde lg — las mismas medidas y el
            mismo bisel que PreviewCelular (components/experiencia). En
            mobile no hay marco: un teléfono adentro de un teléfono es
            redundante y roba ancho. */}
        <div className="relative overflow-hidden rounded-lg border border-line bg-base lg:h-[604px] lg:w-[320px] lg:rounded-[36px] lg:border-[6px] lg:border-ink lg:shadow-lg">
          {/* El cronómetro, quemado sobre la pantalla como en las capturas
              del producto. Vive fuera del área inerte para que siga
              corriendo visible aunque el contenido se esté recorriendo. */}
          {corriendo && (
            <p
              aria-hidden
              className="pointer-events-none absolute top-2.5 right-2.5 z-30 rounded-full bg-ink/85 px-3 py-1.5 font-ui text-label font-semibold tracking-[0.04em] text-white tabular-nums"
            >
              ⏱ {formatearTiempo(ahora - (inicio ?? ahora))}
            </p>
          )}

          {/* La pantalla del teléfono. font-ui y text-ui: adentro del marco
              rige la voz del instrumento, como en el panel de verdad. En
              vitrina va inerte — el camino para tocar es el botón de abajo. */}
          <div
            onFocusCapture={alTocar}
            onPointerDownCapture={alTocar}
            className="h-full overflow-y-auto px-4 py-4 font-ui text-ui leading-[1.45] text-ink"
          >
            {/* El inert va en este wrapper y NO en el contenedor de scroll:
                inert también mata el scroll, y en desktop la vitrina quedaba
                clavada en la mitad de arriba del teléfono. Así el formulario
                completo se puede recorrer, pero no tocar. */}
            <div inert={vitrina}>
            {pantalla === "patente" && (
              <div
                key="patente"
                ref={refPantalla}
                tabIndex={-1}
                className="animar-aparicion outline-none"
              >
                {/* Los textos del momento 0 real, en escala de pantalla
                    chica. No es un heading de la landing: adentro del
                    teléfono es el título de la app. */}
                <p className="font-brand text-h3 font-bold text-ink">
                  Nuevo service
                </p>
                <p className="mt-0.5 text-ui text-ink-60">
                  Escribí la patente y listo
                </p>

                <div className="mt-4">
                  <CampoPatente valor={patente} alEscribir={alEscribirPatente} />
                </div>

                {/* EL MOMENTO. La ficha no aparece de golpe: primero el
                    esqueleto de búsqueda, después el auto y el cliente
                    entrando con la misma transición del resto del sistema.
                    aria-live para que el lector de pantalla también se
                    entere de que el sistema lo encontró. */}
                <div aria-live="polite">
                  {buscando && (
                    <div
                      aria-hidden
                      className="mt-4 rounded-lg border border-line bg-base p-4"
                    >
                      <div className="skeleton h-6 w-2/3" />
                      <div className="skeleton mt-2 h-4 w-1/2" />
                      <div className="skeleton mt-4 h-12 w-full" />
                    </div>
                  )}
                  {encontrado && (
                    <div className="animar-aparicion">
                      <MiniFicha
                        vehiculo={{ ...DEMO, patente: patenteLinda }}
                        accionCargar={() => setPantalla("carton")}
                      />
                    </div>
                  )}
                </div>
              </div>
            )}

            {pantalla === "carton" && (
              <div
                key="carton"
                ref={refPantalla}
                tabIndex={-1}
                className="animar-aparicion flex flex-col gap-4 outline-none"
              >
                <CabeceraCarton
                  patente={patenteLinda}
                  vehiculoNombre={`${DEMO.marca} ${DEMO.modelo}`}
                  clienteNombre={DEMO.clienteNombre}
                />

                <CampoKilometros
                  km={km}
                  alCambiar={(v) => {
                    alTocar();
                    setKm(v);
                  }}
                  ultimoService={ULTIMO_SERVICE}
                />

                {/* El bloque de aceite del cartón real. Acá las dos
                    columnas van apiladas siempre: es una pantalla de
                    teléfono, no una tablet. */}
                <div className="rounded-lg border border-line bg-surface/60 p-4">
                  <p className="mb-3 font-brand text-body font-bold text-ink">
                    Aceite de motor
                  </p>
                  <div className="flex flex-col gap-3">
                    <div>
                      <SelectorViscosidad
                        valor={aceiteTipo}
                        alCambiar={(v) => {
                          alTocar();
                          setAceiteTipo(v);
                        }}
                      />
                    </div>
                    <div>
                      <SelectorProductoAceite
                        valor={aceiteProductoId}
                        alCambiar={setAceiteProductoId}
                        aceites={ACEITES_DEMO}
                      />
                    </div>
                  </div>
                </div>

                {/* El grupo FILTROS del cartón, con sus renglones reales. */}
                <div className="rounded-lg border border-line">
                  <p className="rounded-t-[11px] border-b border-line bg-surface px-3.5 py-2 text-label font-semibold tracking-[0.12em] text-ink-60 uppercase">
                    FILTROS
                  </p>
                  {FILTROS.map((r) => (
                    <div
                      key={r.tipo}
                      className="border-b border-line last:border-b-0"
                    >
                      <RenglonInterruptor
                        etiqueta={r.corto}
                        encendido={Boolean(marcados[r.tipo])}
                        alAlternar={() => {
                          alTocar();
                          setMarcados((p) => ({ ...p, [r.tipo]: !p[r.tipo] }));
                        }}
                      />
                    </div>
                  ))}
                </div>

                <div>
                  <Boton
                    tam="lg"
                    className="w-full"
                    disabled={!listo}
                    onClick={confirmar}
                  >
                    Confirmar service
                  </Boton>
                  {!listo && (
                    <p className="mt-1.5 text-center text-label text-ink-60">
                      Faltan los kilómetros y la viscosidad del aceite.
                    </p>
                  )}
                </div>
              </div>
            )}

            {pantalla === "exito" && (
              <div
                key="exito"
                ref={refPantalla}
                tabIndex={-1}
                className="animar-aparicion outline-none"
              >
                {/* El post-guardado real, con el tiempo propio abajo. */}
                <p className="rounded-md bg-success-soft px-3.5 py-3 font-brand text-body font-bold text-success">
                  ✓ Service guardado
                </p>

                <div className="surface-card mt-4 p-4">
                  <p className="plate text-body text-ink">{patenteLinda}</p>
                  <p className="mt-0.5 text-ui text-ink-60 tabular-nums">
                    {DEMO.marca} {DEMO.modelo} · {DEMO.clienteNombre}
                    {kmCargado ? ` · ${formatearKm(kmNum)} km` : ""}
                  </p>
                </div>

                {inicio !== null && (
                  <p className="mt-6 font-brand text-h3 font-bold text-ink tabular-nums">
                    Lo cargaste en {formatearTiempo(tiempoFinal)}.
                  </p>
                )}

                <button
                  type="button"
                  onClick={empezar}
                  className="mt-5 min-h-11 text-ui font-semibold text-ink-60 underline underline-offset-4 hover:text-ink"
                >
                  Volver a empezar
                </button>
              </div>
            )}
            </div>
          </div>
        </div>

        {/* La puerta al modo interactivo. Solo en vitrina: apenas arranca,
            el formulario mismo es la interacción.

            SECUNDARIO, no rojo: la única acción primaria de la página es
            WhatsApp, y adentro del teléfono ya hay un botón rojo del
            producto. Tres rojos apilados dejan de ordenar. */}
        {vitrina && (
          <div className="mt-4 flex justify-center">
            <Boton
              variante="secundario"
              tam="lg"
              onClick={empezar}
              className="w-full border-ink font-bold sm:w-auto sm:px-8"
            >
              Probá cargar un service
            </Boton>
          </div>
        )}
      </div>

      <PasosGuia estados={estadosPasos} />
    </div>
  );
}

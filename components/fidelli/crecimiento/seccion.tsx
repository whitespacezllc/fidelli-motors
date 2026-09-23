import { BotonExportar } from "@/components/fidelli/boton-exportar";
import type { ClaveRecurso, NombreParametro } from "@/lib/fidelli/exportar";

// ============================================================
// Una sección de /fidelli/crecimiento: la tarjeta con el título como
// pregunta (h2), una línea que dice qué responde, el botón «Exportar CSV»
// a la derecha y el contenido. Ninguna tabla arranca sin un encabezado que
// diga qué responde (criterio del bloque 2), y acá el encabezado es la
// pregunta que un comprador se hace.
//
// El `id` sirve de ancla y de gancho para las capturas por sección
// (`data-seccion`); el orden a–f es el del contrato.
//
// LA TARJETA NO RECORTA (sin `overflow-hidden`): el tooltip del gráfico de
// altas y bajas flota sobre la tarjeta y a 390px asoma unos píxeles por el
// borde en algunos meses (OverlaySerie recién lo corre a −100 % pasado el
// 88 % del ancho); con `overflow-hidden` se leía «2 reactivacione». Lo que
// sí tiene que quedar adentro —las tablas anchas— lo recorta su propio
// contenedor SCROLL (estilos.ts), no la tarjeta.
// ============================================================
export function Seccion({
  id,
  titulo,
  descripcion,
  exportar,
  accion,
  children,
}: {
  id: string;
  /** La pregunta: «¿De dónde viene el MRR?». */
  titulo: string;
  /** Una línea: qué responde y con qué unidad. */
  descripcion: string;
  /** El recurso del data room y los parámetros vigentes de la pantalla. */
  exportar: {
    recurso: ClaveRecurso;
    params: Partial<Record<NombreParametro, string | null | undefined>>;
  };
  /** Un enlace más al lado del botón («Ir a pauta»). */
  accion?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <section
      id={id}
      data-seccion={id}
      aria-labelledby={`${id}-titulo`}
      className="surface-card"
    >
      <div className="flex flex-wrap items-start justify-between gap-x-4 gap-y-3 border-b border-line px-4.5 py-4">
        <div className="min-w-0 max-w-2xl">
          <h2
            id={`${id}-titulo`}
            className="font-brand text-lead font-bold text-ink"
          >
            {titulo}
          </h2>
          <p className="mt-1 text-ui text-ink-60">{descripcion}</p>
        </div>
        <div className="flex shrink-0 flex-wrap items-center gap-2">
          {accion}
          <BotonExportar
            recurso={exportar.recurso}
            params={exportar.params}
            compacto
          />
        </div>
      </div>
      {children}
    </section>
  );
}

/**
 * La oración de una sección sin datos: dice qué va a aparecer y desde
 * cuándo. No se lamenta: explica (docs/Estados Visual.html).
 */
export function Oracion({ children }: { children: React.ReactNode }) {
  return (
    <p className="max-w-2xl px-4.5 py-6 text-ui text-ink-60">{children}</p>
  );
}

/**
 * La oración de una lectura que falló: nunca una tabla vacía sin
 * explicación. Ámbar y no rojo, como todo estado del admin; el mensaje de
 * la base va tal cual porque quien lo lee es el equipo.
 */
export function OracionError({
  funcion,
  mensaje,
}: {
  funcion: string;
  mensaje: string;
}) {
  return (
    <p className="mx-4.5 my-4 rounded-md bg-overdue-soft px-3.5 py-3 text-ui text-overdue">
      No se pudo leer <code className="font-semibold">{funcion}()</code>:{" "}
      {mensaje}. Recargá la página; si sigue pasando, el log del servidor tiene
      el detalle.
    </p>
  );
}

import { CabeceraSeccion } from "@/components/panel/cabecera-seccion";

// Los esqueletos de carga del panel y de /fidelli: la pantalla, en gris
// (CLAUDE.md · «Estados de carga» y docs/Estados Visual.html). Cada ruta
// tiene su loading.tsx, que Next muestra apenas se toca el link —antes de
// que llegue una sola fila— y reemplaza por la pantalla real cuando llega.
//
// Cada loading.tsx compone estas piezas con la ESTRUCTURA REAL de su
// pantalla: la cabecera es la de verdad, con su título (y su «¿Cómo se
// usa?»); los filtros, las tarjetas y las filas van en gris, con su ancho y
// su alto reales y con las mismas clases de grilla que la pantalla, así el
// ojo ya sabe dónde va a estar cada dato. Nada inventado: si la pantalla no
// tiene un bloque, el esqueleto tampoco.
//
// NADA POR DEBAJO DE 300 ms PARPADEA, y no hace falta un retraso propio:
// React no reemplaza un fallback de Suspense por el contenido antes de
// 300 ms desde que lo mostró (FALLBACK_THROTTLE_MS). Una vez en pantalla,
// el esqueleto queda por lo menos ese tiempo y se va de golpe, cuando Next
// pone la pantalla real. Un retraso en CSS para el gris lo empeoraba: el
// gris asomaba justo cuando llegaba el contenido (medido; ver
// scripts/regresion-esqueletos.mjs). La pieza es el `skeleton` del sistema
// (globals.css, docs/Estados Visual.html), sin transiciones inventadas.

/** La raíz de todo esqueleto. `data-esqueleto` es lo que miran la prueba
 *  (scripts/regresion-esqueletos.mjs) y la medición (scripts/medir-panel.mjs). */
export function Esqueleto({ children, className }: { children: React.ReactNode; className?: string }) {
  return (
    <div data-esqueleto aria-busy="true" className={className}>
      <span role="status" className="sr-only">
        Cargando…
      </span>
      {children}
    </div>
  );
}

/** Un dato que todavía no llegó: una barra gris del ancho y el alto que va
 *  a tener. Las clases dicen el tamaño (y la forma, si no es una barra). */
export function Pieza({ className = "h-3 w-24" }: { className?: string }) {
  return <span aria-hidden className={`skeleton block shrink-0 ${className}`} />;
}

/** Un contenedor de la pantalla (una tarjeta, una lista con borde), con
 *  las clases de la pantalla real, tal cual. */
export function Marco({
  children,
  className = "",
  como: Etiqueta = "div",
}: {
  children?: React.ReactNode;
  className?: string;
  como?: "div" | "ul" | "section";
}) {
  return <Etiqueta className={className}>{children}</Etiqueta>;
}

/** La cabecera de sección, la real: el título se ve enseguida. A la
 *  derecha, en gris, lo que la pantalla pone ahí (el botón primario, el
 *  Exportar, la métrica): una clase de tamaño por cada uno. */
export function Cabecera({ titulo, derecha = [] }: { titulo: string; derecha?: string[] }) {
  return (
    <CabeceraSeccion titulo={titulo}>
      {derecha.length > 0 && (
        <div className="flex flex-wrap items-center gap-2">
          {derecha.map((c, i) => (
            <Pieza key={i} className={c} />
          ))}
        </div>
      )}
    </CabeceraSeccion>
  );
}

/** Una fila de listado en gris, con el alto de la fila real. `lineas` son
 *  los anchos de los renglones de la izquierda (el primero, el nombre);
 *  `derecha`, lo que la fila tiene a la derecha (un estado, un botón). */
export function FilaGris({
  className = "py-3.5",
  lineas = ["h-4 w-40", "h-3 w-56"],
  derecha = [],
}: {
  className?: string;
  lineas?: string[];
  derecha?: string[];
}) {
  return (
    <li className={`flex items-center gap-4 border-b border-line last:border-b-0 ${className}`}>
      <div className="flex min-w-0 flex-1 flex-col gap-2">
        {lineas.map((c, i) => (
          <Pieza key={i} className={`max-w-full ${c}`} />
        ))}
      </div>
      {derecha.map((c, i) => (
        <Pieza key={i} className={c} />
      ))}
    </li>
  );
}

/** Una lista de filas grises adentro de su marco. */
export function ListaGris({
  filas = 6,
  className = "surface-card px-4 sm:px-5",
  encabezado,
  fila,
}: {
  filas?: number;
  className?: string;
  /** Lo que va arriba de las filas adentro del marco, si es fijo (la
   *  cabecera de columnas de una tabla, por ejemplo): se muestra el real. */
  encabezado?: React.ReactNode;
  /** Cómo es cada fila; por defecto, nombre y un renglón debajo. */
  fila?: (i: number) => React.ReactNode;
}) {
  return (
    <Marco className={className}>
      {encabezado}
      <ul>
        {Array.from({ length: filas }, (_, i) => (fila ? fila(i) : <FilaGris key={i} />))}
      </ul>
    </Marco>
  );
}

/** Una tarjeta gris: el marco de la pantalla con un título y renglones. */
export function TarjetaGris({
  className = "surface-card p-5",
  titulo = "h-5 w-40",
  lineas = ["h-3 w-full", "h-3 w-4/5", "h-3 w-3/5"],
  children,
}: {
  className?: string;
  titulo?: string | null;
  lineas?: string[];
  children?: React.ReactNode;
}) {
  return (
    <Marco className={className}>
      {titulo && <Pieza className={`mb-4 ${titulo}`} />}
      <div className="flex flex-col gap-2.5">
        {lineas.map((c, i) => (
          <Pieza key={i} className={c} />
        ))}
      </div>
      {children}
    </Marco>
  );
}

/** Un campo de formulario en gris: la etiqueta y la caja de 44 px. */
export function CampoGris({ className = "", ancho = "w-full" }: { className?: string; ancho?: string }) {
  return (
    <div className={`flex flex-col gap-2 ${className}`}>
      <Pieza className="h-3 w-24" />
      <Pieza className={`h-11 rounded-md ${ancho}`} />
    </div>
  );
}

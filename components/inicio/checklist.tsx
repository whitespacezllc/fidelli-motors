import Link from "next/link";
import { clasesBoton } from "@/components/ui/boton";

export type EstadoChecklist = {
  sucursales: number;
  productos: number;
  premio_meta: number | null;
  services: number;
};

function plural(n: number, singular: string, plural: string) {
  return `${n} ${n === 1 ? singular : plural}`;
}

export function estaCompleto(c: EstadoChecklist): boolean {
  return (
    c.sucursales > 0 && c.productos > 0 && c.premio_meta !== null && c.services > 0
  );
}

// El checklist de puesta en marcha. Reemplaza al dashboard hasta que los
// cuatro pasos están hechos, y no se puede cerrar: es la guía, no un aviso.
//
// Con la cuenta suspendida sigue mostrándose —el progreso conseguido es del
// lubricentro y no se le esconde— pero deja de empujar: los cuatro pasos
// terminan en pantallas de carga que están bloqueadas, así que ofrecer
// "Empezar" sería mandarlo a chocarse contra una puerta cerrada. Se cae el
// botón, se cae la fila destacada en rojo y el encabezado dice dónde quedó
// todo en vez de cuánto falta. El aviso con el WhatsApp ya está arriba, en
// el layout: acá no se repite.
export function Checklist({
  estado,
  suspendido = false,
}: {
  estado: EstadoChecklist;
  suspendido?: boolean;
}) {
  const pasos = [
    {
      titulo: "Cargá tus sucursales",
      pendiente: "Para saber en qué local se hizo cada trabajo",
      // Cada paso hecho muestra el dato real conseguido, no un tilde abstracto.
      logro: plural(estado.sucursales, "sucursal activa", "sucursales activas"),
      hecho: estado.sucursales > 0,
      destino: "/panel/sucursales",
    },
    {
      titulo: "Sumá tus productos",
      pendiente: "Aceites, filtros y líquidos que usás siempre",
      logro: `${plural(estado.productos, "producto", "productos")} en el catálogo`,
      hecho: estado.productos > 0,
      destino: "/panel/productos",
    },
    {
      titulo: "Definí tu premio",
      pendiente: "Qué premio das y cada cuánto se gana",
      logro: `Premio cada ${estado.premio_meta} services`,
      hecho: estado.premio_meta !== null,
      destino: "/panel/fidelizacion",
    },
    {
      titulo: "Cargá tu primer trabajo",
      pendiente: "Probalo con el próximo auto que entre",
      logro: `${plural(estado.services, "trabajo cargado", "trabajos cargados")}`,
      hecho: estado.services > 0,
      destino: "/panel/services/nuevo",
    },
  ];

  const hechos = pasos.filter((p) => p.hecho).length;
  const faltan = pasos.length - hechos;
  // Sin acciones disponibles no hay "paso actual" que destacar.
  const proximo = suspendido ? -1 : pasos.findIndex((p) => !p.hecho);

  const titulo = suspendido
    ? "Tu puesta en marcha queda donde la dejaste"
    : hechos === 0
      ? "Bienvenido a Fidelli Motors"
      : "Te falta poco";

  const bajada = suspendido
    ? `${plural(hechos, "paso hecho", "pasos hechos")} de ${pasos.length}. Los que faltan te esperan: los vas a poder terminar apenas se reactive la cuenta.`
    : hechos === 0
      ? "Cuatro pasos para dejar todo listo. Podés hacerlos ahora o cuando quieras."
      : `${plural(faltan, "paso", "pasos")} para terminar de configurar tu lubricentro.`;

  return (
    <div
      className={`overflow-hidden rounded-lg border ${
        suspendido ? "border-line" : "border-ink"
      }`}
    >
      <div className="border-b border-line px-4.5 py-4">
        <h1 className="font-brand text-lead font-bold text-ink">{titulo}</h1>
        <p className="mt-0.5 text-ui text-ink-60">{bajada}</p>
        <div
          className="mt-3 h-1.5 overflow-hidden rounded-sm bg-surface"
          role="progressbar"
          aria-valuenow={hechos}
          aria-valuemin={0}
          aria-valuemax={pasos.length}
          aria-label="Progreso de la puesta en marcha"
        >
          <div
            className="h-full rounded-sm bg-ink transition-[width]"
            style={{ width: `${(hechos / pasos.length) * 100}%` }}
          />
        </div>
      </div>

      {pasos.map((paso, i) => {
        const esElActual = i === proximo;
        return (
          <div
            key={paso.titulo}
            // EL PASO ACTUAL NO VA EN ROJO. `bg-brand-soft` acá estaba
            // usando el color de marca para comunicar un ESTADO ("este es
            // el que sigue"), que es exactamente lo que la regla de oro
            // prohíbe. La posición y el número ya dicen cuál es el
            // próximo; el realce lo da la superficie neutra.
            className={`flex items-center gap-3.5 border-b border-line px-4.5 py-3.5 last:border-b-0 ${
              esElActual ? "bg-surface" : ""
            }`}
          >
            <span
              className={`flex size-6.5 shrink-0 items-center justify-center rounded-full border font-brand text-label font-bold ${
                paso.hecho
                  ? "border-success bg-success text-white"
                  : "border-ink-40 text-ink-40"
              }`}
            >
              {paso.hecho ? "✓" : i + 1}
            </span>

            <div className="min-w-0 flex-1">
              <p
                className={`font-brand text-ui font-bold ${
                  paso.hecho ? "text-ink-40 line-through" : "text-ink"
                }`}
              >
                {paso.titulo}
              </p>
              <p className="mt-px text-label text-ink-60">
                {paso.hecho ? paso.logro : paso.pendiente}
              </p>
            </div>

            {!paso.hecho && !suspendido && (
              <Link
                href={paso.destino}
                className={
                  esElActual
                    ? clasesBoton("primario", "md")
                    : "flex min-h-11 items-center px-3 text-ui font-semibold text-ink-60"
                }
              >
                {esElActual ? "Empezar" : "Ir"}
              </Link>
            )}

            {!paso.hecho && suspendido && (
              <span className="shrink-0 text-label text-ink-40">En pausa</span>
            )}
          </div>
        );
      })}
    </div>
  );
}

import Link from "next/link";
import { clasesBoton } from "@/components/ui/boton";
import { EstadoVacio } from "@/components/ui/estado-vacio";
import { IconoReloj, IconoQR } from "@/components/iconos";
import { GraficoServices } from "@/components/inicio/grafico-services";
import { formatearKm } from "@/lib/renglones";
import { formatearFechaHora, nombreDelMes } from "@/lib/fechas";
import type { PuntoSerie, VistaPanel } from "@/lib/series";

export type DatosInicio = {
  metricas: {
    services_mes: number;
    clientes_nuevos: number;
    recuperados: number;
    canjes_mes: number;
  };
  landing: { flota: number; escaneados: number; leads: number };
  series: Record<VistaPanel, PuntoSerie[]>;
  services_por_sucursal: { nombre: string; cantidad: number }[];
  retencion: { vencido: number; urgente: number; proximo: number };
  ultimos: {
    id: string;
    tipo?: "service" | "mecanica";
    descripcion?: string | null;
    fecha: string;
    creado: string;
    patente: string;
    vehiculo: string | null;
    sucursal: string;
    km: number | null;
  }[];
};

function Metrica({
  clave,
  valor,
  detalle,
  destacada = false,
}: {
  clave: string;
  valor: number;
  detalle: string;
  destacada?: boolean;
}) {
  return (
    <div
      className={`rounded-lg border px-4 py-3.5 ${
        destacada ? "border-reward" : "border-line"
      }`}
    >
      <p className="text-label font-semibold tracking-[0.06em] text-ink-40 uppercase">
        {clave}
      </p>
      <p
        className={`mt-1.5 font-brand text-h2 font-bold tabular-nums ${
          destacada ? "text-reward" : "text-ink"
        }`}
      >
        {valor}
      </p>
      <p className="mt-0.5 text-label text-ink-40">{detalle}</p>
    </div>
  );
}

function Badge({
  cantidad,
  texto,
  clase,
}: {
  cantidad: number;
  texto: string;
  clase: string;
}) {
  return (
    <span
      className={`inline-flex items-center rounded-sm border px-2.5 py-1 text-label font-semibold tracking-[0.04em] tabular-nums uppercase ${clase}`}
    >
      {cantidad} {texto}
    </span>
  );
}

export function Dashboard({
  datos,
  hoy,
  vista,
}: {
  datos: DatosInicio;
  hoy: string;
  /** La vista inicial del gráfico de services, validada en la page. */
  vista: VistaPanel;
}) {
  const { metricas, retencion, ultimos, landing } = datos;
  const desglose = datos.services_por_sucursal
    .map((s) => `${s.cantidad} ${s.nombre}`)
    .join(" · ");
  const alDia =
    retencion.vencido === 0 && retencion.urgente === 0 && retencion.proximo === 0;

  const porcentajeEscaneo =
    landing.flota > 0
      ? Math.round((landing.escaneados / landing.flota) * 100)
      : null;

  return (
    <div className="flex flex-col gap-5">
      {/* Cuatro métricas: dos filas de dos en el celular, una fila en desktop */}
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Metrica
          clave="Services del mes"
          valor={metricas.services_mes}
          detalle={desglose || "todavía sin services este mes"}
        />
        <Metrica
          clave="Clientes nuevos"
          valor={metricas.clientes_nuevos}
          detalle={`en ${nombreDelMes(hoy)}`}
        />
        {/* El único dorado del sistema: es la métrica que renueva la suscripción */}
        <Metrica
          clave="Recuperados este mes"
          valor={metricas.recuperados}
          detalle="volvieron tras el contacto"
          destacada
        />
        <Metrica
          clave="Canjes del mes"
          valor={metricas.canjes_mes}
          detalle="premios entregados"
        />
      </div>

      {/* Retención pendiente. Los colores son los de estado, nunca el rojo
          de marca. Sin trabajo pendiente se celebra, en verde. */}
      {alDia ? (
        <div className="flex flex-wrap items-center gap-3 rounded-lg border border-success bg-success-soft px-5 py-4">
          <span className="font-brand text-body font-bold text-success">
            Estás al día
          </span>
          <span className="text-ui text-ink-60">
            Ningún vehículo vencido ni por vencer esta semana.
          </span>
        </div>
      ) : (
        <div className="flex flex-wrap items-center gap-3 rounded-lg border border-line px-5 py-4">
          <span className="mr-1.5 font-brand text-body font-bold text-ink">
            Retención pendiente
          </span>
          {retencion.vencido > 0 && (
            <Badge
              cantidad={retencion.vencido}
              texto="vencidos"
              clase="border-overdue bg-overdue-soft text-overdue"
            />
          )}
          {retencion.urgente > 0 && (
            <Badge
              cantidad={retencion.urgente}
              texto="urgentes"
              clase="border-urgente bg-urgente-soft text-urgente"
            />
          )}
          {retencion.proximo > 0 && (
            <Badge
              cantidad={retencion.proximo}
              texto="próximos"
              clase="border-line bg-surface text-upcoming"
            />
          )}
          <Link
            href="/panel/proximos"
            className={`${clasesBoton("secundario", "md")} ml-auto`}
          >
            Ver tabla
          </Link>
        </div>
      )}

      {/* El gráfico y la landing, lado a lado en desktop */}
      <div className="grid gap-5 lg:grid-cols-[1fr_20rem] lg:items-start">
        <GraficoServices series={datos.series} vistaInicial={vista} />

        {/* La landing es de la marca, no de un local: el QR es uno solo
            para todo el lubricentro. Por eso este bloque NO cambia con el
            filtro de sucursal, y lo dice. */}
        <section className="rounded-lg border border-line px-5 py-4">
          <div className="flex items-start justify-between gap-3">
            <h2 className="font-brand text-body font-bold text-ink">
              Tu página pública
            </h2>
            <IconoQR aria-hidden className="size-5 shrink-0 text-ink-40" />
          </div>
          <p className="mt-0.5 text-label text-ink-40">
            De toda la marca · últimos 12 meses
          </p>

          {porcentajeEscaneo === null ? (
            <p className="mt-4 text-ui text-ink-60">
              Cuando cargues services vas a ver qué porcentaje de tus clientes
              escanea el QR del parasol.
            </p>
          ) : (
            <>
              <p className="mt-4 font-brand text-h1 font-bold text-ink tabular-nums">
                {porcentajeEscaneo}%
              </p>
              <p className="mt-0.5 text-ui text-ink-60 tabular-nums">
                escaneó su cartón — {landing.escaneados} de {landing.flota} autos
              </p>
            </>
          )}

          {landing.leads > 0 && (
            <p className="mt-4 border-t border-line pt-3 text-ui text-ink-60 tabular-nums">
              <span className="font-semibold text-ink">{landing.leads}</span>{" "}
              {landing.leads === 1 ? "búsqueda" : "búsquedas"} de patentes que
              no son tuyas: autos de otro taller parados en tu estacionamiento.
            </p>
          )}
        </section>
      </div>

      {/* Últimos services */}
      <section>
        <h2 className="mb-3 font-brand text-body font-bold text-ink">
          Últimos trabajos
        </h2>

        {ultimos.length === 0 ? (
          <EstadoVacio
            icono={<IconoReloj className="size-6" />}
            titulo="Todavía no cargaste services"
            descripcion="Cuando cargues el primero, acá vas a ver los últimos que pasaron por el taller."
          >
            <Link
              href="/panel/services/nuevo"
              className={clasesBoton("secundario", "md")}
            >
              Cargar un service
            </Link>
          </EstadoVacio>
        ) : (
          <ul className="surface-card px-4 sm:px-5">
            {ultimos.map((s) => (
              <li key={s.id} className="border-b border-line last:border-b-0">
                <Link
                  href={`/panel/services/${s.id}`}
                  className="flex flex-wrap items-center gap-x-4 gap-y-1 py-3 hover:bg-surface/60 lg:grid lg:grid-cols-[8rem_7rem_1fr_10rem_6rem]"
                >
                  <span className="order-2 text-label text-ink-60 tabular-nums lg:order-none">
                    {formatearFechaHora(s.creado)}
                  </span>
                  <span className="plate order-1 text-ui text-ink lg:order-none">
                    {s.patente.toUpperCase()}
                  </span>
                  <span className="order-3 w-full truncate text-ui text-ink-60 lg:order-none lg:w-auto">
                    {s.tipo === "mecanica" && s.descripcion
                      ? `${s.vehiculo ?? "Vehículo"} — ${s.descripcion}`
                      : (s.vehiculo ?? "Vehículo")}
                  </span>
                  <span className="order-4 text-label text-ink-60 lg:order-none lg:text-ui">
                    {s.sucursal}
                  </span>
                  {s.tipo === "mecanica" ? (
                    <span className="order-5 ml-auto lg:order-none lg:ml-0 lg:justify-self-end">
                      <span className="rounded-sm border border-line bg-surface px-2 py-0.5 text-label font-semibold tracking-[0.04em] text-ink-60 uppercase">
                        Mecánica
                      </span>
                    </span>
                  ) : (
                    <span className="order-5 ml-auto text-ui text-ink-60 tabular-nums lg:order-none lg:ml-0 lg:text-right">
                      {formatearKm(s.km ?? 0)} km
                    </span>
                  )}
                </Link>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}

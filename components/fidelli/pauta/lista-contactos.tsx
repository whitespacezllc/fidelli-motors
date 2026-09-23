import Link from "next/link";
import { FilaContacto, type TenantOpcion } from "@/components/fidelli/pauta/fila-contacto";
import { BotonExportar } from "@/components/fidelli/boton-exportar";
import {
  pasaFiltro,
  type CanalFiltro,
  type Contacto,
  type FiltroEstado,
} from "@/lib/fidelli/pauta";

const BASE = "flex h-9 items-center gap-2 rounded-md px-3 text-ui transition-colors";

function hrefCon(params: Record<string, string | undefined>, cambios: Record<string, string | undefined>): string {
  const p = new URLSearchParams();
  for (const [k, v] of Object.entries({ ...params, ...cambios })) {
    if (v && v !== "todos") p.set(k, v);
  }
  const q = p.toString();
  return `/fidelli/pauta${q ? `?${q}` : ""}`;
}

// ============================================================
// Los contactos de los últimos 60 días, el más reciente primero, con el
// filtro por estado y por canal en la URL.
// ============================================================
export function ListaContactos({
  contactos,
  tenants,
  hoy,
  filtro,
  canal,
  params,
}: {
  contactos: Contacto[];
  tenants: TenantOpcion[];
  hoy: string;
  filtro: FiltroEstado;
  canal: CanalFiltro;
  params: Record<string, string | undefined>;
}) {
  const visibles = contactos.filter((c) => pasaFiltro(c, filtro, canal));

  const opcionesEstado: { clave: FiltroEstado; nombre: string }[] = [
    { clave: "todos", nombre: "Todos" },
    { clave: "abiertos", nombre: "Abiertos" },
    { clave: "demo", nombre: "Demo enviada" },
    { clave: "cerrados", nombre: "Cerrados" },
    { clave: "perdidos", nombre: "Perdidos" },
  ];
  const opcionesCanal: { clave: CanalFiltro; nombre: string }[] = [
    { clave: "todos", nombre: "Todos los canales" },
    { clave: "meta", nombre: "Meta" },
    { clave: "google", nombre: "Google" },
    { clave: "otro", nombre: "Otro" },
  ];

  const link = (clave: string, valor: string, activa: boolean, nombre: string, n?: number) => (
    <Link
      key={`${clave}-${valor}`}
      href={hrefCon(params, { [clave]: valor })}
      aria-current={activa ? "page" : undefined}
      className={
        activa
          ? `${BASE} bg-ink font-semibold text-base`
          : `${BASE} border border-line bg-base text-ink-60 hover:bg-surface`
      }
    >
      {nombre}
      {n !== undefined && (
        <span className={`rounded-sm px-1.5 py-px text-label font-semibold tabular-nums ${activa ? "bg-base text-ink" : "bg-surface text-ink-60"}`}>
          {n}
        </span>
      )}
    </Link>
  );

  const cuenta = (f: FiltroEstado) => contactos.filter((c) => pasaFiltro(c, f, canal)).length;

  return (
    <section className="surface-card overflow-hidden">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-line px-4.5 py-3">
        <h2 className="font-brand text-ui font-bold tracking-[0.04em] text-ink-60 uppercase">
          Contactos · últimos 60 días
        </h2>
        <div className="flex flex-wrap gap-1">
          {opcionesEstado.map((o) => link("estado", o.clave, o.clave === filtro, o.nombre, cuenta(o.clave)))}
        </div>
        <div className="flex flex-wrap gap-1">
          {opcionesCanal.map((o) => link("canal", o.clave, o.clave === canal, o.nombre))}
        </div>
        {/* El recurso `contactos-pauta` del data room con el estado y el
            canal vigentes; «todos» no viaja. Va SIN el corte de 60 días de
            la lista: la exportación es para mirar el histórico entero. */}
        <BotonExportar recurso="contactos-pauta" params={{ estado: filtro, canal }} compacto />
      </div>

      {visibles.length === 0 ? (
        <p className="px-4.5 py-6 text-ui text-ink-60">
          {contactos.length === 0
            ? "Todavía no hay contactos. El primero que entre por Meta o por Google se registra arriba, en tres toques."
            : "Ningún contacto con este filtro."}
        </p>
      ) : (
        <ul className="divide-y divide-line">
          {visibles.map((c) => (
            <FilaContacto key={c.id} c={c} tenants={tenants} hoy={hoy} />
          ))}
        </ul>
      )}
    </section>
  );
}

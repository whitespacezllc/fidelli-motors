import type { Metadata } from "next";
import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { EstadoVacio } from "@/components/ui/estado-vacio";
import { clasesBoton } from "@/components/ui/boton";
import { DialogCliente } from "@/components/clientes/dialog-cliente";
import { SeccionVehiculos } from "@/components/vehiculos/seccion-vehiculos";
import { estadoService } from "@/lib/servicios";
import { formatearFecha, formatearMesAnio } from "@/lib/fechas";

export const metadata: Metadata = { title: "Cliente — Fidelli Motors" };

export default async function FichaCliente({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const supabase = await createClient();

  // Dos consultas para dos conjuntos distintos, ninguna con N+1: los datos
  // del cliente y sus vehículos, cada una con sus agregados ya resueltos en
  // Postgres por su vista. Si el id no existe, o es de otro lubricentro (RLS
  // lo filtra), o ni siquiera es un uuid, se cae en "no encontrado".
  const { data: cliente } = await supabase
    .from("vista_clientes")
    .select(
      "id, nombre, telefono, email, created_at, cantidad_vehiculos, ultimo_service_fecha",
    )
    .eq("id", id)
    .maybeSingle();

  // Las columnas de una vista llegan tipadas como nullable (Postgres no puede
  // probar NOT NULL a través de un group by): con este chequeo quedan
  // acotadas y el resto de la ficha trabaja con datos firmes.
  if (!cliente?.id || !cliente.nombre) {
    return (
      <EstadoVacio
        titulo="No encontramos ese cliente"
        descripcion="Puede que lo hayan borrado o que el enlace esté mal. Volvé al listado y buscalo por nombre o patente."
      >
        <Link href="/panel/clientes" className={clasesBoton("secundario", "md")}>
          Volver a Clientes
        </Link>
      </EstadoVacio>
    );
  }

  const { data: filasVehiculos } = await supabase
    .from("vista_vehiculos")
    .select("id, patente, marca, modelo, anio, cantidad_services, ultimo_service_fecha")
    .eq("cliente_id", cliente.id)
    .order("created_at");

  // Igual que con vista_clientes: las columnas de una vista llegan nullable
  // y se acomodan acá, en el borde, en vez de repartir "!" por los componentes.
  const vehiculos = (filasVehiculos ?? []).flatMap((v) =>
    v.id && v.patente
      ? [
          {
            id: v.id,
            patente: v.patente,
            marca: v.marca,
            modelo: v.modelo,
            anio: v.anio,
            cantidad_services: v.cantidad_services ?? 0,
            ultimo_service_fecha: v.ultimo_service_fecha,
          },
        ]
      : [],
  );

  // El historial de todos los vehículos del cliente en UNA consulta (sin
  // N+1); se agrupa por vehículo en memoria. Un cliente tiene pocos autos
  // y pocos services — esto no necesita paginado.
  const { data: filasServices } = await supabase
    .from("services")
    .select(
      "id, fecha, created_at, kilometros, aceite_tipo, aceite_nombre, anulado, desbloqueado_hasta, vehiculo_id, sucursales(nombre)",
    )
    .in(
      "vehiculo_id",
      vehiculos.map((v) => v.id),
    )
    .order("fecha", { ascending: false })
    .order("created_at", { ascending: false });

  const servicesPorVehiculo = new Map<string, typeof filasServices>();
  for (const s of filasServices ?? []) {
    const lista = servicesPorVehiculo.get(s.vehiculo_id) ?? [];
    lista.push(s);
    servicesPorVehiculo.set(s.vehiculo_id, lista);
  }

  // La fidelización de cada auto. premio_disponible() es por vehículo y un
  // cliente tiene uno o dos: se piden en paralelo, no en cascada. Los
  // canjes van en una sola consulta para todos.
  const [premios, canjesRes] = await Promise.all([
    Promise.all(
      vehiculos.map((v) =>
        supabase.rpc("premio_disponible", { p_vehiculo_id: v.id }),
      ),
    ),
    supabase
      .from("canjes")
      .select("id, created_at, vehiculo_id, service_id, premios(descripcion)")
      .in(
        "vehiculo_id",
        vehiculos.map((v) => v.id),
      )
      .order("created_at", { ascending: false }),
  ]);

  const canjesPorVehiculo = new Map<string, typeof canjesRes.data>();
  for (const c of canjesRes.data ?? []) {
    const lista = canjesPorVehiculo.get(c.vehiculo_id) ?? [];
    lista.push(c);
    canjesPorVehiculo.set(c.vehiculo_id, lista);
  }

  const contacto = [
    cliente.telefono,
    cliente.email,
    cliente.created_at
      ? `cliente desde ${formatearMesAnio(cliente.created_at)}`
      : null,
  ].filter(Boolean);

  return (
    <div>
      <nav aria-label="Migas de pan" className="mb-4 text-ui text-ink-60">
        <Link href="/panel/clientes" className="hover:text-ink">
          Clientes
        </Link>
        <span className="px-1.5 text-ink-40">/</span>
        <span className="text-ink">{cliente.nombre}</span>
      </nav>

      <header className="surface-card mb-5 flex flex-wrap items-start justify-between gap-4 p-5">
        <div className="min-w-0">
          <h1 className="font-brand text-h2 font-bold text-ink">
            {cliente.nombre}
          </h1>
          <p className="mt-1 text-ui text-ink-60">{contacto.join(" · ")}</p>
          <p className="mt-0.5 text-ui text-ink-60">
            {cliente.ultimo_service_fecha
              ? `Último service ${formatearFecha(cliente.ultimo_service_fecha)}`
              : "Todavía no tiene services cargados"}
          </p>
        </div>

        <DialogCliente
          variante="secundario"
          cliente={{
            id: cliente.id,
            nombre: cliente.nombre,
            telefono: cliente.telefono ?? "",
            email: cliente.email,
          }}
        />
      </header>

      <SeccionVehiculos
        clienteId={cliente.id}
        vehiculos={vehiculos.map((v, i) => ({
          ...v,
          fidelizacion: (() => {
            const p = premios[i]?.data?.[0];
            return p?.meta_services
              ? {
                  disponible: Boolean(p.disponible),
                  servicesCiclo: p.services_ciclo ?? 0,
                  metaServices: p.meta_services,
                  descripcion: p.descripcion ?? "",
                }
              : null;
          })(),
          canjes: (canjesPorVehiculo.get(v.id) ?? []).map((c) => ({
            id: c.id,
            fecha: c.created_at,
            serviceId: c.service_id,
            descripcion: c.premios?.descripcion ?? "Premio",
          })),
          services: (servicesPorVehiculo.get(v.id) ?? []).map((s) => ({
            id: s.id,
            fecha: s.fecha,
            kilometros: s.kilometros,
            aceite: [s.aceite_tipo, s.aceite_nombre].filter(Boolean).join(" · "),
            sucursal: s.sucursales?.nombre ?? "",
            estado: estadoService(s),
          })),
          // La patente se congela en cuanto el vehículo tiene un service no
          // anulado (regla anti-fraude, la impone la base). El dialog lo usa
          // para mostrar el campo en solo lectura con el motivo.
          patenteBloqueada: (servicesPorVehiculo.get(v.id) ?? []).some(
            (s) => !s.anulado,
          ),
        }))}
      />
    </div>
  );
}

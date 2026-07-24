import type { Metadata } from "next";
import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { EstadoVacio } from "@/components/ui/estado-vacio";
import { clasesBoton } from "@/components/ui/boton";
import { DialogCliente } from "@/components/clientes/dialog-cliente";
import { SeccionVehiculos } from "@/components/vehiculos/seccion-vehiculos";
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

      <SeccionVehiculos clienteId={cliente.id} vehiculos={vehiculos} />
    </div>
  );
}

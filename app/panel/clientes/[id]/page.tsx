import type { Metadata } from "next";
import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { EstadoVacio } from "@/components/ui/estado-vacio";
import { clasesBoton } from "@/components/ui/boton";
import { DialogCliente } from "@/components/clientes/dialog-cliente";
import { formatearFecha, formatearMesAnio } from "@/lib/fechas";

export const metadata: Metadata = { title: "Cliente — Fidelli Motors" };

export default async function FichaCliente({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const supabase = await createClient();

  // Una consulta: la vista ya trae los agregados que necesita la ficha.
  // Si el id no existe, o es de otro lubricentro (RLS lo filtra), o ni
  // siquiera es un uuid, se cae en el mismo estado "no encontrado".
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

      <section>
        <h2 className="mb-2 px-1 text-label font-semibold tracking-[0.06em] text-ink-40 uppercase">
          Vehículos
        </h2>
        {/* Reservado para la próxima entrega: el alta y el listado de
            vehículos, con su cartón, son la tarea 5. */}
        <div className="surface-card border-dashed px-6 py-9 text-center">
          <p className="text-ui text-ink-40">
            Los vehículos de este cliente se cargan en la próxima entrega.
          </p>
        </div>
      </section>
    </div>
  );
}

import type { Metadata } from "next";
import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { EstadoVacio } from "@/components/ui/estado-vacio";
import { clasesBoton } from "@/components/ui/boton";

export const metadata: Metadata = { title: "Cargar service — Fidelli Motors" };

// Momento 1 — el contenedor del cartón. En esta tanda solo confirma que el
// vehículo quedó identificado: el cartón (los 8 elementos del flow) se
// construye en la tanda B.
export default async function ContenedorCarton({
  params,
}: {
  params: Promise<{ vehiculoId: string }>;
}) {
  const { vehiculoId } = await params;
  const supabase = await createClient();

  const { data: vehiculo } = await supabase
    .from("vehiculos")
    .select("id, patente, marca, modelo, clientes(nombre)")
    .eq("id", vehiculoId)
    .maybeSingle();

  if (!vehiculo) {
    return (
      <EstadoVacio
        titulo="No encontramos ese vehículo"
        descripcion="Puede que el enlace esté mal. Volvé a buscar la patente para cargar el service."
      >
        <Link
          href="/panel/services/nuevo"
          className={clasesBoton("secundario", "md")}
        >
          Buscar la patente
        </Link>
      </EstadoVacio>
    );
  }

  const nombre =
    [vehiculo.marca, vehiculo.modelo].filter(Boolean).join(" ") || "Vehículo";

  return (
    <div className="mx-auto max-w-md">
      {/* Anticipo de la cabecera sticky del cartón: patente + vehículo +
          cliente, que en la tanda B acompaña todo el scroll. */}
      <header className="surface-card p-4">
        <p className="plate text-body text-ink">
          {vehiculo.patente.toUpperCase()}
        </p>
        <p className="mt-0.5 text-ui text-ink-60">
          {nombre} · {vehiculo.clientes?.nombre}
        </p>
      </header>

      <div className="surface-card mt-4 border-dashed px-6 py-9 text-center">
        <p className="font-brand text-body font-bold text-ink">
          Vehículo identificado
        </p>
        <p className="mx-auto mt-1.5 max-w-sm text-ui text-ink-60">
          El cartón —fecha, kilómetros, aceite, los 11 renglones y el próximo
          service— se carga en la próxima entrega.
        </p>
        <div className="mt-5 flex justify-center">
          <Link
            href="/panel/services/nuevo"
            className={clasesBoton("secundario", "md")}
          >
            Cargar otro service
          </Link>
        </div>
      </div>
    </div>
  );
}

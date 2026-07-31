import type { Metadata } from "next";
import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { EstadoVacio } from "@/components/ui/estado-vacio";
import { clasesBoton } from "@/components/ui/boton";
import { NotaPostGuardado } from "@/components/notas/nota-post-guardado";
import { formatearKm } from "@/lib/renglones";

export const metadata: Metadata = { title: "Service guardado — Fidelli Motors" };

// Momento 3 — post-guardado. La calco y el premio aparecen en el momento
// exacto en que el cliente está parado en el mostrador.
export default async function PaginaGuardado({
  params,
}: {
  params: Promise<{ serviceId: string }>;
}) {
  const { serviceId } = await params;
  const supabase = await createClient();

  const { data: service } = await supabase
    .from("services")
    .select(
      "id, fecha, kilometros, vehiculo_id, vehiculos(patente, marca, modelo, clientes(nombre))",
    )
    .eq("id", serviceId)
    .maybeSingle();

  if (!service?.vehiculo_id) {
    return (
      <EstadoVacio
        titulo="No encontramos ese service"
        descripcion="Puede que el enlace esté mal. Desde el panel podés ver los services cargados."
      >
        <Link href="/panel" className={clasesBoton("secundario", "md")}>
          Volver al panel
        </Link>
      </EstadoVacio>
    );
  }

  const [conteoRes, premioRes, canjeRes] = await Promise.all([
    supabase
      .from("services")
      .select("id", { count: "exact", head: true })
      .eq("vehiculo_id", service.vehiculo_id)
      .eq("anulado", false),
    supabase.rpc("premio_disponible", { p_vehiculo_id: service.vehiculo_id }),
    supabase
      .from("canjes")
      .select("id")
      .eq("service_id", serviceId)
      .maybeSingle(),
  ]);

  const primeraVisita = (conteoRes.count ?? 0) <= 1;
  const premio = premioRes.data?.[0] ?? null;
  const yaCanjeado = Boolean(canjeRes.data);

  const vehiculo = service.vehiculos;
  const clienteNombre = vehiculo?.clientes?.nombre ?? "";
  const primerNombre = clienteNombre.split(" ")[0] || "tu cliente";
  const nombreVehiculo =
    [vehiculo?.marca, vehiculo?.modelo].filter(Boolean).join(" ") || "el vehículo";

  return (
    <div className="mx-auto max-w-md lg:max-w-xl lg:pt-4">
      <p className="rounded-md bg-success-soft px-3.5 py-3 font-brand text-body font-bold text-success">
        ✓ Service guardado
      </p>

      <div className="surface-card mt-4 p-4">
        <p className="plate text-body text-ink">
          {vehiculo?.patente.toUpperCase()}
        </p>
        <p className="mt-0.5 text-ui text-ink-60 tabular-nums">
          {nombreVehiculo} · {clienteNombre} · {formatearKm(service.kilometros)} km
        </p>
      </div>

      {/* Primera visita del vehículo → la calco, con el guion de 20 segundos */}
      {primeraVisita && (
        <div className="mt-4 rounded-lg border border-brand bg-brand-soft p-4">
          <p className="font-brand text-body font-bold text-ink">
            Primera visita — entregá la calco
          </p>
          <p className="mt-1.5 text-ui text-ink-60">
            Pegá la calco en el parasol y decile a {primerNombre}: escaneando el
            QR ve todo lo que le hicieron al auto, cuándo le toca volver, y cada
            service suma para su premio.
          </p>
        </div>
      )}

      {/* Acá NO hay acción de canje. El canje se decide en el cartón y se
          registra al confirmar el service, en la misma transacción: si
          estuviera acá, un mecánico distraído dejaba al cliente con el
          descuento aplicado y el canje sin registrar. Lo que queda es la
          confirmación de lo que ya pasó, y el aviso para la próxima. */}
      {yaCanjeado && (
        <div className="mt-4 rounded-lg border border-reward bg-reward-soft p-4">
          <p className="font-brand text-body font-bold text-ink">
            Premio aplicado
          </p>
          <p className="mt-1.5 text-ui text-ink-60">
            Quedó registrado el canje de {primerNombre}. El contador arranca de
            nuevo desde el próximo service.
          </p>
        </div>
      )}

      {premio?.disponible && !yaCanjeado && (
        <div className="mt-4 rounded-lg border border-reward bg-reward-soft p-4">
          <p className="font-brand text-body font-bold text-ink">
            {primerNombre} tiene un premio disponible
          </p>
          <p className="mt-1.5 text-ui text-ink-60 tabular-nums">
            {premio.services_ciclo} de {premio.meta_services} services — le
            corresponde {premio.descripcion?.toLowerCase()}. Aplicalo en el
            próximo service, activando “Aplicar premio” en el cartón.
          </p>
        </div>
      )}

      {/* La nota del vehículo: "vi las cubiertas para cambio" se anota
          ACÁ, con el auto todavía en el pozo — no después navegando a la
          ficha. Colapsada y opcional: el service ya está confirmado. */}
      <NotaPostGuardado
        vehiculoId={service.vehiculo_id}
        primerNombre={primerNombre}
      />

      {/* Salidas: el loop para el auto que sigue en el pozo, el cartón, el panel */}
      <div className="mt-5 flex flex-col gap-2.5">
        <Link
          href="/panel/services/nuevo"
          className={`${clasesBoton("primario", "lg")} w-full`}
        >
          + Nuevo service
        </Link>
        <div className="flex gap-2.5">
          <Link
            href={`/panel/clientes`}
            className={`${clasesBoton("secundario", "md")} flex-1`}
          >
            Ver cartón
          </Link>
          <Link
            href="/panel"
            className={`${clasesBoton("secundario", "md")} flex-1`}
          >
            Volver al panel
          </Link>
        </div>
      </div>
    </div>
  );
}

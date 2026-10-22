import type { Metadata } from "next";
import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { obtenerSesion, featureHabilitada, panelSuspendido } from "@/lib/auth/session";
import { BloqueoPlan } from "@/components/panel/bloqueo-plan";
import { CabeceraSeccion } from "@/components/panel/cabecera-seccion";
import { EstadoVacio } from "@/components/ui/estado-vacio";
import { clasesBoton } from "@/components/ui/boton";
import { AccionBloqueada } from "@/components/panel/bloqueo-suspension";
import { formatearPesos } from "@/lib/presupuestos";
import { TabsFinanzas } from "@/components/finanzas/tabs-finanzas";

export const metadata: Metadata = { title: "Cuenta corriente" };

// Quién debe y cuánto. El saldo sale de la base (vista_saldos_cliente):
// suma de los fiados menos lo cobrado, por cliente.
export default async function PaginaCuentaCorriente() {
  const sesion = await obtenerSesion();
  if (!featureHabilitada(sesion, "finanzas")) {
    return <BloqueoPlan funcion="Finanzas" />;
  }

  const suspendido = await panelSuspendido();
  const supabase = await createClient();

  const { data } = await supabase
    .from("vista_saldos_cliente")
    .select("cliente_id, cliente_nombre, saldo")
    .gt("saldo", 0)
    .order("saldo", { ascending: false });

  const filas = (data ?? []).map((c) => ({
    clienteId: c.cliente_id as string,
    nombre: c.cliente_nombre as string,
    saldo: Number(c.saldo),
  }));

  const totalDeben = filas.reduce((s, c) => s + c.saldo, 0);

  return (
    <div>
      <CabeceraSeccion titulo="Finanzas">
        {suspendido ? (
          <AccionBloqueada etiqueta="+ Registrar fiado" />
        ) : (
          <Link href="/panel/finanzas/cuenta/nuevo" className={clasesBoton("primario", "md")}>
            + Registrar fiado
          </Link>
        )}
      </CabeceraSeccion>

      <TabsFinanzas activa="cuenta" />

      {filas.length > 0 ? (
        <>
          <div className="surface-card mb-4 px-5 py-4">
            <p className="text-label font-semibold tracking-[0.06em] text-ink-60 uppercase">
              Te deben
            </p>
            <p className="mt-1 font-brand text-h3 font-bold text-ink tabular-nums">
              {formatearPesos(totalDeben)}
            </p>
            <p className="mt-1 text-label text-ink-60 tabular-nums">
              {filas.length} {filas.length === 1 ? "cliente" : "clientes"} con saldo
            </p>
          </div>

          <ul className="surface-card px-4 sm:px-5">
            {filas.map((c) => (
              <li key={c.clienteId} className="border-b border-line last:border-b-0">
                <Link
                  href={`/panel/finanzas/cuenta/${c.clienteId}`}
                  className="flex items-center justify-between gap-4 py-3 hover:bg-surface/60"
                >
                  <span className="truncate text-ui text-ink">{c.nombre}</span>
                  <span className="shrink-0 text-ui font-semibold text-ink tabular-nums">
                    {formatearPesos(c.saldo)}
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        </>
      ) : (
        <EstadoVacio
          titulo="Nadie te debe plata"
          descripcion="Cuando un cliente se lleva un trabajo y queda debiendo, registralo como fiado y lo seguís desde acá. También podés marcar un presupuesto como fiado."
        >
          {!suspendido && (
            <Link href="/panel/finanzas/cuenta/nuevo" className={clasesBoton("secundario", "md")}>
              Registrar un fiado
            </Link>
          )}
        </EstadoVacio>
      )}
    </div>
  );
}

import type { Metadata } from "next";
import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { obtenerSesion, featureHabilitada, panelSuspendido } from "@/lib/auth/session";
import { BloqueoPlan } from "@/components/panel/bloqueo-plan";
import { EstadoVacio } from "@/components/ui/estado-vacio";
import { clasesBoton } from "@/components/ui/boton";
import { formatearFecha, hoyISO } from "@/lib/fechas";
import { formatearPesos } from "@/lib/presupuestos";
import { CobrarDeuda } from "@/components/finanzas/cobrar-deuda";

export const metadata: Metadata = { title: "Cuenta del cliente" };

type Props = { params: Promise<{ clienteId: string }> };

// La cuenta corriente de un cliente: sus fiados, con lo cobrado y el saldo
// vivo de cada uno. Cobrar es total o parcial.
export default async function PaginaCuentaCliente({ params }: Props) {
  const { clienteId } = await params;
  const sesion = await obtenerSesion();
  if (!featureHabilitada(sesion, "finanzas")) {
    return <BloqueoPlan funcion="Contable" />;
  }

  const suspendido = await panelSuspendido();
  const supabase = await createClient();

  const { data } = await supabase
    .from("vista_deudas")
    .select("id, cliente_nombre, fecha, concepto, monto, cobrado, saldo")
    .eq("cliente_id", clienteId)
    .order("fecha", { ascending: false })
    .order("created_at", { ascending: false });

  const deudas = (data ?? []).map((d) => ({
    id: d.id as string,
    fecha: d.fecha as string,
    concepto: d.concepto as string,
    monto: Number(d.monto),
    cobrado: Number(d.cobrado),
    saldo: Number(d.saldo),
  }));

  if (deudas.length === 0) {
    return (
      <EstadoVacio
        titulo="Este cliente no tiene fiados"
        descripcion="Puede que ya esté todo saldado, o que el enlace esté mal."
      >
        <Link href="/panel/finanzas/cuenta" className={clasesBoton("secundario", "md")}>
          Volver a cuenta corriente
        </Link>
      </EstadoVacio>
    );
  }

  const nombre = (data?.[0]?.cliente_nombre as string) ?? "Cliente";
  const saldoTotal = deudas.reduce((s, d) => s + d.saldo, 0);
  const hoy = hoyISO();

  return (
    <div>
      <nav aria-label="Estás en" className="mb-4 text-ui text-ink-40">
        <Link href="/panel/finanzas/cuenta" className="hover:text-ink-60">
          Cuenta corriente
        </Link>
        <span className="mx-1.5">/</span>
        <span className="font-semibold text-ink">{nombre}</span>
      </nav>

      <div className="surface-card mb-4 px-5 py-4">
        <p className="text-label font-semibold tracking-[0.06em] text-ink-60 uppercase">
          Saldo total
        </p>
        <p className="mt-1 font-brand text-h3 font-bold text-ink tabular-nums">
          {formatearPesos(saldoTotal)}
        </p>
      </div>

      <ul className="flex flex-col gap-3">
        {deudas.map((d) => {
          const saldada = d.saldo <= 0;
          return (
            <li key={d.id} className="surface-card px-4 py-3 sm:px-5">
              <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-1">
                <div className="min-w-0">
                  <p className="truncate text-ui text-ink">{d.concepto}</p>
                  <p className="text-label text-ink-60 tabular-nums">
                    {formatearFecha(d.fecha)} · {formatearPesos(d.monto)}
                    {d.cobrado > 0 && !saldada && <> · cobrado {formatearPesos(d.cobrado)}</>}
                  </p>
                </div>
                <div className="flex items-center gap-3">
                  {saldada ? (
                    <span className="inline-flex items-center gap-1.5 rounded-md bg-success-soft px-3 py-1.5 text-ui font-semibold text-success">
                      ✓ Saldado
                    </span>
                  ) : (
                    <span className="text-ui font-semibold text-ink tabular-nums">
                      Debe {formatearPesos(d.saldo)}
                    </span>
                  )}
                </div>
              </div>

              {!saldada && !suspendido && (
                <div className="mt-3">
                  <CobrarDeuda deudaId={d.id} saldo={d.saldo} hoy={hoy} />
                </div>
              )}
            </li>
          );
        })}
      </ul>
    </div>
  );
}

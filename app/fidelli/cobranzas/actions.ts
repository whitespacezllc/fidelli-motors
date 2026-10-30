"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { obtenerSesion } from "@/lib/auth/session";
import { PERIODOS, type Periodo } from "@/lib/fidelli/plan";

async function exigirSuperadmin() {
  const sesion = await obtenerSesion();
  if (!sesion) redirect("/login");
  if (sesion.rol !== "superadmin") redirect("/panel");
  return sesion;
}

const MENSAJES: Record<string, string> = {
  deposito_no_existe: "Ese depósito ya no está. Recargá la pantalla.",
  deposito_ya_resuelto: "Ese depósito ya se resolvió. Recargá la pantalla para ver cómo quedó.",
  periodo_vacio: "Elegí a qué período se acredita.",
  nota_vacia: "Para descartarlo, contá en una línea qué pasó con esa plata.",
  accion_invalida: "No se entendió qué hacer con el depósito.",
  sin_suscripcion: "Este lubricentro no tiene ninguna suscripción a la que acreditar.",
};

function traducir(mensaje: string): string {
  if (/fetch|network|conexión|ECONNREFUSED/i.test(mensaje)) {
    return "Se cortó la conexión a internet. No cierres esta pantalla. Cuando vuelva la señal, probá de nuevo.";
  }
  for (const [clave, texto] of Object.entries(MENSAJES)) {
    if (mensaje.includes(clave)) return texto;
  }
  return "No se pudo guardar. Probá de nuevo en un momento.";
}

// ============================================================
// Resolver un depósito a confirmar (20261031100000)
//
// Un depósito al CVU dedicado que no coincidió con el monto exacto de
// ningún período lo decide una persona: se acredita a un período (una
// fila en pagos con la transacción Y quién decidió) o se descarta con una
// nota. La transacción entera vive en resolver_deposito_cresium().
// ============================================================
export type EstadoResolucion = { error?: string; ok?: string };

export async function resolverDeposito(
  _prev: EstadoResolucion,
  formData: FormData,
): Promise<EstadoResolucion> {
  await exigirSuperadmin();
  const deposito = String(formData.get("deposito_id") ?? "");
  const accion = String(formData.get("accion") ?? "");
  const periodo = String(formData.get("periodo") ?? "");
  const nota = String(formData.get("nota") ?? "").trim();

  if (!deposito) return { error: MENSAJES.deposito_no_existe };
  if (accion !== "acreditar" && accion !== "descartar") return { error: MENSAJES.accion_invalida };
  if (accion === "acreditar" && !PERIODOS.includes(periodo as Periodo)) {
    return { error: MENSAJES.periodo_vacio };
  }
  if (accion === "descartar" && !nota) return { error: MENSAJES.nota_vacia };

  const supabase = await createClient();
  const { data, error } = await supabase.rpc("resolver_deposito_cresium", {
    p_deposito: deposito,
    p_accion: accion,
    p_periodo: accion === "acreditar" ? (periodo as Periodo) : undefined,
    p_nota: nota || undefined,
  });
  if (error) return { error: traducir(error.message) };

  revalidatePath("/fidelli/cobranzas");
  revalidatePath("/fidelli");
  const r = data as { resultado?: string; vencimiento?: string } | null;
  return {
    ok:
      r?.resultado === "acreditado"
        ? `Acreditado. El vencimiento quedó en ${r.vencimiento ?? "la fecha nueva"}.`
        : "Descartado. Queda registrado con tu nota.",
  };
}

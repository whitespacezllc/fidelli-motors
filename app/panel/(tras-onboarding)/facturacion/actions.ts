"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { sesionParaEscribir } from "@/lib/auth/session";
import type { CondicionReceptor } from "@/lib/facturacion/tipos";

export type ResultadoBorrador = { error?: string; id?: string };

const MENSAJES: Record<string, string> = {
  emisor_sin_condicion_iva:
    "Antes de facturar, cargá tu condición frente al IVA en Mi cuenta → Datos de la empresa.",
  presupuesto_no_encontrado: "No encontramos ese presupuesto.",
  receptor_condicion_invalida: "Elegí la condición de tu cliente frente al IVA.",
  receptor_cuit_invalido: "El CUIT del cliente tiene que tener once números.",
  tipo_comprobante_indeterminado:
    "No pudimos determinar la letra del comprobante. Revisá tu condición frente al IVA.",
};

// Arma el comprobante en estado BORRADOR desde un presupuesto. No emite nada
// contra ARCA: la base calcula la letra y el IVA y crea el borrador.
// sesionParaEscribir comprueba sesión, tenant, no suspendido y el módulo; el
// RLS es la segunda capa.
export async function armarBorrador(
  _prev: ResultadoBorrador,
  datos: {
    presupuestoId: string;
    receptorCondicion: CondicionReceptor;
    receptorCuit: string;
    receptorNombre: string;
  },
): Promise<ResultadoBorrador> {
  await sesionParaEscribir("facturacion");

  const supabase = await createClient();
  const { data, error } = await supabase.rpc("armar_comprobante_desde_presupuesto", {
    p_presupuesto_id: datos.presupuestoId,
    p_receptor_condicion: datos.receptorCondicion,
    p_receptor_cuit: datos.receptorCuit.trim() || undefined,
    p_receptor_nombre: datos.receptorNombre.trim() || undefined,
  });

  if (error) {
    const clave = Object.keys(MENSAJES).find((k) => error.message.includes(k));
    return {
      error: clave
        ? MENSAJES[clave]
        : "No se pudo armar el comprobante. Probá de nuevo en un momento.",
    };
  }

  revalidatePath("/panel/facturacion");
  return { id: (data as { id: string }).id };
}

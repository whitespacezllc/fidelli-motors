import type { Metadata } from "next";
import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { obtenerSesion, featureHabilitada } from "@/lib/auth/session";
import { BloqueoPlan } from "@/components/panel/bloqueo-plan";
import { CabeceraSeccion } from "@/components/panel/cabecera-seccion";
import { FormConfigFiscal } from "@/components/facturacion/form-config-fiscal";
import { configDesdeFila } from "@/lib/facturacion/config";
import { guardarConfigFiscal } from "./actions";

export const metadata: Metadata = { title: "Configuración fiscal" };

// La config fiscal del tenant para facturar: punto de venta, modo de precios
// e IVA default. El modelo de credenciales (cómo autoriza el taller) es de la
// rebanada 2 y no aparece acá todavía.
export default async function PaginaConfigFiscal() {
  const sesion = await obtenerSesion();
  if (!featureHabilitada(sesion, "facturacion")) {
    return <BloqueoPlan funcion="Facturación" />;
  }

  const supabase = await createClient();
  const [configRes, empresaRes] = await Promise.all([
    supabase
      .from("config_facturacion")
      .select("punto_venta, precios_incluyen_iva, iva_alicuota_default")
      .maybeSingle(),
    supabase.from("datos_empresa").select("condicion_iva").maybeSingle(),
  ]);

  const config = configDesdeFila(configRes.data);
  const condicionEmisor = empresaRes.data?.condicion_iva ?? null;

  return (
    <div className="mx-auto max-w-2xl">
      <nav aria-label="Estás en" className="mb-4 text-ui text-ink-40">
        <Link href="/panel/facturacion" className="hover:text-ink-60">
          Facturación
        </Link>
        <span className="mx-1.5">/</span>
        <span className="font-semibold text-ink">Configuración fiscal</span>
      </nav>

      <CabeceraSeccion titulo="Configuración fiscal" />

      <p className="mb-6 text-ui text-ink-60">
        Lo que hace falta para facturar con tu CUIT. Tu razón social, CUIT y condición frente al IVA
        se cargan en{" "}
        <Link href="/panel/cuenta" className="underline underline-offset-4 hover:text-ink">
          Mi cuenta
        </Link>
        .
      </p>

      <FormConfigFiscal
        accion={guardarConfigFiscal}
        inicial={config}
        condicionEmisor={condicionEmisor}
      />
    </div>
  );
}

import { createClient } from "@/lib/supabase/server";
import { FormDatosEmpresa } from "@/components/empresa/form-datos-empresa";
import { guardarDatosEmpresaFidelli } from "@/app/fidelli/[id]/actions";
import { empresaDesdeFila } from "@/lib/datos-empresa";
import { formatearFechaHora } from "@/lib/fechas";
import type { Tenant } from "./tipos";

// Los datos de la empresa del lubricentro —quién emite sus presupuestos—,
// con el MISMO formulario que él tiene en Mi cuenta y la misma puerta
// (guardar_datos_empresa). Es lo único de la solapa Datos que se edita:
// existe para cargárselos el día que los pasa por WhatsApp, y el dueño los
// ve y los corrige después desde su panel.
//
// El .eq() no es de adorno: un superadmin lee la tabla entera, y sin el
// filtro esta pantalla mostraría la empresa de cualquier lubricentro.
export async function VistaEmpresa({ tenant }: { tenant: Tenant }) {
  const supabase = await createClient();
  const { data } = await supabase
    .from("datos_empresa")
    .select(
      `razon_social, cuit, condicion_iva, domicilio, telefono, email, updated_at,
       usuarios!actualizado_por(nombre, rol)`,
    )
    .eq("lubricentro_id", tenant.id)
    .maybeSingle();

  const quien = data?.usuarios
    ? data.usuarios.rol === "superadmin"
      ? `cargados por Fidelli (${data.usuarios.nombre})`
      : `cargados por el lubricentro (${data.usuarios.nombre})`
    : null;

  return (
    <section id="datos-empresa" className="surface-card max-w-2xl p-5">
      <h2 className="mb-3 font-brand text-ui font-bold tracking-[0.04em] text-ink-60 uppercase">
        Datos de la empresa
      </h2>
      <FormDatosEmpresa
        accion={guardarDatosEmpresaFidelli.bind(null, tenant.id)}
        inicial={empresaDesdeFila(data)}
        ayuda="Salen en el encabezado de sus presupuestos, y solo ahí. Es el mismo formulario que el dueño tiene en Mi cuenta: lo que cargues acá lo ve y lo puede corregir él. Vacíos, el presupuesto lleva solo su nombre y su logo."
      />
      {data && (
        <p className="mt-4 text-label text-ink-60 tabular-nums">
          Última vez que se guardaron: {formatearFechaHora(data.updated_at)}
          {quien ? ` · ${quien}` : ""}
        </p>
      )}
    </section>
  );
}

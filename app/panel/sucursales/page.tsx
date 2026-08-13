import type { Metadata } from "next";
import { createClient } from "@/lib/supabase/server";
import { panelSuspendido } from "@/lib/auth/session";
import { CabeceraSeccion } from "@/components/panel/cabecera-seccion";
import { AccionBloqueada } from "@/components/panel/bloqueo-suspension";
import { EstadoVacio } from "@/components/ui/estado-vacio";
import { FilaSucursal } from "@/components/sucursales/fila-sucursal";
import { DialogSucursal } from "@/components/sucursales/dialog-sucursal";

export const metadata: Metadata = { title: "Sucursales" };

export default async function PaginaSucursales() {
  const supabase = await createClient();
  const suspendido = await panelSuspendido();

  // RLS filtra por tenant solo. Activas primero, después por nombre.
  const { data } = await supabase
    .from("sucursales")
    .select("id, nombre, direccion, telefono, horarios, activa")
    .order("activa", { ascending: false })
    .order("nombre");

  const sucursales = data ?? [];

  return (
    <div>
      <CabeceraSeccion titulo="Sucursales">
        {sucursales.length > 0 &&
          (suspendido ? (
            <AccionBloqueada etiqueta="+ Nueva sucursal" />
          ) : (
            <DialogSucursal />
          ))}
      </CabeceraSeccion>

      {sucursales.length === 0 ? (
        <EstadoVacio
          icono={<span aria-hidden>📍</span>}
          titulo="Todavía no cargaste ninguna sucursal"
          descripcion="Cada service se etiqueta con la sucursal donde se hizo. Cargá la primera para poder empezar."
        >
          {suspendido ? (
            <AccionBloqueada etiqueta="+ Cargar la primera sucursal" />
          ) : (
            <DialogSucursal etiquetaTrigger="+ Cargar la primera sucursal" />
          )}
        </EstadoVacio>
      ) : (
        <ul className="surface-card px-4 sm:px-5">
          {sucursales.map((s) => (
            <FilaSucursal key={s.id} sucursal={s} suspendido={suspendido} />
          ))}
        </ul>
      )}
    </div>
  );
}

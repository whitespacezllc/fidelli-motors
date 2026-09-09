import type { Metadata } from "next";
import { createClient } from "@/lib/supabase/server";
import { panelSuspendido } from "@/lib/auth/session";
import { CabeceraSeccion } from "@/components/panel/cabecera-seccion";
import { EstadoVacio } from "@/components/ui/estado-vacio";
import { AccionBloqueada } from "@/components/panel/bloqueo-suspension";
import { IconoWhatsapp } from "@/components/iconos";
import { DialogMensaje } from "@/components/mensajes/dialog-mensaje";
import { FilaMensaje } from "@/components/mensajes/fila-mensaje";
import { formatearKm } from "@/lib/renglones";
import type { VariablesMensaje } from "@/lib/contacto";

export const metadata: Metadata = { title: "Mensajes" };

// Si el tenant no tiene ni un vehículo, la vista previa usa esto y lo
// aclara. Con el primero real que aparezca, el ejemplo pasa a ser suyo.
const EJEMPLO_GENERICO: VariablesMensaje = {
  nombre: "Pedro",
  vehiculo: "Chevrolet Corsa",
  patente: "ABC 123",
  proximo_km: "58.000",
};

// La pantalla que alimenta el botón de WhatsApp del panel de próximos: acá
// se escribe QUÉ dice ese mensaje, y con qué tono.
export default async function PaginaMensajes() {
  const supabase = await createClient();
  const suspendido = await panelSuspendido();

  // Los mensajes del tenant, y un vehículo real para la vista previa. El
  // primero de próximos services es el mejor ejemplo: es exactamente el
  // tipo de cliente al que este mensaje le va a llegar.
  const [mensajesRes, previewRes] = await Promise.all([
    supabase
      .from("mensaje_templates")
      .select("id, tono, contenido, contenido_pendiente, activo")
      .order("activo", { ascending: false })
      .order("created_at"),
    supabase
      .from("vista_proximos_service")
      .select("cliente_nombre, marca, modelo, patente, prox_service_km")
      .limit(1)
      .maybeSingle(),
  ]);

  const mensajes = mensajesRes.data ?? [];
  const p = previewRes.data;

  const ejemploEsReal = Boolean(p?.patente);
  const ejemplo: VariablesMensaje = ejemploEsReal
    ? {
        nombre: p!.cliente_nombre ?? "Cliente",
        vehiculo:
          [p!.marca, p!.modelo].filter(Boolean).join(" ") || "tu vehículo",
        patente: p!.patente ?? "",
        proximo_km: p!.prox_service_km
          ? formatearKm(p!.prox_service_km)
          : "10.000",
      }
    : EJEMPLO_GENERICO;

  return (
    <div className="mx-auto max-w-2xl">
      <CabeceraSeccion titulo="Mensajes">
        {mensajes.length > 0 &&
          (suspendido ? (
            <AccionBloqueada etiqueta="+ Nuevo mensaje" />
          ) : (
            <DialogMensaje ejemplo={ejemplo} ejemploEsReal={ejemploEsReal} />
          ))}
      </CabeceraSeccion>

      <p className="mb-5 -mt-3 text-ui text-ink-60">
        El mensaje <span className="font-semibold text-ink">en uso</span> es el
        que se manda desde Próximos services, con los datos de cada cliente ya
        puestos.
      </p>

      {mensajes.length === 0 ? (
        // No debería pasar: todo tenant nace con sus tres tonos. Pero si
        // alguien borró hasta el último, el camino de vuelta está acá.
        <EstadoVacio
          icono={<IconoWhatsapp className="size-6" />}
          titulo="No te queda ningún mensaje"
          descripcion="Sin un mensaje activo, el botón de WhatsApp de A quién llamar no funciona. Creá uno y activalo."
        >
          {suspendido ? (
            <AccionBloqueada etiqueta="+ Crear el primero" />
          ) : (
            <DialogMensaje
              ejemplo={ejemplo}
              ejemploEsReal={ejemploEsReal}
              etiquetaTrigger="+ Crear el primero"
              variante="primario"
            />
          )}
        </EstadoVacio>
      ) : (
        <ul className="flex flex-col gap-3">
          {mensajes.map((m) => (
            <FilaMensaje
              key={m.id}
              mensaje={m}
              ejemplo={ejemplo}
              ejemploEsReal={ejemploEsReal}
              suspendido={suspendido}
            />
          ))}
        </ul>
      )}
    </div>
  );
}

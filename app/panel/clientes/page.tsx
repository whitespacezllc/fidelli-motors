import type { Metadata } from "next";
import { createClient } from "@/lib/supabase/server";
import { panelSuspendido } from "@/lib/auth/session";
import { CabeceraSeccion } from "@/components/panel/cabecera-seccion";
import { AccionBloqueada } from "@/components/panel/bloqueo-suspension";
import { EstadoVacio } from "@/components/ui/estado-vacio";
import { Buscador } from "@/components/ui/buscador";
import { IconoClientes } from "@/components/iconos";
import { DialogCliente } from "@/components/clientes/dialog-cliente";
import { FilaCliente } from "@/components/clientes/fila-cliente";
import { BotonExportar } from "@/components/clientes/boton-exportar";
import { filtroClientes } from "@/lib/clientes";

export const metadata: Metadata = { title: "Clientes" };

export default async function PaginaClientes({
  searchParams,
}: {
  searchParams: Promise<{ q?: string }>;
}) {
  const { q } = await searchParams;
  const supabase = await createClient();
  const suspendido = await panelSuspendido();

  // El filtro es compartido con el export a Excel: lo que se ve filtrado
  // es exactamente lo que se exporta.
  const { termino, filtros } = filtroClientes(q);
  const buscando = termino.length > 0;

  // Una consulta contra vista_clientes, que ya trae los agregados (cantidad de
  // vehículos y último service) resueltos en Postgres. RLS filtra por tenant.
  let consulta = supabase
    .from("vista_clientes")
    .select("id, nombre, telefono, cantidad_vehiculos, ultimo_service_fecha, ultima_visita_fecha")
    .order("nombre");

  if (filtros) consulta = consulta.or(filtros);

  const { data } = await consulta;

  // Los tipos generados dan todas las columnas de una vista como nullable:
  // Postgres no puede probar NOT NULL a través de un group by. Se acomodan
  // acá, en el borde, en vez de repartir "!" por los componentes.
  const clientes = (data ?? []).flatMap((c) =>
    c.id && c.nombre
      ? [
          {
            id: c.id,
            nombre: c.nombre,
            telefono: c.telefono ?? "",
            cantidad_vehiculos: c.cantidad_vehiculos ?? 0,
            ultimo_service_fecha: c.ultimo_service_fecha,
            ultima_visita_fecha: c.ultima_visita_fecha,
          },
        ]
      : [],
  );

  return (
    <div>
      <CabeceraSeccion titulo="Clientes">
        <div className="flex items-center gap-2.5">
          <BotonExportar q={q} hayResultados={clientes.length > 0} />
          {suspendido ? (
            <AccionBloqueada etiqueta="+ Nuevo cliente" />
          ) : (
            <DialogCliente />
          )}
        </div>
      </CabeceraSeccion>

      <div className="mb-5">
        <Buscador
          ruta="/panel/clientes"
          valor={q}
          placeholder="Buscar por nombre, teléfono o patente…"
          etiqueta="Buscar clientes"
        />
      </div>

      {clientes.length > 0 ? (
        <ul className="surface-card px-4 sm:px-5">
          {clientes.map((c) => (
            <FilaCliente key={c.id} cliente={c} />
          ))}
        </ul>
      ) : buscando ? (
        <EstadoVacio
          titulo={`Ningún cliente coincide con “${termino}”`}
          descripcion="Probá con el apellido, otro teléfono o la patente del auto. Si es la primera vez que viene, el cliente se crea solo al cargarle el primer trabajo."
        />
      ) : (
        <EstadoVacio
          icono={<IconoClientes className="size-6" />}
          titulo="Todavía no tenés clientes cargados"
          descripcion="Acá vas a ver a quién le hacés los trabajos, con sus autos y cuándo vino por última vez."
        >
          {suspendido ? (
            <AccionBloqueada etiqueta="+ Cargar el primer cliente" />
          ) : (
            <DialogCliente etiquetaTrigger="+ Cargar el primer cliente" />
          )}
        </EstadoVacio>
      )}
    </div>
  );
}

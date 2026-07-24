import type { Metadata } from "next";
import { createClient } from "@/lib/supabase/server";
import { CabeceraSeccion } from "@/components/panel/cabecera-seccion";
import { EstadoVacio } from "@/components/ui/estado-vacio";
import { Buscador } from "@/components/ui/buscador";
import { IconoClientes } from "@/components/iconos";
import { DialogCliente } from "@/components/clientes/dialog-cliente";
import { FilaCliente } from "@/components/clientes/fila-cliente";
import { normalizar, normalizarPatente, sanitizarBusqueda } from "@/lib/texto";

export const metadata: Metadata = { title: "Clientes — Fidelli Motors" };

export default async function PaginaClientes({
  searchParams,
}: {
  searchParams: Promise<{ q?: string }>;
}) {
  const { q } = await searchParams;
  const supabase = await createClient();

  const termino = sanitizarBusqueda(q ?? "");
  const buscando = termino.length > 0;

  // Una consulta contra vista_clientes, que ya trae los agregados (cantidad de
  // vehículos y último service) resueltos en Postgres. RLS filtra por tenant.
  let consulta = supabase
    .from("vista_clientes")
    .select("id, nombre, telefono, cantidad_vehiculos, ultimo_service_fecha")
    .order("nombre");

  if (buscando) {
    // Un solo buscador contra los tres campos. El más usado es la patente: el
    // mecánico tiene el auto adelante, no al dueño.
    const texto = normalizar(termino);
    const soloDigitos = termino.replace(/\D/g, "");
    const patente = normalizarPatente(termino);

    const filtros = [`nombre_busqueda.like.*${texto}*`];
    if (soloDigitos) filtros.push(`telefono.like.*${soloDigitos}*`);
    if (patente) filtros.push(`patentes.like.*${patente}*`);

    consulta = consulta.or(filtros.join(","));
  }

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
          },
        ]
      : [],
  );

  return (
    <div>
      <CabeceraSeccion titulo="Clientes">
        <DialogCliente />
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
          descripcion="Probá con el apellido, otro teléfono o la patente del auto. Si es la primera vez que viene, el cliente se crea solo al cargarle el service."
        />
      ) : (
        <EstadoVacio
          icono={<IconoClientes className="size-6" />}
          titulo="Todavía no tenés clientes cargados"
          descripcion="Acá vas a ver a quién le hacés los services, con sus autos y cuándo vino por última vez."
        >
          <DialogCliente etiquetaTrigger="+ Cargar el primer cliente" />
        </EstadoVacio>
      )}
    </div>
  );
}

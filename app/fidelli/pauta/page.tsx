import type { Metadata } from "next";
import { createClient } from "@/lib/supabase/server";
import { hoyISO } from "@/lib/fechas";
import { FormContacto } from "@/components/fidelli/pauta/form-contacto";
import { ListaContactos } from "@/components/fidelli/pauta/lista-contactos";
import { GastoSemanal, type FilaGasto } from "@/components/fidelli/pauta/gasto-semanal";
import { TablaEmbudo } from "@/components/fidelli/pauta/tabla-embudo";
import type { TenantOpcion } from "@/components/fidelli/pauta/fila-contacto";
import {
  esAgrupar,
  esCanalFiltro,
  esFiltroEstado,
  leerEmbudo,
  lunesDe,
  primerDiaDelMesHace,
  sumarDiasIso,
  ultimosLunes,
  type Agrupar,
  type CanalFiltro,
  type Contacto,
  type FiltroEstado,
} from "@/lib/fidelli/pauta";

export const metadata: Metadata = { title: "Pauta" };

// Las semanas del gasto y del embudo semanal: un trimestre.
const SEMANAS = 12;
// Los meses del embudo mensual.
const MESES = 12;
// La lista muestra los contactos de los últimos 60 días.
const DIAS_LISTA = 60;

// ============================================================
// /fidelli/pauta: el canal pago (bloque MÉTRICAS 3). Pensada para el
// celular primero: a 390px todo entra en una columna y registrar un
// contacto son tres toques. Arriba el alta, después la lista, después el
// gasto por semana y al final el embudo.
//
// NO es un CRM: no hay etapas, responsables ni notas, y no se agregan.
// ============================================================
export default async function PaginaPauta({
  searchParams,
}: {
  searchParams: Promise<{ estado?: string; canal?: string; agrupar?: string }>;
}) {
  const params = await searchParams;
  const filtro: FiltroEstado = esFiltroEstado(params.estado) ? params.estado : "todos";
  const canal: CanalFiltro = esCanalFiltro(params.canal) ? params.canal : "todos";
  const agrupar: Agrupar = esAgrupar(params.agrupar) ? params.agrupar : "semana";

  const hoy = hoyISO();
  const lunesActual = lunesDe(hoy);
  const semanas = ultimosLunes(hoy, SEMANAS);
  const desdeGasto = semanas[semanas.length - 1];
  const desdeLista = sumarDiasIso(hoy, -DIAS_LISTA);
  const desdeEmbudo = agrupar === "semana" ? desdeGasto : primerDiaDelMesHace(hoy, MESES - 1);

  const supabase = await createClient();

  const [contactosRes, tenantsRes, gastoRes, embudoRes] = await Promise.all([
    supabase
      .from("contactos_pauta")
      .select(
        "id, fecha, canal, origen, telefono, demo_at, cierre_at, lubricentro_id, perdida_at, motivo_perdida, lubricentros(nombre)",
      )
      .gte("fecha", desdeLista)
      .order("fecha", { ascending: false })
      .order("created_at", { ascending: false }),
    // Los tenants para «Cerró»: los activos, el más nuevo primero (el que
    // acaba de nacer es el caso normal).
    supabase
      .from("lubricentros")
      .select("id, nombre, slug")
      .eq("activo", true)
      .order("created_at", { ascending: false }),
    supabase.from("gasto_pauta").select("semana, canal, monto_usd").gte("semana", desdeGasto),
    supabase.rpc("embudo_pauta", {
      p_desde: desdeEmbudo,
      p_hasta: hoy,
      p_agrupar: agrupar,
      p_canal: canal === "todos" ? undefined : canal,
    }),
  ]);

  const contactos: Contacto[] = ((contactosRes.data ?? []) as unknown as Array<
    Omit<Contacto, "tenant_nombre"> & { lubricentros: { nombre: string } | null }
  >).map((c) => ({
    id: c.id,
    fecha: c.fecha,
    canal: c.canal,
    origen: c.origen,
    telefono: c.telefono,
    demo_at: c.demo_at,
    cierre_at: c.cierre_at,
    lubricentro_id: c.lubricentro_id,
    perdida_at: c.perdida_at,
    motivo_perdida: c.motivo_perdida,
    tenant_nombre: c.lubricentros?.nombre ?? null,
  }));
  const tenants = (tenantsRes.data ?? []) as TenantOpcion[];
  const gasto: FilaGasto[] = ((gastoRes.data ?? []) as unknown as FilaGasto[]).map((g) => ({
    semana: g.semana,
    canal: g.canal,
    monto_usd: Number(g.monto_usd),
  }));
  const embudo = leerEmbudo(embudoRes.data);

  return (
    <div className="flex flex-col gap-5">
      <div>
        <h1 className="font-brand text-h2 font-bold text-ink">Pauta</h1>
        <p className="mt-1 max-w-2xl text-ui text-ink-60">
          Cada mensaje que entra por Meta o por Google se registra acá en tres toques. Después,
          con un toque más, si se le mandó la demo, si cerró y con quién, o si se perdió.
        </p>
      </div>

      <FormContacto hoy={hoy} />

      <ListaContactos
        contactos={contactos}
        tenants={tenants}
        hoy={hoy}
        filtro={filtro}
        canal={canal}
        params={params}
      />

      <GastoSemanal semanas={semanas} gasto={gasto} lunesActual={lunesActual} />

      <TablaEmbudo filas={embudo} agrupar={agrupar} canal={canal} params={params} />
    </div>
  );
}

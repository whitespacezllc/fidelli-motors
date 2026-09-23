import type { Metadata } from "next";
import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { leerEmbudo } from "@/lib/fidelli/pauta";
import {
  UNIDAD,
  leerAltasBajas,
  leerChurn,
  leerCohortesIngresos,
  leerCohortesLogos,
  leerMovimientos,
  leerRango,
  leerTrabajos,
  mesEnCursoAR,
  primerDiaDelMes,
  ultimoDiaDelMes,
} from "@/lib/fidelli/crecimiento";
import { BarraRango } from "@/components/fidelli/crecimiento/barra-rango";
import {
  OracionError,
  Seccion,
} from "@/components/fidelli/crecimiento/seccion";
import { TablaMovimientos } from "@/components/fidelli/crecimiento/tabla-movimientos";
import { GraficoAltasBajas } from "@/components/fidelli/crecimiento/grafico-altas-bajas";
import { TablaChurn } from "@/components/fidelli/crecimiento/tabla-churn";
import { TablaCohortesLogos } from "@/components/fidelli/crecimiento/tabla-cohortes-logos";
import { TablaCohortesIngresos } from "@/components/fidelli/crecimiento/tabla-cohortes-ingresos";
import { TablaTrabajos } from "@/components/fidelli/crecimiento/tabla-trabajos";
import { EmbudoMensual } from "@/components/fidelli/crecimiento/embudo-mensual";
import { DataRoom } from "@/components/fidelli/crecimiento/data-room";

export const metadata: Metadata = { title: "Crecimiento" };

// ============================================================
// /fidelli/crecimiento (bloque MÉTRICAS 4): lo que un comprador va a
// mirar. Seis preguntas, cada una con su tabla (o su gráfico) y su botón
// de exportar, y al final el data room. Todo sale de las seis funciones
// de 20260925100000 y del embudo de pauta, en una sola Promise.all; nada
// se recalcula acá, y una lectura que falla se dice en su sección (nunca
// una tabla vacía sin explicación).
//
// El rango y la moneda viven en la URL. La moneda vale SOLO para las
// secciones monetarias: a («¿De dónde viene el MRR?») y d («¿Pagan más con
// el tiempo?», que además es siempre en dólares por definición).
// ============================================================
export default async function PaginaCrecimiento({
  searchParams,
}: {
  searchParams: Promise<{ desde?: string; hasta?: string; moneda?: string }>;
}) {
  const rango = leerRango(await searchParams);
  const { desde, hasta, moneda } = rango;
  // Las funciones toman días: el 1 del primer mes y el último del último.
  const p_desde = primerDiaDelMes(desde);
  const p_hasta = ultimoDiaDelMes(hasta);
  const mesEnCurso = mesEnCursoAR();

  const supabase = await createClient();

  const [
    movimientosRes,
    altasBajasRes,
    churnRes,
    logosRes,
    ingresosRes,
    trabajosRes,
    embudoRes,
  ] = await Promise.all([
    supabase.rpc("movimientos_mrr", { p_desde, p_hasta, p_moneda: moneda }),
    supabase.rpc("altas_bajas_por_mes", { p_desde, p_hasta }),
    supabase.rpc("churn_por_mes", { p_desde, p_hasta }),
    supabase.rpc("cohortes_logos", { p_desde, p_hasta }),
    supabase.rpc("cohortes_ingresos", { p_desde, p_hasta }),
    supabase.rpc("trabajos_por_mes", { p_desde, p_hasta }),
    supabase.rpc("embudo_pauta", { p_desde, p_hasta, p_agrupar: "mes" }),
  ]);

  const movimientos = leerMovimientos(movimientosRes.data);
  const altasBajas = leerAltasBajas(altasBajasRes.data);
  const churn = leerChurn(churnRes.data);
  const logos = leerCohortesLogos(logosRes.data);
  const ingresos = leerCohortesIngresos(ingresosRes.data);
  const trabajos = leerTrabajos(trabajosRes.data);
  const embudo = leerEmbudo(embudoRes.data);

  // Los parámetros que viajan a cada CSV: el rango siempre; la moneda solo
  // donde el archivo cambia con ella (los movimientos). Un `moneda=ars` en
  // la URL de un CSV que no la mira prometería algo que no es.
  const periodo = { desde, hasta };
  const periodoConMoneda = { desde, hasta, moneda };
  const enUsd = moneda === "usd";

  return (
    <div className="flex flex-col gap-5">
      <div>
        <h1 className="font-brand text-h2 font-bold text-ink">Crecimiento</h1>
        <p className="mt-1 max-w-2xl text-ui text-ink-60">
          Lo que un comprador va a mirar: de dónde viene la plata, quién se
          queda y si el sistema se usa. Todo sale de las fotos diarias y de los
          eventos; nada se recalcula.
        </p>
      </div>

      <BarraRango rango={rango} mesEnCurso={mesEnCurso} />

      {/* a · el MRR, por movimiento */}
      <Seccion
        id="mrr"
        titulo="¿De dónde viene el MRR?"
        descripcion={`Mes a mes, en ${UNIDAD[moneda]}: cuánto MRR entró por altas, reactivaciones y expansión (plan, período, módulo o descuento), cuánto salió por contracción y churn, y cuánto movió la lista de precios. Cada mes se compara con la foto del último día del mes anterior.`}
        exportar={{ recurso: "movimientos-mrr", params: periodoConMoneda }}
      >
        {movimientosRes.error ? (
          <OracionError
            funcion="movimientos_mrr"
            mensaje={movimientosRes.error.message}
          />
        ) : (
          <TablaMovimientos
            filas={movimientos}
            moneda={moneda}
            mesEnCurso={mesEnCurso}
          />
        )}
      </Seccion>

      {/* b · altas contra bajas, y el churn de cada mes */}
      <Seccion
        id="altas-bajas"
        titulo="¿Entran más de los que se van?"
        descripcion="Altas contra bajas por mes, con el neto encima. Debajo, las bajas de cada mes por tipo (involuntarias: el reloj y la falta de pago) y por origen del tenant que se fue."
        exportar={{ recurso: "altas-bajas", params: periodo }}
      >
        {altasBajasRes.error ? (
          <OracionError
            funcion="altas_bajas_por_mes"
            mensaje={altasBajasRes.error.message}
          />
        ) : (
          <GraficoAltasBajas serie={altasBajas} />
        )}
        {churnRes.error ? (
          <OracionError
            funcion="churn_por_mes"
            mensaje={churnRes.error.message}
          />
        ) : (
          <TablaChurn filas={churn} mesEnCurso={mesEnCurso} periodo={periodo} />
        )}
      </Seccion>

      {/* c · retención de logos por cohorte */}
      <Seccion
        id="cohortes"
        titulo="¿Se quedan?"
        descripcion="De cada camada de altas, qué parte seguía activa al mes 1, 2, 3, 6, 9 y 12. Solo cuentan los meses cerrados."
        exportar={{ recurso: "cohortes-logos", params: periodo }}
      >
        {logosRes.error ? (
          <OracionError
            funcion="cohortes_logos"
            mensaje={logosRes.error.message}
          />
        ) : (
          <TablaCohortesLogos filas={logos} />
        )}
      </Seccion>

      {/* d · retención de ingresos por cohorte, siempre en dólares */}
      <Seccion
        id="ingresos"
        titulo="¿Pagan más con el tiempo?"
        descripcion={`Cuánto del MRR inicial de cada cohorte sigue (GRR) y cuánto hay contando la expansión (NRR), a 3, 6 y 12 meses. Siempre en US$, por definición: neutraliza los ajustes de la lista en pesos${enUsd ? "." : "; por eso no cambia con el selector de moneda."}`}
        exportar={{ recurso: "cohortes-ingresos", params: periodo }}
      >
        {ingresosRes.error ? (
          <OracionError
            funcion="cohortes_ingresos"
            mensaje={ingresosRes.error.message}
          />
        ) : (
          <TablaCohortesIngresos filas={ingresos} />
        )}
      </Seccion>

      {/* e · uso */}
      <Seccion
        id="uso"
        titulo="¿Usan el sistema?"
        descripcion="Trabajos cargados por mes y por tipo, autos que volvieron por un recordatorio, recordatorios disparados y escaneos de patente. La suma de las fotos diarias de cada mes."
        exportar={{ recurso: "trabajos", params: periodo }}
      >
        {trabajosRes.error ? (
          <OracionError
            funcion="trabajos_por_mes"
            mensaje={trabajosRes.error.message}
          />
        ) : (
          <TablaTrabajos filas={trabajos} mesEnCurso={mesEnCurso} />
        )}
      </Seccion>

      {/* f · el embudo de pauta, por mes */}
      <Seccion
        id="pauta"
        titulo="¿Rinde la pauta?"
        descripcion="El embudo del canal pago por mes: contactos, demos, cierres, ciclo, gasto y CAC. La misma tabla de Pauta, agrupada por mes y con todos los canales."
        exportar={{ recurso: "embudo-pauta", params: periodo }}
        accion={
          // A la pauta agrupada por mes, no a su default por semana: la
          // persona viene de mirar el embudo mensual y llega al mismo
          // corte, con los selectores de canal y estado que acá no están.
          // (El contrato decía «/fidelli/pauta»; el desvío está en § 6.)
          <Link
            href="/fidelli/pauta?agrupar=mes"
            className="inline-flex min-h-9 items-center rounded-md px-3 text-ui font-semibold text-ink-60 transition-colors hover:bg-surface hover:text-ink"
          >
            Ir a pauta
          </Link>
        }
      >
        {embudoRes.error ? (
          <OracionError
            funcion="embudo_pauta"
            mensaje={embudoRes.error.message}
          />
        ) : (
          <EmbudoMensual filas={embudo} />
        )}
      </Seccion>

      <DataRoom periodo={periodoConMoneda} />
    </div>
  );
}

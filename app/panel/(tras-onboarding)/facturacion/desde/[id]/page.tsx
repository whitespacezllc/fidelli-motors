import type { Metadata } from "next";
import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { obtenerSesion, featureHabilitada } from "@/lib/auth/session";
import { BloqueoPlan } from "@/components/panel/bloqueo-plan";
import { CabeceraSeccion } from "@/components/panel/cabecera-seccion";
import { EstadoVacio } from "@/components/ui/estado-vacio";
import { clasesBoton } from "@/components/ui/boton";
import { ArmarComprobante } from "@/components/facturacion/armar-comprobante";
import { configDesdeFila } from "@/lib/facturacion/config";
import { esCondicionIva } from "@/lib/datos-empresa";
import type { CondicionEmisor } from "@/lib/facturacion/tipos";

export const metadata: Metadata = { title: "Facturar presupuesto" };

type Props = { params: Promise<{ id: string }> };

// "Facturar este presupuesto": arma el preview del comprobante que
// corresponde. La emisión real llega después; esto deja el borrador listo.
export default async function PaginaFacturarPresupuesto({ params }: Props) {
  const { id } = await params;
  const sesion = await obtenerSesion();
  if (!featureHabilitada(sesion, "facturacion")) {
    return <BloqueoPlan funcion="Facturación" />;
  }

  const supabase = await createClient();
  const [presupuestoRes, empresaRes, configRes] = await Promise.all([
    supabase
      .from("presupuestos")
      .select(
        `id, numero, destinatario_nombre,
         clientes(nombre, cuit),
         presupuesto_items(orden, descripcion, cantidad, precio_unitario)`,
      )
      .eq("id", id)
      .maybeSingle(),
    supabase.from("datos_empresa").select("condicion_iva").maybeSingle(),
    supabase
      .from("config_facturacion")
      .select("punto_venta, precios_incluyen_iva, iva_alicuota_default")
      .maybeSingle(),
  ]);

  const p = presupuestoRes.data;
  if (!p) {
    return (
      <EstadoVacio
        titulo="No encontramos ese presupuesto"
        descripcion="Puede que el enlace esté mal. Desde el listado podés buscarlo por número."
      >
        <Link href="/panel/presupuestos" className={clasesBoton("secundario", "md")}>
          Ir al listado
        </Link>
      </EstadoVacio>
    );
  }

  const condicionEmisor = empresaRes.data?.condicion_iva;
  if (!esCondicionIva(condicionEmisor)) {
    return (
      <div className="mx-auto max-w-2xl">
        <CabeceraSeccion titulo="Facturar presupuesto" />
        <EstadoVacio
          titulo="Primero cargá tu condición frente al IVA"
          descripcion="Es lo que define qué factura emitís (A, B o C). Se carga en Mi cuenta → Datos de la empresa."
        >
          <Link href="/panel/cuenta" className={clasesBoton("secundario", "md")}>
            Ir a Mi cuenta
          </Link>
        </EstadoVacio>
      </div>
    );
  }

  const config = configDesdeFila(configRes.data);
  const items = [...(p.presupuesto_items ?? [])]
    .sort((a, b) => a.orden - b.orden)
    .map((i) => ({
      descripcion: i.descripcion,
      cantidad: Number(i.cantidad),
      precioUnitario: Number(i.precio_unitario),
    }));

  const cliente = p.clientes as { nombre: string | null; cuit: string | null } | null;
  const receptorInicial = {
    nombre: cliente?.nombre ?? p.destinatario_nombre ?? "",
    cuit: cliente?.cuit ?? "",
  };

  return (
    <div className="mx-auto max-w-4xl">
      <nav aria-label="Estás en" className="mb-4 text-ui text-ink-40">
        <Link href={`/panel/presupuestos/${p.id}`} className="hover:text-ink-60">
          Presupuesto N° <span className="tabular-nums">{p.numero}</span>
        </Link>
        <span className="mx-1.5">/</span>
        <span className="font-semibold text-ink">Facturar</span>
      </nav>

      <CabeceraSeccion titulo="Facturar presupuesto" />

      <p className="mb-6 text-ui text-ink-60">
        Elegí la condición de tu cliente y mirá el comprobante que corresponde. Todavía es un
        borrador: la factura electrónica con CAE llega en la próxima entrega.
      </p>

      {items.length === 0 ? (
        <EstadoVacio
          titulo="Este presupuesto no tiene renglones"
          descripcion="Agregá al menos un ítem al presupuesto para poder facturarlo."
        />
      ) : (
        <ArmarComprobante
          presupuestoId={p.id}
          items={items}
          emisor={condicionEmisor as CondicionEmisor}
          preciosIncluyenIva={config.preciosIncluyenIva}
          alicuotaDefault={config.alicuotaDefault}
          receptorInicial={receptorInicial}
        />
      )}
    </div>
  );
}

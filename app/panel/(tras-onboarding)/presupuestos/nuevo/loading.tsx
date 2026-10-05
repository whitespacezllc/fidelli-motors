import { Esqueleto } from "@/components/ui/esqueleto";
import { CabeceraSeccion } from "@/components/panel/cabecera-seccion";
import { FormularioPresupuestoGris } from "@/components/presupuestos/formulario-gris";

// Nuevo presupuesto, en gris. El título es el de siempre; «Duplicar» se
// conoce recién con la pantalla.
export default function CargandoNuevoPresupuesto() {
  return (
    <Esqueleto className="mx-auto max-w-2xl">
      <CabeceraSeccion titulo="Nuevo presupuesto" />
      <FormularioPresupuestoGris />
    </Esqueleto>
  );
}

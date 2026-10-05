import { CampoGris, Esqueleto, Marco, Pieza } from "@/components/ui/esqueleto";
import { CabeceraSeccion } from "@/components/panel/cabecera-seccion";

// Mi cuenta, en gris: la misma columna angosta, y un bloque por sección
// (el título chico arriba y la tarjeta): tus datos, tu marca, seguridad y
// tu plan, con sus campos. Las secciones que dependen del plan (los datos
// de la empresa, los calcos) no se dibujan: no se sabe si van a estar.
function BloqueGris({ campos, alto }: { campos: number; alto: string }) {
  return (
    <Marco>
      <Pieza className="mb-2 ml-1 h-3 w-24" />
      <div className={`surface-card flex flex-col gap-5 p-5 ${alto}`}>
        {Array.from({ length: campos }, (_, i) => (
          <CampoGris key={i} ancho={i % 2 ? "w-full" : "w-full sm:w-3/4"} />
        ))}
      </div>
    </Marco>
  );
}

export default function CargandoCuenta() {
  return (
    <Esqueleto className="mx-auto flex max-w-2xl flex-col gap-6">
      <CabeceraSeccion titulo="Mi cuenta" />
      <BloqueGris campos={2} alto="min-h-[203px]" />
      <BloqueGris campos={2} alto="min-h-[250px]" />
      <BloqueGris campos={3} alto="min-h-[352px]" />
    </Esqueleto>
  );
}

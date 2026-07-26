import Link from "next/link";
import { clasesBoton } from "@/components/ui/boton";

// El alta es una pantalla propia, no un dialog: el paso de sucursales crece
// con cada local que se agrega y no entra cómodo en una hoja modal.
export function BotonAlta({
  etiqueta = "+ Nuevo lubricentro",
}: {
  etiqueta?: string;
}) {
  return (
    <Link href="/fidelli/nuevo" className={clasesBoton("primario", "md")}>
      {etiqueta}
    </Link>
  );
}

import { CampoGris, Esqueleto, Marco, Pieza } from "@/components/ui/esqueleto";
import { CabeceraSeccion } from "@/components/panel/cabecera-seccion";

// Mi cuenta, en gris: la cabecera real, la barra de solapas en gris (no se
// sabe cuál está abierta hasta leer la URL en el servidor) y dos bloques
// como los de cualquiera de las solapas: el título chico arriba y la
// tarjeta con sus campos.
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
      <div>
        <CabeceraSeccion titulo="Mi cuenta" />
        <div className="flex gap-1 border-b border-line">
          {["w-16", "w-24", "w-24", "w-16"].map((w, i) => (
            <div key={i} className="flex h-11 items-center px-3">
              <Pieza className={`h-3.5 ${w}`} />
            </div>
          ))}
        </div>
      </div>
      <BloqueGris campos={2} alto="min-h-[203px]" />
      <BloqueGris campos={2} alto="min-h-[250px]" />
    </Esqueleto>
  );
}

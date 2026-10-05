import { Cabecera, Esqueleto, Marco, Pieza } from "@/components/ui/esqueleto";

// Mensajes, en gris: «+ Nuevo mensaje», la explicación de cuál se usa y una
// tarjeta por mensaje (el tono, el texto y sus botones).
export default function CargandoMensajes() {
  return (
    <Esqueleto className="mx-auto max-w-2xl">
      <Cabecera titulo="Mensajes" derecha={["h-11 w-37 rounded-md"]} />
      <Marco className="flex h-[41px] flex-col justify-center gap-2">
        <Pieza className="h-3.5 w-full" />
        <Pieza className="h-3.5 w-3/5" />
      </Marco>
      <div className="mt-5 flex flex-col gap-3">
        {["h-[157px]", "h-[132px]", "h-[109px]"].map((alto, i) => (
          <Marco key={i} className={`surface-card p-5 ${alto}`}>
            <div className="flex items-center justify-between gap-3">
              <Pieza className="h-5 w-32" />
              <Pieza className="h-6 w-16 rounded-sm" />
            </div>
            <Pieza className="mt-4 h-3.5 w-full" />
            <Pieza className="mt-2.5 h-3.5 w-4/5" />
          </Marco>
        ))}
      </div>
    </Esqueleto>
  );
}

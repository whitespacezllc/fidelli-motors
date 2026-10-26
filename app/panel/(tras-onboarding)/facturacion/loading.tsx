import { Cabecera, Esqueleto, FilaGris, ListaGris } from "@/components/ui/esqueleto";

// Facturación, en gris: «Configuración fiscal», el aviso y la lista de
// comprobantes (tipo, receptor, fecha, estado y total).
export default function CargandoFacturacion() {
  return (
    <Esqueleto>
      <Cabecera titulo="Facturación" derecha={["h-11 w-44 rounded-md"]} />
      <div className="mb-5 h-14 rounded-lg bg-surface" />
      <ListaGris
        filas={8}
        fila={(i) => (
          <FilaGris
            key={i}
            className="h-[58px]"
            lineas={["h-4 w-24", "h-3 w-40"]}
            derecha={["h-3 w-20", "h-4 w-24"]}
          />
        )}
      />
    </Esqueleto>
  );
}

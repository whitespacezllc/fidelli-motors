import { Cabecera, Esqueleto, Marco, Pieza } from "@/components/ui/esqueleto";

// Inicio, en gris (components/inicio/dashboard.tsx): la fecha, las cuatro
// tarjetas del mes, la franja de retención, el gráfico con la tarjeta del
// escaneo al lado y los últimos trabajos.
export default function CargandoInicio() {
  return (
    <Esqueleto>
      <Cabecera titulo="Inicio" derecha={["h-11 w-44 rounded-md", "h-11 w-34 rounded-md"]} />
      <div className="-mt-3 mb-5 flex h-5 items-center">
        <Pieza className="h-3.5 w-40" />
      </div>
      <div className="flex flex-col gap-5">
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          {[0, 1, 2, 3].map((i) => (
            <Marco key={i} className="flex h-[118px] flex-col rounded-lg border border-line px-4 py-3.5">
              <Pieza className="h-3 w-28 max-w-full" />
              <Pieza className="mt-3 h-9 w-12" />
              <Pieza className="mt-auto h-3 w-24 max-w-full" />
            </Marco>
          ))}
        </div>
        <Marco className="flex min-h-[78px] flex-wrap items-center gap-3 rounded-lg border border-line px-5 py-4">
          <Pieza className="h-4 w-36" />
          <Pieza className="h-7 w-24 rounded-md" />
          <Pieza className="h-7 w-24 rounded-md" />
          <Pieza className="h-7 w-24 rounded-md" />
          <Pieza className="ml-auto h-11 w-24 rounded-md" />
        </Marco>
        <div className="grid gap-5 lg:grid-cols-[1fr_20rem] lg:items-start">
          <Marco className="surface-card h-[369px] p-4.5 lg:h-[349px]">
            <div className="flex flex-wrap gap-4">
              <Pieza className="h-5 w-44" />
              <Pieza className="ml-auto h-9 w-48 rounded-md" />
            </div>
            <Pieza className="mt-8 h-[220px] w-full rounded-md lg:h-[230px]" />
          </Marco>
          <Marco className="h-[258px] rounded-lg border border-line px-5 py-4">
            <Pieza className="h-4 w-44" />
            <Pieza className="mt-2 h-3 w-36" />
            <Pieza className="mt-6 h-12 w-24" />
            <Pieza className="mt-3 h-3.5 w-full" />
            <Pieza className="mt-8 h-3.5 w-4/5" />
          </Marco>
        </div>
        <section>
          <h2 className="mb-3 font-brand text-body font-bold text-ink">Últimos trabajos</h2>
          <Marco como="ul" className="surface-card px-4 sm:px-5">
            {[0, 1, 2, 3, 4].map((i) => (
              <li
                key={i}
                className="flex h-[94px] flex-wrap content-center items-center gap-x-4 gap-y-2 border-b border-line last:border-b-0 lg:grid lg:h-[45px] lg:grid-cols-[8rem_7rem_1fr_10rem_6rem]"
              >
                <Pieza className="h-3 w-20" />
                <Pieza className="h-4 w-20" />
                <Pieza className="h-3 w-48 max-w-full" />
                <Pieza className="h-3 w-24" />
                <Pieza className="h-3 w-16 lg:justify-self-end" />
              </li>
            ))}
          </Marco>
        </section>
      </div>
    </Esqueleto>
  );
}

// El slug no existe, o el lubricentro está dado de baja. Los dos casos se
// ven igual a propósito: un tenant inactivo no se distingue de uno que
// nunca existió.
//
// Sin marca y sin color de tenant —no hay tenant del que sacarlos— y sin
// el rojo Motors, que en esta superficie no aparece nunca. Solo neutros.
export function LubricentroNoEncontrado() {
  return (
    <main className="flex flex-1 flex-col px-5 py-12 sm:px-8">
      <div className="m-auto w-full max-w-md text-center sm:max-w-lg">
        <h1 className="text-c-titulo font-bold sm:text-h3">
          No encontramos ese lubricentro
        </h1>
        <p className="mt-3 text-c-body text-ink-60">
          Revisá la dirección tal como figura en la calco del parasol. Si el
          código está bien, preguntale al lubricentro donde hiciste el service.
        </p>
      </div>
    </main>
  );
}

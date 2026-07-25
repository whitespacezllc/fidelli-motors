// El único vacío que ve el cliente final: el auto existe en el lubricentro
// pero todavía no tiene services cargados. No es un error ni una pantalla
// rota — es el día uno, y se cuenta como tal.
export function SinHistorial() {
  return (
    <section className="rounded-lg border border-tenant bg-tenant-soft p-5 text-center sm:p-6">
      <h2 className="text-c-titulo font-bold">Tu historial arranca hoy</h2>
      <p className="mt-2 text-c-body text-ink-60">
        Este es tu primer service con nosotros. Acá vas a ver todo lo que le
        hacemos a tu auto y cuándo te toca volver.
      </p>
    </section>
  );
}

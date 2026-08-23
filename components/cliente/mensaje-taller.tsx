// El mensaje del taller al escanear: el momento de mayor intención que
// ese cliente va a tener en todo el mes — sentado en su auto, mirando el
// teléfono, con el historial adelante. Va entre el próximo service y el
// historial: alta atención, sin tapar nada.
//
// Llega solo si corresponde (pagina_premium, vigencia viva, tenant
// activo): get_carton es quien decide, acá no hay lógica de plan.
export function MensajeTaller({
  mensaje,
  nombreLubricentro,
}: {
  mensaje: string;
  nombreLubricentro: string;
}) {
  return (
    <section
      aria-label={`Mensaje de ${nombreLubricentro}`}
      className="rounded-lg border border-line bg-base p-5"
      style={{ borderLeft: "3px solid var(--color-tenant)" }}
    >
      <p className="text-label font-semibold tracking-[0.06em] text-ink-60 uppercase">
        Mensaje de {nombreLubricentro}
      </p>
      <p className="mt-1.5 text-c-body text-ink">{mensaje}</p>
    </section>
  );
}

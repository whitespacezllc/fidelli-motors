-- ════════════════════════════════════════════════════════════════════
-- CONTACTOS POR HACER · el número del badge de "A quién llamar"
--
-- La idea (de Bruno, Brothers Oil): que la sección se comporte como una
-- casilla de mensajes — un círculo con la cantidad de contactos que te
-- están esperando, que baja cuando contactás y desaparece en cero.
--
-- QUÉ CUENTA, exactamente: las filas que la pantalla "A quién llamar"
-- muestra SIN el tilde de contactado. Una sola definición para el badge
-- y para la pantalla — si el badge dice 4, en la pantalla hay 4 filas
-- sin tildar. Por eso se cuenta sobre LAS MISMAS VISTAS que alimentan la
-- pantalla, no con una consulta paralela que algún día divergiría:
--
--   · vista_proximos_service WHERE not contactado
--     "contactado" ahí es POR ESTADO: si llamaste cuando el auto estaba
--     "próximo" y después pasó a "urgente", vuelve a contar. No es un
--     "leído" que se apaga para siempre — es "¿hiciste el contacto que
--     este estado pide?". El badge hereda esa semántica a propósito.
--
--   · vista_pendientes WHERE not contactado, SOLO si el plan trae la
--     feature: la pantalla le oculta esa fuente a Basic, y un badge que
--     contara filas invisibles marcaría "3" sobre una lista de 2.
--     plan_permite() es el mismo resolutor que usa el resto del gating.
--
-- Ambas vistas son security_invoker: el RLS recorta al tenant de la
-- sesión solo. La función es INVOKER por lo mismo — definer acá sería
-- un agujero (contaría sobre todos los tenants para cualquiera).
-- ════════════════════════════════════════════════════════════════════

create or replace function contactos_por_hacer()
returns integer
language sql
stable
set search_path = public
as $$
  select (
    (select count(*) from vista_proximos_service where not contactado)
    +
    (case when plan_permite('pendientes')
      then (select count(*) from vista_pendientes where not contactado)
      else 0
    end)
  )::integer
$$;

comment on function contactos_por_hacer is
  'El número del badge de "A quién llamar": filas sin contactar en el estado actual, sobre las mismas vistas que la pantalla (services siempre; pendientes solo si el plan trae la feature). Invoker: RLS recorta al tenant.';

revoke execute on function contactos_por_hacer() from public, anon;
grant execute on function contactos_por_hacer() to authenticated;

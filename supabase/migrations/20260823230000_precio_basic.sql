-- ════════════════════════════════════════════════════════════════════
-- AJUSTE DE PRICING · Basic pasa de $35.000 a $39.000
--
-- Anual, con el 25% de siempre ("pagás 9, usás 12"):
--   $39.000 × 9 = $351.000 al año = $29.250 por mes
--
-- Pro y Ultra NO se tocan.
--
-- ⚠ LOS TENANTS EXISTENTES NO CAMBIAN DE PRECIO. El `where not heredado`
-- no es una precaución: es la regla. Los planes heredados son los que
-- tienen contratados los lubricentros que ya operan —con el precio que
-- firmaron— y este cambio es SOLO del catálogo vigente, o sea de lo que
-- se le ofrece a alguien que llega hoy. Un update sin ese filtro le
-- cambiaría la factura a un cliente que no pidió nada.
--
-- Tampoco se toca `suscripciones`: nadie cambia de plan por esto.
--
-- La migración que sembró el catálogo (20260822150000) ya está mergeada
-- y por eso no se edita: un cambio de datos es siempre una migración
-- nueva. Por la misma razón esto es idempotente —fija el valor, no lo
-- incrementa— así que volver a correrlo no hace daño.
-- ════════════════════════════════════════════════════════════════════

update planes
set precio_mensual = 39000
where nombre = 'Basic'
  and not heredado;

-- Red de seguridad de la propia migración: si el catálogo vigente no
-- quedó exactamente en 39.000 / 49.000 / 99.000, algo se movió y es
-- mejor que el push falle acá y no que un precio equivocado llegue a la
-- landing, que lee estos mismos números.
do $$
declare
  v_basic numeric;
  v_pro   numeric;
  v_ultra numeric;
begin
  select precio_mensual into v_basic from planes where nombre = 'Basic' and not heredado;
  select precio_mensual into v_pro   from planes where nombre = 'Pro'   and not heredado;
  select precio_mensual into v_ultra from planes where nombre = 'Ultra' and not heredado;

  if v_basic is distinct from 39000 then
    raise exception 'El precio de Basic quedó en % y tenía que quedar en 39000.', v_basic;
  end if;
  if v_pro is distinct from 49000 or v_ultra is distinct from 99000 then
    raise exception 'Pro (%) o Ultra (%) cambiaron de precio, y esta migración no los toca.', v_pro, v_ultra;
  end if;
end $$;

-- ════════════════════════════════════════════════════════════════════
-- COBRANZAS · la pantalla de OPERACIÓN de /fidelli
--
-- En la taxonomía del panel interno hay tres familias, y ninguna pantalla
-- nueva entra si no cae en una:
--
--   · Catálogo          — lo que vendemos. Cambia poco, lo cambia Santiago.
--   · Contrato del tenant — lo que UN cliente tiene. Cambia por excepción,
--                           siempre con motivo y autor.
--   · Operación         — lo que se mira todos los días y NO se edita.
--
-- Esto es OPERACIÓN: quién vence, quién está en gracia, cuánto tiene que
-- transferir y a qué número escribirle. No se edita nada desde acá.
--
-- ⚠ EL MONTO SALE DE LA BASE, de la MISMA función que usa la pantalla de
-- pago del cliente. Es la diferencia entre esta pantalla y la columna "a
-- quién llamar" del listado, que recalcula el total en TypeScript con
-- `totalDelPeriodo()` y NO le suma el módulo: el mensaje de WhatsApp le
-- cotizaba de menos a cualquiera que pagara gomería. Hoy no le pasa a
-- nadie —los dos que la tienen la tienen bonificada— pero es exactamente
-- la regla 16: toda la plata es dato, y una cuenta que vive en dos lados
-- termina dando dos números.
-- ════════════════════════════════════════════════════════════════════

create or replace function cobranzas_pendientes(p_dias integer default 15)
returns table (
  lubricentro_id   uuid,
  nombre           text,
  slug             text,
  activo           boolean,
  -- El estado del RELOJ, el mismo que ve el dueño en su panel. Que las dos
  -- pantallas digan la misma palabra es lo que hace que una conversación
  -- por WhatsApp no arranque con los dos mirando cosas distintas.
  estado_cobranza  text,
  en_el_reloj      boolean,
  sub_estado       estado_suscripcion,
  periodo          periodo_suscripcion,
  descuento_pct    numeric,
  vencimiento      date,
  dias             integer,
  plan_nombre      text,
  monto            numeric,
  monto_modulo     numeric,
  telefono         text,
  owner_nombre     text,
  -- ¿Ya se le avisó en ESTE ciclo? Sin esto, la pantalla invita a escribirle
  -- al mismo cliente tres veces en una semana, que es la forma más rápida
  -- de que deje de leer los mensajes.
  avisado_at       timestamptz,
  -- La orden de pago abierta, si ya la generó desde su panel. Saber que la
  -- generó y no transfirió es una conversación distinta de saber que ni
  -- entró a mirar.
  orden_estado     text,
  orden_pagado     numeric,
  -- ¿Se suspendería si se prendiera la suspensión automática? Es LA
  -- pregunta del segundo ciclo: mirando esta columna se decide cuándo
  -- prender el segundo interruptor y a quién le cambia algo.
  --
  -- Sin esto, un tenant a 12 días de vencido con la ventana en 7 aparece
  -- como "en gracia" y se lee raro: es correcto —lo sostiene el
  -- interruptor apagado— pero no dice que el interruptor es lo único que
  -- lo sostiene.
  cortaria         boolean
)
language sql
stable
security definer
set search_path = public
as $$
  with vigente as (
    select distinct on (s.lubricentro_id)
      s.lubricentro_id, s.id, s.estado, s.periodo, s.descuento_pct,
      s.vencimiento, s.plan_id
    from suscripciones s
    order by s.lubricentro_id, s.inicio desc, s.created_at desc
  ),
  orden as (
    select distinct on (o.lubricentro_id)
      o.lubricentro_id, o.estado, o.monto_pagado
    from cresium_ordenes o
    order by o.lubricentro_id, o.created_at desc
  ),
  aviso as (
    -- El último aviso de cobranza, para no repetirlo. Se mira contra el
    -- vencimiento: un aviso de hace dos meses no cuenta para este ciclo.
    select distinct on (c.lubricentro_id) c.lubricentro_id, c.created_at
    from contactos_fidelli c
    order by c.lubricentro_id, c.created_at desc
  )
  select
    l.id,
    l.nombre,
    l.slug,
    l.activo,
    estado_cobranza(l.activo, v.vencimiento, l.cobranza_desde,
                    l.suspension_automatica, coalesce(v.descuento_pct, 0)),
    l.cobranza_desde is not null,
    v.estado,
    v.periodo,
    v.descuento_pct,
    v.vencimiento,
    (v.vencimiento - current_date)::integer,
    p.nombre,
    (monto_de_renovacion_en(l.id, v.periodo) ->> 'total')::numeric,
    (monto_de_renovacion_en(l.id, v.periodo) ->> 'modulo')::numeric,
    telefono_de_contacto(l.id),
    (select u.nombre from usuarios u
      where u.lubricentro_id = l.id and u.rol = 'owner' limit 1),
    (select a.created_at from aviso a
      where a.lubricentro_id = l.id and a.created_at::date > v.vencimiento - p_dias),
    o.estado,
    o.monto_pagado,
    -- El mismo reloj, preguntándole qué haría con la suspensión PRENDIDA.
    -- Se calcula, no se adivina: es la función de verdad con un argumento
    -- distinto.
    estado_cobranza(l.activo, v.vencimiento, l.cobranza_desde,
                    true, coalesce(v.descuento_pct, 0)) = 'suspendido'
      and estado_cobranza(l.activo, v.vencimiento, l.cobranza_desde,
                          l.suspension_automatica, coalesce(v.descuento_pct, 0)) <> 'suspendido'
  from lubricentros l
  join vigente v on v.lubricentro_id = l.id
  join planes p  on p.id = v.plan_id
  left join orden o on o.lubricentro_id = l.id
  where
    -- Solo el superadmin ve esto. La función es DEFINER porque cruza
    -- `usuarios` y `contactos_fidelli` de TODOS los tenants, así que la
    -- guarda no puede ser el RLS: tiene que estar acá y ser explícita.
    soy_superadmin()
    -- Quien no paga nada no se cobra. Queda afuera del circuito entero,
    -- también de esta lista: aparecer en "a quién le cobro" a alguien que
    -- tiene el plan bonificado es perseguir una cobranza que no existe.
    and coalesce(v.descuento_pct, 0) < 100
    -- Los que vencen en los próximos p_dias, MÁS todos los que ya
    -- vencieron y siguen sin pagar. Un vencido de hace 40 días no se cae
    -- de la lista por viejo: es el que más urge.
    and v.vencimiento <= current_date + p_dias
  order by v.vencimiento;
$$;

comment on function cobranzas_pendientes is
  'La pantalla de operación de /fidelli: quién vence en los próximos p_dias y quién ya venció, con el monto YA CALCULADO por la misma función que usa la pantalla de pago del cliente. Solo superadmin. No edita nada.';

revoke all on function cobranzas_pendientes(integer) from public, anon;
grant execute on function cobranzas_pendientes(integer) to authenticated;

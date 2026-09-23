-- ════════════════════════════════════════════════════════════════════
-- BLOQUE MÉTRICAS 3 · el evento `alta` guarda el estado de la suscripción
--
-- Cierra el faltante anotado en docs/METRICAS.md § 8: sin `estado` en el
-- `despues` del alta no se podía saber si un tenant nació en trial o
-- pagando, y la fila «Trial» de la pestaña Suscripción usaba una
-- inferencia. Ahora el alta trae `estado`, `plan` y `periodo`; los eventos
-- ya escritos (y los del backfill) no cambian: son inmutables.
--
-- Misma función que 20260922201000, con una columna más en el select.
-- Sigue siendo un trigger DIFERIDO (constraint trigger) y defensivo.
-- ════════════════════════════════════════════════════════════════════

-- >>> tenant_evento_alta
create or replace function tenant_evento_alta()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_sub     record;
  v_despues jsonb;
begin
  begin                                                                -- @defensivo
    if not exists (select 1 from lubricentros where id = new.id) then
      return null;
    end if;

    select s.plan_id, p.nombre as plan, s.periodo, s.descuento_pct, s.estado
      into v_sub
      from suscripciones s
      left join planes p on p.id = s.plan_id
     where s.lubricentro_id = new.id
     order by s.inicio desc, s.created_at desc
     limit 1;

    v_despues := jsonb_build_object(
      'nombre', new.nombre, 'slug', new.slug, 'cobranza_desde', new.cobranza_desde);

    if found then
      v_despues := v_despues || jsonb_build_object(
        'plan_id', v_sub.plan_id, 'plan', v_sub.plan,
        'periodo', v_sub.periodo, 'descuento_pct', v_sub.descuento_pct,
        'estado', v_sub.estado);
    end if;

    perform emitir_evento_tenant(new.id, 'alta', null, v_despues, null,
                                 origen_evento_de_sesion(), now(), auth.uid());
  exception when others then
    raise warning 'tenant_eventos: alta de % no se registró: %', new.id, sqlerrm;
  end;
  return null;
end;
$$;
-- <<< tenant_evento_alta

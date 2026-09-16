-- ════════════════════════════════════════════════════════════════════
-- EL PASO DE PAGO AL FINAL DEL ONBOARDING · la marca que lo cierra
--
-- Una CUARTA pantalla, después de los tres pasos, cuando
-- `completar_onboarding()` escribe `onboarding_completado_at`.
--
-- **NO BLOQUEA.** Alguien que acaba de cargar sus productos y confirmar su
-- diseño no puede quedar afuera de su propio panel esperando una
-- transferencia. Y eso no depende de que el botón funcione: el gate de
-- `(tras-onboarding)` solo mira `onboarding_completado_at`, que para
-- entonces YA está escrito, así que el panel entero está abierto detrás de
-- la pantalla de pago desde el primer render. "Entrar al panel" es una
-- navegación, no un desbloqueo.
--
--
-- ⚠ POR QUÉ HACE FALTA UNA COLUMNA NUEVA
--
-- "Completado" ya no alcanza para decidir qué mostrar. Sin una marca que
-- diga "ya pasó por el pago", `/panel/onboarding` mandaría al dueño de
-- vuelta a la pantalla de pago cada vez que entre, para siempre, y no
-- habría forma de distinguir "recién terminó" de "terminó hace tres
-- semanas".
--
-- El molde ya está inventado en este mismo archivo de dos formas:
-- `bienvenida_vista_at` con `marcar_bienvenida_vista()`, y
-- `diseno_confirmado_at` con `confirmar_diseno()`. Columna anulable,
-- función `security definer` porque el owner no puede tocar `lubricentros`
-- por RLS, y el dato viaja en el mismo `select` de la sesión: cero
-- consultas nuevas por request.
--
--
-- ⚠ Y LA CUARTA PANTALLA NO ES UN PASO
--
-- `PasoOnboarding` es `1 | 2 | 3` y `pasos` es `2 | 3`: ese contrato
-- atraviesa el front (el switch exhaustivo de `pasoHecho`, `IndicadorPasos`,
-- `videoDelPaso`), la base (`v_pasos`), el listado de /fidelli y R14, que
-- afirma que a un Basic se le piden DOS. La pantalla de pago se muestra con
-- el indicador en "N de N" —todos los puntos llenos— y no suma un cuarto.
-- ════════════════════════════════════════════════════════════════════

alter table lubricentros
  add column pago_presentado_at timestamptz;

comment on column lubricentros.pago_presentado_at is
  'Cuándo el dueño pasó por la pantalla de pago del final del onboarding. NULL con el onboarding completo = todavía no la vio, y /panel/onboarding se la muestra. No dice nada sobre si pagó: eso vive en `pagos`.';


-- >>> marcar_pago_presentado
create or replace function marcar_pago_presentado()
returns jsonb
language plpgsql
volatile
security definer
set search_path = public
as $$
declare
  v_lub uuid := mi_lubricentro_id();
begin
  if v_lub is null then
    raise exception 'sin_lubricentro';
  end if;

  -- Una sola vez por taller, como la bienvenida: `is null` y no un update
  -- a secas, para que volver a la pantalla no mueva la fecha.
  update lubricentros
     set pago_presentado_at = now()
   where id = v_lub and pago_presentado_at is null;                  -- @pago_presentado

  return onboarding_estado_de(v_lub);
end;
$$;
-- <<< marcar_pago_presentado

comment on function marcar_pago_presentado is
  'El dueño vio la pantalla de pago del final del onboarding y tocó "Entrar al panel". Definer, como las otras escrituras del onboarding: el owner no puede tocar `lubricentros` por RLS. Idempotente: la fecha se escribe una sola vez.';

revoke all on function marcar_pago_presentado() from public, anon;
grant execute on function marcar_pago_presentado() to authenticated;

-- ============================================================
-- La zona horaria del negocio: Argentina (UTC-3), fijada en la base.
--
-- Hasta acá la base corría con el default (UTC) y NADIE compensaba. Todo
-- lo que calcula calendario — current_date, date_trunc('month', ...),
-- los casts ::date y las promociones date→timestamptz de las
-- comparaciones mixtas — cortaba el día a las 21:00 hora argentina:
--
--   · vista_proximos_service: un vehículo pasaba de urgente a vencido
--     tres horas antes de la medianoche real;
--   · resumen_inicio / metricas_*: "este mes" arrancaba a las 21:00 del
--     último día del mes anterior;
--   · services.fecha default current_date: un service cargado a las
--     22:00 quedaba fechado al día siguiente.
--
-- Con el TimeZone de sesión en América/Argentina/Buenos_Aires, TODAS esas
-- expresiones pasan a evaluar en hora argentina sin reescribir ninguna
-- función. Argentina no tiene horario de verano desde 2009, así que el
-- offset es fijo (-03) todo el año.
--
-- LO QUE NO CAMBIA: created_at y todo timestamptz siguen guardando el
-- mismo instante de siempre (timestamptz es un punto en el tiempo, no
-- tiene zona). La regla de 24 horas, el RLS y toda la aritmética de
-- instantes (now() - created_at) son idénticas antes y después. Lo único
-- que cambia es dónde cae la frontera de "un día".
--
-- Efecto colateral deliberado: PostgREST pasa a serializar los
-- timestamptz con offset -03:00 en vez de +00:00. El front ya parsea
-- cualquier offset (new Date(iso)), y lib/fechas.ts deriva el calendario
-- con timeZone explícito, así que no depende de esta serialización.
-- ============================================================

-- ⚠ PRECEDENCIA: el setting de ROL le gana al de DATABASE. Los cuatro
-- statements de abajo viajan JUNTOS — un futuro cambio de zona horaria
-- que toque solo uno deja la mitad de la API en otra hora, en silencio.

-- La base entera (Studio, psql, seeds, verificaciones, shadow db en el
-- diff del CLI). current_database() y no un nombre fijo: en la shadow db
-- y en los branches de Supabase el nombre no es "postgres".
do $$
begin
  execute format(
    'alter database %I set timezone to %L',
    current_database(),
    'America/Argentina/Buenos_Aires'
  );
end $$;

-- Los tres roles que PostgREST impersona. PostgREST aplica los settings
-- del rol impersonado en cada request, así el cambio rige de inmediato
-- para toda la API sin esperar a que se recicle el pool de conexiones
-- (que quedó abierto en UTC).
alter role authenticated set timezone to 'America/Argentina/Buenos_Aires';
alter role anon set timezone to 'America/Argentina/Buenos_Aires';
alter role service_role set timezone to 'America/Argentina/Buenos_Aires';

-- Que PostgREST relea la configuración de roles ahora, no en el próximo
-- reinicio.
notify pgrst, 'reload config';

-- ============================================================
-- Fidelli Motors · Marcas y modelos — Bloque 6
--
-- LA FUENTE DE LAS MARCAS: el dataset de Transferencias de Automotores
-- de la DNRPA (datos.jus.gob.ar, Ministerio de Justicia), licencia
-- CC-BY-4.0. Medido sobre 156.813 transferencias de julio 2026: el top
-- 30 de marcas cubre el 97,69% del parque circulante. La cola (492
-- marcas en total) es basura verificada —"RENBAULT", "CHEVROLET (024)",
-- fabricantes de trailers— y se filtró A MANO: un selector de 492
-- opciones le hace perder al mecánico los 90 segundos que el producto
-- promete. Complementado con marcas del mercado actual argentino.
--
-- CERO LOGOS, para siempre salvo licencia por escrito: las cuatro
-- fuentes evaluadas (car-logos-dataset, Logo.dev, Motomarks, Simple
-- Icons) licencian LA COLECCIÓN y desligan la marca registrada. La
-- marca se muestra como insignia tipográfica del sistema.
--
-- MODELOS: no hay lista y no la va a haber — la DNRPA trae 14.207
-- combinaciones con la versión pegada ("PALIO (326) ATTRACTIVE 5P 1.4
-- 8V") y los top 500 cubren apenas el 82%. El autocompletado SE
-- APRENDE de lo que cargan los lubricentros, con un piso de anonimato
-- para el nivel global (ver modelos_sugeridos).
--
-- TEXTO LIBRE SIEMPRE: marca y modelo siguen nulables y aceptando
-- cualquier cosa. La lista sugiere, nunca obliga.
-- ============================================================


-- ---------- 1 · El catálogo global de marcas ----------
create table marcas_vehiculo (
  nombre     text primary key,
  -- Abreviaturas INEQUÍVOCAS que el mostrador usa a diario ("VW"). No
  -- son typos: un typo no se adivina y no va acá.
  alias      text[] not null default '{}',
  orden      integer not null,
  activa     boolean not null default true,
  created_at timestamptz not null default now()
);

comment on table marcas_vehiculo is
  'Catálogo global de marcas. Fuente: DNRPA transferencias 07/2026 (CC-BY-4.0), top 30 medido = 97,69% del parque + complementos del mercado actual, cola filtrada a mano. Solo sugiere: marca sigue siendo texto libre.';

insert into marcas_vehiculo (nombre, alias, orden) values
  ('Volkswagen',    '{VW}',        1),
  ('Ford',          '{}',          2),
  ('Renault',       '{}',          3),
  ('Chevrolet',     '{Chevy}',     4),
  ('Fiat',          '{}',          5),
  ('Toyota',        '{}',          6),
  ('Peugeot',       '{}',          7),
  ('Citroën',       '{Citroen}',   8),
  ('Mercedes-Benz', '{Mercedes,Mercedes Benz}', 9),
  ('Nissan',        '{}',         10),
  ('Honda',         '{}',         11),
  ('Jeep',          '{}',         12),
  ('Audi',          '{}',         13),
  ('BMW',           '{}',         14),
  ('Suzuki',        '{}',         15),
  ('Iveco',         '{}',         16),
  ('Chery',         '{}',         17),
  ('Hyundai',       '{}',         18),
  ('Dodge',         '{}',         19),
  ('Kia',           '{}',         20),
  ('RAM',           '{}',         21),
  ('DS',            '{}',         22),
  ('Mini',          '{}',         23),
  ('Volvo',         '{}',         24),
  ('Alfa Romeo',    '{}',         25),
  ('Mitsubishi',    '{}',         26),
  ('Isuzu',         '{}',         27),
  ('Land Rover',    '{}',         28),
  ('Subaru',        '{}',         29),
  ('Porsche',       '{}',         30),
  ('Lifan',         '{}',         31),
  ('Haval',         '{}',         32),
  ('BAIC',          '{}',         33),
  ('Geely',         '{}',         34);

alter table marcas_vehiculo enable row level security;

create policy marcas_lectura on marcas_vehiculo for select to authenticated
  using (true);
create policy marcas_admin on marcas_vehiculo for all to authenticated
  using (soy_superadmin()) with check (soy_superadmin());


-- ---------- 2 · La normalización que hoy no existe ----------
-- La forma canónica para COMPARAR: minúsculas, sin acentos, sin espacios
-- de más. Nunca para mostrar — el display es el del catálogo.
create or replace function normalizar_texto_vehiculo(p text)
returns text
language sql
immutable
as $$
  select trim(regexp_replace(lower(fm_unaccent(coalesce(p, ''))), '\s+', ' ', 'g'));
$$;

-- ¿Este texto es una marca del catálogo (por nombre o alias)? Devuelve el
-- nombre canónico, o NULL si no matchea. CONSERVADOR: igualdad exacta de
-- formas normalizadas — un typo no se adivina.
create or replace function marca_canonica(p_texto text)
returns text
language sql
stable
as $$
  select m.nombre
  from marcas_vehiculo m
  where m.activa
    and (
      normalizar_texto_vehiculo(m.nombre) = normalizar_texto_vehiculo(p_texto)
      or exists (
        select 1 from unnest(m.alias) a
        where normalizar_texto_vehiculo(a) = normalizar_texto_vehiculo(p_texto)
      )
    )
  limit 1;
$$;

-- Al guardar, de acá en adelante: si la marca matchea el catálogo, se
-- escribe el nombre canónico; si no, queda EXACTAMENTE como la tipearon
-- (texto libre de verdad). El modelo solo pierde espacios de más. Mismo
-- patrón que la normalización de patentes: por trigger, a prueba de
-- cualquier puerta de entrada.
create or replace function normalizar_vehiculo()
returns trigger
language plpgsql
as $$
declare
  v_canonica text;
begin
  if new.marca is not null then
    new.marca := trim(regexp_replace(new.marca, '\s+', ' ', 'g'));
    if new.marca = '' then
      new.marca := null;
    else
      v_canonica := marca_canonica(new.marca);
      if v_canonica is not null then
        new.marca := v_canonica;
      end if;
    end if;
  end if;

  if new.modelo is not null then
    new.modelo := nullif(trim(regexp_replace(new.modelo, '\s+', ' ', 'g')), '');
  end if;

  return new;
end;
$$;

create trigger vehiculos_normalizar_marca
  before insert or update on vehiculos
  for each row execute function normalizar_vehiculo();


-- ---------- 3 · La migración de datos, CONSERVADORA ----------
-- Se reescribe una fila SOLO cuando su forma normalizada coincide exacto
-- con una marca del catálogo (nombre o alias inequívoco). "susuki" y
-- "mini cooper" quedan como están: un typo no se adivina.
update vehiculos v
set marca = marca_canonica(v.marca)
where v.marca is not null
  and marca_canonica(v.marca) is not null
  and v.marca is distinct from marca_canonica(v.marca);

-- Y los espacios de más del modelo, sin tocar nada del contenido.
update vehiculos
set modelo = nullif(trim(regexp_replace(modelo, '\s+', ' ', 'g')), '')
where modelo is not null
  and modelo is distinct from nullif(trim(regexp_replace(modelo, '\s+', ' ', 'g')), '');


-- ---------- 4 · Los modelos que se aprenden ----------
-- Dos niveles: primero lo que ya cargó ESE lubricentro, después lo del
-- resto. EL SEGUNDO NIVEL CRUZA EL AISLAMIENTO MULTI-TENANT y por eso:
--   · SECURITY DEFINER que devuelve SOLO strings — jamás conteos, jamás
--     una fila de vehiculos.
--   · EL PISO DE ANONIMATO: un modelo global solo se sugiere si aparece
--     en al menos 3 vehículos de al menos 2 lubricentros distintos. Un
--     string que existe en un solo lugar puede ser el dato de un cliente
--     de la competencia; el piso es lo que lo vuelve anónimo.
create or replace function modelos_sugeridos(p_marca text default null)
returns table (modelo text, propio boolean)
language sql
stable
security definer
set search_path = public
as $$
  with mios as (
    select distinct v.modelo
    from vehiculos v
    where v.lubricentro_id = mi_lubricentro_id()
      and v.modelo is not null
      and (p_marca is null
           or normalizar_texto_vehiculo(v.marca) = normalizar_texto_vehiculo(p_marca))
    order by v.modelo
    limit 20
  ),
  globales as (
    select v.modelo
    from vehiculos v
    where v.modelo is not null
      and (p_marca is null
           or normalizar_texto_vehiculo(v.marca) = normalizar_texto_vehiculo(p_marca))
    group by v.modelo
    having count(*) >= 3
       and count(distinct v.lubricentro_id) >= 2
    order by count(*) desc, v.modelo
    limit 20
  )
  select m.modelo, true as propio from mios m
  union all
  select g.modelo, false from globales g
  where g.modelo not in (select modelo from mios);
$$;

comment on function modelos_sugeridos is
  'Autocompletado de modelos: primero los del propio tenant, después los globales con PISO DE ANONIMATO (>=3 vehículos en >=2 lubricentros). Solo strings, nunca conteos. Security definer a propósito.';

revoke all on function modelos_sugeridos(text) from public, anon;
grant execute on function modelos_sugeridos(text) to authenticated;

revoke all on function marca_canonica(text) from public, anon;
grant execute on function marca_canonica(text) to authenticated;

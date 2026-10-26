-- ============================================================
-- Fidelli Motors · Patentes de los países vecinos
--
-- Lubricheck Sassi tiene clientes con chapa de Brasil, Uruguay, Paraguay,
-- Bolivia y Chile —autos de paso, y gente que vivió afuera y volvió con el
-- auto— y hasta hoy no podía cargarles un trabajo: el CHECK de vehiculos
-- aceptaba solo los cuatro formatos argentinos (20260904120000).
--
-- LOS FORMATOS QUE ENTRAN, sobre la patente ya normalizada (mayúsculas,
-- sin espacios ni guiones). Las chapas viejas de Brasil y de Chile siguen
-- vigentes en sus países —nunca se reemplazaron—, así que entran.
--
--   Argentina   ABC 123 · AB 123 CD        autos      (como hasta hoy)
--               123 ABC · A 123 BCD        motos      (como hasta hoy)
--   Brasil      ABC1D23                    autos y motos, Mercosur (2018→)
--               ABC 1234                   autos y motos, hasta 2018
--   Uruguay     ABC 1234                   autos y motos (2015→)
--   Paraguay    ABCD 123 · 123 ABCD        autos · motos, Mercosur (2019→)
--               ABC 123 · 123 ABC          2000-2019: ya entraban por los argentinos
--   Bolivia     1234 ABC                   autos y motos
--               AB 12345                   Mercosur, solo transporte internacional
--   Chile       ABCD 12 · AB 1234          autos 2007→ · autos 1985-2007
--               ABC 12                     motos 2014→
--
-- QUEDAN AFUERA A PROPÓSITO: las motos chilenas anteriores a 2014 (AB 123:
-- son los primeros cinco caracteres de toda patente argentina Mercosur y
-- romperían la búsqueda del alta), los dos formatos chilenos del decreto
-- de enero de 2026 (cinco letras y un dígito, cuatro letras y un dígito:
-- no se emiten hasta 2029 y 2027; son una línea acá y otra en lib/texto.ts
-- cuando aparezcan), las chapas de una letra y seis dígitos (Argentina
-- antes de 1995, Paraguay antes de 2000, el interior de Uruguay antes de
-- 2015) y las series diplomáticas. Las letras que Chile no usa (vocales,
-- M, N, Ñ, Q) no se validan, igual que no se valida nada parecido para
-- Argentina.
--
-- NO SE GUARDA EL PAÍS. La forma clasifica, como auto y moto; y ABC 1234
-- es Brasil o Uruguay sin manera de distinguirlo, así que un país derivado
-- de la chapa mentiría. El día que importe, es una columna que se pregunta
-- en el alta.
--
-- NADA MÁS CAMBIA. El CHECK patente_formato y corregir_patente() llaman a
-- esta función; normalizar_patente(), get_carton(), el índice único por
-- tenant, las búsquedas y los exports trabajan sobre la normalizada sin
-- mirar su forma. La lista nueva es un superconjunto de la vieja: ningún
-- vehículo existente deja de cumplir el CHECK (que, además, `create or
-- replace` no revalida). El front repite la lista en lib/texto.ts, y
-- scripts/regresion-patentes.mjs compara las dos forma por forma. La red
-- es R13 (que ajusta su lista de inválidas: ABCD123 y 1234ABC ahora son
-- Paraguay y Bolivia) y R48.
-- ============================================================

create or replace function patente_formato_valido(p text)
returns boolean
language sql
immutable
strict
parallel safe
as $$
  select
      -- Argentina
         p ~ '^[A-Z]{3}[0-9]{3}$'              -- auto 1995-2016                   ABC 123
      or p ~ '^[A-Z]{2}[0-9]{3}[A-Z]{2}$'      -- auto Mercosur                    AB 123 CD
      or p ~ '^[0-9]{3}[A-Z]{3}$'              -- moto 1995-2016                   123 ABC
      or p ~ '^[A-Z][0-9]{3}[A-Z]{3}$'         -- moto Mercosur                    A 123 BCD
      -- Brasil
      or p ~ '^[A-Z]{3}[0-9][A-Z][0-9]{2}$'    -- Mercosur, autos y motos (2018→)  ABC1D23
      or p ~ '^[A-Z]{3}[0-9]{4}$'              -- hasta 2018; y Uruguay (2015→)    ABC 1234
      -- Paraguay
      or p ~ '^[A-Z]{4}[0-9]{3}$'              -- Mercosur, autos (2019→)          ABCD 123
      or p ~ '^[0-9]{3}[A-Z]{4}$'              -- Mercosur, motos                  123 ABCD
      -- Bolivia
      or p ~ '^[0-9]{4}[A-Z]{3}$'              -- autos y motos                    1234 ABC
      or p ~ '^[A-Z]{2}[0-9]{5}$'              -- Mercosur, transporte internacional  AB 12345
      -- Chile
      or p ~ '^[A-Z]{4}[0-9]{2}$'              -- autos 2007→                      ABCD 12
      or p ~ '^[A-Z]{2}[0-9]{4}$'              -- autos 1985-2007                  AB 1234
      or p ~ '^[A-Z]{3}[0-9]{2}$';             -- motos 2014→                      ABC 12
$$;

comment on function patente_formato_valido is
  'Los formatos de patente que acepta Fidelli, sobre la patente YA normalizada (mayúsculas, sin espacios): los cuatro argentinos (auto ABC123 / AB123CD, moto 123ABC / A123BCD) y, desde 20261026120000, los de Brasil (ABC1D23, ABC1234), Uruguay (ABC1234), Paraguay (ABCD123, 123ABCD), Bolivia (1234ABC, AB12345) y Chile (ABCD12, AB1234, ABC12). Fuente única: la usan el CHECK de vehiculos y corregir_patente(); lib/texto.ts la repite para avisar.';

comment on column vehiculos.patente_normalizada is
  'Sin espacios ni guiones, mayúsculas. Se completa sola por trigger. Formatos: los argentinos (auto ABC123 / AB123CD, moto 123ABC / A123BCD) y los de los países vecinos; la lista es patente_formato_valido().';

comment on function corregir_patente is
  'Nivel 2: corrige la patente de un vehículo pasada la ventana de 72 hs. Exige superadmin y un motivo, que quedan registrados en correcciones_patente antes de tocar el dato. Acepta los formatos de patente_formato_valido() (argentinos y vecinos).';

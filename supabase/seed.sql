-- Datos de desarrollo. Corre en cada `supabase db reset`.
select seed_demo();

-- Horarios de las sucursales demo. La columna llegó después de que
-- seed_demo() quedó mergeada (las migraciones no se editan), así que se
-- completa acá — este archivo es solo del entorno local.
update sucursales set horarios = 'Lun a Vie 8:00–18:30 · Sáb 8:00–13:00'
where nombre = 'Casa Central';
update sucursales set horarios = 'Lun a Sáb 8:30–18:00'
where nombre = 'Sucursal Norte';

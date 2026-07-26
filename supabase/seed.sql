-- Datos de desarrollo. Corre en cada `supabase db reset`.
select seed_demo();

-- Horarios de las sucursales demo. La columna llegó después de que
-- seed_demo() quedó mergeada (las migraciones no se editan), así que se
-- completa acá — este archivo es solo del entorno local.
update sucursales set horarios = 'Lun a Vie 8:00–18:30 · Sáb 8:00–13:00'
where nombre = 'Casa Central';
update sucursales set horarios = 'Lun a Sáb 8:30–18:00'
where nombre = 'Sucursal Norte';

-- seed_demo() deja una búsqueda por CADA vehículo, así que el % de escaneo
-- daba 100% — un número irreal que además tapa los errores: con todos los
-- autos escaneados no se distingue una métrica que anda de una que devuelve
-- el total. Se borran las búsquedas de cinco patentes para que la flota
-- quede repartida y el número sea representativo.
delete from landing_busquedas
where patente in ('AF210KL', 'AG774BX', 'AH335DP', 'AJ908FR', 'STU445');

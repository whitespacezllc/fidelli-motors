-- ============================================================
-- El cuarto tipo de trabajo: caja (el service de caja automática).
--
-- SOLO ENUMS, y va solo en este archivo por la misma regla de Postgres
-- que separó 20260911120000 (neumáticos) y 20260915120000 (los renglones
-- de camión): un valor nuevo de enum no se puede usar en la transacción
-- que lo crea, y la migración siguiente los usa en el CHECK, en las
-- policies, en las funciones, en la vista y en la red de verificación.
-- Cada archivo corre en su propia transacción, así que separarlos es la
-- solución canónica.
--
-- ⚠ ESTE ARCHIVO SOLO ES SEGURO JUNTO AL SIGUIENTE (regla 11). Con
-- 'caja' en el enum y sin 20261004120100:
--
--   · los CHECK service_completo, mecanica_coherente y
--     neumaticos_coherente están escritos como `tipo <> 'x' or (...)`:
--     para una fila 'caja' las tres premisas son verdaderas y NO SE
--     EVALÚA NADA — entra una caja sin kilómetros, sin aceite y con
--     descripción de mecánica;
--   · las policies services_insercion y services_edicion nombran a
--     'mecanica' y a 'neumaticos': con 'caja' la condición del plan ni
--     se mira, y el tipo nuevo queda abierto para todos los tenants,
--     también por la API directa;
--   · plazo_edicion('caja') devuelve null (el case no tiene else a
--     propósito): una caja nace fijada y R35a pone el reset en rojo.
--
-- Las dos migraciones salen en el MISMO PR y se aplican en orden. No
-- mergear una sin la otra.
-- ============================================================


-- ---------- 1 · El tipo de trabajo ----------
alter type tipo_trabajo add value if not exists 'caja';


-- ---------- 2 · Los cuatro renglones del service de caja ----------
-- AL FINAL del enum, y en este orden: es el orden del papel de la caja
-- (filtro, aditivo, limpieza de cárter e imanes, lavado del circuito).
--
-- La regla 14 dice «nunca al final», y sigue valiendo para lo que dice:
-- el orden del enum es el orden del CARTÓN DE ACEITE, y un renglón de ese
-- cartón entra con `add value … after`, en su lugar. Estos cuatro no son
-- de ese cartón: son de otro papel, que se dibuja solo, con su etiqueta
-- vertical CAJA, y que el front no mezcla con los 21 de siempre
-- (RENGLONES_CAJA en lib/renglones.ts). Entre sí conservan su orden
-- porque `order by item_tipo` es lo que dibuja cualquier papel. R17a
-- conoce los 25 valores, con estos cuatro al final.
alter type item_tipo add value if not exists 'caja_filtro';
alter type item_tipo add value if not exists 'caja_aditivo';
alter type item_tipo add value if not exists 'caja_limpieza_carter';
alter type item_tipo add value if not exists 'caja_lavado';


-- ---------- 3 · El motivo del contacto ----------
-- «A quién llamar» registra cada aviso en `contactos`, con un `estado`
-- que es este enum. Los tres estados de siempre (vencido / urgente /
-- proximo) son del cambio de aceite: vista_proximos_service tilda su fila
-- con `co.estado = c.estado`. Si el aviso de una caja se registrara con
-- uno de esos tres, tildaría también el service del mismo auto —y al
-- revés—. Pendientes y gomería resolvieron lo mismo con un valor propio
-- (20260823100000, 20260912100000); la caja también.
alter type estado_contacto add value if not exists 'caja';

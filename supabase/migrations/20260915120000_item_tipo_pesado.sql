-- ============================================================
-- Los diez renglones del vehículo pesado, en el enum item_tipo.
--
-- Pedido de Lubricantes de SA (Gastón, ~50 camiones por mes) y de Taller
-- PSM; 7 de los 13 clientes atienden vehículo pesado.
--
-- Va SOLO en esta migración por la misma regla de Postgres que separó
-- 20260911120000_tipo_trabajo_neumaticos: un valor nuevo de enum no se
-- puede usar en la misma transacción que lo crea, y cada archivo de
-- migración corre en su propia transacción. Acá no hay una migración
-- siguiente que los use —ninguna función SQL enumera valores de
-- item_tipo: guardar_service y actualizar_service castean el jsonb
-- entrante de forma genérica, y el `delete … not in (…)` de
-- actualizar_service es una subconsulta sobre el jsonb, no una lista
-- fija—, pero la red de verificación sí los nombra (R17) y corre después
-- de todas las migraciones.
--
-- EL ORDEN DEL ENUM ES EL ORDEN DEL CARTÓN (está comentado en
-- 20260723171645_extensiones_y_enums): "order by item_tipo" devuelve los
-- renglones como en el papel, y así los dibujan get_carton, la
-- exportación y el cartón en pantalla. Agregar al final rompería el
-- cartón de un camión —un filtro de urea después de los aditivos—. Por
-- eso todo entra con ADD VALUE … AFTER.
--
-- Cada AFTER se ancla a un valor que YA EXISTÍA antes de esta migración
-- ('filtro_habitaculo', 'aceite_hidraulico', 'aditivo_transmision'), y
-- por eso cada bloque va en orden INVERSO al del cartón: cada valor se
-- inserta justo después del ancla y empuja hacia abajo a los que entraron
-- antes que él. Anclar a un valor agregado en la misma transacción es
-- exactamente el caso que Postgres puede rechazar.
--
-- NO es un tipo_trabajo nuevo: es el mismo cartón con más renglones. Sin
-- feature de plan, sin policy, sin CHECK, sin backfill. Los +900 trabajos
-- existentes simplemente no tienen filas de estos tipos, y cada uno sigue
-- queriendo decir lo que decía el día que se cargó: ningún valor
-- existente se renombra.
--
-- filtro_hidraulico es EL FILTRO. aceite_hidraulico es EL ACEITE y existe
-- desde el día uno. Son dos renglones distintos.
--
-- El orden resultante, que es lo que verifica R17a:
--   filtro_aceite · filtro_aire · filtro_combustible · filtro_habitaculo
--   filtro_combustible_secundario · filtro_separador_agua
--   filtro_aire_secundario · filtro_secador_aire · filtro_urea
--   filtro_hidraulico
--   aceite_caja · aceite_diferencial · aceite_hidraulico
--   aceite_caja_reductora · aceite_diferencial_delantero
--   liq_refrigerante · liq_frenos
--   aditivo_motor · aditivo_transmision
--   engrase · bateria
-- ============================================================

-- Filtros de servicio pesado, después del último filtro del cartón original.
-- Orden inverso a propósito: cada uno se inserta justo después de
-- 'filtro_habitaculo' y empuja a los anteriores hacia abajo.
alter type item_tipo add value if not exists 'filtro_hidraulico'             after 'filtro_habitaculo';
alter type item_tipo add value if not exists 'filtro_urea'                   after 'filtro_habitaculo';
alter type item_tipo add value if not exists 'filtro_secador_aire'           after 'filtro_habitaculo';
alter type item_tipo add value if not exists 'filtro_aire_secundario'        after 'filtro_habitaculo';
alter type item_tipo add value if not exists 'filtro_separador_agua'         after 'filtro_habitaculo';
alter type item_tipo add value if not exists 'filtro_combustible_secundario' after 'filtro_habitaculo';

-- Aceites, después del último aceite del cartón original. Mismo criterio.
alter type item_tipo add value if not exists 'aceite_diferencial_delantero'  after 'aceite_hidraulico';
alter type item_tipo add value if not exists 'aceite_caja_reductora'         after 'aceite_hidraulico';

-- Engrase y batería cierran el cartón, en ese orden.
alter type item_tipo add value if not exists 'bateria' after 'aditivo_transmision';
alter type item_tipo add value if not exists 'engrase' after 'aditivo_transmision';

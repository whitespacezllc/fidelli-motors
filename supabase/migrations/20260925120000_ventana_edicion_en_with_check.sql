-- ============================================================
-- Fidelli Motors · El plazo de edición también en el WITH CHECK
--
-- items_escritura (service_items) y ruedas_escritura (service_ruedas)
-- son policies FOR ALL con la ventana de edición —now() - s.created_at
-- < plazo_edicion(s.tipo), o el desbloqueo abierto, vía EXISTS sobre la
-- cabecera— escrita SOLO en el USING. Y en PostgreSQL un INSERT no
-- evalúa el USING: evalúa el WITH CHECK, que hasta acá decía tenant (y,
-- en las ruedas, tenant + plan_permite('neumaticos')). Resultado: un
-- usuario autenticado del tenant podía agregarle un renglón —o una
-- rueda— a un trabajo ya fijado con un POST directo a PostgREST.
--
-- El panel no lo hace: guardar_service inserta los renglones en la
-- misma transacción que crea la cabecera (created_at = now(), ventana
-- abierta) y actualizar_service toca primero la cabecera, que la policy
-- services_edicion filtra, y convierte el «cero filas» en
-- service_no_editable antes de llegar a los renglones. Pero la regla
-- vive en la base para que valga también sin el panel, y por la API
-- directa no valía.
--
-- La corrección es sumar la MISMA condición al WITH CHECK, manteniendo
-- lo que ya tenía (el tenant; en las ruedas, el gating de plan), con
-- plazo_edicion(s.tipo) como única fuente, igual que el USING. El WITH
-- CHECK mira la fila nueva, así que un UPDATE que mueva un renglón de un
-- trabajo abierto a uno fijado (service_id en el SET) también queda
-- afuera, que es lo correcto.
--
-- El tenant de la fila nueva lo escribe el trigger BEFORE INSERT
-- (service_items_heredar_tenant / service_ruedas_heredar_tenant) desde
-- la cabecera, ANTES de que se evalúe el WITH CHECK: la condición
-- lubricentro_id = mi_lubricentro_id() ya venía apoyándose en eso.
--
-- ALTER POLICY ... WITH CHECK solo: el USING (20260925110000) queda como
-- está. Sin DROP + CREATE, que dejaría la tabla sin policy de escritura
-- por un instante. Lo vigilan R35f y R35g; sus roturas viven en
-- scripts/regresion-edicion.sh y muerden los bloques marcados de este
-- archivo.
-- ============================================================


-- ---------- 1 · service_items ----------
-- >>> items_check
alter policy items_escritura on service_items
  with check (
    (lubricentro_id = mi_lubricentro_id()
      and exists (
        select 1 from services s
        where s.id = service_items.service_id
          and (now() - s.created_at < plazo_edicion(s.tipo) -- @check-items
               or (s.desbloqueado_hasta is not null and now() < s.desbloqueado_hasta))
      ))
    or soy_superadmin()
  );
-- <<< items_check


-- ---------- 2 · service_ruedas ----------
-- Conserva el gating del módulo (20260911120100): la ventana se suma, no
-- lo reemplaza. Un taller sin el módulo sigue sin poder escribir una
-- rueda, con la ventana abierta o cerrada.
-- >>> ruedas_check
alter policy ruedas_escritura on service_ruedas
  with check (
    (lubricentro_id = mi_lubricentro_id()
      and plan_permite('neumaticos')
      and exists (
        select 1 from services s
        where s.id = service_ruedas.service_id
          and (now() - s.created_at < plazo_edicion(s.tipo) -- @check-ruedas
               or (s.desbloqueado_hasta is not null and now() < s.desbloqueado_hasta))
      ))
    or soy_superadmin()
  );
-- <<< ruedas_check

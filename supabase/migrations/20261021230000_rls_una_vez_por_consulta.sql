-- ============================================================
-- Fidelli Motors · Las policies preguntan por la sesión una vez por
-- consulta, no una vez por fila (21/10/2026)
--
-- Postgres evalúa el USING y el WITH CHECK de cada policy por CADA fila
-- que el scan mira —también las de los otros tenants, que son justo las
-- que el RLS descarta—. Escritas a pelo, «lubricentro_id =
-- mi_lubricentro_id() or soy_superadmin()» ejecuta en cada una de esas
-- filas dos funciones security definer que leen `usuarios`.
-- `resumen_inicio()` hace una docena de scans de `services` y tres pasadas
-- por `vista_proximos_service`: con el volumen de un taller tardaba 1,8 s
-- en local, y en producción el Inicio llegaba a veces al
-- statement_timeout de 8 s de `authenticated` y mostraba «No pudimos traer
-- el resumen».
--
-- Envueltas en un sub-select —`(select mi_lubricentro_id())`— el
-- planificador las resuelve UNA vez por consulta (un InitPlan) y compara
-- el valor en cada fila. Es lo que pide el lint `auth_rls_initplan` de
-- Supabase. El booleano por fila es el mismo: ninguna policy cambia de
-- sentido, cambia cuántas veces se pregunta. `alter policy` conserva el
-- comando, los roles y el `permissive` de cada una.
--
-- Medido en local como owner del demo, con scripts/volumen-sintetico.sql
-- (6.000 clientes, 7.000 vehículos, 20.000 trabajos en dos tenants),
-- `explain (analyze)`, la mejor de tres corridas:
--   resumen_inicio()         1.745 ms → 59 ms
--   contactos_por_hacer()      237 ms → 17 ms
--   vista_clientes entera      263 ms → 38 ms
--   vista_proximos_service     234 ms → 12 ms
--
-- Son las 85 policies que llaman a mi_lubricentro_id(), soy_superadmin()
-- o auth.uid() en su USING o su WITH CHECK: 76 de public y las 9 de los
-- buckets (storage.objects), que el lint marca igual. Lo que una policy
-- llama ADENTRO de otra función (plan_permite(),
-- sucursales_dentro_del_limite(), plazo_edicion()) queda como está: no es
-- esta regla. Cada expresión es la del catálogo (pg_policies) con cada
-- llamada envuelta, y nada más; se comprobó que el catálogo de después,
-- sin el envoltorio, es byte a byte el de antes. R47 vigila que ninguna
-- policy futura vuelva a la forma vieja, y
-- scripts/regresion-rls-initplan.sh lo rompe a mano.
--
-- Una policy nueva se escribe así desde ahora:
--   using ((lubricentro_id = (select mi_lubricentro_id())) or (select soy_superadmin()))
-- ============================================================

-- ---------- public.aceptaciones_terminos · 1 ----------
alter policy aceptaciones_lectura on public.aceptaciones_terminos
  using (((lubricentro_id = (select mi_lubricentro_id())) OR (select soy_superadmin())));

-- ---------- public.adjuntos_trabajo · 4 ----------
alter policy adjuntos_alta on public.adjuntos_trabajo
  with check (((lubricentro_id = (select mi_lubricentro_id())) OR (select soy_superadmin())));

alter policy adjuntos_borrado on public.adjuntos_trabajo
  using (((lubricentro_id = (select mi_lubricentro_id())) OR (select soy_superadmin())));

alter policy adjuntos_lectura on public.adjuntos_trabajo
  using (((lubricentro_id = (select mi_lubricentro_id())) OR (select soy_superadmin())));

alter policy adjuntos_visibilidad on public.adjuntos_trabajo
  using (((lubricentro_id = (select mi_lubricentro_id())) OR (select soy_superadmin())))
  with check (((lubricentro_id = (select mi_lubricentro_id())) OR (select soy_superadmin())));

-- ---------- public.cambios_override_plan · 1 ----------
alter policy cambios_override_admin on public.cambios_override_plan
  using ((select soy_superadmin()))
  with check ((select soy_superadmin()));

-- ---------- public.cambios_precio_calcos · 1 ----------
alter policy cambios_precio_calcos_lectura on public.cambios_precio_calcos
  using ((select soy_superadmin()));

-- ---------- public.cambios_precio_catalogo · 1 ----------
alter policy cambios_precio_admin on public.cambios_precio_catalogo
  using ((select soy_superadmin()))
  with check ((select soy_superadmin()));

-- ---------- public.canjes · 1 ----------
alter policy canjes_tenant on public.canjes
  using (((lubricentro_id = (select mi_lubricentro_id())) OR (select soy_superadmin())))
  with check ((((lubricentro_id = (select mi_lubricentro_id())) AND plan_permite('premios'::text)) OR (select soy_superadmin())));

-- ---------- public.categorias_producto · 1 ----------
alter policy categorias_admin on public.categorias_producto
  using ((select soy_superadmin()))
  with check ((select soy_superadmin()));

-- ---------- public.clientes · 1 ----------
alter policy clientes_tenant on public.clientes
  using (((lubricentro_id = (select mi_lubricentro_id())) OR (select soy_superadmin())))
  with check (((lubricentro_id = (select mi_lubricentro_id())) OR (select soy_superadmin())));

-- ---------- public.config_experiencia · 1 ----------
alter policy config_tenant on public.config_experiencia
  using (((lubricentro_id = (select mi_lubricentro_id())) OR (select soy_superadmin())))
  with check ((((lubricentro_id = (select mi_lubricentro_id())) AND plan_permite('personalizacion_pagina'::text)) OR (select soy_superadmin())));

-- ---------- public.config_neumaticos · 2 ----------
alter policy config_neumaticos_escritura on public.config_neumaticos
  using (((lubricentro_id = (select mi_lubricentro_id())) OR (select soy_superadmin())))
  with check ((((lubricentro_id = (select mi_lubricentro_id())) AND plan_permite('neumaticos'::text)) OR (select soy_superadmin())));

alter policy config_neumaticos_lectura on public.config_neumaticos
  using (((lubricentro_id = (select mi_lubricentro_id())) OR (select soy_superadmin())));

-- ---------- public.contactos · 1 ----------
alter policy contactos_tenant on public.contactos
  using (((lubricentro_id = (select mi_lubricentro_id())) OR (select soy_superadmin())))
  with check (((lubricentro_id = (select mi_lubricentro_id())) OR (select soy_superadmin())));

-- ---------- public.contactos_fidelli · 1 ----------
alter policy contactos_fidelli_admin on public.contactos_fidelli
  using ((select soy_superadmin()))
  with check ((select soy_superadmin()));

-- ---------- public.contactos_pauta · 1 ----------
alter policy contactos_pauta_superadmin on public.contactos_pauta
  using ((select soy_superadmin()))
  with check ((select soy_superadmin()));

-- ---------- public.correcciones_patente · 2 ----------
alter policy correcciones_alta on public.correcciones_patente
  with check ((select soy_superadmin()));

alter policy correcciones_lectura on public.correcciones_patente
  using ((select soy_superadmin()));

-- ---------- public.cresium_eventos · 1 ----------
alter policy cresium_eventos_admin on public.cresium_eventos
  using ((select soy_superadmin()));

-- ---------- public.cresium_ordenes · 1 ----------
alter policy cresium_ordenes_propia on public.cresium_ordenes
  using (((lubricentro_id = (select mi_lubricentro_id())) OR (select soy_superadmin())));

-- ---------- public.datos_empresa · 3 ----------
alter policy datos_empresa_alta on public.datos_empresa
  with check (((lubricentro_id = (select mi_lubricentro_id())) OR (select soy_superadmin())));

alter policy datos_empresa_edicion on public.datos_empresa
  using (((lubricentro_id = (select mi_lubricentro_id())) OR (select soy_superadmin())))
  with check (((lubricentro_id = (select mi_lubricentro_id())) OR (select soy_superadmin())));

alter policy datos_empresa_lectura on public.datos_empresa
  using (((lubricentro_id = (select mi_lubricentro_id())) OR (select soy_superadmin())));

-- ---------- public.disenos_calco · 1 ----------
alter policy disenos_calco_lectura on public.disenos_calco
  using (((select soy_superadmin()) OR (lubricentro_id = (select mi_lubricentro_id()))));

-- ---------- public.emails_calcos · 1 ----------
alter policy emails_calcos_superadmin on public.emails_calcos
  using ((select soy_superadmin()));

-- ---------- public.emails_cobranza · 1 ----------
alter policy emails_cobranza_superadmin on public.emails_cobranza
  using ((select soy_superadmin()));

-- ---------- public.encargos_calcos · 1 ----------
alter policy encargos_calcos_lectura on public.encargos_calcos
  using (((select soy_superadmin()) OR (lubricentro_id = (select mi_lubricentro_id()))));

-- ---------- public.gasto_pauta · 1 ----------
alter policy gasto_pauta_superadmin on public.gasto_pauta
  using ((select soy_superadmin()))
  with check ((select soy_superadmin()));

-- ---------- public.landing_busquedas · 1 ----------
alter policy busquedas_lectura on public.landing_busquedas
  using (((lubricentro_id = (select mi_lubricentro_id())) OR (select soy_superadmin())));

-- ---------- public.lubricentros · 2 ----------
alter policy lubricentros_admin on public.lubricentros
  using ((select soy_superadmin()))
  with check ((select soy_superadmin()));

alter policy lubricentros_lectura on public.lubricentros
  using (((id = (select mi_lubricentro_id())) OR (select soy_superadmin())));

-- ---------- public.marcas_vehiculo · 1 ----------
alter policy marcas_admin on public.marcas_vehiculo
  using ((select soy_superadmin()))
  with check ((select soy_superadmin()));

-- ---------- public.mensaje_templates · 1 ----------
alter policy templates_tenant on public.mensaje_templates
  using (((lubricentro_id = (select mi_lubricentro_id())) OR (select soy_superadmin())))
  with check (((lubricentro_id = (select mi_lubricentro_id())) OR (select soy_superadmin())));

-- ---------- public.modulos · 1 ----------
alter policy modulos_admin on public.modulos
  using ((select soy_superadmin()))
  with check ((select soy_superadmin()));

-- ---------- public.notas_vehiculo · 1 ----------
alter policy notas_tenant on public.notas_vehiculo
  using (((lubricentro_id = (select mi_lubricentro_id())) OR (select soy_superadmin())))
  with check (((lubricentro_id = (select mi_lubricentro_id())) OR (select soy_superadmin())));

-- ---------- public.pagos · 2 ----------
alter policy pagos_admin on public.pagos
  using ((select soy_superadmin()))
  with check ((select soy_superadmin()));

alter policy pagos_lectura on public.pagos
  using (((lubricentro_id = (select mi_lubricentro_id())) OR (select soy_superadmin())));

-- ---------- public.pedidos_calcos · 1 ----------
alter policy pedidos_calcos_lectura on public.pedidos_calcos
  using ((select soy_superadmin()));

-- ---------- public.planes · 1 ----------
alter policy planes_admin on public.planes
  using ((select soy_superadmin()))
  with check ((select soy_superadmin()));

-- ---------- public.premios · 1 ----------
alter policy premios_tenant on public.premios
  using (((lubricentro_id = (select mi_lubricentro_id())) OR (select soy_superadmin())))
  with check ((((lubricentro_id = (select mi_lubricentro_id())) AND plan_permite('premios'::text)) OR (select soy_superadmin())));

-- ---------- public.presupuesto_items · 2 ----------
alter policy presupuesto_items_escritura on public.presupuesto_items
  using (((lubricentro_id = (select mi_lubricentro_id())) OR (select soy_superadmin())))
  with check ((((lubricentro_id = (select mi_lubricentro_id())) AND plan_permite('presupuestos'::text)) OR (select soy_superadmin())));

alter policy presupuesto_items_lectura on public.presupuesto_items
  using (((lubricentro_id = (select mi_lubricentro_id())) OR (select soy_superadmin())));

-- ---------- public.presupuestos · 4 ----------
alter policy presupuestos_alta on public.presupuestos
  with check ((((lubricentro_id = (select mi_lubricentro_id())) AND plan_permite('presupuestos'::text)) OR (select soy_superadmin())));

alter policy presupuestos_borrado on public.presupuestos
  using ((select soy_superadmin()));

alter policy presupuestos_edicion on public.presupuestos
  using (((lubricentro_id = (select mi_lubricentro_id())) OR (select soy_superadmin())))
  with check ((((lubricentro_id = (select mi_lubricentro_id())) AND plan_permite('presupuestos'::text)) OR (select soy_superadmin())));

alter policy presupuestos_lectura on public.presupuestos
  using (((lubricentro_id = (select mi_lubricentro_id())) OR (select soy_superadmin())));

-- ---------- public.productos · 1 ----------
alter policy productos_tenant on public.productos
  using (((lubricentro_id = (select mi_lubricentro_id())) OR (select soy_superadmin())))
  with check (((lubricentro_id = (select mi_lubricentro_id())) OR (select soy_superadmin())));

-- ---------- public.purgas · 1 ----------
alter policy purgas_lectura on public.purgas
  using ((select soy_superadmin()));

-- ---------- public.recuentos_calcos · 1 ----------
alter policy recuentos_calcos_lectura on public.recuentos_calcos
  using (((select soy_superadmin()) OR (lubricentro_id = (select mi_lubricentro_id()))));

-- ---------- public.service_items · 2 ----------
alter policy items_escritura on public.service_items
  using ((((lubricentro_id = (select mi_lubricentro_id())) AND (EXISTS ( SELECT 1
   FROM services s
  WHERE ((s.id = service_items.service_id) AND (((now() - s.created_at) < plazo_edicion(s.tipo)) OR ((s.desbloqueado_hasta IS NOT NULL) AND (now() < s.desbloqueado_hasta))))))) OR (select soy_superadmin())))
  with check ((((lubricentro_id = (select mi_lubricentro_id())) AND (EXISTS ( SELECT 1
   FROM services s
  WHERE ((s.id = service_items.service_id) AND (((now() - s.created_at) < plazo_edicion(s.tipo)) OR ((s.desbloqueado_hasta IS NOT NULL) AND (now() < s.desbloqueado_hasta))))))) OR (select soy_superadmin())));

alter policy items_lectura on public.service_items
  using (((lubricentro_id = (select mi_lubricentro_id())) OR (select soy_superadmin())));

-- ---------- public.service_ruedas · 2 ----------
alter policy ruedas_escritura on public.service_ruedas
  using ((((lubricentro_id = (select mi_lubricentro_id())) AND (EXISTS ( SELECT 1
   FROM services s
  WHERE ((s.id = service_ruedas.service_id) AND (((now() - s.created_at) < plazo_edicion(s.tipo)) OR ((s.desbloqueado_hasta IS NOT NULL) AND (now() < s.desbloqueado_hasta))))))) OR (select soy_superadmin())))
  with check ((((lubricentro_id = (select mi_lubricentro_id())) AND plan_permite('neumaticos'::text) AND (EXISTS ( SELECT 1
   FROM services s
  WHERE ((s.id = service_ruedas.service_id) AND (((now() - s.created_at) < plazo_edicion(s.tipo)) OR ((s.desbloqueado_hasta IS NOT NULL) AND (now() < s.desbloqueado_hasta))))))) OR (select soy_superadmin())));

alter policy ruedas_lectura on public.service_ruedas
  using (((lubricentro_id = (select mi_lubricentro_id())) OR (select soy_superadmin())));

-- ---------- public.services · 4 ----------
alter policy services_borrado on public.services
  using ((select soy_superadmin()));

alter policy services_edicion on public.services
  using ((((lubricentro_id = (select mi_lubricentro_id())) AND (((now() - created_at) < plazo_edicion(tipo)) OR ((desbloqueado_hasta IS NOT NULL) AND (now() < desbloqueado_hasta)))) OR (select soy_superadmin())))
  with check ((((lubricentro_id = (select mi_lubricentro_id())) AND ((tipo <> 'mecanica'::tipo_trabajo) OR plan_permite('mecanica'::text)) AND ((tipo <> 'neumaticos'::tipo_trabajo) OR plan_permite('neumaticos'::text)) AND ((tipo <> 'caja'::tipo_trabajo) OR plan_permite('caja'::text))) OR (select soy_superadmin())));

alter policy services_insercion on public.services
  with check ((((lubricentro_id = (select mi_lubricentro_id())) AND ((tipo <> 'mecanica'::tipo_trabajo) OR plan_permite('mecanica'::text)) AND ((tipo <> 'neumaticos'::tipo_trabajo) OR plan_permite('neumaticos'::text)) AND ((tipo <> 'caja'::tipo_trabajo) OR plan_permite('caja'::text))) OR (select soy_superadmin())));

alter policy services_lectura on public.services
  using (((lubricentro_id = (select mi_lubricentro_id())) OR (select soy_superadmin())));

-- ---------- public.snapshots_diarios · 1 ----------
alter policy snapshots_diarios_lectura on public.snapshots_diarios
  using ((select soy_superadmin()));

-- ---------- public.snapshots_tenant_diarios · 1 ----------
alter policy snapshots_tenant_diarios_lectura on public.snapshots_tenant_diarios
  using ((select soy_superadmin()));

-- ---------- public.sucursales · 4 ----------
alter policy sucursales_alta on public.sucursales
  with check ((((lubricentro_id = (select mi_lubricentro_id())) AND ((NOT activa) OR sucursales_dentro_del_limite(lubricentro_id, id))) OR (select soy_superadmin())));

alter policy sucursales_borrado on public.sucursales
  using (((lubricentro_id = (select mi_lubricentro_id())) OR (select soy_superadmin())));

alter policy sucursales_edicion on public.sucursales
  using (((lubricentro_id = (select mi_lubricentro_id())) OR (select soy_superadmin())))
  with check (((lubricentro_id = (select mi_lubricentro_id())) OR (select soy_superadmin())));

alter policy sucursales_lectura on public.sucursales
  using (((lubricentro_id = (select mi_lubricentro_id())) OR (select soy_superadmin())));

-- ---------- public.supresiones_cliente · 1 ----------
alter policy supresiones_lectura on public.supresiones_cliente
  using (((lubricentro_id = (select mi_lubricentro_id())) OR (select soy_superadmin())));

-- ---------- public.suscripciones · 2 ----------
alter policy suscripciones_admin on public.suscripciones
  using ((select soy_superadmin()))
  with check ((select soy_superadmin()));

alter policy suscripciones_lectura on public.suscripciones
  using (((lubricentro_id = (select mi_lubricentro_id())) OR (select soy_superadmin())));

-- ---------- public.tenant_eventos · 1 ----------
alter policy tenant_eventos_lectura on public.tenant_eventos
  using ((select soy_superadmin()));

-- ---------- public.tipo_cambio · 1 ----------
alter policy tipo_cambio_lectura on public.tipo_cambio
  using ((select soy_superadmin()));

-- ---------- public.trabajos_pendientes · 4 ----------
alter policy pendientes_alta on public.trabajos_pendientes
  with check ((((lubricentro_id = (select mi_lubricentro_id())) AND plan_permite('pendientes'::text)) OR (select soy_superadmin())));

alter policy pendientes_borrado on public.trabajos_pendientes
  using ((select soy_superadmin()));

alter policy pendientes_edicion on public.trabajos_pendientes
  using (((lubricentro_id = (select mi_lubricentro_id())) OR (select soy_superadmin())))
  with check ((((lubricentro_id = (select mi_lubricentro_id())) AND plan_permite('pendientes'::text)) OR (select soy_superadmin())));

alter policy pendientes_lectura on public.trabajos_pendientes
  using (((lubricentro_id = (select mi_lubricentro_id())) OR (select soy_superadmin())));

-- ---------- public.usuarios · 2 ----------
alter policy usuarios_admin on public.usuarios
  using ((select soy_superadmin()))
  with check ((select soy_superadmin()));

alter policy usuarios_propio on public.usuarios
  using (((id = (select auth.uid())) OR (select soy_superadmin())));

-- ---------- public.vehiculos · 1 ----------
alter policy vehiculos_tenant on public.vehiculos
  using (((lubricentro_id = (select mi_lubricentro_id())) OR (select soy_superadmin())))
  with check (((lubricentro_id = (select mi_lubricentro_id())) OR (select soy_superadmin())));

-- ---------- storage.objects · 9 ----------
alter policy "adjuntos borrado propio" on storage.objects
  using (((bucket_id = 'adjuntos'::text) AND ((storage.foldername(name))[1] = ((select mi_lubricentro_id()))::text) AND (NOT (EXISTS ( SELECT 1
   FROM public.adjuntos_trabajo a
  WHERE (a.ruta = objects.name))))));

alter policy "adjuntos lectura" on storage.objects
  using (((bucket_id = 'adjuntos'::text) AND ((select soy_superadmin()) OR ((storage.foldername(name))[1] = ((select mi_lubricentro_id()))::text))));

alter policy "adjuntos subida propia" on storage.objects
  with check (((bucket_id = 'adjuntos'::text) AND ((storage.foldername(name))[1] = ((select mi_lubricentro_id()))::text)));

alter policy "calcos borrado fidelli" on storage.objects
  using (((bucket_id = 'calcos'::text) AND (select soy_superadmin()) AND (NOT (EXISTS ( SELECT 1
   FROM public.disenos_calco d
  WHERE (d.ruta = objects.name))))));

alter policy "calcos lectura" on storage.objects
  using (((bucket_id = 'calcos'::text) AND ((select soy_superadmin()) OR ((storage.foldername(name))[1] = ((select mi_lubricentro_id()))::text))));

alter policy "calcos subida fidelli" on storage.objects
  with check (((bucket_id = 'calcos'::text) AND (select soy_superadmin())));

alter policy "logos borrado propio" on storage.objects
  using (((bucket_id = 'logos'::text) AND ((storage.foldername(name))[1] = ((select mi_lubricentro_id()))::text)));

alter policy "logos reemplazo propio" on storage.objects
  using (((bucket_id = 'logos'::text) AND ((storage.foldername(name))[1] = ((select mi_lubricentro_id()))::text)))
  with check (((bucket_id = 'logos'::text) AND ((storage.foldername(name))[1] = ((select mi_lubricentro_id()))::text)));

alter policy "logos subida propia" on storage.objects
  with check (((bucket_id = 'logos'::text) AND ((storage.foldername(name))[1] = ((select mi_lubricentro_id()))::text)));


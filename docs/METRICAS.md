# Métricas de crecimiento · definiciones y cimientos

**Bloque MÉTRICAS 1 · 22 de septiembre de 2026 · rama `feat/metricas-1`.**
Este archivo es el contrato: cada función SQL del bloque lo cita en su
comentario, y cualquier número que el admin muestre a partir del bloque 2 tiene
que poder rastrearse hasta una definición de acá. Parte del inventario de
`docs/ADMIN-INVENTARIO.md` (22/09/2026): ahí está lo que había antes.

Lo que este bloque construye es **solo base de datos y cimientos**: tablas,
funciones, triggers, el cierre diario y dos campos de formulario. No agrega
pantallas ni cambia navegación (bloque 2). Es aditivo: nada de lo que hoy
funciona cambia de comportamiento, salvo que suspender un tenant ahora exige
un motivo.

**Bloque MÉTRICAS 2 · 23 de septiembre de 2026 · rama `feat/metricas-2`.**
Las pantallas: `/fidelli` pasa a ser el **Resumen** (cinco números con
comparación, el MRR contra el objetivo, el pulso de trabajos, las alertas) y
el listado se muda a `/fidelli/lubricentros` (siete columnas, salud en SQL,
filtros y buscador en la URL). La ficha suma el origen y el owner en la
cabecera y la pestaña **Historial**. Lo que agrega a la base está en § 2
(migración `20260923100000`) y las decisiones en § 6; nada del bloque 1 se
modifica salvo `metricas_plataforma()`, que ahora cuenta trabajos de cualquier
tipo.

**Bloque MÉTRICAS 3 · 23 de septiembre de 2026 · rama `feat/metricas-3`.**
El canal pago y el uso real: los **contactos de pauta** (un registro de cinco
campos que se carga desde el celular en menos de diez segundos; NO es un CRM:
sin etapas, responsables, seguimientos ni notas), el **gasto de pauta** por
semana y canal, el **embudo** por cohorte, la **activación** (que ya estaba
definida y acá se implementa), los **autos que volvieron** a 60 días, el
**Pulso apilado por tipo** y los **pedidos de calcos**. Migraciones
`20260924100000` a `20260924104000`; decisiones en § 6.

**Bloque MÉTRICAS 4 · 23 de septiembre de 2026 · rama `feat/metricas-4`.**
El último del sprint: **Crecimiento** (`/fidelli/crecimiento`: de dónde
viene el MRR, si entran más de los que se van, si se quedan, si pagan más
con el tiempo, si usan el sistema, si rinde la pauta), el **data room** (la
exportación CSV de todo, pensada para Excel en español, con
`docs/DATA-ROOM.md` como diccionario) y la **limpieza de las consultas que
hacían trabajo por fila** (`listado_lubricentros()`, `metricas_plataforma()`,
la ficha, precios). Todo lo de Crecimiento **lee fotos y eventos; nada
recalcula historia**. Migraciones `20260925100000` a `20260925102000`;
decisiones en § 6.

---

## 1 · Definiciones

| Término | Definición | Fuente del dato |
|---|---|---|
| **Tenant activo** | `lubricentros.activo = true` **y** el reloj no lo tiene suspendido: `reloj_cobranza(l) ->> 'estado'` distinto de `'suspendido'`. Es **la única definición**. Los exentos (`descuento_pct >= 100`) son activos con MRR 0. "Carga trabajos" **no** define activo: define salud. | `es_activo(l lubricentros)` · `20260922203000_metricas_plata.sql` |
| **MRR de un tenant** | El abono mensualizado vigente, con módulo pago y descuentos, en ARS: `monto_de_renovacion_en(id, periodo) ->> 'total'` dividido por los meses del período (1, 6 o 12, `meses_del_periodo()`). **Cero si no está activo. Cero si es exento** (el total de un exento con módulo pago daría el módulo solo; "quien no paga nada no puede deber nada" gana). Redondeado a 2 decimales. | `mrr_de_tenant(p_id uuid)` · `20260922203000` |
| **MRR de la plataforma** | Suma de `mrr_de_tenant()` sobre todos los tenants. | `mrr_plataforma()` · `20260922203000` |
| **MRR en USD** | MRR ARS ÷ tipo de cambio **venta** del día (`tipo_cambio.venta`). Solo existe dentro del snapshot diario: `snapshots_diarios.mrr_usd`. | `cerrar_dia()` · `20260922204000_snapshots.sql` |
| **Alta** | La fecha de creación del tenant, `lubricentros.created_at`. Desde el 16/09/2026 los tenants nacen pagando, así que alta = inicio de cobro. Queda como evento `alta`. | trigger `tenant_evento_alta` · `20260922201000_tenant_eventos.sql` |
| **Baja** | El día en que el tenant deja de estar activo: por **suspensión manual** (evento `suspension`, con motivo obligatorio) o por **reloj** (evento `suspension_reloj`, que emite el cierre diario al ver la transición). | `cambiar_estado_lubricentro()` y `cerrar_dia()` |
| **Reactivación** | El día en que vuelve a estar activo: `reactivacion` (manual) o `reactivacion_reloj` (el cierre diario lo vio volver sin un evento manual ese día). | ídem |
| **Churn del mes** | Bajas del mes ÷ tenants activos al inicio del mes. **Involuntario**: motivo `falta_de_pago` o `suspension_reloj`. **Voluntario**: el resto (`pedido_del_cliente`, `cierre_del_negocio`, `otro`). Se calcula en el bloque 2 sobre `tenant_eventos` y `snapshots_diarios`. | `tenant_eventos.tipo`, `tenant_eventos.motivo`, `snapshots_diarios.tenants_activos` |
| **Trabajo** | Una fila de `services` no anulada, **de cualquier tipo** (`service`, `mecanica`, `neumaticos`). "Services del mes" desaparece como nombre: se llama **trabajos del mes** y se desglosa por tipo. | `snapshots_diarios.trabajos_*`, `snapshots_tenant_diarios.trabajos_dia` |
| **Activación** | 20 o más trabajos en los 7 días desde el alta. Se calcula en el bloque 2 con `lubricentros.created_at` y `services.fecha`. | (bloque 2) |
| **Autos que volvieron** | Un trabajo sobre un vehículo con un contacto (recordatorio) disparado en los **60 días previos**. Generaliza `recuperados_del_mes()`, que usa 30 días; las dos conviven hasta el bloque 3. | (bloque 2, sobre `contactos` × `services`) |
| **Recordatorios disparados** | Filas de `contactos`. Se llaman "disparados" porque registran **el clic** en el botón de WhatsApp, no el envío. | `snapshots_diarios.recordatorios_dia` |
| **Escaneos** | Filas de `landing_busquedas` (búsquedas de patente desde la página pública). | `snapshots_diarios.escaneos_dia` |
| **Snapshot diario** | Foto inmutable del cierre de cada día en hora argentina (`America/Argentina/Buenos_Aires`, la misma zona de `lib/fechas.ts` y de la base). Los históricos **se leen del snapshot, nunca se recalculan**. | `snapshots_diarios`, `snapshots_tenant_diarios` · `20260922204000` |
| **Origen del tenant** | De dónde vino: `meta`, `google` (desde el bloque 3), `referido`, `directo`, `distribuidor`, `calco`, `organico`, `otro`, con un detalle libre. Se carga en el alta y se corrige en la edición. | `lubricentros.origen`, `lubricentros.origen_detalle` · `20260922200000_origen_tenant.sql`, `20260924100000_origen_google.sql` |
| **Contacto** (bloque 3) | Una persona que escribió por un canal pago: `meta` (Instagram, Messenger o WhatsApp) o `google` (Google Ads ya corre y también puede traer), y `otro` por si hace falta. Se registra por la **fecha del primer mensaje** y el canal; el teléfono es opcional y sirve para no duplicar. | `contactos_pauta.fecha`, `.canal`, `.origen`, `.telefono` · `20260924101000_contactos_pauta.sql` |
| **Demo** | Se le envió la demo (el video o su página armada). Una fecha. | `contactos_pauta.demo_at` |
| **Cierre** | El contacto se convirtió en tenant: fecha y tenant. Al cerrar, **el origen del tenant se fija solo según el canal si estaba vacío** (`meta` → `meta`, `google` → `google`, `otro` → `otro`, con detalle «contacto de pauta del DD/MM/AAAA», la fecha del primer mensaje), y eso deja el evento `origen` de siempre. Si el tenant ya tenía origen, no se toca. | `contactos_pauta.cierre_at`, `.lubricentro_id` · `marcar_cierre()` |
| **Pérdida** | El contacto no avanzó: fecha y un motivo de una palabra (`precio`, `no_responde`, `ya_tiene_sistema`, `no_factura`, `no_es_dueno`, `otro`), opcional pero se pide. Cierre y pérdida **no pueden coexistir**; «Reabrir» borra cualquiera de los dos. | `contactos_pauta.perdida_at`, `.motivo_perdida` |
| **Tasa de cierre** | Cierres ÷ contactos, **por cohorte de fecha de primer contacto** (semana ISO o mes): un contacto que escribió en la semana 1 y cerró en la semana 3 cuenta como cierre de la semana 1. Nunca por fecha de cierre. Lo mismo la tasa de demo. | `embudo_pauta()` |
| **Ciclo** | Mediana de días entre el primer contacto y el cierre, sobre los cierres de la cohorte. | `embudo_pauta().ciclo_mediana_dias` |
| **Gasto de pauta** | Por semana (siempre un lunes) y canal, **en USD**: Meta y Google se pagan en dólares. El equivalente en pesos sale de `tc_vigente()` del día, nunca se guarda. | `gasto_pauta` · `20260924101000` |
| **CAC del canal** | En un período: gasto del período ÷ **cierres del período por fecha de cierre** (no por cohorte: la plata se gastó ese mes y los cierres entraron ese mes). Se muestra siempre con el número de cierres al lado; con menos de 3 cierres va en gris con «pocos casos». Null si no hubo cierres. | `embudo_pauta().cac_usd`, `.cierres_periodo` |
| **Activación** | 20 o más trabajos en los 7 días desde el alta: `services` no anulados de cualquier tipo con `created_at` en `[lubricentros.created_at, created_at + 7 días)`. El trabajo 20 del día 7 activa; el del día 8 ya no. Mientras no pasaron los 7 días está «en curso, día N de 7». | `activacion_tenant()`, `activacion_por_mes()` · `20260924102000_activacion_uso.sql` |
| **Autos que volvieron** | Vehículos distintos con un trabajo no anulado en el rango cuyo vehículo tuvo una fila en `contactos` (un recordatorio disparado) en los **60 días previos** al trabajo, contando el mismo día. Reemplaza en el admin a «recuperados del mes» (30 días); `recuperados_del_mes()` no se toca porque la usa el panel del tenant. | `autos_que_volvieron()`, `autos_que_volvieron_plataforma()` |
| **Pedido de calcos** | Cada entrega de calcos a un tenant: cantidad, si estaban incluidas en el plan o se cobraron, monto en ARS (obligatorio si se cobraron) y fecha. Append-only con los tres candados. **`lubricentros.calcos_entregadas` pasa a ser la suma de los pedidos** y se recalcula en cada registro; el evento `calcos` lo emite el trigger de siempre. | `pedidos_calcos`, `registrar_pedido_calcos()` · `20260924103000_pedidos_calcos.sql` |
| **Mes cerrado** (bloque 4) | Un mes cuyo **último día calendario** tiene foto en `snapshots_diarios` (fuente `cierre` o `reconstruido`). El mes en curso no está cerrado: se muestra con la etiqueta «en curso» y **el dato del último día con foto**. La vista `snapshots_mensuales` da, por mes, la foto del último día con foto y la bandera `en_curso` (`fecha` < último día del mes). Un mes pasado con la foto del último día faltante también queda `en_curso = true`: no se inventa el cierre. | vista `snapshots_mensuales` · `20260925100000_crecimiento.sql` |
| **Movimientos de MRR de un mes** | Se comparan, **por tenant**, el MRR de la foto del mes anterior (`snapshots_tenant_diarios` en la fecha de `snapshots_mensuales` del mes anterior; 0 si el tenant no tiene fila) con el de la foto del mes. Con `antes` = a y `ahora` = b: **nuevo** (a = 0, b > 0, alta en el mes por `lubricentros.created_at` en hora argentina); **reactivación** (a = 0, b > 0, alta anterior al mes); **churn** (a > 0, b = 0); **ajuste de precio** (a > 0, b > 0, a ≠ b y **no cambió el cliente**: es la lista de precios en pesos moviéndose); **expansión** (a > 0, b > 0, cambió el cliente y b > a); **contracción** (ídem y b < a). «Cambió el cliente» = cambió `plan_id`, `periodo` o `modulo_pago` entre las dos fotos, **o hubo en el mes un evento `cambio_plan` del tenant con otro `descuento_pct`** (la foto no guarda el descuento negociado, y un descuento renegociado es el cliente, no la lista). Un cambio del cliente con el mismo MRR no es movimiento. `mrr_inicio` y `mrr_fin` son **la suma de los a y de los b** (por eso la identidad cierra por construcción): `mrr_inicio + nuevo + reactivacion + expansion − contraccion − churn + ajuste_precio = mrr_fin`, con tolerancia de 1 peso (o 1 dólar). `contraccion` y `churn` se devuelven **como magnitudes positivas** (la pantalla y el CSV las muestran con signo); `ajuste_precio` va con signo. **Neto comercial** = nuevo + reactivación + expansión − contracción − churn (el ajuste de precio queda aparte). `crecimiento_pct` = neto ÷ `mrr_inicio`, como fracción (0,12 = 12 %). `tenants_inicio` / `tenants_fin` = `tenants_activos` de las dos fotos. **El primer mes con historia no tiene foto anterior**: sale con `sin_foto_anterior = true`, `mrr_fin` y `tenants_fin` cargados y los movimientos en null; no se inventa un inicio en cero. En USD, cada MRR se convierte con el `tc_venta` **de su propia foto**; sin tipo de cambio en alguna de las dos fotos, los montos de ese mes en USD son null. | `movimientos_mrr(p_desde, p_hasta, p_moneda)` · `20260925100000` |
| **Cohorte** | Los tenants con alta en un mismo mes (`lubricentros.created_at`, hora argentina). **Retención de logos al mes N**: tenants de la cohorte con `activo = true` en la foto del último día con foto del mes (alta + N) ÷ tamaño de la cohorte. Solo se calcula cuando ese mes está **cerrado**; si no, null («—» en pantalla). N ∈ {1, 2, 3, 6, 9, 12}. `activados` sale de `activacion_por_mes()`. | `cohortes_logos(p_desde, p_hasta)` · `20260925100000` |
| **GRR y NRR de una cohorte a N meses** | En **USD** (para neutralizar los ajustes en pesos): el MRR inicial de la cohorte es la suma, por tenant, del MRR de la foto del último día del mes de alta convertido con el `tc_venta` de esa foto. **GRR_N** = Σ mín(MRR del tenant al mes alta + N, su MRR inicial) ÷ MRR inicial de la cohorte; **NRR_N** = Σ MRR al mes alta + N ÷ MRR inicial. Un tenant que se fue aporta 0 a las dos (su MRR en la foto es 0). NRR ≥ GRR siempre. N ∈ {3, 6, 12}; null si el mes alta + N no está cerrado, si el mes de alta no está cerrado, o si el MRR inicial es 0 («sin historia todavía»). | `cohortes_ingresos(p_desde, p_hasta)` · `20260925100000` |
| **Churn del mes, por tipo y por origen** | Bajas = eventos `suspension` + `suspension_reloj` del mes (`ocurrido_at` en hora argentina). **Involuntarias** = `suspension_reloj` + `suspension` con motivo `falta_de_pago` (el `motivo` del evento empieza con el código); **voluntarias** = el resto (`pedido_del_cliente`, `cierre_del_negocio`, `otro`, o sin motivo). `por_motivo` cuenta por código (`reloj` para las del reloj); `por_origen` cuenta por `lubricentros.origen` del tenant dado de baja (`sin_origen` si no tiene). `churn_pct` = bajas ÷ `tenants_activos` de la foto del mes anterior (fracción; null sin foto anterior). Todos los meses del rango salen, con ceros. | `churn_por_mes(p_desde, p_hasta)` · `20260925100000` |
| **Altas y bajas por mes** | `altas` = tenants con `created_at` en el mes; `bajas` = como arriba; `reactivaciones` = eventos `reactivacion` + `reactivacion_reloj`; `neto` = altas − bajas. Todos los meses del rango, con ceros. | `altas_bajas_por_mes(p_desde, p_hasta)` · `20260925100000` |
| **Trabajos por mes** | Suma de `trabajos_dia` (y por tipo), `recordatorios_dia` y `escaneos_dia` de **todas las fotos diarias** del mes, más `autos_que_volvieron_plataforma()` entre el primer día del mes y el último día con foto. Solo los meses con alguna foto; el mes en curso lleva `en_curso`. | `trabajos_por_mes(p_desde, p_hasta)` · `20260925100000` |
| **Data room** | La exportación CSV de cada tabla de la plataforma y de cada tabla de Crecimiento, para Excel en español: separador `;`, decimales con coma, fechas ISO, UTF-8 con BOM, encabezados en español, `Content-Disposition: attachment` con nombre `fidelli-motors_<recurso>_<fecha>.csv`. Solo superadmin: sin sesión o con otro rol, 403 sin tocar la base. El diccionario de datos es `docs/DATA-ROOM.md`. | `app/api/fidelli/exportar/[recurso]/route.ts`, `lib/fidelli/csv.ts` |

**El día** de un instante (`created_at`, `ocurrido_at`) es su fecha calendario en
`America/Argentina/Buenos_Aires`. Los trabajos se cuentan por `services.fecha`
(la fecha del trabajo, que es un `date`), no por `created_at`.

---

## 2 · Dónde vive cada cosa

| Objeto | Migración | Qué es |
|---|---|---|
| enum `origen_tenant`, `lubricentros.origen`, `lubricentros.origen_detalle`, `fijar_origen_tenant(p_id, p_origen, p_detalle)` | `20260922200000_origen_tenant.sql` | El origen, y su única puerta (definer, exige superadmin). |
| enum `tipo_evento_tenant`, enum `motivo_suspension`, tabla `tenant_eventos`, `emitir_evento_tenant(...)`, `origen_evento_de_sesion()`, los triggers de instrumentación, `cambiar_estado_lubricentro(p_id, p_activo, p_motivo, p_detalle)` | `20260922201000_tenant_eventos.sql` | El libro de novedades por tenant y la suspensión con motivo. |
| tabla `tipo_cambio`, `tc_vigente(p_fecha)` | `20260922202000_tipo_cambio.sql` | La cotización oficial por día. |
| `es_activo(l lubricentros)`, `mrr_de_tenant(p_id)`, `mrr_plataforma()` | `20260922203000_metricas_plata.sql` | La única definición de "activo" y de la plata mensualizada. |
| tablas `snapshots_diarios`, `snapshots_tenant_diarios`, `cerrar_dia(p_fecha, p_tc_venta, p_tc_compra, p_fuente)`, `reconstruir_snapshots(p_desde, p_hasta)` | `20260922204000_snapshots.sql` | La foto diaria, el cierre y la reconstrucción. |
| backfill de eventos (`alta`, `pago`, `modulo_activado` / `modulo_desactivado`) | `20260922205000_backfill_eventos.sql` | Idempotente; corre con el `db push`. |
| `app/api/fidelli/cierre-diario/route.ts` + `vercel.json` | (código) | El cron de Vercel que llama `cerrar_dia()` todos los días a las 00:10 AR. |
| `scripts/backfill-tc.mjs` | (código) | Carga el histórico del tipo de cambio oficial. Se corre a mano. |
| `lib/fidelli/eventos.ts` | (código) | Los catálogos de origen y de motivo de suspensión, con sus etiquetas. |
| R31 en `supabase/verificaciones.sql` · `scripts/regresion-metricas.sh` | (red) | Las pruebas y su rotura a mano. |
| `metricas_plataforma()` (redefinida: trabajos de cualquier tipo, claves `trabajos_mes`, `acumulado`, `primer_trabajo`, `series`), `salud_tenants()`, `trabajos_semanales(p_lubricentro_id, p_semanas)`, `indicadores_tenants()`, `resumen_admin()` | `20260923100000_resumen_admin.sql` | **Bloque 2.** Lo que leen el Resumen y el listado. Todas invoker con guarda `soy_superadmin()` (42501). |
| `lib/fidelli/objetivo.ts` | (código, bloque 2) | El objetivo de MRR en USD mes a mes hasta 2028-03 y la referencia de US$ 10.000. Es la meta; se cambia a mano. |
| `lib/fidelli/resumen.ts`, `lib/fidelli/listado.ts`, `lib/fidelli/historial.ts` | (código, bloque 2) | Los contratos de `resumen_admin()`, el cruce de las lecturas del listado y los filtros de la URL, y la traducción de `tenant_eventos` a oraciones. |
| `app/fidelli/page.tsx` (Resumen), `app/fidelli/lubricentros/page.tsx` (listado), `components/fidelli/{franja-resumen,grafico-mrr,alertas,tabla-lubricentros,filtros-listado,chip,sparkline}.tsx`, `components/fidelli/ficha/tab-historial.tsx` | (código, bloque 2) | Las pantallas. |
| R32 en `supabase/verificaciones.sql` · las nueve roturas de `scripts/regresion-metricas.sh` | (red, bloque 2) | La guarda, la exención de la salud vía `estado_atencion()`, los cortes, los tres tipos en las cuatro lecturas. |
| `origen_tenant` + `'google'` | `20260924100000_origen_google.sql` | **Bloque 3.** El valor que necesita el cierre de un contacto de Google Ads. Migración sola: un valor nuevo de enum no se usa en la transacción que lo crea. |
| enums `canal_pauta`, `origen_meta`, `motivo_perdida`; tablas `contactos_pauta`, `gasto_pauta`; `registrar_contacto_pauta()`, `marcar_demo()`, `marcar_cierre()`, `marcar_perdida()`, `reabrir_contacto_pauta()`, `embudo_pauta(p_desde, p_hasta, p_agrupar, p_canal)`, `embudo_pauta_mes_actual()` | `20260924101000_contactos_pauta.sql` | **Bloque 3.** El registro de cinco campos, el gasto semanal y el embudo por cohorte. Solo superadmin (RLS y guardas). |
| `activacion_tenant(p_lubricentro_id)`, `activacion_por_mes(p_desde, p_hasta)`, `autos_que_volvieron(p_lubricentro_id, p_desde, p_hasta)`, `autos_que_volvieron_plataforma(p_desde, p_hasta)`, `uso_tenant(p_lubricentro_id, p_dias)`; `indicadores_tenants()` con `activado` y `dias_alta`; `metricas_plataforma()` con la serie por tipo | `20260924102000_activacion_uso.sql` | **Bloque 3.** La activación, los autos que volvieron y el uso de la ficha; las dos redefiniciones permitidas del bloque 2. |
| tabla `pedidos_calcos` (tres candados en `ALWAYS`), `registrar_pedido_calcos()`, `backfill_pedidos_calcos()` | `20260924103000_pedidos_calcos.sql` | **Bloque 3.** Cada entrega de calcos; el contador pasa a ser la suma. El backfill corre en la migración y otra vez en `seed.sql` (el demo nace después de las migraciones). |
| `tenant_evento_alta()` con `estado` en `despues` | `20260924104000_alta_con_estado.sql` | **Bloque 3.** Cierra el faltante de § 8. |
| `scripts/cargar-gasto-pauta.mjs` + `scripts/gasto-pauta.plantilla.json` | (código, bloque 3) | La carga del gasto histórico (agosto) a partir de un JSON con los lunes y los montos **vacíos**: se completa a mano, no se inventa. |
| `lib/fidelli/pauta.ts`, `app/fidelli/pauta/**`, `components/fidelli/pauta/**`, `components/fidelli/grafico-pulso.tsx`, `components/fidelli/dialog-editar.tsx`, `components/fidelli/ficha/dialog-pedido-calcos.tsx` | (código, bloque 3) | La pantalla de pauta, el Pulso apilado, el dialog Editar compartido y el registro de calcos. |
| R33 en `supabase/verificaciones.sql` · las roturas nuevas de `scripts/regresion-metricas.sh` | (red, bloque 3) | Excluyentes, el origen solo si vacío, la cohorte, el lunes, los candados de calcos, la suma, la ventana y el umbral de activación. |
| vista `snapshots_mensuales` (security_invoker), `movimientos_mrr(p_desde, p_hasta, p_moneda default 'ars')`, `cohortes_logos(p_desde, p_hasta)`, `cohortes_ingresos(p_desde, p_hasta)`, `churn_por_mes(p_desde, p_hasta)`, `altas_bajas_por_mes(p_desde, p_hasta)`, `trabajos_por_mes(p_desde, p_hasta)` | `20260925100000_crecimiento.sql` | **Bloque 4.** Lo que leen `/fidelli/crecimiento` y el data room: todo sobre `snapshots_*` y `tenant_eventos` (los `cambio_plan` del mes con otro `descuento_pct` deciden «cambió el cliente»); nada recalcula historia. Invoker con guarda `soy_superadmin()` (42501 antes de leer nada); la vista le devuelve cero filas a un owner. Meses como `date` del día 1; «en el mes» es el mes calendario en hora argentina, igual para `created_at` (alta) y `ocurrido_at` (evento); `cohortes_logos` fija `TimeZone` para que `activacion_por_mes()` agrupe como la cohorte. |
| `listado_lubricentros()` (reescrita: CTEs y una pasada por tabla, mismas 28 columnas), `metricas_plataforma()` (reescrita: `generate_series` + un solo `group by`, misma salida), `estado_owner(p_lubricentro_id)`, `suscriptos_por_plan()`, índice `services_fecha_idx (fecha) where not anulado` | `20260925101000_performance.sql` | **Bloque 4.** Sin trabajo por fila en lo que no es cobranzas. Las dos reescrituras devuelven exactamente lo mismo que antes (R34g/R34h lo comparan fila por fila contra copias textuales de las versiones viejas). `estado_owner()` es la versión por tenant de `estados_owner()` (misma regla); `suscriptos_por_plan()` es lo que necesita `/fidelli/precios` (plan, tenant, período, descuento y estado de la suscripción vigente). |
| `forzar_calcos_desde_pedidos()` + trigger `candado_calcos_desde_pedidos` (before update of `calcos_entregadas`, `ALWAYS`), `registrar_pedido_calcos()` redefinida con la bandera `app.calcos_desde_pedido` | `20260925102000_calcos_candado.sql` | **Bloque 4.** El contador de calcos es la suma de `pedidos_calcos` también contra `actualizar_lubricentro()` y contra un update directo: cualquier update del contador que no venga de la puerta queda forzado a la suma (corrige, no rechaza; deja un `NOTICE`). Cierra lo que el bloque 3 dejó anotado. |
| `lib/fidelli/csv.ts`, `lib/fidelli/exportar.ts`, `app/api/fidelli/exportar/[recurso]/route.ts`, `components/fidelli/boton-exportar.tsx`, `components/fidelli/crecimiento/data-room.tsx`, `docs/DATA-ROOM.md` | (código, bloque 4) | **El data room.** El CSV para Excel en español (`;`, coma decimal, BOM, RFC 4180, CRLF, fórmulas neutralizadas sin tocar teléfonos ni números), el registro de **15 recursos** en dos grupos: **plataforma** (`tenants`, `eventos`, `snapshots`, `snapshots-tenant`, `pagos`, `contactos-pauta`, `gasto-pauta`, `pedidos-calcos`; fila por fila, paginados) y **crecimiento** (las seis funciones de `20260925100000` más `embudo_pauta`, un mes por fila, con el rango y la moneda de la pantalla importados de `lib/fidelli/crecimiento.ts`; `contraccion` y `churn` con signo, `por_motivo` en cinco columnas, `por_origen` como texto, `moneda` en cada fila de movimientos). Encabezados en `snake_case`; la ruta contesta 403 sin sesión o con otro rol antes de consultar nada, 404 recurso desconocido y 400 parámetro inválido. El botón «Exportar CSV» (`<a download>`, con el filtro vigente) va en el listado, la ficha (historial y pagos), la lista de contactos y cada sección de Crecimiento; el diccionario es `docs/DATA-ROOM.md`. |
| `app/fidelli/crecimiento/page.tsx`, `lib/fidelli/crecimiento.ts` (`leerRango`, `esMes`, `ANIO_MIN`/`ANIO_MAX`, `DESDE_DEFAULT`, `MONEDA_DEFAULT`, `mesEnCursoAR`, `cierreDelMes`, los formatos), `components/fidelli/crecimiento/*` (`seccion`, `barra-rango` + `campo-mes`, `chip-cierre`, `tabla-movimientos`, `grafico-altas-bajas`, `tabla-churn`, `tabla-cohortes-logos`, `tabla-cohortes-ingresos`, `tabla-trabajos`, `embudo-mensual`, `estilos`), la nav de `app/fidelli/layout.tsx` | (código, bloque 4) | **`/fidelli/crecimiento`**: las seis preguntas de un comprador sobre `movimientos_mrr`, `altas_bajas_por_mes` + `churn_por_mes`, `cohortes_logos`, `cohortes_ingresos`, `trabajos_por_mes` y `embudo_pauta(…, 'mes')`, en una `Promise.all`; el rango en la URL (`?desde=YYYY-MM&hasta=YYYY-MM`, default 2026-08 → mes en curso, años 2000–2100 y nunca después del mes en curso) y la moneda (`?moneda=ars|usd`, default `usd`) que afecta solo a las secciones monetarias; cada sección con su título-pregunta, su oración de vacío y su «Exportar CSV». |
| `app/fidelli/[id]/page.tsx` → `estado_owner()` (prop `estadoOwner` a `cabecera-tenant.tsx` y `tab-resumen.tsx`); `app/fidelli/precios/page.tsx` → `suscriptos_por_plan()` y `plan_overrides.cs.{codigo:true}`; `components/fidelli/ficha/tab-datos.tsx` (`totalDeLaUrl`, `opcionesDeConteo`, `?total=`) | (código, bloque 4) | La ficha pide el estado del owner por tenant (una fila); Plan y precios ya no trae el listado entero ni todos los overrides; la pestaña Datos cuenta con `count: "exact"` solo en la primera página de cada lista y lleva el total en el link de paginación. |
| `components/fidelli/grafico-mrr.tsx` (piso `primerTenant`; eje X medido, en meses o en días), `components/fidelli/grafico-pulso.tsx` (eje X medido), `app/fidelli/page.tsx` (`min(lubricentros.created_at)` → `primerTenant`) | (código, bloque 4) | El gráfico de MRR arranca en `greatest(primer snapshot, alta del primer tenant)` e ignora (no borra) las fotos anteriores; los rótulos del eje X de los dos gráficos se eligen por el ancho real del contenedor y nunca se pisan, verificado a 390 px. |
| R34 en `supabase/verificaciones.sql` · las veintiuna roturas nuevas de `scripts/regresion-metricas.sh` | (red, bloque 4) | La identidad por construcción en ARS y USD sobre toda la historia; ajuste vs expansión, el descuento renegociado, la ventana «en el mes», nuevo vs reactivación; el mes cumplido en logos e ingresos y el mes de alta cerrado; el reloj involuntario; el listado y el pulso idénticos a las versiones viejas (diez tenants variados, trabajos en los bordes, sin ningún trabajo); `estado_owner()` y `suscriptos_por_plan()`; el candado de calcos (update directo, RPC del ABM, la bandera apagada en la misma transacción). Fixtures en 1986–1988 (fuera del día al azar de R31), borrados al final. |

---

## 3 · Los eventos (`tenant_eventos`)

Append-only e inmutable: tres candados (`UPDATE`, `DELETE`, `TRUNCATE`) con el
molde de `cresium_eventos`, en `enable always`. Escriben **solo** los triggers y
las funciones `security definer`; `authenticated` solo lee, y solo si es
superadmin.

| Columna | Qué guarda |
|---|---|
| `lubricentro_id` | El tenant. |
| `tipo` | Uno de: `alta`, `suspension`, `reactivacion`, `suspension_reloj`, `reactivacion_reloj`, `cambio_plan`, `pago`, `modulo_activado`, `modulo_desactivado`, `reloj_encendido`, `reloj_apagado`, `calcos`, `edicion`, `origen`. |
| `ocurrido_at` | Cuándo pasó (`now()` del trigger; la fecha original en el backfill y en el cierre diario). |
| `antes` / `despues` | Los datos del cambio, en jsonb (ver tabla de abajo). |
| `motivo` | Texto libre: el motivo de la suspensión (`app.motivo_evento`), el motivo del override para los módulos, `'reloj de cobranza'` para las transiciones del cierre. |
| `actor` | `auth.uid()` si había sesión; null en webhook, en el backfill y en el cierre diario. FK a `usuarios`. |
| `origen_evento` | `admin` (sesión de superadmin), `sistema` (sin sesión, seed, cierre diario, o un owner escribiendo lo suyo), `webhook` (pago de Cresium), `backfill`. |

| Evento | Quién lo emite | `antes` / `despues` |
|---|---|---|
| `alta` | trigger **diferido** `tenant_evento_alta` (constraint trigger `AFTER INSERT ... DEFERRABLE INITIALLY DEFERRED` sobre `lubricentros`): se dispara al **commit**, así que ya ve la suscripción que `crear_lubricentro()` inserta después del tenant. | `despues`: `nombre`, `slug`, `cobranza_desde`, y `plan_id`, `plan`, `periodo`, `descuento_pct` si la suscripción existe en la transacción. |
| `suspension` / `reactivacion` | trigger `tenant_evento_tras_update_lubricentro` cuando cambia `activo`. | `antes`/`despues`: `{activo}`. `motivo` = `current_setting('app.motivo_evento')`, que escribe `cambiar_estado_lubricentro()`: `motivo · detalle`. |
| `reloj_encendido` / `reloj_apagado` | ídem, cuando cambia `cobranza_desde`. | `{cobranza_desde}`. |
| `calcos` | ídem, cuando cambia `calcos_entregadas`. | `{calcos_entregadas}`. |
| `edicion` | ídem, cuando cambia `nombre` o `slug`. | `{nombre, slug}`. |
| `origen` | ídem, cuando cambia `origen` u `origen_detalle`. | `{origen, origen_detalle}`. |
| `modulo_activado` / `modulo_desactivado` | trigger `tenant_evento_tras_override` sobre **`cambios_override_plan`** (AFTER INSERT), por cada `modulos.codigo` cuyo booleano cambió entre `overrides_antes` y `overrides_despues`. Va sobre la auditoría y no sobre `lubricentros.plan_overrides` porque ahí está el **motivo** (pago / bonificado, la única constancia comercial del módulo) y porque `plan_overrides` no puede cambiar por otra puerta: el candado `candado_override_plan` obliga a pasar por `fijar_override_plan()`, que siempre escribe la fila de auditoría. | `{modulo, activo, overrides}` antes y después; `despues.cambio_id` = la fila de `cambios_override_plan`; `motivo` = el motivo del override; `actor` = `cambiado_por`. |
| `cambio_plan` | trigger `tenant_evento_tras_update_suscripcion` cuando cambia `plan_id`, `periodo` o `descuento_pct`. Un cambio solo de `vencimiento`, `inicio` o `estado` **no** es evento: eso lo cubre el pago. | `{plan_id, plan, periodo, descuento_pct}` antes y después. |
| `pago` | trigger `tenant_evento_tras_pago` (AFTER INSERT sobre `pagos`). | `despues`: `pago_id`, `monto`, `periodo_desde`, `periodo_hasta`, `fecha_pago`, `origen`, `cresium_transaccion_id`, `suscripcion_id`, `registrado_por`. `origen_evento` = `webhook` si `origen = 'cresium'`; si no, el de la sesión (`admin` para un pago manual del superadmin). |
| `suspension_reloj` / `reactivacion_reloj` | `cerrar_dia()`, al comparar `activo` del snapshot de hoy con el del último día cerrado anterior. | `{activo, estado_reloj}`; `motivo` = `'reloj de cobranza'`; `origen_evento` = `sistema`. |

**Todos los triggers son defensivos**: el cuerpo va dentro de `begin … exception
when others then raise warning 'tenant_eventos: %', sqlerrm; end;` y devuelven
`null`. Un fallo de instrumentación **nunca** bloquea la escritura original.
Es lo que permite cubrir `pagos` sin tocar `registrar_pago()` ni
`acreditar_deposito_cresium()`. Lo prueba R31b, saboteando el insert del evento
y comprobando que el pago queda igual.

**La salida del candado de borrado.** La FK `tenant_eventos.lubricentro_id` es
`on delete cascade` y el candado de `DELETE` deja pasar una fila **solo si su
tenant ya no existe** (es decir, solo dentro del cascade). El brief pedía
`on delete restrict`; con `restrict` las pruebas de `verificaciones.sql` que
crean y borran tenants de prueba (R23, R25, R26 y otras) fallaban al limpiar,
y esas pruebas no se reescriben. En producción ningún tenant se borra (todo lo
demás es `on delete restrict`), así que el cambio no abre nada: una fila de
evento sigue sin poder borrarse mientras su tenant exista. Lo prueba R31a.

---

## 4 · El cierre diario

**Cuándo.** Un cron de Vercel (`vercel.json`, único uso de ese archivo en el
repo) llama `GET /api/fidelli/cierre-diario` a las **03:10 UTC = 00:10 hora
argentina**, todos los días. Vercel manda `Authorization: Bearer $CRON_SECRET`
solo; sin ese header exacto la ruta devuelve 401 sin tocar nada (y 500 si
`CRON_SECRET` no está configurado).

**Qué cierra.** Ayer, en hora argentina; o `?fecha=YYYY-MM-DD` si viene (solo
fechas anteriores a hoy).

**El tipo de cambio.** La ruta pide la cotización oficial del día a
`dolarapi.com/v1/dolares/oficial` (compra y venta). Si falla, usa
`tc_vigente(fecha − 1)` con `fuente = 'repetido'`. Si tampoco hay una anterior,
no cierra (responde 502) y lo dice: **nunca se inventa un valor**.

**`cerrar_dia(p_fecha, p_tc_venta, p_tc_compra, p_fuente)`** — `security
definer`, ejecutable solo por `service_role` (y `postgres`). Idempotente:

1. Si ya existe `snapshots_diarios` para la fecha, no hace nada y devuelve
   `'ya cerrado'`.
2. Inserta `tipo_cambio` para la fecha si no existe.
3. Inserta una fila de `snapshots_tenant_diarios` por cada tenant que existía
   ese día (`created_at` anterior al fin del día): `activo` (`es_activo`),
   `exento`, `mrr_ars` (`mrr_de_tenant`), `plan_id`, `periodo`, `modulo_pago`
   (`modulo_es_pago`), `trabajos_dia`.
4. Detecta transiciones de reloj comparando con el snapshot del último día
   cerrado anterior: activo → inactivo con `lubricentros.activo` todavía en
   `true` ⇒ `suspension_reloj`; inactivo → activo sin un evento `reactivacion`
   manual ese día ⇒ `reactivacion_reloj`. Sin snapshot anterior no emite nada.
5. Inserta `snapshots_diarios` con los agregados: tenants activos / suspendidos
   / exentos, `mrr_ars`, `tc_venta`, `mrr_usd`, `altas_dia` (eventos `alta` del
   día), `bajas_dia` (eventos `suspension` + `suspension_reloj`), trabajos del
   día por tipo, `recordatorios_dia`, `escaneos_dia`, `fuente = 'cierre'`.
   Devuelve `'cerrado'`.

**Lo que hay que saber del snapshot.** `activo`, `mrr_ars` y `modulo_pago` son
el estado **en el momento del cierre** (00:10 del día siguiente): el reloj se
evalúa con `current_date`, así que un tenant que venció ayer a la noche aparece
como lo que es a las 00:10. Los históricos se leen del snapshot y **no** se
recalculan: un service anulado después no cambia un día ya cerrado.

**Inmutabilidad.** `snapshots_diarios` y `snapshots_tenant_diarios` tienen los
mismos tres candados que `tenant_eventos`. Un día mal cerrado no se corrige:
queda como está, con su `fuente`. Si el tipo de cambio del día se cargó como
`repetido`, la fila de `tipo_cambio` sí puede corregirse a mano (esa tabla no
tiene candado), pero el `mrr_usd` del snapshot no cambia.

---

## 5 · Backfill y reconstrucción

**Eventos (migración `20260922205000`, idempotente, corre con el `db push`):**
un `alta` por tenant desde `lubricentros.created_at`; un `pago` por cada fila
de `pagos` (deduplicado por `despues.pago_id`); un `modulo_activado` /
`modulo_desactivado` por cada cambio de `cambios_override_plan` que movió un
módulo (deduplicado por `despues.cambio_id`). Todos con `origen_evento =
'backfill'` y `actor` null; quién registró el pago o el cambio queda dentro de
`despues` (`registrado_por`, `cambiado_por`). Si ya existen, no duplica.

Para comprobarlo en producción después del push:

```sql
select (select count(*) from tenant_eventos where tipo = 'alta') as altas,
       (select count(*) from lubricentros)                        as lubricentros,
       (select count(*) from tenant_eventos where tipo = 'pago')  as eventos_pago,
       (select count(*) from pagos)                               as pagos;
```

**Tipo de cambio (`scripts/backfill-tc.mjs`, a mano):** trae la cotización
oficial diaria de `api.argentinadatos.com/v1/cotizaciones/dolares/oficial`
(histórico completo, con fines de semana) desde el 16/08/2026 hasta ayer e
inserta en `tipo_cambio` lo que no exista, con `fuente =
'argentinadatos.com/oficial'`. Necesita `NEXT_PUBLIC_SUPABASE_URL` y
`SUPABASE_SERVICE_ROLE_KEY` en el entorno (los lee de `.env.local` si no
están). Flags: `--desde=YYYY-MM-DD`, `--hasta=YYYY-MM-DD`, `--dry-run`.

```bash
node --no-warnings scripts/backfill-tc.mjs --dry-run   # cuenta sin escribir
node --no-warnings scripts/backfill-tc.mjs             # inserta lo que falta
```

**Snapshots reconstruidos (`reconstruir_snapshots(p_desde, p_hasta)`, a mano,
como `postgres` o `service_role`):** para cada día del rango **sin snapshot y
con tipo de cambio** (`tc_vigente(día)`), arma la foto con los tenants que
existían ese día (`created_at <= día`) y **fuente = 'reconstruido'**. Nunca
pisa un snapshot existente. Devuelve cuántos días armó.

⚠ **Lo que la reconstrucción no sabe, y lo dice la `fuente`:** no hay historia
anterior de plan, período, descuento ni estado, así que la foto reconstruida
usa el **estado, plan, período, módulo y MRR ACTUALES** de cada tenant. Lo
único histórico de verdad son la existencia del tenant, los trabajos (por
`services.fecha`), los recordatorios y escaneos (por `created_at`), las altas
y el tipo de cambio. Un tenant suspendido hoy aparece inactivo en todos los
días reconstruidos. Por eso `snapshots_diarios.fuente` distingue `cierre` de
`reconstruido`: el bloque 2 los pinta distinto.

```sql
-- después de correr scripts/backfill-tc.mjs
select reconstruir_snapshots('2026-08-16', current_date - 1);
```

---

## 6 · Decisiones tomadas al implementar (y desvíos del brief)

- **FK de `tenant_eventos` en `cascade` con candado condicional**, no
  `restrict`: explicado en § 3. Lo mismo para `snapshots_tenant_diarios`.
- **Los eventos de módulo salen de `cambios_override_plan`**, no del `UPDATE`
  de `plan_overrides`: explicado en § 3. Es donde está el motivo.
- **El `alta` es un trigger diferido** (constraint trigger) para que el evento
  traiga el plan y el período que `crear_lubricentro()` inserta después del
  tenant. Dentro de una transacción larga (una prueba en un `do $$`) el evento
  aparece recién al commit, o al ejecutar `set constraints all immediate`.
- **MRR de un exento = 0** aunque tenga módulo pago: el brief define al exento
  como "activo con MRR 0" y el total de `monto_de_renovacion_en()` para un
  exento con módulo daría el módulo solo. Ganó la definición.
- **`origen_evento`** de un pago manual es el de la sesión (`admin` para el
  superadmin, `sistema` para el seed) en vez de `'admin'` fijo: es más exacto y
  no cambia nada en producción, donde el único que registra pagos manuales es
  un superadmin.
- **Zona horaria:** `America/Argentina/Buenos_Aires`, la misma de
  `lib/fechas.ts` (`ZONA_AR`) y de la base (`20260813120000`). El brief
  menciona `America/Argentina/Cordoba`; es el mismo huso (UTC−3, sin horario
  de verano) y se elige la que el repo ya usa.
- **`cerrar_dia` rechaza cerrar hoy o el futuro** (`dia_no_terminado`): un
  día se cierra cuando terminó.
- **Los triggers de instrumentación son `security invoker`** y solo
  `emitir_evento_tenant()` es `definer`: el que escribe la tabla es uno solo.
- **El origen se fija fuera de la transacción del alta** (`fijar_origen_tenant`
  después de `crear_lubricentro`, como la invitación): si falla, el tenant
  queda creado y la pantalla final lo dice. `crear_lubricentro()` no cambia de
  firma.

---

### Decisiones del bloque 2 (23/09/2026)

- **`indicadores_tenants()` no estaba en el brief** y se agregó al lado de
  `salud_tenants()` y `trabajos_semanales()`: la fila del listado necesita el
  MRR de `mrr_de_tenant()`, `es_activo()`, el estado del reloj, si el módulo
  se cobra y los trabajos de 30 días, y la única alternativa era llamar
  `mrr_de_tenant()` y `modulo_es_pago()` por fila desde la pantalla. Una
  función, una llamada, todas las filas.
- **`trabajos_semanales(p_lubricentro_id default null, p_semanas default 12)`**:
  con null devuelve todos los tenants en una consulta (es lo que usa el
  listado); con un id, uno. Semanas ISO (lunes) por `services.fecha`.
- **La salud no repite la exención del 100%**: pregunta a `estado_atencion()`.
  R32b lo prueba con la rotura que decide «cobro vencido» por la fecha.
- **La alerta de Cresium mira la ÚLTIMA orden de cada tenant** (`EXPIRED` o
  `PARTIAL`), no cualquier orden histórica: una orden vencida de hace tres
  meses de un tenant que después pagó no es trabajo de hoy.
- **El punto de «hoy» del gráfico de MRR es en vivo** (`mrr_plataforma()` y el
  TC vigente): el snapshot de hoy recién existe mañana a las 00:10 y el
  gráfico tiene que terminar en hoy. Se marca como `vivo` en el tooltip.
- **La comparación del MRR de la franja es en pesos** (contra `mrr_ars` del
  snapshot del último día del mes anterior); el dólar va al lado con su TC.
- **La fila «Trial» de la pestaña Suscripción** se muestra solo si el estado
  fue trial alguna vez. Lo exacto sería leerlo del evento `alta`, pero **el
  evento `alta` del bloque 1 no guarda `estado`** (ver § 8): se usa que desde
  `20260917140000` los tenants nacen activos, así que un tenant creado desde
  esa fecha solo tuvo trial si está en trial hoy; para los anteriores vale la
  inferencia de siempre.
- **«Registró: Cresium»** cuando `pagos.origen = 'cresium'`; el select de
  pagos solo suma `origen`.
- **El chip «Sin origen» de la ficha lleva al listado filtrado por el slug**
  (`/fidelli/lubricentros?q=slug`), porque el dialog Editar vive en la fila
  del listado y no se duplicó en la ficha.
- **`revalidatePath`**: donde decía `/fidelli` ahora se revalidan las dos
  rutas (`/fidelli` y `/fidelli/lubricentros`): el Resumen también cambia
  con un alta, un pago o una suspensión.
- **GA4 y el Píxel de Meta no se montan en `/fidelli`**
  (`components/tracking/etiquetas-fuera-del-admin.tsx`, por `pathname`). El
  resolvedor de origen (`Tracking`) sigue montado: no manda nada.
- **Con más de cinco tenants** en la misma alerta («no carga trabajos»,
  «owner sin activar») va una sola línea con la cantidad y el link al listado
  (filtrado por `?actividad=sin` en el primer caso; el segundo no tiene
  filtro propio y lleva al listado entero).
- **La tabla del listado tiene un ancho mínimo SOLO debajo de 768px**
  (`min-w-[720px] md:min-w-0`): desde 768 es `table-layout: fixed` sin
  mínimo, como pide el brief; en el celular las cinco columnas que quedan no
  entran en 390px sin pisarse, así que la tabla scrollea dentro de su
  tarjeta (el brief lo permite) con la columna del nombre pegada a la
  izquierda. El body nunca scrollea en horizontal.
- **`lib/fidelli/totales.ts` y `lib/fidelli/salud.ts` se borraron**: el MRR
  de la pantalla sale de `mrr_plataforma()` / `mrr_de_tenant()` y la salud de
  `salud_tenants()`. `abonoMensual()` / `totalDelPeriodo()` quedan en
  `lib/fidelli/plan.ts` solo como preview del wizard y de Editar, con el
  aviso escrito de que SQL es la fuente y de que no suman el módulo.

### Decisiones del bloque 3 (23/09/2026)

- **`google` entra a `origen_tenant`** (`20260924100000`): el cierre de un
  contacto de Google Ads tiene que fijar un origen que diga Google; mandarlo
  a `otro` lo escondía. Es una migración sola, sin nada más, porque el valor
  nuevo de un enum no se puede usar en la transacción que lo crea.
- **La cuarta puerta se llama `reabrir_contacto_pauta()`**, no `reabrir()`:
  un nombre tan corto en el schema público se pisa con lo primero que
  venga. Las otras tres (`marcar_demo`, `marcar_cierre`, `marcar_perdida`)
  van con el nombre del brief.
- **Reabrir no deshace el origen** que el cierre le fijó al tenant: sigue
  siendo verdad de dónde vino; se corrige a mano desde Editar si hace
  falta. Sí borra cierre y pérdida y conserva la demo.
- **Perder un contacto cerrado se rechaza** (`contacto_cerrado`): hay que
  reabrir primero. El CHECK `cierre_o_perdida` es la segunda defensa.
- **`embudo_pauta()` devuelve también `cierres_periodo`** (los cierres cuya
  fecha de cierre cae en el período), además de `cierres` (cohorte): el CAC
  se calcula con el primero y la pantalla lo muestra al lado, como pide la
  definición. Y toma `p_canal` opcional: con null suma los canales (`canal`
  sale null); el `?canal=` de la pantalla se resuelve en la base.
- **El gasto se borra con monto vacío**: «no se cargó» y «cero» son dos
  cosas distintas y la pantalla las distingue («cargar el lunes» / «sin
  cargar» vs «US$ 0»). `fijar_gasto_pauta()` con null borra la fila; `p_monto_usd` tiene `default null` para que el cliente pueda omitirlo (una RPC sin default obliga al parámetro en el tipo generado y, si se omite, PostgREST no encuentra la función).
- **La activación cuenta por `services.created_at`**, no por `fecha`: es
  cuándo el taller CARGÓ el trabajo en su primera semana, que es lo que
  mide la adopción. Un trabajo cargado en el día 8 con fecha del día 6 no
  cuenta.
- **`activacion_por_mes()` devuelve también `en_curso`** (altas del mes
  cuya primera semana no terminó): la franja dice «8 de 11 activados · 2
  en curso» para no contar como no activado a quien todavía puede.
- **`uso_tenant()` es una función** y no cuatro consultas desde la ficha:
  los cuatro números tienen que salir de la misma ventana (30 días por
  `services.fecha`; `contactos` y `landing_busquedas` por `created_at`).
- **`indicadores_tenants()` cambió de tipo de retorno** (`activado`,
  `dias_alta`), así que fue `drop` + `create` y no `create or replace`; los
  scripts de regresión que la muerden (y a `metricas_plataforma()`) apuntan
  ahora a `20260924102000`.
- **El Pulso apilado** vive en `components/fidelli/grafico-pulso.tsx`, propio
  del admin: el panel del tenant sigue con `grafico-serie.tsx` y una sola
  serie. Colores: service con `--color-brand`, mecánica con `--color-ink`,
  neumáticos con `--color-ink-40`; el orden fijo y la leyenda son la
  segunda codificación. El admin no tiene modo oscuro (CLAUDE-landing.md),
  así que la verificación en oscuro no aplica.
- **`pedidos_calcos` lleva `on delete cascade` con candado condicional**,
  como `tenant_eventos`: no se borra mientras el tenant exista, y se va con
  él en las pruebas que borran tenants de prueba. **El backfill corre dos
  veces**: en la migración y en `seed.sql`, porque el demo (50 calcos) nace
  después de las migraciones; es idempotente.
- **`actualizar_lubricentro()` sigue aceptando `p_calcos`**: el dialog manda
  el valor actual en solo lectura y la función no ve cambio. Un llamado
  directo a la RPC con otro número desincronizaría el contador de la suma;
  no se cerró en este bloque (la función es del ABM original) y queda
  anotado.
- **El evento `alta` guarda `estado`** (`20260924104000`); la fila «Trial»
  lo usa cuando existe y cae en la inferencia de § 6 (bloque 2) para los
  eventos anteriores.
- **El dialog Editar es uno solo** (`components/fidelli/dialog-editar.tsx`):
  la fila del listado y la cabecera de la ficha le pasan `DatosEdicion`; el
  chip «Sin origen» de la ficha lo abre en vez de mandar al listado.
- **No hay datos históricos de contactos**: la tabla arranca vacía y no se
  backfillea nada. El gasto de agosto se carga con
  `scripts/cargar-gasto-pauta.mjs` a partir de `scripts/gasto-pauta.plantilla.json`,
  que trae los lunes de agosto con los montos en null; se completa a mano.
- **Las fotos de prueba de R31 ya no quedan en la base local.** `cerrar_dia()` se verifica sobre días de 1991 y los candados de `snapshots_diarios` no dejan borrar ni a postgres, así que cada `db reset` dejaba tres fotos de 1991 y el gráfico del MRR del Resumen arrancaba en 1991 (los rótulos de mes se pisaban; se veía en las capturas del bloque 2). `verificaciones.sql` termina bajando esos dos candados, borrando las fotos y el tipo de cambio de prueba, y volviéndolos a `ALWAYS`; un DO final lo comprueba. Producción no tiene esas filas: es un arreglo del entorno local, no del producto.


### Decisiones del bloque 4 (23/09/2026)

**Crecimiento (`20260925100000`).**

- **«En el mes» es el mes calendario en hora argentina, para el alta y para
  el evento `cambio_plan` por igual** (del día 1 a las 00:00 al día 1 del mes
  siguiente, excluido). Con los dos meses cerrados es exactamente el
  intervalo entre las dos fotos. Borde conocido: si a un mes le falta la foto
  del último día y algo pasa después de esa foto, el MRR nuevo recién se ve
  en la foto del mes siguiente, cuyo mes calendario no tiene ni el evento ni
  el alta (un descuento quitado el 20 con la última foto el 15 sale al mes
  siguiente como ajuste de precio; un tenant nacido el 20 sale como
  reactivación). Con el cron cerrando todos los días no pasa; R34b lo fija
  con dos tenants de 1986 y su rotura, y si algún día se prefiere la ventana
  «entre fotos» se cambia primero § 1 y después dos líneas.
- **«Cambió el cliente» incluye el descuento renegociado, leído del evento**:
  la foto guarda plan, período y módulo pago pero no el descuento, así que
  `movimientos_mrr()` busca por tenant un `cambio_plan` del mes con
  `descuento_pct` distinto entre `antes` y `despues`. Agregado a la
  definición al revisar el contrato: un descuento renegociado es el cliente,
  no la lista.
- **`mrr_fin` es Σ b por tenant y no `snapshots_diarios.mrr_ars`**: por eso la
  identidad cierra por construcción. R34a lo prueba con un tenant fantasma
  (en toda base local donde una prueba borró tenants, la foto de la
  plataforma conserva el MRR del borrado y las filas por tenant no).
- **En USD la clasificación se hace sobre los montos ya convertidos** (cada
  foto con su `tc_venta`): un mes con el mismo abono en pesos y otro dólar
  sale como ajuste de precio en USD, que es lo que fue. Sin cotización en
  alguna de las dos fotos los montos del mes en USD son null, con
  `sin_foto_anterior = false` (la pantalla distingue «sin historia» de «sin
  dólar»).
- **Anual → mensual con el mismo plan es expansión; mensual → anual,
  contracción**: cambió el período, así que nunca es ajuste, aunque el plan
  sea el mismo. Un cambio del cliente con el mismo MRR no es movimiento.
- **`cohortes_logos()` fija `TimeZone` en su cláusula `SET`** y saca
  `activados` de UNA llamada a `activacion_por_mes()` por todo el rango
  (con el mismo día en los dos parámetros esa función solo contaría las
  altas del día 1). `cohortes_ingresos()` distingue el mes no cumplido (GRR y
  NRR null) del mes de alta no cerrado (MRR inicial null); cada regla tiene
  su marcador y su rotura.
- **El código del motivo de una suspensión se saca con `split_part(motivo,
  ' ·', 1)`** y se valida contra el catálogo; motivo null o texto libre va a
  `otro`; `suspension_reloj` va a `reloj` sin mirar su motivo.
- **`snapshots_mensuales` lista sus columnas una por una** y hace `revoke`
  a `anon` además del `grant` a `authenticated`: como `security_invoker`, un
  owner ve cero filas.
- **Los fixtures de R34 viven en 1986, 1987 y 1988**, no en 1992 como decía
  el contrato: R31c cierra tres días a partir de un día al azar entre 1990
  y 1999. Los tenants se insertan directo en `lubricentros` (como R33) y los
  eventos se emiten con `emitir_evento_tenant()` con la fecha en `-03`.

**Performance (`20260925101000`).**

- **El costo del listado y del pulso no eran las funciones por fila: era el
  RLS por fila.** La policy de `services` evalúa dos funciones definer por
  cada fila que una consulta visita (~27 µs y 2 buffers por fila, medido en
  el PR). Las dos reescrituras cuentan pasadas por `services`, no llamadas:
  el pulso baja de ~4,3 pasadas a una más las filas del mes, y el listado
  deja de recorrer `services` entera. Sobre el seed (1 tenant) la diferencia
  del listado no es medible; con carga sintética (51 tenants, ~1.000
  trabajos) sí (tiempos en el PR).
- **`services_fecha_idx (fecha) where not anulado` es nuevo** (no estaba en
  el brief): «trabajos del mes» se lee en tres lugares y era una pasada
  completa por `services`; los índices existentes arrancan por vehículo,
  sucursal o tenant.
- **`listado_lubricentros()` pasa de `language sql` a `plpgsql`** para que
  el 42501 sea el suyo (antes lo levantaba `estados_owner()` desde adentro,
  con el plan ya arrancado): R34g exige el mensaje de cada función. Sigue
  devolviendo una fila por owner, como antes; `estados_owner()` se llama UNA
  vez (CTE), `estado_atencion()` y `orden_atencion()` se siguen llamando por
  fila a propósito (son la regla única de cobranza y no se copian), y
  `feature_de_tenant()` no se llama (regla 12): los tres escalones del módulo
  van en línea. Son **28 columnas** (el inventario decía 29).
- **Con dos owners, `owner_nombre` y `estado_owner()` eligen al más antiguo
  por `usuarios.created_at` y, con empate, al de `id` menor**: la versión
  vieja nombraba a cualquiera de los dos (orden del heap). En producción cada
  tenant tiene un owner; la regla existe para que la ficha y el listado
  nombren al mismo. Los empates de sucursales y de suscripciones quedan
  arbitrarios como estaban.
- **`suscriptos_por_plan()` devuelve solo tenants con suscripción**, la
  vigente con la misma regla del listado.

**Calcos (`20260925102000`).**

- **El candado del contador corrige, no rechaza**: rechazar rompería
  `actualizar_lubricentro()` entera por un campo que el dialog ya manda en
  solo lectura. Corrige solo si el update de verdad quiso mover el contador
  y deja un `NOTICE` con el valor pedido y la suma. Un update forzado al
  mismo valor no deja evento `calcos` (no hubo cambio real).
- **La puerta se identifica con una bandera transaccional**
  (`app.calcos_desde_pedido`) que `registrar_pedido_calcos()` prende justo
  antes de su update y apaga justo después: un update posterior en la misma
  transacción no hereda el permiso. La función del trigger es `security
  definer` porque `pedidos_calcos` solo la lee el superadmin por RLS.
- **No hay trigger de alta**: `crear_lubricentro()` no escribe la columna y
  el wizard no manda calcos; un tenant nuevo nace con 0 y sin pedidos. R34j
  lo vigila: si algún día el alta trae calcos, se pone en rojo.
- **La migración no resincroniza contadores**: cuenta y avisa (`NOTICE …
  tenants con el contador distinto de la suma: N`; en local y en dev, 0). Un
  contador mayor que la suma son calcos entregadas sin pedido y se arregla
  registrando el pedido que falta, no pisando el número.

**Data room (primera y segunda entrega).**

- **La ruta decide el 403 antes que el 404** (un owner no se entera de qué
  recursos hay) y **sin tocar la base**: `obtenerSesion()` corta sin
  `.from()` cuando no hay cookie. Un parámetro mal escrito es 400, no un
  archivo entero; un parámetro vacío es lo mismo que no mandarlo.
- **`desde`/`hasta` aceptan `YYYY-MM` y `YYYY-MM-DD`**; instantes en ISO
  8601 con `-03:00` y, donde el día importa, una columna más con el día
  argentino; números pelados con coma decimal y sin miles; booleanos
  `sí`/`no`; nulos vacíos; JSON como texto en una celda.
- **Los encabezados son identificadores en español en `snake_case`** (desvío
  del contrato de la fase 2, que los quería como rótulos): el data room lo
  abren pandas, Power Query y SQL además de Excel.
- **Neutralización de fórmulas con exención por columna**: un texto que
  arranca con `=`, `+`, `-`, `@` o tabulación lleva apóstrofo (inyección en
  CSV), salvo en las columnas que escribe únicamente el equipo (hoy solo
  `telefono` de `contactos-pauta`, que puede llevar «+54 …» con anotaciones).
- **El botón del listado lleva el filtro y el buscador vigentes** (`tenants`
  acepta el mismo query string que `/fidelli/lubricentros`), y `tenants` es
  el mismo cruce que la tabla (`listado_lubricentros()` +
  `indicadores_tenants()` + `salud_tenants()`). Todo se lee paginado con
  `paginar()`, con la sesión del superadmin y su RLS, nunca con la
  `service_role`. `eventos` y `pagos` salen cronológicos.
- **El botón es un `<a download>` Server Component**, no un fetch: el
  navegador baja el archivo con el nombre del `Content-Disposition` sin
  JavaScript.

**Gráficos del Resumen.**

- **El gráfico de MRR arranca con el primer tenant** (`primerTenant` desde
  la page; las fotos anteriores se ignoran, no se borran) y **los ejes X se
  miden, no se adivinan** (`ResizeObserver`; antes de hidratar asumen un eje
  de 240 px, el de un viewport de 320). El MRR habla en meses y, si el rango
  no da para dos rótulos de mes, en días; el paso es el primero en el que
  todos los rótulos caben, anclado al primer mes, con el año en el primero y
  en cada cambio de año. Las etiquetas que viven sobre el dibujo («… · hoy»,
  «Objetivo · US$ 10.000») llevan el mismo fondo translúcido que las del eje
  Y. Costo aceptado por debajo del brief: a 320 px con el piso de producción
  el USD queda con dos rótulos (a 390, cuatro).


**La pantalla `/fidelli/crecimiento`.**

- **Las cifras van sin unidad en la celda** (la unidad está en el encabezado,
  como en el resto del admin) y con hasta dos decimales; los dos «—» de la
  tabla de movimientos llevan su chip («sin foto anterior», «sin tipo de
  cambio») para distinguir «sin historia» de «sin dólar». Las tablas de b, e
  y f también van con el mes reciente arriba.
- **Las tarjetas no recortan (`Seccion` sin `overflow-hidden`) y el tooltip
  del gráfico de altas y bajas va en renglones cortos**: con el desglose en un
  renglón se cortaba contra el borde de la tarjeta a 390 px («2
  reactivacione»). Las tablas anchas las recorta su propio contenedor de
  scroll. Borde aceptado: el tooltip asoma hasta 2 px sobre el borde de la
  tarjeta en algún mes a 390; flota, no se corta.
- **En la tabla de movimientos las once columnas de cifras llevan 10 px de
  padding lateral** (no 12 como las demás tablas) y la columna del mes mide
  14,2 %: en doce columnas cada píxel de padding se paga doce veces, y esos
  44 px son los que el chip «en curso» necesita para quedar al lado del mes
  en todos los anchos. En trabajos y churn hay dos repartos de columnas (uno
  hasta `lg`, otro desde `lg`): debajo de 1024 el chip baja de renglón, no
  hay de dónde sacar 50 px sin partir «RECORDATORIOS» o «INVOLUNTARIAS».
- **La URL acepta años entre 2000 y 2100 y nada después del mes en curso**:
  `?desde=0000-01` pasaba una regex de cuatro dígitos y Postgres lo rechazaba
  (siete errores en pantalla); un `hasta` futuro pedía cientos de meses de
  ceros. Un año fuera de la ventana es formato inválido (→ default); un mes
  futuro se recorta al mes en curso. Los `<input type="month">` llevan la
  misma ventana en `min`/`max`.
- **La tabla de churn tiene su propio encabezado («Bajas por mes · por tipo y
  por origen») y su propio «Exportar CSV»**: la sección b responde una
  pregunta con dos datos y el brief le daba un botón; sin el segundo, el CSV
  de churn solo se bajaba desde el data room y la tabla arrancaba sin un
  encabezado que dijera qué responde.
- **«Primeros datos en <mes>» nombra el mes en que se VEN los datos y, en la
  misma oración, el que tiene que cerrar**: «Primeros datos en diciembre de
  2026, cuando cierre noviembre de 2026». Con la cohorte más vieja en agosto,
  `grr_3` mira la foto del último día de noviembre, que el cierre diario
  escribe a las 00:10 del 1 de diciembre; «noviembre» a secas prometería el
  dato un mes antes de que exista. Ratificado.
- **«Ir a pauta» lleva a `/fidelli/pauta?agrupar=mes`**: la persona viene de
  mirar el embudo por mes y el default de la pauta es por semana; aterrizar
  en otro corte desorienta. Ratificado.
- **El rango de la pantalla se acota a 60 meses** (`MESES_MAX`): más atrás no
  hay fotos (la historia arranca el 16/08/2026) y las seis tablas dibujan
  una fila por mes; con `?desde=2000-01` eran 321 filas por tabla y el dev
  server se reiniciaba por memoria al renderizarlas. Un `desde` más viejo se
  corrige a `hasta − 59 meses`, como el mes futuro (la pantalla corrige, la
  API del data room rechaza). Lo encontró la verificación final.
- **Los rótulos del eje X del gráfico de altas y bajas se ubican por
  porcentaje del eje, anclados hacia adentro en los bordes**, no en una
  grilla de una celda por mes: la grilla sumaba un gap de 4 px por mes (con
  76 meses a 390 px el documento scrolleaba en horizontal) y un rótulo
  centrado en una celda de dos píxeles se salía de la tarjeta. Mismo
  criterio que `grafico-mrr.tsx`: el paso es el primero en el que todos los
  rótulos caben sin pisarse ni salirse. Lo encontró la verificación final.

**Data room, segunda entrega.**

- **Los defaults del data room son los de la pantalla, importados**
  (`DESDE_DEFAULT`, `MONEDA_DEFAULT`, `mesEnCursoAR`, `primerDiaDelMes`,
  `ultimoDiaDelMes` de `lib/fidelli/crecimiento.ts`), no copiados.
- **Donde la pantalla corrige, la API rechaza (400)**: un formato inválido o
  `desde > hasta` en la ruta contestan 400 (una URL a mano que baja un
  archivo con OTRO rango del que se pidió es peor que un error que lo dice).
  `YYYY-MM-DD` entra y se trunca a mes (las siete funciones lo hacen solas).
- **`movimientos-mrr` lleva una columna `moneda`** que la función no
  devuelve: un CSV de montos sin unidad es ambiguo apenas se cierra la
  pestaña. `contraccion` y `churn` salen con signo negativo (la función
  devuelve magnitudes) para que la identidad cierre sumando la fila de
  izquierda a derecha en Excel.
- **`churn` aplana `por_motivo` en cinco columnas con 0 donde la función omite
  la clave** (involuntarias primero) y **`por_origen` es una celda de texto**
  («sin_origen: 2; distribuidor: 1») ordenada por conteo y nombre: nueve
  columnas casi siempre vacías dirían menos que esa celda.
- **`embudo-pauta` acepta `canal`** y su columna `canal` dice `todos` cuando la
  función sumó los tres (en el resto del data room la celda vacía significa
  null).

**Performance en TypeScript.**

- **La ficha pide `estado_owner(id)`** (una fila; un error de la RPC se lee
  como «sin owner», que es lo que hacía el `find` sobre la lista). Con dos
  owners, la cabecera y el listado nombran al mismo (la regla de B2).
- **Plan y precios usa `suscriptos_por_plan()`**, una fila por tenant con
  suscripción; el listado era 28 columnas y una fila POR OWNER (un tenant con
  dos owners salía dos veces en la tarjeta). **El orden dentro de cada
  tarjeta pasa a ser alfabético**: antes heredaba el del listado (atención de
  cobranza primero), un accidente que ninguna pantalla prometía.
- **«Quiénes tienen el módulo» se filtra con contención jsonb**
  (`.or("plan_overrides.cs.{\"neumaticos\":true}")` armado desde
  `MODULOS_PAGOS`): `.neq("plan_overrides", "{}")` traía a todo tenant con
  cualquier override (un tope de sucursales, un módulo apagado a mano) y el
  filtro real quedaba en JavaScript. La contención es sensible al tipo: solo
  la clave en `true` booleano.
- **La pestaña Datos cuenta una sola vez por lista**: la primera página
  siempre pide `count: "exact"` (es la que refresca el número después de un
  alta o una supresión); las siguientes leen `?total=` de la URL y piden solo
  su página; un deep link sin total cuenta una vez. Un `?total=` a mano se
  muestra tal cual (validado como entero de hasta nueve cifras).
  `tab-historial.tsx` sigue contando en todas sus páginas: no estaba en el
  brief y queda anotado.

---

## 7 · Lo que este bloque no toca

Las cobranzas: `registrar_pago()`, `acreditar_deposito_cresium()`,
`cobranzas_pendientes()`, `estado_cobranza()`, `reloj_cobranza()`,
`monto_de_renovacion_en()`, `modulo_es_pago()`, `ciclo_tras_el_pago()`,
`crear_lubricentro()`, `fijar_alias_de_tenant()`,
`alias_confirmado_por_cresium()`, las tablas `cresium_*`,
`app/fidelli/cobranzas/**`, `app/api/cresium/**`, `lib/cresium/**`,
`app/panel/(tras-onboarding)/suscripcion/**` y `lib/auth/cobranza.ts`. Solo
se leen. `cobranzas_pendientes()` sigue afuera también en el bloque 4 aunque el
inventario la marque como pesada: queda para el bloque de cobranzas.
Exportar la tabla `pagos` es leerla, no modificarla. (Hasta el bloque 2 la franja de `/fidelli` mostraba el MRR viejo, sin
módulos, calculado en el navegador por `lib/fidelli/totales.ts`; ese archivo
ya no existe y la franja lee `mrr_plataforma()`.)

---

## 8 · Lo que le falta al bloque 1 (avisos, no cambios)

Encontrado al construir el bloque 2. Las funciones y tablas del bloque 1 no se
modifican en el bloque 2; esto queda anotado para una migración propia.

- ~~**El evento `alta` no guarda el `estado` de la suscripción**~~ **Cerrado en
  el bloque 3** (`20260924104000_alta_con_estado.sql`): el `despues` del
  `alta` trae `estado` además de `plan` y `periodo`, y la fila «Trial» de la
  pestaña Suscripción usa el evento cuando lo tiene (los backfilleados no lo
  tienen: para esos sigue la inferencia de § 6). Sigue pendiente un evento
  cuando `suscripciones.estado` cambie (`trial` → `activa` por un pago):
  hoy lo cubre el evento `pago`.

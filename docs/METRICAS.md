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
| **Origen del tenant** | De dónde vino: `meta`, `referido`, `directo`, `distribuidor`, `calco`, `organico`, `otro`, con un detalle libre. Se carga en el alta y se corrige en la edición. | `lubricentros.origen`, `lubricentros.origen_detalle` · `20260922200000_origen_tenant.sql` |

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

## 7 · Lo que este bloque no toca

Las cobranzas: `registrar_pago()`, `acreditar_deposito_cresium()`,
`cobranzas_pendientes()`, `estado_cobranza()`, `reloj_cobranza()`,
`monto_de_renovacion_en()`, `modulo_es_pago()`, `ciclo_tras_el_pago()`,
`crear_lubricentro()`, `fijar_alias_de_tenant()`,
`alias_confirmado_por_cresium()`, las tablas `cresium_*`,
`app/fidelli/cobranzas/**`, `app/api/cresium/**`, `lib/cresium/**`,
`app/panel/(tras-onboarding)/suscripcion/**`, `lib/auth/cobranza.ts`,
`lib/fidelli/plan.ts` y `lib/fidelli/totales.ts`. Solo se leen. La franja de
`/fidelli` sigue mostrando el MRR viejo (sin módulos) hasta el bloque 2.

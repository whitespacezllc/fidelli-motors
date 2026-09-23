# Data room · diccionario de la exportación CSV

**Bloque MÉTRICAS 4 · 23 de septiembre de 2026 · rama `feat/metricas-4`.**
Todo lo que la plataforma sabe, en CSV, para abrirlo en Excel en español o
en cualquier herramienta de análisis. Esto es el diccionario: qué recurso
existe, qué parámetros toma y qué significa cada columna. **Las definiciones
de negocio no se repiten acá: viven en `docs/METRICAS.md` § 1** y cada
columna que las use remite a ellas. Si una columna y § 1 dicen cosas
distintas, gana § 1 y hay un bug.

## Cómo se usa

- **URL:** `GET /api/fidelli/exportar/<recurso>`, con los parámetros de
  abajo en la query string. Los botones «Exportar CSV» del admin (listado,
  ficha, pauta, cada sección de Crecimiento) arman esa URL con el filtro
  vigente de la pantalla. En la sección «Data room» al pie de
  `/fidelli/crecimiento`, los botones del grupo **Plataforma van sin
  parámetros** (el histórico entero, que es lo que ese grupo promete) y
  los del grupo **Crecimiento llevan el rango** elegido arriba (y la
  moneda, solo `movimientos-mrr`: es el único que convierte).
- **Solo superadmin.** Sin sesión o con otro rol → `403` JSON **sin tocar la
  base**. Recurso desconocido → `404`. Parámetro mal escrito → `400` con el
  motivo (también una fecha que no existe, como `2026-02-30` o cualquier
  día del año `0000`); un parámetro vacío (`?desde=`) es lo mismo que no
  mandarlo. Nunca se exporta con la `service_role`: la sesión del
  superadmin y su RLS son las de siempre.
- **El archivo:** `fidelli-motors_<recurso>_<YYYY-MM-DD>.csv` (la fecha del
  día en hora argentina), `Content-Type: text/csv; charset=utf-8`,
  `Content-Disposition: attachment`. Cabeceras `X-Exportar-Archivo` y
  `X-Exportar-Filas` (cantidad de filas sin contar el encabezado), como las
  exportaciones del panel del tenant.
- **El formato** (`lib/fidelli/csv.ts`): separador `;`, **decimales con coma
  y sin separador de miles** (`1234,5`), fechas `YYYY-MM-DD`, instantes en
  ISO 8601 con la hora y el desfase de Argentina
  (`2026-09-22T22:01:07-03:00`), UTF-8 **con BOM** (así Excel muestra los
  acentos con doble clic), líneas terminadas en CRLF, escapado RFC 4180 (un
  campo con `;`, comillas, salto de línea o retorno de carro va entre
  comillas dobles y las comillas internas se duplican). Los booleanos salen
  como `sí` / `no`; los nulos, vacíos. **Fórmulas:** un texto que arranca
  con `=` o tabulación lleva un apóstrofo adelante para que Excel no lo
  ejecute (nombres y motivos los escribe gente); uno que arranca con `+`,
  `-` o `@` lo lleva solo si lo que sigue no es un número o un teléfono
  (dígitos, espacios, paréntesis, puntos, comas, barras y guiones):
  `+54 9 351 555-0000`, `-3` y `-` salen tal cual; `+cmd|…`, `- cmd|…` y
  `@SUM(…)`, con apóstrofo. Un teléfono **con anotación** («+54 … (Juan)»,
  «… int 2») también lo llevaría, así que la única columna que **no se
  neutraliza** es `telefono` de `contactos-pauta`: la escribe solo el
  equipo (`registrar_contacto_pauta`, guarda `soy_superadmin()`), y quien
  puede cargarla ya tiene el admin entero. El `telefono` de `tenants` lo
  escribe el owner y sí se neutraliza. Un recurso sin filas devuelve el
  encabezado solo.
- **Los encabezados** son identificadores en español en `snake_case`
  (`alta_at`, `trabajos_30d`, `mrr_ars`), los mismos nombres que las columnas
  de `docs/METRICAS.md` § 1 y de la base, y no rótulos («Trabajos (30 d)»):
  el archivo lo abren pandas, Power Query o SQL además de Excel, y así el
  diccionario es una sola búsqueda. Los rótulos viven en la pantalla.
- **En Excel:** doble clic sobre el archivo alcanza si el Excel está en
  español (Argentina o España). Si las columnas salen todas en una, es un
  Excel en inglés: Datos → Obtener datos → Desde texto/CSV, delimitador
  punto y coma, origen 65001 UTF-8.
- **Tamaño:** las tablas se leen paginadas de a 1000 (PostgREST corta ahí
  sin avisar); no hay tope de filas en la exportación. Un año de fotos por
  tenant son unas 6.000 filas por cada 17 tenants: entra en Excel sin
  drama.

## Parámetros

| Parámetro | Forma | Qué hace |
|---|---|---|
| `lubricentro_id` | UUID | Solo las filas de ese tenant. En `/fidelli` el RLS no recorta nada: sin este parámetro sale la plataforma entera. |
| `desde`, `hasta` | `YYYY-MM` o `YYYY-MM-DD` | Rango inclusivo sobre la fecha del recurso (la tabla dice cuál). Un mes se abre al día 1 en `desde` y se cierra en su último día en `hasta`: `?desde=2026-08&hasta=2026-09` son los dos meses enteros. Para un instante (`ocurrido_at`) el día es el calendario argentino. En la plataforma, sin ellos sale el histórico entero; **en Crecimiento, sin ellos rige el rango de la pantalla: `2026-08` → el mes en curso** (y un día suelto se trunca al mes, como hacen las funciones). Un `desde` posterior a `hasta` es `400`, y en Crecimiento se juzga el rango **efectivo**, con los defaults puestos: `?desde=2027-01` solo (contra el mes en curso) o `?hasta=2026-07` solo (contra `2026-08`) también son `400` y el mensaje dice qué default dio vuelta el rango; nunca un archivo vacío. La pantalla, con la misma URL, intercambia los dos. |
| `moneda` | `ars` \| `usd` | Solo `movimientos-mrr`, el único recurso que convierte (`cohortes-ingresos` es siempre en USD por definición). Default `usd`, como la pantalla. La fila lleva su `moneda`. |
| `estado` | `abiertos` \| `demo` \| `cerrados` \| `perdidos` | Solo `contactos-pauta`; el estado se deriva de las tres fechas (§ 1 «Demo», «Cierre», «Pérdida»). |
| `canal` | `meta` \| `google` \| `otro` | `contactos-pauta`, `gasto-pauta` y `embudo-pauta` (sin él, el embudo suma los tres). |
| `atencion=1` · `actividad=sin` · `origen=sin`, y `q` | el mismo query string de `/fidelli/lubricentros` | Solo `tenants`: el filtro («Necesitan atención», «Sin actividad», «Sin origen») y el buscador (nombre o slug, sin distinguir acentos ni mayúsculas) del listado, resueltos con la misma función que la pantalla (`aplicarFiltro()` de `lib/fidelli/listado.ts`). Si vienen varios filtros gana el primero en ese orden, como en la pantalla. Otro valor (`atencion=2`) es 400. |

Cada recurso lista los parámetros que entiende; los demás se validan igual
(un `?desde=ayer` en `tenants` da 400) y se ignoran. Un parámetro vacío
(`?desde=`, `?moneda=`) es lo mismo que no mandarlo.

---

## Plataforma (tablas)

### `tenants` — un lubricentro por fila

`lubricentros` cruzado por id con `listado_lubricentros()`,
`indicadores_tenants()` y `salud_tenants()`: **el mismo cruce que la tabla
de `/fidelli/lubricentros`** (`armarListado()` en `lib/fidelli/listado.ts`),
para que el CSV y la pantalla nunca digan cosas distintas del mismo tenant.
Parámetros: **el filtro y el buscador del listado, con el mismo query string
de la pantalla** (`atencion=1` · `actividad=sin` · `origen=sin`, y `q`): el
botón «Exportar CSV» del listado baja exactamente las filas que la tabla
muestra (`aplicarFiltro()`, la misma función). Sin parámetros, todos los
tenants ordenados por nombre; el archivo trae además `salud`, `atencion` y
`origen` para rehacer los filtros en Excel.

| Columna | Qué es |
|---|---|
| `id`, `nombre`, `slug` | El tenant. |
| `origen`, `origen_detalle` | § 1 «Origen del tenant». Vacío = sin cargar. |
| `alta` | § 1 «Alta»: el día calendario argentino de `created_at`. |
| `alta_at` | El instante del alta, ISO con `-03:00`. |
| `estado` | `activo` · `exento` · `suspendido` (manual) · `suspendido_reloj`: la misma regla que el chip del listado (`estadoDe()`), con § 1 «Tenant activo» detrás. |
| `activo` | `lubricentros.activo` crudo: el interruptor manual. |
| `es_activo` | § 1 «Tenant activo» (`es_activo()`): activo Y el reloj no lo suspendió. |
| `estado_reloj` | `reloj_cobranza() ->> 'estado'`: `al_dia`, `por_vencer`, `gracia` o `suspendido`, los cuatro que devuelve `estado_cobranza()` (`ESTADOS_COBRANZA` en `lib/auth/cobranza.ts`; no hay un «vencido»: pasado el vencimiento el estado es `gracia`, o `suspendido` si el reloj corta o si nunca pagó). Nunca vacío: el tenant fuera del reloj (`cobranza_desde` vacío o futuro) sale `al_dia` y el suspendido a mano sale `suspendido`; para distinguirlos están `cobranza_desde`, `activo` y `estado`. |
| `exento` | `descuento_pct >= 100`: activo con MRR 0. |
| `plan`, `periodo`, `descuento_pct`, `estado_suscripcion`, `vencimiento` | La suscripción **vigente** (la última que arrancó, el mismo criterio del listado y de la ficha). |
| `mrr_ars` | § 1 «MRR de un tenant» (`mrr_de_tenant()`), en pesos, 2 decimales. |
| `modulo_pago` | El módulo gomería **se le cobra** (`modulo_es_pago()`), que es lo que entra al MRR. |
| `modulo_gomeria` | El módulo gomería está **activo** en la cuenta (`feature_de_tenant`), se cobre o esté bonificado. |
| `activado`, `dias_alta` | § 1 «Activación»: 20 o más trabajos en la primera semana, y los días desde el alta (con menos de 8, todavía puede activarse). |
| `trabajos_30d`, `ultimo_trabajo` | Trabajos no anulados de cualquier tipo en los últimos 30 días por `services.fecha`, y la fecha del último. |
| `salud`, `salud_motivo` | `salud_tenants()`: `al_dia` · `actividad_baja` · `sin_actividad` · `cobro_vencido`, y el porqué en una línea. |
| `atencion` | `estado_atencion()`: `trial_vencido`, `cobranza_vencida`, `trial_por_vencer` o `cobranza_por_vencer`, los cuatro del tipo `Atencion` de `lib/fidelli/atencion.ts` (vacío = nada que atender; también el exento y la suscripción cancelada). Es lo que arma el filtro «Necesitan atención». |
| `owner`, `owner_estado` | El dueño de la cuenta y si ya entró alguna vez (`pendiente` / `activo`; vacío = sin owner). |
| `telefono` | El teléfono de contacto (owner o sucursal, `telefono_de_contacto()`). Lo escribe el owner: texto de afuera, neutralizado como cualquier otro (un `+54 …` pelado sale tal cual; con una anotación detrás, con apóstrofo). |
| `calcos_entregadas` | § 1 «Pedido de calcos»: la suma de los pedidos. |
| `cobranza_desde`, `suspension_automatica` | El reloj de cobranza: desde cuándo cobra (vacío = fuera del reloj) y si suspende solo. |

### `eventos` — el libro de novedades

`tenant_eventos` (docs/METRICAS.md § 3) con el nombre del tenant y del
actor. Cronológico, del más viejo al más nuevo (la pestaña Historial lo
invierte). Parámetros: `lubricentro_id`, `desde`, `hasta` (sobre el día
argentino de `ocurrido_at`).

| Columna | Qué es |
|---|---|
| `id` | El evento. |
| `lubricentro_id`, `tenant`, `slug` | El tenant. |
| `tipo` | `alta`, `suspension`, `reactivacion`, `suspension_reloj`, `reactivacion_reloj`, `cambio_plan`, `pago`, `modulo_activado`, `modulo_desactivado`, `reloj_encendido`, `reloj_apagado`, `calcos`, `edicion`, `origen` (§ 3). |
| `fecha` | El día calendario argentino de `ocurrido_at`: es el que usan churn, altas y bajas (§ 1). |
| `ocurrido_at` | El instante, ISO con `-03:00`. |
| `motivo` | Texto libre del evento. En una `suspension` es `código · detalle` (`falta_de_pago`, `pedido_del_cliente`, `cierre_del_negocio`, `otro`); § 1 «Churn del mes» lo lee por el código. |
| `origen_evento` | Quién disparó, los cuatro del `check` de la tabla (docs/METRICAS.md § 3): `admin` (sesión de superadmin), `sistema` (sin sesión: seed, cierre diario, o un owner escribiendo lo suyo; no existe un valor «owner»), `webhook` (pago de Cresium), `backfill` (los eventos reconstruidos por `20260922205000`; en local no hay porque el seed no trae pagos previos, en producción sí). |
| `actor_id`, `actor` | El usuario, si lo hubo. `Cresium` cuando vino del webhook. Los eventos del backfill (`20260922205000`) no tienen actor: el autor del pago quedó adentro de `despues` (`registrado_por`). |
| `antes`, `despues` | Los dos JSON del evento, tal cual (§ 3 dice qué trae cada tipo). |
| `registrado_at` | `created_at`: cuándo se escribió (puede diferir de `ocurrido_at` en el backfill). |

### `snapshots` — la foto diaria de la plataforma

`snapshots_diarios` (§ 1 «Snapshot diario», § 4). Una fila por día cerrado,
ordenada por fecha. Parámetros: `desde`, `hasta` (sobre `fecha`).

| Columna | Qué es |
|---|---|
| `fecha` | El día que se cerró (hora argentina). |
| `fuente` | `cierre` (el cron) o `reconstruido` (`reconstruir_snapshots()`). |
| `tenants_activos`, `tenants_exentos`, `tenants_suspendidos` | Conteos al cierre con § 1 «Tenant activo». |
| `mrr_ars`, `mrr_usd`, `tc_venta` | § 1 «MRR de la plataforma» y «MRR en USD»: pesos, dólares y el tipo de cambio venta del día (vacío si no hubo cotización). |
| `altas_dia`, `bajas_dia` | Altas (§ 1) y bajas (§ 1) del día. |
| `trabajos_dia`, `trabajos_service`, `trabajos_mecanica`, `trabajos_neumaticos` | § 1 «Trabajo»: no anulados por `services.fecha`, total y por tipo. |
| `recordatorios_dia`, `escaneos_dia` | § 1 «Recordatorios disparados» y «Escaneos». |
| `cerrado_at` | Cuándo se tomó la foto. |

### `snapshots-tenant` — la foto diaria por tenant

`snapshots_tenant_diarios`, con el nombre del tenant y del plan. Es la
tabla más grande del data room (una fila por tenant y día). Parámetros:
`lubricentro_id`, `desde`, `hasta` (sobre `fecha`).

| Columna | Qué es |
|---|---|
| `fecha`, `lubricentro_id`, `tenant`, `slug` | El día y el tenant. |
| `activo`, `exento` | § 1 «Tenant activo» al cierre de ese día, y si era exento. |
| `plan_id`, `plan`, `periodo`, `modulo_pago` | La suscripción vigente ese día; los tres campos que § 1 «Movimientos de MRR» compara para distinguir ajuste de precio de expansión. |
| `mrr_ars` | § 1 «MRR de un tenant» ese día. Los movimientos de MRR salen de comparar esta columna entre dos fotos. |
| `trabajos_dia` | Trabajos del tenant ese día. |

### `pagos` — cada pago registrado

`pagos` con el tenant y quién lo registró. Parámetros: `lubricentro_id`,
`desde`, `hasta` (sobre `fecha_pago`). El período de trial no es un pago y
no aparece.

| Columna | Qué es |
|---|---|
| `id`, `lubricentro_id`, `tenant`, `slug` | El pago y el tenant. |
| `fecha_pago` | El día que se pagó. |
| `periodo_desde`, `periodo_hasta` | El período que cubre. |
| `monto_ars` | En pesos. |
| `origen` | `manual` (lo cargó un superadmin) o `cresium` (lo acreditó el webhook). |
| `registrado_por` | El nombre de quien lo registró; `Cresium` si vino del webhook. |
| `cresium_transaccion_id` | El id de la transacción en Cresium, si aplica. |
| `suscripcion_id` | La suscripción a la que se imputó. |
| `registrado_at` | Cuándo se registró. |

### `contactos-pauta` — el canal pago

`contactos_pauta` (§ 1 «Contacto», «Demo», «Cierre», «Pérdida»), con el
nombre del tenant si cerró. Parámetros: `estado`, `canal`, `desde`, `hasta`
(sobre `fecha`, la del primer mensaje). **Sin el corte de 60 días de la
lista de `/fidelli/pauta`**: la exportación es el histórico entero.

| Columna | Qué es |
|---|---|
| `id` | El contacto. |
| `fecha` | El día del primer mensaje: la cohorte del embudo (§ 1 «Tasa de cierre»). |
| `canal` | `meta`, `google`, `otro`. |
| `origen` | Dentro de Meta: `instagram`, `messenger`, `whatsapp`. |
| `telefono` | Opcional; sirve para no duplicar. Sale **tal cual, sin la neutralización de fórmulas**: lo escribe solo el equipo (`registrar_contacto_pauta`) y un «+54 … (Juan)» con apóstrofo sería otro dato. |
| `estado` | Derivado de las fechas, en este orden: `cerrado` si tiene cierre, `perdido` si tiene pérdida, `demo` si tiene demo, `abierto` si no. |
| `demo_at` | § 1 «Demo». |
| `cierre_at`, `lubricentro_id`, `tenant` | § 1 «Cierre»: cuándo y en qué tenant se convirtió. |
| `perdida_at`, `motivo_perdida` | § 1 «Pérdida»: `precio`, `no_responde`, `ya_tiene_sistema`, `no_factura`, `no_es_dueno`, `otro`. |
| `registrado_por`, `registrado_at`, `actualizado_at` | Quién lo cargó y cuándo; la última vez que se tocó. |

### `gasto-pauta` — lo gastado por semana y canal

`gasto_pauta` (§ 1 «Gasto de pauta»). Parámetros: `canal`, `desde`, `hasta`
(sobre `semana`).

| Columna | Qué es |
|---|---|
| `semana` | Siempre un lunes: la semana ISO. |
| `canal` | `meta`, `google` (y `otro`). |
| `monto_usd` | En dólares: Meta y Google se pagan así. El equivalente en pesos no se guarda (sale de `tc_vigente()`). Una semana sin fila es «no se cargó», que no es cero. |
| `nota` | Texto libre. |
| `registrado_por`, `registrado_at`, `actualizado_at` | Quién y cuándo. |

### `pedidos-calcos` — cada entrega de calcos

`pedidos_calcos` (§ 1 «Pedido de calcos»), con el tenant. Parámetros:
`lubricentro_id`, `desde`, `hasta` (sobre `fecha`).

| Columna | Qué es |
|---|---|
| `id`, `fecha`, `lubricentro_id`, `tenant`, `slug` | El pedido y el tenant. |
| `cantidad` | Calcos entregadas en ese pedido; `lubricentros.calcos_entregadas` es la suma. |
| `incluidas` | `sí` = venían con el plan; `no` = se cobraron. |
| `monto_ars` | Lo cobrado (obligatorio si no estaban incluidas). |
| `nota` | Texto libre (`backfill del contador` en los pedidos reconstruidos por `backfill_pedidos_calcos()`). |
| `registrado_por`, `registrado_at` | Quién y cuándo. |

---

## Crecimiento (funciones, un mes por fila)

Las tablas de `/fidelli/crecimiento`, **tal como las devuelven las funciones**
de `20260925100000_crecimiento.sql` (y `embudo_pauta` de
`20260924101000`): nada se recalcula acá, y las columnas llevan los mismos
nombres que la función y que § 1. Parámetros comunes: `desde` y `hasta` en
`YYYY-MM` (un `YYYY-MM-DD` también entra: las siete funciones truncan a
mes); **sin ellos, el rango de la pantalla: `2026-08` → el mes en curso** en
hora argentina. Las filas salen del mes más viejo al más nuevo (la pantalla
invierte los movimientos). `mes`, `cohorte` y `periodo` son el día 1 del mes
(`2026-08-01`). Las fracciones (`crecimiento_pct`, `churn_pct`, `m1`…`m12`,
`grr_*`, `nrr_*`, `tasa_*`) son **fracciones** (0,12 = 12 %), no
porcentajes: en Excel, formato de porcentaje y listo. `movimientos-mrr`,
`cohortes-*` y `trabajos` traen solo los meses con foto (o con alta);
`altas-bajas`, `churn` y `embudo-pauta` traen todos los meses del rango, con
ceros. Por eso un rango sin historia (`?desde=2025-01&hasta=2025-03`) no es
un error: en los tres primeros devuelve el encabezado solo, y en los otros
tres, sus meses en cero. Lo único que se rechaza es un rango dado vuelta
(`400`, también contra el default del otro extremo: ver «Parámetros»).

### `movimientos-mrr` — ¿de dónde viene el MRR?

`movimientos_mrr(desde, hasta, moneda)` (§ 1 «Movimientos de MRR de un
mes»). Parámetros: `desde`, `hasta`, `moneda` (`usd` por defecto; es el
único recurso que convierte). Solo los meses con foto.

| Columna | Qué es |
|---|---|
| `mes` | El día 1 del mes. |
| `en_curso` | `sí` si al mes le falta la foto del último día (§ 1 «Mes cerrado»): los movimientos van hasta el último día con foto. |
| `sin_foto_anterior` | `sí` en el primer mes con historia: `mrr_fin` y `tenants_fin` cargados y todo lo demás vacío; no se inventa un inicio en cero. |
| `mrr_inicio` | La suma, por tenant, del MRR en la foto del mes anterior, en la `moneda` de la fila. |
| `nuevo`, `reactivacion`, `expansion` | Suman (§ 1 dice cuándo un tenant cae en cada uno; expansión incluye el descuento renegociado). |
| `contraccion`, `churn` | **Con signo negativo** (la función las devuelve como magnitudes positivas): restan. |
| `ajuste_precio` | Con su signo: la lista de precios en pesos moviéndose (o la cotización, en USD), sin que el cliente cambiara nada. |
| `mrr_fin` | La suma, por tenant, del MRR en la foto del mes, en la `moneda` de la fila: lo que da la fila sumada de izquierda a derecha. |
| `neto` | El neto comercial: nuevo + reactivación + expansión + contracción + churn (con los signos del archivo); el ajuste queda aparte. La identidad, sumando la fila de izquierda a derecha: `mrr_inicio + nuevo + reactivacion + expansion + contraccion + churn + ajuste_precio = mrr_fin` (± 1). |
| `crecimiento_pct` | neto ÷ `mrr_inicio`, fracción. |
| `tenants_inicio`, `tenants_fin` | `tenants_activos` de las dos fotos. |
| `moneda` | `ars` o `usd`: la unidad de todos los montos de la fila (el nombre del archivo no la lleva). En USD cada foto se convierte con su propio `tc_venta`; sin cotización en alguna de las dos, los montos del mes quedan vacíos con `sin_foto_anterior` = `no` (sin dólar, no sin historia). |

### `altas-bajas` — ¿entran más de los que se van?

`altas_bajas_por_mes(desde, hasta)` (§ 1 «Altas y bajas por mes»).
Parámetros: `desde`, `hasta`. Todos los meses del rango, con ceros.

| Columna | Qué es |
|---|---|
| `mes` | El día 1 del mes. |
| `altas` | Tenants con `created_at` (hora argentina) en el mes. |
| `bajas` | Eventos `suspension` + `suspension_reloj` del mes. |
| `reactivaciones` | Eventos `reactivacion` + `reactivacion_reloj` del mes. |
| `neto` | `altas − bajas`. |

### `churn` — ¿por qué se van?

`churn_por_mes(desde, hasta)` (§ 1 «Churn del mes, por tipo y por
origen»). Parámetros: `desde`, `hasta`. Todos los meses del rango, con
ceros. Los dos objetos de la función salen **aplanados**: `por_motivo` en
una columna por código, y `por_origen` en una celda de texto (los orígenes
son ocho y casi siempre vacíos; ocho columnas dirían menos que
`sin_origen: 2; meta: 1`).

| Columna | Qué es |
|---|---|
| `mes` | El día 1 del mes. |
| `tenants_inicio` | `tenants_activos` de la foto del mes anterior (vacío si no hay). |
| `bajas` | `suspension` + `suspension_reloj` del mes. |
| `involuntarias` | `suspension_reloj` + `suspension` con motivo `falta_de_pago`. |
| `voluntarias` | El resto (`pedido_del_cliente`, `cierre_del_negocio`, `otro`, o sin motivo). |
| `falta_de_pago`, `reloj`, `pedido_del_cliente`, `cierre_del_negocio`, `otro` | `por_motivo` aplanado: las bajas del mes por código (`reloj` = las del reloj; motivo nulo o irreconocible → `otro`). `0` si no hubo, no vacío. Las cinco suman `bajas`. |
| `por_origen` | `sin_origen: 2; distribuidor: 1; organico: 1`: las bajas por `lubricentros.origen` del tenant (`sin_origen` si no tiene), el origen con más bajas primero y, a igual conteo, por nombre. Vacío sin bajas. |
| `churn_pct` | `bajas ÷ tenants_inicio`, fracción (vacío sin foto anterior). |

### `cohortes-logos` — ¿se quedan?

`cohortes_logos(desde, hasta)` (§ 1 «Cohorte»). Parámetros: `desde`,
`hasta` (el mes de **alta**). Una fila por mes del rango con al menos un
alta.

| Columna | Qué es |
|---|---|
| `cohorte` | El día 1 del mes de alta. |
| `tamano` | Tenants con alta ese mes. |
| `activados` | Los que activaron (§ 1 «Activación», `activacion_por_mes()`); la pantalla lo muestra como `activados ÷ tamano`. |
| `m1`, `m2`, `m3`, `m6`, `m9`, `m12` | Fracción de la cohorte con `activo = true` en la foto del último día con foto del mes alta + N (un tenant sin fila cuenta como no activo). **Vacío si ese mes no cerró**: el mes no cumplió. |

### `cohortes-ingresos` — ¿pagan más con el tiempo?

`cohortes_ingresos(desde, hasta)` (§ 1 «GRR y NRR de una cohorte a N
meses»). Parámetros: `desde`, `hasta`. **Siempre en USD** (para neutralizar
los ajustes en pesos); `moneda` no aplica.

| Columna | Qué es |
|---|---|
| `cohorte` | El día 1 del mes de alta. |
| `tamano` | Tenants con alta ese mes. |
| `mrr_inicial_usd` | La suma, por tenant, del MRR en la foto del último día del mes de alta convertido con el `tc_venta` de esa foto. Vacío si el mes de alta no cerró o no tuvo cotización. |
| `grr_3`, `nrr_3` | A 3 meses del alta. GRR = Σ mín(MRR del tenant al mes alta + N, su inicial) ÷ `mrr_inicial_usd`; NRR = Σ MRR al mes alta + N ÷ `mrr_inicial_usd`. Fracciones; NRR ≥ GRR siempre. |
| `grr_6`, `nrr_6` | Lo mismo a 6 meses. |
| `grr_12`, `nrr_12` | Lo mismo a 12 meses. Los seis van de a pares, como en la pantalla: cada horizonte con su GRR y su NRR al lado. |
| (los seis) | Vacío si el mes alta + N no cerró, si el inicial está vacío o es 0: sin historia todavía. |

### `trabajos` — ¿usan el sistema?

`trabajos_por_mes(desde, hasta)` (§ 1 «Trabajos por mes»). Parámetros:
`desde`, `hasta`. Solo los meses con alguna foto.

| Columna | Qué es |
|---|---|
| `mes` | El día 1 del mes. |
| `en_curso` | `sí` si al mes le falta la foto del último día: los conteos van hasta el último día con foto. |
| `total`, `service`, `mecanica`, `neumaticos` | Suma de `trabajos_dia` (y por tipo) de todas las fotos diarias del mes (§ 1 «Trabajo»). |
| `autos_que_volvieron` | § 1 «Autos que volvieron» (`autos_que_volvieron_plataforma()`) entre el primer día del mes y el último día con foto. |
| `recordatorios`, `escaneos` | Suma de `recordatorios_dia` y `escaneos_dia` de las fotos del mes. |

### `embudo-pauta` — ¿rinde la pauta?

`embudo_pauta(desde, hasta, 'mes', canal)` (§ 1 «Tasa de cierre»,
«Ciclo», «CAC del canal»). Parámetros: `desde`, `hasta`, `canal` (sin él,
los tres canales sumados). Todos los meses del rango, con ceros. Es la
misma tabla que el embudo mensual de `/fidelli/pauta`.

| Columna | Qué es |
|---|---|
| `periodo` | El día 1 del mes **del primer contacto** (la cohorte del embudo). |
| `canal` | `meta`, `google`, `otro`, o `todos` cuando no se filtró (la función devuelve null; en el archivo «todos» dice más que una celda vacía). |
| `contactos`, `demos`, `cierres`, `perdidos`, `abiertos` | Los contactos de la cohorte y en qué terminaron (un cierre de la semana 3 cuenta para el mes en que escribió). |
| `tasa_demo`, `tasa_cierre` | `demos ÷ contactos`, `cierres ÷ contactos`, fracciones (vacío sin contactos). |
| `ciclo_mediana_dias` | Mediana de días entre el primer contacto y el cierre, sobre los cierres de la cohorte. |
| `cierres_periodo` | Cierres **por fecha de cierre** dentro del mes: el denominador del CAC. |
| `gasto_usd` | El gasto de pauta de las semanas (lunes) que caen en el mes, en dólares (vacío si no se cargó nada). |
| `cac_usd` | `gasto_usd ÷ cierres_periodo` (vacío sin cierres o sin gasto). La pantalla lo pone en gris con «pocos casos» debajo de 3 cierres; el archivo trae `cierres_periodo` para el mismo juicio. |

---

## Dónde vive cada cosa

| Pieza | Archivo |
|---|---|
| El armado del CSV (separador, coma decimal, BOM, RFC 4180, fórmulas) | `lib/fidelli/csv.ts` (puro, sin imports; pruebas en `scratchpad/b4/prueba-csv.mjs`) |
| El registro de recursos: nombre, descripción, parámetros, consulta, columnas | `lib/fidelli/exportar.ts` |
| La ruta | `app/api/fidelli/exportar/[recurso]/route.ts` |
| El botón «Exportar CSV» | `components/fidelli/boton-exportar.tsx` |
| La sección «Data room» de Crecimiento | `components/fidelli/crecimiento/data-room.tsx` |
| Los botones en las pantallas | `app/fidelli/lubricentros/page.tsx` (tenants con el filtro y el buscador vigentes), `components/fidelli/ficha/tab-historial.tsx` (eventos del tenant), `components/fidelli/ficha/tab-suscripcion.tsx` (pagos del tenant), `components/fidelli/pauta/lista-contactos.tsx` (contactos con estado y canal) |

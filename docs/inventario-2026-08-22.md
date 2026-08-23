# Fase 0 — Inventario y análisis de impacto

**22 de agosto de 2026.** Qué hay hoy en el código y en los datos, y qué toca cada cosa
que queremos construir. Sin implementar nada.

> ## ⚠ ESTO ES UNA FOTO DEL 22 DE AGOSTO DE 2026, Y YA ENVEJECIÓ
>
> Se conserva con la fecha en el nombre porque es el punto de partida del
> sprint: explica **por qué** se hizo lo que se hizo. No es documentación
> del estado actual — para eso están `CLAUDE.md` y el código.
>
> **Lo que cambió después de esta foto** (bloques 1 a 7 y el cierre, todos
> en producción o en camino):
>
> | Bloque | Qué cambió respecto de lo que dice este documento |
> |---|---|
> | **1** | Los planes dejaron de ser decorativos: `features`/`limites` en `planes`, overrides por tenant con auditoría, y control en DOS capas (RLS + aplicación). Basic/Pro/Ultra con precios reales. |
> | **2** | `services.tipo`: existen los trabajos de mecánica, con orden de trabajo propia. La vista de retención los filtra — la mecánica NO desplaza al último service. |
> | **3** | `trabajos_pendientes` + `vista_pendientes`: lo que el taller dijo y nadie siguió, con su propia fuente en "A quién llamar". |
> | **4** | Presupuestos: documentos con numeración correlativa por tenant. NO es facturación. |
> | **5** | Productos con precio y stock **opcionales**, categorías en tabla global, descuento de stock solo al crear. |
> | **6** | Catálogo de marcas con normalización por trigger y modelos aprendidos con piso de anonimato. |
> | **7** | Superficie del cliente: página premium (mensaje al escanear + WhatsApp al taller), hoja de calcos QR, modo oscuro elegido por el lubricentro y tamaño de logo. |
> | **cierre** | La landing pasa a tres planes; se fueron el fee de implementación y el Programa Fundadores. |
>
> La red de regresión pasó de R1 a **R11**: está documentada en `CLAUDE.md`.


Verificado contra el código en `fix/calcos-250`, contra la base de **dev** (49 migraciones
aplicadas) y contra las superficies **públicas** de producción.

**Cada afirmación lleva sello:**

| Sello | Qué significa |
|---|---|
| ✅ **VERIFICADO** | Medido contra el código, la base o una superficie servida |
| ◐ **INFERIDO** | Razonado a partir de lo verificado, no medido directamente |
| ❓ **SIN CONFIRMAR** | No tengo cómo verificarlo desde acá. No se completó con supuestos |

**Panorama:** 49 migraciones · 20 tablas · 16 pantallas de panel · 20 archivos de Server Actions
· 33 policies de RLS.

---

# A · Modelo de datos

## 1 · Tablas, campos y relaciones — ✅ VERIFICADO

Veinte tablas, todas con RLS activo. La jerarquía es una sola y es estricta:
**lubricentro → cliente → vehículo → service → renglones**. Todo cuelga de `lubricentro_id`,
incluso las tablas que ya lo tendrían por su padre — esa redundancia es lo que permite que
cada policy sea una comparación directa.

| Tabla | Qué guarda | Notas que importan |
|---|---|---|
| `lubricentros` | El tenant | **Solo** nombre, slug, activo, calcos_entregadas. No hay plan acá |
| `sucursales` | Locales del tenant | N por lubricentro. nombre, direccion, telefono, horarios, activa |
| `usuarios` | Espejo de `auth.users` | rol `owner` \| `superadmin`, con CHECK de coherencia |
| `planes` | Catálogo de precios | nombre, precio_mensual, descuentos. **Ninguna feature** |
| `suscripciones` | Tenant → plan | estado, periodo, descuento_pct, inicio, vencimiento |
| `pagos` | Cobranza | La carga Fidelli, no el owner |
| `config_experiencia` | Look del tenant | PK = lubricentro_id. logo, 3 colores, `campos_visibles` jsonb |
| `clientes` | Dueños de autos | nombre, telefono (NOT NULL), email, cuit |
| `vehiculos` | Los autos | patente + patente_normalizada, **marca/modelo texto libre nullable**, anio |
| `services` | El trabajo | sucursal_id NOT NULL, kilometros, aceite_tipo, prox_service_km, observaciones |
| `service_items` | Los 11 renglones | Un renglón marcado = existe la fila. `cambiado` distingue OK de cambiado |
| `productos` | Catálogo | categoria, nombre, marca. **Sin precio, costo ni stock** |
| `premios` / `canjes` | Fidelliza | meta_services 2–50; el ciclo se calcula en vivo |
| `contactos` | A quién se llamó | Alimenta el anti-spam de la lista de retención |
| `notas_vehiculo` | Recomendaciones | Con `visible_cliente` |
| `mensaje_templates` | WhatsApp por tono | Índice único parcial: un solo activo |
| `landing_busquedas` | Quién buscó su patente | Lo escribe `get_carton` |
| `correcciones_patente` | Auditoría | La patente es inmutable salvo por acá |
| `contactos_fidelli` | Fidelli → tenant | trial / cobranza |

---

## 2 · Sucursales — sí existen, y Brothers Oil lo confirma — ✅ VERIFICADO EN PRODUCCIÓN

> **Un lubricentro puede tener varios locales bajo una misma cuenta.**
> No es una cuenta por local.

Lo verifiqué contra la vidriera pública de producción, que sirve los datos reales del registro:

- **Recta Martinolli** — Recta Martinolli 7731 · 3518519188
- **Boulevares** — De los Genoveses 5196 · 3518519188

Los dos bajo un único slug `brothers-oil`, un único `lubricentro_id` y una única suscripción.

**Cómo está implementado:**

- `services.sucursal_id` es **NOT NULL**: todo service queda etiquetado.
- La sucursal activa es **del dispositivo, no del usuario** — se recuerda en la cookie
  `COOKIE_SUCURSAL`. El supuesto explícito en el código es que el lubricentro comparte una
  sola cuenta entre locales.
  → `app/panel/services/nuevo/[vehiculoId]/page.tsx:110`
- El panel filtra por sucursal en Inicio y en Próximos; `resumen_inicio` acepta `p_sucursal_id`.
- El alta en `/fidelli` exige **al menos una** sucursal: la función aborta con `sin_sucursales`.
- La vidriera pública lista todas las sucursales activas en el pie.

> **Lo que NO existe:** ningún límite de cantidad de sucursales, en ningún lado. Ni constraint,
> ni chequeo en `crear_lubricentro()`, ni validación en `app/panel/sucursales/actions.ts`.
> Un límite numérico por plan es código nuevo entero, no un valor que hoy esté en cero.

---

## 3 · Plan, tier, feature flags y límites — ✅ VERIFICADO

Existe `planes` + `suscripciones`, pero es **exclusivamente comercial**: define cuánto se
cobra, no qué se puede hacer. Sus columnas son nombre, precio mensual y dos porcentajes de
descuento. Nada más.

Búsqueda exhaustiva: **cero** feature flags, cero límites por cuenta, cero gating por plan en
todo el repo. La única palanca de comportamiento que existe hoy es `lubricentros.activo`, que
es el binario suspendido/no suspendido.

**Lo más parecido a un flag, y es reutilizable:** `config_experiencia.campos_visibles` es un
**jsonb por tenant** con booleanas (`mostrar_productos`, `mostrar_observaciones`,
`mostrar_fidelizacion`, `mostrar_sucursal`). Ya se lee en el panel, en `/fidelli` y dentro de
`get_carton`. Es la prueba de que el patrón jsonb-por-tenant funciona en este stack — y el
molde natural para el override del punto (d).

---

## 4 · Migraciones: ninguna a medio aplicar — ✅ VERIFICADO EN DEV · ❓ SIN CONFIRMAR EN PRODUCCIÓN

Las últimas cinco:

| Migración | Qué hizo | Líneas |
|---|---|---|
| `20260812100000` slugs_reservados_landing | Reserva palabras antes de tener tenants | 97 |
| `20260813000000` slugs_publicos | Puerta mínima para el sitemap | 22 |
| `20260813120000` timezone_argentina | UTC−3 en database + 3 roles | 59 |
| `20260815120000` series_graficos | Series de los dos gráficos | 304 |
| `20260816120000` ventana_anual_5 | Tope duro de 5 años | 226 |

`supabase migration list` contra la nube: las **49** migraciones locales tienen su par remoto,
sin huecos y sin remotas huérfanas. **Dev está limpio.**

> **Pero eso es dev, no producción.** El proyecto linkeado es `qziqzakyqdrlsszafnjm`.
> Producción corre contra `cutzedfmxyyxxqfjutru` — proyecto **distinto**, y no está linkeado ni
> referenciado en el repo. **No puedo confirmar el estado de migraciones de producción.**
> Ver riesgo #2.

---

# B · Trabajos — cómo funciona hoy

## 5 · "Nuevo trabajo": tres caminos, y ninguno es un tipo de trabajo — ✅ VERIFICADO

Los tres caminos resuelven **a qué auto** se le carga, no **qué** se le hace. Todo pasa en una
pantalla con un solo campo: la patente. → `app/panel/services/nuevo/page.tsx`

| Camino | Cuándo | Qué hace |
|---|---|---|
| **A** · El auto existe | `buscarPorPatente` encuentra | Va directo al cartón |
| **B** · Cliente sí, auto no | Se busca por nombre | `crearVehiculoParaCliente` |
| **C** · Los dos nuevos | Nada matchea | `crearClienteYVehiculo` — atómico en la base |

Después hay un momento 1 único: el cartón. Seis consultas en paralelo, y todo termina en un
solo RPC, `guardar_service`.

---

## 6 · El camino de mecánica — ✅ VERIFICADO

> **No existe. Ni etiqueta, ni campo, ni enum, ni pantalla.**
> Lo único que hay para lo que no es service es `services.observaciones`: un `text` nullable,
> libre, sin estructura. No hay columna de tipo de trabajo, no hay enum que lo represente y el
> formulario no ofrece la opción.

Está documentado a conciencia en el repo. El FAQ de la landing lleva un comentario que dice que
el copy pedido se **recortó a propósito** porque la función no existe
(`components/landing/preguntas.tsx:89`). La respuesta publicada dice "la versión completa para
talleres mecánicos está en el roadmap".

Y la tabla lo impide activamente. Tres columnas NOT NULL que un trabajo de mecánica no tiene:

- `kilometros` — integer NOT NULL
- `aceite_tipo` — text NOT NULL, con CHECK de largo ≥ 2
- `prox_service_km` — integer NOT NULL, con CHECK `> kilometros`

Un cambio de correa no tiene aceite ni próximo kilometraje. Hoy **no se puede guardar**, ni
siquiera dejando campos vacíos.

---

## 7 · El próximo service no se calcula: lo declara el mecánico — ✅ VERIFICADO

Dos cosas distintas que conviene no mezclar:

- **El kilometraje del próximo service** lo escribe el mecánico a mano en el cartón y se guarda
  tal cual en `prox_service_km`. Ninguna función lo deriva del producto ni del vehículo.
- **La fecha estimada** sí se calcula, y vive entera en `vista_proximos_service`: km/día real
  del historial, con default de 40 km/día cuando hay un solo service.

**Qué pasa hoy si el trabajo es de mecánica:** no llega a pasar nada, porque el trabajo no se
puede cargar. Si mañana se permitiera guardar uno sin `prox_service_km`, la vista lo
**ignoraría en silencio** — el CTE `ultimo` toma el service más reciente por vehículo, así que
un trabajo de mecánica posterior al último service **desplazaría** al service real y el auto
desaparecería de la lista de a quién llamar. Es el riesgo #1.

---

## 8 · La lista de "a quién llamar" — ✅ VERIFICADO

Toda la pantalla sale de una vista.
→ `supabase/migrations/20260723214743_vista_proximos_service.sql`

Cinco CTEs encadenados: último service por vehículo → ritmo (km/día) → proyección →
clasificación en `vencido` (+15 días), `urgente` (≤7), `proximo` (≤30) → el check de contactado.
Recorta con `where fecha_estimada <= current_date + 30`.

El front no recalcula nada: filtra por sucursal y estado, y ordena por peso de estado.
→ `app/panel/proximos/page.tsx:50`

**Qué tan fácil es meterle una fuente nueva: difícil de hacer bien, fácil de hacer mal.**
Tres obstáculos concretos:

- La vista arranca de `services` con `distinct on (vehiculo_id)`. Un trabajo pendiente no es un
  service y no puede entrar por ahí sin corromper "el último service del auto".
- Todas las columnas de salida son de service (`ultimo_service_km`, `km_faltantes`,
  `km_por_dia`). Un pendiente con fecha puesta a mano no tiene ninguna: quedarían NULL, y el
  front no está escrito para eso.
- `create or replace view` **resetea las reloptions**. Si la migración no termina en
  `alter view ... set (security_invoker = on)`, un owner pasa a ver los datos de todos los
  tenants. Ya pasó dos veces en este proyecto.

El camino limpio es una vista nueva, `vista_pendientes`, con las mismas columnas de contrato, y
unirlas en la página. La otra opción —un `union all` dentro de la vista actual— es más corta y
toca el corazón de la retención.

---

## 9 · Productos: catálogo pelado — ✅ VERIFICADO

Cuatro columnas útiles: `categoria` (enum de 5: aceite, filtro, liquido, aditivo, otro),
`nombre`, `marca` y `activo`.

**No hay precio, ni costo, ni stock** — busqué las tres palabras en todas las migraciones y no
aparecen asociadas a productos en ningún lado.

Los carga **el owner** desde `/panel/productos`, y el alta de un tenant no siembra ninguno: el
catálogo es parte de la instalación presencial. Los productos se enganchan al service en dos
lugares — `services.aceite_producto_id` y `service_items.producto_id` — los dos con
`on delete set null`.

**Para presupuestos esto es el bloqueo real:** no hay ningún número monetario en todo el modelo
operativo. El único `numeric` del schema está en `planes` y `pagos`, que son nuestra cobranza,
no la del lubricentro.

---

## 10 · Marca y modelo: texto libre, sin red — ✅ VERIFICADO EN CÓDIGO · ❓ SIN CONFIRMAR EN DATOS

Las dos son `text` nullable, sin constraint, sin enum, sin tabla de referencia y **sin
normalización**. El trigger que normaliza patentes existe; para marca y modelo no hay nada
equivalente. Lo único que se hace es `.trim() || null` en dos Server Actions.

Se muestran siempre concatenadas y con fallback:
`[marca, modelo].filter(Boolean).join(" ") || "Vehículo"`. Eso significa que hoy un auto sin
marca ni modelo funciona perfecto en todas las pantallas — el campo es opcional de verdad.

> **No puedo confirmar qué hay cargado en producción.** No tengo credenciales del proyecto de
> producción y ninguna superficie pública expone marca/modelo. **Cuántas filas habría que
> normalizar es una pregunta abierta.** La consulta que la responde en un minuto:
>
> ```sql
> select marca, count(*) from vehiculos group by 1 order by 2 desc;
> ```

---

# C · Las cuatro superficies

## 11 · Landing comercial `/` — ✅ VERIFICADO

Estática, sin sesión, sin formularios. Nueve secciones más navbar y pie, en
`components/landing/` (22 componentes). Una sola acción: WhatsApp. Incluye un simulador de
carga que reusa los campos reales del flujo, JSON-LD Organization + SoftwareApplication +
FAQPage, y GTM.

**Qué puede hacer un usuario:** leer, probar el simulador, y escribir por WhatsApp. Nada más —
es la definición del alcance.

---

## 12 · Panel del lubricentro `/panel` — ✅ VERIFICADO

Dieciséis pantallas en tres grupos del sidebar:

| Grupo | Pantallas |
|---|---|
| **Operación** | Inicio · Próximos services · Clientes (+ ficha) · Services (+ detalle, editar, guardado) · Nuevo service (2 pasos) |
| **Configuración** | Productos · Fidelización |
| **Cuenta** | Diseño de experiencia · Mensajes · Sucursales · Mi cuenta |

Más una ruta de exportación a xlsx y una barra fija en mobile con cuatro accesos.
Suspendido = lee todo, no escribe nada; cada pantalla de escritura chequea `panelSuspendido()`
antes de consultar.

---

## 13 · Panel Fidelli `/fidelli` — y el alta completa — ✅ VERIFICADO

Cinco pantallas: tablero con pulso de plataforma, ficha del tenant (5 tabs), alta, precios y
cuenta.

**El alta de un lubricentro, paso por paso.** Un wizard de tres pasos que termina en dos fases
que no se pueden hacer atómicas:

| Paso | Qué se pide | Qué valida |
|---|---|---|
| **1** Marca y slug | Nombre y slug | `verificarSlug` en vivo contra `slug_estado()` |
| **2** Sucursales y owner | N sucursales (nombre, dirección, teléfono, horarios) + nombre y mail del owner | Al menos una sucursal con nombre |
| **3** Plan y trial | Plan del catálogo, periodo, descuento %, días de trial | descuento 0–100, trial 0–365 |

**Fase 1 — `crear_lubricentro()`, una transacción.** Exige `soy_superadmin()`. Inserta, en orden:

1. La fila de `lubricentros` (nombre + slug en minúscula)
2. Una fila de `config_experiencia` con todos los defaults — color `#0A0A0A` y los cuatro
   `campos_visibles`
3. Una fila de `sucursales` por cada una del paso 2. Cero sucursales aborta con `sin_sucursales`
4. Una `suscripcion` en estado **trial**, venciendo a `current_date + días`
5. `sembrar_templates()`: los tres tonos de WhatsApp, con Cercano activo, para que el botón de
   Próximos funcione desde el día uno

**Fase 2 — la invitación**, por HTTP con `service_role`. Es la única cosa en todo el sistema que
usa esa clave. Si falla, el tenant queda "Sin owner" y hay un botón para reintentar.

**Lo que NO se configura en el alta:** ningún producto, ningún premio, ningún plan de features.
El catálogo y Fidelliza se cargan en la instalación presencial.

---

## 14 · Superficie del cliente `/[slug]` y `/[slug]/[patente]` — ✅ VERIFICADO EN PRODUCCIÓN

Anónima. `anon` no tiene permiso sobre **ninguna** tabla: sus dos únicas puertas son
`get_landing()` y `get_carton()`, ambas `security definer`.

En `/[slug]`: marca del lubricentro, guía de tres pasos, buscador de patente, el premio vigente
y el pie con todas las sucursales. En `/[slug]/[patente]`: historial de cartones, próximo
service, progreso de Fidelliza y las notas del mecánico marcadas como visibles.

**Qué puede hacer:** buscar su patente y leer. No hay ninguna escritura — ni turnos, ni
comentarios, ni canje. "El cliente ve, el mecánico ejecuta."

---

# D · Autenticación, roles y aislamiento

## 15 · Usuario ↔ lubricentro — ✅ VERIFICADO

`public.usuarios` espeja `auth.users` por trigger. Dos roles, y el CHECK `rol_coherente` los
hace excluyentes:

- **`owner`** — tiene `lubricentro_id` obligatorio. Un owner, un tenant. No hay usuario en dos
  lubricentros ni dos owners por tenant impedidos por schema.
- **`superadmin`** — tiene `lubricentro_id` NULL obligatorio. Es equipo Fidelli.

No hay rol de empleado, ni de encargado de sucursal. **El lubricentro comparte una cuenta**, y
eso está asumido explícitamente en el código de la cookie de sucursal.

---

## 16 · RLS: 33 policies, y sí, el control por plan puede apoyarse ahí — ✅ VERIFICADO

Todas las tablas tienen RLS activo. Dos helpers `security definer` sostienen el sistema entero:
`mi_lubricentro_id()` y `soy_superadmin()`.

| Patrón | Tablas | Expresión |
|---|---|---|
| **Tenant** (11) | sucursales, config_experiencia, mensaje_templates, productos, premios, clientes, vehiculos, canjes, contactos, notas_vehiculo, service_items | `lubricentro_id = mi_lubricentro_id() or soy_superadmin()` |
| **Lee el owner, escribe Fidelli** | suscripciones, pagos, lubricentros, landing_busquedas | SELECT por tenant · ALL solo superadmin |
| **Regla de 24 hs** | services, service_items | UPDATE con `now() - created_at < 24h` o ventana de desbloqueo |
| **Sin borrado** | services | DELETE solo superadmin. Todo lo demás es `on delete restrict` |

> **La respuesta a la pregunta: sí, el control por plan puede vivir en RLS** — y el precedente
> ya está escrito: la regla de 24 horas es exactamente eso, una regla de negocio no trivial
> dentro de una policy. Un `plan_permite('mecanica')` `security definer` que lea la suscripción
> del usuario se agrega a cualquier `with check` sin tocar una sola consulta del front.
>
> **Pero no alcanza sola**, por una razón que ya está documentada en `CLAUDE.md`: RLS rechaza
> **en silencio**. Sin un chequeo en la aplicación, un owner de plan Basic vería el botón de
> mecánica, lo tocaría, y el guardado fallaría sin explicación. La UI tiene que saber lo mismo
> que la base.

---

## 17 · Dónde se validan las mutaciones — ✅ VERIFICADO

**Todo pasa por Server Actions.** Veinte archivos `actions.ts`. Cero escrituras desde el
cliente: no hay un solo componente `"use client"` que importe el cliente de browser de Supabase.

Y hay una guarda de lint que lo sostiene: `eslint.config.mjs` prohíbe importar `obtenerSesion`
desde `app/panel/**/actions.ts`. Una acción nueva **no compila** hasta que use
`sesionParaEscribir()` o declare por escrito que solo lee.

> **Esto es la mejor noticia del inventario para el control por plan.** Hay **un solo lugar**
> por donde pasa toda escritura del panel, y ya existe el mecanismo que obliga a usarlo.
> `sesionParaEscribir()` ya hace tres chequeos juntos (sesión, tenant, no suspendido); agregar
> el cuarto —qué permite el plan— es extender una función que ya se llama en las veinte
> acciones, no cablear veinte lugares.

---

# E · Análisis de impacto

## 18 · Trabajos mecánicos con estructura propia

**Es el más grande de los seis, por lejos.** No es una columna: es un segundo tipo de objeto en
la tabla que hoy asume que todo es un service.

| Capa | Qué toca |
|---|---|
| **Base** | Aflojar tres NOT NULL de `services` (o tabla nueva) · enum de tipo · tablas de repuestos y mano de obra · `guardar_service` y `actualizar_service` · **`vista_proximos_service`** · `resumen_inicio` y `metricas_plataforma` (los conteos cambian de significado) · `get_carton` |
| **Panel** | El cartón (`carton.tsx`, 400+ líneas) · lista y detalle de services · editar · el guardado · Inicio |
| **Cliente** | `historial-cartones.tsx` · `carton-papel.tsx` · el JSON de `get_carton` |
| **Fidelli** | `tab-datos.tsx` y `tab-resumen.tsx` cuentan services |
| **Landing** | La respuesta del FAQ que hoy dice que no existe, y `llms.txt` |

> **El riesgo silencioso:** si un trabajo mecánico entra en `services` con la misma forma, el
> `distinct on (vehiculo_id) ... order by fecha desc` de la vista lo toma como "el último
> service del auto" y **el auto sale de la lista de a quién llamar**. Sin error, sin log. Es la
> funcionalidad que sostiene la renovación de la suscripción.

---

## 19 · Trabajos pendientes

Tabla nueva (`trabajos_pendientes`: vehiculo, descripción, fecha o km objetivo, estado, quién lo
anotó) + la forma de meterlos en la lista de retención.

Toca `app/panel/proximos/` entero: la página, el ordenamiento por peso de estado, los tres
contadores, `fila-proximo.tsx` y el armado del mensaje de WhatsApp — que hoy asume que hay un
próximo service en kilómetros.

**Menos riesgoso que el 18 si se hace con vista propia**, porque no toca el cálculo existente.
Se vuelve tan riesgoso como el 18 si se resuelve con un `union all` adentro de
`vista_proximos_service`.

Cuidado con dos cosas: el modelo de contacto (`contactos` tiene FK a `vehiculo_id` y un enum de
tres estados que no incluye "pendiente"), y `notas_vehiculo`, que ya existe y se parece bastante
— conviene decidir si un pendiente es una nota con fecha o un objeto nuevo **antes** de escribir
la migración.

---

## 20 · Tres planes con control real

- **Base:** columnas nuevas en `planes` (features + límites) · función `plan_permite(feature)` ·
  policies que la usen.
- **Aplicación:** `lib/auth/session.ts` (el lugar central), `components/panel/sidebar.tsx` y
  `barra-mobile.tsx` — hoy los dos tienen la lista de rutas **hardcodeada** y habría que
  filtrarla —, más una pantalla de "esto es de otro plan".
- **`/fidelli`:** `campos-plan.tsx`, `tarjeta-plan.tsx`, `wizard-alta.tsx`, `/fidelli/precios` y
  `tab-suscripcion.tsx`.
- **Landing:** la sección 09 muestra **un solo plan**, con precio y bullets escritos a mano en
  `precio.tsx`. Tres planes es rediseñar esa sección, más el JSON-LD de precios y `llms.txt`,
  que tienen que coincidir exacto.

---

## 21 · Marcas y modelos con selector

El más contenido de todos. Dos formularios de alta de vehículo
(`app/panel/services/nuevo/actions.ts` y `app/panel/clientes/[id]/actions.ts`), un componente de
combobox nuevo, y una tabla o seed de marcas.

**Riesgo bajo**, porque marca y modelo son nullable y se muestran siempre concatenadas con
fallback: nada se rompe si quedan mezclados datos viejos con nuevos. El único cuidado es **no
convertirlo en obligatorio** — eso sí rompería el flujo de 90 segundos.

---

## 22 · Presupuestos

> **Bloqueado por el punto 9.** No hay un solo precio en el modelo operativo.

Un presupuesto necesita, como mínimo: precio en `productos` + precio de mano de obra + una tabla
de presupuesto con sus renglones + estado + numeración + alguna forma de mostrárselo al cliente.

Y trae una decisión de negocio que el inventario no puede resolver: **si el precio entra al
sistema, entra IVA, entra listas de precios, y entra el día en que el lubricentro pide
facturar.** Eso es otro producto.

---

## 23 · Iconos en el sidebar

Trivial y bien acotado. `components/panel/sidebar.tsx` tiene **11** items en tres grupos,
**ninguno con ícono** — solo el botón de carga y el candado tienen. La barra de mobile ya usa
cuatro.

Faltan ~7 íconos nuevos en `components/iconos.tsx` (hoy exporta 23). Los de Phosphor `light` ya
están instalados.

> **Chequeo de paso: hay Lucide en el proyecto.** `CLAUDE.md` dice "NO usamos Lucide (lo usa
> todo sitio hecho con IA)", pero `lucide-react@1.31.0` está en `package.json` y se usa en
> `components/iconos.tsx` y `cta-whatsapp.tsx`. Lo verifiqué también en el HTML de producción:
> la clase `lucide-check` viaja en la sección de precio. O se corrige el código, o se corrige la
> regla.

---

# Las cuatro que definen la arquitectura

## a · Un Pro con mecánica cargada baja a Basic

> **Recomendación: los datos no se tocan nunca. Se apaga la escritura, nunca la lectura.**

Es la misma forma que ya tiene la suspensión, y no es casualidad que funcione: el sistema entero
está construido sobre `on delete restrict` y "los datos históricos no se borran". Un plan que
borra datos contradice la regla más vieja del proyecto.

En concreto: el trabajo mecánico sigue en la ficha del auto, sigue en el historial del cliente y
sigue contando en las métricas. Lo que desaparece es el botón de cargar uno nuevo, con el mismo
copy que ya usa `BloqueoSuspension`.

Dos razones más, prácticas: al reactivar no hay nada que restaurar, y el historial incompleto de
un auto es exactamente lo que destruye la confianza del cliente final, que es el activo del
producto.

---

## b · Dónde vive la definición de los planes

> **Recomendación: mixto, con la base como fuente de verdad y un espejo tipado en código.**

Y el reparto no es arbitrario — lo dicta este stack:

- **En la base, la asignación:** qué plan tiene cada tenant y qué habilita ese plan. Tiene que
  estar ahí porque RLS se evalúa en Postgres y no puede leer una constante de TypeScript. Un
  gating que solo existe en el front es una sugerencia, no un control.
- **En código, el catálogo de nombres de features:** una unión de strings
  (`"mecanica" | "premios" | "presupuestos"`). Sin eso, TypeScript no puede atrapar un
  `plan_permite("mecanika")`, y el proyecto ya vivió el modo de falla de los nombres inventados
  que no fallan en build.

**Contra "todo en código":** cambiar el plan de un cliente sería un deploy. Hoy Fidelli ya edita
planes desde `/fidelli/precios` sin tocar el repo, y eso no se debería perder.

**Contra "todo en base":** Server Components cachean, y una consulta de features por render es
cara. Con las features en jsonb sobre `planes`, viajan gratis en la consulta de suscripción que
`obtenerSesion()` ya podría hacer, memoizada por request como ya lo está.

---

## c · Asignar plan a los que ya existen

> **Recomendación: default abierto, no default cerrado.** Los tenants actuales arrancan con
> **todo habilitado**, sea cual sea su plan comercial.

Mecánicamente es simple, porque el trabajo ya está hecho: **todos los tenants ya tienen una fila
en `suscripciones` con su `plan_id`** — lo garantiza `crear_lubricentro()`, que la inserta en la
misma transacción. No hay que asignar nada. Lo único que falta es decidir qué habilita cada plan.

La migración concreta: agregar las columnas de features con `default` permisivo, y después
restringir **solo** los planes nuevos. Un tenant existente no pierde nada porque su fila nunca se
toca.

Y un paso previo que no es opcional, porque el proyecto ya se quemó con esto: correr en
producción el equivalente de `select id, nombre, plan_id from suscripciones` y confirmar que no
hay ninguno huérfano **antes** de la migración. `create or replace` no re-valida filas existentes.

---

## d · Override por cuenta, sin parchear código

> **Recomendación: un jsonb de overrides en `lubricentros` (o en `suscripciones`), que pisa al
> plan.** El molde ya existe y ya funciona en producción: `config_experiencia.campos_visibles`
> es exactamente esto.

La resolución sería una sola función, un solo lugar:

- `plan_permite(feature)` lee primero el override del tenant; si la clave no está, cae al plan.
- Tres estados por feature, no dos: **habilitado**, **deshabilitado** y **ausente**. El tercero
  es el que hace que el override sea parcial — sin él, activarle una función a alguien lo saca
  del plan para todo lo demás.
- La misma función la usan la policy de RLS y `sesionParaEscribir()`. Una definición, dos capas.

La UI para tocarlo cae natural en `components/fidelli/ficha/tab-suscripcion.tsx`, que ya es la
pantalla donde Fidelli mira el plan de un tenant.

Un pedido: que el override guarde **quién y por qué**. El proyecto ya tiene ese reflejo en
`correcciones_patente`, que exige un motivo de 10 caracteres. Un override sin motivo, seis meses
después, es un misterio que nadie se anima a apagar.

---

# F · Investigación externa

## 24 · Logos de marcas — ✅ LICENCIAS LEÍDAS

> **Ninguna fuente pasa la regla. Ninguna.**
> Revisé cuatro y todas hacen exactamente lo mismo: licencian **la colección** y desligan **los
> logos**. La licencia abierta cubre el índice y el código, nunca la marca registrada.

| Fuente | Cobertura AR | Formato | Licencia — texto exacto |
|---|---|---|---|
| [car-logos-dataset](https://github.com/filippofilip95/car-logos-dataset) | 387 marcas, incluye todas las de acá | PNG y JPG. **Sin SVG** | MIT sobre el repo, pero: *"All logo images are the property of their respective owners and are subject to their own licensing terms."* **No sirve.** |
| [Logo.dev](https://www.logo.dev/legal/terms) | Amplia, por dominio | SVG, PNG, WebP | Free 500K req/mes, uso comercial con atribución. Pero sus términos dicen que **solo dan acceso a IP de terceros sin otorgar licencia**, y que el cliente es el único responsable. **No sirve.** |
| [Motomarks](https://motomarks.io/about) | Específica de automotrices | SVG, PNG, WebP | Pie de página: *"All automotive brand logos and trademarks are property of their respective owners."* Los términos comerciales no están publicados. **Sin verificar.** |
| [Simple Icons](https://github.com/simple-icons/simple-icons/blob/master/LICENSE.md) | Muy pocas automotrices | SVG | CC0 *"doesn't mean to imply that all icons within the project are also CC0"*, y el [disclaimer](https://github.com/simple-icons/simple-icons/blob/develop/DISCLAIMER.md) aclara que no despeja derechos de terceros. **No sirve.** |

Lo que sí existe legalmente es el **uso referencial de marca ajena** — la doctrina que le permite
a un taller decir "hacemos service de Toyota". En Argentina eso cae bajo la Ley 22.362. Pero es
una **defensa**, no una licencia: no se puede citar como autorización, y no soy la persona
indicada para dictaminarlo. Si algún día queremos logos, el camino verificable es escribirle a la
automotriz y guardar el mail.

### El respaldo, que pasa a ser el estado por defecto

La marca como **insignia tipográfica** en un contenedor neutro. Y no queda como placeholder si
sale del sistema que ya tenemos:

- Public Sans 600, escalón `label`, tracking abierto, mayúsculas — la voz del instrumento, la
  misma de los badges del panel.
- Contenedor sobre `surface`, borde de 1px en `line`, radio 4. Sin color de marca: el rojo es
  acción y esto es un dato.
- Ancho fijo con la marca truncada por elipsis, así una grilla de autos no se desalinea entre
  "FIAT" y "MERCEDES BENZ".

Se ve deliberado porque **es** el sistema, no una ausencia de logo. Y el día que una licencia esté
clara, el logo entra en ese mismo contenedor sin tocar el layout.

---

## 25 · Modelos: encontré la base, y confirma la intuición — ✅ CSV DESCARGADO Y ANALIZADO

Existe una fuente oficial, gratis y del parque argentino real: los datasets de la **DNRPA** en
[datos.gob.ar](https://datos.gob.ar/dataset?tags=automotores), publicados por el Ministerio de
Justicia. Bajé y procesé el CSV de **Transferencias de autos de julio 2026** — transferencias, no
patentamientos: son autos usados cambiando de dueño, que es exactamente el auto que entra a un
lubricentro.

| Qué | Dato medido |
|---|---|
| Licencia | **CC-BY-4.0** — la única de todo el bloque F que sirve |
| Campos | `automotor_marca_descripcion` y `automotor_modelo_descripcion`, texto, más año y tipo |
| Actualización | Mensual, desde 2018. El archivo vigente es 202607 |
| Muestra procesada | 156.813 transferencias |
| Top 10 marcas | 90,53 % del total |
| Top 20 marcas | 96,42 % |
| Top 30 marcas | 97,69 % |

El ranking es el que esperarías de un lubricentro de Córdoba: Volkswagen, Ford, Renault,
Chevrolet, Fiat, Toyota, Peugeot, Citroën. Y los modelos más transferidos son Gol, Gol Trend, Fox,
F-100, Ka, Uno Fire, Palio, Cronos, Voyage. **Es el parque argentino, medido.**

> **Sirve para marcas. Para modelos, no.**
>
> La misma muestra de un solo mes tiene **14.207** combinaciones marca+modelo distintas, porque el
> campo trae la versión completa: *"PALIO (326) ATTRACTIVE 5P 1.4 8V"*. Colapsando cilindradas y
> códigos bajan a 5.843, y aun así los **top 500 cubren solo el 82 %**. El colapso automático
> además parte el mismo auto en variantes: *HILUX CABINA* y *HILUX D/C*, *AMAROK DC* y
> *AMAROK TDI*.
>
> Y la cola de marcas es basura: *RENBAULT* (con typo), *CHEVROLET (024)*, *FIAT UNO TRENT*,
> fabricantes de trailers. Un selector con 492 marcas le hace perder tiempo al mecánico, que es
> justo lo que prometemos que no pasa.

### La propuesta de sembrar marcas es la correcta, y ahora tiene los números

Sembrar 30–40 marcas y dejar que los modelos se armen solos **es** lo que hay que hacer. Lo que
cambia con esta investigación es que las marcas no las adivinamos: salen del top 30 medido de la
DNRPA, que cubre el 97,69 % del parque, filtrando la cola a mano. Una sola vez, verificable, con
licencia citable.

Sobre el autocompletado de modelos, dos cosas que salen del inventario:

- Primero lo del propio lubricentro y después lo de todos es correcto, pero el segundo nivel
  **cruza el aislamiento multi-tenant**. Tiene que ir por una función `security definer` que
  devuelva **solo** strings agregados con un mínimo de ocurrencias — nunca una consulta directa a
  `vehiculos`.
- Con `marca` en texto libre sin normalizar, el autocompletado va a sugerir "FORD", "Ford" y
  "ford" como tres opciones. Normalizar al guardar es parte del punto 21, no un extra.

**En cualquier escenario, el campo acepta texto libre siempre.** La lista sugiere, nunca obliga.

---

# G · Lo que encontré y no estaba a la vista

Ordenado por lo que puede arruinar un sprint, no por gravedad abstracta.

| Hallazgo | Qué es |
|---|---|
| **Producción tiene su Supabase propio y no está linkeado**<br>`cutzedfmxyyxxqfjutru` vs `qziqzakyqdrlsszafnjm` | Lo deduje del storage de la vidriera de Brothers Oil. Es la respuesta a una pregunta que venía abierta hace varias sesiones. **No puedo verificar nada de producción** — ni migraciones, ni datos, ni el estado de esos planes. |
| **La clave jsonb `evolucion` es carga muerta**<br>en `resumen_inicio()` | Se conservó a propósito durante el deploy de los gráficos y quedó. Hoy la base la calcula en **cada carga del Inicio de cada tenant** y **ningún archivo del front la lee**. Es una migración de tres líneas. |
| **Lucide está instalado y en producción**<br>`package.json` + `components/iconos.tsx` | `CLAUDE.md` lo prohíbe por escrito. Lo confirmé en el HTML servido: `lucide-check` viaja en la sección de precio. Hay dos fuentes de verdad en conflicto. |
| **La sucursal es del dispositivo, no del usuario**<br>`COOKIE_SUCURSAL` | Con dos sucursales reales y una sola cuenta, el celular equivocado etiqueta services en el local equivocado y nada avisa. Ya es cierto **hoy** en Brothers Oil. |
| **`service_items.cambiado` existe** | Agregada en `20260728130000`. Distingue "OK" de "cambiado" en el renglón. Cualquier diseño de trabajos mecánicos tiene que contarla. |
| **`notas_vehiculo` ya es media función de pendientes** | Tiene vehículo, autor, contenido y `visible_cliente`. Le falta solamente fecha o km objetivo y estado. Decidir si un pendiente es esto con dos columnas más, o un objeto nuevo, cambia el tamaño del punto 19. |
| **El default de 40 km/día no se ve en ningún lado** | Con un solo service la vista asume 15.000 km/año. La fila muestra `estimacion_inicial`, pero el número supuesto no se dice. Es una fecha inventada que se ve igual que una medida. |
| **El alta no siembra productos ni premios** | Un tenant nuevo no puede cargar un service completo hasta que alguien cargue el catálogo a mano. Está asumido en la instalación presencial, pero no está escrito en ningún checklist del código. |
| **Cero deuda declarada** | Busqué TODO, FIXME, HACK y deprecated en todo el repo: **ninguno**. Nada de lo de arriba es descuido — son decisiones documentadas que quedaron pendientes. |

---

# Riesgos, por lo que pueden costarnos

| # | Riesgo | Qué cuesta si pasa | Cuándo aparece |
|---|---|---|---|
| **1** | **Un trabajo mecánico saca autos de la lista de a quién llamar**<br>`distinct on (vehiculo_id)` en `vista_proximos_service` | Falla **en silencio**. La lista de retención es lo que renueva la suscripción; el lubricentro no llama a gente que debería llamar y no se entera hasta que el cliente no vuelve. Meses de daño sin síntoma. | Punto 18, el día uno |
| **2** | **Producción es un proyecto no linkeado y a ciegas** | Todo el plan asume un esquema que solo verifiqué en dev. Si producción está atrasada, la primera migración del sprint falla o —peor— aplica sobre un esquema distinto del que probamos. | Antes de la primera migración |
| **3** | **Una vista reemplazada pierde `security_invoker`** | Un owner ve los datos de **todos** los lubricentros. Ya pasó dos veces en este proyecto, y el diff se veía inofensivo las dos. `verificaciones.sql` lo atrapa en el reset — si el reset se corre. | Puntos 18 y 19 |
| **4** | **Gating que solo vive en el front** | Un owner de Basic manda la Server Action a mano y escribe igual. Es una brecha de producto vendible, no un bug visual. | Punto 20 |
| **5** | **Gating que solo vive en RLS** | El fallo opuesto y más probable: RLS **rechaza en silencio**. El botón se ve, se toca, y no pasa nada. Sin mensaje, sin error entendible. | Punto 20 |
| **6** | **Un cambio de plan destruye datos** | Irreversible, y contradice `on delete restrict`, que es la regla más vieja del proyecto. Lo cubre la recomendación (a) si se respeta. | Punto 20 / pregunta (a) |
| **7** | **El autocompletado de modelos filtra entre tenants** | Sugerir lo que cargaron otros lubricentros es una consulta cross-tenant. Mal hecha, es una fuga de datos de clientes de la competencia. | Punto 21 / 25 |
| **8** | **Un logo sin licencia verificable** | Marcas registradas de automotrices en un producto comercial. Ninguna fuente del bloque F otorga licencia. El costo es legal, no técnico. | Punto 24 |
| **9** | **Un selector de modelos con la cola cruda de la DNRPA** | 492 marcas y 14.207 modelos le hacen perder los 90 segundos al mecánico, que es la promesa central del producto. | Punto 25 |
| **10** | **La sección 09 de la landing con tres planes** | Precio, JSON-LD y `llms.txt` tienen que coincidir exacto. Desalineados es penalización de Google y un reclamo comercial. | Punto 20 |

---

*Fase 0 · Inventario y análisis de impacto · Fidelli Motors · 22 de agosto de 2026.
Lo que no pude confirmar está marcado como tal y no se completó con supuestos.*

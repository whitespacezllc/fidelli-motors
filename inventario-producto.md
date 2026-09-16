# Fidelli Motors — inventario de producto

> **Para qué es esto.** Base de dirección creativa y comunicación: qué hace el producto
> hoy, según el código, no según la landing. Documento de solo lectura; no se modificó
> ningún archivo para producirlo.
>
> **Fecha:** 1 de septiembre de 2026 · **Rama:** `main` en `ab03fd8`
> **Método:** lectura directa del repo y de las 60 migraciones de `supabase/migrations/`.
> Donde una función o vista está redefinida varias veces, se documenta **la versión
> vigente** y se indica en qué migración quedó.
>
> **Lo que no se pudo verificar está dicho como tal, no completado con supuestos.**
> En particular: no se auditó la base de **producción** (es un proyecto de Supabase
> aparte, no linkeado a propósito), así que todo lo de acá describe el esquema del repo.

---

## 1 · Las cuatro superficies

Nota de nomenclatura, antes que nada: **esta partición de cuatro no existe escrita en
ningún archivo del repo.** `CLAUDE.md` cuenta "tres superficies" y deja afuera la landing
comercial; `CLAUDE-landing.md` cuenta otras tres y junta los dos paneles en uno. La
partición de abajo es la unión de las dos, y es la correcta como inventario de producto.

| | Landing comercial | Panel del lubricentro | Panel interno Fidelli | Superficie del cliente |
|---|---|---|---|---|
| **Ruta** | `/` | `/panel` | `/fidelli` | `/[slug]` y `/[slug]/[patente]` |
| **Quién** | dueño de lubricentro (prospecto) | rol `owner` | rol `superadmin` | dueño del auto, anónimo |
| **Sesión** | no | obligatoria | obligatoria | **ninguna** |
| **Marca** | Fidelli Motors | Fidelli Motors | Fidelli Motors | **del lubricentro** |
| **Indexada** | sí | no | no | `/[slug]` sí · `/[slug]/[patente]` **no** |

### 1.1 · Landing comercial — `/`

La pieza de venta. Once secciones en orden dolor → deseo → duda: Hero, Prueba (simulador
de carga real), QueCambia, QrYPasos, Fidelliza, Caso Brothers Oil, Precio, Preguntas,
Cierre.

**Qué puede hacer el visitante:** leer, probar el simulador de carga, y **una sola acción
primaria: escribir por WhatsApp**, repetida en navbar, hero, precio, cierre y barra fija
mobile, siempre al mismo número. **No hay formularios en toda la superficie.**

No lee la sesión en ningún punto, por decisión explícita: es la página que más tráfico
anónimo recibe y tiene que poder servirse estática. "Ingresar" siempre apunta a `/login`.

> **No existen** las rutas `/terminos` ni `/privacidad`, aunque `CLAUDE-landing.md` las
> menciona como las únicas rutas nuevas previstas. El pie tiene un comentario: "se
> agregan acá el día que existan".

### 1.2 · Panel del lubricentro — `/panel`

La herramienta de trabajo. Autorización: `exigirRol("owner")` en el layout — el proxy
solo refresca la sesión, no decide nada.

Once secciones en tres grupos (`components/panel/sidebar.tsx`):

- **Operación:** Inicio · A quién llamar · Clientes · Trabajos
- **Negocio:** Productos · Fidelización · Presupuestos
- **Configuración:** Diseño de experiencia · Mensajes · Sucursales · Mi cuenta

**41 Server Actions** en total. Detalle por sección en el punto 2.

**Cuatro capas de protección:** rol en el layout → RLS multi-tenant automático por
`lubricentro_id` → `sesionParaEscribir()` en cada acción (sesión + tenant + no suspendido
+ plan) → gating por plan en `WITH CHECK` de RLS. La separación entre leer y escribir la
garantiza **el lint**: `eslint.config.mjs` prohíbe importar `obtenerSesion` desde
`app/panel/**/actions.ts`.

### 1.3 · Panel interno de Fidelli — `/fidelli`

La administración de los tenants. `exigirRol("superadmin")`. **No hay registro público y
el alta de un superadmin es interna.**

Seis rutas, el inventario completo: `/fidelli` (listado + Pulso de plataforma + filtro
"Necesitan atención"), `/fidelli/nuevo` (wizard de alta), `/fidelli/[id]` (ficha con
pestañas Resumen · Suscripción · Datos · Configuración), `/fidelli/precios`,
`/fidelli/cuenta`.

**Qué puede hacer:** dar de alta un tenant (dos fases: transacción en Postgres, después
la invitación por HTTP — si falla la segunda queda un lubricentro "Sin owner" que se
arregla con un botón); invitar/reenviar invitación (**único uso de `service_role` en todo
el producto**); suspender y reactivar; registrar pagos y avisos de vencimiento; editar
planes y precios de lista; fijar overrides de features por tenant; **desbloquear un
trabajo fijado** y **corregir una patente** (las dos únicas escrituras sobre datos del
cliente, ambas con motivo y auditoría).

**Acá el RLS trabaja al revés que en `/panel`:** `soy_superadmin()` abre todos los
tenants, así que cada consulta tiene que filtrar por el lubricentro de la ficha. Un
filtro olvidado no da error: mezcla dos lubricentros en la misma pantalla.

**La pestaña Datos es de solo lectura a propósito:** "Fidelli no edita los datos de su
cliente: si hay algo mal, se abre la ventana y lo corrige el lubri."

### 1.4 · Superficie del cliente — `/[slug]` y `/[slug]/[patente]`

El cartón del parasol, digitalizado. Sin cuenta, sin app, sin contraseña.

**`anon` no tiene permiso sobre ninguna tabla del esquema.** Sus únicas dos puertas son
funciones de Postgres con `grant execute` explícito: `get_landing(slug)` (el shell, no
escribe) y `get_carton(slug, patente)` (la búsqueda, **registra el intento** en
`landing_busquedas`, que es la captura de leads del lubricentro).

Detalle completo en el punto 4.

---

## 2 · Inventario del panel, sección por sección

### 2.1 · Inicio — `/panel`

Tiene **dos modos excluyentes**.

**Modo checklist de puesta en marcha.** Mientras esté incompleto, *reemplaza* al
dashboard. Cuatro pasos: cargar sucursales → sumar productos → definir el premio → cargar
el primer trabajo. Cada paso hecho muestra el dato real conseguido, no un tilde. Con la
cuenta suspendida deja de empujar: cada paso pendiente dice "En pausa".

**Modo dashboard.** Todo sale de **una sola RPC** (`resumen_inicio`):

- **Aviso de stock bajo** (solo si hay algo bajo el mínimo): "N productos para reponer",
  con cantidad y mínimo por producto, en ámbar.
- **Cuatro métricas:** Trabajos del mes (cuenta los dos tipos) · Clientes nuevos ·
  **Recuperados este mes** (en dorado) · Canjes del mes.
- **Retención pendiente:** N vencidos / N urgentes / N próximos + "Ver tabla". Si los
  tres son cero: **"Estás al día"** en verde.
- **Gráfico de trabajos** con cuatro vistas (semana/mes/trimestre/año).
- **Tu página pública:** % de escaneo (autos de la flota cuya patente fue buscada en 12
  meses) + "N búsquedas de patentes que no son tuyas" (leads).
- **Últimos 5 trabajos.**

**Acción principal:** 1 tap ("+ Nuevo trabajo"). **Sin gating por plan.**

### 2.2 · Trabajos — `/panel/services`

El registro operativo. Se llama "Trabajos" y no "Services" porque mezcla los dos tipos.

**Columnas:** fecha-hora · patente · vehículo · cliente (o **descripción del trabajo** si
es mecánica) · sucursal · km (o sello `MECÁNICA`) · estado (`EDITABLE 22 HS` /
`DESBLOQUEADO` / `FIJADO` / `ANULADO`).

**Filtros:** buscador por patente + Tipo (Todos/Services/Mecánica, va primero a
propósito) + Sucursal + Desde + Hasta. Paginado de 30. Los anulados no se borran: quedan
atenuados.

**Sin gating.** Un suspendido lo ve entero.

### 2.3 · Carga de un SERVICE

Tres URLs + un paso interno. **No hay pantalla separada para mecánica**: es una rama del
mismo formulario (ver 2.4).

**Momento 0 — identificar el vehículo** (`/panel/services/nuevo`). Un solo input, foco
automático, teclado en mayúsculas. Busca sola a los 300 ms desde el 6º carácter. Tres
casos, **todos sin navegar**:
- **A · el auto ya pasó:** mini-ficha con marca, modelo, dueño, último service y badge
  dorado `PREMIO DISPONIBLE` si corresponde → "Cargar trabajo".
- **B · el cliente existe, es otro auto suyo:** buscador de clientes → marca/modelo/año.
- **C · todo nuevo:** Nombre* · Teléfono* · Email · CUIL/CUIT · marca/modelo/año.

**Momento 1 — el cartón** (`/panel/services/nuevo/[vehiculoId]`). La página trae siete
conjuntos de datos en paralelo. En orden: cabecera sticky con selector de sucursal ·
**selector de tipo** (solo con la feature) · aviso de "ya hay un service de hoy" ·
pendientes abiertos del auto para tildar · fecha · **kilómetros** (avisa en ámbar si son
menos que el último, pero **no bloquea**) · **aceite** (viscosidad con 11 chips SAE +
producto buscable del catálogo con precio y stock + litros) · **los 11 renglones** en 4
grupos · premio · **próximo service** (chips +8.000 / +10.000 / +15.000) · observaciones ·
pendientes nuevos.

Cada renglón tiene **dos toques**: encendido significa "revisado, OK", y "se cambió" es un
switch aparte.

**Momento 2 — previsualización.** Muestra **el cartón papel real que va a ver el cliente**,
en ancho de celular fijo ("estirarlo sería mentir sobre lo que ve el cliente"), más
"Se guarda en {sucursal}" y "Editable por 24 horas".

**Momento 3 — guardado** (`/panel/services/[serviceId]/guardado`). Confirmación + si es la
primera visita del auto, la tarjeta **"entregá la calco"** con el guion de 20 segundos +
estado del premio + un campo para anotar una nota con el auto todavía en el pozo. Salidas:
"+ Nuevo trabajo" (el loop), "Ver cartón", "Volver al panel".

**Todo el guardado es una sola transacción** (`guardar_service`): trabajo + renglones +
canje + pendientes + descuento de stock.

### 2.4 · Carga de un TRABAJO MECÁNICO

**No es un flujo distinto.** Es un selector de dos botones al principio del mismo cartón,
que solo existe con la feature `mecanica` y **no aparece al editar** (el tipo de un trabajo
guardado no se reescribe).

| | Service | Mecánica |
|---|---|---|
| Descripción del trabajo | no existe | **obligatoria**, ≥5 caracteres |
| Kilómetros | **obligatorios** | opcionales |
| Aceite (viscosidad, producto, litros) | obligatorio | **no existe** |
| Los 11 renglones | sí | **no** — en su lugar, renglones libres "Repuestos y tareas" |
| Próximo service | sí | **no existe** |
| Premio | sí | **solo si el premio cuenta "todos los trabajos"** |
| Papel que se dibuja | cartón de 11 renglones | orden de trabajo |

**Una mecánica es más barata de cargar que un service:** un solo campo obligatorio contra
tres.

### 2.5 · Detalle, edición y anulación

**Detalle:** cabecera con patente y vehículo · banda de estado con sus acciones · **el
cartón papel tal cual lo ve el cliente** · y metadata que el cliente **no** ve (cargado
por, cuándo, sucursal, aceite, kilómetros, observaciones).

**Anular** pide confirmación explícita con fecha y patente. Nunca borra: marca
`anulado = true`. Un anulado no aparece en el historial del cliente ni cuenta para el
premio, pero queda como registro.

**Editar** reusa el mismo componente del cartón, precargado. Avisa que **el stock no se
ajusta al editar** (el descuento pasa una sola vez, al crear).

### 2.6 · A quién llamar — `/panel/proximos`

La pantalla donde el dueño cobra el retorno de lo que paga. Viene ordenada para trabajarla
de arriba a abajo: **no hay ordenamiento por columna, a propósito**.

Dos fuentes unificadas: `vista_proximos_service` (siempre) y `vista_pendientes` (solo con
la feature `pendientes`).

**Columnas:** cliente + teléfono · vehículo · último service · próximo · **retorno
estimado** (con la leyenda "estimada: 40 km/día supuestos" cuando el auto tiene un solo
service) · estado (`VENCIDO` / `URGENTE` / `PRÓXIMO`, siempre en ámbar, **nunca en el rojo
de marca**) · checkbox "contactado" · botón de WhatsApp.

Arriba: tres contadores + conmutador Todo/Services/Pendientes + la métrica dorada
**"Recuperados este mes"**.

**El botón de WhatsApp es un enlace real, no un botón que espera al servidor** (si se
abriera desde un callback, Safari lo bloquearía como popup). Abre el chat con el mensaje
ya armado **y** marca el contacto, en un solo tap.

**Anti-spam:** contactado en ese estado → botón apagado con el motivo. Si el vehículo
escala de estado, se vuelve a habilitar.

**Si no hay ningún mensaje activo configurado, no hay link de WhatsApp en ninguna fila**, y
un aviso manda a `/panel/mensajes`.

**Acción principal: 1 tap.**

### 2.7 · Clientes — `/panel/clientes` y `/panel/clientes/[id]`

**Listado:** buscador único por nombre, teléfono o patente; por fila, nombre + teléfono +
"N vehículos" + última visita. **Exportación a `.xlsx`** generada en el servidor (no CSV,
por el Excel en español) con Nombre, Teléfono, Email, Cantidad de vehículos, Patentes,
Último service, Kilómetros y Próximo service — y exporta **exactamente lo que el filtro
está mostrando**.

**Ficha:** contacto + "cliente desde" + una tarjeta por vehículo con identificación,
resumen, atajo a **presupuesto**, editar vehículo (**la patente se puede corregir hasta
72 hs después del primer service; después queda fija** y la cambia Fidelli),
**fidelización** con barra de progreso y lista de canjes, **notas del vehículo**,
**pendientes** e **historial**.

### 2.8 · Presupuestos — `/panel/presupuestos`

Un **generador de documentos**, y la frontera está grabada en la migración: no es
facturación (sin IVA, sin listas de precios, sin numeración fiscal, sin estados de
aprobación). **Cliente y vehículo son opcionales** — un presupuesto es para alguien parado
en el mostrador.

**Numeración correlativa por tenant**, con advisory lock dentro de la transacción: dos
mostradores cotizando a la vez sacan 47 y 48, nunca 47 y 47. Al editar, **el número no
cambia nunca**.

**Lo único obligatorio es un renglón con descripción de ≥2 caracteres.** Elegir un producto
del catálogo precarga descripción e importe, pero **el importe es una copia de ese momento,
no queda atado al catálogo**.

**Tres salidas del mismo dato:** pantalla · **impresión** (A4, márgenes de 12 mm) ·
**descarga en PDF** (vectorial, texto seleccionable, ~7 KB sin logo). Al pie, línea de
auditoría: generado por quién y cuándo, y "editado" si difiere.

> **Cambio reciente (1/9/2026):** el botón "Mandar por WhatsApp" fue reemplazado por
> "Descargar en PDF" + "Imprimir". El anterior rasterizaba el documento y se colgaba.
> **`public/llms.txt` todavía comunica el flujo viejo** — ver 7.b.2.

**Acción principal: 2 clics + tipeo.** Duplicar uno existente: 2 clics.

### 2.9 · Productos, precio y stock — `/panel/productos`

Catálogo de aceites, filtros y líquidos. Desde agosto lleva **precio de venta y stock,
ambos opcionales**. Frontera grabada: **sin costo, en ninguna forma** — "en el momento en
que entra el costo entra el IVA, y detrás viene facturar, que es otro producto".

**Nueve categorías**, administradas por Fidelli (no por el tenant): aceite, filtro,
líquido, aditivo, repuesto, neumático, batería, accesorio, otro.

**El stock es opcional de verdad:** un interruptor "Llevo stock de este producto"; apagado,
los tres campos ni existen. `NULL` significa "no llevo stock", no "cero". **Puede quedar
negativo a propósito**: es la señal de "ajustame". El ajuste es editar el número — no hay
movimientos ni recepciones.

**Cómo se descuenta:** solo **al crear** un trabajo, en la misma transacción. Dos caminos:
el aceite por **litros** (si el producto lleva stock y hay litros), y cada renglón por
**cantidad**. **Editar o anular no re-toca el stock.**

**Aviso de stock bajo:** productos activos con stock ≤ mínimo, hasta 8, ordenados por
criticidad, mostrados en Inicio.

**Sin gating por plan: el catálogo con precio y stock está en los tres planes.**

### 2.10 · Fidelización — `/panel/fidelizacion`

Un solo programa por lubricentro. Campos: **meta** (2 a 50) · **qué se lleva el cliente**
(texto libre, se ve tal cual en el cartón) · **qué cuenta** (solo services / todos los
trabajos) · activo.

**Lo distintivo: un simulador de impacto.** La página precalcula, para cada meta posible de
2 a 50, cuántos vehículos quedarían con premio disponible, y al mover la meta avisa en
ámbar: "Con la meta en X: Y con premio disponible — Z vehículos pasarían a tenerlo al
instante". Encima, una advertencia permanente de que cambiar las reglas seguido desgasta la
confianza del cliente.

**Sin snapshots:** se compara siempre contra la meta vigente, así que un cambio mueve a
todos los vehículos al instante.

Al pie, la frontera comercial explícita: "Fidelli Motors registra que el premio se usó. El
descuento lo aplicás vos en tu caja."

**Acción principal: 1 clic.** Gating: feature `premios`.

### 2.11 · Diseño de la experiencia — `/panel/experiencia`

Lo que pinta la superficie del cliente, **con vista previa en vivo al costado** (marco de
teléfono que renderiza a 375 px reales y escala, usando los componentes públicos de verdad).

Cuatro sub-formularios: **logo** (se sube al elegir el archivo, sin botón intermedio;
validado por *magic bytes*, no por extensión — un SVG disfrazado de .png muere ahí) ·
**colores, modo y tamaño de logo** · **qué ve tu cliente en su cartón** (4 toggles) ·
**contacto de la marca**. Y solo en Ultra, el **mensaje al escanear**.

Detalle completo de cada opción en el punto 4.4.

**La hoja de calcos QR** (`/panel/experiencia/calcos`): 9 calcos de 5 × 8 cm a tamaño real
en A4, con marcas de corte, QR generado en el servidor. **Es un documento: sale siempre
claro**, tenga el tema que tenga el tenant.

> **Excepción deliberada:** sin la feature `personalizacion_pagina`, la página devuelve el
> bloqueo de plan **pero deja los calcos igual**, porque "sin esta hoja, el plan Basic queda
> mutilado: la página del cliente existe y nadie puede llegarle". Lo que diferencia a Pro y
> Ultra es el vinilo impreso, no el archivo. **Hay un bug que rompe esto en mobile** — ver 8.4.

### 2.12 · Mensajes — `/panel/mensajes`

Qué dice y con qué tono el WhatsApp que sale de "A quién llamar". Cada tenant nace con
**tres tonos de fábrica** (Cercano — activo por defecto —, Formal, Directo), sembrados
dentro de la misma transacción que crea el lubricentro.

**Dos plantillas por tono, con catálogos de variables distintos:** el mensaje de próximo
service usa `{nombre} {vehiculo} {patente} {proximo_km}`; el de **trabajo pendiente** usa
`{pendiente}` en lugar de los km, **porque avisar de kilómetros en un pendiente sería
mentirle al cliente sobre lo que se le avisa**.

**Vista previa con un vehículo real del tenant**, renderizada en una burbuja verde de
WhatsApp. Las variables se insertan donde está el cursor, y un `{nombre_cliente}` mal
tipeado se detecta antes de guardar.

**Salvaguardas:** activar uno desactiva el vigente en una transacción (si fueran dos
updates y fallara el segundo, el tenant quedaría sin mensaje activo y el botón de WhatsApp
moriría); el activo no se puede borrar; borrar pide segundo tap. **Es la única sección con
borrado real** — todo lo demás usa `activo`.

**Sin gating por plan:** la retención por WhatsApp es el corazón del producto y está en los
tres planes.

### 2.13 · Sucursales — `/panel/sucursales`

ABM sin borrado. Nombre obligatorio; dirección, teléfono y horarios opcionales (los
horarios son texto libre y se muestran en la página pública).

**Es el único límite numérico por plan del producto** (1 / 3 / sin tope). Lo hace cumplir
la base por dos caminos: la policy de alta y un trigger para el caso reactivación, **sin
bypass de superadmin a propósito**. Editar y desactivar nunca se bloquean, aunque el tenant
haya quedado por encima del tope tras un downgrade.

**La última sucursal activa no se puede apagar.**

### 2.14 · Mi cuenta — `/panel/cuenta`

Tus datos (nombre editable; email en solo lectura) · **tu marca** (nombre del lubricentro
y la URL pública con botón "Copiar", más la advertencia de que **la dirección no se puede
cambiar: es la que está impresa en los QR de las calcos**) · seguridad (cambio de
contraseña) · **tu plan** (plan, período, abono, estado, vencimiento, y **las seis features
con tilde verde o cruz gris** — lo apagado se muestra, no se esconde — más el historial de
pagos).

Es la superficie natural de upsell del producto.

### 2.15 · Marcas y modelos de vehículos

**No hay una sección `/panel/marcas`:** es un catálogo global administrado por Fidelli,
consumido desde los formularios de vehículo.

**Marcas: 34 sembradas.** Salen del dataset de transferencias de la DNRPA; medido sobre
156.813 transferencias, **el top 30 cubre el 97,69% del parque**. La cola (492 marcas) es
basura verificada y se filtró a mano, porque "un selector de 492 opciones le hace perder al
mecánico los 90 segundos que el producto promete". Alias solo inequívocos (VW, Chevy,
Citroen, Mercedes).

**Normalización por trigger:** si lo tipeado matchea el catálogo, se guarda el nombre
canónico; si no, queda exactamente como lo escribieron.

**Modelos: no hay lista y no la va a haber** (la DNRPA trae 14.207 combinaciones con la
versión pegada). El autocompletado **se aprende**: primero los del propio lubricentro,
después los del resto de la plataforma — y este segundo nivel cruza el aislamiento
multi-tenant, así que está blindado con **un piso de anonimato: un modelo global solo se
sugiere si aparece en ≥3 vehículos de ≥2 lubricentros distintos.** La función devuelve solo
strings, jamás conteos ni filas.

**Marca y modelo son ambos opcionales y ambos aceptan texto libre:** "la lista sugiere,
nunca obliga — un auto que no está en la lista y no se puede cargar rompe los 90 segundos
justo en el momento de la verdad".

**Cero logos de automotrices.** Ninguna fuente evaluada otorga licencia; la marca se
muestra como insignia tipográfica. Es el estado definitivo, no un placeholder.

---

## 3 · Qué desbloquea cada plan, según el código

**Seis features y un límite numérico.** No hay enum: el catálogo es una función SQL y las
features viven como claves de un `jsonb` en `planes.features`. La versión vigente de toda
la lógica de planes quedó en `20260822150000_planes_con_control.sql` — ninguna función fue
redefinida después.

**Precios en la base:** Basic **$39.000** · Pro **$49.000** · Ultra **$99.000** por mes,
con 25% de descuento anual. Coinciden exactamente con lo que comunica la landing.

| Feature (nombre exacto) | Basic | Pro | Ultra | Dónde se hace cumplir |
|---|:---:|:---:|:---:|---|
| `mecanica` | ✗ | ✓ | ✓ | **RLS:** `services_insercion` y `services_edicion`, condicional al tipo: `(tipo <> 'mecanica' or plan_permite('mecanica'))` · **App:** solo en el alta. **Falta en la edición** (ver 8.9) |
| `pendientes` | ✗ | ✓ | ✓ | **RLS:** `pendientes_alta` y `pendientes_edicion` · **App:** las 3 acciones + el guardado del trabajo · **Base:** el badge del sidebar no cuenta pendientes sin la feature |
| `premios` | ✗ | ✓ | ✓ | **RLS:** `premios_tenant` y `canjes_tenant` · **App:** pantalla + acción + canje dentro del trabajo. Vigilado por R1 |
| `presupuestos` | ✗ | ✓ | ✓ | **RLS:** 3 policies · **App:** las 4 pantallas bloquean, pero **ninguna Server Action lo chequea** (ver 8.10) |
| `personalizacion_pagina` | ✗ | ✓ | ✓ | **RLS:** `config_tenant` · **App:** pantalla + 3 acciones |
| `pagina_premium` | ✗ | ✗ | ✓ | **Base: un trigger, no una policy** (`tope_mensaje_escaneo`), más el filtro de lectura en `get_carton` · **App:** acción + UI. Vigilado por R11 |
| **límite** `sucursales` | **1** | **3** | **sin tope** | **RLS** + **trigger** de reactivación + validación en el alta del tenant. La app solo redacta el mensaje de error |

**Lo que Basic NO tiene es todo lo anterior.** Lo que sí tiene, y conviene decirlo porque
la landing no lo destaca: trabajos, clientes y vehículos ilimitados; **el catálogo completo
de productos con precio y stock**; la lista de a quién llamar; los mensajes de WhatsApp con
plantillas; la página del cliente con QR; y **la hoja de calcos para imprimir**.

**Tres detalles del diseño de planes:**

1. **El gating va en `WITH CHECK`, nunca en `USING`.** Se apaga la escritura, jamás la
   lectura: con `USING`, un downgrade haría *desaparecer de la pantalla* lo que el tenant
   ya tenía cargado.
2. **`plan_permite()` con un nombre desconocido lanza excepción**, no devuelve `false`. Un
   feature mal tipeado que devolviera `false` sería una función apagada para todos, en
   silencio y para siempre.
3. **Overrides por cuenta:** un superadmin puede habilitarle una feature suelta a un tenant
   (`fijar_override_plan`), con motivo de ≥10 caracteres obligatorio y auditoría. Un UPDATE
   suelto lo rechaza un trigger.

> **Ojo con los planes heredados.** `update planes set heredado = true` marcó todo lo
> previo al sistema de planes, y esos planes quedaron con **las seis features en `true` y
> sin tope de sucursales**. Un tenant heredado tiene todo habilitado.

---

## 4 · La superficie del cliente

### 4.1 · Qué ve al escanear la calco — `/[slug]`

El QR de la calco apunta a **`/[slug]`, nunca al cartón directo**. Lo que ve:

1. **La marca del lubricentro** — logo (o un círculo con sus iniciales si no hay logo) y
   el nombre.
2. **Guía de tres pasos** (texto fijo): "Escaneá el QR" · "Buscá tu patente" · "Mirá tu
   historial".
3. **El buscador de patente** — protagonista absoluto: input de 64 a 96 px de alto,
   mayúsculas por CSS, placeholder con los dos formatos (`ABC 123 · AB 123 CD`), foco
   automático, tolerante a espacios y guiones.
4. **Pie de confianza** — sucursales activas con dirección, teléfono y horarios; redes; y
   la línea del premio ("Cada N services, {descripción}").

### 4.2 · Qué ve al tipear la patente — `/[slug]/[patente]`

**Una sola llamada a `get_carton`, cero consultas adicionales.** Los bloques, en orden:

| Bloque | Qué muestra | Condición |
|---|---|---|
| **Cabecera del vehículo** | logo chico + nombre del lubri · marca y modelo (o literalmente **"Tu auto"** si no hay ninguno) · patente formateada | siempre |
| **Próximo service** | cifra grande: **"{N} km"**, y debajo "En tu último service marcaba {N} km" | solo si el último *service* tiene ambos datos |
| **El cartón en papel** | el cartón real: fecha, kilómetros, aceite tipo, aceite marca, **los 11 renglones** con ✓ (se cambió) u **OK** (se revisó y estaba bien), detalle y ×N, y la banda **PROX. SERV. KMTS.** | siempre |
| **Mensaje del taller** | el texto que escribió el lubricentro | **Ultra**, tenant activo y vigencia no vencida |
| **Recomendaciones** | "Para tener en cuenta" — notas del taller con fecha | notas marcadas visibles (**default: visible**) |
| **Pendientes** | "Recomendado por el taller" — descripción + objetivo por fecha o km | pendientes marcados visibles (**default: oculto**) |
| **Progreso de fidelización** | "Vas N de M services/trabajos", barra, y al completar: **"Tenés un premio disponible"** en dorado | tenant activo y `mostrar_fidelizacion` |
| **Historial** | lista desplegable de todos los trabajos, cada uno con su papel completo | si hay trabajos |
| **Botón de WhatsApp** | "Escribinos por WhatsApp", **nunca "pedir turno"** (no hay turnos) | **Ultra** |

**El aviso de inmutabilidad, que es el argumento de confianza de primer orden**, va en el
historial: *"Este historial no se puede editar. Pasadas las 24 horas cada trabajo queda
fijado para siempre: ni el taller que lo cargó puede cambiarlo."* Y por trabajo, un chip
con candado: **"Registro fijado"**.

**Si la patente no existe, no es un 404 ni un error:** se muestra la misma página pintada
con la marca del tenant, con el mensaje *"No encontramos esa patente — verificá que esté
bien escrita, o si es tu primera visita, tu historial se crea con tu primer service"* y un
botón de WhatsApp al lubricentro. **Que la patente no aparezca es un lead.**

**El único 404 real** es el lubricentro inexistente.

### 4.3 · Qué datos NO se muestran nunca

Verificado leyendo la función vigente entera:

1. **Ningún importe, precio ni total.** Es estructural: **no hay importes en el modelo
   operativo** — `services` y `service_items` no tienen columna de precio. Los precios
   viven solo en presupuestos y en el catálogo.
2. **Ningún dato del cliente-persona:** la función nunca consulta la tabla `clientes`. No
   salen nombre del titular, teléfono, email ni CUIT.
3. **Ningún dato de otros clientes ni de otros vehículos.**
4. **Ningún dato del operador** (quién cargó el trabajo).
5. **Notas internas** — solo las marcadas visibles.
6. **Pendientes internos** — solo los marcados visibles, y vienen **apagados por defecto**.
7. **Observaciones del service** — apagadas por defecto ("suelen ser notas internas").
8. **Trabajos anulados** y **sucursales inactivas.**
9. **IDs internos.**
10. **La fecha estimada de retorno** — existe en el panel, pero acá se excluye a propósito:
    **al cliente solo el km, nunca una fecha estimada.**
11. **El estado de retención** (vencido/urgente/próximo) y si ya se lo contactó.

### 4.4 · Qué puede personalizar el lubricentro

Todo vive en `config_experiencia`, se edita en `/panel/experiencia` (feature
`personalizacion_pagina`) y **se aplica en la base, no en el front**.

| Opción | Valores | Default |
|---|---|---|
| **Logo** | PNG/JPG/WEBP, hasta 2 MB, validado por *magic bytes* | sin logo (se muestran las iniciales) |
| **Tamaño del logo** | `normal` · `grande` · `xl` | `normal` |
| **Modo** | `claro` · `oscuro` | `claro` |
| **Color de marca** | hex libre | `#0A0A0A` |
| **Fondo de la página** | blanco, 5 tonos curados, o picker libre | blanco |
| **Papel del cartón** | blanco, 3 tonos curados, o picker libre | blanco |
| **Mensaje al escanear** | texto ≤280 caracteres + fecha de vigencia opcional | vacío — **solo Ultra** |
| **Contacto de la marca** | WhatsApp · Instagram · Facebook | vacío |

**El modo oscuro es elección del LUBRICENTRO, no del visitante** — es un campo, no
`prefers-color-scheme`. La razón está escrita tres veces en el código: un taller que
trabaja con colores oscuros quiere su página oscura **para todos** los que escanean; con la
preferencia del sistema, la mitad de sus clientes la vería clara. En el panel el copy es:
*"Lo ven así TODOS los que escanean, sin importar cómo tengan el celular."*

Corolario: **los documentos nunca van en oscuro.** El cartón sigue siendo un recibo claro
sobre el mostrador oscuro, y la hoja de calcos también.

**Los tonos de fondo y de papel solo pueden ser claros** (luminancia ≥ 0.7), rechazado en
el formulario *y* en el servidor: "el texto de la página es oscuro y tu cliente la lee al
sol". Los tonos curados son Crema, Arena, Perla, Celeste y Verde suave.

**Guarda de contraste del color de marca:** calcula la razón WCAG contra el fondo del modo
activo y muestra una muestra del botón real. **Avisa, nunca corrige en silencio** — "es su
marca y la decisión es suya".

#### `campos_visibles` — la lista completa

**Son exactamente cuatro claves.** No hay ninguna quinta en ninguna versión de la función
ni en ningún formulario.

| Clave | Default | Qué apaga |
|---|:---:|---|
| `mostrar_productos` | **✓** | la marca del aceite **y** el detalle de cada renglón |
| `mostrar_sucursal` | **✓** | en qué local se hizo cada trabajo |
| `mostrar_fidelizacion` | **✓** | el bloque de progreso del premio, entero |
| `mostrar_observaciones` | **✗** | las observaciones del trabajo |

Las **notas** y los **pendientes** no tienen flag acá a propósito: su visibilidad es **por
fila**, no por tenant.

---

## 5 · Reglas de negocio que el usuario percibe

### 5.1 · La inmutabilidad de los trabajos (la regla de 24 horas)

**Se cuentan 24 horas desde que se guardó la fila** (`created_at`), con el reloj de
Postgres. La *fecha* del trabajo —que el mecánico puede retro-fechar— no participa.

**Está implementada como policies de RLS**, no como un `if` en React:
- `services_edicion` sobre `services` (`USING` con `now() - created_at < interval '24 hours'`)
- `items_escritura` sobre `service_items` (misma condición, vía el service padre)

**Qué se puede hacer antes:** editar la cabecera (sucursal, fecha, kilómetros, aceite,
próximo service, producto, observaciones, litros; en mecánica: descripción), **agregar y
quitar renglones libremente**, y anular. **Nunca editable:** a qué vehículo pertenece, quién
lo cargó, y el tipo de trabajo.

**Después de las 24 horas se bloquea la fila entera**, no campos sueltos.

**La ventana de desbloqueo:** solo un superadmin, desde `/fidelli`, abre **24 horas fijas**
más. Queda registrado **quién** lo desbloqueó y **hasta cuándo**, se puede repetir, y el
copy del diálogo lo define bien: *"No lo corregimos nosotros: le devolvemos la posibilidad
de hacerlo."*

**Qué ve el usuario:** un badge de estado en cada trabajo (`EDITABLE 22 HS` en verde,
porque ser editable es lo normal de las primeras 24 horas, no una alarma). Cuando ya no se
puede, **los botones de editar y anular no se renderizan** —no hay botón muerto— y en su
lugar aparece: *"Registro fijado. Pasadas las 24 horas el trabajo queda fijado en el
historial y ni el lubricentro puede modificarlo — es lo que hace confiable el cartón para
tu cliente."*

Y si la ventana venció con la pantalla abierta: *"Este service se fijó mientras lo editabas:
pasaron las 24 horas y ya no se puede modificar."*

### 5.2 · `vista_proximos_service` — cómo se decide a quién llamar

**Todos los umbrales son de días.** El kilometraje entra solo como insumo para calcular el
ritmo del auto.

| Estado | Condición |
|---|---|
| **vencido** | fecha estimada **anterior a hoy − 15 días** |
| **urgente** | fecha estimada **≤ hoy + 7 días** |
| **próximo** | el resto |
| *(fuera de la lista)* | fecha estimada **> hoy + 30 días** |

Los 15 días de gracia del "vencido" existen **porque la fecha es una predicción**, no un
compromiso.

**Cómo calcula el ritmo:**

```
km por día      = (km máx − km mín) / (días entre el primero y el último service)
                = 40 km/día  ← si el auto tiene menos de 2 services
fecha estimada  = fecha del último service + (km faltantes / km por día)
```

**Cuando hay un solo service, el sistema asume 40 km/día** y marca la fila como estimación
inicial; el panel lo dice al lado de la fecha: *"estimada: 40 km/día supuestos"*.

**El filtro por tipo (una mecánica NO cuenta como último service)** está en los dos
subconjuntos que leen trabajos, y la duplicación es deliberada: sin él, una mecánica
posterior desplazaría al último service y **el auto desaparecería de la lista sin ningún
error**. Es el peor bug posible del producto —la pantalla que trae la plata se vacía sola—
y por eso lo vigila la regresión R2, que además tiene un script que rompe la vista a
propósito para verificar que la red lo atrape.

**Cómo sabe si ya se contactó:** por estado y por ciclo, no un "leído" permanente. Si
llamaste cuando estaba *próximo* y después escaló a *urgente*, la fila vuelve a encenderse.

**`security_invoker`:** la vista lo lleva obligatoriamente. Sin esa opción corre con los
permisos de su dueño y **no evalúa las policies**: un owner vería los datos de todos los
lubricentros. Ya pasó dos veces, y hay una verificación que corre en cada reset.

### 5.3 · El premio de fidelización

**No hay contadores guardados:** se calcula en vivo contra la **meta vigente**.

**Qué cuenta**, según el campo "alcance":

| Configuración | ¿Suma un service? | ¿Suma una mecánica? |
|---|:---:|:---:|
| **Solo services** (default) | sí | **no** |
| **Todos los trabajos** | sí | sí |
| *sin premio activo* | — | **no** |

Un trabajo **anulado** nunca cuenta.

La razón del campo está escrita: *"Para un lubricentro, 'cada 5 services' son cambios de
aceite. Para un taller, si la mecánica no avanza el ciclo, el programa no se dispara nunca
y parece roto."*

**El reset no es una operación: es la fila del canje.** Se cuentan solo los trabajos
posteriores al último canje del vehículo. El canje se inserta en la misma transacción que
guarda el trabajo, y hay un índice único que evita el doble registro por doble toque.

**El canje no es una pantalla:** es un toggle dentro del cartón, apagado por defecto,
porque *"aplicar el premio es una decisión del mostrador, no algo que pase solo"*. Si el
programa cuenta solo services, intentar canjear en una mecánica da: *"Tu programa de premios
cuenta solo services: el canje va en un service, no en un trabajo de mecánica."*

**Qué ve el cliente:** "Vas N de M services" con barra en el color del lubricentro, y al
completar, en dorado: **"Tenés un premio disponible: {premio}. Avisale al mecánico en tu
próxima visita."** **Sin botón de canje: el cliente ve, el mecánico ejecuta.**

### 5.4 · Qué pasa con un tenant suspendido

**La página pública SIGUE FUNCIONANDO.** Es una decisión explícita, blindada con
comentarios "NO arreglar esto" en las dos funciones públicas y vigilada por la regresión R4.
La razón: apagarla castiga al dueño del auto —que no debe nada— y **apaga de golpe todos los
calcos de ese lubricentro**, que son el activo más difícil de reconstruir del producto.

**Solo se apagan dos cosas**, por el mismo criterio de no prometer lo que el local no puede
entregar:
1. **El premio** (el bloque de fidelización viene vacío).
2. **El mensaje al escanear.**

**Sigue funcionando:** el historial completo, las notas, los pendientes, los colores, el
logo, las sucursales y el botón de WhatsApp (es canal de contacto, no promoción).

**En el panel, el owner lee pero no escribe.** Entra con sus credenciales de siempre y ve
todo. No puede: cargar ni editar trabajos, dar de alta clientes/vehículos/productos/
sucursales/mensajes, generar o editar presupuestos, cambiar el diseño ni el programa de
premios, ni registrar contactos. **Sí puede** cambiar su contraseña (es la seguridad de la
cuenta, no un dato del tenant) y **descargar e imprimir los presupuestos que ya generó**.

**Dónde se hace cumplir:** en la aplicación, con `sesionParaEscribir()` en cada Server
Action, y **la garantía de que nadie se saltee la separación es el lint**. **En RLS no
cambia nada**: a nivel base el owner suspendido podría operar, y así está decidido a
propósito ("bloquearlo ahí complicaría el desbloqueo y el histórico").

> ⚠️ **El copy de la suspensión dice lo contrario de lo que hace el código, en cinco
> lugares.** Ver 7.b.7 — es el hallazgo más accionable de este inventario.

---

## 6 · Tiempos reales: ¿los 90 segundos son holgados o justos?

### 6.1 · Campos obligatorios

**Service — tres campos obligatorios**, iguales en el cliente y en el servidor:

| Campo | ¿Obligatorio? |
|---|:---:|
| **Kilómetros** | **sí** |
| **Viscosidad del aceite** | **sí** (≥2 caracteres) |
| **Próximo service** | **sí**, pero **precargado en +10.000 km** → 0 toques |
| Fecha | no (precargada en hoy) |
| Sucursal | sí, pero siempre precargada |
| Producto de aceite, litros, los 11 renglones, premio, observaciones, pendientes | **no** — ninguno |

Un service con **cero renglones marcados** es válido en las tres capas.

**Mecánica — un solo campo obligatorio:** la descripción del trabajo (≥5 caracteres). Los
kilómetros son opcionales y el bloque de aceite no existe.

**Alta de un cliente nuevo:** Nombre y Teléfono obligatorios; email, CUIT, marca, modelo y
año, opcionales.

### 6.2 · Qué viene precargado (esto es lo que compra el tiempo)

Foco automático en la patente (abre el teclado solo) · vehículo, cliente, marca y modelo si
el auto ya pasó · **fecha = hoy** · **sucursal recordada por dispositivo** (y si hay una
sola, ni aparece el selector) · **próximo service = +10.000 km** · **litros sugeridos del
producto** · **cantidad = 1** en cada renglón · tipo = service.

**Lo que NO está precargado:** los kilómetros arrancan vacíos (el último service aparece
solo como referencia) y la viscosidad también, esto último por decisión documentada.

### 6.3 · Conteo de interacciones

| Escenario | Interacciones | Tiempo estimado | Veredicto |
|---|:---:|---|---|
| Auto conocido, mínimo | 8 taps + 13 teclas | ~27 s | holgadísimo |
| **Auto conocido, típico** (2 renglones + producto) | ~15 + scroll | **~40-45 s** | **holgado, sobra la mitad** |
| Auto conocido, service completo (5-6 renglones, observaciones, un pendiente) | ~26 | ~65-75 s | justo, pero entra |
| Auto nuevo, mínimo (sin marca/modelo) | 12 + ~38 teclas | ~55 s | entra |
| **Auto nuevo, típico** (con marca y modelo) | ~22 + ~45 teclas | **~70-85 s** | **justo, rozando el límite** |
| Auto nuevo + red lenta + cliente dictando el teléfono | ~22 | 90-120 s | **no llega** |
| **Mecánica** | 5 taps + descripción | ~30 s | el camino más barato de todos |

Atraviesa **3 navegaciones reales** (identificar → cartón → guardado) más un paso interno
de previsualización. El alta de un cliente nuevo **no agrega pantalla**: se despliega en la
misma.

### 6.4 · Veredicto

**Para el auto conocido, los 90 segundos son holgados y con margen grande** — y ése es el
caso que importa, porque el producto es de retención: a partir de la segunda visita, todos
los autos son conocidos. El diseño gasta su presupuesto de interacciones exactamente donde
debe.

**Para el alta de un auto nuevo con marca y modelo, es justo y en un mal día no llega.** El
costo está casi todo en tipeo, no en toques: nombre + teléfono son ~25 teclas irreductibles
y son obligatorios. No es un defecto de diseño —esos datos son el activo del producto—
pero tiene una consecuencia de comunicación:

> **El claim de 90 segundos es defendible como promesa del caso recurrente, no del alta.**
> Si un prospecto cronometra la primera carga de su vida, va a medir ~80 segundos y sentir
> que la promesa fue optimista. Vale la pena que el copy diga *"a partir de la segunda
> visita"* o similar, o que la demo se haga siempre con un auto ya cargado.

---

## 7 · Las dos listas

### 7.a · Existe en el producto y NO está comunicado

Ordenado por lo que más podría mover una venta.

1. **La inmutabilidad como argumento de confianza al cliente final.** El cartón le dice al
   dueño del auto: *"Este historial no se puede editar… ni el taller que lo cargó puede
   cambiarlo."* Es un diferencial fortísimo frente a la planilla y el cartón de papel
   —convierte el historial en algo con valor de reventa del auto— **y la landing no lo
   menciona en ningún lado.**
2. **La página pública sobrevive a la suspensión.** Los calcos que el lubricentro ya pegó
   siguen funcionando aunque deje de pagar. Es un argumento de tranquilidad para quien duda
   en pegar 200 calcos, y no se comunica (de hecho se comunica lo contrario, ver 7.b.7).
3. **Exportación de clientes a Excel.** Un `.xlsx` real, generado en el servidor, que
   exporta exactamente lo que el filtro muestra. **Responde de frente a la objeción "¿y si
   me quiero ir?"**, y no aparece en ninguna comunicación.
4. **El catálogo con precio y stock está en Basic.** La landing lista "Catálogo de tus
   productos" en los tres planes, pero no dice que incluye precio de venta, stock con
   mínimo y **aviso de reposición en la pantalla de Inicio**.
5. **Las notas del taller que ve el cliente** ("Para tener en cuenta"). Existe, viene
   **encendido por defecto**, y no se comunica en ningún lado.
6. **El simulador de impacto de fidelización:** antes de cambiar la meta, el panel dice
   cuántos vehículos ganarían o perderían el premio al instante. Es una pieza de producto
   muy cuidada y no se muestra nunca.
7. **La vista previa en vivo de la página del cliente**, con marco de teléfono y
   componentes reales. Es de las pantallas más vendedoras del panel.
8. **Los tres tonos de mensaje de fábrica** (Cercano, Formal, Directo) + los propios, con
   variables y **vista previa con un vehículo real del taller**. La landing dice "mensaje
   ya armado" pero no que se puede tener una biblioteca de tonos.
9. **La métrica "Recuperados este mes"** — los contactados que efectivamente volvieron
   dentro de los 30 días. Es literalmente el ROI del producto, en pantalla, y no se
   comunica.
10. **El porcentaje de escaneo de la página pública** y el conteo de **leads** (patentes
    buscadas que no son del taller: gente que escaneó la calco de un auto que no es cliente).
11. **El checklist de puesta en marcha**, que guía al tenant nuevo y muestra el dato real
    conseguido en cada paso.
12. **La corrección de patente con ventana de 72 horas** y, después, con auditoría e
    historial desde soporte.
13. **El desbloqueo de 24 horas por soporte** — la salida cuando hay un error grave en un
    trabajo ya fijado. Es la respuesta a la objeción "¿y si me equivoco?".
14. **Duplicar un presupuesto** y **generar un presupuesto desde la ficha del auto**.
15. **La descarga de presupuesto en PDF** (nueva, del 1/9/2026): vectorial, con la marca del
    lubricentro, texto seleccionable.
16. **Los modelos que se aprenden entre talleres** con piso de anonimato — un detalle de
    ingeniería que también es un argumento de "el sistema mejora solo".
17. **El acceso directo instalable por superficie** (nuevo, del 1/9/2026): el lubricentro
    puede tener el panel como app en su teléfono, y **el cliente final puede guardarse el
    cartón de su auto como ícono**, sin instalar nada.
18. **El historial de pagos y el estado de la suscripción** visibles en Mi cuenta.

### 7.b · La landing promete algo que no existe o funciona distinto

1. **"El sistema lo calcula solo y **acierta el 85% de las veces**"** — *(sección "Qué
   cambia", el número más fuerte de toda la página)*. **No hay absolutamente nada en el
   código que respalde ese 85%.** Busqué el número en todo el repo: la única aparición es
   esa misma frase de la landing. No hay medición, ni cálculo de precisión, ni tabla que
   registre aciertos. **Es el claim más riesgoso de la comunicación** y hoy no es
   verificable ni siquiera internamente.
2. **"Presupuestos… los mandás por WhatsApp desde el celular"** *(en `public/llms.txt`)* —
   **ya no es cierto desde hoy.** El botón de WhatsApp se reemplazó por "Descargar en PDF"
   e "Imprimir", justamente porque el envío directo no funcionaba. El PDF se puede adjuntar
   por WhatsApp como cualquier archivo, pero **el flujo comunicado no es el que existe**.
   `CLAUDE-landing.md` pide que `llms.txt` se actualice en el mismo PR que cambia el copy
   citado; ese paso quedó pendiente.
3. **"…y en cada uno le mandás un mensaje ya armado, **hasta tres seguimientos**"** *(en
   `llms.txt`)* — **no existe ningún tope ni conteo de tres seguimientos.** Lo que hay son
   **tres estados** (próximo, urgente, vencido) y un contacto habilitado por estado. Es
   parecido en efecto, pero el número comunicado no corresponde a nada implementado.
4. **"…te dejamos el **manual de usuario**"** *(FAQ "¿Quién me lo instala?")* — **no existe
   ningún manual en el repo.** Puede existir fuera del código, pero no pude verificarlo.
5. **"292 services cargados · 20 días de operación"** *(caso Brothers Oil)* — son números
   **estáticos, escritos a mano**. Hoy es 1 de septiembre; ese "20 días" viene del cierre de
   agosto. Envejecen solos y nadie los actualiza automáticamente.
6. **"Quedan N de 5 instalaciones presenciales en Córdoba para **Agosto 2026**"** — el mes
   está **vencido** (hoy es septiembre). Hoy el bloque **no se renderiza** porque la
   condición exige 2 cupos tomados y hay 1 cargado, así que no está a la vista — pero el
   dato quedó desactualizado en el código y volvería a aparecer mal si alguien sube el
   contador.
7. **El aviso de suspensión afirma que la página pública deja de responder — y es falso.**
   Aparece en **cinco lugares**, incluido el que lee un superadmin justo antes de suspender
   a un cliente:
   - El banner del panel del lubricentro: *"Tu página pública tampoco está respondiendo: los
     clientes que escaneen el QR no van a encontrarla."*
   - El diálogo de `/fidelli`: *"fidellimotors.app/{slug} deja de responder. Los clientes que
     escaneen el QR van a ver que la página no existe."*
   - Más un comentario en `lib/auth/session.ts`, otro en las acciones de `/fidelli`, y la
     etiqueta de la ficha del tenant.

   Por la decisión vigente (y verificada por la regresión R4), **la página responde
   perfectamente**: solo se apagan el premio y el mensaje al escanear. **Un superadmin puede
   estar tomando una decisión comercial creyendo que apagó la vidriera del cliente, y no la
   apagó.**
8. **Documentos de comunicación desactualizados que contradicen al código:**
   - `docs/landing-spec.md` describe **dos cards de precio** ($46.750/mes + instalación
     $93.500), **250 calcos**, y **"Si tenés Excel, lo migramos nosotros"** — esta última fue
     eliminada del código *por falsa*, con un comentario que lo dice. Nada de eso está
     publicado, pero el documento sigue siendo la "fuente" del copy.
   - `docs/planes.html` dice **250 y 500 calcos** (producción dice 200 y 400), **"QR en
     PDF"** (no se genera ningún PDF de calcos: es una hoja para imprimir) y **"Presupuestos
     diseñados a medida"** en Ultra (no existe: es una feature booleana única).
9. **No hay Términos ni Política de privacidad publicados**, aunque la garantía de 30 días y
   el FAQ de la baja dependen de condiciones que deberían estar escritas en algún lado. El
   pie tiene el comentario "se agregan acá el día que existan".
10. **"Cargá un trabajo en 90 segundos"** — cierto y con margen para el auto conocido;
    **justo o insuficiente para el alta de un auto nuevo** (ver punto 6.4). No es falso, pero
    conviene calificarlo.
11. **"El sistema te dice a quién le toca volver"** — cierto, con un matiz que no se
    comunica: **con un solo service cargado, la fecha estimada se calcula asumiendo 40
    km/día**. El panel es honesto y lo dice en pantalla; la landing presenta el cálculo sin
    matices.

**Lo que sí verifiqué y está bien comunicado**, para que no quede duda: los precios (39/49/99
coinciden exactos con la base), el reparto de features por plan, "sin app ni cuenta" para el
cliente final, "necesita conexión" (no hay modo offline y se admite), "no cargamos tus
clientes viejos", y el **"modo lector" tras la baja**, que sí está implementado.

---

## 8 · Inconsistencias técnicas detectadas (extra)

No las pediste, pero salieron de la lectura y afectan a la experiencia. Ninguna se tocó.

1. **El sello "Mecánica" del Inicio nunca se muestra.** El componente lo pinta a partir de
   campos que la última versión de `resumen_inicio` **dejó de emitir**. Efecto: en la lista
   de últimos trabajos del Inicio, **las mecánicas aparecen como services con "0 km"**.
2. **El filtro "Tipo" se pierde al cambiar de página** en el listado de Trabajos: la función
   que arma la URL de paginación no lo propaga.
3. **"Ver cartón" después de guardar un trabajo lleva al listado de clientes**, no al cartón
   del vehículo.
4. **En el celular, un tenant Basic pierde la entrada a su hoja de calcos.** La barra mobile
   gatea "Diseño de experiencia" por la feature; el sidebar de escritorio **deliberadamente
   no lo hace**, justamente para que Basic llegue a sus calcos. Es un fix de una línea, y
   afecta al dispositivo que usa el mecánico.
5. **Un tenant suspendido también pierde el acceso a la hoja de calcos** desde el panel
   (la pantalla entera se bloquea). A diferencia del caso anterior, esto no está comentado
   como decisión.
6. **Con el programa de fidelización sin premio activo** pero con el bloque encendido, el
   cliente puede ver *"Vas 3 de  services"* y *"Al llegar a : tu premio"* — falta una guarda
   para el caso "meta vacía".
7. **Riesgo de foco en patentes Mercosur.** La búsqueda dispara a los 6 caracteres y una
   patente Mercosur tiene 7: si el mecánico se demora entre el sexto y el séptimo, se monta
   el panel de alta y **su buscador le roba el teclado**, así que el último carácter cae en
   el campo equivocado. Cuesta ~10 segundos y toda la sensación de fluidez, justo en el
   campo más crítico del producto.
8. **La fecha del trabajo no se valida en ninguna capa.** Si se borra, el error que ve el
   usuario es el genérico "No se pudo guardar", que contradice la regla de copy del proyecto
   ("qué pasó y qué hacer").
9. **La feature `mecanica` no se chequea en la aplicación al *editar***, solo al crear. La
   base lo frena igual, pero con un error crudo en vez de un mensaje con palabras.
10. **Ninguna Server Action de presupuestos chequea la feature** (las pantallas sí). Una
    llamada directa la frena solo la base. Está comentado como decisión, pero rompe el patrón
    de las otras features.
11. **La regla de 24 horas es la única de las cuatro reglas grandes sin regresión** que la
    vigile en `verificaciones.sql`.
12. **Una búsqueda exitosa registra dos filas de lead**, no una (se llama a la función dos
    veces: una para verificar que el auto existe y otra al renderizar). Infla el conteo de
    escaneos.
13. **Código muerto:** `components/experiencia/preview-celular.tsx` no está importado por
    ninguna pantalla.
14. **La sucursal se recuerda por dispositivo** (cookie), no por usuario. Con dos sucursales
    y una sola cuenta, el celular equivocado etiqueta trabajos en el local equivocado y nada
    avisa.
15. **No hay límite de intentos sobre la patente** en la superficie pública. Está documentado
    en el código como backlog consciente, con la definición de producto pendiente.

---

## Archivos consultados

**Documentación del proyecto**
`CLAUDE.md` · `CLAUDE-landing.md` · `CONTRIBUTING.md` · `docs/landing-spec.md` ·
`docs/planes.html` · `docs/inventario-2026-08-22.md` · `public/llms.txt`

**Superficies y layouts**
`app/layout.tsx` · `app/(landing)/layout.tsx` · `app/(landing)/page.tsx` ·
`app/panel/layout.tsx` · `app/fidelli/layout.tsx` · `app/(cliente)/layout.tsx` ·
`proxy.ts` · `lib/supabase/proxy.ts` · `app/robots.ts` · `app/manifest.ts`

**Panel — operación**
`app/panel/page.tsx` · `app/panel/services/page.tsx` · `app/panel/services/nuevo/page.tsx` ·
`app/panel/services/nuevo/actions.ts` · `app/panel/services/nuevo/[vehiculoId]/page.tsx` ·
`app/panel/services/nuevo/[vehiculoId]/actions.ts` · `app/panel/services/[serviceId]/page.tsx` ·
`.../editar/page.tsx` · `.../editar/actions.ts` · `.../guardado/page.tsx` ·
`app/panel/proximos/page.tsx` · `app/panel/proximos/actions.ts` ·
`app/panel/clientes/page.tsx` · `app/panel/clientes/[id]/page.tsx` ·
`app/panel/clientes/exportar/route.ts`

**Panel — negocio y configuración**
`app/panel/presupuestos/**` · `app/panel/productos/page.tsx` + `actions.ts` ·
`app/panel/fidelizacion/page.tsx` + `actions.ts` · `app/panel/experiencia/page.tsx` +
`actions.ts` · `app/panel/experiencia/calcos/page.tsx` · `app/panel/mensajes/**` ·
`app/panel/sucursales/**` · `app/panel/cuenta/**` · `app/panel/vehiculos/actions.ts` ·
`app/panel/pendientes/actions.ts` · `app/panel/notas/actions.ts`

**Panel interno**
`app/fidelli/page.tsx` · `app/fidelli/actions.ts` · `app/fidelli/[id]/page.tsx` +
`actions.ts` · `app/fidelli/precios/**` · `app/fidelli/nuevo/**` ·
`components/fidelli/ficha/*`

**Superficie del cliente**
`app/(cliente)/[slug]/page.tsx` · `app/(cliente)/[slug]/actions.ts` ·
`app/(cliente)/[slug]/[patente]/page.tsx` · `app/(cliente)/[slug]/not-found.tsx` ·
`components/cliente/*` · `components/services/carton-papel.tsx` · `lib/cliente/landing.ts` ·
`lib/cliente/carton.ts` · `lib/cliente/tema.ts` · `lib/cliente/color.ts`

**Componentes clave**
`components/panel/sidebar.tsx` · `components/panel/barra-mobile.tsx` ·
`components/panel/bloqueo-plan.tsx` · `components/panel/bloqueo-suspension.tsx` ·
`components/panel/aviso-suspension.tsx` · `components/services/carton.tsx` ·
`components/services/campos-carton.tsx` · `components/services/identificar-vehiculo.tsx` ·
`components/services/panel-alta.tsx` · `components/inicio/dashboard.tsx` ·
`components/inicio/checklist.tsx` · `components/proximos/*` ·
`components/presupuestos/*` · `components/productos/*` ·
`components/fidelizacion/formulario-premio.tsx` · `components/experiencia/*` ·
`components/vehiculos/campos-marca-modelo.tsx` · `components/landing/*`

**Librerías**
`lib/auth/session.ts` · `lib/planes.ts` · `lib/planes-landing.ts` · `lib/servicios.ts` ·
`lib/contacto.ts` · `lib/renglones.ts` · `lib/presupuestos.ts` · `lib/fidelizacion.ts` ·
`lib/texto.ts` · `lib/seo.ts` · `lib/landing.ts` · `lib/preferencias.ts` · `lib/pwa.ts` ·
`eslint.config.mjs`

**Migraciones citadas** (de las 60 de `supabase/migrations/`)
`20260723171645_extensiones_y_enums` · `20260723172154_tablas_plataforma` ·
`20260723210634_tablas_configuracion` · `20260723211241_tablas_operacion` ·
`20260723212016_tablas_registro` · `20260723213843_funciones_y_triggers` ·
`20260723214743_vista_proximos_service` · `20260723215350_rls_multi_tenant` ·
`20260724034535_fix_km_por_dia_division_cero` ·
`20260724190142_fix_vista_proximos_security_invoker` ·
`20260724193320_revocar_privilegios_por_defecto_anon` ·
`20260724221336_revocar_execute_de_public` · `20260725013000_get_landing` ·
`20260725120000_actualizar_service` · `20260726020000_verificar_seguridad_vistas` ·
`20260726210000_ficha_tenant` · `20260728050000_templates_por_defecto` ·
`20260728140000_colores_experiencia` · `20260729120000_notas_vehiculo` ·
`20260813000000_slugs_publicos` · `20260813120000_timezone_argentina` ·
`20260822150000_planes_con_control` · `20260822210000_trabajos_mecanicos` ·
`20260823100000_estado_contacto_pendiente` · `20260823101000_trabajos_pendientes` ·
`20260823120000_presupuestos` · `20260823140000_productos_precio_stock` ·
`20260823160000_marcas_vehiculo` · `20260823200000_superficie_cliente` ·
`20260823210000_cierre_sprint` · `20260823230000_precio_basic` ·
`20260828120000_contactos_por_hacer`
Más `supabase/verificaciones.sql` y `scripts/regresion-retencion.sh`.

**Esquema en vivo**
Se consultó la base local (Docker) para listar tablas, vistas y funciones vigentes: 26
tablas, 4 vistas y 77 funciones en `public`.

---

*Inventario de producto · Fidelli Motors · 1 de septiembre de 2026 · rama `main` en `ab03fd8`.
Lo que no se pudo verificar está marcado como tal y no se completó con supuestos.*

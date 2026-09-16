# Relevamiento técnico · Módulo Gomería / Neumáticos

> **Qué es este documento.** Un relevamiento del estado del repo previo a diseñar el
> módulo de neumáticos. No es una especificación ni un plan de implementación: describe
> lo que hay hoy, con archivos y líneas, y marca explícitamente lo que no existe.
>
> **Alcance de la lectura.** Todo salió de `origin/main` en el commit `fc84d14`
> (64 migraciones), más consultas de solo lectura contra la base local, que está al día
> con `main` (última migración aplicada: `20260909180000`).
>
> **Fecha:** 2026-09-11.

---

## El módulo que se está evaluando

Fidelli Motors va a sumar un tipo de trabajo nuevo, **Neumáticos** (gomería: venta y
colocación de cubiertas, rotación, balanceo, alineación, reparación de pinchaduras), que
va a convivir con los dos que ya existen (services y trabajos mecánicos).

Características que condicionan el diseño:

- Es un **módulo pago opcional por tenant, independiente del plan**: un taller lo tiene
  habilitado solo si lo pagó, y algunos lo van a tener bonificado.
- Tiene **campos propios**: una fila por rueda, con posición, marca, medida, DOT y
  profundidad de dibujo.
- Genera **sus propias fechas de retorno**: rotación cada 8.000–10.000 km, alineación
  cada 10.000 km o un año, reajuste de tuercas a los 100 km, recambio por antigüedad a
  los 6 años del DOT.
- Tiene que **verse en la página pública del cliente** igual que los otros trabajos, con
  su etiqueta.

---

# 1 · Tipos de trabajo

**Una sola tabla, una columna enum.** No hay tabla de tipos ni tablas separadas. El enum
nació en `supabase/migrations/20260822210000_trabajos_mecanicos.sql:41`:

```sql
create type tipo_trabajo as enum ('service', 'mecanica');

alter table services
  add column tipo tipo_trabajo not null default 'service',
  add column trabajo_descripcion text;
```

Los dos tipos comparten `services` y comparten `service_items`. La decisión está
argumentada en el encabezado de esa misma migración, líneas 18 a 29, y es la restricción
de diseño más fuerte que vas a encontrar:

```
-- LA DECISIÓN DE MODELO (renglones libres): se EXTIENDE service_items en
-- vez de crear una tabla propia. item_tipo pasa a nullable y la línea
-- libre usa `detalle`, que ya existía. El criterio fue uno solo: el
-- historial del vehículo tiene que salir de UNA fuente — la página del
-- cliente es el activo del producto y su línea de tiempo no puede
-- armarse uniendo dos consultas.
```

La obligatoriedad de los campos se condicionó por tipo en vez de aflojarse, con dos CHECK
(`20260822210000:64` y `:74`):

```sql
alter table services add constraint service_completo check (
  tipo <> 'service' or (
    kilometros is not null and aceite_tipo is not null
    and prox_service_km is not null and trabajo_descripcion is null
  )
);

alter table services add constraint mecanica_coherente check (
  tipo <> 'mecanica' or (
    trabajo_descripcion is not null
    and char_length(trim(trabajo_descripcion)) >= 5
    and aceite_tipo is null and prox_service_km is null
    and aceite_producto_id is null and aceite_nombre is null
  )
);
```

## Cómo se asocian los productos

Hay **dos caminos distintos**, y esto importa para el diseño.

El primero es `service_items`, que es la tabla intermedia real. Columnas vigentes según la
base:

| Columna | Tipo | De dónde sale |
|---|---|---|
| `id` | uuid | `20260723211241:109` |
| `service_id` | uuid, `on delete cascade` | idem |
| `lubricentro_id` | uuid | idem |
| `item_tipo` | enum `item_tipo`, **nullable** | nullable desde `20260822210000:91` |
| `producto_id` | uuid, `on delete set null` | `20260723211241:114` |
| `detalle` | text | idem |
| `cambiado` | boolean not null default true | `20260728130000:25` |
| `cantidad` | numeric(10,2) not null default 1 | `20260823140000:99` |
| `created_at` | timestamptz | `20260723211241:116` |

El segundo camino es la cabecera: **el aceite de motor no es un ítem**. Vive en
`services.aceite_producto_id`, `services.aceite_nombre` y `services.aceite_litros`. Es un
snapshot, para que el cartón siga diciendo qué aceite le pusieron aunque después borren el
producto del catálogo.

El stock se descuenta dentro de `guardar_service`, en dos lugares distintos por eso mismo
(`20260902120000_stock_aceite_por_unidad.sql:114` para el aceite, `:154` para cada
renglón):

```sql
    if v_producto is not null then
      update productos set stock = stock - v_cantidad
      where id = v_producto and lubricentro_id = v_lubricentro
        and stock is not null;
    end if;
```

Un dato que sirve: **la categoría `neumatico` ya existe en el catálogo de productos**, con
orden 6, en `categorias_producto`. La sembró
`20260823140000_productos_precio_stock.sql:48`. O sea que el lubricentro ya puede cargar
cubiertas como producto con precio y stock; lo que no existe es el trabajo que las
consume.

El catálogo completo de categorías, leído de la base:

| clave | nombre | plural | orden |
|---|---|---|---|
| `aceite` | Aceite | Aceites | 1 |
| `filtro` | Filtro | Filtros | 2 |
| `liquido` | Líquido | Líquidos | 3 |
| `aditivo` | Aditivo | Aditivos | 4 |
| `repuesto` | Repuesto | Repuestos | 5 |
| `neumatico` | Neumático | Neumáticos | 6 |
| `bateria` | Batería | Baterías | 7 |
| `accesorio` | Accesorio | Accesorios | 8 |
| `otro` | Otro | Otros | 9 |

## La recomendación de modelo

Las tres opciones con su costo y su riesgo, y después la elegida.

### Columna JSON de detalle en `services`

Es la más barata en líneas, unas 150 de migración y cero cambios estructurales. Es la que
descartaría igual. Los datos por rueda son cinco campos con reglas propias (el DOT tiene
formato, la profundidad tiene rango, la posición es un conjunto cerrado), y un jsonb no da
ninguna de esas garantías. Peor: no se puede enganchar `producto_id`, así que el neumático
colocado no descuenta stock ni aparece en la exportación, y la búsqueda por medida o por
antigüedad de DOT —que es justo lo que dispara el recambio a los seis años— queda fuera de
alcance. Este proyecto ya tiene escrita la regla contraria en el CLAUDE.md, sobre que las
reglas de negocio viven en la base.

### Filas por rueda en `service_items`, agregando una columna `posicion`

Parece la de menos código porque reusa la tabla, y es la que más riesgo silencioso tiene.
Choca contra dos cosas. Una es el índice único de `20260723211241:120`:

```sql
create unique index service_items_unico on service_items(service_id, item_tipo);
```

Con `item_tipo` cargado, cuatro ruedas del mismo trabajo colisionan. Se puede esquivar
dejando `item_tipo` en NULL, porque los NULL no chocan entre sí, pero entonces las ruedas
quedan indistinguibles de los renglones libres de mecánica, que es exactamente el criterio
que hoy usa `lib/cliente/carton.ts:271` para armar el papel. La otra es que `item_tipo` es
el enum de los once renglones del cartón físico, y meterle valores nuevos contamina
`lib/renglones.ts`, el orden impreso del papel, la exportación a Excel y `get_carton`.

### Tabla satélite, una fila por rueda — **la recomendada**

En esta forma concreta: el tipo nuevo entra en el enum `tipo_trabajo`, de modo que la
línea de tiempo del vehículo sigue siendo `services` y nada más, y los datos por rueda van
en una tabla nueva con FK al service, con la posición como enum propio y con `producto_id`
para enganchar el catálogo y el descuento de stock. No se toca `service_items` ni
`item_tipo`.

Esto respeta la regla que la migración de mecánica dejó escrita: que el historial del
cliente salga de una sola fuente. `get_carton` sigue trayendo un solo array `services`, la
regla de 24 horas sigue aplicando sobre la misma fila, y el RLS por tenant que ya existe
sobre `services` cubre la cabecera sin una policy más. La tabla satélite necesita su propia
policy, igual que `trabajos_pendientes` y `presupuesto_items` en su momento.

El costo, calibrado contra lo que costaron los bloques comparables en este repo:

| Bloque | Migración | Commit completo |
|---|---|---|
| Mecánica, solo base (`82b7c47`) | 1.193 líneas | 1.461 inserciones, 4 archivos |
| Mecánica, panel y cliente (`03e7d2f`) | 163 líneas más | 1.067 inserciones, 27 archivos |
| Trabajos pendientes, todo (`a9fc974`) | 600 líneas | 2.015 inserciones, 25 archivos |
| Presupuestos, todo (`534412d`) | 280 líneas | 1.864 inserciones, 19 archivos |

## Las dos trampas de agregar un tercer valor al enum

Esto es lo más importante del relevamiento, y no es obvio leyendo el código por encima.

### Los CHECK existentes admiten el tipo nuevo sin decir nada

Están escritos como `tipo <> 'service' or (...)` y `tipo <> 'mecanica' or (...)`. Para una
fila con `tipo = 'neumaticos'`, las dos premisas son verdaderas y los dos CHECK pasan de
largo. Una fila de neumáticos podría entrar con viscosidad de aceite cargada y descripción
de mecánica al mismo tiempo, y la base no se queja. **Hace falta un tercer CHECK
explícito.**

### El gating por plan también lo admite

La policy de `20260822210000:118` dice:

```sql
alter policy services_insercion on services
  with check (
    (lubricentro_id = mi_lubricentro_id()
      and (tipo <> 'mecanica' or plan_permite('mecanica')))
    or soy_superadmin()
  );
```

El mismo razonamiento: con `tipo = 'neumaticos'` la condición del plan ni se evalúa. El
día que se agregue el valor al enum, **cualquier tenant puede cargar trabajos de
neumáticos aunque no haya pagado el módulo**, y por la API directa también. Es la puerta
abierta que hay que cerrar en la misma migración, en las dos policies: inserción y
edición.

---

# 2 · Cálculo de retorno

La vista vigente es la de `20260822210000_trabajos_mecanicos.sql:141`. Ninguna migración
posterior la redefine (confirmado contra la base). Esta es completa:

```sql
create or replace view vista_proximos_service as
with ultimo as (
  select distinct on (s.vehiculo_id)
    s.vehiculo_id, s.id as service_id, s.fecha, s.kilometros,
    s.prox_service_km, s.sucursal_id, s.lubricentro_id
  from services s
  where not s.anulado and s.tipo = 'service'
  order by s.vehiculo_id, s.fecha desc, s.created_at desc
),
ritmo as (
  select s.vehiculo_id,
    count(*) as cantidad_services,
    max(s.kilometros) - min(s.kilometros) as km_recorridos,
    greatest(max(s.fecha) - min(s.fecha), 1) as dias_transcurridos
  from services s
  where not s.anulado and s.tipo = 'service'
  group by s.vehiculo_id
),
calculo as (
  select u.lubricentro_id, u.vehiculo_id, u.service_id as ultimo_service_id,
    u.fecha as ultimo_service_fecha, u.kilometros as ultimo_service_km,
    u.prox_service_km, u.sucursal_id, r.cantidad_services,
    case
      when r.cantidad_services >= 2 and r.km_recorridos > 0
        then round(r.km_recorridos::numeric / r.dias_transcurridos, 2)
      else 40
    end as km_por_dia,
    (r.cantidad_services < 2 or r.km_recorridos = 0) as estimacion_inicial
  from ultimo u join ritmo r on r.vehiculo_id = u.vehiculo_id
),
proyeccion as (
  select c.*,
    greatest(c.prox_service_km - c.ultimo_service_km, 0) as km_faltantes,
    (c.ultimo_service_fecha
      + (greatest(c.prox_service_km - c.ultimo_service_km, 0) / c.km_por_dia)::integer
    )::date as fecha_estimada
  from calculo c
),
clasificado as (
  select p.*,
    case
      when p.fecha_estimada < current_date - 15 then 'vencido'::estado_contacto
      when p.fecha_estimada <= current_date + 7 then 'urgente'::estado_contacto
      else 'proximo'::estado_contacto
    end as estado
  from proyeccion p
)
select
  c.lubricentro_id, c.vehiculo_id, v.patente, v.patente_normalizada,
  v.marca, v.modelo, cl.id as cliente_id, cl.nombre as cliente_nombre,
  cl.telefono as cliente_telefono, c.ultimo_service_id, c.ultimo_service_fecha,
  c.ultimo_service_km, c.prox_service_km, c.km_faltantes, c.sucursal_id,
  suc.nombre as sucursal_nombre, c.cantidad_services, c.km_por_dia,
  c.estimacion_inicial, c.fecha_estimada,
  (c.fecha_estimada - current_date) as dias_hasta, c.estado,
  exists (
    select 1 from contactos co
    where co.vehiculo_id = c.vehiculo_id
      and co.estado = c.estado
      and co.created_at > c.ultimo_service_fecha
  ) as contactado
from clasificado c
join vehiculos v on v.id = c.vehiculo_id
join clientes cl on cl.id = v.cliente_id
join sucursales suc on suc.id = c.sucursal_id
where c.fecha_estimada <= current_date + 30;

alter view vista_proximos_service set (security_invoker = on);
```

## De dónde sale cada cosa

- **El próximo service es una columna guardada**, `services.prox_service_km`, que escribe
  el mecánico a mano. Ninguna función la deriva del producto ni del vehículo.
- **Los kilómetros por día se derivan enteros en la vista**, del historial del propio auto,
  con default de 40 cuando hay un solo service.
- **La fecha estimada es división pura.** No hay nada materializado.

## Los tres estados

Están en los dos lados, con roles distintos. La clasificación vive en la vista, en el CTE
`clasificado`, con umbrales de quince días vencido, siete días urgente y treinta días de
ventana. El código no reclasifica: `lib/contacto.ts:5` solo tipa el enum, y
`app/panel/(tras-onboarding)/proximos/page.tsx:23` le pone peso para ordenar la pantalla.

## Qué se rompe con varias fechas de retorno en paralelo

Sí: **la vista asume una sola fecha por vehículo**. El `distinct on (s.vehiculo_id)` del
CTE `ultimo` garantiza exactamente una fila por auto, y todo lo de abajo cuelga de esa
fila.

Pero eso ya se resolvió una vez y hay un camino trillado. Los trabajos pendientes son una
segunda fuente de retorno que corre en paralelo, con su propia vista `vista_pendientes`
(`20260823101000_trabajos_pendientes.sql:102`), keyeada por `pendiente_id` y no por
vehículo, deliberadamente con el mismo contrato de columnas. El comentario de la vista lo
dice: se armó *"con el contrato de columnas de vista_proximos_service para unirse en la
página"*.

La unión pasa **en el servidor, no en SQL**:

- `proximos/page.tsx:81` — las dos consultas en paralelo dentro de un `Promise.all`.
- `proximos/page.tsx:154` — los pendientes se mapean al mismo tipo `ProximoServicio`.
- `proximos/page.tsx:201` — `const todas = [...filas, ...filasPendientes];` y el sort por
  peso de estado y fecha estimada.
- `contactos_por_hacer()` (`20260828120000:36`) — el badge del sidebar suma las dos
  fuentes, con la feature del plan como condición de la segunda.

Ese es el molde exacto para neumáticos.

### El anti-spam colisiona

La clave es el par vehículo + estado, en la tabla `contactos` (`20260723212016:30`). Para
los pendientes se agregó un cuarto valor al enum `estado_contacto`, en su propia migración
porque Postgres no deja usar un valor de enum en la misma transacción que lo crea
(`20260823100000_estado_contacto_pendiente.sql`). El comentario de `vista_pendientes:180`
reconoce la limitación que eso deja:

```sql
  -- El anti-spam del pendiente: un contacto por motivo 'pendiente'
  -- POSTERIOR a que el pendiente se anotó. Por vehículo, a propósito:
  -- dos pendientes del mismo auto se avisan en el mismo WhatsApp.
  exists (
    select 1 from contactos co
    where co.vehiculo_id = c.vehiculo_id
      and co.estado = 'pendiente'
      and co.created_at > c.created_at
  ) as contactado
```

Si la rotación de cubiertas y la alineación tienen que poder avisarse por separado, con
este esquema no se puede: avisar por una marca la otra como contactada. Hay dos salidas, y
la elección es de producto más que técnica:

1. Agregar un valor de enum por motivo, que no escala bien.
2. Ponerle a `contactos` una columna de motivo real, que es un cambio chico pero toca la
   clave del anti-spam y la vista de pendientes.

## Los mensajes de WhatsApp

Sí, asumen que el motivo es un service, y ya se tuvo que romper ese supuesto una vez. La
tabla `mensaje_templates` (`20260723210634:28`) tiene `tono`, `contenido` y `activo`, con
un único template activo por lubricentro (índice único parcial en `:40`). Cuando llegaron
los pendientes se le agregó una segunda columna de contenido en vez de una fila nueva
(`20260823101000:206`):

```sql
alter table mensaje_templates add column contenido_pendiente text;
```

Los tres tonos por defecto están en `sembrar_templates()`,
`20260728050000_templates_por_defecto.sql:47`. Textos literales de la columna de services:

> **Cercano.** "Hola {nombre}! Te escribimos de [nombre del lubri]. Tu {vehiculo}
> ({patente}) está cerca de los {proximo_km} km del próximo service. ¿Coordinamos un
> turno?"
>
> **Formal.** "Estimado/a {nombre}: le recordamos que su vehículo {vehiculo}, patente
> {patente}, se aproxima al service programado en {proximo_km} km. Quedamos a disposición
> para agendar el turno."
>
> **Directo.** "{nombre}, tu {vehiculo} necesita service en {proximo_km} km. Escribinos y
> te damos turno."

Y el tono Cercano de la columna de pendientes, para ver el patrón:

> "Hola {nombre}! Te escribimos de [nombre del lubri]. Cuando trajiste tu {vehiculo}
> ({patente}) quedó pendiente: {pendiente}. ¿Coordinamos un turno para resolverlo?"

Las cuatro variables disponibles son `nombre`, `vehiculo`, `patente` y `proximo_km`, y el
catálogo canónico está en `lib/contacto.ts:85`. Los pendientes tienen su propio juego, con
`pendiente` en lugar de `proximo_km` (`lib/contacto.ts:72`), justamente porque hablar de
kilómetros del próximo service ahí sería mentira. Neumáticos va a necesitar lo mismo: una
tercera columna de contenido y su propio catálogo de variables, probablemente con la
posición y la medida de la cubierta.

---

# 3 · Planes, funciones y gating

**Hay una arquitectura de features seria, en dos capas, y funciona.** Se construyó en
`20260822150000_planes_con_control.sql`, 806 líneas. El catálogo canónico es una función
de SQL (`:51`):

```sql
create or replace function catalogo_features_plan()
returns text[] language sql immutable as $$
  select array[
    'mecanica', 'pendientes', 'premios',
    'presupuestos', 'personalizacion_pagina', 'pagina_premium'
  ];
$$;
```

Y tiene un espejo tipado en `lib/planes.ts:16`, que existe para que un nombre inventado no
compile. El encabezado de la migración deja claro quién gana: si divergen, manda la base.

La resolución es de tres escalones, en `feature_de_tenant()` (`:343`):

```sql
  -- 1 · el override del tenant, si la clave está
  select plan_overrides -> p_feature into v_valor
  from lubricentros where id = p_lubricentro;

  if jsonb_typeof(v_valor) = 'boolean' then
    return v_valor = 'true'::jsonb;
  end if;

  -- 2 · el plan de la suscripción vigente
  select p.features -> p_feature into v_valor
  from suscripciones s
  join planes p on p.id = s.plan_id
  where s.lubricentro_id = p_lubricentro
  order by s.inicio desc, s.created_at desc
  limit 1;

  if jsonb_typeof(v_valor) = 'boolean' then
    return v_valor = 'true'::jsonb;
  end if;

  -- 3 · sin dato — tenant sin suscripción o plan sin la clave — cerrado.
  return false;
```

`plan_permite()` (`:425`) es la capa pública, y **revienta con una feature desconocida** en
vez de devolver false:

```sql
  if not feature_plan_valida(p_feature) then
    raise exception 'feature_desconocida: %', p_feature
      using hint = 'El catálogo vive en feature_plan_valida() y su espejo en lib/planes.ts.';
  end if;
  return feature_de_tenant(mi_lubricentro_id(), p_feature);
```

## El gating está en los dos lados

En la base, las policies llaman a `plan_permite()`. En la aplicación, `featureHabilitada()`
de `lib/auth/session.ts:100` lee lo que ya vino resuelto con la sesión, vía
`plan_capacidades()` (`20260822150000:497`), que arma el jsonb recorriendo el catálogo.
Cero consultas extra.

### Inventario completo · SQL

| Migración | Qué gatea |
|---|---|
| `20260822150000:600` y `:648` | alta y reactivación de sucursales, contra el límite |
| `20260822150000` (policies de premios) | escritura de `premios` |
| `20260822150000` (policy de experiencia) | `personalizacion_pagina` |
| `20260822210000:118` y `:130` | inserción y edición de `services`, condicional al tipo |
| `20260823101000` (tres policies) | `trabajos_pendientes` |
| `20260823120000` (tres policies) | `presupuestos` |
| `20260828120000:36` | el conteo del badge suma pendientes solo con la feature |

### Inventario completo · TypeScript

Veintitrés llamadas a `featureHabilitada`:

```
app/panel/layout.tsx:37
app/panel/(tras-onboarding)/experiencia/page.tsx:37 y :93
app/panel/(tras-onboarding)/page.tsx:73
app/panel/(tras-onboarding)/fidelizacion/page.tsx:37
app/panel/(tras-onboarding)/proximos/page.tsx:42
app/panel/(tras-onboarding)/pendientes/actions.ts:33, :72, :95
app/panel/(tras-onboarding)/clientes/[id]/page.tsx:23 y :24
app/panel/(tras-onboarding)/presupuestos/[id]/page.tsx:45
app/panel/(tras-onboarding)/presupuestos/[id]/editar/page.tsx:33
app/panel/(tras-onboarding)/presupuestos/nuevo/page.tsx:41
app/panel/(tras-onboarding)/presupuestos/page.tsx:26
app/panel/(tras-onboarding)/services/nuevo/[vehiculoId]/actions.ts:91, :102, :114
app/panel/(tras-onboarding)/services/nuevo/[vehiculoId]/page.tsx:80, :84, :125, :190
lib/auth/session.ts:157
```

Seis acciones que declaran la feature en `sesionParaEscribir()`:

```
app/panel/onboarding/actions.ts:58                       → "premios"
app/panel/(tras-onboarding)/experiencia/actions.ts:28    → "personalizacion_pagina"
app/panel/(tras-onboarding)/experiencia/actions.ts:169   → "personalizacion_pagina"
app/panel/(tras-onboarding)/experiencia/actions.ts:236   → "pagina_premium"
app/panel/(tras-onboarding)/experiencia/actions.ts:277   → "personalizacion_pagina"
app/panel/(tras-onboarding)/fidelizacion/actions.ts:21   → "premios"
```

## ¿Un Basic puede crear un trabajo mecánico por la API a mano?

**No.** El RLS lo rechaza, y hay una prueba de regresión que lo verifica en cada
`supabase db reset`. Es R3, en `supabase/verificaciones.sql:213`:

```sql
    raise exception 'REGRESIÓN 2A: un Basic cargó una mecánica — el gating por tipo no rige.';
```

## ¿Existe la noción de add-on?

**Existe a medias, y es mejor de lo esperado.** `lubricentros.plan_overrides` es un jsonb
por tenant con tres estados por clave, agregado en `20260822150000:176`:

```sql
alter table lubricentros
  add column plan_overrides jsonb not null default '{}'::jsonb;
```

True habilita, false deshabilita, y la clave ausente cae al plan. Eso ya es,
funcionalmente, un interruptor por tenant independiente del plan. Y viene con tres cosas
que normalmente hay que construir:

### Tiene auditoría propia

`cambios_override_plan` (`:190`):

```sql
create table cambios_override_plan (
  id                uuid primary key default gen_random_uuid(),
  lubricentro_id    uuid not null references lubricentros(id) on delete restrict,
  overrides_antes   jsonb not null,
  overrides_despues jsonb not null,
  motivo            text not null,
  cambiado_por      uuid not null references usuarios(id) on delete restrict,
  created_at        timestamptz not null default now(),
  constraint motivo_con_sustancia check (char_length(trim(motivo)) >= 10)
);
```

### Tiene candado

Un trigger, `bloquear_override_directo()` (`:216`), impide tocar la columna con un UPDATE
suelto. Solo se cambia por `fijar_override_plan()` (`:263`), que exige superadmin, exige
motivo de al menos diez caracteres y deja el registro. Usa un GUC transaccional
(`set_config('fidelli.override_de_plan', 'si', true)`), así que no importa por qué puerta
se intente: panel, API con la clave del tenant, o un script.

### Tiene interfaz

El formulario está en `components/fidelli/ficha/form-overrides.tsx:44`, con los tres
estados, y la pestaña de suscripción de la ficha muestra las últimas ocho filas del log.

## Lo que le falta para ser un módulo pago

Tres cosas, ninguna estructural:

1. **No tiene fechas.** El jsonb es plano, un booleano por clave. No hay alta, no hay baja,
   no hay vigencia. Un módulo que se da de baja hoy simplemente deja de estar, y el log
   dice cuándo se cambió pero la consulta de "quiénes lo tienen desde cuándo" hay que
   armarla reconstruyendo el historial.
2. **No distingue pago de bonificado.** Y eso no es cosmético: si el módulo se cobra,
   alguien tiene que saber a quién facturarle.
3. **No tiene precio ni llega a la facturación.** `suscripciones` (`20260723172154:74`) es
   una fila por período con un solo `plan_id`, y `pagos` (`:94`) registra transferencias
   contra esa suscripción. No hay concepto de renglón de factura ni de extra. Un módulo
   pago hoy se cobraría por fuera del sistema, o subiéndole el descuento o el plan, que es
   exactamente lo que no se quiere.

Las tablas de facturación, para referencia:

```sql
create table suscripciones (
  id              uuid primary key default gen_random_uuid(),
  lubricentro_id  uuid not null references lubricentros(id) on delete restrict,
  plan_id         uuid not null references planes(id) on delete restrict,
  estado          estado_suscripcion not null default 'trial',
  periodo         periodo_suscripcion not null default 'mensual',
  descuento_pct   numeric(5,2) not null default 0 check (descuento_pct between 0 and 100),
  inicio          date not null default current_date,
  vencimiento     date not null,
  created_at      timestamptz not null default now(),
  constraint vencimiento_posterior check (vencimiento >= inicio)
);

create table pagos (
  id              uuid primary key default gen_random_uuid(),
  lubricentro_id  uuid not null references lubricentros(id) on delete restrict,
  suscripcion_id  uuid not null references suscripciones(id) on delete restrict,
  registrado_por  uuid not null references usuarios(id) on delete restrict,
  periodo_desde   date not null,
  periodo_hasta   date not null,
  monto           numeric(12,2) not null check (monto >= 0),
  fecha_pago      date not null,
  created_at      timestamptz not null default now(),
  constraint periodo_valido check (periodo_hasta >= periodo_desde)
);
```

## Qué haría falta para el interruptor pedido

La mitad ya está y no habría que reescribirla. Lo mínimo, en orden:

1. **Un valor nuevo en `catalogo_features_plan()`** y su espejo en `lib/planes.ts`,
   llamémoslo `neumaticos`. Con eso solo, el interruptor por tenant ya funciona en las tres
   capas, porque `plan_permite()` lo resuelve, las policies lo consultan y la sesión lo
   trae. Es una migración de unas cincuenta líneas más el espejo.
2. **Una tabla nueva** para lo que el jsonb no puede sostener, con `lubricentro_id`, la
   clave del módulo, `desde`, `hasta` nullable, un booleano de bonificado y el motivo. Y
   `feature_de_tenant()` pasa a consultarla como escalón cero, antes del override. Ojo con
   un detalle: esa función es `stable security definer` y la llama cada policy en cada
   escritura, así que la consulta tiene que resolverse por índice.
3. **En `/fidelli`, un formulario propio** en la ficha del tenant, al lado del de
   overrides, con la fecha y el motivo. La acción sería hermana de `fijarOverridePlan` de
   `app/fidelli/[id]/actions.ts:181`.
4. **Las dos policies de `services`** hay que corregirlas igual, aunque el módulo esté bien
   gateado. Sin agregarles la condición del tipo nuevo, el gating no se aplica sobre la
   tabla (ver punto 1).

---

# 4 · Premios

**Se cuenta al vuelo, no hay contador materializado.** La función es
`premio_disponible(vehiculo_id)`, redefinida por última vez en `20260822210000:324`. El
ciclo con reset cuenta desde el último canje contra la meta vigente:

```sql
create function premio_disponible(p_vehiculo_id uuid)
returns table (
  disponible boolean, services_ciclo integer, meta_services integer,
  premio_id uuid, descripcion text, alcance alcance_premio
)
language sql stable as $$
  with vehiculo as (
    select v.id, v.lubricentro_id from vehiculos v where v.id = p_vehiculo_id
  ),
  premio_vigente as (
    select p.id, p.meta_services, p.descripcion, p.alcance
    from premios p
    join vehiculo ve on ve.lubricentro_id = p.lubricentro_id
    where p.activo
    limit 1
  ),
  ultimo_canje as (
    select max(c.created_at) as fecha from canjes c
    where c.vehiculo_id = p_vehiculo_id
  ),
  conteo as (
    select count(*)::integer as n
    from services s
    cross join ultimo_canje uc
    left join premio_vigente pv on true
    where s.vehiculo_id = p_vehiculo_id
      and not s.anulado
      -- sin premio (pv null) o con alcance 'services': solo cambios de
      -- aceite, el comportamiento de siempre.
      and (pv.alcance = 'todos' or s.tipo = 'service')
      and (uc.fecha is null or s.created_at > uc.fecha)
  )
  select
    coalesce(c.n >= pv.meta_services, false) as disponible,
    c.n as services_ciclo, pv.meta_services, pv.id as premio_id,
    pv.descripcion, pv.alcance
  from conteo c
  left join premio_vigente pv on true;
$$;
```

Las tablas son `premios` (`20260723210634:64`), con `meta_services` entre 2 y 50,
`descripcion`, `activo` y `alcance`; y `canjes` (`20260723212016:7`), que es el registro
del canje con su índice de un canje por service.

## Dónde vive el "cuenta services" contra "cuenta todos"

Es la columna `premios.alcance`, un enum `alcance_premio` con valores `services` y `todos`,
agregado en `20260822210000:104` con default `services` para que ningún tenant existente
cambiara de comportamiento:

```sql
create type alcance_premio as enum ('services', 'todos');

alter table premios
  add column alcance alcance_premio not null default 'services';

comment on column premios.alcance is
  'Qué trabajos avanzan el ciclo: services = solo cambios de aceite (default histórico) · todos = también mecánica.';
```

Se aplica en la línea `and (pv.alcance = 'todos' or s.tipo = 'service')`, y viaja en el
retorno de la función para que el cartón sepa si el canje corresponde en el tipo de trabajo
que se está cargando.

## Qué pasa si cambian la meta a mitad de camino

**Se recalcula, no se congela**, y el producto lo dice en voz alta. La pantalla de
Fidelización tiene este aviso:

> "Recomendamos definir las metas del programa una sola vez y sostenerlas en el tiempo. Los
> cambios se aplican de inmediato para todos los vehículos, incluidos los que están en
> progreso y los que ya tienen un premio disponible sin canjear."

Hay una consecuencia práctica ya contemplada: entre que se pinta el cartón y se confirma el
service, la meta puede haber cambiado, y la transacción vuelve entera con un mensaje propio
(`services/nuevo/[vehiculoId]/actions.ts`, constante `PREMIO_YA_NO`).

## Un solo premio por taller, y la estructura lo impone

El índice único es parcial, en `20260723210634:77`:

```sql
create unique index premios_uno_activo on premios(lubricentro_id) where activo;
```

El comentario dice por qué: el ciclo con reset necesita una meta vigente inequívoca.

**¿Se puede configurar el premio por tipo de trabajo sin rehacer el módulo?** No tal como
está, pero el camino es corto y ya está insinuado. `alcance` es un enum de dos valores que
ya expresa la idea de "qué trabajos suman". Agregarle un tercer valor, algo como
`solo_neumaticos`, es una línea en el enum y una condición en `conteo`. Lo que **no** entra
sin tocar estructura es tener dos programas simultáneos con metas distintas, uno de
services y otro de cubiertas, porque el índice único lo prohíbe y `premio_disponible` hace
`limit 1`. Eso sí sería rehacer el módulo.

---

# 5 · La página pública del cliente

Toda la ruta es Server Components, sin una sola línea de JavaScript de cliente. El acordeón
del historial es `<details>` nativo.

## Una sola llamada a la base

`app/(cliente)/[slug]/[patente]/page.tsx:58` llama a `obtenerCarton`, que en
`lib/cliente/carton.ts:172` hace la única RPC, `get_carton`. La definición vigente es la de
`20260823210000_cierre_sprint.sql:28`, y es `volatile` porque además registra la búsqueda
como lead (`:73`).

El mapeo jsonb → TS de cada trabajo está en `carton.ts:224`:

```ts
      services: (json.services ?? []).map((s) => ({
        // Un JSON de antes de la migración no trae la clave: era un service.
        tipo: s.tipo ?? "service",
        trabajoDescripcion: s.trabajo_descripcion ?? null,
        fecha: s.fecha,
        kilometros: s.kilometros,
        aceiteTipo: s.aceite_tipo,
        aceiteNombre: s.aceite_nombre,
        proxServiceKm: s.prox_service_km,
        sucursal: s.sucursal,
        observaciones: s.observaciones,
        fijado: s.fijado,
        items: s.items ?? [],
      })),
```

Y el reparto entre cartón destacado e historial, en `page.tsx:108`:

```tsx
  const ultimoService = services.find((s) => s.tipo === "service") ?? null;
  const ultimo = ultimoService ?? services[0] ?? null;
  const anteriores = services.filter((s) => s !== ultimo);
```

## La función no ramifica por tipo

Emite el mismo objeto para los dos y deja que el front decida. Lo único que marca la
diferencia es la clave `tipo`, cruda (`:202`), y los dos tipos viajan mezclados en el mismo
array, ordenados por `s.fecha desc, s.created_at desc`. La diferencia de contenido es
estructural: la imponen los CHECK de la tabla.

Por trabajo vienen: `tipo`, `trabajo_descripcion`, `fecha`, `kilometros`, `aceite_tipo`,
`aceite_nombre`, `prox_service_km`, `sucursal`, `observaciones`, `fijado` (calculado al
vuelo como `now() - s.created_at >= interval '24 hours'`), y el array `items` con `tipo`,
`cambiado`, `cantidad` y `detalle`.

### Tres advertencias de `get_carton`

1. El `from services s join sucursales suc on suc.id = s.sucursal_id` (`:237`) es un
   **INNER JOIN**: un trabajo sin `sucursal_id` no aparecería en el historial del cliente.
2. `'campos_visibles', v_config.campos_visibles` **sí se emite** en el bloque `lubricentro`
   (`:139`), pero el front **lo descarta**: el tipo `LubricentroJson` en
   `lib/cliente/carton.ts:95` no declara esa clave. Hoy es un dato muerto del lado de Next.
3. La página **sobrevive a la suspensión del tenant**: no hay filtro por `activo` en el
   lookup del lubricentro. Solo el premio y el mensaje del taller se apagan. Lo vigila R4
   en `verificaciones.sql`.

## La personalización

Son **variables CSS inyectadas por style inline**, más utilidades de Tailwind v4 que las
leen. El punto de inyección es `page.tsx:112`:

```tsx
    <div
      style={{
        ...variablesTenant(paleta),
        // El tema es del lubricentro, para todos los que escanean — ver
        // la nota en la landing del slug. El cartón queda afuera del
        // apagón a propósito: es papel (reset más abajo).
        ...estilosTema(lubricentro.tema, lubricentro.colorFondo),
      }}
      className="flex min-h-full flex-1 flex-col"
    >
```

`variablesTenant` (`lib/cliente/color.ts:120`) pisa cuatro tokens: `--color-tenant`,
`-soft`, `-deep` e `-ink`. El `ink` es la tinta legible arriba del color primario, blanca o
negra según luminancia con umbral 0.45, porque el lubri puede elegir un amarillo. Los
tokens se declaran en `app/globals.css:50`, dentro de `@theme`, que es lo que habilita las
clases `bg-tenant`, `text-tenant-ink`, `border-l-tenant`.

El modo oscuro es otro juego de variables, en `lib/cliente/tema.ts:32`, y es decisión del
tenant, nunca del visitante (regla 7 del CLAUDE.md).

### El contra-reset del papel

Es el detalle que más importa para el diseño. `ESTILO_PAPEL` en `tema.ts:71`:

```ts
export const ESTILO_PAPEL: React.CSSProperties = {
  // El mismo motivo que en estilosTema: la tinta del papel se hereda por
  // `color`, no solo por la variable.
  color: "#0A0A0A",
  "--color-ink": "#0A0A0A",
  "--color-ink-60": "#4A4A4A",
  "--color-ink-40": "#8A8A8A",
  "--color-line": "#E4E4E4",
  "--color-base": "#FFFFFF",
  "--color-surface": "#F5F5F5",
} as React.CSSProperties;
```

Se aplica en `page.tsx:172` y en `historial-cartones.tsx:97`. Todo lo que esté adentro del
cartón se dibuja en tinta oscura sobre papel claro **aunque el tenant esté en oscuro**. El
cartón es papel, y el papel no se apaga.

## Qué distingue hoy a una mecánica

Hay **exactamente un badge** en toda la superficie, y es textual, en
`components/cliente/historial-cartones.tsx:68`:

```tsx
{s.tipo === "mecanica" && (
  <span className="rounded-sm border border-line bg-surface px-2 py-0.5 text-label font-semibold tracking-[0.04em] text-ink-60 uppercase">
    Mecánica
  </span>
)}
```

**No existe badge de "Service"**: el service es el caso sin etiqueta, se identifica por
ausencia. Y no hay ningún indicador de tipo en el cartón destacado de arriba; ahí la única
señal es interna al papel, la bajada que dice "Orden de trabajo" en lugar de
"Lubricentro".

La línea secundaria del `<summary>` también cambia según el tipo
(`historial-cartones.tsx:74`):

```tsx
                  <span className="block text-c-body text-ink-60 tabular-nums">
                    {s.tipo === "mecanica"
                      ? [s.trabajoDescripcion, s.sucursal].filter(Boolean).join(" · ")
                      : `${formatearKm(s.kilometros ?? 0)} km${s.sucursal ? ` · ${s.sucursal}` : ""}`}
                  </span>
```

**Solo cinco lugares** de toda la superficie miran el tipo: `page.tsx:108` y `:173`, y
`historial-cartones.tsx:68`, `:75` y `:98`.

Si se suma un tercer tipo, ese badge necesita volverse un mapa de tipo a etiqueta, y
probablemente convenga que el service también tenga el suyo.

### Diferencias de contenido, ítem por ítem

Solo en un **service**:

1. El bloque `ProximoService` (el display de 52px), `page.tsx:153`. Usa `ultimoService`, no
   `ultimo`: si el auto solo tiene mecánicas, no existe.
2. Los 11 renglones fijos, `carton-papel.tsx:219`.
3. Las filas "Aceite tipo" y "Aceite marca", `carton-papel.tsx:199`.
4. La banda "PROX. SERV. KMTS." al pie, `carton-papel.tsx:249`.
5. La leyenda ✓/OK, `carton-papel.tsx:263`.
6. La bajada "Lubricentro", `carton-papel.tsx:193`.
7. El estado "OK" por renglón, `carton-papel.tsx:127`.
8. La cantidad "×N", `carton-papel.tsx:141`.

Solo en una **mecánica**:

1. El badge "Mecánica" en el historial.
2. La bajada "Orden de trabajo", `carton-papel.tsx:325`.
3. El bloque "TRABAJO REALIZADO" a lo ancho, `carton-papel.tsx:350`.
4. Los renglones libres con etiqueta vertical "REP.", `carton-papel.tsx:360`.
5. La banda de cierre "Trabajo de mecánica", `carton-papel.tsx:391`.
6. "Kilómetros" es opcional: la fila desaparece si vino null, `carton-papel.tsx:331`.

## Dónde entraría un esquema del auto con las cuatro ruedas

### Lo que NO existe (explícito)

- **No hay ningún componente de esquema de vehículo, ni SVG de auto, ni nada de posiciones
  de rueda en todo el repo.** El único SVG propio en `components/iconos.tsx` es
  `IconoPatente`; el resto son re-exports de Phosphor.
- **No hay columna de posición en ninguna tabla**, ni valor de posición en ningún enum.
- **`get_carton` no emite ninguna clave de rueda, neumático ni posición.**
- El enum `item_tipo` son los 11 renglones del cartón (`lib/renglones.ts:14`) y no incluye
  neumáticos.
- `campos_visibles` tiene exactamente cuatro claves y **no hay ningún flag por tipo de
  trabajo**: hoy un lubricentro no puede ocultarle las mecánicas al cliente.

### La estructura del papel

`components/services/carton-papel.tsx`, 403 líneas, exporta `CartonPapel` y
`CartonPapelMecanica`. Lo usan el panel y el cliente.

**No es CSS Grid: es flexbox fila por fila**, con los bordes internos dibujados celda por
celda con `border-l border-ink`, y cada fila con `border-b border-ink`. Ver `Renglon` en
`:93`.

Tiene un sistema de escalas con dos perfiles, `panel` y `cliente` (`:46`). El perfil
cliente (`:77`):

```tsx
  cliente: {
    caja: "px-3 pt-4.5 pb-4",
    nombre: "text-c-lead",
    // ink-60 y no ink-40: acá hay que leerlo al sol, y 3,5:1 no alcanza.
    bajada: "text-c-body text-ink-60",
    claveCabecera: "text-c-body",
    valorCabecera: "text-c-body",
    renglon: "text-c-body",
    tilde: "w-12 text-c-lead",
    detalle: "text-c-body",
    etiqueta: "w-8 text-c-body",
    celda: "px-2",
    primeraColumna: "flex-[1.15]",
  },
```

**Cualquier bloque nuevo debería recibir `e` y sumar sus propias claves acá**, no hardcodear
tamaños. Es el contrato que respetan las dos piezas que ya existen.

El color del tenant adentro del papel se referencia con variables locales `--tn` y
`--tn-ink`, distintas de `--color-tenant` (`carton-papel.tsx:170`).

### Los cuatro anclajes posibles

De más adentro hacia afuera:

1. **Dentro de la grilla, como una fila más**, entre el fin de los grupos (`:247`) y la
   banda de cierre (`:249`). Hereda los bordes y el ancho, y se lee como parte del cartón.
   La banda de cierre tiene que quedar siempre última.
2. **Dentro del papel pero fuera de la grilla**, entre `:261` y `:269`. Ahí no hay bordes
   heredados y se puede usar un layout libre, y se sigue en modo papel.
3. **Fuera del papel, pegado al cartón destacado.** `page.tsx:208` ya hace eso con el
   "Hecho en {sucursal}", y ahí el bloque sí acompaña al tema del tenant.
4. **Como sección propia en la columna derecha**, en el flujo de `page.tsx:224`, donde ya
   viven el mensaje del taller, las recomendaciones, los pendientes, la fidelización y el
   historial.

### La restricción de ancho

El cartón está topado en `sm:max-w-[26rem]` y la grilla de desktop es
`lg:grid-cols-[minmax(0,26rem)_1fr]` (`page.tsx:151` y `:166`). **El papel nunca pasa de
416 píxeles**, por decisión explícita documentada en el archivo. Un esquema de auto adentro
del papel tiene que vivir cómodo en unos 390 de contenido útil.

**Recomendación:** el segundo anclaje, dentro del papel y fuera de la grilla. Un esquema de
cuatro posiciones con marca y medida por rueda no entra en el sistema de celdas sin
pelearse con él, y afuera del papel pierde la lectura de documento que es justo lo que le
da valor.

## `campos_visibles`

Definido en `20260723210634:11`, con exactamente cuatro claves:

```sql
  campos_visibles  jsonb not null default '{
    "mostrar_productos": true,
    "mostrar_observaciones": false,
    "mostrar_fidelizacion": true,
    "mostrar_sucursal": true
  }'::jsonb,
```

Todo se respeta **en la base, dentro de `get_carton`**, nunca en el front:

| Clave | Default | Qué apaga | Dónde |
|---|---|---|---|
| `mostrar_productos` | `true` | `aceite_nombre` y el `detalle` de cada ítem | `cierre_sprint:207` y `:226` |
| `mostrar_sucursal` | `true` | el nombre de la sucursal | `:211` |
| `mostrar_observaciones` | **`false`** | las observaciones | `:214` |
| `mostrar_fidelizacion` | `true` | el bloque `fidelizacion` entero | `:185` |

Se editan en `components/experiencia/form-experiencia.tsx:31` (panel del lubri) y se
persisten en `app/panel/(tras-onboarding)/experiencia/actions.ts:100`, que hace spread de
lo existente antes de pisar, así que claves desconocidas sobreviven a un guardado.

---

# 6 · El panel interno /fidelli

## Estructura

Once archivos, cuatro rutas de pantalla y una de manifest:

| Archivo | Qué es |
|---|---|
| `app/fidelli/layout.tsx` | Guard de toda la superficie + barra superior |
| `app/fidelli/page.tsx` | `/fidelli` — listado de tenants |
| `app/fidelli/actions.ts` | Server Actions del listado y del alta (477 líneas) |
| `app/fidelli/[id]/page.tsx` | `/fidelli/[id]` — ficha del tenant, 4 pestañas |
| `app/fidelli/[id]/actions.ts` | Server Actions de la ficha (220 líneas) |
| `app/fidelli/nuevo/page.tsx` | `/fidelli/nuevo` — wizard de alta |
| `app/fidelli/precios/page.tsx` | `/fidelli/precios` — catálogo de planes |
| `app/fidelli/precios/actions.ts` | `guardarPlan` |
| `app/fidelli/cuenta/page.tsx` | `/fidelli/cuenta` — datos propios del superadmin |
| `app/fidelli/cuenta/actions.ts` | `cambiarClave` |
| `app/fidelli/manifest.webmanifest/route.ts` | Manifest PWA de la superficie |

El guard está en el layout, `app/fidelli/layout.tsx:24`, con `exigirRol("superadmin")`, y
la superficie va con `robots: { index: false, follow: false }`.

Las cuatro pestañas de la ficha van por query string `?tab=`: `resumen`, `suscripcion`,
`datos`, `configuracion`. Las pestañas de datos y configuración son **solo lectura**; la de
configuración lo dice textualmente: *"Es solo lectura: si hay algo mal, lo cambia él desde
su panel."*

### Hallazgo de navegación

**Editar el tenant y suspenderlo no están en la ficha**: viven en el listado, dentro de la
tabla (`components/fidelli/tabla-lubricentros.tsx:194` → `acciones-tenant.tsx:36`). La
ficha solo escribe pago, desbloqueo de service, corrección de patente y override de plan.

## Inventario de `app/fidelli/actions.ts`

Todas pasan por `exigirSuperadmin()` (`:16`).

| # | Acción | Línea | Toca | Valida |
|---|---|---|---|---|
| 1 | `verificarSlug` | `:80` | RPC `slug_estado` | ante error devuelve `"invalido"`, no "libre" |
| 2 | `altaDeLubricentro` | `:189` | RPC `crear_lubricentro` + Auth admin API | nombre, slug, ≥1 sucursal, owner, regex de email, plan |
| 3 | `invitarOwner` | `:258` | Auth admin API (service_role) | nombre y regex de email |
| 4 | `reenviarInvitacion` | `:280` | `usuarios` + Auth admin API | no acepta email del form: lo lee de la base |
| 5 | `editarLubricentro` | `:317` | RPC `actualizar_lubricentro` | solo presencia de `plan_id`, `periodo`, `vencimiento` |
| 6 | `cambiarEstadoLubricentro` | `:360` | `UPDATE lubricentros SET activo` directo | chequea `data.length === 0` porque RLS rechaza en silencio |
| 7 | `registrarAviso` | `:403` | `INSERT contactos_fidelli` | nada |
| 8 | `alternarAviso` | `:433` | `DELETE contactos_fidelli` o delega | calcula el ancla del ciclo desde el último pago |

Privada, no exportada: `enviarInvitacion` (`:100`), **la única que usa `service_role`**.

Las otras cuatro de la superficie: `registrarPago`, `desbloquearService`,
`corregirPatente`, `fijarOverridePlan` (`app/fidelli/[id]/actions.ts:58, 106, 139, 181`),
más `guardarPlan` (`precios/actions.ts:13`) y `cambiarClave` (`cuenta/actions.ts:26`).

## Cambio de plan

Se hace desde el **listado**. El `<select name="plan_id">` está en
`components/fidelli/campos-plan.tsx:40`, el submit va a `editarLubricentro`, que arma el RPC
en `app/fidelli/actions.ts:332`. La función de la base es `actualizar_lubricentro()`,
definida en `20260726120000_abm_lubricentros.sql:431` y **nunca redefinida**. El cambio de
plan es literalmente este UPDATE (`:505`):

```sql
  update suscripciones
  set plan_id       = coalesce(p_plan_id, plan_id),
      periodo       = coalesce(p_periodo, periodo),
      descuento_pct = p_descuento_pct,
      vencimiento   = coalesce(p_vencimiento, vencimiento)
  where id = v_suscripcion;
```

### No hay validación de qué pasa con los datos al bajar de plan

Y es deliberado. `actualizar_lubricentro` valida `nombre_vacio`, `calcos_invalidas`,
`descuento_invalido`, `no_existe`, `slug_bloqueado` y `sin_suscripcion`. **No mira nada del
plan de destino**: ni sucursales activas por encima del tope nuevo, ni features en uso que
el plan nuevo apaga, ni advertencia en la UI. Tampoco hay trigger sobre `suscripciones`.

La razón está escrita en `20260822150000:18`:

```
-- LA REGLA DE ORO DEL GATING: se apaga la ESCRITURA, nunca la lectura.
-- Igual que la suspensión. Por eso los chequeos van en WITH CHECK y
-- ninguno en USING: un tenant que baja de plan sigue viendo todo lo que
-- cargó — lo que pierde es el botón de cargar más. Y en sucursales el
-- tope gobierna SOLO sumar capacidad (insertar activa / reactivar): editar
-- o desactivar lo que ya existe no se bloquea nunca, aunque el tenant haya
-- quedado por encima del tope al bajar de plan.
```

## Auditoría

**No existe una tabla de log general.** Revisadas las 26 tablas y los 16 triggers: ninguno
es de auditoría genérica.

Estos cambios de `/fidelli` **no dejan ningún rastro** de quién ni cuándo:

- Cambio de plan, período, descuento y vencimiento.
- Cambio de nombre y slug del tenant.
- Cambio de `calcos_entregadas`.
- Suspender / reactivar (`activo`) — ni siquiera hay `suspendido_at`.
- Cambio de precio de lista de un plan, que mueve la factura de todos los tenants a la vez.

`lubricentros` tiene `created_at` y nada más: ni `updated_at` ni ninguna columna `*_por`.

### Los cinco rastros parciales que sí existen

1. **`cambios_override_plan`** (`20260822150000:190`) — antes, después, motivo con mínimo de
   10 caracteres, autor y fecha. Lo más cercano a auditoría real. Con candado por trigger.
2. **`correcciones_patente`** (`20260801120000:43`) — mismo patrón, con `corregido_por` y
   motivo. Append-only en la práctica: nadie tiene policy de update ni delete.
3. **`pagos.registrado_por`** (`20260723172154:98`) — el comentario de la tabla la llama
   textualmente "la firma de auditoría".
4. **`services.desbloqueado_por` y `desbloqueado_hasta`** — dos columnas sobre la propia
   fila, que **se pisan en cada desbloqueo**.
5. **`contactos_fidelli`** — registra los avisos de vencimiento, pero **se borra** cuando se
   destilda (`app/fidelli/actions.ts:464`).

Timestamps sueltos sin autor: `lubricentros.diseno_confirmado_at`, `premio_omitido_at`,
`onboarding_completado_at`, `bienvenida_vista_at`, y los `updated_at` de `services`,
`config_experiencia`, `presupuestos` y `notas_vehiculo`.

## `listado_lubricentros()`

La vigente es la de `20260909180000_onboarding.sql:356`, precedida de un `drop function`
porque cambió la firma. Devuelve 27 columnas:

```
id, nombre, slug, activo, calcos_entregadas, creado,
suscripcion_id, sub_estado, sub_periodo, sub_descuento_pct, sub_vencimiento,
plan_id, plan_nombre, plan_precio, plan_desc_sem, plan_desc_anual,
services_mes, ultimo_service, owner_estado, owner_nombre,
atencion, atencion_orden, contactado, telefono,
onboarding_paso, onboarding_pasos, onboarding_avance
```

Es `language sql stable`, **security invoker**, así que el RLS del que llama decide qué
tenants se ven. La consumen `app/fidelli/page.tsx:40` y `app/fidelli/precios/page.tsx:23`.

## Alta de un tenant nuevo

La función vigente es `crear_lubricentro()` en `20260822150000:662`:

```sql
create or replace function crear_lubricentro(
  p_nombre         text,
  p_slug           text,
  p_sucursales     jsonb,
  p_plan_id        uuid,
  p_periodo        periodo_suscripcion,
  p_descuento_pct  numeric,
  p_dias_trial     integer
)
returns uuid
```

Orden exacto, todo en una transacción: guard de superadmin → validaciones → insert de
`lubricentros` → insert de `config_experiencia` → loop de sucursales → chequeo de que haya
al menos una → chequeo del tope contra `limite_del_plan` → insert de `suscripciones` en
trial → `sembrar_templates()`.

**Las dos fases del alta**, argumentadas en `app/fidelli/actions.ts:139`:

```
//   · Tenant y después invitación: si falla la invitación queda un
//     lubricentro sin owner. Se ve en el listado como "Sin owner" y se
//     arregla con un botón. Recuperable.
//
//   · Invitación y después tenant: si falla el tenant queda un usuario en
//     auth.users apuntando a un lubricentro que no existe — y el trigger
//     ni siquiera lo dejaría crearse. Un huérfano que no se arregla con
//     nada de lo que hay en el panel.
//
// Por eso: primero el tenant, siempre.
```

## Campos que se prenden/apagan a mano desde /fidelli (aparte del plan)

**a)** `lubricentros.activo` — suspender/reactivar. Es el único UPDATE directo a tabla de
toda la superficie, sin función de la base (`actions.ts:373`). No queda registro.

**b)** `lubricentros.calcos_entregadas` — número editable a mano. Es el interruptor
implícito del slug: en cuanto pasa de cero, el slug queda cerrado para siempre.

**c)** `lubricentros.plan_overrides` — features y tope de sucursales por tenant, con tres
estados. **El único de los cinco con motivo obligatorio y auditoría.**

**d)** `services.desbloqueado_hasta` / `desbloqueado_por` — la ventana de 24 horas, que
calcula Postgres para que no haya dos relojes.

**e)** `contactos_fidelli` — el check de "ya le avisé", que se prende insertando y se apaga
borrando.

Fuera de la ficha, el sexto toggle es `planes.precio_mensual` más los dos descuentos, que
no es por tenant: mueve la factura de todos los que tengan ese plan.

## Qué haría falta para el interruptor del módulo

Poco, porque el molde existe. Una tabla nueva de módulos por tenant con sus fechas y su
motivo de bonificación, un formulario en la pestaña de suscripción de la ficha, al lado del
de overrides, y una acción hermana de `fijarOverridePlan`. Si la tabla se diseña con el
mismo criterio que `cambios_override_plan` —append-only con motivo obligatorio— la
auditoría sale gratis y no hace falta el candado por trigger: alcanza con que la tabla sea
de solo inserción.

---

# 7 · Estado del repo

**No hay ningún PR abierto.** Los últimos ocho están todos mergeados. `main` y `develop`
tienen el mismo contenido: cero commits de diferencia en cualquier dirección.

| PR | Estado | Rama | Título |
|---|---|---|---|
| #88 | MERGED | develop | release: apagar el programa de premios no vuelve a tapar el Inicio |
| #87 | MERGED | fix/inicio-programa-inactivo | fix(inicio): apagar el programa de premios no vuelve a tapar el Inicio |
| #86 | MERGED | develop | release: "Otro" en el próximo service, con el salto acotado |
| #85 | MERGED | feat/admin-proximo-service-otro | feat(services): "Otro" en el próximo service, con el salto acotado |
| #84 | MERGED | fix/whatsapp-soporte-motors | fix: un solo WhatsApp para todo Fidelli Motors |
| #83 | MERGED | develop | release: centro de ayuda, onboarding de tres pasos y videos en la landing |
| #82 | MERGED | feat/ayuda-onboarding | feat(panel): centro de ayuda, onboarding de tres pasos y videos |
| #81 | MERGED | develop | release: tracking de WhatsApp por canal |

## Ramas remotas no mergeadas

Dos, y son ruido: `feat/graficos-interactivos` y `fix/hora-argentina`. Comparadas contra
`main` borran veintisiete mil líneas. Son de antes de casi todo el proyecto. Convendría
borrarlas del remoto.

## El único trabajo realmente en vuelo

Está **sin commitear**, en el checkout principal de `~/Desktop/fidelli-motors`, rama
`fix/invitacion-vencida`, cero commits por delante de `develop`:

```
 CLAUDE.md                  | 35 ++++---
 app/auth/callback/route.ts | 15 +++
 app/auth/enlace/page.tsx   | 84 ++++++-------
 app/fidelli/actions.ts     | 47 +-----
 lib/auth/actions.ts        | 30 +++++
 sin seguimiento: components/auth/formulario-invitacion-vencida.tsx,
                  lib/auth/invitacion.ts, inventario-producto.md,
                  docs/Flow_de_Fidelización.pdf
```

**De eso, una sola cosa se pisa con el módulo de neumáticos: `app/fidelli/actions.ts`.** Es
el archivo donde va a vivir la acción del interruptor, y el trabajo pendiente le saca 47
líneas. Nada más colisiona: neumáticos no toca auth.

## Orden de merge recomendado

1. Cerrar `fix/invitacion-vencida`, que es chico y lleva días abierto.
2. Arrancar neumáticos desde un `develop` limpio.

Si el fix de invitación se demora, igual se puede empezar por la migración y el panel del
lubricentro, que no tocan `/fidelli`, y dejar el interruptor para el final.

**Advertencia de proceso:** las migraciones mergeadas a `develop` no se editan, y el bloque
de neumáticos son varias. Conviene que salgan como una sola migración bien armada y no como
cuatro parches, porque una vez que están en `develop` la corrección es otra migración.

---

# 8 · Tamaño del trabajo

Horas de trabajo enfocado, incluyendo la verificación en el navegador y contra la base
local, que en este proyecto es la mitad del tiempo. Calibradas contra lo que costaron los
bloques de mecánica, pendientes y presupuestos.

| Parte | Horas | Qué incluye |
|---|---|---|
| Esquema y migraciones | 6 a 9 | Enum, tabla satélite por rueda, CHECK del tercer tipo, las dos policies de `services`, `guardar_service` y `actualizar_service`, y las pruebas de regresión nuevas |
| Carga en el panel | 8 a 12 | El cartón de neumáticos con las cuatro ruedas, la edición, el listado y sus filtros |
| Cálculo de retornos | 4 a 6 | Vista nueva, unión en "A quién llamar", tercera columna de templates, anti-spam |
| Página pública | 4 a 6 | Papel de neumáticos, esquema de las cuatro posiciones, badges por tipo |
| Gating del módulo (simple) | 3 a 5 | Si alcanza con una feature más en el catálogo |
| Gating del módulo (completo) | 6 a 9 | Con tabla propia, fechas de alta y baja, y bonificado |
| Panel /fidelli | 2 a 4 | Formulario, acción y la fila en la ficha |
| Pruebas | 4 a 6 | Red de regresión en `verificaciones.sql` más el recorrido punta a punta |
| **Total** | **31 a 48** | Con el gating simple. Con el completo, hasta 52 |

## La parte con más riesgo

**El cálculo de retornos**, sin ninguna duda. Por tres razones acumuladas.

1. **`vista_proximos_service` es la pantalla que renueva la suscripción, y su modo de falla
   es silencioso.** El encabezado de la migración de mecánica lo dice con todas las letras:
   si un trabajo del tipo nuevo entra con la misma forma, pasa a ser el último service del
   auto y el auto desaparece de la lista, sin error y sin log.
2. **`create or replace view` resetea las `reloptions`, incluido el `security_invoker`.**
   Sin reponerlo, un owner ve los datos de todos los lubricentros. Ya pasó dos veces, y está
   documentado como la regla 4 del CLAUDE.md.
3. **Los CHECK y las policies escritos como `tipo <> 'x' or (...)` admiten el valor nuevo
   del enum sin evaluar nada.** Es la falla que no da error, no rompe el build y no aparece
   en ninguna prueba existente. En el peor caso, agregar el valor al enum deja el módulo
   pago abierto para todos los tenants. **Esto no está documentado en ningún lado del
   repo.**

Lo que deja tranquilo es que la red de regresión ya cubre dos de las tres. **R2** verifica
que un trabajo posterior no altere la fila de retención, y **R3** que el gating por tipo
rija. Las dos corren en cada `supabase db reset` y hacen fallar el comando. Para neumáticos
habría que escribir sus gemelas **antes** de escribir la feature, no después.

---

# Anexo · Inventario del esquema

Leído de la base local, que está al día con `main`.

**Tablas (26):** `cambios_override_plan`, `canjes`, `categorias_producto`, `clientes`,
`config_experiencia`, `contactos`, `contactos_fidelli`, `correcciones_patente`,
`landing_busquedas`, `lubricentros`, `marcas_vehiculo`, `mensaje_templates`,
`notas_vehiculo`, `pagos`, `planes`, `premios`, `presupuesto_items`, `presupuestos`,
`productos`, `service_items`, `services`, `sucursales`, `suscripciones`,
`trabajos_pendientes`, `usuarios`, `vehiculos`.

**Vistas (4):** `vista_clientes`, `vista_pendientes`, `vista_proximos_service`,
`vista_vehiculos`.

**Enums (10):**

```
alcance_premio          = {services, todos}
canal_contacto          = {whatsapp, manual}
estado_contacto         = {urgente, proximo, vencido, pendiente}
estado_pendiente        = {pendiente, resuelto, descartado}
estado_suscripcion      = {trial, activa, vencida, cancelada}
item_tipo               = {filtro_aceite, filtro_aire, filtro_combustible,
                           filtro_habitaculo, aceite_caja, aceite_diferencial,
                           aceite_hidraulico, liq_refrigerante, liq_frenos,
                           aditivo_motor, aditivo_transmision}
motivo_contacto_fidelli = {trial, cobranza}
periodo_suscripcion     = {mensual, semestral, anual}
rol_usuario             = {owner, superadmin}
tipo_trabajo            = {service, mecanica}
```

**Columnas de `services`:**

```
id, lubricentro_id, sucursal_id, vehiculo_id, usuario_id, fecha, kilometros,
aceite_tipo, prox_service_km, aceite_producto_id, aceite_nombre, observaciones,
anulado, desbloqueado_hasta, desbloqueado_por, created_at, updated_at,
tipo, trabajo_descripcion, aceite_litros
```

**Firma vigente de `guardar_service`** (`20260902120000_stock_aceite_por_unidad.sql:27`):

```sql
create or replace function guardar_service(
  p_vehiculo_id          uuid,
  p_sucursal_id          uuid,
  p_fecha                date,
  p_kilometros           integer,
  p_aceite_tipo          text,
  p_prox_service_km      integer,
  p_items                jsonb default '[]'::jsonb,
  p_aceite_producto_id   uuid default null,
  p_aceite_nombre        text default null,
  p_observaciones        text default null,
  p_canjear_premio       boolean default false,
  p_tipo                 tipo_trabajo default 'service',
  p_trabajo_descripcion  text default null,
  p_pendientes           jsonb default '[]'::jsonb,
  p_resolver_pendientes  uuid[] default '{}'::uuid[],
  p_aceite_litros        numeric default null
)
returns uuid
```

**Tamaño de los archivos que tocaría un tercer tipo:**

| Líneas | Archivo |
|---|---|
| 1350 | `components/services/carton.tsx` |
| 474 | `components/services/campos-carton.tsx` |
| 403 | `components/services/carton-papel.tsx` |
| 328 | `components/services/panel-alta.tsx` |
| 279 | `app/panel/(tras-onboarding)/services/[serviceId]/page.tsx` |
| 275 | `lib/cliente/carton.ts` |
| 263 | `app/(cliente)/[slug]/[patente]/page.tsx` |
| 239 | `app/panel/(tras-onboarding)/services/nuevo/[vehiculoId]/actions.ts` |
| 225 | `app/panel/(tras-onboarding)/services/[serviceId]/editar/page.tsx` |
| 202 | `app/panel/(tras-onboarding)/services/nuevo/[vehiculoId]/page.tsx` |
| 191 | `app/panel/(tras-onboarding)/services/page.tsx` |
| 126 | `components/services/filtros-services.tsx` |
| 91 | `lib/trabajos.ts` |
| 90 | `lib/renglones.ts` |
| 71 | `components/services/fila-service.tsx` |
| 45 | `components/services/badge-estado.tsx` |
| 43 | `lib/servicios.ts` |

Hay **80 menciones** a `mecanica` o `esMecanica` en 22 archivos de `app/`, `components/` y
`lib/`. Es la superficie que un tercer tipo va a tener que recorrer.

**Nota sobre `resumen_inicio`:** la versión vigente (`20260823210000_cierre_sprint.sql:306`)
**no filtra por tipo en ninguna de sus métricas**. La versión anterior
(`20260822210000:928`) tenía seis filtros `tipo = 'service'` que se sacaron a propósito en
el commit `6ffb0f3`, "el panel habla de trabajos". El comentario del checklist lo confirma:
*"El checklist no se filtra: es el estado de configuración del lubricentro entero."* O sea
que un trabajo de neumáticos va a contar automáticamente en "trabajos del mes" y en
"clientes nuevos" el día que exista el valor del enum. Probablemente sea lo deseado, pero
es una decisión heredada, no una elección.

---

# Consulta pendiente contra producción

Ninguna pregunta del relevamiento quedó abierta. La única consulta que valdría la pena
correr **contra producción** antes de diseñar es esta, para saber cuántos tenants tienen hoy
algún override puesto y si el mecanismo está en uso real o solo existe en el papel:

```sql
select l.slug, l.plan_overrides,
       (select count(*) from cambios_override_plan c where c.lubricentro_id = l.id) as cambios
from lubricentros l
where l.plan_overrides <> '{}'::jsonb;
```

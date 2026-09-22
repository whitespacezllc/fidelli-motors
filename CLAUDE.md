# Fidelli Motors

SaaS de retención para lubricentros. Digitaliza el cartón de service que hoy vive
en el parasol del auto: el lubricentro carga el service, el cliente escanea un QR
y ve su historial y cuándo le toca volver.

**Posicionamiento:** retención, no gestión. **El cliente ve, el mecánico ejecuta.**

Stack: Next.js 16 (App Router) · Supabase (PostgreSQL) · Tailwind v4 · Vercel
Dominio: fidellimotors.app

---

## Quién usa esto

**El mecánico** carga el service desde el celular, con las manos sucias y un auto
esperando. Tiene 90 segundos. Si la pantalla no le responde, vuelve al papel.

**El dueño del lubricentro** (Bruno) mira el panel una vez por día para saber a
quién llamar. No es usuario de software: si el abuelo no lo resuelve solo, está
mal diseñado.

**El cliente final** (Pedro) escanea el QR una vez cada tres meses, desde un
celular viejo, sin cuenta ni contraseña. Puede tener 60 años.

**Nosotros** (Fidelli) administramos los tenants desde `/fidelli`.

---

## Las tres superficies

| Ruta | Quién | Sesión |
|---|---|---|
| `/[slug]` | cliente final | ninguna — acceso anónimo |
| `/panel` | lubricentro (rol `owner`) | requerida |
| `/fidelli` | equipo Fidelli (rol `superadmin`) | requerida |

`panel` y `fidelli` son slugs reservados: ningún lubricentro puede quedárselos.

---

## Reglas de diseño — no negociables

**El rojo `#E01F26` es SOLO acción.** Botones primarios, foco, marca. **Nunca
comunica estado.** Un service vencido no es rojo: es ámbar (`overdue #B45309`).
Un error tampoco es rojo de marca. Esta es la regla de oro de la paleta.

**La landing pública es un shell neutro pintado con el color del lubricentro.**
En `/[slug]` el rojo Motors no aparece nunca — ni un píxel. El color viene de
`config_experiencia.color_primario`.

**Dos tipografías con roles fijos.** Nunito para marca y para todo lo que lee el
cliente final. Public Sans para el dato operativo del panel. Nunca se mezclan
al azar.

**Números siempre tabulares** (`font-variant-numeric: tabular-nums`). Kilómetros,
patentes, fechas, precios. Sin excepción.

**Cero itálicas. Nada por debajo de 12px.** El cuerpo del cliente final es 16px
mínimo.

**El aire lo da la ausencia de ruido**, no el padding. Bordes de 1px, sombras
solo en elementos flotantes, radios 4/8/12.

**Áreas táctiles de 44px mínimo.** El mecánico tiene los dedos con aceite.

**El cartón digital va en versión papel** (la "versión B" del hi-fi): troquel,
grilla completa con bordes, etiquetas verticales de grupo en el color del tenant,
los renglones en el orden del cartón físico (los 11 de un auto; los de camión y
la batería se imprimen solo cuando el service los tiene), PROX. SERV. KMTS. al
pie. Es la única pieza del producto donde la grilla con bordes se justifica: *es*
el papel.

El hi-fi navegable está en `/docs`. **Ante una duda visual, abrilo — no lo
adivines.**

---

## Reglas de negocio — viven en la base, no en el front

Estas ya están implementadas en PostgreSQL. **El front las consume, no las
reimplementa.** Si una pantalla necesita una regla, primero fijate si la base ya
la resuelve.

- **La regla de 24 horas.** Un service es editable solo dentro de las 24 hs, o si
  un superadmin abrió una ventana de desbloqueo. Es una *policy de RLS*, no un
  `if` en React. El front muestra el estado; la base lo hace cumplir.
- **Aislamiento multi-tenant.** RLS filtra por `lubricentro_id` automáticamente.
  **No agregues `where lubricentro_id = ...` en las consultas del panel:** ya está.
  **En `/fidelli` es al revés:** `soy_superadmin()` abre todos los tenants, el RLS
  deja de recortar y cada consulta tiene que filtrar por el lubricentro de la
  ficha. Las vistas tampoco ayudan —tienen `security_invoker`, así que a un
  superadmin le devuelven la plataforma entera. Un filtro olvidado no da error:
  mezcla dos lubricentros en la misma pantalla.
- **`premio_disponible(vehiculo_id)`** calcula el ciclo con reset (services desde
  el último canje contra la meta vigente). No hay contadores guardados.
- **`vista_proximos_service`** devuelve el estado (`vencido` / `urgente` /
  `proximo`), el km/día real del vehículo, la fecha estimada y si ya se contactó
  en ese estado. Toda la pantalla de retención sale de ahí.
- **`get_carton(slug, patente)`** es la única puerta pública. Devuelve el cartón
  completo en un JSON, respeta `campos_visibles` del tenant y registra la búsqueda.
  `anon` no tiene permiso sobre ninguna tabla: solo puede ejecutar esa función.
- **`recuperados_del_mes(lubricentro_id)`** cuenta los contactados que volvieron
  dentro de los 30 días.
- **Las patentes se normalizan solas** por trigger. El front manda lo que escribió
  el mecánico; la base guarda `AB123CD` para buscar. Se aceptan los cuatro formatos
  argentinos: auto `ABC123` / `AB123CD` y moto `123ABC` / `A123BCD`. La fuente única
  es `patente_formato_valido()`; el front la repite en `lib/texto.ts` solo para avisar.

- **`landing_busquedas` no guarda la patente de una consulta sin resultado**
  (desde `20260922120000`): `patente` es anulable, un trigger la deja en null
  cuando `encontrada = false` y un CHECK lo hace cumplir. La patente que el
  visitante escribió viaja en el request (`?nohay=`) y el mensaje de WhatsApp
  de "no la encontramos" se arma con esa, nunca con la tabla. La métrica de
  escaneo (cuántas consultas, cuántas sin resultado) no cambió. Lo vigila R28.
- **`anonimizar_cliente(cliente_id, motivo)`** es la supresión de un cliente
  final a su pedido: pisa nombre, teléfono, email y CUIT con sentinelas
  (`'Cliente eliminado'`, `'-'`, null, null; `lib/clientes.ts` los repite para
  la pantalla) y deja intactos los vehículos y los trabajos. La pueden llamar
  el superadmin y el owner del tenant del cliente; exige motivo y lo registra
  en `supresiones_cliente` antes de tocar el dato. Lo vigila R30.
- **`purgar_tenants_vencidos(p_simular, p_lubricentro_id, p_motivo)`** es el
  borrado definitivo a los 12 meses de cancelar: `suscripciones.cancelada_at`
  se escribe por trigger al pasar a `cancelada` (y se limpia al volver), y la
  purga borra lo operativo del tenant —clientes, vehículos, trabajos, contactos,
  productos, premios, config, plantillas, búsquedas y lo que cuelga por FK—,
  nunca `pagos`, `suscripciones`, `cresium_*`, `contactos_fidelli`,
  `aceptaciones_terminos`, `sucursales` ni `usuarios`, y deja `lubricentros`
  con `activo = false` y `purgado_at`. **Simula por defecto** (`p_simular =
  true` solo cuenta y escribe en `purgas`); borra solo con `false`. pg_cron la
  corre el 1 de cada mes **en simulación** (`cron.job` →
  `purgar-tenants-vencidos`): se pasa a real a mano, con `cron.schedule` y el
  mismo nombre, después de revisar una simulación. A pedido del tenant va con
  `p_lubricentro_id` y motivo, auditado; exige la suscripción cancelada; el
  demo nunca. Lo vigila R29.

**Los datos históricos no se borran.** Todo es `on delete restrict`. Para dar de
baja se usa `activo` o `anulado`, nunca `DELETE`. Las dos excepciones escritas
son la purga a los 12 meses de cancelar y la anonimización a pedido del titular
(ver arriba): las dos dejan evidencia antes de tocar nada.

**Un renglón marcado es la existencia de la fila** en `service_items`. No hay
booleano `realizado`.

---

## Copy — cómo se escribe

**Qué pasó y qué hacer, en ese orden.** Sin códigos de error, sin "ha ocurrido un
problema inesperado", sin disculpas.

**Los errores no culpan al usuario.** Ni "lo sentimos" ni "ingresaste mal el dato":
se nombra el hecho y se da el ejemplo correcto.

> "Son menos que el último service (88.200 km). Verificá el odómetro — si está
> bien, seguí igual."

**El error de guardado avisa que no cierre la pantalla.** No hay borradores
locales (decisión de alcance): si se pierde la conexión, lo único que salva los
90 segundos del mecánico es que el formulario siga abierto.

> "Se cortó la conexión a internet. No cierres ni recargues esta pantalla: los
> datos que cargaste siguen acá. Cuando vuelva la señal, tocá Reintentar."

**Los vacíos no son todos iguales.** Sin datos todavía → explicar qué va a
aparecer + acción. Filtro sin resultados → limpiar filtros. **Sin trabajo
pendiente → se celebra**: "Estás al día", en verde.

**Español rioplatense con voseo.** "Cargá", "escribinos", "mirá". Nunca "carga",
"escríbanos", "mira".

---

## Estados de carga

- Menos de 300ms: **no mostrar nada.** El parpadeo molesta más que la espera.
- 300ms a 2s: esqueleto (respetando la estructura real) o spinner inline.
- Más de 2s: mensaje con contexto.
- **El botón de guardar se deshabilita apenas se toca**, con ancho fijo para que
  no salte el layout. Es lo que evita el service duplicado por doble toque.

---

## Decisiones técnicas

**Server Components por defecto.** Las consultas van en el servidor; las
mutaciones en Server Actions. Cliente solo donde hay interactividad real. Menos
JavaScript en el celular del mecánico.

**Una consulta por pantalla.** Columnas explícitas, nunca `select *`. Sin N+1.
El costo de Supabase se controla acá.

**Sin Realtime.** Un cartón de service no cambia mientras lo mirás. Revalidación
de Next alcanza.

**Componentes propios**, construidos sobre los tokens de `globals.css`. Radix
suelto solo donde el comportamiento accesible es difícil (dialog, combobox).
No usamos librerías de componentes con su propio design system.

**Íconos: Phosphor** (`@phosphor-icons/react`), peso `thin` o `light` — stroke
de 0.5 a 1px, nunca más grueso. **En el panel y en la superficie del cliente,
Phosphor y nada más.**

**La excepción de Lucide, acotada y con su razón.** La landing comercial usa
doce íconos de `lucide-react` (menú, los pasos del simulador, la sección de
precio, el acordeón y los pasos del calco). La razón es de escala: son
señalización a tamaño grande y necesitan stroke 2, que Phosphor light no da.
Los límites, que sí son la regla:

- **Viven todos en `components/iconos.tsx`**, en un bloque marcado, y en
  ningún otro lado. Volver a Phosphor es cambiar ese bloque y nada más.
- **No se propagan al panel ni a la superficie del cliente.** Ahí el
  instrumento es Phosphor light, y mezclar dos familias en la misma pantalla
  se nota aunque nadie sepa nombrar por qué.
- Un ícono nuevo se busca **primero** en Phosphor. Lucide solo si el
  equivalente no existe y es para la landing.

El reflejo original ("lo usa todo sitio hecho con IA") sigue siendo válido y
es exactamente lo que estos límites protegen.

**Todo lo clickeable lleva `cursor: pointer`.** Resuelto una vez en globals.css
para botones, roles de botón, tabs y triggers de Radix — no pantalla por pantalla.

**Gráficos con Visx**, para que hereden nuestros tokens en vez de traer su look.

**Tipos generados desde el schema**, no escritos a mano:
`supabase gen types typescript --local > lib/database.types.ts`

**Analítica y atribución de WhatsApp (09/09/2026).** Los IDs de GA4, Google
Ads y el Píxel de Meta viven en `lib/analitica.ts`; los scripts, en
`components/tracking/etiquetas.tsx`, cargados con `next/script`
(`afterInteractive`) desde el layout raíz y solo con `analiticaActiva`.
**Google Tag Manager ya no se carga:** GA4 va por gtag.js directo, y pegar el
contenedor o el snippet del asistente de GA4 duplica cada visita. El origen
del visitante (UTM, `gclid`, `fbclid`, artículo del blog) lo resuelve
`lib/tracking/origen.ts` en cada carga y queda en `localStorage`
(`fm_origin`, 30 días); el mensaje de WhatsApp se elige en el clic
(`lib/tracking/mensaje.ts`) y todo enlace a WhatsApp de ventas pasa por
`components/tracking/enlace-whatsapp.tsx`, que además manda `whatsapp_click`
(GA4), la conversión de Ads y `Contact` (Meta) sin bloquear la navegación.
`?fm_debug=1` cuenta todo en la consola. La verificación local es
`scripts/verificar-tracking.mjs` contra `next start`. El número de ventas está en
`WHATSAPP_VENTAS` (`lib/landing.ts`) y repetido en `TELEFONO_VENTAS`
(`lib/seo.ts`) y en `public/llms.txt`: cambia en los tres a la vez.

**Ayuda y onboarding (09/09/2026).** Los videos viven en UN archivo,
`lib/ayuda/videos.ts` (`youtubeId: null` = "Video en preparación"; ahí se
pegan los IDs). El reproductor (`components/ayuda/reproductor.tsx`) no carga
nada de YouTube hasta el clic: miniatura de i.ytimg.com y recién después el
iframe de youtube-nocookie. "¿Cómo se usa?" lo pone `CabeceraSeccion` por la
ruta (`solapa` en la lista): una solapa nueva con videos no declara nada. El
onboarding es `/panel/onboarding` con `app/panel/(tras-onboarding)/layout.tsx`
como gate: todo lo que cuelga del grupo exige `onboarding_completado_at`
(viaja en la sesión); afuera del grupo quedan el onboarding, Ayuda y el
manifest. **El progreso son los datos** (`onboarding_estado()`: productos,
`diseno_confirmado_at`, premio o `premio_omitido_at`, según el plan) y las
escrituras del owner van por funciones definer (`confirmar_diseno`,
`omitir_premio`, `marcar_bienvenida_vista`); guardar un producto o un premio
lo evalúa la base sola (triggers `onboarding_productos` / `onboarding_premios`),
así que el último paso completa el onboarding sin que el cliente avise. Las cuentas
que existían recibieron el onboarding completo por backfill; las del seed las
marca `seed.sql`. La bienvenida es CSS (`globals.css` · "La bienvenida") y se
muestra una vez por taller (`bienvenida_vista_at`). Lo vigila R14.

---

## Entorno

- Desarrollo local: `supabase start` (Docker) + `supabase db reset`
- El seed crea el lubricentro demo: slug `demo`, login `demo@fidellimotors.app`
- Y un superadmin para poder abrir `/fidelli`: `santi@fidellimotors.app`. No hay
  registro público y el alta de un superadmin es interna, así que sin esta fila
  la superficie de administración no se puede ni mirar en local. Vive en
  `supabase/seed.sql`, que solo corre en el `db reset` local.
- Mailpit para ver los mails: `http://127.0.0.1:54324`
- Studio local: `http://127.0.0.1:54323`
- Proyecto en la nube linkeado: **solo dev.** Producción NO está linkeada a
  propósito — `db push` no puede tocarla por accidente.

**Las migraciones ya mergeadas a `develop` no se editan.** Un cambio de schema es
siempre una migración nueva.

### El ritual antes de cada `db push`

```
supabase db reset     # aplica todo desde cero Y corre las verificaciones
supabase db push      # solo si el reset terminó en verde
```

**Si el reset falla, no se pushea.** `supabase/verificaciones.sql` corre al final
de cada reset (declarado en `config.toml` → `db.seed.sql_paths`) y hace fallar el
comando con exit 1 si encuentra un problema de aislamiento.

Para consultarlo a mano en cualquier momento:

```sql
select * from verificar_seguridad_vistas();
```

Sin filas = está bien. Con filas = hay un agujero, y cada fila trae el SQL exacto
para taparlo.

**`create or replace view` RESETEA las `reloptions` de la vista** — incluido el
`security_invoker`. Una vista sin esa opción corre con los permisos de su dueño y
**no evalúa las policies**: un owner ve los datos de todos los lubricentros. Ya
pasó dos veces (`vista_proximos_service` nació sin ella; `vista_clientes` la
perdió al agregarle columnas, con un diff que se veía inofensivo). Toda migración
que reemplace una vista tiene que terminar con:

```sql
alter view <la_vista> set (security_invoker = on);
```

**Si insertás a mano en `auth.users`**, fijá en `''` (no `NULL`) las columnas
`confirmation_token`, `recovery_token`, `email_change_token_new` y `email_change`.
GoTrue las escanea como `string` no-nullable y un `NULL` rompe todo login de ese
usuario con un 500 genérico.

**Los enlaces de los mails NO usan `{{ .ConfirmationURL }}` ni `{{ .RedirectTo }}`.**
`ConfirmationURL` apunta a `/auth/v1/verify`, que devuelve la sesión en el
**fragmento** de la URL (`#access_token=…`); el fragmento no viaja al servidor y
`/auth/callback` es un Route Handler, así que el invitado nunca podía activar su
cuenta. `RedirectTo` lo valida GoTrue contra la lista de Redirect URLs del
proyecto y, si no está, lo descarta **en silencio** y arma el enlace contra el
Site URL pelado (fue el bug de producción). Los templates arman el enlace así:

```
{{ .SiteURL }}/auth/callback?token_hash={{ .TokenHash }}&type=invite
```

Condición: el Site URL de cada proyecto tiene que ser la URL de su app (local
`http://localhost:3000`, prod `https://fidellimotors.app`). **Los templates son
configuración del dashboard, no viajan con el repo:** cada cambio en
`supabase/templates/` hay que pegarlo a mano en dev y en prod (Authentication →
Emails), y comprobarlo mirando el `href` del botón en un mail real.

**Cuánto dura un enlace de mail lo decide "Email OTP Expiration"**, en el
dashboard de cada proyecto (Authentication → Sign In / Providers → Email). Ese
único valor gobierna invitación, recuperación, confirmación y cambio de mail. El
default de la nube es **una hora**; el `otp_expiry = 86400` de `config.toml` sólo
manda en local. Los mails y las pantallas prometen 24 horas, así que **dev y prod
tienen que estar en 86400** (el máximo del dashboard). Con el default, todo owner
que abre la invitación a la tarde llega a "La invitación ya venció" (pasó en
producción el 2026-09-08). Aun así, un enlace vencido no es un callejón: en
`/auth/enlace?tipo=invite` el owner se pide otra invitación con su mail
(`lib/auth/invitacion.ts`, sólo para cuentas nunca activadas, una por minuto), y
`/auth/callback` deja en los logs el código con el que GoTrue rechazó el enlace.

### La clave `service_role`

Va **solo en el servidor**, nunca con prefijo `NEXT_PUBLIC_`. Se usa por una sola
puerta, `lib/supabase/admin.ts`, que lleva `import "server-only"`: si alguien la
importa desde un componente de cliente, el build falla. Su único uso es la API de
administración de Auth (invitar al owner de un lubricentro), porque esa API no
acepta la clave anónima. Todo lo demás va por `lib/supabase/server.ts` con la
sesión del usuario y su RLS — si una consulta "necesita" `service_role`, casi
siempre lo que falta es una policy.

**El alta de un tenant son dos fases y el orden no es negociable:** primero el
lubricentro (una transacción en Postgres, `crear_lubricentro()`), después la
invitación (una llamada HTTP). No se pueden hacer atómicas. Si falla la segunda
queda un lubricentro "Sin owner", que se arregla con un botón; al revés quedaría
un usuario en `auth.users` sin tenant, que no se arregla desde el panel.

### Un lubricentro suspendido lee, pero no escribe

`activo = false` no le corta el acceso: entra con sus credenciales de siempre y
ve todos sus datos. Lo que no puede es escribir. Por eso hay **dos helpers de
sesión y no uno**:

| Helper | Quién lo usa | Qué hace |
|---|---|---|
| `obtenerSesion()` | pantallas | la sesión, sin más |
| `sesionParaEscribir()` | Server Actions del panel | sesión + tenant + **no suspendido**; si no, redirige |

La guarda no puede vivir dentro de `obtenerSesion()` porque las pantallas
también la llaman y tienen que seguir funcionando. Para meterla ahí habría que
saber en tiempo de ejecución si se está renderizando o ejecutando una acción, y
Next no expone eso de forma estable: lo único que hay es la cabecera interna
`next-action`. Una guarda apoyada en un detalle interno deja de funcionar **en
silencio** el día que ese detalle cambie.

Como la separación es explícita, lo que garantiza que nadie se la saltee es el
lint: `eslint.config.mjs` prohíbe importar `obtenerSesion` desde
`app/panel/**/actions.ts`. Una acción nueva no pasa `npm run lint` hasta que use
`sesionParaEscribir()` o declare por escrito —con un `eslint-disable-next-line` y
un comentario— que solo lee.

**La suspensión sigue sin tocar RLS**: a nivel base el owner puede operar, y así
tiene que quedar. Bloquearlo ahí complicaría el desbloqueo y el histórico.

---

## Las diez reglas del sprint de agosto — se rompen y no avisan

Cada una existe porque romperla **no da error**: el build pasa, los tests no
dicen nada y el daño aparece semanas después en los datos de un cliente.
Están ordenadas por lo que cuesta el descuido.

**1 · El control por plan vive en dos capas o no vive.** RLS rechaza en
silencio y la aplicación sola se evade con una llamada directa a la API. Las
dos, siempre, contra `plan_permite()`. Una feature nueva que solo se chequea
en React no está gateada.

**2 · Un cambio de plan nunca borra datos.** Se apaga la ESCRITURA, nunca la
lectura. Por eso el gating va en `WITH CHECK` y jamás en `USING`: con `USING`
un downgrade haría desaparecer de la pantalla lo que el tenant ya tenía.

**3 · `plan_permite()` revienta con un nombre desconocido** en vez de
devolver `false`. Un feature mal tipeado que devuelve `false` es una función
apagada para todo el mundo, en silencio y para siempre.

**4 · Ninguna vista se reemplaza sin volver a fijar `security_invoker`.**
`create or replace view` resetea las `reloptions`, y una vista sin esa opción
corre con los permisos de su dueño: un owner ve los datos de TODOS los
lubricentros. Ya pasó dos veces. Toda migración que toque una vista termina
con `alter view <la_vista> set (security_invoker = on);`.

**5 · `vista_proximos_service` filtra por tipo.** Si pierde ese filtro, una
mecánica pasa a contar como "último service" y los autos con mecánica
desaparecen de la retención **sin ningún error**. Es el peor bug posible del
producto: la pantalla que trae la plata se vacía sola. Lo vigila R2.

**6 · No hay importes en el modelo operativo.** Ni en `services`, ni en
`service_items`, ni en los pendientes. Los precios viven SOLO en
`presupuestos` y en `productos.precio_venta`. El día que un service tenga un
total, esto pasa a ser un sistema de facturación y hay que sostener IVA,
notas de crédito y numeración fiscal.

**7 · El modo oscuro es elección del LUBRICENTRO, no del visitante.** Es un
campo de `config_experiencia`, no `prefers-color-scheme`. Con la preferencia
del sistema, la página de un taller oscuro se vería clara para la mitad de
sus clientes y el pedido queda sin resolver. **Los documentos nunca van en
oscuro**: presupuesto, cartón impreso y hoja de calcos salen siempre claros,
también el PNG que va por WhatsApp.

**8 · La superficie del cliente sobrevive a la suspensión; el panel no.** Un
tenant suspendido conserva su página pública —apagarla mataría todos los
calcos pegados en los parasoles de sus clientes— pero no puede escribir. El
premio y el mensaje al escanear sí se apagan: no se promete un beneficio que
el local no puede entregar. Está comentado en `get_carton`/`get_landing` y lo
vigila R4. **No "arreglar" esto devolviéndole el `and l.activo` al where.**

**9 · Cero logos de automotrices.** Ninguna de las fuentes evaluadas otorga
licencia: todas licencian la colección y desligan la marca registrada. La
marca se muestra como insignia tipográfica. Si algún día hay una licencia por
escrito, el logo entra en el contenedor de `InsigniaMarca` sin tocar layout.

**10 · El copy nunca revela el tamaño del equipo.** Ni "somos dos", ni "el
equipo", ni "nuestro CTO". El lubricentro está comprando continuidad.

Y las tres que dejó el módulo de gomería (septiembre de 2026). Ninguna estaba
escrita en ningún lado, y las tres se pisaron en el mismo sprint:

**11 · Los CHECK y las policies por tipo admiten valores nuevos en silencio.**
Todo lo que esté escrito como `tipo <> 'algo' or (...)` se evalúa como
verdadero para cualquier valor del enum que no sea `algo`. Agregar un valor a
`tipo_trabajo` sin sumar su propio CHECK y su propia condición en las dos
policies de `services` deja ese tipo sin restricciones y sin gating de plan,
también por la API directa. No da error, no rompe el build y no lo atrapa
ninguna prueba que no se haya escrito para eso. El caso real: con
`'neumaticos'` en el enum y sin `20260911120100`, una fila de gomería entraba
con viscosidad de aceite y descripción de mecánica a la vez, y el módulo pago
quedaba gratis para los trece tenants. Cuando agregues un valor a un enum que
aparezca en un CHECK o en una policy, buscá todas las apariciones del enum en
`supabase/migrations` y cerrá cada una. Lo vigila R15.

**12 · No llames funciones `security definer` sin guarda desde una vista
`security_invoker`.** `feature_de_tenant()` es definer y no está grantada a
`authenticated` a propósito: grantarla dejaría a cualquier owner leyendo las
features de todos los tenants. Llamarla desde una vista o función invoker hace
que la consulta explote con `permission denied`, y el front muestra una lista
vacía sin un solo error a la vista — el listado de `/fidelli` dijo "Todavía
no hay ningún lubricentro" con trece tenants en la base. Usá
`plan_permite()`, que es la puerta pública y está atada a
`mi_lubricentro_id()`, o resolvé los tres escalones en línea con
`plan_overrides` y `planes.features`. Nunca grantes la definer para salir del
paso. Lo vigila R15i.

**13 · Una prueba que nunca viste en rojo no existe.** El caso real: R15a
verificaba el gating de `services` cargando un trabajo con ruedas, y con la
policy que decía probar rota seguía en verde — lo que rechazaba era la policy
de `service_ruedas`. Por cada prueba nueva, rompé a mano exactamente lo que
dice cubrir y confirmá que falla. `scripts/regresion-retencion.sh` y
`scripts/regresion-neumaticos.sh` son el molde: reconstruyen la vista o la
función rota con un `sed` sobre la migración, corren el bloque de
`verificaciones.sql` que la cubre y esperan la excepción. Es la práctica del
proyecto, no un script de un módulo: un bloque nuevo de la red trae su rotura.

Y las dos del sprint de vehículo pesado (septiembre de 2026), que no rompen el
build y se pisan en el primer `alter type` o en el primer mapa de etiquetas:

**14 · El orden del enum `item_tipo` es el orden del cartón.** `order by
item_tipo` es lo que dibuja el papel en `get_carton`, en la exportación y en
pantalla. Un valor nuevo agregado al final —o anclado en el lugar equivocado—
pone el filtro de urea después de los aditivos en el cartón de un camión, sin
error y con el build en verde. Todo valor nuevo entra con `add value … after`,
**anclado a un valor que ya existía antes de esa migración** (anclar a uno
agregado en la misma transacción es justo lo que Postgres puede rechazar), en
orden inverso al del cartón —cada uno empuja al anterior hacia abajo— y en una
migración sola, sin nada más adentro: un valor nuevo de enum no se puede usar
en la transacción que lo crea. El molde es `20260915120000_item_tipo_pesado`.
Ninguna función SQL enumera valores de `item_tipo` y así tiene que seguir:
`guardar_service` y `actualizar_service` castean el jsonb entrante de forma
genérica. Lo vigila R17.

**15 · `filtro_hidraulico` y `aceite_hidraulico` son dos renglones distintos.**
El filtro es del sprint de vehículo pesado y vive en FILTROS; el aceite existe
desde el día uno y vive en ACEITES. En el papel los dos dicen "Hidráulic." y
los distingue la etiqueta vertical del grupo. Es el error más fácil de cometer
al tocar `lib/renglones.ts` o `ETIQUETA_RENGLON` en la exportación: un renglón
mapeado al otro no da error, guarda el aceite como filtro y el Excel del
cliente miente. Lo mismo con las dos relecturas de pesado ("Combustible
primario", "Diferencial trasero"): son el MISMO `item_tipo` que "Combustible" y
"Diferencial", cambia solo cómo se lee la etiqueta en la carga y en el papel, y
en el Excel va siempre la neutra —dos nombres para el mismo valor rompen
cualquier tabla dinámica del cliente.

Y la que deja el sprint de cobranza (septiembre de 2026):

**16 · Toda la plata es DATO, no constante, y todo cambio de plata deja
rastro con autor, fecha y motivo.** Los precios de lista, los dos
`descuento_*_pct` y `modulos.precio_mensual` viven en la base y se mueven
por `fijar_precio_plan()` / `fijar_precio_modulo()`, que exigen motivo y
registran en `cambios_precio_catalogo`. Un `UPDATE` suelto sobre esas
columnas lo rechaza el candado (`bloquear_precio_directo`), venga de donde
venga. **Nunca hardcodees un porcentaje en TypeScript**: el 25% del anual
vale 25 en producción y 15 en el default de la migración que creó la
columna, así que el número escrito a mano se rompe en silencio el día que
Santiago lo ajuste desde `/fidelli/precios`.

Y el corolario que costó encontrarlo: **el catálogo local tiene que ser el
de producción.** Hasta la migración `20260916100000` no lo era —el
semestral valía 10 en local y 0 en prod, y el plan del demo estaba a
$45.000 contra $46.750— y eso no es cosmético: la pantalla de pago decide
si OFRECE el período semestral mirando `descuento_semestral_pct > 0`, así
que la opción aparecía en local y no en producción. Quien probara ahí
concluiría que la regla anda. Lo vigila R20b, que corre **después** del
seed porque el plan del demo nace en `seed.sql` y no en las migraciones.

**17 · El reloj de cobranza tiene TRES interruptores, y dos arrancan
apagados.** `lubricentros.cobranza_desde` (NULL = este tenant está afuera
del reloj) decide si el reloj **avisa**; `lubricentros.suspension_automatica`
decide si puede **cerrar el panel**; y desde `20260917140000`
`bloqueo_de_alta_activo()` decide si puede cerrarle el panel **al que nunca
pagó**, que es una escalera distinta —de dos escalones, sin gracia— y por eso
tiene su propio interruptor.

El tercero es una FUNCIÓN y no una columna, y eso no contradice lo de abajo:
lo que sigue dice que *prendido en prod y apagado en local* tiene que ser un
dato. Los dos primeros son exactamente ese caso (rollout tenant por tenant,
solo en producción). El tercero no: está apagado en todas partes y el día que
se prenda, se prende en todas a la vez, porque lo que lo destraba es un hecho
del mundo —un pago real con el monto correcto— y no un rollout. Mismo caso que
`alias_confirmado_por_cresium()`. El primer ciclo es solo avisos: la
primera vez que esto corre es la primera vez que el cálculo de plata se
encuentra con tenants reales, y un monto mal calculado que ADEMÁS suspende
a alguien no se arregla con una disculpa.

Son COLUMNAS y no funciones, y eso no es un detalle de estilo: una función
vive en una migración, y una migración vale lo mismo en local y en
producción **por construcción**. Prendido en prod y apagado en local tiene
que ser una diferencia de DATOS. Escrito como función, la migración que
prende el reloj dejaría el `db reset` en rojo para siempre.

El estado se DERIVA (`estado_cobranza`), nunca se guarda: nada de un cron
dando vuelta booleanos — el día que no corre todos quedan gratis, y el día
que corre dos veces suspendés a alguien que pagó. `activo = false` gana
siempre; `descuento_pct = 100` queda fuera del circuito entero (quien no
paga nada no puede deber nada); el demo no entra nunca, y lo cuida un
trigger porque un `where` olvidado en el UPDATE de encendido lo metería en
silencio. Lo vigila R21.

**18 · Un campo calculado de PostgREST es TAMBIÉN un endpoint `/rpc/`, y el
composite lo elige quien llama.** `reloj_cobranza(lubricentros)` es
`security invoker` a propósito: como definer, filtrando por un
`lubricentro_id` que viene adentro del argumento, cualquier owner
autenticado lee el vencimiento, el período, el descuento negociado y el
precio del tenant de al lado. **Se verificó explotable en vivo** durante el
diseño de este sprint, sobre `plan_capacidades`, que tiene esa forma. El
uuid de la víctima no es secreto: viaja en el `logo_url` público de su
propia vidriera. Como invoker el RLS recorta la subconsulta y el composite
forjado devuelve null.

⚠ Y la prueba de esto se escribe con `jsonb_populate_record`, **no** con un
join contra la tabla: leer la fila del vecino ya lo bloquea el RLS, así que
la versión con join pasa en verde aunque la función sea definer. Las dos
veces que se escribió mal, la rotura de R21e se escapó. Lo vigila R21e.

**19 · Cresium FIRMA LA URL COMPLETA en sus webhooks, y su documentación
dice lo contrario.** La página "Webhooks - Autenticación y generación"
define el segmento como *"PATH: el path completo del endpoint de webhook
del Partner"* y da de ejemplo `/webhooks/partner?token=xyz`. Su
implementación manda `https://fidellimotors.app/api/cresium/webhook`.
Medido con una entrega real el 16/09/2026: catorce intentos rechazados con
401 antes de encontrarlo. La ruta acepta **las dos formas** — las dos son
HMAC con nuestro secret, así que aceptar ambas no abre nada, y el día que
lo corrijan el webhook sigue entrando.

Y el corolario, que es la regla de verdad: **un doble de pruebas que
reproduce la DOCUMENTACIÓN en vez de la REALIDAD da verde mientras
producción rechaza todo.** Pasó dos veces en el mismo sprint — con la
firma del webhook y con el envoltorio `data` de las respuestas. Cuando el
doble y el original no se pueden contrastar contra una llamada real, el
verde del doble no prueba nada: prueba que dos piezas escritas por la
misma cabeza están de acuerdo.

**20 · El `externalId` de una orden es único en Cresium PARA SIEMPRE**,
también después de `PAID` o `EXPIRED`, y borrar nuestra fila no lo
libera. Medido el 16/09/2026: la orden de los $390 quedó pagada, se limpió
`cresium_ordenes` para volver a probar, y el intento siguiente —mismo
vencimiento, misma referencia— volvió con `400 EXISTING_EXTERNAL_ID`. Y
no era de las pruebas: un tenant que genera la cuenta, deja pasar los
siete días y vuelve, caía en el mismo callejón. Por eso la referencia
lleva número de intento (`sub:hasta`, `sub:hasta:2`, …; todo en
`lib/cresium/orden.ts`), el parser del webhook lee SOLO las dos primeras
partes, y una orden sin pagar de más de siete días se trata como vencida
aunque la fila diga `NOT_PAID`: el único webhook es el de `DEPOSIT`, nadie
avisa cuando una orden vence. Lo vigilan R22e,
`scripts/regresion-cobranza-cresium.sh` y
`node --no-warnings scripts/regresion-cresium-orden.mjs`, que además
sostiene que el doble conteste los bytes reales del rechazo (400 y el
código, no el 409 que uno escribiría).

Y la que deja el sprint de políticas (septiembre de 2026):

**21 · Los textos legales viven en `content/legal/` con versión. Cambiar un
texto de forma relevante = subir `VERSION_LEGAL` = todos vuelven a aceptar.
Nunca se editan in place sin subir la versión.** La fuente única es
`lib/legal.ts` (`VERSION_LEGAL`, `VIGENCIA_LEGAL`); el frontmatter de
`content/legal/terminos.md` y `content/legal/privacidad.md` tiene que
coincidir, y si no coincide el render de `/terminos` y `/privacidad` —y el
build— fallan con el mensaje que dice cuál. Los textos se publican tal cual:
son copy aprobado y vinculante, no se "mejoran". La aceptación es producto:
`aceptaciones_terminos` guarda una fila por (tenant, versión) —historial,
nunca una columna— con los tres candados de evidencia; el panel la exige
en cada request por el campo calculado `aceptaciones_legales` del select de
la sesión, y el modal bloqueante va ANTES que el gate del onboarding. La
versión vigente NO vive en la base a propósito: guardarla ahí sería una
segunda fuente que se desincroniza en silencio. Exentos: el superadmin y el
tenant demo, por slug. Lo vigila R27.

---

## La red de regresión — qué protege cada cosa

`supabase/verificaciones.sql` corre al final de **cada `supabase db reset`**
(declarado en `config.toml` → `db.seed.sql_paths`) y hace fallar el comando
con exit 1 si algo se rompió. **Si el reset falla, no se pushea.**

**Si ves una de estas en rojo, NO la borres para que pase el build.** Cada
una tapa un agujero que ya existió o que costaría muy caro descubrir en
producción. El mensaje de la excepción dice qué invariante se rompió.

| # | Qué protege | Qué significa que falle |
|---|---|---|
| **R1** | Un plan sin `premios` no puede escribir un premio ni por SQL directo | El gating de RLS se cayó: la capa de aplicación quedó sola y se evade por API |
| **R2** | Una mecánica **no** altera la fila de retención del vehículo (campo por campo) | La regla 5. Los autos con mecánica están por desaparecer de "A quién llamar" |
| **R3** | Un plan Basic carga un service común y **no** una mecánica | El gating condicional al tipo se rompió — o Basic quedó sin poder trabajar |
| **R4** | La página pública de un tenant suspendido responde, con el premio oculto | La regla 8. O se apagó la vidriera de un suspendido, o se le está ofreciendo un premio que no puede entregar |
| **R5** | Los estados del pendiente por fecha y por kilómetros (vencido/urgente/próximo) | El cálculo de urgencia cambió: la lista de a quién llamar está mintiendo |
| **R6** | Tildar un pendiente y guardar el trabajo ocurren en la MISMA transacción | Se puede guardar un service y perder la resolución del pendiente, o al revés |
| **R7** | Un plan sin `pendientes` no puede crear uno | Ídem R1, para pendientes |
| **R8** | La numeración de presupuestos es correlativa por tenant bajo concurrencia | Dos presupuestos con el mismo número, que es un documento que el cliente ya tiene en la mano |
| **R9** | Un producto sin stock sigue funcionando; el descuento baja lo correcto (renglón × cantidad, aceite a granel × litros, aceite envasado 1 por service); el aviso suena y calla | El stock opcional dejó de serlo, el descuento se aplica dos veces, o un bidón pierde tantas unidades como litros se anotaron |
| **R10** | El piso de anonimato de los modelos: ≥3 vehículos en ≥2 lubricentros | Un modelo cargado por UN solo tenant se le está filtrando a otro. Es una fuga entre clientes |
| **R11** | Un tenant sin configurar rinde igual que siempre; el mensaje al escanear respeta feature, vigencia y suspensión en las dos capas | Un tenant cambió de aspecto sin pedirlo, o se está mostrando un mensaje que no corresponde |
| **R13** | Las patentes de moto (`123ABC`, `A123BCD`) entran por el CHECK, por `corregir_patente` y por `get_carton`; lo que no es patente sigue afuera | Alguien volvió a cerrar el formato a autos, o lo abrió a cualquier cosa |
| **R14** | Ninguna cuenta queda con `onboarding_completado_at` null tras el seed; las funciones del onboarding son definer; un Basic tiene dos pasos y nunca se le pide el premio; el estado de otro tenant no se lee | Una cuenta vieja vería el panel bloqueado, o un taller no podría salir nunca del onboarding, o se le pide una función que su plan no tiene |
| **R15** | El módulo de gomería (bloque 1): sin el módulo no entra un trabajo de neumáticos ni por SQL directo —en dos variantes, porque la de "solo alineación" es la única que aísla la policy de `services`—; no altera la retención; los CHECK del tercer tipo y de cada rueda; el stock baja una por rueda colocada; el premio sigue `alcance`; apagar el módulo no le saca a nadie lo que ya cargó; el listado de `/fidelli` sigue respondiendo | La regla 11 o la 12. El módulo pago quedó abierto, o la superficie de administración quedó vacía sin error |
| **R16** | Los retornos de gomería (bloque 2): `vista_proximos_service` devuelve exactamente las mismas filas antes y después de cargar trabajos de gomería; la vista nueva es invoker y solo para tenants con el módulo; cada motivo (rotación, alineación, reajuste, antigüedad, desgaste) con su regla; el anti-spam por ciclo; el beneficio de la compra y su apagado; los CHECK y el RLS de `config_neumaticos`; `resumen_inicio` emite el tipo; el ritmo sale de todos los trabajos con km | La regla 5 otra vez, o un motivo que dejó de avisar: la pantalla que trae la plata miente en silencio |
| **R17** | Los renglones del vehículo pesado: el enum `item_tipo` tiene los 21 valores en el orden exacto del cartón; `guardar_service` y `actualizar_service` aceptan los 21 tal cual y `get_carton` los devuelve en el orden del papel | La regla 14: el cartón de un camión se dibuja fuera de orden, o alguien enumeró los valores de `item_tipo` en SQL y los diez de camión quedaron afuera |
| **R18** | La clase del vehículo: `vehiculos.clase` es anulable y sin default; el enum es exactamente `(liviano, pesado)`; `crear_cliente_con_vehiculo` guarda la clase contestada y deja null la omitida; `vista_vehiculos` y `get_carton` la exponen (null como null) | Alguien marcó los ~1.800 vehículos como autos "para simplificar", el alta perdió la clase, o el papel del cliente volvió a ser el de un auto para un camión |
| **R19** | Editar un vehículo sin contestar la clase la deja como estaba: el update de `editarVehiculo` sin la clave no la toca, null o contestada, y nada de la base la inventa | Una sugerencia pasó a ser una respuesta: un trigger o un default clasifica autos que nadie clasificó, o una edición pisa una clase guardada |
| **R21** | El reloj de cobranza: los cuatro estados con sus bordes exactos y el contador que vale 1 el último día útil; `activo = false` gana sobre todo, `descuento_pct = 100` exime y sin `cobranza_desde` no hay reloj; el SEGUNDO interruptor (con `suspension_automatica` apagada avisa pero no cierra el panel); las nueve claves del payload; la lectura cruzada de tenants con un composite forjado; y los montos (Pro anual, módulo pago vs bonificado, el founding que no toca el módulo) | Un cliente que pagó se suspende solo, un bonificado recibe una factura de $25.000, el primer ciclo dejó de ser solo avisos, o un owner está leyendo la negociación comercial del de al lado |
| **R22** | El cobro por Cresium: `pagos.registrado_por` es anulable pero el CHECK impide un pago manual sin autor y uno de Cresium sin id de transacción; cinco entregas del mismo depósito dejan UN pago; `PARTIAL` no mueve el vencimiento; la evidencia se guarda siempre, acredite o no; la referencia con sufijo de intento (`sub:hasta:2`) acredita a la misma suscripción; y **la evidencia no se borra, no se edita y no se vacía** —los tres candados, más el contra-chequeo de que no se coman las seis escrituras del webhook | Un reintento le regaló otro período a alguien, un cobro automático quedó indistinguible de uno tipeado a mano, una transferencia parcial activó una suscripción que no se pagó, o la tabla de evidencia volvió a ser un log que se puede vaciar |
| **R23** | La pantalla de cobranzas de `/fidelli`: un owner lee CERO filas (la función es definer y cruza `usuarios` y `contactos_fidelli` de toda la plataforma); el monto sale de `monto_de_renovacion_en()`, la misma función que la pantalla de pago del cliente; y quien tiene el plan bonificado no aparece | Un dueño de lubricentro está leyendo el vencimiento, el monto y el teléfono de todos los demás, o el WhatsApp le cotiza un número distinto del que el cliente ve en su pantalla |
| **R20** | El catálogo de cobranza: `modulos` existe con su precio y su `codigo` coincide con la clave del override; el catálogo local es el de producción (el plan del demo afuera, el semestral en 0); el candado rechaza un `UPDATE` suelto de precio pero NO bloquea `activo`/`features`; el motivo es obligatorio y un guardado que no mueve ningún número no ensucia la auditoría | Un precio se movió sin dejar rastro, el módulo se cobra mal o no se cobra, o el `db reset` volvió a dejar un catálogo que no es el real y el cálculo de plata se prueba contra números que no existen |
| **R24** | La atención de `/fidelli` exime al 100%: un tenant bonificado no aparece con ninguno de los cuatro estados, en ninguna fecha —tampoco como `trial_vencido`, porque el precio ya es cero— y el listado y la ficha lo dicen igual porque comparten `estado_atencion()`. Con el contracaso en las dos posiciones del caso real: sin descuento, a 4 días y vencido hace 4, los dos estados vuelven | Se está llamando para cobrarle a alguien que no debe nada (el caso Brothers Oil del 20/09/2026), o —peor— la exención se comió la lista entera y la pantalla que trae la plata se vació sola |
| **R25** | El alias fijo por tenant: el interruptor `alias_confirmado_por_cresium()` está APAGADO y la puerta rechaza incluso un alias con la forma correcta; no hay un solo alias asignado en la base; un alias escrito no se cambia ni por UPDATE directo; la unicidad (puerta e índice, que son dos defensas distintas); el formato y los dos largos con su contracaso; y el alta, que asigna por la MISMA puerta y aborta entera si el alias falla | Se asignó un alias antes de que Cresium confirmara el formato —y no hay vuelta atrás barata, porque el tope de cambios por CVU es un número que todavía no sabemos—, o un tenant terminó con un alias distinto del que ya dejó cargado en su home banking |
| **R26** | El alta prende el reloj y el primer pago define el ciclo: el tenant nuevo nace PAGANDO con `cobranza_desde` escrito y el vencimiento al día siguiente, **y ningún otro tenant entra al reloj por eso**; el primer pago que llega TARDE corre `inicio` y `vencimiento` a la fecha del pago con el largo contratado, y el que llega en plazo —o una renovación— no; las dos puertas del cobro hacen lo mismo; y la marca de la cuarta pantalla del onboarding es definer y se escribe una sola vez | El rollout volvió a ser el UPDATE peligroso contra 17 filas, un tenant que tardó cinco días en terminar el onboarding perdió cinco días de su primer mes, o el cobro manual —el que se va a usar en las primeras altas— quedó fuera del cambio |
| **R27** | Las páginas legales y la aceptación de los Términos: los cuatro slugs (`terminos`, `privacidad`, `legal`, `condiciones`) reservados por `slug_reservado()` Y por el CHECK; `aceptaciones_terminos` con sus tres candados en `ALWAYS` (delete, update y truncate rechazados); `aceptar_terminos()` escribe el tenant y el usuario DE LA SESIÓN, es idempotente por versión, guarda el historial (la fila de 1.0 sigue tras aceptar 1.1) y un superadmin no acepta; el predicado distingue versiones y exime al demo por slug; y el aislamiento —un owner lee cero filas ajenas y el campo calculado con un composite forjado (regla 18) devuelve vacío— | Un lubricentro puede pisar una página legal, un tenant "aceptó" un texto que nunca vio (o subir `VERSION_LEGAL` dejó de pedir nada), el contrato se puede borrar o editar, o un owner está leyendo las aceptaciones del de al lado |
| **R28** | Las consultas sin resultado no guardan la patente: cero filas con `not encontrada and patente is not null` tras el seed; el índice de leads no existe; el CHECK y el trigger existen; `get_carton` registra la consulta sin resultado con patente null y la de un auto encontrado con su patente; un insert directo la anula; `resumen_inicio` sigue contando los leads | La vidriera volvió a guardar patentes de gente que no es cliente de nadie —la política promete lo contrario—, o la métrica de escaneo del Inicio se apagó |
| **R29** | La retención y la purga: `cancelada_at` se escribe al cancelar y se limpia al volver; la simulación escribe en `purgas` (conteos y logo pendiente) sin borrar ni tocar `lubricentros`; la purga real borra las tablas listadas, no toca `pagos`, `suscripciones`, `sucursales` ni `usuarios`, deja `activo = false` y `purgado_at`, y respeta el plazo (el de 11 meses y el demo cancelado hace 13 no se tocan); dos veces no; a pedido exige motivo, rechaza al demo y al ya purgado, y queda auditada con quién; un owner no la ejecuta; el reloj está en `cron.job` EN SIMULACIÓN; `purgas` tiene los tres candados en `ALWAYS` | "Solo cuenta" y borró, se llevó la contabilidad, purgó a alguien antes de los 12 meses (o al demo), el reloj se prendió en real antes de ver una simulación, o la purga no dejó evidencia |
| **R30** | La supresión de un cliente final: el owner de otro tenant no puede; sin motivo no; los cuatro sentinelas quedan escritos y el vehículo y el service siguen; la auditoría dice quién y por qué; `vista_clientes` sigue devolviendo al cliente (la ficha abre); el teléfono sentinela no tiene dígitos; dos veces no; el libro no se escribe por fuera de la función; el superadmin también puede | Cualquier owner anonimiza a cualquiera, anonimizar se llevó los trabajos, o la supresión no quedó auditada |
| **R31** | Los cimientos de las métricas (docs/METRICAS.md): `tenant_eventos` es inmutable (UPDATE, DELETE y TRUNCATE fallan); un pago deja exactamente UN evento y el pago sobrevive a un trigger roto; `cerrar_dia()` es idempotente y no cierra hoy; `mrr_plataforma()` = Σ `mrr_de_tenant()`, con el módulo pago adentro y el anual dividido 12; `es_activo()` es false con `activo = false` y con el reloj en `suspendido`; suspender exige motivo y deja `suspension` con motivo y actor; el alta, el origen, el override y el cambio de plan dejan su evento; y tras el seed hay un `alta` por tenant y un evento por pago | La memoria de las bajas y del churn se puede editar o vaciar, un cobro se pierde por un trigger, el cron duplica fotos, o el MRR volvió a calcularse sin el módulo o sin mensualizar |

Además, fuera del reset, **las roturas a mano** (regla 13):

```bash
./scripts/regresion-retencion.sh
./scripts/regresion-neumaticos.sh
./scripts/regresion-pesado.sh
./scripts/regresion-cobranza.sh
./scripts/regresion-cobranza-reloj.sh
./scripts/regresion-cobranza-cresium.sh
./scripts/regresion-cobranza-deudas.sh
./scripts/regresion-cobranza-alias.sh
./scripts/regresion-cobranza-alta.sh
./scripts/regresion-legal.sh
./scripts/regresion-legal-datos.sh
./scripts/regresion-metricas.sh
```

El primero rompe la vista de retención de dos formas —le saca el filtro de
tipo y le saca `security_invoker`— y verifica que la red **atrape las dos**.
El segundo rompe cada regla del módulo de gomería (22 roturas: cada motivo
apagado, el gate del módulo, el anti-spam, el beneficio, los CHECK, el RLS,
el tipo en Inicio…) con un `sed` sobre las líneas marcadas `-- @algo` de la
migración, y espera ver cada bloque de R16 en rojo. El tercero rompe R17,
R18 y R19 (seis roturas): un valor de `item_tipo` agregado al final del enum
sin `after`, un CHECK en `service_items` con la lista de los once renglones
de siempre, `vehiculos.clase` con default `'liviano'`, el alta que ignora
`p_clase`, `get_carton` que calla la clase y un trigger que la rellena al
editar. El cuarto rompe R20 (ocho roturas): el código del módulo con un
typo, el módulo a precio cero, el plan del demo de vuelta en el catálogo,
el semestral en su default de 10, el plan del demo al precio del seed, el
candado que deja pasar todo, y las dos del motivo. **La del motivo saca
las DOS defensas —el chequeo de la función y el `CHECK` de la tabla—
porque sacando una sola el invariante queda en pie y el bloque pasaría en
verde con razón**: una rotura que no rompe nada es una prueba que miente.
Son la prueba de que las pruebas sirven de verdad. El quinto rompe R21
(diez roturas): el borde de la gracia corrido un día, la ventana en cero,
el contador sin el `+1`, la exención bajada al 50, el interruptor manual
que deja de ganar, el reloj corriendo para los que están afuera, **el
segundo interruptor ignorado**, el candado del demo desarmado, el payload
como `security definer` y el módulo cobrado sin mirar el motivo. El
sexto rompe R22e: el parser del webhook apretado a exactamente dos partes,
con lo que la referencia del segundo intento (`sub:hasta:2`) deja de
encontrar la suscripción. El séptimo rompe R24 y el candado de R22 (catorce
roturas): la exención del 100% corrida al 101 y achicada a los dos estados
de cobranza —con lo que un trial bonificado vuelve a contar como venta por
cerrar—, los dos llamadores pasando un 0 en vez del descuento (que es la
forma más probable del bug: **el cuerpo de una función SQL no se valida al
aplicarla**, así que arreglar la función y olvidarse del llamador no hace
fallar ninguna migración), y los tres candados de `cresium_eventos`
bajados a `notice` de a uno. Tres de sus roturas no rompen nada visible y
por eso son las que importan: **la lista de columnas del candado de edición
acortada** (una lista se acorta sola en un refactor y deja `external_id`
editable sin que nada chille), **la ficha que deja de marcar a nadie** en
vez de marcar de más, y **los tres triggers bajados de `ALWAYS` a
`ORIGIN`**, que no cambia ningún comportamiento hasta que alguien escribe
`set session_replication_role = replica` — por eso R22g lo chequea contra
`pg_trigger.tgenabled` y no contra lo que la base hace. Y **dos van contra
el candado de edición en direcciones opuestas** —una que deja pasar todo y
una pasada de rosca que bloquea las seis escrituras del webhook— porque un
candado de evidencia se rompe por defecto Y por exceso, y el exceso rompe
el cobro sin dar un error visible. El octavo rompe R25 (diez roturas) y es de una clase distinta a
todas las anteriores: **la mitad de lo que R25 vigila es que NADA PASE**
mientras Cresium no conteste el largo máximo, el formato exacto y el tope
de cambios de alias. Una conducta que consiste en no hacer nada es
exactamente la que se rompe sin que nadie se entere, así que la primera
rotura es prender el interruptor, y la segunda es la verosímil: dejar el
chequeo pero correrlo DESPUÉS de validar la forma, con lo que un alias mal
formado se sigue rechazando —y la mitad de las pruebas sigue en verde—
mientras uno bien formado entra. **Dos de sus roturas no tienen
contrapartida y está escrito por qué**: sacarle el `where` al índice
parcial no rompe nada (dos NULL nunca colisionan en un unique) y sacarle
el `lower()` tampoco, porque el CHECK de formato rechaza las mayúsculas
antes de que el índice opine. Una rotura que no rompe nada es una prueba
que miente sobre lo que cubre, así que no se escribe: se escribe el
comentario que dice por qué no está. El noveno rompe R21g y R26 (doce roturas), y su rotura
central es de una clase que ninguna otra red podía atrapar: **la rama del que
nunca pagó movida de lugar**. Está guardada por `p_nunca_pago` y las catorce
llamadas literales de R21a/b/c pasan cinco argumentos, así que se la puede
poner arriba de `@activo`, arriba de `@exento` o abajo de `@borde` y las diez
roturas del reloj siguen en verde — puesta abajo del borde, el tenant nuevo
atraviesa la ventana de gracia entera, que es exactamente lo que el bloque
prohíbe. También rompe el `>` del plazo por un `>=` (con lo que un alta a las
23:50 tiene diez minutos), el alta que le prende el reloj a TODOS, y la
condición «y tarde» del primer pago, sin la cual un cliente viejo del que
nunca registramos un pago pierde días en su próxima renovación.

El décimo rompe R27 (diez roturas): `legal` sacado de `slug_reservado()`;
`aceptar_terminos()` como invoker (la puerta se cierra para todos) y
`aceptar_terminos()` que registra la fila en OTRO tenant que el de la
sesión —la forma en que una aceptación deja de ser una aceptación—; el
predicado que ignora la versión (subir `VERSION_LEGAL` no vuelve a pedirle
nada a nadie) y el predicado sin la exención del demo; los tres candados
de la evidencia bajados a `notice` de a uno y los tres bajados de `ALWAYS`
a `ORIGIN`; y el campo calculado de la sesión como definer, que con un
composite forjado devuelve las versiones del vecino (regla 18, probado con
`jsonb_populate_record`). Las escrituras de R27 corren en una
subtransacción que se deshace a propósito: las aceptaciones de prueba no se
pueden borrar —son evidencia— y no tienen por qué quedar.

El undécimo rompe R28, R29 y R30 (dieciséis roturas). Tres son de una
clase que vale nombrar: **el trigger de `landing_busquedas` que deja de
anular la patente lo frena la segunda defensa, el CHECK** —el bloque se
pone en rojo por esa vía y el script espera ese patrón, no "R28"—; **el
CHECK borrado no rompe nada visible** mientras el trigger esté, por eso
R28b lo mira en el catálogo; y **la purga que no exime al demo no cambia
nada** con la suscripción del demo activa, así que R29 cancela el demo
hace 13 meses adentro de su subtransacción, y recién ahí sacarle el `slug
<> 'demo'` a la purga se ve. Las demás: `cancelada_at` que no se escribe y
que no se limpia al reactivar; la purga que borra en simulación (la forma
más cara del bug); la que no deja evidencia; la que se lleva `pagos`; el
plazo corrido; el guard que deja pasar a un owner; el reloj programado en
real; y en la supresión, el guard abierto, la auditoría que no se escribe,
el sentinela del teléfono con dígitos y la función como invoker.

El undécimo rompe R31 (catorce roturas): los tres candados de `tenant_eventos` bajados a `notice` de a uno; el trigger de pagos sin el envoltorio defensivo, con lo que el sabotaje del evento bloquea el cobro; `cerrar_dia()` que dice «cerrado» la segunda vez, la que pierde el chequeo de «ya cerrado» (el segundo cierre revienta por la PK) y la que cierra hoy; el MRR sin mensualizar y la exención corrida al 101; `es_activo()` mirando solo la columna sin el reloj; suspender sin motivo; el alta como trigger inmediato (nace sin plan) y el evento de módulo sin el motivo del override. Una de ellas encontró un `not like` con motivo null que pasaba en verde: por eso R31g compara con `is null or`.

⚠ Y DOS DE ESTOS SCRIPTS APUNTAN A MÁS DE UNA MIGRACIÓN, porque
`estado_cobranza`, `reloj_cobranza` y `crear_lubricentro` se redefinieron en
migraciones posteriores a las que las crearon. Un script que las extrae del
archivo VIEJO reinstala la firma vieja, queda una sobrecarga y todas las
llamadas contestan «is not unique»: el script dice «SE ESCAPÓ» por una razón
que no tiene nada que ver con la regla, y el guard del sed no lo ve porque el
sed sí muerde. Se vio en rojo. **Cuando redefinas una función que algún script
de regresión muerde, buscá su nombre en `scripts/` y actualizá el `M`.**

Se corren antes de un release, no en cada cambio, y **un bloque nuevo de la red
trae su rotura en uno de estos scripts**.

Y en cualquier momento, a mano:

```sql
select * from verificar_seguridad_vistas();
```

Sin filas = está bien. Con filas = hay un agujero, y cada fila trae el SQL
exacto para taparlo.

---

## Git

Ramas `feat/*`, `fix/*`, `chore/*` → PR a `develop`. Conventional Commits, en
español (los comentarios del código están en español). Ver `CONTRIBUTING.md`.

`main` es producción y se toca solo en la fase de deploy.

@CLAUDE-landing.md
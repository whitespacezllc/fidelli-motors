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
los 11 renglones en el orden del cartón físico, PROX. SERV. KMTS. al pie. Es la
única pieza del producto donde la grilla con bordes se justifica: *es* el papel.

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
  el mecánico; la base guarda `AB123CD` para buscar.

**Los datos históricos no se borran.** Todo es `on delete restrict`. Para dar de
baja se usa `activo` o `anulado`, nunca `DELETE`.

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
de 0.5 a 1px, nunca más grueso. NO usamos Lucide (lo usa todo sitio hecho con IA).

**Todo lo clickeable lleva `cursor: pointer`.** Resuelto una vez en globals.css
para botones, roles de botón, tabs y triggers de Radix — no pantalla por pantalla.

**Gráficos con Visx**, para que hereden nuestros tokens en vez de traer su look.

**Tipos generados desde el schema**, no escritos a mano:
`supabase gen types typescript --local > lib/database.types.ts`

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

**Los enlaces de los mails NO usan `{{ .ConfirmationURL }}`.** Esa variable
apunta a `/auth/v1/verify`, que devuelve la sesión en el **fragmento** de la URL
(`#access_token=…`). El fragmento no viaja al servidor: `/auth/callback` es un
Route Handler y recibe una URL sin código, con lo que el enlace terminaba en
`/login?aviso=enlace` y el invitado nunca podía activar su cuenta. Los templates
arman el enlace así:

```
{{ .RedirectTo }}?token_hash={{ .TokenHash }}&type=invite
```

`.RedirectTo` es el `redirectTo` que mandó la llamada, así que el enlace vuelve
al mismo origen del que salió (local, preview o producción). **Este cambio es de
los templates: en la nube hay que replicarlo en los templates del proyecto.**

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

## Git

Ramas `feat/*`, `fix/*`, `chore/*` → PR a `develop`. Conventional Commits, en
español (los comentarios del código están en español). Ver `CONTRIBUTING.md`.

`main` es producción y se toca solo en la fase de deploy.

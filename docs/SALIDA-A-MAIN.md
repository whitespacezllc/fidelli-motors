# Salida a main · lo que hay que hacer, en orden

> Lista viva del sprint de métricas. Se actualiza en cada bloque. **Estado al
> 23/09/2026, noche:** los cuatro bloques (#122, #124, #125, #126) están en
> `develop`, y el release #127 (develop → main) se mergeó con la base de
> producción migrada ANTES: **prod (`cutzedfmxyyxxqfjutru`) tiene las 104
> migraciones** (las 21 del 22/09 al 25/09 entraron juntas, incluidas las
> seis del sprint legal que main publicaba desde el 22/09 sin su base). Dev
> también está en 104. La historia (sección D) se cargó esa misma noche. Lo
> que sigue pendiente es lo de las secciones C y E.

La regla de siempre: **la base primero, la app después.** El front nuevo nunca
tiene que convivir con el schema viejo.

## A · Antes de mergear develop → main (base de datos de prod)

- [x] **Foto previa de prod** (23/09: 19 lubricentros, 18 pagos, 1.655 services, 21 usuarios, última migración `20260917150000`) (solo lectura, una consulta): `select (select count(*) from lubricentros), (select count(*) from pagos), (select count(*) from services);` y guardar los tres números.
- [x] **`db push` a prod desde un workdir aislado** (hecho el 23/09: 21 migraciones, 83 → 104), cada paso como comando suelto (el clasificador de auto mode bloquea los encadenados):
  1. `npx supabase init --workdir <scratch>/prod-link` (con el cwd en el repo, para usar el binario local).
  2. `npx supabase link --project-ref cutzedfmxyyxxqfjutru --workdir <scratch>/prod-link --password '' --yes`.
  3. Copiar `supabase/{config.toml,migrations,templates,seed.sql,verificaciones.sql}` al workdir (sin templates y seeds el CLI no carga el config).
  4. `npx supabase migration list --workdir <scratch>/prod-link --linked`: tienen que aparecer solo las pendientes esperadas.
  5. `npx supabase db push --workdir <scratch>/prod-link --linked --dry-run` y, si la lista es la esperada, sin `--dry-run` (con `--include-all` si el CLI lo pide).
  6. El warning de `pg-delta` (certificado en `.temp/pgdelta`) es ruido: verificar con `select version from supabase_migrations.schema_migrations order by 1 desc limit 30;`.
- [x] **Las seis del sprint legal viajan en el mismo push** (entraron el 23/09; el backfill anuló la patente de 221 consultas sin resultado) (`20260922100000` a `20260922140000`: slugs reservados, aceptaciones de términos, búsquedas sin patente y su backfill, supresión de cliente, retención tras cancelar). Confirmar con la otra sesión si tienen pasos propios de salida.
- [x] **Verificar el backfill de eventos** (23/09: 19 altas = 19 lubricentros; 18 eventos de pago = 18 pagos; 2 módulos) (docs/METRICAS.md § 5): `altas` = cantidad de lubricentros (17 al 23/09), `eventos_pago` = filas de `pagos`.
- [x] **Verificar el backfill de calcos** (23/09: 18 pedidos = 18 tenants con calcos; 0 desincronizados; candado en ALWAYS): `select count(*) from pedidos_calcos` = tenants con `calcos_entregadas > 0`, y ningún tenant con el contador distinto de la suma.

## B · El merge

- [x] `git log origin/develop..origin/main` sin commits propios de main (23/09) (nada en main que no esté en develop); si no, traer main a develop primero.
- [x] Release PR develop → main (#127, 23/09) con el CI (`supabase db reset`) en verde; merge con merge commit.
- [x] Deploy de Vercel en `main` con éxito (23/09, merge `5947ad1`); humo hecho: `/login` responde, `/fidelli` con sesión de superadmin muestra el Resumen, `/fidelli/pauta` y una ficha abren.

## C · Variables y cron en Vercel (Production)

- [ ] **`CRON_SECRET`** cargada en Vercel (Production). El valor se pasó por chat el 22/09/2026; si se perdió, generar otro (`openssl rand -base64 48`) y cargarlo: no hay ninguna otra dependencia. Sin la variable, `/api/fidelli/cierre-diario` responde 500 y el Resumen dice «El cierre de ayer no corrió».
- [ ] El cron de `vercel.json` (`/api/fidelli/cierre-diario`, 03:10 UTC = 00:10 AR) está habilitado en el proyecto de Vercel.
- [ ] Al día siguiente: `select fecha, fuente from snapshots_diarios order by fecha desc limit 3;` tiene la foto de ayer con `fuente = 'cierre'`.

## D · La historia, una sola vez, después del merge

- [x] **Tipo de cambio** (hecho el 23/09 por la Management API con la misma fuente y regla del script: 38 días, 16/08 → 22/09; desde acá lo mantiene el cron): `node --no-warnings scripts/backfill-tc.mjs --dry-run` y después sin `--dry-run`, con `NEXT_PUBLIC_SUPABASE_URL` y `SUPABASE_SERVICE_ROLE_KEY` **de prod exportadas en la shell** (no tocar `.env.local`). Esperado: todos los días desde el 16/08/2026 hasta ayer.
- [x] **Fotos reconstruidas** (hecho el 23/09: 38 días, 415 fotos por tenant; el último MRR reconstruido es ARS 833.000 / US$ 542,67): `select reconstruir_snapshots('2026-08-16', current_date - 1);` como `postgres`/`service_role` (`npx supabase db query --linked --workdir <scratch>/prod-link -f archivo.sql`, una consulta por archivo). Verificar `select fuente, count(*), min(fecha), max(fecha) from snapshots_diarios group by fuente;`.
- [ ] Mirar el Resumen de prod: la franja del MRR compara contra el último día del mes anterior y el gráfico dice «reconstruido hasta …».

## E · Datos que se cargan a mano (Santiago)

- [ ] **Origen de los 17 tenants** desde Editar (o el chip «Sin origen» de la ficha, que abre el mismo dialog).
- [ ] **Gasto de pauta**: completar `scripts/gasto-pauta.plantilla.json` (agosto; agregar los lunes de septiembre) y correr `node scripts/cargar-gasto-pauta.mjs --dry-run` y luego sin `--dry-run`, con las variables de prod en la shell. Los montos vacíos no se cargan.
- [ ] **Contactos de pauta reales** desde `/fidelli/pauta` (celular): registrar, demo, cierre con el tenant. El cierre fija el origen `meta`/`google` solo si el tenant no tenía.
- [ ] **Pedidos de calcos históricos**, si se quiere el detalle: el backfill dejó una sola fila «backfill del contador» por tenant con calcos.
- [ ] Lo propio del sprint legal, si la otra sesión lo anotó.

## F · Bloque 4 (se completa al cerrar el bloque)

- [x] Las tres migraciones del bloque 4 (`20260925100000_crecimiento.sql`, `20260925101000_performance.sql`, `20260925102000_calcos_candado.sql`) entraron en el `db push` del 23/09 junto con las otras 18. Ninguna carga datos: crean funciones, una vista, un índice (`services_fecha_idx`, instantáneo con ~2.000 trabajos) y el candado de calcos. **Mirar el `NOTICE` del `db push`**: «candado de calcos · tenants con el contador distinto de la suma: N»; si N > 0, se arregla registrando el pedido que falta desde la ficha, no con un update.
- [ ] Probar una descarga del data room en prod (`/fidelli/crecimiento`, sección Data room) y abrir el CSV en Excel.
- [ ] Nada que cargar a mano: Crecimiento lee fotos y eventos.

## Trampa vista el 23/09, para no repetirla

Al armar el workdir aislado de prod, **no copiar `supabase/.` entero**: arrastra
`supabase/.temp/`, que guarda el link (project-ref y pooler) del checkout de
origen. Así un push «a prod» fue a dev. Copiar solo `config.toml`, `migrations/`,
`templates/`, `seed.sql` y `verificaciones.sql`, y antes de cada push leer
`cat <workdir>/supabase/.temp/project-ref`: tiene que decir `cutzedfmxyyxxqfjutru`.
El primer `migration list` contra prod puede fallar con «failed to connect to
postgres»: es transitorio, reintentar.

## G · Sprint de cobranza (bloques 1 y 2, releases #136, #137, #138 → #139)

Lo que pasó el 26 y 27/09, para que no se repita: **la app se mergeó a main
(#139, 26/09 21:03) antes que la base**, y la primera corrida del cron de
avisos (27/09 9:00) falló con 500 porque `avisos_pendientes()` no existía
en producción. Cero emails. El orden de la sección A no es opcional.

- [x] Migraciones `20260926200000_suspension_por_reloj.sql` y
      `20260926230000_emails_cobranza.sql` en dev y en prod (27/09, 108/108).
- [x] `RESEND_API_KEY` en Vercel (Production).
- [ ] `CRON_SECRET`: si se cambia el valor en Vercel, **hay que redesplegar**
      para que el deployment lo tome; hasta entonces las dos rutas del cron
      responden 401 a ese valor.
- [ ] Primera corrida real de `/api/fidelli/avisos-cobranza`: a mano con el
      bearer, o sola a las 9:00 del día siguiente. Verificar después con
      `select tipo, voz, count(*) from emails_cobranza group by 1, 2;`.
- [ ] Bloque 3 (Santiago, tras un pago real por Cresium):
      `update lubricentros set suspension_automatica = true where slug <> 'demo';`
      y la migración de una línea que pone `bloqueo_de_alta_activo()` en `true`.

## H · Patentes de los países vecinos (26/10/2026)

Una migración sola, `20261026120000_patentes_vecinas.sql`: redefine
`patente_formato_valido()` con los nueve formatos de Brasil, Uruguay, Paraguay,
Bolivia y Chile. No carga datos, no toca ninguna fila, es instantánea, y es un
superconjunto: ningún vehículo existente deja de cumplir el CHECK.

- [x] **La base primero**: `db push` a dev y a prod desde el workdir aislado
      (26/10, 17:50 y 17:59 UTC; prod 119 → 120, `vehiculos_invalidos = 0`).
- [x] Después el release develop → main y el deploy (#182, 26/10 18:00 UTC).
- [ ] Humo en producción con una chapa real de Sassi: cargarla en «Nuevo
      trabajo» y abrir `/[slug]/[patente]`.
- [x] Nada que cargar a mano.

**Trampa vista el 26/10, para el próximo push a dev.** Dev tiene cuatro
migraciones `20261022*_finanzas_*` (rama `feat/facturacion-cimientos` de
Grego, commit `fa2e130`) que no están en develop ni en prod. `db push` a dev
desde el repo se niega con «Remote migration versions not found in local
migrations directory» y sugiere `migration repair --status reverted`: **no
correrlo**, le borraría el historial a finanzas en dev. Lo que anda es un
workdir aislado linkeado a dev con las migraciones del repo MÁS esas cuatro
(`git show fa2e130:supabase/migrations/<archivo>`). Y cuando finanzas llegue
a prod, sus archivos quedan ANTES de `20261026120000` en el orden: el push va
a pedir `--include-all` o renumerarlas.

## I · El renglón de diálisis en el service de caja (26/10/2026)

Una migración sola, `20261026150000_caja_dialisis.sql`: un valor más en el
enum `item_tipo` (`caja_dialisis`, al final, después de `caja_lavado`). No
carga datos y no toca ninguna función.

- [x] **La base primero**: `db push` a dev y a prod desde el workdir aislado
      (26/10, 20:45 y 20:48 UTC; prod 120 → 121, el enum con los cinco de la
      caja en orden). El workdir de dev llevó las cuatro migraciones de
      finanzas que develop no tiene (trampa de la sección H).
- [x] Después el release develop → main (#185, 26/10 20:49 UTC). Al revés no
      rompe nada a la vista, pero una caja con la diálisis tildada fallaría al
      guardar con el error crudo del enum («invalid input value for enum
      item_tipo»), que el front no traduce: no dejar la app adelante de la base.
- [ ] Humo en producción: en un tenant con la feature `caja` prendida, abrir
      «Nuevo trabajo» → Caja y ver el quinto renglón; tildarlo con una nota,
      guardar, y mirar el papel en `/[slug]/[patente]` y el Excel.
- [ ] Nada que cargar a mano.

## J · La tarjeta de WhatsApp de cada tenant (27/10/2026)

Sin migraciones: la salida es solo de la app (#187: `opengraph-image.tsx`
por tenant, en el modo de su página, sin marca Fidelli; `sharp` como
dependencia directa). La base no cambia, así que no hay «base primero».

- [x] Los logos de producción: Santi corrió la consulta de #187 (27/10), dio
      bien. Los tenants sin logo salen con el círculo de su color y las
      iniciales; son la lista para pedirles el logo en la próxima llamada.
- [x] PR #187 a develop (27/10), con las dos pruebas en rojo y en verde.
- [x] Release develop → main (#188, 27/10 16:20 UTC; sin nada que pushear antes).
- [x] Humo en producción (27/10, 16:25 UTC, un minuto después del deploy):
      `https://fidellimotors.app/falco-lubricantes-y-servicios` con
      `og:image` → `/falco-lubricantes-y-servicios/opengraph-image-iw6p63`,
      1200×630, `og:site_name` = «Falco Lubricantes y Servicios», ninguna
      `og:*`/`twitter:*` con Fidelli; la imagen es un PNG de 1200×630 en el
      modo oscuro de Falco, con su logo real. La landing comercial sigue con
      `/assets/og-image.jpg`.
- [ ] Avisarle a Darío (Falco): para que WhatsApp muestre la tarjeta nueva en
      un chat donde el link ya se compartió, hay que agregarle algo a la URL
      (`?v=1`); WhatsApp cachea la vista previa por su cuenta.
- [ ] Nada que cargar a mano. La tarjeta se regenera sola una vez por día
      y al guardar en /panel/experiencia.

## K · Service de caja + mecánica en una carga (29/10/2026)

Una migración, `20261029200000_caja_con_mecanica.sql` (#191): el trigger del
vínculo acepta una caja como destino, `guardar_service` abre la puerta de
`p_mecanica` a la caja y `actualizar_service` propaga también desde la rama
de la caja. Firmas iguales, sin datos ni variables. **Base primero, app
después**, como siempre; el front viejo convive con la base nueva (solo se
abre una puerta).

- [x] `db push` a dev desde un workdir aislado (29/10, 21:50 UTC-3, 125 → 126).
      Dev tiene además las cuatro migraciones `20261022*` de finanzas de Grego,
      que no están en develop ni en prod: el workdir las llevó como archivos
      (sacados de `origin/feat/facturacion-cimientos`) para que el CLI no las
      diera por faltantes, y el dry-run listó solo `20261029200000`. No se
      corrió ningún `migration repair`.
- [x] `db push` a prod desde su workdir (`cutzedfmxyyxxqfjutru`, 121 → 122),
      dry-run con una sola migración, `.temp/project-ref` verificado antes.
- [x] Foto de las dos bases por `db query`: una firma de `guardar_service` y de
      `actualizar_service`, security invoker, los tres cuerpos con las líneas
      nuevas, `verificar_seguridad_vistas()` sin filas.
- [x] PR #191 a develop (`f062397`), con el CI (`db reset`) en verde.
- [x] Release develop → main (#192, `3fe062f`, 30/10 00:40 UTC).
- [x] Deploy de Vercel en `main` (Production, `3fe062f`, 30/10 00:41 UTC, status
      `success`) y humo un minuto después: `/`, `/login`, `/demo`, `/demo/ABC123`
      y `/blog` en 200; `/panel` y `/fidelli` en 307.
- [ ] De Santi: probar en el celular con el tenant que lo pidió (caja + «¿Se le
      hizo algo de mecánica?», guardar, mirar las dos tarjetas y el cartón del
      cliente). La feature `caja` sigue prendiéndose por tenant desde /fidelli.
- [ ] Nada que cargar a mano.

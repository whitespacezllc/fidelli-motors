# Salida a main · lo que hay que hacer, en orden

> Lista viva del sprint de métricas. Se actualiza en cada bloque. **Estado al
> 23/09/2026:** `develop` tiene #121 (legal y datos), #122 (bloque 1), #124
> (bloque 2) y #125 (bloque 3). El proyecto **dev** de Supabase
> (`qziqzakyqdrlsszafnjm`) tiene las 101 migraciones. **Prod**
> (`cutzedfmxyyxxqfjutru`) NO tiene nada desde `20260922100000` en adelante:
> son 18 migraciones pendientes más las que sume el bloque 4.

La regla de siempre: **la base primero, la app después.** El front nuevo nunca
tiene que convivir con el schema viejo.

## A · Antes de mergear develop → main (base de datos de prod)

- [ ] **Foto previa de prod** (solo lectura, una consulta): `select (select count(*) from lubricentros), (select count(*) from pagos), (select count(*) from services);` y guardar los tres números.
- [ ] **`db push` a prod desde un workdir aislado**, cada paso como comando suelto (el clasificador de auto mode bloquea los encadenados):
  1. `npx supabase init --workdir <scratch>/prod-link` (con el cwd en el repo, para usar el binario local).
  2. `npx supabase link --project-ref cutzedfmxyyxxqfjutru --workdir <scratch>/prod-link --password '' --yes`.
  3. Copiar `supabase/{config.toml,migrations,templates,seed.sql,verificaciones.sql}` al workdir (sin templates y seeds el CLI no carga el config).
  4. `npx supabase migration list --workdir <scratch>/prod-link --linked`: tienen que aparecer solo las pendientes esperadas.
  5. `npx supabase db push --workdir <scratch>/prod-link --linked --dry-run` y, si la lista es la esperada, sin `--dry-run` (con `--include-all` si el CLI lo pide).
  6. El warning de `pg-delta` (certificado en `.temp/pgdelta`) es ruido: verificar con `select version from supabase_migrations.schema_migrations order by 1 desc limit 30;`.
- [ ] **Las seis del sprint legal viajan en el mismo push** (`20260922100000` a `20260922140000`: slugs reservados, aceptaciones de términos, búsquedas sin patente y su backfill, supresión de cliente, retención tras cancelar). Confirmar con la otra sesión si tienen pasos propios de salida.
- [ ] **Verificar el backfill de eventos** (docs/METRICAS.md § 5): `altas` = cantidad de lubricentros (17 al 23/09), `eventos_pago` = filas de `pagos`.
- [ ] **Verificar el backfill de calcos**: `select count(*) from pedidos_calcos` = tenants con `calcos_entregadas > 0`, y ningún tenant con el contador distinto de la suma.

## B · El merge

- [ ] `git log origin/develop..origin/main` vacío (nada en main que no esté en develop); si no, traer main a develop primero.
- [ ] Release PR develop → main con el CI (`supabase db reset`) en verde; merge con merge commit.
- [ ] Deploy de Vercel en `main` con éxito; humo: `/login` responde, `/fidelli` con sesión de superadmin muestra el Resumen, `/fidelli/pauta` y una ficha abren.

## C · Variables y cron en Vercel (Production)

- [ ] **`CRON_SECRET`** cargada en Vercel (Production). El valor se pasó por chat el 22/09/2026; si se perdió, generar otro (`openssl rand -base64 48`) y cargarlo: no hay ninguna otra dependencia. Sin la variable, `/api/fidelli/cierre-diario` responde 500 y el Resumen dice «El cierre de ayer no corrió».
- [ ] El cron de `vercel.json` (`/api/fidelli/cierre-diario`, 03:10 UTC = 00:10 AR) está habilitado en el proyecto de Vercel.
- [ ] Al día siguiente: `select fecha, fuente from snapshots_diarios order by fecha desc limit 3;` tiene la foto de ayer con `fuente = 'cierre'`.

## D · La historia, una sola vez, después del merge

- [ ] **Tipo de cambio**: `node --no-warnings scripts/backfill-tc.mjs --dry-run` y después sin `--dry-run`, con `NEXT_PUBLIC_SUPABASE_URL` y `SUPABASE_SERVICE_ROLE_KEY` **de prod exportadas en la shell** (no tocar `.env.local`). Esperado: todos los días desde el 16/08/2026 hasta ayer.
- [ ] **Fotos reconstruidas**: `select reconstruir_snapshots('2026-08-16', current_date - 1);` como `postgres`/`service_role` (`npx supabase db query --linked --workdir <scratch>/prod-link -f archivo.sql`, una consulta por archivo). Verificar `select fuente, count(*), min(fecha), max(fecha) from snapshots_diarios group by fuente;`.
- [ ] Mirar el Resumen de prod: la franja del MRR compara contra el último día del mes anterior y el gráfico dice «reconstruido hasta …».

## E · Datos que se cargan a mano (Santiago)

- [ ] **Origen de los 17 tenants** desde Editar (o el chip «Sin origen» de la ficha, que abre el mismo dialog).
- [ ] **Gasto de pauta**: completar `scripts/gasto-pauta.plantilla.json` (agosto; agregar los lunes de septiembre) y correr `node scripts/cargar-gasto-pauta.mjs --dry-run` y luego sin `--dry-run`, con las variables de prod en la shell. Los montos vacíos no se cargan.
- [ ] **Contactos de pauta reales** desde `/fidelli/pauta` (celular): registrar, demo, cierre con el tenant. El cierre fija el origen `meta`/`google` solo si el tenant no tenía.
- [ ] **Pedidos de calcos históricos**, si se quiere el detalle: el backfill dejó una sola fila «backfill del contador» por tenant con calcos.
- [ ] Lo propio del sprint legal, si la otra sesión lo anotó.

## F · Bloque 4 (se completa al cerrar el bloque)

- [ ] Las tres migraciones del bloque 4 (`20260925100000_crecimiento.sql`, `20260925101000_performance.sql`, `20260925102000_calcos_candado.sql`) entran en el mismo `db push` del punto A si todavía no se hizo; si prod ya tiene las 18, van solas con la misma receta. Ninguna carga datos: crean funciones, una vista, un índice (`services_fecha_idx`, instantáneo con ~2.000 trabajos) y el candado de calcos. **Mirar el `NOTICE` del `db push`**: «candado de calcos · tenants con el contador distinto de la suma: N»; si N > 0, se arregla registrando el pedido que falta desde la ficha, no con un update.
- [ ] Probar una descarga del data room en prod (`/fidelli/crecimiento`, sección Data room) y abrir el CSV en Excel.
- [ ] Nada que cargar a mano: Crecimiento lee fotos y eventos.

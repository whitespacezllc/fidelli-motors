-- ════════════════════════════════════════════════════════════════════
-- BLOQUE MÉTRICAS 3 · `google` como origen de tenant
--
-- El cierre de un contacto de pauta fija el origen del tenant según el
-- canal (docs/METRICAS.md § 1 «Cierre»). Google Ads ya corre y puede
-- traer; sin un valor propio, un tenant que llegó por Google caería en
-- `otro` y la lectura por origen del bloque 4 lo perdería.
--
-- Migración sola, sin nada más adentro: un valor nuevo de enum no se puede
-- usar en la transacción que lo crea (regla 14 de CLAUDE.md), y la
-- migración siguiente lo usa en `marcar_cierre()`.
-- ════════════════════════════════════════════════════════════════════

alter type origen_tenant add value if not exists 'google' after 'meta';

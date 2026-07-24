-- ============================================================
-- Fidelli Motors · Extensiones y tipos base
-- Migración 1 de la Fase 3
-- ============================================================

-- ---------- Extensiones ----------
-- pgcrypto: gen_random_uuid() para las claves primarias
create extension if not exists "pgcrypto";
-- unaccent: búsqueda de clientes sin tildes ("gomez" encuentra "Gómez")
create extension if not exists "unaccent";

-- ---------- Roles y acceso ----------
create type rol_usuario as enum ('owner', 'superadmin');

-- ---------- Suscripciones ----------
create type estado_suscripcion as enum ('trial', 'activa', 'vencida', 'cancelada');
create type periodo_suscripcion as enum ('mensual', 'semestral', 'anual');

-- ---------- Catálogo de productos ----------
create type categoria_producto as enum ('aceite', 'filtro', 'liquido', 'aditivo', 'otro');

-- ---------- El cartón: los 11 renglones, en el orden exacto del papel ----------
-- El orden importa: los enums de Postgres tienen orden intrínseco,
-- así "order by item_tipo" devuelve el cartón como la tarjeta física.
create type item_tipo as enum (
  'filtro_aceite',
  'filtro_aire',
  'filtro_combustible',
  'filtro_habitaculo',
  'aceite_caja',
  'aceite_diferencial',
  'aceite_hidraulico',
  'liq_refrigerante',
  'liq_frenos',
  'aditivo_motor',
  'aditivo_transmision'
);

-- ---------- Retención ----------
create type estado_contacto as enum ('urgente', 'proximo', 'vencido');
create type canal_contacto as enum ('whatsapp', 'manual');
-- ============================================================
-- Fix: el usuario del seed necesita su registro en auth.identities
-- Insertar solo en auth.users crea la cuenta pero no la identidad,
-- y GoTrue la exige para validar el login por contraseña.
-- ============================================================

create or replace function crear_identidad_email(p_user_id uuid, p_email text)
returns void
language plpgsql
security definer
set search_path = auth, public
as $$
begin
  if exists (
    select 1 from auth.identities
    where user_id = p_user_id and provider = 'email'
  ) then
    return;
  end if;

  insert into auth.identities (
    id, user_id, identity_data, provider, provider_id,
    last_sign_in_at, created_at, updated_at
  ) values (
    gen_random_uuid(),
    p_user_id,
    jsonb_build_object(
      'sub', p_user_id::text,
      'email', p_email,
      'email_verified', true,
      'phone_verified', false
    ),
    'email',
    p_user_id::text,
    now(), now(), now()
  );
end;
$$;

comment on function crear_identidad_email is
  'Crea la identidad que GoTrue exige para el login por contraseña. Necesaria al insertar en auth.users a mano.';

revoke execute on function crear_identidad_email(uuid, text) from public, anon, authenticated;

-- Reparar el usuario del demo si ya existe
do $$
declare v_id uuid;
begin
  select id into v_id from auth.users where email = 'demo@fidellimotors.app';
  if v_id is not null then
    perform crear_identidad_email(v_id, 'demo@fidellimotors.app');
  end if;
end $$;
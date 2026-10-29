-- ===========================================================================
-- Fíchame — 0007_google_login
--
-- Login com Google (OpenID Connect):
--   1. users.google_sub — identificador estável da conta Google («sub»).
--      O email pode mudar do lado da Google; o sub não.
--   2. users.password_hash passa a aceitar null: contas criadas com Google não
--      têm senha até a definirem (via «¿Has olvidado tu contraseña?»).
--   3. register_restaurant guarda o google_sub no mesmo INSERT (atómico).
--
-- Só ACRESCENTA. Idempotente. Aplicar depois de 0006.
-- ===========================================================================

alter table users add column if not exists google_sub text;
create unique index if not exists users_google_sub_key on users (google_sub) where google_sub is not null;
alter table users alter column password_hash drop not null;

-- Uma conta tem de ter pelo menos uma forma de entrar.
do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'users_has_credential') then
    alter table users add constraint users_has_credential
      check (password_hash is not null or google_sub is not null);
  end if;
end $$;

-- ---------------------------------------------------------------------------
-- register_restaurant — igual à de 0002, mais google_sub e senha opcional
-- ---------------------------------------------------------------------------
create or replace function register_restaurant(p jsonb) returns jsonb
language plpgsql
set search_path = public, pg_temp
as $$
declare
  v_base text := coalesce(nullif(p->>'slug_base', ''), 'establecimiento');
  v_slug text := v_base;
  v_i    int  := 2;
  v_rid  bigint;
  v_uid  bigint;
begin
  if exists (select 1 from users where email = (p->>'email')::citext) then
    return jsonb_build_object('ok', false, 'reason', 'email_taken');
  end if;

  loop
    exit when not exists (select 1 from restaurants where slug = v_slug);
    v_slug := v_base || '-' || v_i;
    v_i := v_i + 1;
    if v_i > 1000 then
      v_slug := v_base || '-' || to_hex((extract(epoch from clock_timestamp()) * 1000)::bigint);
      exit;
    end if;
  end loop;

  insert into restaurants (
    slug, name, commercial_name, owner_name, email, phone,
    address, postal_code, city, establishment_type, description, test_prefix
  ) values (
    v_slug,
    p->>'name',
    coalesce(p->>'commercial_name', ''),
    p->>'owner_name',
    (p->>'email')::citext,
    coalesce(p->>'phone', ''),
    coalesce(p->>'address', ''),
    coalesce(p->>'postal_code', ''),
    coalesce(p->>'city', ''),
    coalesce(p->>'establishment_type', ''),
    coalesce(p->>'description', ''),
    nullif(p->>'test_prefix', '')
  )
  returning id into v_rid;

  insert into users (restaurant_id, email, password_hash, google_sub, full_name, phone, role)
  values (
    v_rid,
    (p->>'email')::citext,
    nullif(p->>'password_hash', ''),
    nullif(p->>'google_sub', ''),
    p->>'owner_name',
    coalesce(p->>'phone', ''),
    'owner'
  )
  returning id into v_uid;

  return jsonb_build_object(
    'ok', true, 'restaurant_id', v_rid, 'user_id', v_uid, 'slug', v_slug
  );
exception
  when unique_violation then
    return jsonb_build_object('ok', false, 'reason', 'email_taken');
end;
$$;

-- Mesmas permissões que 0005: só a service_role executa.
do $$
begin
  revoke all on function register_restaurant(jsonb) from public;
  if exists (select 1 from pg_roles where rolname = 'anon') then
    revoke all on function register_restaurant(jsonb) from anon;
  end if;
  if exists (select 1 from pg_roles where rolname = 'authenticated') then
    revoke all on function register_restaurant(jsonb) from authenticated;
  end if;
  if exists (select 1 from pg_roles where rolname = 'service_role') then
    grant execute on function register_restaurant(jsonb) to service_role;
  end if;
end $$;


-- Regista a versão: sem isto, `npm start` e `npm run check` recusavam arrancar
-- ("Migrations em falta: 0007_google_login") mesmo com a migration aplicada.
insert into schema_migrations (version) values ('0007_google_login')
on conflict (version) do nothing;

notify pgrst, 'reload schema';

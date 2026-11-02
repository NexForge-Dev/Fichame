-- ===========================================================================
-- Fíchame — 0013_launch_fixes
--
-- Correções da revisão de lançamento (2026-11):
--   1. submit_application (v4): o duplicado de 48 h passa a ser por negócio +
--      email + VAGA (uma candidatura geral, sem vaga, é uma chave própria) e
--      um email já conhecido só preenche nome/apelidos/telefone em falta —
--      não reescreve o que as candidaturas antigas mostram.
--   2. submit_interest (v4): o mesmo «só preenche o que falta» no candidato.
--   3. register_restaurant (v3): razão social, email de privacidade e
--      aceitação dos termos no MESMO pedido (atómico). Antes eram três
--      escritas separadas e uma falha deixava a conta a meio.
--   4. set_application_status (v3): guardar o mesmo estado não mexe em
--      last_activity_at (não adia a supressão).
--   5. email_changes: confirmação da mudança do email de acesso por link.
--   6. session_context: + restaurant_created_at (prova grátis no painel).
--
-- Idempotente. Aplicar depois de 0012.
-- ===========================================================================

-- ---------------------------------------------------------------------------
-- 5. Mudança de email de acesso com confirmação
-- ---------------------------------------------------------------------------
-- Como password_resets: só o hash do token, uso único, validade de 24 h.
create table if not exists email_changes (
  token_hash  text        primary key,
  user_id     bigint      not null references users(id) on delete cascade,
  new_email   citext      not null check (char_length(new_email::text) between 3 and 120),
  expires_at  timestamptz not null,
  used_at     timestamptz,
  created_at  timestamptz not null default now()
);

create index if not exists idx_email_changes_user on email_changes (user_id);

-- RLS deny-all e revogação (como em 0001/0005): só o service_role lê.
do $$
declare
  has_anon boolean := exists (select 1 from pg_roles where rolname = 'anon');
  has_auth boolean := exists (select 1 from pg_roles where rolname = 'authenticated');
begin
  execute 'alter table email_changes enable row level security';
  if has_anon then execute 'revoke all on table email_changes from anon'; end if;
  if has_auth then execute 'revoke all on table email_changes from authenticated'; end if;
end;
$$;

-- ---------------------------------------------------------------------------
-- 6. session_context — colunas de 0002 + restaurant_created_at NO FIM
-- ---------------------------------------------------------------------------
-- `create or replace view` só permite acrescentar colunas no fim. 0002 tem
-- a mesma definição, para que reaplicar 0002 continue a funcionar.
create or replace view session_context
with (security_invoker = on) as
select
  s.token_hash,
  s.user_id,
  s.csrf_token,
  s.expires_at,
  u.email,
  u.password_hash,
  u.full_name,
  u.role,
  u.blocked,
  u.restaurant_id,
  r.slug          as restaurant_slug,
  r.name          as restaurant_name,
  r.active        as restaurant_active,
  r.hiring_status as restaurant_hiring,
  r.created_at    as restaurant_created_at
from sessions s
left join users u       on u.id = s.user_id
left join restaurants r on r.id = u.restaurant_id;

-- ---------------------------------------------------------------------------
-- 1. submit_application (v4) — v3 de 0012 + duplicado por vaga + sem
--    reescrever os dados do candidato
-- ---------------------------------------------------------------------------
create or replace function submit_application(p jsonb) returns jsonb
language plpgsql as $$
declare
  v_rid    bigint  := (p->>'restaurant_id')::bigint;
  v_email  citext  := (p->>'email')::citext;
  v_job    bigint  := nullif(p->>'job_id', '')::bigint;
  v_future boolean := coalesce((p->>'future_consent')::boolean, false);
  v_cid    bigint;
  v_aid    bigint;
begin
  -- Dois toques em «Enviar» num 4G lento podem chegar quase em simultâneo:
  -- sem este lock, os dois EXISTS passam antes de qualquer INSERT e ficam
  -- duas candidaturas. O lock é por negócio + email e só dura a transação.
  perform pg_advisory_xact_lock(hashtextextended('apply:' || v_rid || ':' || lower(v_email::text), 0));

  -- duplicado recente NO MESMO restaurante E NA MESMA VAGA; sem vaga
  -- (candidatura geral) conta como uma vaga própria. O backend responde ao
  -- candidato exatamente como a um envio novo (sem revelar que a pessoa já
  -- se candidatou)
  if exists (
    select 1
    from applications a
    join candidates c on c.id = a.candidate_id
    where a.restaurant_id = v_rid
      and c.email = v_email
      and a.job_id is not distinct from v_job
      and a.applied_at > now() - interval '2 days'
  ) then
    return jsonb_build_object('ok', false, 'reason', 'duplicate');
  end if;

  -- Email já conhecido: só se preenche o que estava vazio. Reescrever o nome
  -- ou o telefone mudaria o que as candidaturas anteriores mostram.
  insert into candidates (restaurant_id, first_name, last_name, email, phone)
  values (
    v_rid,
    p->>'first_name',
    coalesce(p->>'last_name', ''),
    v_email,
    coalesce(p->>'phone', '')
  )
  on conflict (restaurant_id, email) do update set
    first_name = coalesce(nullif(candidates.first_name, ''), excluded.first_name),
    last_name  = coalesce(nullif(candidates.last_name, ''), excluded.last_name),
    phone      = coalesce(nullif(candidates.phone, ''), excluded.phone)
  returning id into v_cid;

  insert into applications (
    restaurant_id, candidate_id, job_id, job_title,
    availability, experience, observations, future_interest
  ) values (
    v_rid,
    v_cid,
    v_job,
    coalesce(p->>'job_title', ''),
    coalesce(p->>'availability', ''),
    coalesce(p->>'experience', ''),
    coalesce(p->>'observations', ''),
    v_future
  )
  returning id into v_aid;

  insert into cvs (
    application_id, restaurant_id, storage_path,
    original_filename, mime_type, size_bytes
  ) values (
    v_aid,
    v_rid,
    p->>'storage_path',
    coalesce(nullif(p->>'original_filename', ''), 'cv.pdf'),
    'application/pdf',
    coalesce((p->>'size_bytes')::bigint, 0)
  );

  insert into consents (
    application_id, selection_consent, future_opportunity_consent,
    consent_version, consent_text,
    selection_basis, privacy_notice_version,
    future_text, future_granted_at, future_source
  ) values (
    v_aid,
    false,
    v_future,
    coalesce(p->>'consent_version', ''),
    '',
    'rgpd_6_1_b',
    coalesce(p->>'privacy_notice_version', ''),
    case when v_future then coalesce(p->>'future_text', '') else '' end,
    case when v_future then now() end,
    case when v_future then 'formulario_candidatura' else '' end
  );

  insert into application_history (application_id, restaurant_id, event, new_status, detail)
  values (v_aid, v_rid, 'recibida', 'nuevo', 'Candidatura recibida');

  insert into notifications (restaurant_id, application_id, type, channel, status)
  values (v_rid, v_aid, 'nueva_candidatura', 'panel', 'unread');

  perform recompute_retention(v_aid);

  return jsonb_build_object('ok', true, 'application_id', v_aid, 'candidate_id', v_cid);
end;
$$;

-- ---------------------------------------------------------------------------
-- 2. submit_interest (v4) — v3 de 0012 + sem reescrever os dados do candidato
-- ---------------------------------------------------------------------------
create or replace function submit_interest(p jsonb) returns jsonb
language plpgsql as $$
declare
  v_rid   bigint := (p->>'restaurant_id')::bigint;
  v_email citext := (p->>'email')::citext;
  v_cid   bigint;
  v_aid   bigint;
begin
  perform pg_advisory_xact_lock(hashtextextended('apply:' || v_rid || ':' || lower(v_email::text), 0));

  if exists (
    select 1
    from applications a
    join candidates c on c.id = a.candidate_id
    where a.restaurant_id = v_rid
      and c.email = v_email
      and a.applied_at > now() - interval '2 days'
  ) then
    return jsonb_build_object('ok', false, 'reason', 'duplicate');
  end if;

  insert into candidates (restaurant_id, first_name, email, phone)
  values (v_rid, p->>'first_name', v_email, coalesce(p->>'phone', ''))
  on conflict (restaurant_id, email) do update set
    first_name = coalesce(nullif(candidates.first_name, ''), excluded.first_name),
    phone      = coalesce(nullif(candidates.phone, ''), excluded.phone)
  returning id into v_cid;

  insert into applications (
    restaurant_id, candidate_id, job_title, status, future_interest, experience
  ) values (
    v_rid, v_cid, 'Oportunidades futuras', 'reserva', true,
    coalesce(p->>'experience', '')
  )
  returning id into v_aid;

  insert into consents (
    application_id, selection_consent, future_opportunity_consent,
    consent_version, consent_text,
    selection_basis, privacy_notice_version,
    future_text, future_granted_at, future_source
  ) values (
    v_aid, false, true,
    coalesce(p->>'consent_version', ''), '',
    'rgpd_6_1_a', coalesce(p->>'privacy_notice_version', ''),
    coalesce(p->>'future_text', ''), now(), 'formulario_interes'
  );

  insert into application_history (application_id, restaurant_id, event, new_status, detail)
  values (v_aid, v_rid, 'recibida', 'reserva', 'Interés para futuras oportunidades');

  insert into notifications (restaurant_id, application_id, type, channel, status)
  values (v_rid, v_aid, 'nueva_candidatura', 'panel', 'unread');

  perform recompute_retention(v_aid);

  return jsonb_build_object('ok', true, 'application_id', v_aid, 'candidate_id', v_cid);
end;
$$;

-- ---------------------------------------------------------------------------
-- 3. register_restaurant (v3) — v2 de 0007 + dados legais e aceitação dos
--    termos na mesma transação
-- ---------------------------------------------------------------------------
-- Parâmetros novos (opcionais, para a demo e os testes continuarem iguais):
--   legal_name, privacy_email      → restaurants
--   terms_version, dpa_version, ip → restaurants + terms_acceptances (via
--                                    'registro'); sem versões não se regista
--                                    aceitação nenhuma.
-- Qualquer erro desfaz tudo: não fica negócio sem dono nem dono sem termos.
create or replace function register_restaurant(p jsonb) returns jsonb
language plpgsql
set search_path = public, pg_temp
as $$
declare
  v_base  text := coalesce(nullif(p->>'slug_base', ''), 'establecimiento');
  v_slug  text := v_base;
  v_i     int  := 2;
  v_rid   bigint;
  v_uid   bigint;
  v_terms text := coalesce(p->>'terms_version', '');
  v_dpa   text := coalesce(p->>'dpa_version', '');
  v_now   timestamptz := now();
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
    address, postal_code, city, establishment_type, description, test_prefix,
    legal_name, privacy_email
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
    nullif(p->>'test_prefix', ''),
    left(coalesce(p->>'legal_name', ''), 150),
    coalesce(p->>'privacy_email', '')::citext
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

  if v_terms <> '' and v_dpa <> '' then
    update restaurants set
      terms_version = v_terms,
      dpa_version = v_dpa,
      terms_accepted_at = v_now
    where id = v_rid;

    insert into terms_acceptances (restaurant_id, user_id, legal_name, terms_version, dpa_version, via, ip, accepted_at)
    values (
      v_rid, v_uid,
      left(coalesce(p->>'legal_name', ''), 150),
      v_terms, v_dpa, 'registro',
      left(coalesce(p->>'ip', ''), 64),
      v_now
    );
  end if;

  return jsonb_build_object(
    'ok', true, 'restaurant_id', v_rid, 'user_id', v_uid, 'slug', v_slug
  );
exception
  when unique_violation then
    return jsonb_build_object('ok', false, 'reason', 'email_taken');
end;
$$;

-- ---------------------------------------------------------------------------
-- 4. set_application_status (v3) — v2 de 0005; last_activity_at só muda
--    quando o estado muda
-- ---------------------------------------------------------------------------
-- «reserva» só com consentimento de futuras oportunidades ATIVO: um candidato
-- rejeitado não entra na reserva por decisão do restaurante.
create or replace function set_application_status(p jsonb) returns jsonb
language plpgsql as $$
declare
  v_aid    bigint := (p->>'application_id')::bigint;
  v_rid    bigint := (p->>'restaurant_id')::bigint;
  v_uid    bigint := nullif(p->>'user_id', '')::bigint;
  v_status text   := p->>'status';
  v_old    text;
  v_future boolean;
begin
  select a.status,
         coalesce(c.future_opportunity_consent and c.future_withdrawn_at is null, false)
    into v_old, v_future
  from applications a
  left join consents c on c.application_id = a.id
  where a.id = v_aid and a.restaurant_id = v_rid
  for update of a;

  if not found then
    return jsonb_build_object('ok', false, 'reason', 'not_found');
  end if;

  if v_status = 'reserva' and not v_future then
    return jsonb_build_object('ok', false, 'reason', 'no_consent');
  end if;

  update applications set
    status = v_status,
    future_interest = v_future,
    -- Guardar de novo o mesmo estado não é atividade: não adia a supressão.
    last_activity_at = case when v_old is distinct from v_status then now() else last_activity_at end,
    closed_at = case
      when v_status in ('rechazado', 'contratado', 'reserva') then coalesce(
        case when v_old in ('rechazado', 'contratado', 'reserva') then closed_at end, now())
      else null
    end
  where id = v_aid and restaurant_id = v_rid;

  if v_old is distinct from v_status then
    insert into application_history (
      application_id, restaurant_id, user_id, event, old_status, new_status, detail
    ) values (v_aid, v_rid, v_uid, 'estado', v_old, v_status, coalesce(p->>'detail', ''));
  end if;

  perform recompute_retention(v_aid);

  return jsonb_build_object('ok', true, 'old_status', v_old, 'new_status', v_status);
end;
$$;

-- ---------------------------------------------------------------------------
-- search_path fixo e permissões (create or replace limpa o search_path)
-- ---------------------------------------------------------------------------
do $$
declare
  f text;
  has_anon boolean := exists (select 1 from pg_roles where rolname = 'anon');
  has_auth boolean := exists (select 1 from pg_roles where rolname = 'authenticated');
  has_svc  boolean := exists (select 1 from pg_roles where rolname = 'service_role');
begin
  foreach f in array array[
    'submit_application(jsonb)', 'submit_interest(jsonb)',
    'register_restaurant(jsonb)', 'set_application_status(jsonb)'
  ]
  loop
    execute format('alter function %s set search_path = public, pg_temp', f);
    execute format('revoke all on function %s from public', f);
    if has_anon then execute format('revoke all on function %s from anon', f); end if;
    if has_auth then execute format('revoke all on function %s from authenticated', f); end if;
    if has_svc  then execute format('grant execute on function %s to service_role', f); end if;
  end loop;

  if has_anon then execute 'revoke all on session_context from anon'; end if;
  if has_auth then execute 'revoke all on session_context from authenticated'; end if;
end;
$$;

insert into schema_migrations (version) values ('0013_launch_fixes')
on conflict (version) do nothing;

notify pgrst, 'reload schema';

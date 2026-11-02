-- ===========================================================================
-- Fíchame — 0002_views_rpc
--
-- O PostgREST não faz GROUP BY, subselects no SELECT, OR entre colunas de
-- tabelas unidas, nem transações com vários statements. Este ficheiro resolve
-- cada um desses casos no lado do Postgres:
--
--   VIEWS     → leituras que o query builder não consegue expressar
--   FUNÇÕES   → escritas que têm de ser atómicas (uma função = uma transação)
--
-- Aplicar depois de 0001_init. Idempotente.
-- ===========================================================================

-- ===========================================================================
-- VIEWS
-- ===========================================================================
-- Todas com security_invoker = on: a view respeita o RLS das tabelas de base
-- em vez de correr com os direitos do dono. Com o deny-all de 0001, isto
-- significa que a chave anon não lê nada, nem diretamente nem através da view.

-- ---------------------------------------------------------------------------
-- session_context — sessão + utilizador + restaurante numa só ida à rede.
-- Corre em cada pedido; separá-la em 2 queries duplicaria a latência.
--
-- Não se chama `session_user`: isso é palavra reservada no PostgreSQL (é uma
-- função do próprio SQL, como `current_user`).
-- ---------------------------------------------------------------------------
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
  -- Acrescentada em 0013 (prova grátis no painel). Repetida aqui porque
  -- `create or replace view` não pode retirar colunas: sem ela, reaplicar
  -- 0002 depois de 0013 falharia.
  r.created_at    as restaurant_created_at
from sessions s
left join users u       on u.id = s.user_id
left join restaurants r on r.id = u.restaurant_id;

-- ---------------------------------------------------------------------------
-- application_list — candidatura achatada com o candidato e a vaga.
-- `search_text` concentra num só campo tudo o que a busca livre cobre (§12),
-- exceto o número de documento (minimização: ver 0005).
-- permitindo um único .ilike() em vez de um OR sobre 7 colunas de 2 tabelas.
-- ---------------------------------------------------------------------------
create or replace view application_list
with (security_invoker = on) as
select
  a.id,
  a.restaurant_id,
  a.candidate_id,
  a.job_id,
  a.job_title,
  a.status,
  a.availability,
  a.experience,
  a.observations,
  a.future_interest,
  a.favorite,
  a.retention_until,
  a.anonymized_at,
  a.applied_at,
  c.first_name,
  c.last_name,
  c.email,
  c.phone,
  c.doc_type,
  c.doc_number,
  j.title  as job_name,
  j.active as job_active,
  lower(concat_ws(' ',
    c.first_name, c.last_name, c.email, c.phone,
    a.job_title, a.experience, a.observations
  )) as search_text
from applications a
join candidates c       on c.id = a.candidate_id
left join jobs j        on j.id = a.job_id;

-- ---------------------------------------------------------------------------
-- application_status_counts — contagem por estado (pipeline visual, §13)
-- ---------------------------------------------------------------------------
create or replace view application_status_counts
with (security_invoker = on) as
select
  restaurant_id,
  status,
  count(*)::int as n
from applications
group by restaurant_id, status;

-- ---------------------------------------------------------------------------
-- restaurant_metrics — números do dashboard do restaurante (§11)
-- ---------------------------------------------------------------------------
create or replace view restaurant_metrics
with (security_invoker = on) as
select
  r.id as restaurant_id,
  (select count(*) from applications a
     where a.restaurant_id = r.id)::int as total,
  (select count(*) from applications a
     where a.restaurant_id = r.id
       and a.applied_at >= now() - interval '7 days')::int as week,
  (select count(*) from applications a
     where a.restaurant_id = r.id
       and a.applied_at >= date_trunc('month', now()))::int as month,
  (select count(*) from jobs j
     where j.restaurant_id = r.id and j.active)::int as open_jobs,
  (select count(*) from notifications n
     where n.restaurant_id = r.id
       and n.channel = 'panel' and n.status = 'unread')::int as unread
from restaurants r;

-- ---------------------------------------------------------------------------
-- job_list — vaga + nº de candidaturas associadas (§19)
-- ---------------------------------------------------------------------------
create or replace view job_list
with (security_invoker = on) as
select
  j.*,
  (select count(*) from applications a where a.job_id = j.id)::int as applicants
from jobs j;

-- ---------------------------------------------------------------------------
-- platform_metrics — painel do administrador (§22). Uma só linha.
-- ---------------------------------------------------------------------------
create or replace view platform_metrics
with (security_invoker = on) as
select
  (select count(*) from restaurants)::int                            as restaurants,
  (select count(*) from restaurants where active)::int               as restaurants_active,
  (select count(*) from applications)::int                           as applications,
  (select count(*) from applications
     where applied_at >= now() - interval '7 days')::int             as applications_7d,
  (select count(*) from users)::int                                  as users,
  (select count(*) from users where blocked)::int                    as users_blocked,
  (select count(*) from jobs)::int                                   as jobs,
  (select count(*) from notifications where status = 'failed')::int  as notifications_failed;

-- ---------------------------------------------------------------------------
-- admin_restaurant_list / admin_user_list (§22)
-- ---------------------------------------------------------------------------
-- Colunas explícitas (não r.*): o admin vê só o que o painel mostra, e a
-- view não muda de forma quando `restaurants` ganha colunas (r.* fazia
-- falhar a reaplicação desta migration depois de 0005). drop + create porque
-- versões antigas da view tinham mais colunas.
drop view if exists admin_restaurant_list;
create view admin_restaurant_list
with (security_invoker = on) as
select
  r.id, r.slug, r.name, r.owner_name, r.email, r.city,
  r.active, r.hiring_status, r.created_at,
  (select count(*) from applications a where a.restaurant_id = r.id)::int as apps,
  (select count(*) from users u where u.restaurant_id = r.id)::int        as owners
from restaurants r;

create or replace view admin_user_list
with (security_invoker = on) as
select
  u.id, u.email, u.full_name, u.role, u.blocked, u.created_at,
  u.restaurant_id,
  r.name as restaurant_name
from users u
left join restaurants r on r.id = u.restaurant_id;

-- ===========================================================================
-- FUNÇÕES (escritas atómicas)
-- ===========================================================================
-- Cada função corre numa transação própria: se qualquer statement falhar,
-- nada fica meio-gravado. É isto que substitui o BEGIN/COMMIT que o
-- PostgREST não oferece.
--
-- Todas recebem um único parâmetro jsonb `p`, por duas razões: evita listas
-- de 18 argumentos posicionais e torna a chamada a partir do supabase-js
-- um objeto JavaScript direto.
--
-- Nenhuma é SECURITY DEFINER: correm com os direitos de quem chama. Como o
-- anon não tem direitos nas tabelas (0001) e o EXECUTE é revogado no fim
-- deste ficheiro, só a service_role as consegue usar.

-- ---------------------------------------------------------------------------
-- register_restaurant — restaurante + utilizador owner + slug único (§9)
-- ---------------------------------------------------------------------------
-- A geração do slug fica aqui dentro para ser à prova de corrida: dois
-- registos simultâneos com o mesmo nome não podem colidir.
create or replace function register_restaurant(p jsonb) returns jsonb
language plpgsql as $$
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

  insert into users (restaurant_id, email, password_hash, full_name, phone, role)
  values (
    v_rid,
    (p->>'email')::citext,
    p->>'password_hash',
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

-- ---------------------------------------------------------------------------
-- submit_application — a candidatura completa, atómica (§7)
-- ---------------------------------------------------------------------------
-- candidato + candidatura + CV + consentimentos + histórico + notificação.
-- O ficheiro já está no Storage quando isto corre; se esta função falhar, o
-- backend apaga o objeto que carregou.
create or replace function submit_application(p jsonb) returns jsonb
language plpgsql as $$
declare
  v_rid   bigint := (p->>'restaurant_id')::bigint;
  v_email citext := (p->>'email')::citext;
  v_cid   bigint;
  v_aid   bigint;
begin
  -- candidatura duplicada recente, no mesmo restaurante (§26)
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

  insert into candidates (
    restaurant_id, first_name, last_name, email, phone, doc_type, doc_number
  ) values (
    v_rid,
    p->>'first_name',
    coalesce(p->>'last_name', ''),
    v_email,
    coalesce(p->>'phone', ''),
    coalesce(p->>'doc_type', ''),
    coalesce(p->>'doc_number', '')
  )
  on conflict (restaurant_id, email) do update set
    first_name = excluded.first_name,
    last_name  = excluded.last_name,
    phone      = excluded.phone,
    doc_type   = case when excluded.doc_type <> ''
                      then excluded.doc_type else candidates.doc_type end,
    -- não apaga um documento já conhecido com um envio que o deixou vazio
    doc_number = case when excluded.doc_number <> ''
                      then excluded.doc_number else candidates.doc_number end
  returning id into v_cid;

  insert into applications (
    restaurant_id, candidate_id, job_id, job_title,
    availability, experience, observations
  ) values (
    v_rid,
    v_cid,
    nullif(p->>'job_id', '')::bigint,
    coalesce(p->>'job_title', ''),
    coalesce(p->>'availability', ''),
    coalesce(p->>'experience', ''),
    coalesce(p->>'observations', '')
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
    coalesce(nullif(p->>'mime_type', ''), 'application/pdf'),
    coalesce((p->>'size_bytes')::bigint, 0)
  );

  insert into consents (
    application_id, selection_consent, future_opportunity_consent,
    consent_version, consent_text
  ) values (
    v_aid,
    true,
    coalesce((p->>'future_consent')::boolean, false),
    coalesce(p->>'consent_version', ''),
    coalesce(p->>'consent_text', '')
  );

  insert into application_history (
    application_id, restaurant_id, event, new_status, detail
  ) values (
    v_aid, v_rid, 'recibida', 'nuevo', 'Candidatura recibida'
  );

  insert into notifications (restaurant_id, application_id, type, channel, status)
  values (v_rid, v_aid, 'nueva_candidatura', 'panel', 'unread');

  return jsonb_build_object(
    'ok', true, 'application_id', v_aid, 'candidate_id', v_cid
  );
end;
$$;

-- ---------------------------------------------------------------------------
-- submit_interest — contratação pausada ou sem vagas (§20)
-- ---------------------------------------------------------------------------
-- Sem CV: só dados de contacto, já marcado como Reserva.
create or replace function submit_interest(p jsonb) returns jsonb
language plpgsql as $$
declare
  v_rid   bigint := (p->>'restaurant_id')::bigint;
  v_email citext := (p->>'email')::citext;
  v_cid   bigint;
  v_aid   bigint;
begin
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
    first_name = excluded.first_name,
    phone      = excluded.phone
  returning id into v_cid;

  insert into applications (
    restaurant_id, candidate_id, job_title, status, future_interest, experience
  ) values (
    v_rid, v_cid, 'Oportunidades futuras', 'reserva', true,
    -- breve descrição do que a pessoa sabe/quer fazer (opcional)
    coalesce(p->>'experience', '')
  )
  returning id into v_aid;

  insert into consents (
    application_id, selection_consent, future_opportunity_consent,
    consent_version, consent_text
  ) values (
    v_aid, true, true,
    coalesce(p->>'consent_version', ''), coalesce(p->>'consent_text', '')
  );

  insert into application_history (
    application_id, restaurant_id, event, new_status, detail
  ) values (
    v_aid, v_rid, 'recibida', 'reserva', 'Interés para futuras oportunidades'
  );

  insert into notifications (restaurant_id, application_id, type, channel, status)
  values (v_rid, v_aid, 'nueva_candidatura', 'panel', 'unread');

  return jsonb_build_object(
    'ok', true, 'application_id', v_aid, 'candidate_id', v_cid
  );
end;
$$;

-- ---------------------------------------------------------------------------
-- set_application_status — muda o estado e grava o histórico (§13, §18)
-- ---------------------------------------------------------------------------
-- O filtro por restaurant_id está dentro da função: não há como mudar o
-- estado de uma candidatura de outro restaurante (§8, proteção IDOR).
create or replace function set_application_status(p jsonb) returns jsonb
language plpgsql as $$
declare
  v_aid    bigint := (p->>'application_id')::bigint;
  v_rid    bigint := (p->>'restaurant_id')::bigint;
  v_uid    bigint := nullif(p->>'user_id', '')::bigint;
  v_status text   := p->>'status';
  v_old    text;
begin
  select status into v_old
  from applications
  where id = v_aid and restaurant_id = v_rid
  for update;

  if not found then
    return jsonb_build_object('ok', false, 'reason', 'not_found');
  end if;

  update applications set
    status = v_status,
    future_interest = case when v_status = 'reserva' then true else future_interest end
  where id = v_aid and restaurant_id = v_rid;

  if v_old is distinct from v_status then
    insert into application_history (
      application_id, restaurant_id, user_id, event, old_status, new_status, detail
    ) values (
      v_aid, v_rid, v_uid, 'estado', v_old, v_status,
      coalesce(p->>'detail', '')
    );
  end if;

  return jsonb_build_object('ok', true, 'old_status', v_old, 'new_status', v_status);
end;
$$;

-- ---------------------------------------------------------------------------
-- toggle_favorite (§16)
-- ---------------------------------------------------------------------------
create or replace function toggle_favorite(p jsonb) returns jsonb
language plpgsql as $$
declare
  v_aid bigint := (p->>'application_id')::bigint;
  v_rid bigint := (p->>'restaurant_id')::bigint;
  v_uid bigint := nullif(p->>'user_id', '')::bigint;
  v_new boolean;
begin
  update applications set favorite = not favorite
  where id = v_aid and restaurant_id = v_rid
  returning favorite into v_new;

  if not found then
    return jsonb_build_object('ok', false, 'reason', 'not_found');
  end if;

  insert into application_history (
    application_id, restaurant_id, user_id, event, detail
  ) values (
    v_aid, v_rid, v_uid, 'favorito',
    case when v_new then 'Marcado como favorito' else 'Desmarcado como favorito' end
  );

  return jsonb_build_object('ok', true, 'favorite', v_new);
end;
$$;

-- ---------------------------------------------------------------------------
-- delete_application — apaga a candidatura e devolve o CV a remover (§14)
-- ---------------------------------------------------------------------------
-- Devolve o storage_path para o backend apagar o objeto no Storage: a função
-- não tem (nem deve ter) acesso ao Storage.
create or replace function delete_application(p jsonb) returns jsonb
language plpgsql as $$
declare
  v_aid  bigint := (p->>'application_id')::bigint;
  v_rid  bigint := (p->>'restaurant_id')::bigint;
  v_cid  bigint;
  v_path text;
  v_left int;
begin
  select a.candidate_id, cv.storage_path
    into v_cid, v_path
  from applications a
  left join cvs cv on cv.application_id = a.id
  where a.id = v_aid and a.restaurant_id = v_rid;

  if v_cid is null then
    return jsonb_build_object('ok', false, 'reason', 'not_found');
  end if;

  -- cvs, consents, notes, history e notifications caem por ON DELETE CASCADE
  delete from applications where id = v_aid and restaurant_id = v_rid;

  select count(*)::int into v_left from applications where candidate_id = v_cid;
  if v_left = 0 then
    delete from candidates where id = v_cid;
  end if;

  return jsonb_build_object('ok', true, 'storage_path', v_path);
end;
$$;

-- ---------------------------------------------------------------------------
-- Vagas (§19)
-- ---------------------------------------------------------------------------
create or replace function toggle_job_active(p jsonb) returns jsonb
language plpgsql as $$
declare
  v_new boolean;
begin
  update jobs set active = not active
  where id = (p->>'job_id')::bigint
    and restaurant_id = (p->>'restaurant_id')::bigint
  returning active into v_new;

  if not found then
    return jsonb_build_object('ok', false, 'reason', 'not_found');
  end if;
  return jsonb_build_object('ok', true, 'active', v_new);
end;
$$;

-- Eliminar a vaga preserva as candidaturas: job_id é ON DELETE SET NULL e
-- applications.job_title guarda o snapshot do título.
create or replace function delete_job(p jsonb) returns jsonb
language plpgsql as $$
declare
  v_title text;
begin
  delete from jobs
  where id = (p->>'job_id')::bigint
    and restaurant_id = (p->>'restaurant_id')::bigint
  returning title into v_title;

  if not found then
    return jsonb_build_object('ok', false, 'reason', 'not_found');
  end if;
  return jsonb_build_object('ok', true, 'title', v_title);
end;
$$;

-- ---------------------------------------------------------------------------
-- Notificações (§21)
-- ---------------------------------------------------------------------------
create or replace function mark_notifications_read(p jsonb) returns jsonb
language plpgsql as $$
declare
  v_n int;
begin
  with updated as (
    update notifications set status = 'read', read_at = now()
    where restaurant_id = (p->>'restaurant_id')::bigint
      and channel = 'panel'
      and status = 'unread'
    returning 1
  )
  select count(*)::int into v_n from updated;

  return jsonb_build_object('ok', true, 'updated', v_n);
end;
$$;

-- ---------------------------------------------------------------------------
-- Administração da plataforma (§22)
-- ---------------------------------------------------------------------------
create or replace function toggle_restaurant_active(p jsonb) returns jsonb
language plpgsql as $$
declare
  v_name text;
  v_new  boolean;
begin
  update restaurants set active = not active
  where id = (p->>'restaurant_id')::bigint
  returning name, active into v_name, v_new;

  if not found then
    return jsonb_build_object('ok', false, 'reason', 'not_found');
  end if;
  return jsonb_build_object('ok', true, 'name', v_name, 'active', v_new);
end;
$$;

-- Bloquear um utilizador termina as sessões dele no mesmo instante.
create or replace function toggle_user_blocked(p jsonb) returns jsonb
language plpgsql as $$
declare
  v_uid   bigint := (p->>'user_id')::bigint;
  v_email text;
  v_new   boolean;
begin
  update users set blocked = not blocked
  where id = v_uid and role <> 'admin'
  returning email, blocked into v_email, v_new;

  if not found then
    return jsonb_build_object('ok', false, 'reason', 'not_found');
  end if;

  if v_new then
    delete from sessions where user_id = v_uid;
  end if;

  return jsonb_build_object('ok', true, 'email', v_email, 'blocked', v_new);
end;
$$;

-- ---------------------------------------------------------------------------
-- Sessões
-- ---------------------------------------------------------------------------
create or replace function touch_session(p jsonb) returns jsonb
language plpgsql as $$
begin
  update sessions set expires_at = (p->>'expires_at')::bigint
  where token_hash = p->>'token_hash';

  delete from sessions where expires_at <= (p->>'now')::bigint;

  return jsonb_build_object('ok', true);
end;
$$;

-- ---------------------------------------------------------------------------
-- purge_test_data — limpeza no fim dos testes E2E
-- ---------------------------------------------------------------------------
-- Devolve os caminhos dos CVs para o teste apagar os objetos do Storage.
-- Só toca em restaurantes marcados com test_prefix, nunca em dados reais.
create or replace function purge_test_data(p jsonb) returns jsonb
language plpgsql as $$
declare
  v_prefix text := p->>'test_prefix';
  v_paths  text[];
  v_media  text[];
  v_n      int;
begin
  if coalesce(v_prefix, '') = '' then
    return jsonb_build_object('ok', false, 'reason', 'missing_prefix');
  end if;

  select coalesce(array_agg(cv.storage_path), '{}'::text[])
    into v_paths
  from cvs cv
  join restaurants r on r.id = cv.restaurant_id
  where r.test_prefix = v_prefix;

  select coalesce(
           array_agg(x) filter (where x is not null and x <> ''),
           '{}'::text[]
         )
    into v_media
  from restaurants r
  cross join lateral (values (r.logo_path), (r.photo_path)) as t(x)
  where r.test_prefix = v_prefix;

  with gone as (
    delete from restaurants where test_prefix = v_prefix returning 1
  )
  select count(*)::int into v_n from gone;

  -- utilizadores ficam com restaurant_id null (ON DELETE SET NULL): remover
  delete from users
  where restaurant_id is null
    and email like '%' || v_prefix || '%';

  delete from security_logs
  where detail like '%' || v_prefix || '%';

  return jsonb_build_object(
    'ok', true, 'restaurants', v_n, 'paths', v_paths, 'media', v_media
  );
end;
$$;

-- ===========================================================================
-- Permissões
-- ===========================================================================
-- Nem as views nem as funções são acessíveis com a chave anon/publishable.
do $$
declare
  r text;
  has_anon boolean := exists (select 1 from pg_roles where rolname = 'anon');
  has_auth boolean := exists (select 1 from pg_roles where rolname = 'authenticated');
  has_svc  boolean := exists (select 1 from pg_roles where rolname = 'service_role');
begin
  foreach r in array array[
    'session_context', 'application_list', 'application_status_counts',
    'restaurant_metrics', 'job_list', 'platform_metrics',
    'admin_restaurant_list', 'admin_user_list'
  ]
  loop
    if has_anon then execute format('revoke all on %I from anon', r); end if;
    if has_auth then execute format('revoke all on %I from authenticated', r); end if;
  end loop;

  foreach r in array array[
    'register_restaurant(jsonb)', 'submit_application(jsonb)',
    'submit_interest(jsonb)', 'set_application_status(jsonb)',
    'toggle_favorite(jsonb)', 'delete_application(jsonb)',
    'toggle_job_active(jsonb)', 'delete_job(jsonb)',
    'mark_notifications_read(jsonb)', 'toggle_restaurant_active(jsonb)',
    'toggle_user_blocked(jsonb)', 'touch_session(jsonb)',
    'purge_test_data(jsonb)'
  ]
  loop
    execute format('revoke all on function %s from public', r);
    if has_anon then execute format('revoke all on function %s from anon', r); end if;
    if has_auth then execute format('revoke all on function %s from authenticated', r); end if;
    if has_svc  then execute format('grant execute on function %s to service_role', r); end if;
  end loop;
end;
$$;

insert into schema_migrations (version) values ('0002_views_rpc')
on conflict (version) do nothing;

-- Faz o PostgREST recarregar o schema para ver as views e funções novas.
notify pgrst, 'reload schema';

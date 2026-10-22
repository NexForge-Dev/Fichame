-- ===========================================================================
-- Fíchame — 0012_review_fixes
--
-- Correções da revisão de 2026-10-22:
--   1. Índices em notifications(application_id) e cvs(storage_path): a FK com
--      cascade e a deteção de CVs órfãos faziam procuras sem índice.
--   2. submit_application / submit_interest com lock por negócio + email:
--      dois envios simultâneos já não geram candidaturas duplicadas.
--   3. update_rights_request: guardar de novo um pedido fechado mantém a
--      data de resolução original.
--   4. set_retention_settings: prazo vazio dá «out_of_bounds», não erro 500.
--   5. restaurant_metrics.month conta o mês em hora de Madrid.
--
-- Só substitui funções e a view (mesmas colunas). Idempotente. Aplicar
-- depois de 0011.
-- ===========================================================================

create index if not exists idx_notif_application on notifications (application_id);
create index if not exists idx_cvs_storage_path  on cvs (storage_path);

-- ---------------------------------------------------------------------------
-- submit_application (v3) — v2 de 0005 + lock contra envio duplo
-- ---------------------------------------------------------------------------
create or replace function submit_application(p jsonb) returns jsonb
language plpgsql as $$
declare
  v_rid    bigint  := (p->>'restaurant_id')::bigint;
  v_email  citext  := (p->>'email')::citext;
  v_future boolean := coalesce((p->>'future_consent')::boolean, false);
  v_cid    bigint;
  v_aid    bigint;
begin
  -- Dois toques em «Enviar» num 4G lento podem chegar quase em simultâneo:
  -- sem este lock, os dois EXISTS passam antes de qualquer INSERT e ficam
  -- duas candidaturas. O lock é por negócio + email e só dura a transação.
  perform pg_advisory_xact_lock(hashtextextended('apply:' || v_rid || ':' || lower(v_email::text), 0));

  -- duplicado recente NO MESMO restaurante; o backend responde ao candidato
  -- exatamente como a um envio novo (sem revelar que a pessoa já se candidatou)
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

  insert into candidates (restaurant_id, first_name, last_name, email, phone)
  values (
    v_rid,
    p->>'first_name',
    coalesce(p->>'last_name', ''),
    v_email,
    coalesce(p->>'phone', '')
  )
  on conflict (restaurant_id, email) do update set
    first_name = excluded.first_name,
    last_name  = excluded.last_name,
    phone      = excluded.phone
  returning id into v_cid;

  insert into applications (
    restaurant_id, candidate_id, job_id, job_title,
    availability, experience, observations, future_interest
  ) values (
    v_rid,
    v_cid,
    nullif(p->>'job_id', '')::bigint,
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
-- submit_interest (v3) — v2 de 0005 + lock contra envio duplo
-- ---------------------------------------------------------------------------
create or replace function submit_interest(p jsonb) returns jsonb
language plpgsql as $$
declare
  v_rid   bigint := (p->>'restaurant_id')::bigint;
  v_email citext := (p->>'email')::citext;
  v_cid   bigint;
  v_aid   bigint;
begin
  -- Dois toques em «Enviar» num 4G lento podem chegar quase em simultâneo:
  -- sem este lock, os dois EXISTS passam antes de qualquer INSERT e ficam
  -- duas candidaturas. O lock é por negócio + email e só dura a transação.
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
    first_name = excluded.first_name,
    phone      = excluded.phone
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
-- update_rights_request (v2)
-- ---------------------------------------------------------------------------
create or replace function update_rights_request(p jsonb) returns jsonb
language plpgsql as $$
declare
  v_id     bigint := (p->>'id')::bigint;
  v_rid    bigint := (p->>'restaurant_id')::bigint;
  v_status text   := p->>'status';
  v_extend boolean := coalesce((p->>'extend')::boolean, false);
begin
  update rights_requests set
    status = v_status,
    resolution_note = left(coalesce(p->>'note', resolution_note), 2000),
    -- Voltar a guardar um pedido já fechado (ex.: só para editar a nota) não
    -- muda a data da resposta nem atrasa a purga.
    resolved_at = case when v_status in ('resuelta', 'denegada') then coalesce(resolved_at, now()) else null end,
    resolved_by = case when v_status in ('resuelta', 'denegada')
                       then coalesce(resolved_by, nullif(p->>'user_id', '')::bigint) else null end,
    -- prorrogação única de 2 meses (art. 12.3 RGPD)
    due_at = case when v_extend and not extended then due_at + interval '2 months' else due_at end,
    extended = extended or v_extend
  where id = v_id and restaurant_id = v_rid;

  if not found then
    return jsonb_build_object('ok', false, 'reason', 'not_found');
  end if;
  return jsonb_build_object('ok', true);
end;
$$;

-- ---------------------------------------------------------------------------
-- set_retention_settings (v2)
-- ---------------------------------------------------------------------------
create or replace function set_retention_settings(p jsonb) returns jsonb
language plpgsql as $$
declare
  v_rid bigint := (p->>'restaurant_id')::bigint;
  v_n   int := 0;
  v_aid bigint;
begin
  update restaurants set
    retention_closed_days   = (p->>'closed_days')::int,
    retention_inactive_days = (p->>'inactive_days')::int,
    retention_reserve_days  = (p->>'reserve_days')::int
  where id = v_rid;

  if not found then
    return jsonb_build_object('ok', false, 'reason', 'not_found');
  end if;

  for v_aid in select id from applications where restaurant_id = v_rid loop
    perform recompute_retention(v_aid);
    v_n := v_n + 1;
  end loop;

  return jsonb_build_object('ok', true, 'recomputed', v_n);
exception
  -- not_null_violation: um prazo vazio chega como null (pedido forjado; o
  -- formulário tem required). Mesma resposta que um prazo fora dos limites.
  when check_violation or not_null_violation or invalid_text_representation then
    return jsonb_build_object('ok', false, 'reason', 'out_of_bounds');
end;
$$;

-- ---------------------------------------------------------------------------
-- restaurant_metrics — «este mês» em hora de Madrid (antes: UTC, e as
-- primeiras 1–2 h de cada mês contavam no mês anterior)
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
       and a.applied_at >= (date_trunc('month', now() at time zone 'Europe/Madrid') at time zone 'Europe/Madrid'))::int as month,
  (select count(*) from jobs j
     where j.restaurant_id = r.id and j.active)::int as open_jobs,
  (select count(*) from notifications n
     where n.restaurant_id = r.id
       and n.channel = 'panel' and n.status = 'unread')::int as unread
from restaurants r;

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
    'update_rights_request(jsonb)', 'set_retention_settings(jsonb)'
  ]
  loop
    execute format('alter function %s set search_path = public, pg_temp', f);
    execute format('revoke all on function %s from public', f);
    if has_anon then execute format('revoke all on function %s from anon', f); end if;
    if has_auth then execute format('revoke all on function %s from authenticated', f); end if;
    if has_svc  then execute format('grant execute on function %s to service_role', f); end if;
  end loop;

  if has_anon then execute 'revoke all on restaurant_metrics from anon'; end if;
  if has_auth then execute 'revoke all on restaurant_metrics from authenticated'; end if;
end;
$$;

insert into schema_migrations (version) values ('0012_review_fixes')
on conflict (version) do nothing;

notify pgrst, 'reload schema';

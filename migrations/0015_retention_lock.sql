-- ===========================================================================
-- Fíchame — 0015_retention_lock
--
-- apply_retention (0005) escolhia as candidaturas a apagar e depois apagava
-- `where id = any(v_ids)` sem bloquear as linhas nem voltar a olhar para
-- legal_hold. Um bloqueio de conservação gravado entre as duas instruções
-- perdia-se: a candidatura e o CV eram apagados na mesma.
--
-- Agora a seleção usa FOR UPDATE: um set_legal_hold em simultâneo espera, e
-- se ganhar a corrida a linha volta a ser avaliada (legal_hold = true) e fica
-- de fora. O resto da função é igual a 0005.
--
-- Não muda nenhuma interface. Idempotente. Aplicar depois de 0014.
-- Está em REQUIRED_MIGRATIONS desde que /api/health passou a verificá-la.
-- ===========================================================================

create or replace function apply_retention(p jsonb) returns jsonb
language plpgsql as $$
declare
  v_dry   boolean := coalesce((p->>'dry_run')::boolean, true);
  v_limit int     := least(greatest(coalesce((p->>'limit')::int, 500), 1), 5000);
  v_ids   bigint[];
  v_paths text[];
  v_by_r  jsonb;
  v_cids  bigint[];
  v_cands int;
begin
  select coalesce(array_agg(id), '{}'::bigint[]) into v_ids
  from (
    select id from applications
    where retention_until is not null
      and retention_until < now()
      and not legal_hold
    order by retention_until
    limit v_limit
    for update
  ) x;

  select coalesce(jsonb_object_agg(restaurant_id::text, n), '{}'::jsonb) into v_by_r
  from (select restaurant_id, count(*)::int as n from applications where id = any(v_ids) group by restaurant_id) y;

  if v_dry then
    return jsonb_build_object('ok', true, 'dry_run', true, 'applications', cardinality(v_ids), 'by_restaurant', v_by_r);
  end if;

  select coalesce(array_agg(storage_path), '{}'::text[]) into v_paths
  from cvs where application_id = any(v_ids);

  select coalesce(array_agg(distinct candidate_id), '{}'::bigint[]) into v_cids
  from applications where id = any(v_ids);

  delete from applications where id = any(v_ids);

  with gone as (
    delete from candidates c
    where c.id = any(v_cids)
      and not exists (select 1 from applications a where a.candidate_id = c.id)
    returning 1
  ) select count(*)::int into v_cands from gone;

  return jsonb_build_object(
    'ok', true, 'dry_run', false,
    'applications', cardinality(v_ids), 'candidates', v_cands,
    'by_restaurant', v_by_r, 'paths', v_paths
  );
end;
$$;

-- search_path fixo e permissões (como em 0013/0014)
do $$
declare
  has_anon boolean := exists (select 1 from pg_roles where rolname = 'anon');
  has_auth boolean := exists (select 1 from pg_roles where rolname = 'authenticated');
  has_svc  boolean := exists (select 1 from pg_roles where rolname = 'service_role');
begin
  execute 'alter function apply_retention(jsonb) set search_path = public, pg_temp';
  execute 'revoke all on function apply_retention(jsonb) from public';
  if has_anon then execute 'revoke all on function apply_retention(jsonb) from anon'; end if;
  if has_auth then execute 'revoke all on function apply_retention(jsonb) from authenticated'; end if;
  if has_svc  then execute 'grant execute on function apply_retention(jsonb) to service_role'; end if;
end;
$$;

insert into schema_migrations (version) values ('0015_retention_lock')
on conflict (version) do nothing;

notify pgrst, 'reload schema';

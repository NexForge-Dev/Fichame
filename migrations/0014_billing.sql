-- ===========================================================================
-- Fíchame — 0014_billing
--
-- Assinaturas Stripe (Checkout + Customer Portal alojados):
--   1. restaurants: plano, periodicidade, ids da Stripe, estado da
--      assinatura, fim do período e garantia de preço do plano Fundadores.
--   2. stripe_events: idempotência do webhook (cada evento só se processa
--      uma vez, mesmo que a Stripe o reenvie).
--   3. claim_founders_seat: atribuição ATÓMICA de uma vaga do plano
--      Fundadores (limite passado pelo backend, de src/lib/pricing.js).
--
-- O plano nunca bloqueia o uso: só é informativo (ver src/lib/billing.js).
-- session_context e admin_restaurant_list NÃO mudam: o painel lê o plano na
-- query a `restaurants` que já faz em cada página, e o admin numa query à
-- parte. Assim reaplicar 0002 continua a funcionar sem estas colunas.
--
-- Idempotente. Aplicar depois de 0013.
-- ===========================================================================

-- ---------------------------------------------------------------------------
-- 1. Colunas de cobrança em restaurants
-- ---------------------------------------------------------------------------
alter table restaurants add column if not exists plan                        text not null default 'trial';
alter table restaurants add column if not exists billing_interval            text;
alter table restaurants add column if not exists stripe_customer_id          text;
alter table restaurants add column if not exists stripe_subscription_id      text;
alter table restaurants add column if not exists subscription_status         text;
alter table restaurants add column if not exists current_period_end          timestamptz;
alter table restaurants add column if not exists plan_started_at             timestamptz;
alter table restaurants add column if not exists founders_price_locked_until timestamptz;

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'restaurants_plan_check') then
    alter table restaurants add constraint restaurants_plan_check
      check (plan in ('trial', 'founders', 'pro'));
  end if;
  if not exists (select 1 from pg_constraint where conname = 'restaurants_billing_interval_check') then
    alter table restaurants add constraint restaurants_billing_interval_check
      check (billing_interval is null or billing_interval in ('month', 'year'));
  end if;
  if not exists (select 1 from pg_constraint where conname = 'restaurants_subscription_status_len') then
    alter table restaurants add constraint restaurants_subscription_status_len
      check (subscription_status is null or char_length(subscription_status) <= 40);
  end if;
end;
$$;

-- Um cliente e uma assinatura da Stripe pertencem a um só negócio.
create unique index if not exists uq_restaurants_stripe_customer
  on restaurants (stripe_customer_id) where stripe_customer_id is not null;
create unique index if not exists uq_restaurants_stripe_subscription
  on restaurants (stripe_subscription_id) where stripe_subscription_id is not null;
-- Contagem das vagas Fundadores (claim_founders_seat e /panel/plan).
create index if not exists idx_restaurants_plan_status
  on restaurants (plan, subscription_status);

-- ---------------------------------------------------------------------------
-- 2. stripe_events — idempotência do webhook
-- ---------------------------------------------------------------------------
-- Só o id e o tipo: o conteúdo do evento (moradas, emails) não se guarda.
create table if not exists stripe_events (
  id         text        primary key check (char_length(id) between 1 and 255),
  type       text        not null default '' check (char_length(type) <= 120),
  created_at timestamptz not null default now()
);

create index if not exists idx_stripe_events_created on stripe_events (created_at);

-- RLS deny-all e revogação (como em 0001/0005/0013): só o service_role lê.
do $$
declare
  has_anon boolean := exists (select 1 from pg_roles where rolname = 'anon');
  has_auth boolean := exists (select 1 from pg_roles where rolname = 'authenticated');
begin
  execute 'alter table stripe_events enable row level security';
  if has_anon then execute 'revoke all on table stripe_events from anon'; end if;
  if has_auth then execute 'revoke all on table stripe_events from authenticated'; end if;
end;
$$;

-- ---------------------------------------------------------------------------
-- 3. claim_founders_seat — vaga do plano Fundadores, à prova de corrida
-- ---------------------------------------------------------------------------
-- Parâmetros (jsonb p):
--   restaurant_id, max_customers, lock_months      (obrigatórios)
--   stripe_customer_id, stripe_subscription_id, subscription_status,
--   billing_interval, current_period_end            (estado da assinatura)
--
-- Ocupa vaga um negócio com plan = 'founders' e assinatura active, trialing
-- ou past_due. O advisory lock serializa as atribuições: dois webhooks em
-- simultâneo com 49 vagas ocupadas não podem ficar os dois com a 50.ª.
--
-- Um negócio que já é Fundador só atualiza o estado (idempotente, mantém a
-- data de adesão e a garantia de preço). Sem vaga devolve ok=false e NÃO
-- muda nada: o backend regista o caso para o admin resolver.
create or replace function claim_founders_seat(p jsonb) returns jsonb
language plpgsql as $$
declare
  v_rid    bigint := (p->>'restaurant_id')::bigint;
  v_max    int    := (p->>'max_customers')::int;
  v_months int    := (p->>'lock_months')::int;
  v_status text   := coalesce(nullif(p->>'subscription_status', ''), 'active');
  v_plan   text;
  v_old_st text;
  v_start  timestamptz;
  v_taken  int;
  v_now    timestamptz := now();
begin
  if v_rid is null or v_max is null or v_max < 0 or v_months is null or v_months < 0 then
    return jsonb_build_object('ok', false, 'reason', 'bad_params');
  end if;

  perform pg_advisory_xact_lock(hashtextextended('founders_seats', 0));

  select plan, subscription_status, plan_started_at
    into v_plan, v_old_st, v_start
  from restaurants where id = v_rid
  for update;

  if not found then
    return jsonb_build_object('ok', false, 'reason', 'not_found');
  end if;

  if v_plan = 'founders' and v_old_st in ('active', 'trialing', 'past_due') then
    update restaurants set
      stripe_customer_id     = coalesce(nullif(p->>'stripe_customer_id', ''), stripe_customer_id),
      stripe_subscription_id = coalesce(nullif(p->>'stripe_subscription_id', ''), stripe_subscription_id),
      subscription_status    = v_status,
      billing_interval       = coalesce(nullif(p->>'billing_interval', ''), billing_interval),
      current_period_end     = coalesce(nullif(p->>'current_period_end', '')::timestamptz, current_period_end),
      plan_started_at        = coalesce(plan_started_at, v_now),
      founders_price_locked_until = coalesce(founders_price_locked_until,
        coalesce(plan_started_at, v_now) + make_interval(months => v_months))
    where id = v_rid;
    return jsonb_build_object('ok', true, 'already', true);
  end if;

  select count(*) into v_taken
  from restaurants
  where plan = 'founders'
    and subscription_status in ('active', 'trialing', 'past_due')
    and id <> v_rid;

  if v_taken >= v_max then
    return jsonb_build_object('ok', false, 'reason', 'full', 'taken', v_taken);
  end if;

  update restaurants set
    plan                   = 'founders',
    stripe_customer_id     = coalesce(nullif(p->>'stripe_customer_id', ''), stripe_customer_id),
    stripe_subscription_id = coalesce(nullif(p->>'stripe_subscription_id', ''), stripe_subscription_id),
    subscription_status    = v_status,
    billing_interval       = coalesce(nullif(p->>'billing_interval', ''), 'month'),
    current_period_end     = nullif(p->>'current_period_end', '')::timestamptz,
    -- Fundador com a assinatura em impago que volta a pagar: mantém a data
    -- de adesão e a garantia de preço. Adesão nova: começa agora.
    plan_started_at        = case when v_plan = 'founders' then coalesce(v_start, v_now) else v_now end,
    founders_price_locked_until = case
      when v_plan = 'founders' then coalesce(founders_price_locked_until, coalesce(v_start, v_now) + make_interval(months => v_months))
      else v_now + make_interval(months => v_months)
    end
  where id = v_rid;

  return jsonb_build_object('ok', true, 'already', false, 'taken', v_taken + 1);
end;
$$;

-- ---------------------------------------------------------------------------
-- search_path fixo e permissões (como em 0013)
-- ---------------------------------------------------------------------------
do $$
declare
  has_anon boolean := exists (select 1 from pg_roles where rolname = 'anon');
  has_auth boolean := exists (select 1 from pg_roles where rolname = 'authenticated');
  has_svc  boolean := exists (select 1 from pg_roles where rolname = 'service_role');
begin
  execute 'alter function claim_founders_seat(jsonb) set search_path = public, pg_temp';
  execute 'revoke all on function claim_founders_seat(jsonb) from public';
  if has_anon then execute 'revoke all on function claim_founders_seat(jsonb) from anon'; end if;
  if has_auth then execute 'revoke all on function claim_founders_seat(jsonb) from authenticated'; end if;
  if has_svc  then execute 'grant execute on function claim_founders_seat(jsonb) to service_role'; end if;
end;
$$;

insert into schema_migrations (version) values ('0014_billing')
on conflict (version) do nothing;

notify pgrst, 'reload schema';

'use strict';

/* Cobrança das assinaturas com Stripe (Checkout e Customer Portal alojados).
 *
 * Regras:
 *   - os preços vêm SÓ de src/lib/pricing.js. Na Stripe cada preço tem uma
 *     lookup_key derivada do plano, da periodicidade e do valor em cêntimos
 *     (fichame_pro_monthly_1490): mudar um preço em pricing.js gera uma
 *     chave nova, e `npm run stripe:setup` cria o preço correspondente;
 *   - antes de abrir um Checkout confirma-se que o preço da Stripe tem o
 *     valor, a moeda e a periodicidade de pricing.js. Se não tiver, recusa-se
 *     (nunca se cobra um valor diferente do que a página mostra);
 *   - o estado da assinatura só muda pelo webhook (assinado e idempotente),
 *     e o webhook relê sempre a assinatura na Stripe: os eventos não chegam
 *     por ordem, e um evento antigo não pode desfazer um mais recente;
 *   - o plano NUNCA bloqueia o uso: fim da prova ou pagamento falhado só
 *     mostram avisos no painel (decisão do dono do produto, por agora).
 *
 * As funções puras (lookupKey, assertPriceMatches, checkoutTrialEnd,
 * checkoutSessionParams, subscriptionState, planChange) não tocam na rede e
 * são testadas em test/billing.test.js com um cliente Stripe simulado.
 */

const config = require('../config');
const pricing = require('./pricing');

/* Estados em que a assinatura conta como em vigor (e ocupa vaga Fundadores). */
const LIVE_STATUSES = ['active', 'trialing', 'past_due'];
/* Estados finais: a assinatura acabou e o negócio volta a 'trial'. */
const ENDED_STATUSES = ['canceled', 'incomplete_expired'];

const LOOKUP_PREFIX = 'fichame_';
const INTERVAL_WORD = { month: 'monthly', year: 'yearly' };
/* A Stripe exige trial_end pelo menos 48 h no futuro no Checkout. */
const TRIAL_END_MIN_MS = 48 * 60 * 60 * 1000;
const PRICE_CACHE_MS = 10 * 60 * 1000;

/* Eventos que o endpoint do webhook tem de receber (docs e stripe:setup). */
const WEBHOOK_EVENTS = [
  'checkout.session.completed',
  'customer.subscription.created',
  'customer.subscription.updated',
  'customer.subscription.deleted',
  'invoice.paid',
  'invoice.payment_failed'
];

class BillingConfigError extends Error {
  constructor(message, code = 'billing_config') {
    super(message);
    this.name = 'BillingConfigError';
    this.code = code;
  }
}

function isLive(status) {
  return LIVE_STATUSES.includes(String(status || ''));
}

/* ------------------------------------------------------------------ *
 * Cliente Stripe (preguiçoso; substituível nos testes)
 * ------------------------------------------------------------------ */
let stripeClient = null;
let storeOverride = null;

function getStripe() {
  if (stripeClient) return stripeClient;
  if (!config.billingEnabled) {
    throw new BillingConfigError('Stripe: cobrança desativada (faltam STRIPE_SECRET_KEY e STRIPE_WEBHOOK_SECRET).', 'disabled');
  }
  const Stripe = require('stripe');
  stripeClient = new Stripe(config.stripe.secretKey, {
    appInfo: { name: 'Fíchame' },
    maxNetworkRetries: 2,
    /* Na Vercel a função tem um limite de tempo: melhor falhar e deixar a
     * Stripe reenviar o webhook do que ficar pendurado. */
    timeout: 8000
  });
  return stripeClient;
}

/* Só para testes: cliente simulado e loja em memória. */
function setStripeClient(client) {
  stripeClient = client;
  priceCache.clear();
}
function setStore(store) {
  storeOverride = store;
}

/* ------------------------------------------------------------------ *
 * Preços: lookup_key derivada de pricing.js
 * ------------------------------------------------------------------ */
function toCents(amount) {
  return Math.round(Number(amount) * 100);
}

/* Valor em euros de um plano numa periodicidade, ou null se não existir
 * (Fundadores só é mensal; o avançado e a prova nunca se vendem). */
function planAmount(planId, interval) {
  const plan = pricing.PLANS[planId];
  if (!plan || !plan.available || planId === 'trial') return null;
  if (interval === 'month' && typeof plan.monthly === 'number') return plan.monthly;
  if (interval === 'year' && typeof plan.yearly === 'number') return plan.yearly;
  return null;
}

function lookupKey(planId, interval) {
  const amount = planAmount(planId, interval);
  if (amount == null) return null;
  return `${LOOKUP_PREFIX}${planId}_${INTERVAL_WORD[interval]}_${toCents(amount)}`;
}

/* Todos os preços à venda, como os cria `npm run stripe:setup`. */
function priceSpecs() {
  const out = [];
  for (const plan of Object.values(pricing.PLANS)) {
    for (const interval of ['month', 'year']) {
      const amount = planAmount(plan.id, interval);
      if (amount == null) continue;
      out.push({
        plan: plan.id,
        interval,
        amount,
        unitAmount: toCents(amount),
        currency: pricing.CURRENCY.toLowerCase(),
        lookupKey: lookupKey(plan.id, interval)
      });
    }
  }
  return out;
}

/* Plano e periodicidade a partir da lookup_key de um preço. Aceita valores
 * antigos (uma assinatura criada antes de uma mudança de preço continua a
 * ser Fundadores ou Profesional). */
function planFromLookupKey(key) {
  const m = /^fichame_(founders|pro)_(monthly|yearly)_(\d+)$/.exec(String(key || ''));
  if (!m) return null;
  return { plan: m[1], interval: m[2] === 'yearly' ? 'year' : 'month', unitAmount: Number(m[3]) };
}

/* O preço da Stripe tem de ser exatamente o de pricing.js. Lança
 * BillingConfigError (com a lista do que não bate) em vez de cobrar outro
 * valor. */
function assertPriceMatches(price, spec) {
  const problems = [];
  if (!price) {
    problems.push('não existe nenhum preço ativo com esta lookup_key');
  } else {
    if (price.unit_amount !== spec.unitAmount) problems.push(`unit_amount ${price.unit_amount} ≠ ${spec.unitAmount}`);
    if (String(price.currency || '').toLowerCase() !== spec.currency) problems.push(`moeda ${price.currency} ≠ ${spec.currency}`);
    const rec = price.recurring || {};
    if (rec.interval !== spec.interval || Number(rec.interval_count || 1) !== 1) {
      problems.push(`periodicidade ${rec.interval || 'nenhuma'}/${rec.interval_count || 1} ≠ ${spec.interval}/1`);
    }
    if (price.active === false) problems.push('preço arquivado');
    if (price.tax_behavior && price.tax_behavior !== 'exclusive') problems.push(`tax_behavior ${price.tax_behavior} ≠ exclusive`);
  }
  if (problems.length > 0) {
    throw new BillingConfigError(
      `Stripe: o preço ${spec.lookupKey} não corresponde a src/lib/pricing.js (${problems.join('; ')}). Corre npm run stripe:setup.`,
      'price_mismatch'
    );
  }
  return price;
}

/* Preço por lookup_key, com cache em memória (por instância). */
const priceCache = new Map();

async function resolvePrice(planId, interval, { stripe = getStripe(), now = Date.now() } = {}) {
  const key = lookupKey(planId, interval);
  const spec = key && priceSpecs().find((s) => s.lookupKey === key);
  if (!spec) throw new BillingConfigError(`Stripe: plano ou periodicidade inválidos (${planId}/${interval}).`, 'bad_plan');

  const hit = priceCache.get(key);
  if (hit && now - hit.at < PRICE_CACHE_MS) return hit.price;

  const list = await stripe.prices.list({ lookup_keys: [key], active: true, limit: 1 });
  const price = assertPriceMatches(list && list.data && list.data[0], spec);
  priceCache.set(key, { price, at: now });
  return price;
}

/* ------------------------------------------------------------------ *
 * Checkout
 * ------------------------------------------------------------------ */

/* Fim da prova grátis para o subscription_data.trial_end (segundos Unix),
 * ou null. Quem contrata durante os 30 dias não paga nada até a prova
 * acabar. A Stripe exige pelo menos 48 h: com menos, cobra-se já (a página
 * diz isso antes do clique). */
function checkoutTrialEnd(createdAt, now = new Date()) {
  const t = pricing.trialStatus(createdAt, now);
  if (!t || !t.active) return null;
  if (t.endsAt.getTime() - now.getTime() < TRIAL_END_MIN_MS) return null;
  return Math.floor(t.endsAt.getTime() / 1000);
}

const CHECKOUT_LOCALES = ['es', 'en', 'pt'];
const CHECKOUT_OK = 'Gracias. Estamos confirmando el pago con Stripe: tu plan aparecerá aquí en unos segundos.';

function checkoutSessionParams({
  restaurant, plan, interval, priceId, customerId, lang = 'es',
  appUrl = config.appUrl, tax = config.stripe, now = new Date()
}) {
  const rid = String(restaurant.id);
  const metadata = { restaurant_id: rid, plan, interval };
  const params = {
    mode: 'subscription',
    customer: customerId,
    client_reference_id: rid,
    line_items: [{ price: priceId, quantity: 1 }],
    billing_address_collection: 'required',
    tax_id_collection: { enabled: true },
    customer_update: { address: 'auto', name: 'auto' },
    locale: CHECKOUT_LOCALES.includes(lang) ? lang : 'es',
    metadata,
    subscription_data: { metadata: { ...metadata } },
    success_url: `${appUrl}/panel/plan?ok=${encodeURIComponent(CHECKOUT_OK)}`,
    cancel_url: `${appUrl}/panel/plan`
  };
  if (tax.automaticTax) {
    params.automatic_tax = { enabled: true };
  } else if (tax.taxRateId) {
    params.subscription_data.default_tax_rates = [tax.taxRateId];
  }
  const trialEnd = checkoutTrialEnd(restaurant.created_at, now);
  if (trialEnd) params.subscription_data.trial_end = trialEnd;
  return params;
}

/* Cliente Stripe do negócio: reutiliza o guardado ou cria um (com
 * restaurant_id nos metadados). A chave de idempotência evita dois clientes
 * com um duplo clique. */
async function ensureCustomer(restaurant, { stripe = getStripe(), store = defaultStore(), lang = 'es', fallbackEmail = '' } = {}) {
  if (restaurant.stripe_customer_id) return restaurant.stripe_customer_id;
  const customer = await stripe.customers.create({
    email: String(restaurant.email || fallbackEmail || '') || undefined,
    name: String(restaurant.legal_name || restaurant.name || '').slice(0, 250) || undefined,
    preferred_locales: [CHECKOUT_LOCALES.includes(lang) ? lang : 'es'],
    metadata: { restaurant_id: String(restaurant.id) }
  }, { idempotencyKey: `fichame-customer-${restaurant.id}` });
  return store.saveCustomerId(restaurant.id, customer.id);
}

/* ------------------------------------------------------------------ *
 * Webhook: assinatura → plano do negócio
 * ------------------------------------------------------------------ */
const idOf = (v) => (v && typeof v === 'object' ? v.id : v) || null;

/* Fotografia normalizada de uma assinatura da Stripe. Desde a API
 * 2025-03-31 o fim do período está nos itens, não na assinatura. */
function subscriptionState(sub) {
  const item = sub && sub.items && sub.items.data && sub.items.data[0];
  const price = item && item.price;
  const meta = (sub && sub.metadata) || {};
  const fromMeta = ['founders', 'pro'].includes(meta.plan)
    ? { plan: meta.plan, interval: meta.interval === 'year' ? 'year' : 'month' }
    : null;
  const mapped = planFromLookupKey(price && price.lookup_key) || fromMeta;
  const recInterval = price && price.recurring && price.recurring.interval;
  const interval = ['month', 'year'].includes(recInterval) ? recInterval : (mapped ? mapped.interval : null);
  const periodEnd = (item && item.current_period_end) || (sub && sub.current_period_end) || null;
  return {
    subscriptionId: sub.id,
    customerId: idOf(sub.customer),
    status: String(sub.status || ''),
    plan: mapped ? mapped.plan : null,
    interval,
    currentPeriodEnd: periodEnd ? new Date(periodEnd * 1000).toISOString() : null,
    restaurantId: /^\d{1,18}$/.test(String(meta.restaurant_id || '')) ? String(meta.restaurant_id) : null
  };
}

/* O que fazer ao negócio com esta assinatura. Puro (sem rede):
 *   { action: 'ignore', reason }
 *   { action: 'update', fields }   escrita direta em restaurants
 *   { action: 'claim',  fields }   Fundadores: vaga atómica (claim_founders_seat)
 */
function planChange(state, restaurant, now = new Date()) {
  /* Uma assinatura antiga a terminar não substitui uma nova em vigor. */
  if (restaurant.stripe_subscription_id && restaurant.stripe_subscription_id !== state.subscriptionId &&
      isLive(restaurant.subscription_status) && !isLive(state.status)) {
    return { action: 'ignore', reason: 'superseded' };
  }

  const base = {
    stripe_customer_id: state.customerId,
    stripe_subscription_id: state.subscriptionId,
    subscription_status: state.status.slice(0, 40),
    billing_interval: state.interval,
    current_period_end: state.currentPeriodEnd
  };

  if (ENDED_STATUSES.includes(state.status)) {
    return {
      action: 'update',
      fields: {
        ...base,
        plan: 'trial',
        billing_interval: null,
        current_period_end: null,
        plan_started_at: null,
        founders_price_locked_until: null
      }
    };
  }

  /* incomplete, unpaid, paused: guarda o estado; o plano não muda (o painel
   * mostra o aviso, o uso continua). */
  if (!isLive(state.status)) return { action: 'update', fields: base };

  if (!state.plan) return { action: 'ignore', reason: 'unknown_price' };
  if (state.plan === 'founders') return { action: 'claim', fields: base };

  const keepStart = restaurant.plan === 'pro' && restaurant.plan_started_at;
  return {
    action: 'update',
    fields: {
      ...base,
      plan: 'pro',
      plan_started_at: keepStart ? restaurant.plan_started_at : now.toISOString(),
      founders_price_locked_until: null
    }
  };
}

async function syncSubscription(subscriptionId, { stripe, store, hintRestaurantId = null, now = new Date() }) {
  const sub = await stripe.subscriptions.retrieve(subscriptionId);
  const state = subscriptionState(sub);

  const rid = state.restaurantId || (/^\d{1,18}$/.test(String(hintRestaurantId || '')) ? String(hintRestaurantId) : null);
  let restaurant = rid ? await store.getRestaurant(Number(rid)) : null;
  if (!restaurant && state.customerId) restaurant = await store.restaurantByCustomer(state.customerId);
  if (!restaurant) return 'ignored_unknown_restaurant';

  /* O cliente da assinatura tem de ser o do negócio. Sem cliente guardado,
   * não pode pertencer a outro negócio. */
  let mismatch = Boolean(restaurant.stripe_customer_id && state.customerId &&
    restaurant.stripe_customer_id !== state.customerId);
  if (!mismatch && !restaurant.stripe_customer_id && state.customerId) {
    const owner = await store.restaurantByCustomer(state.customerId);
    mismatch = Boolean(owner && Number(owner.id) !== Number(restaurant.id));
  }
  if (mismatch) {
    await store.alert('customer_mismatch', restaurant.id,
      `Stripe: a assinatura ${state.subscriptionId} é do cliente ${state.customerId}, que não é o do negócio ${restaurant.id}. Ignorada.`);
    return 'ignored_customer_mismatch';
  }

  const change = planChange(state, restaurant, now);
  if (change.action === 'ignore') return `ignored_${change.reason}`;

  if (change.action === 'claim') {
    const r = await store.claimFoundersSeat(restaurant.id, change.fields);
    if (r && r.ok) return r.already ? 'founders_synced' : 'founders_claimed';
    if (r && r.reason === 'full') {
      /* Sem vaga entre o Checkout e o webhook: a assinatura fica (a Stripe
       * já cobrou ou vai cobrar), ligada ao negócio, e o admin decide
       * (reembolso, mudar para Profesional ou abrir uma vaga). */
      await store.updateRestaurant(restaurant.id, change.fields);
      await store.alert('founders_full', restaurant.id,
        `Stripe: o negócio ${restaurant.id} pagou o plano Fundadores (assinatura ${state.subscriptionId}) mas já não havia vagas (${r.taken}/${pricing.PLANS.founders.maxCustomers}). Resolver à mão.`);
      return 'founders_full';
    }
    throw new Error(`claim_founders_seat recusou: ${(r && r.reason) || 'sem resposta'}`);
  }

  await store.updateRestaurant(restaurant.id, change.fields);
  return 'subscription_synced';
}

/* Trata um evento já verificado. Devolve uma etiqueta curta para o log. */
async function handleEvent(event, { stripe, store, now = new Date() }) {
  const obj = (event.data && event.data.object) || {};
  switch (event.type) {
    case 'checkout.session.completed': {
      if (obj.mode !== 'subscription' || !obj.subscription) return 'ignored_not_subscription';
      return syncSubscription(idOf(obj.subscription), {
        stripe, store, now,
        hintRestaurantId: (obj.metadata && obj.metadata.restaurant_id) || obj.client_reference_id
      });
    }
    case 'customer.subscription.created':
    case 'customer.subscription.updated':
    case 'customer.subscription.deleted':
      return syncSubscription(obj.id, { stripe, store, now });
    case 'invoice.paid':
    case 'invoice.payment_failed': {
      /* Desde a API 2025-03-31 a assinatura da fatura está em
       * parent.subscription_details; antes estava em invoice.subscription. */
      const details = obj.parent && obj.parent.subscription_details;
      const subId = idOf(details && details.subscription) || idOf(obj.subscription);
      if (!subId) return 'ignored_no_subscription';
      const outcome = await syncSubscription(subId, { stripe, store, now });
      if (event.type === 'invoice.payment_failed') {
        const meta = (details && details.metadata) || {};
        store.notice('stripe_pago_fallido', `sub=${subId} invoice=${obj.id}`, meta.restaurant_id);
      }
      return outcome;
    }
    default:
      return 'ignored';
  }
}

/* Idempotência: o evento é reservado em stripe_events ANTES de ser tratado
 * (duas entregas simultâneas não o tratam duas vezes). Se falhar, a reserva
 * é desfeita e o webhook responde 500, para a Stripe tentar de novo. */
async function processEvent(event, deps) {
  const fresh = await deps.store.claimEvent(event.id, event.type);
  if (!fresh) return 'duplicate';
  try {
    return await handleEvent(event, deps);
  } catch (err) {
    await deps.store.releaseEvent(event.id).catch(() => {});
    throw err;
  }
}

/* ------------------------------------------------------------------ *
 * Persistência (Supabase, service_role)
 * ------------------------------------------------------------------ */
const RESTAURANT_BILLING_COLUMNS =
  'id, name, legal_name, email, created_at, plan, billing_interval, stripe_customer_id, stripe_subscription_id, ' +
  'subscription_status, current_period_end, plan_started_at, founders_price_locked_until';

function supabaseStore() {
  const { sb, one, run, count, rpc, logSecurity } = require('../db');
  const { newRef, recordError } = require('./errors');
  const webhookReq = { method: 'POST', path: '/webhooks/stripe', headers: {} };

  return {
    async claimEvent(id, type) {
      const { error } = await sb().from('stripe_events').insert({
        id: String(id).slice(0, 255), type: String(type || '').slice(0, 120)
      });
      if (!error) return true;
      if (error.code === '23505') return false;
      throw new Error(`Supabase: stripe_events — ${error.message}`);
    },
    async releaseEvent(id) {
      await run(sb().from('stripe_events').delete().eq('id', String(id)), 'libertar evento Stripe');
    },
    getRestaurant(id) {
      return one(sb().from('restaurants').select(RESTAURANT_BILLING_COLUMNS).eq('id', id), 'negócio (Stripe)');
    },
    restaurantByCustomer(customerId) {
      return one(sb().from('restaurants').select(RESTAURANT_BILLING_COLUMNS).eq('stripe_customer_id', customerId), 'negócio por cliente Stripe');
    },
    async updateRestaurant(id, fields) {
      await run(sb().from('restaurants').update(fields).eq('id', id), 'estado da assinatura');
    },
    claimFoundersSeat(id, fields) {
      return rpc('claim_founders_seat', {
        restaurant_id: id,
        max_customers: pricing.PLANS.founders.maxCustomers,
        lock_months: pricing.PLANS.founders.lockMonths,
        ...fields
      }, 'vaga Fundadores');
    },
    foundersSeatsTaken() {
      return count(
        sb().from('restaurants').select('id', { count: 'exact', head: true })
          .eq('plan', 'founders').in('subscription_status', LIVE_STATUSES),
        'vagas Fundadores ocupadas'
      );
    },
    /* Só grava se ainda não houver cliente: dois pedidos em paralelo ficam
     * com o mesmo (o primeiro). */
    async saveCustomerId(id, customerId) {
      await run(sb().from('restaurants').update({ stripe_customer_id: customerId })
        .eq('id', id).is('stripe_customer_id', null), 'cliente Stripe');
      const r = await one(sb().from('restaurants').select('stripe_customer_id').eq('id', id), 'cliente Stripe');
      return (r && r.stripe_customer_id) || customerId;
    },
    /* Visível ao admin: error_events (/admin/reportes) + security_logs. */
    async alert(kind, restaurantId, message) {
      const ref = newRef();
      console.error(`[stripe] ${kind} (ref ${ref}): ${message}`);
      logSecurity(`stripe_${kind}`, `ref=${ref} rid=${restaurantId || ''}`, '', { restaurantId: restaurantId || null });
      await recordError(new Error(message), webhookReq, ref);
    },
    notice(event, detail, restaurantId) {
      logSecurity(event, detail, '', { restaurantId: /^\d+$/.test(String(restaurantId || '')) ? Number(restaurantId) : null });
    }
  };
}

function defaultStore() {
  return storeOverride || supabaseStore();
}

function deps() {
  return { stripe: getStripe(), store: defaultStore() };
}

module.exports = {
  LIVE_STATUSES,
  ENDED_STATUSES,
  WEBHOOK_EVENTS,
  CHECKOUT_OK,
  BillingConfigError,
  isLive,
  getStripe,
  setStripeClient,
  setStore,
  defaultStore,
  deps,
  toCents,
  planAmount,
  lookupKey,
  priceSpecs,
  planFromLookupKey,
  assertPriceMatches,
  resolvePrice,
  checkoutTrialEnd,
  checkoutSessionParams,
  ensureCustomer,
  subscriptionState,
  planChange,
  syncSubscription,
  handleEvent,
  processEvent,
  supabaseStore
};

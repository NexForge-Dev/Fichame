'use strict';

/* Cobrança com Stripe — sem BD e sem rede. Executar: npm run test:unit
 *
 * Cliente Stripe simulado e loja em memória (src/lib/billing.js aceita os
 * dois por injeção). A assinatura do webhook usa o verificador real do SDK
 * com um segredo de teste local: nada sai para a API da Stripe.
 */

const test = require('node:test');
const assert = require('node:assert/strict');

process.env.SUPABASE_URL = process.env.SUPABASE_URL || 'http://127.0.0.1:54321';
process.env.SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || 'chave-de-teste-unitario';
/* Valores falsos, só para ligar billingEnabled. Nunca chegam à Stripe. */
process.env.STRIPE_SECRET_KEY = 'sk_test_unit_nao_e_real';
process.env.STRIPE_WEBHOOK_SECRET = 'whsec_unit_nao_e_real';
delete process.env.STRIPE_AUTOMATIC_TAX;
delete process.env.STRIPE_TAX_RATE_ID;
delete process.env.VERCEL_ENV;

const Stripe = require('stripe');
const billing = require('../src/lib/billing');
const pricing = require('../src/lib/pricing');
const { createApp } = require('../src/app');

const DAY = 24 * 60 * 60 * 1000;
const realStripe = new Stripe(process.env.STRIPE_SECRET_KEY);

/* ------------------------------------------------------------------ *
 * Simulações
 * ------------------------------------------------------------------ */
function memStore(restaurants = [], { maxFounders = pricing.PLANS.founders.maxCustomers } = {}) {
  const rows = new Map(restaurants.map((r) => [r.id, { plan: 'trial', ...r }]));
  const events = new Set();
  const calls = { alerts: [], notices: [], updates: [], claims: [] };
  const liveFounders = (exceptId) => [...rows.values()]
    .filter((r) => r.id !== exceptId && r.plan === 'founders' && billing.isLive(r.subscription_status)).length;
  return {
    rows, calls, events,
    async claimEvent(id) { if (events.has(id)) return false; events.add(id); return true; },
    async releaseEvent(id) { events.delete(id); },
    async getRestaurant(id) { return rows.get(Number(id)) || null; },
    async restaurantByCustomer(c) { return [...rows.values()].find((r) => r.stripe_customer_id === c) || null; },
    async updateRestaurant(id, fields) { calls.updates.push({ id, fields }); Object.assign(rows.get(id), fields); },
    async claimFoundersSeat(id, fields) {
      calls.claims.push({ id, fields });
      const r = rows.get(id);
      if (r.plan === 'founders' && billing.isLive(r.subscription_status)) { Object.assign(r, fields); return { ok: true, already: true }; }
      const taken = liveFounders(id);
      if (taken >= maxFounders) return { ok: false, reason: 'full', taken };
      Object.assign(r, fields, { plan: 'founders', plan_started_at: 'agora', founders_price_locked_until: 'agora+12m' });
      return { ok: true, already: false, taken: taken + 1 };
    },
    async foundersSeatsTaken() { return liveFounders(null); },
    async saveCustomerId(id, c) { const r = rows.get(id); r.stripe_customer_id = r.stripe_customer_id || c; return r.stripe_customer_id; },
    async alert(kind, restaurantId, message) { calls.alerts.push({ kind, restaurantId, message }); },
    notice(event, detail, restaurantId) { calls.notices.push({ event, detail, restaurantId }); }
  };
}

function priceObj(plan, interval, overrides = {}) {
  const spec = billing.priceSpecs().find((s) => s.plan === plan && s.interval === interval);
  return {
    id: `price_${plan}_${interval}`,
    lookup_key: spec.lookupKey,
    unit_amount: spec.unitAmount,
    currency: 'eur',
    active: true,
    tax_behavior: 'exclusive',
    recurring: { interval, interval_count: 1 },
    ...overrides
  };
}

function sub({ id = 'sub_1', customer = 'cus_1', status = 'active', plan = 'pro', interval = 'month', rid = '1', periodEnd = 1893456000 } = {}) {
  return {
    id,
    customer,
    status,
    metadata: rid ? { restaurant_id: rid, plan, interval } : {},
    items: { data: [{ current_period_end: periodEnd, price: priceObj(plan, interval) }] }
  };
}

function mockStripe(subs = {}) {
  const calls = { retrieve: [], list: [] };
  return {
    calls,
    webhooks: realStripe.webhooks,
    subscriptions: {
      async retrieve(id) {
        calls.retrieve.push(id);
        if (!subs[id]) throw Object.assign(new Error('No such subscription'), { type: 'StripeInvalidRequestError' });
        return subs[id];
      }
    },
    prices: {
      async list(params) {
        calls.list.push(params);
        const spec = billing.priceSpecs().find((s) => s.lookupKey === params.lookup_keys[0]);
        return { data: spec ? [priceObj(spec.plan, spec.interval, subs.priceOverride || {})] : [] };
      }
    }
  };
}

const evt = (type, object, id = `evt_${Math.random().toString(16).slice(2)}`) => ({ id, type, data: { object } });

/* ------------------------------------------------------------------ *
 * lookup_key derivada de pricing.js
 * ------------------------------------------------------------------ */
test('lookup_key: derivada do plano, periodicidade e valor em cêntimos', () => {
  assert.equal(billing.lookupKey('founders', 'month'), 'fichame_founders_monthly_990');
  assert.equal(billing.lookupKey('pro', 'month'), 'fichame_pro_monthly_1490');
  assert.equal(billing.lookupKey('pro', 'year'), 'fichame_pro_yearly_14900');
  assert.equal(billing.lookupKey('founders', 'year'), null, 'Fundadores não tem anual');
  assert.equal(billing.lookupKey('advanced', 'month'), null, 'o avançado nunca se vende');
  assert.equal(billing.lookupKey('trial', 'month'), null);
  assert.equal(billing.lookupKey('pro', 'week'), null);
  const specs = billing.priceSpecs();
  assert.deepEqual(specs.map((s) => s.lookupKey).sort(),
    ['fichame_founders_monthly_990', 'fichame_pro_monthly_1490', 'fichame_pro_yearly_14900']);
  for (const s of specs) {
    assert.equal(s.currency, 'eur');
    assert.equal(s.unitAmount, Math.round(s.amount * 100));
  }
  /* 14.9 * 100 = 1490.0000000000002 em vírgula flutuante. */
  assert.equal(billing.toCents(14.9), 1490);
  assert.equal(billing.toCents(9.9), 990);
});

test('lookup_key: leitura inversa, incluindo valores antigos', () => {
  assert.deepEqual(billing.planFromLookupKey('fichame_pro_yearly_14900'), { plan: 'pro', interval: 'year', unitAmount: 14900 });
  assert.deepEqual(billing.planFromLookupKey('fichame_founders_monthly_790'), { plan: 'founders', interval: 'month', unitAmount: 790 });
  assert.equal(billing.planFromLookupKey('fichame_advanced_monthly_2990'), null);
  assert.equal(billing.planFromLookupKey('cvmatch_pro'), null);
  assert.equal(billing.planFromLookupKey(null), null);
});

/* ------------------------------------------------------------------ *
 * Guarda do preço
 * ------------------------------------------------------------------ */
test('preço: só passa se valor, moeda, periodicidade e IVA baterem com pricing.js', () => {
  const spec = billing.priceSpecs().find((s) => s.lookupKey === 'fichame_pro_monthly_1490');
  assert.ok(billing.assertPriceMatches(priceObj('pro', 'month'), spec));
  const bad = [
    { unit_amount: 1990 },
    { currency: 'usd' },
    { recurring: { interval: 'year', interval_count: 1 } },
    { recurring: { interval: 'month', interval_count: 3 } },
    { active: false },
    { tax_behavior: 'inclusive' }
  ];
  for (const b of bad) {
    assert.throws(() => billing.assertPriceMatches(priceObj('pro', 'month', b), spec),
      (err) => err instanceof billing.BillingConfigError && err.code === 'price_mismatch' && /stripe:setup/.test(err.message),
      JSON.stringify(b));
  }
  assert.throws(() => billing.assertPriceMatches(undefined, spec), billing.BillingConfigError);
});

test('preço: resolvido por lookup_key, com cache, e recusado se não bater', async () => {
  const stripe = mockStripe();
  const p1 = await billing.resolvePrice('pro', 'year', { stripe, now: 1000 });
  assert.equal(p1.unit_amount, 14900);
  assert.deepEqual(stripe.calls.list[0], { lookup_keys: ['fichame_pro_yearly_14900'], active: true, limit: 1 });
  await billing.resolvePrice('pro', 'year', { stripe, now: 2000 });
  assert.equal(stripe.calls.list.length, 1, 'segunda chamada vem da cache');

  const wrong = mockStripe({ priceOverride: { unit_amount: 100 } });
  await assert.rejects(billing.resolvePrice('founders', 'month', { stripe: wrong }), billing.BillingConfigError);
  await assert.rejects(billing.resolvePrice('advanced', 'month', { stripe: wrong }), billing.BillingConfigError);
});

/* ------------------------------------------------------------------ *
 * trial_end: só com a prova ativa e pelo menos 48 h no futuro
 * ------------------------------------------------------------------ */
test('trial_end: fim da prova se faltar ≥ 48 h, senão cobra-se já', () => {
  const now = new Date('2026-11-02T12:00:00Z');
  const created = new Date(now.getTime() - 10 * DAY);
  assert.equal(billing.checkoutTrialEnd(created, now), Math.floor((created.getTime() + 30 * DAY) / 1000));

  const at49h = new Date(now.getTime() - 30 * DAY + 49 * 60 * 60 * 1000);
  assert.ok(billing.checkoutTrialEnd(at49h, now), '49 h → trial_end');
  const at48h = new Date(now.getTime() - 30 * DAY + 48 * 60 * 60 * 1000);
  assert.ok(billing.checkoutTrialEnd(at48h, now), 'exatamente 48 h → trial_end');
  const at47h = new Date(now.getTime() - 30 * DAY + 47 * 60 * 60 * 1000);
  assert.equal(billing.checkoutTrialEnd(at47h, now), null, '47 h → cobra já');
  assert.equal(billing.checkoutTrialEnd(new Date(now.getTime() - 40 * DAY), now), null, 'prova terminada');
  assert.equal(billing.checkoutTrialEnd(null, now), null);
});

test('Checkout: parâmetros (assinatura, morada, NIF, IVA, metadados, idioma, trial_end)', () => {
  const now = new Date('2026-11-02T12:00:00Z');
  const restaurant = { id: 42, created_at: new Date(now.getTime() - 5 * DAY).toISOString() };
  const base = { restaurant, plan: 'pro', interval: 'year', priceId: 'price_x', customerId: 'cus_9', appUrl: 'https://f.test', now };

  const p = billing.checkoutSessionParams({ ...base, lang: 'pt', tax: { automaticTax: true, taxRateId: 'txr_ignorada' } });
  assert.equal(p.mode, 'subscription');
  assert.equal(p.customer, 'cus_9');
  assert.equal(p.client_reference_id, '42');
  assert.deepEqual(p.line_items, [{ price: 'price_x', quantity: 1 }]);
  assert.equal(p.billing_address_collection, 'required');
  assert.deepEqual(p.tax_id_collection, { enabled: true });
  assert.deepEqual(p.customer_update, { address: 'auto', name: 'auto' });
  assert.deepEqual(p.automatic_tax, { enabled: true });
  assert.equal(p.subscription_data.default_tax_rates, undefined);
  assert.equal(p.locale, 'pt');
  assert.deepEqual(p.metadata, { restaurant_id: '42', plan: 'pro', interval: 'year' });
  assert.deepEqual(p.subscription_data.metadata, p.metadata);
  assert.equal(p.subscription_data.trial_end, Math.floor((Date.parse(restaurant.created_at) + 30 * DAY) / 1000));
  assert.match(p.success_url, /^https:\/\/f\.test\/panel\/plan\?ok=/);
  assert.equal(p.cancel_url, 'https://f.test/panel/plan');

  const fixed = billing.checkoutSessionParams({ ...base, lang: 'fr', tax: { automaticTax: false, taxRateId: 'txr_21' } });
  assert.equal(fixed.automatic_tax, undefined);
  assert.deepEqual(fixed.subscription_data.default_tax_rates, ['txr_21']);
  assert.equal(fixed.locale, 'es');

  const late = billing.checkoutSessionParams({
    ...base, restaurant: { id: 42, created_at: new Date(now.getTime() - 29.5 * DAY).toISOString() }, tax: {}
  });
  assert.equal(late.subscription_data.trial_end, undefined, 'menos de 48 h: sem trial_end');
  assert.equal(late.automatic_tax, undefined);
  assert.equal(late.subscription_data.default_tax_rates, undefined);
});

/* ------------------------------------------------------------------ *
 * Webhook: evento → plano
 * ------------------------------------------------------------------ */
test('planChange: pro, Fundadores, cancelada, impago, preço desconhecido, assinatura substituída', () => {
  const now = new Date('2026-11-02T12:00:00Z');
  const r = { id: 1, plan: 'trial' };
  const pro = billing.planChange(billing.subscriptionState(sub({ plan: 'pro', interval: 'year' })), r, now);
  assert.equal(pro.action, 'update');
  assert.equal(pro.fields.plan, 'pro');
  assert.equal(pro.fields.billing_interval, 'year');
  assert.equal(pro.fields.subscription_status, 'active');
  assert.equal(pro.fields.plan_started_at, now.toISOString());
  assert.equal(pro.fields.current_period_end, new Date(1893456000 * 1000).toISOString());

  const keep = billing.planChange(billing.subscriptionState(sub()), { id: 1, plan: 'pro', plan_started_at: '2026-01-01T00:00:00Z' }, now);
  assert.equal(keep.fields.plan_started_at, '2026-01-01T00:00:00Z', 'renovação não muda a data de início');

  const f = billing.planChange(billing.subscriptionState(sub({ plan: 'founders', status: 'trialing' })), r, now);
  assert.equal(f.action, 'claim');
  assert.equal(f.fields.subscription_status, 'trialing');

  const ended = billing.planChange(billing.subscriptionState(sub({ status: 'canceled' })), { id: 1, plan: 'pro', stripe_subscription_id: 'sub_1', subscription_status: 'active' }, now);
  assert.equal(ended.action, 'update');
  assert.equal(ended.fields.plan, 'trial');
  assert.equal(ended.fields.subscription_status, 'canceled');
  assert.equal(ended.fields.founders_price_locked_until, null);

  const unpaid = billing.planChange(billing.subscriptionState(sub({ status: 'unpaid' })), { id: 1, plan: 'pro' }, now);
  assert.equal(unpaid.action, 'update');
  assert.equal(unpaid.fields.plan, undefined, 'impago não mexe no plano (nunca bloqueia)');

  const unknown = billing.subscriptionState({ id: 'sub_x', customer: 'cus_1', status: 'active', metadata: {}, items: { data: [{ price: { lookup_key: 'outra' } }] } });
  assert.deepEqual(billing.planChange(unknown, r, now), { action: 'ignore', reason: 'unknown_price' });

  const old = billing.planChange(billing.subscriptionState(sub({ id: 'sub_old', status: 'canceled' })),
    { id: 1, plan: 'pro', stripe_subscription_id: 'sub_new', subscription_status: 'active' }, now);
  assert.deepEqual(old, { action: 'ignore', reason: 'superseded' });
});

test('webhook: checkout.session.completed (pro) relê a assinatura e atualiza o negócio', async () => {
  const store = memStore([{ id: 1, stripe_customer_id: 'cus_1' }]);
  const stripe = mockStripe({ sub_1: sub({ plan: 'pro', interval: 'month' }) });
  const out = await billing.processEvent(evt('checkout.session.completed', {
    mode: 'subscription', subscription: 'sub_1', customer: 'cus_1', client_reference_id: '1', metadata: { restaurant_id: '1' }
  }), { stripe, store });
  assert.equal(out, 'subscription_synced');
  assert.deepEqual(stripe.calls.retrieve, ['sub_1']);
  const r = store.rows.get(1);
  assert.equal(r.plan, 'pro');
  assert.equal(r.billing_interval, 'month');
  assert.equal(r.stripe_subscription_id, 'sub_1');
});

test('webhook: Fundadores ocupa vaga; sem vaga mantém a assinatura e avisa o admin', async () => {
  const store = memStore([
    { id: 1, stripe_customer_id: 'cus_1' },
    { id: 2, stripe_customer_id: 'cus_2' },
    { id: 3, stripe_customer_id: 'cus_3' }
  ], { maxFounders: 2 });
  const stripe = mockStripe({
    s1: sub({ id: 's1', customer: 'cus_1', rid: '1', plan: 'founders' }),
    s2: sub({ id: 's2', customer: 'cus_2', rid: '2', plan: 'founders' }),
    s3: sub({ id: 's3', customer: 'cus_3', rid: '3', plan: 'founders' })
  });
  const deps = { stripe, store };
  assert.equal(await billing.processEvent(evt('customer.subscription.created', { id: 's1' }), deps), 'founders_claimed');
  assert.equal(await billing.processEvent(evt('customer.subscription.created', { id: 's2' }), deps), 'founders_claimed');
  assert.equal(await billing.processEvent(evt('customer.subscription.updated', { id: 's1' }), deps), 'founders_synced');
  assert.equal(await billing.processEvent(evt('customer.subscription.created', { id: 's3' }), deps), 'founders_full');
  const r3 = store.rows.get(3);
  assert.equal(r3.plan, 'trial', 'sem vaga não fica Fundador');
  assert.equal(r3.stripe_subscription_id, 's3', 'mas a assinatura fica ligada ao negócio');
  assert.equal(store.calls.alerts.length, 1);
  assert.equal(store.calls.alerts[0].kind, 'founders_full');
  assert.equal(store.calls.alerts[0].restaurantId, 3);
});

test('webhook: cancelada volta a trial; cliente diferente é ignorado; fatura falhada', async () => {
  const store = memStore([
    { id: 1, plan: 'pro', stripe_customer_id: 'cus_1', stripe_subscription_id: 'sub_1', subscription_status: 'active' },
    { id: 2, stripe_customer_id: 'cus_2' }
  ]);
  const stripe = mockStripe({
    sub_1: sub({ status: 'canceled' }),
    sub_x: sub({ id: 'sub_x', customer: 'cus_intruso', rid: '2' }),
    sub_pd: sub({ id: 'sub_pd', customer: 'cus_2', rid: '2', status: 'past_due' })
  });
  const deps = { stripe, store };
  assert.equal(await billing.processEvent(evt('customer.subscription.deleted', { id: 'sub_1' }), deps), 'subscription_synced');
  assert.equal(store.rows.get(1).plan, 'trial');
  assert.equal(store.rows.get(1).subscription_status, 'canceled');

  assert.equal(await billing.processEvent(evt('customer.subscription.updated', { id: 'sub_x' }), deps), 'ignored_customer_mismatch');
  assert.equal(store.rows.get(2).stripe_subscription_id, undefined);
  assert.equal(store.calls.alerts[0].kind, 'customer_mismatch');

  /* API 2025+: a assinatura da fatura vem em parent.subscription_details. */
  const out = await billing.processEvent(evt('invoice.payment_failed', {
    id: 'in_1', parent: { subscription_details: { subscription: 'sub_pd', metadata: { restaurant_id: '2' } } }
  }), deps);
  assert.equal(out, 'subscription_synced');
  assert.equal(store.rows.get(2).subscription_status, 'past_due');
  assert.equal(store.calls.notices[0].event, 'stripe_pago_fallido');
  assert.equal(await billing.processEvent(evt('invoice.paid', { id: 'in_2' }), deps), 'ignored_no_subscription');
  assert.equal(await billing.processEvent(evt('customer.created', {}), deps), 'ignored');
});

test('webhook: idempotente (evento repetido não volta a correr) e liberta o evento se falhar', async () => {
  const store = memStore([{ id: 1, stripe_customer_id: 'cus_1' }]);
  const stripe = mockStripe({ sub_1: sub() });
  const e = evt('customer.subscription.updated', { id: 'sub_1' }, 'evt_fixo');
  assert.equal(await billing.processEvent(e, { stripe, store }), 'subscription_synced');
  assert.equal(await billing.processEvent(e, { stripe, store }), 'duplicate');
  assert.equal(stripe.calls.retrieve.length, 1);

  const failing = evt('customer.subscription.updated', { id: 'nao_existe' }, 'evt_falha');
  await assert.rejects(billing.processEvent(failing, { stripe, store }));
  assert.equal(store.events.has('evt_falha'), false, 'a Stripe pode reenviar');
});

/* ------------------------------------------------------------------ *
 * HTTP: POST /webhooks/stripe
 * ------------------------------------------------------------------ */
let server;
let base;
let httpStore;
let httpStripe;

test.before(async () => {
  httpStore = memStore([{ id: 7, stripe_customer_id: 'cus_7' }]);
  httpStripe = mockStripe({ sub_7: sub({ id: 'sub_7', customer: 'cus_7', rid: '7' }) });
  billing.setStore(httpStore);
  billing.setStripeClient(httpStripe);
  server = createApp().listen(0, '127.0.0.1');
  await new Promise((resolve) => server.once('listening', resolve));
  base = `http://127.0.0.1:${server.address().port}`;
});

test.after(() => server.close());

const postWebhook = (body, headers = {}) => fetch(`${base}/webhooks/stripe`, {
  method: 'POST',
  headers: { 'content-type': 'application/json', ...headers },
  body,
  redirect: 'manual'
});

test('webhook HTTP: sem assinatura ou com assinatura errada → 400 (e nunca 403 do CSRF)', async () => {
  const payload = JSON.stringify(evt('customer.subscription.updated', { id: 'sub_7' }, 'evt_http_bad'));
  assert.equal((await postWebhook(payload)).status, 400);
  const wrong = realStripe.webhooks.generateTestHeaderString({ payload, secret: 'whsec_outro_segredo' });
  const res = await postWebhook(payload, { 'stripe-signature': wrong });
  assert.equal(res.status, 400);
  assert.deepEqual(await res.json(), { error: 'invalid_signature' });
  assert.equal(httpStore.events.has('evt_http_bad'), false);
  /* Corpo alterado depois de assinado. */
  const sig = realStripe.webhooks.generateTestHeaderString({ payload, secret: process.env.STRIPE_WEBHOOK_SECRET });
  assert.equal((await postWebhook(payload.replace('sub_7', 'sub_8'), { 'stripe-signature': sig })).status, 400);
});

test('webhook HTTP: assinatura válida → 200, trata o evento uma vez', async () => {
  const payload = JSON.stringify(evt('customer.subscription.updated', { id: 'sub_7' }, 'evt_http_ok'));
  const header = realStripe.webhooks.generateTestHeaderString({ payload, secret: process.env.STRIPE_WEBHOOK_SECRET });
  const res = await postWebhook(payload, { 'stripe-signature': header });
  assert.equal(res.status, 200);
  assert.deepEqual(await res.json(), { received: true });
  assert.equal(res.headers.get('set-cookie'), null, 'sem sessão');
  assert.equal(httpStore.rows.get(7).plan, 'pro');
  assert.equal((await postWebhook(payload, { 'stripe-signature': header })).status, 200);
  assert.equal(httpStripe.calls.retrieve.filter((id) => id === 'sub_7').length, 1, 'repetido não volta a tratar');
});

test('webhook HTTP: falha ao tratar → 500 para a Stripe reenviar', async () => {
  const payload = JSON.stringify(evt('customer.subscription.updated', { id: 'sub_inexistente' }, 'evt_http_500'));
  const header = realStripe.webhooks.generateTestHeaderString({ payload, secret: process.env.STRIPE_WEBHOOK_SECRET });
  const res = await postWebhook(payload, { 'stripe-signature': header });
  assert.equal(res.status, 500);
  assert.equal(httpStore.events.has('evt_http_500'), false);
});

test('CSP: form-action permite o Checkout e o portal da Stripe, sem scripts externos', async () => {
  const res = await fetch(`${base}/css/style.css`);
  const csp = res.headers.get('content-security-policy') || '';
  assert.match(csp, /form-action 'self' https:\/\/checkout\.stripe\.com https:\/\/billing\.stripe\.com/);
  assert.match(csp, /script-src 'self';/);
  assert.doesNotMatch(csp, /js\.stripe\.com/);
});

test('/panel/plan sem sessão → login (rotas de cobrança exigem dono)', async () => {
  for (const path of ['/panel/plan']) {
    const res = await fetch(base + path, { redirect: 'manual' });
    assert.equal(res.status, 302);
    assert.equal(res.headers.get('location'), '/login');
  }
});

/* ------------------------------------------------------------------ *
 * Configuração
 * ------------------------------------------------------------------ */
test('config: billingEnabled só com as duas chaves; sk_test recusada em produção salvo STRIPE_ALLOW_TEST=1', () => {
  const { execFileSync } = require('node:child_process');
  const run = (env) => {
    const out = execFileSync(process.execPath, ['-e',
      "const c=require('./src/config');c.assertConfig();console.log(JSON.stringify([c.billingEnabled,c.stripe.automaticTax,Boolean(c.stripe.secretKey)]))"], {
      cwd: require('node:path').join(__dirname, '..'),
      env: { ...process.env, STRIPE_ALLOW_TEST: '', STRIPE_AUTOMATIC_TAX: '', ...env },
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'pipe']
    });
    return JSON.parse(out.trim().split('\n').pop());
  };
  assert.deepEqual(run({ STRIPE_WEBHOOK_SECRET: '' }), [false, false, true]);
  assert.deepEqual(run({ STRIPE_SECRET_KEY: '' }), [false, false, false]);
  assert.deepEqual(run({}), [true, false, true]);
  assert.deepEqual(run({ STRIPE_AUTOMATIC_TAX: '1' }), [true, true, true]);
  const prod = { VERCEL_ENV: 'production', APP_URL: 'https://exemplo.es' };
  assert.deepEqual(run(prod), [false, false, false]);
  assert.deepEqual(run({ ...prod, STRIPE_ALLOW_TEST: '1' }), [true, false, true]);
});

test('config: nenhuma chave aparece nos avisos', () => {
  const { spawnSync } = require('node:child_process');
  const r = spawnSync(process.execPath, ['-e', "require('./src/config').assertConfig()"], {
    cwd: require('node:path').join(__dirname, '..'),
    env: { ...process.env, VERCEL_ENV: 'production', APP_URL: 'https://exemplo.es' },
    encoding: 'utf8'
  });
  const all = `${r.stdout}${r.stderr}`;
  assert.match(all, /chave de teste em produção/);
  assert.ok(!all.includes(process.env.STRIPE_SECRET_KEY) && !all.includes(process.env.STRIPE_WEBHOOK_SECRET));
});

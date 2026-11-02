'use strict';

/* `npm run stripe:setup` — cria na Stripe o produto e os preços do Fíchame.
 *
 * Idempotente: pode correr-se as vezes que for preciso. Os preços saem de
 * src/lib/pricing.js; cada um tem uma lookup_key com o valor em cêntimos
 * (fichame_pro_monthly_1490). Um preço já existente com essa chave fica como
 * está; mudar um valor em pricing.js gera uma chave nova e um preço novo.
 * Os preços antigos NÃO são arquivados: as assinaturas existentes continuam
 * com eles (arquivar à mão no painel, se for o caso).
 *
 * Os ids da Stripe são diferentes em modo de teste e em modo real: correr
 * uma vez com a chave sk_test_ e outra com a sk_live_.
 *
 * Usa só STRIPE_SECRET_KEY (do .env ou do ambiente). Não toca no Supabase e
 * nunca imprime chaves nem segredos.
 */

const config = require('../config');
const billing = require('../lib/billing');

const PRODUCT_ID = billing.PRODUCT_ID;
const PRODUCT_NAME = 'Fíchame';

async function findOrCreateProduct(stripe) {
  let product = await stripe.products.retrieve(PRODUCT_ID).catch((err) => {
    if (err && err.code === 'resource_missing') return null;
    throw err;
  });
  const fields = {
    name: PRODUCT_NAME,
    description: 'Reclutamiento por QR para negocios',
    /* SaaS / software como serviço (Stripe Tax). */
    tax_code: 'txcd_10103001',
    metadata: { app: 'fichame' }
  };
  if (!product) {
    product = await stripe.products.create({ id: PRODUCT_ID, ...fields });
    return { product, created: true };
  }
  if (!product.active || product.name !== PRODUCT_NAME) {
    product = await stripe.products.update(PRODUCT_ID, { ...fields, active: true });
  }
  return { product, created: false };
}

async function ensurePrice(stripe, spec) {
  const { data } = await stripe.prices.list({ lookup_keys: [spec.lookupKey], limit: 1 });
  const existing = data && data[0];
  if (existing) {
    /* Um preço com a chave certa mas com outro valor seria um erro grave
     * (a chave inclui o valor): parar em vez de o reutilizar. */
    billing.assertPriceMatches({ ...existing, active: true }, spec);
    if (!existing.active) await stripe.prices.update(existing.id, { active: true });
    return { price: existing, created: false };
  }
  const price = await stripe.prices.create({
    product: PRODUCT_ID,
    currency: spec.currency,
    unit_amount: spec.unitAmount,
    recurring: { interval: spec.interval, interval_count: 1 },
    tax_behavior: 'exclusive',
    lookup_key: spec.lookupKey,
    nickname: `${spec.plan === 'founders' ? 'Fundadores' : 'Profesional'} ${spec.interval === 'year' ? 'anual' : 'mensual'}`,
    metadata: { plan: spec.plan, interval: spec.interval }
  });
  return { price, created: true };
}

/* Configuração do Customer Portal só do Fíchame (a por omissão é da conta,
 * partilhada com outros produtos): cancelar no fim do período, trocar só
 * entre Profesional mensal e anual, cartão, faturas, morada e NIF.
 * Reconhecida pelos metadados app=fichame; atualizada se já existir. */
async function ensurePortalConfiguration(stripe, proPriceIds, appUrl) {
  const fields = {
    business_profile: {
      privacy_policy_url: `${appUrl}/privacidad`,
      terms_of_service_url: `${appUrl}/terminos`
    },
    default_return_url: `${appUrl}/panel/plan`,
    features: {
      customer_update: { enabled: true, allowed_updates: ['address', 'name', 'tax_id'] },
      invoice_history: { enabled: true },
      payment_method_update: { enabled: true },
      subscription_cancel: { enabled: true, mode: 'at_period_end' },
      subscription_update: {
        enabled: true,
        default_allowed_updates: ['price'],
        proration_behavior: 'create_prorations',
        products: [{ product: PRODUCT_ID, prices: proPriceIds }]
      }
    },
    metadata: { app: 'fichame' }
  };
  const { data } = await stripe.billingPortal.configurations.list({ active: true, limit: 100 });
  const existing = (data || []).find((c) => c.metadata && c.metadata.app === 'fichame');
  if (existing) {
    return { portal: await stripe.billingPortal.configurations.update(existing.id, fields), created: false };
  }
  return { portal: await stripe.billingPortal.configurations.create(fields), created: true };
}

async function main() {
  console.log('');
  console.log('  Fíchame — preços na Stripe');
  console.log('  --------------------------');

  const key = String(process.env.STRIPE_SECRET_KEY || '').trim();
  if (!key) {
    console.error('  ✗ Falta STRIPE_SECRET_KEY (no .env ou no ambiente).\n');
    process.exit(1);
  }
  const live = key.startsWith('sk_live_') || key.startsWith('rk_live_');
  console.log(`  Modo: ${live ? 'REAL (live)' : 'teste'}`);

  const Stripe = require('stripe');
  const stripe = new Stripe(key, { appInfo: { name: 'Fíchame setup' }, maxNetworkRetries: 2 });

  let account;
  try {
    account = await stripe.accounts.retrieve();
  } catch (err) {
    console.error(`  ✗ A Stripe recusou a chave: ${err && err.message}\n`);
    process.exit(1);
  }
  console.log(`  Conta: país ${account.country || '?'}, moeda por omissão ${String(account.default_currency || '?').toUpperCase()}`);
  if (account.country !== 'ES') {
    console.warn(`  ! A conta Stripe não é de Espanha (${account.country || '?'}). Confirma o país da conta antes de cobrar IVA espanhol.`);
  }

  const { created } = await findOrCreateProduct(stripe);
  console.log(`  ✓ produto «${PRODUCT_NAME}» (${PRODUCT_ID})${created ? ' criado' : ''}`);

  const proPrices = [];
  for (const spec of billing.priceSpecs()) {
    try {
      const { price, created: isNew } = await ensurePrice(stripe, spec);
      if (spec.plan === 'pro') proPrices.push(price.id);
      const every = spec.interval === 'year' ? 'ano' : 'mês';
      console.log(`  ✓ ${spec.lookupKey}: ${(spec.unitAmount / 100).toFixed(2)} ${spec.currency.toUpperCase()}/${every} + IVA → ${price.id}${isNew ? ' (novo)' : ''}`);
    } catch (err) {
      console.error(`  ✗ ${spec.lookupKey}: ${err.message}`);
      process.exitCode = 1;
    }
  }

  const appUrl = config.appUrl;
  if (proPrices.length === 2) {
    try {
      const { portal, created: portalNew } = await ensurePortalConfiguration(stripe, proPrices, appUrl);
      console.log(`  ✓ portal de cliente do Fíchame → ${portal.id}${portalNew ? ' (novo)' : ''}`);
      console.log(`    Define STRIPE_PORTAL_CONFIGURATION_ID=${portal.id} na Vercel.`);
    } catch (err) {
      console.error(`  ✗ portal de cliente: ${err.message}`);
      process.exitCode = 1;
    }
  }
  console.log('');
  console.log('  Falta fazer no painel da Stripe (Developers → Webhooks → Add endpoint):');
  console.log(`    URL: ${appUrl}/webhooks/stripe`);
  console.log('    Eventos:');
  for (const e of billing.WEBHOOK_EVENTS) console.log(`      - ${e}`);
  console.log('    Copia o «Signing secret» (whsec_…) para STRIPE_WEBHOOK_SECRET na Vercel.');
  console.log('');
  if (config.stripe.automaticTax) {
    console.log('  STRIPE_AUTOMATIC_TAX=1: regista o IVA espanhol em Stripe Tax (Settings → Tax → Registrations).');
  } else if (!config.stripe.taxRateId) {
    console.log('  ! Sem STRIPE_AUTOMATIC_TAX=1 nem STRIPE_TAX_RATE_ID: o Checkout não acrescenta IVA.');
  }
  console.log('');
}

if (require.main === module) {
  main().catch((err) => {
    console.error(`\n  ✗ ${err && err.message}\n`);
    process.exit(1);
  });
}

module.exports = { ensurePrice, findOrCreateProduct, ensurePortalConfiguration, PRODUCT_ID };

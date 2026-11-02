'use strict';

/* Preços de lançamento — sem BD. Executar: node --test test/pricing.test.js
 *
 * Confirma que src/lib/pricing.js é a fonte única e que as páginas públicas
 * (landing, /conoce, termos) mostram os valores certos, com «IVA no
 * incluido», sem o plano avançado e sem promessas de «100 % gratis».
 */

const test = require('node:test');
const assert = require('node:assert/strict');

process.env.SUPABASE_URL = process.env.SUPABASE_URL || 'http://127.0.0.1:54321';
process.env.SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || 'chave-de-teste-unitario';

const pricing = require('../src/lib/pricing');
const { COPY } = require('../src/lib/conoce');
const { createApp } = require('../src/app');

const { PLANS, formatPrice } = pricing;
const VAT = { es: 'IVA no incluido', en: 'VAT not included', pt: 'IVA não incluído' };

let server;
let base;

test.before(async () => {
  server = createApp().listen(0, '127.0.0.1');
  await new Promise((resolve) => server.once('listening', resolve));
  base = `http://127.0.0.1:${server.address().port}`;
});

test.after(() => server.close());

const page = async (path, lang = 'es') => {
  const res = await fetch(base + path, { headers: { 'accept-language': lang }, redirect: 'manual' });
  assert.equal(res.status, 200, path);
  /* &nbsp; e entidades não interessam aqui: só o texto. */
  return (await res.text()).replace(/&nbsp;| | /g, ' ').replace(/&#39;/g, "'");
};
const norm = (s) => s.replace(/ | /g, ' ');

test('pricing: valores do lançamento e derivados do anual', () => {
  assert.equal(pricing.TRIAL_DAYS, 30);
  assert.equal(PLANS.trial.monthly, 0);
  assert.equal(PLANS.founders.monthly, 9.9);
  assert.equal(PLANS.founders.lockMonths, 12);
  assert.equal(PLANS.founders.maxCustomers, 50);
  assert.equal(PLANS.pro.monthly, 14.9);
  assert.equal(PLANS.pro.yearly, 149);
  assert.equal(pricing.yearlyMonthlyEquivalent(), 12.42);
  assert.equal(pricing.yearlyMonthsFree(), 2);
});

test('pricing: formato por idioma, sempre com dois decimais', () => {
  assert.equal(norm(formatPrice(9.9, 'es')), '9,90 €');
  assert.equal(norm(formatPrice(14.9, 'pt')), '14,90 €');
  assert.equal(formatPrice(14.9, 'en'), '€14.90');
  assert.equal(norm(formatPrice(149, 'xx')), '149,00 €');
});

test('pricing: o plano avançado nunca é público', () => {
  const ids = pricing.publicPlans().map((p) => p.id);
  assert.deepEqual(ids.sort(), ['founders', 'pro', 'trial']);
  assert.equal(PLANS.advanced.available, false);
});

test('pricing: estado da prova grátis (só informativo)', () => {
  const now = new Date('2026-11-02T12:00:00Z');
  const fresh = pricing.trialStatus('2026-11-01T12:00:00Z', now);
  assert.equal(fresh.active, true);
  assert.equal(fresh.daysLeft, 29);
  const over = pricing.trialStatus('2026-09-01T00:00:00Z', now);
  assert.equal(over.active, false);
  assert.equal(over.daysLeft, 0);
  assert.equal(pricing.trialStatus(null, now), null);
  assert.equal(pricing.trialStatus('não é data', now), null);
});

test('/conoce (texto): preços vêm de pricing.js e levam sempre a nota do IVA', () => {
  for (const lang of ['es', 'en', 'pt']) {
    const p = COPY[lang].pricing;
    assert.equal(p.cards.length, 3, lang);
    const [trial, founders, pro] = p.cards;
    assert.equal(trial.price, formatPrice(PLANS.trial.monthly, lang));
    assert.equal(founders.price, formatPrice(PLANS.founders.monthly, lang));
    assert.equal(pro.price, formatPrice(PLANS.pro.monthly, lang));
    assert.equal(founders.vat, VAT[lang]);
    assert.equal(pro.vat, VAT[lang]);
    assert.ok(pro.alt.includes(formatPrice(PLANS.pro.yearly, lang)) && pro.alt.includes(VAT[lang]), lang);
    assert.ok(pro.alt.includes(formatPrice(pricing.yearlyMonthlyEquivalent(), lang)), lang);
    assert.ok(founders.text.includes(String(PLANS.founders.maxCustomers)) && founders.text.includes(String(PLANS.founders.lockMonths)), lang);
    assert.equal(p.includes.length, 9, lang);
  }
});

test('landing, /conoce e termos: preços, IVA, sem plano avançado nem «100 % gratis»', async () => {
  const advanced = [formatPrice(PLANS.advanced.monthly, 'es'), formatPrice(PLANS.advanced.monthly, 'en'), '29,90', '29.90'];
  const banned = /100\s?% (gratis|free|grátis)|sin cuota mensual|no monthly fee|sem mensalidade|prueba de mercado|market test|teste de mercado|\bnfc\b/i;

  for (const lang of ['es', 'en', 'pt']) {
    for (const path of ['/', '/conoce']) {
      const html = await page(path, lang);
      const where = `${path} [${lang}]`;
      assert.ok(html.includes(norm(formatPrice(PLANS.founders.monthly, lang))), `${where}: preço Fundadores`);
      assert.ok(html.includes(norm(formatPrice(PLANS.pro.monthly, lang))), `${where}: preço Profissional`);
      assert.ok(html.includes(norm(formatPrice(PLANS.pro.yearly, lang))), `${where}: preço anual`);
      assert.ok(html.includes(VAT[lang]), `${where}: IVA`);
      assert.ok(html.includes('href="/registro"'), `${where}: CTA para o registo`);
      for (const a of advanced) assert.ok(!html.includes(norm(a)), `${where}: mostra o plano avançado (${a})`);
      assert.ok(!banned.test(html), `${where}: ${(html.match(banned) || [])[0]}`);
      assert.ok(!/checkout|stripe/i.test(html), `${where}: botão de pagamento`);
    }
  }

  const terms = await page('/terminos');
  for (const v of [PLANS.founders.monthly, PLANS.pro.monthly, PLANS.pro.yearly]) {
    assert.ok(terms.includes(norm(formatPrice(v, 'es'))), `termos: ${v}`);
  }
  assert.ok(terms.includes('IVA no incluido'));
  assert.ok(terms.includes(`${PLANS.founders.maxCustomers} negocios`) && terms.includes(`${PLANS.founders.lockMonths} meses`));
  assert.ok(terms.includes('30 días de antelación') && /aceptaci|acepte de forma expresa/.test(terms));
  assert.ok(!terms.includes('Hoy Fíchame no pide ni guarda datos de pago.'));
  assert.ok(!/nfc/i.test(terms));
  assert.ok(!terms.includes(norm(formatPrice(PLANS.advanced.monthly, 'es'))));
});

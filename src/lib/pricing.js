'use strict';

/* Preços do Fíchame — FONTE ÚNICA.
 *
 * Qualquer valor, duração ou limite comercial mostrado na interface, nos
 * termos ou nos materiais impressos sai daqui. Não escrever preços à mão
 * nas views nem nos locales: usar `formatPrice()` e estes campos.
 *
 * Todos os preços são em euros e NÃO incluem IVA (o texto mostra sempre
 * «IVA no incluido»).
 *
 * A cobrança (Stripe, src/lib/billing.js) lê os valores daqui: cada preço
 * da Stripe tem uma lookup_key com o valor em cêntimos, e o Checkout só abre
 * se o preço da Stripe for igual ao daqui. Ao mudar um valor, correr
 * `npm run stripe:setup`. Nada aqui cobra ou bloqueia: o fim da prova só
 * mostra avisos.
 */

const CURRENCY = 'EUR';

/* Prova grátis: por negócio, contada desde o registo. Ao terminar NÃO se
 * bloqueia nada (decisão do dono do produto, por agora). */
const TRIAL_DAYS = 30;

const PLANS = Object.freeze({
  trial: Object.freeze({
    id: 'trial',
    available: true,
    monthly: 0,
    days: TRIAL_DAYS
  }),
  founders: Object.freeze({
    id: 'founders',
    available: true,
    monthly: 9.9,
    /* preço garantido durante 12 meses desde a adesão */
    lockMonths: 12,
    /* oferta para os primeiros N negócios que aderirem */
    maxCustomers: 50
  }),
  pro: Object.freeze({
    id: 'pro',
    available: true,
    monthly: 14.9,
    yearly: 149
  }),
  /* Planeado (vários estabelecimentos, vários utilizadores, permissões,
   * automações). NÃO mostrar nem vender antes de existir de verdade. */
  advanced: Object.freeze({
    id: 'advanced',
    available: false,
    monthly: 29.9
  })
});

/* Equivalente mensal do plano anual, arredondado ao cêntimo (149/12 = 12,42). */
function yearlyMonthlyEquivalent(plan = PLANS.pro) {
  return Math.round((plan.yearly / 12) * 100) / 100;
}

/* Meses «oferecidos» no anual face a pagar 12 mensalidades (≈ 2). */
function yearlyMonthsFree(plan = PLANS.pro) {
  return Math.round((plan.monthly * 12 - plan.yearly) / plan.monthly);
}

const LOCALE_BY_LANG = { es: 'es-ES', en: 'en-IE', pt: 'pt-PT' };

/* «9,90 €» em es/pt, «€9.90» em en. Sempre com dois decimais. */
function formatPrice(amount, lang = 'es') {
  return new Intl.NumberFormat(LOCALE_BY_LANG[lang] || LOCALE_BY_LANG.es, {
    style: 'currency',
    currency: CURRENCY,
    minimumFractionDigits: 2,
    maximumFractionDigits: 2
  }).format(amount);
}

/* Planos que podem aparecer ao público (nunca o avançado). */
function publicPlans() {
  return Object.values(PLANS).filter((p) => p.available);
}

/* Estado da prova grátis de um negócio, a partir da data de registo.
 * Devolve null sem data válida. Só informativo: não bloqueia nada. */
function trialStatus(createdAt, now = new Date()) {
  const start = createdAt ? new Date(createdAt) : null;
  if (!start || Number.isNaN(start.getTime())) return null;
  const endsAt = new Date(start.getTime() + TRIAL_DAYS * 24 * 60 * 60 * 1000);
  const msLeft = endsAt.getTime() - now.getTime();
  const daysLeft = Math.max(0, Math.ceil(msLeft / (24 * 60 * 60 * 1000)));
  return { endsAt, daysLeft, active: msLeft > 0 };
}

module.exports = {
  CURRENCY,
  TRIAL_DAYS,
  PLANS,
  formatPrice,
  publicPlans,
  trialStatus,
  yearlyMonthlyEquivalent,
  yearlyMonthsFree
};

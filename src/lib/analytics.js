'use strict';

/* Métricas de produto para o Painel NexForge (uso interno da empresa).
 *
 * Só sai daqui o mínimo: nome do evento, um id pseudónimo do NEGÓCIO
 * (HMAC do restaurant_id com NEXFORGE_PSEUDONYM_SECRET, que nunca sai deste
 * servidor) e códigos fixos (passo, recurso). Nunca dados de candidatos, CVs,
 * notas, textos de pesquisa, emails ou telefones.
 *
 * Sem as três variáveis NEXFORGE_* é um no-op, tal como nos testes e nos
 * dados E2E (EZCV_TEST_PREFIX). Os envios vão por background(): não atrasam
 * a resposta e um painel em baixo nunca afeta o Fíchame. */

const { createNexforge } = require('./nexforge-client.cjs');
const config = require('../config');
const { background } = require('./background');

const nf = createNexforge({
  endpoint: config.analytics.endpoint,
  ingestKey: config.analytics.ingestKey,
  pseudonymSecret: config.analytics.pseudonymSecret,
  enabled: !config.testPrefix && process.env.NODE_ENV !== 'test',
  timeoutMs: 2500,
  retries: 1,
  onError: (err) => console.warn('[nexforge]', err && err.message)
});

function send(event, actor, properties, eventId) {
  if (!nf.enabled || !actor) return;
  nf.track(event, { userId: String(actor), properties: { platform: 'web', ...properties }, eventId });
  background(nf.flush(2000), 'nexforge');
}

/* Antes de existir negócio só há o email do formulário: vira um id
 * pseudónimo (o email em claro nunca é enviado) e é ligado ao negócio
 * quando o registo termina, para o funil não se partir. */
const signupKey = (email) => `signup:${String(email).trim().toLowerCase()}`;

const analytics = {
  enabled: nf.enabled,

  signupStarted(email, method) {
    send('signup_started', signupKey(email), { method });
  },

  signupCompleted(restaurantId, email, method) {
    send('signup_completed', restaurantId, { method });
    if (nf.enabled && restaurantId && email) {
      nf.link(signupKey(email), String(restaurantId));
      background(nf.flush(2000), 'nexforge');
    }
  },

  sessionStarted(restaurantId) {
    send('session_started', restaurantId, {});
  },

  /* Passos do guia de primeiros passos: o id fixo faz o painel contar só a primeira vez. */
  step(restaurantId, step) {
    send('signup_step_completed', restaurantId, { step }, nf.onceId('step', step, restaurantId));
  },

  onboardingCompleted(restaurantId) {
    send('onboarding_completed', restaurantId, {}, nf.onceId('onboarding', restaurantId));
  },

  feature(restaurantId, feature, quantity) {
    send('feature_used', restaurantId, quantity ? { feature, quantity } : { feature });
  },

  /* Usado pelo script de eliminação (processo sem pedido HTTP): espera o envio. */
  async accountDeleted(restaurantId) {
    if (!nf.enabled || !restaurantId) return;
    nf.track('account_deleted', { userId: String(restaurantId), properties: {} });
    await nf.flush(5000);
  }
};

module.exports = analytics;

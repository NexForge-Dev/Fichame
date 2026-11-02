'use strict';

/* POST /webhooks/stripe — eventos da Stripe (assinaturas).
 *
 * Montado em src/app.js ANTES dos parsers de urlencoded/json, da sessão e do
 * CSRF: a assinatura (Stripe-Signature) é calculada sobre o corpo cru, e a
 * Stripe não tem cookie nem token CSRF — a assinatura é a autenticação.
 *
 * Responde depressa e sem esperar por nada que não seja preciso: verifica a
 * assinatura, reserva o evento (stripe_events) e atualiza o negócio. Corre
 * dentro do pedido e não em background(): na Vercel uma falha depois da
 * resposta 200 perdia-se, e com 500 a Stripe volta a tentar (o tratamento é
 * idempotente).
 *
 * Nunca regista o corpo do evento (tem moradas e emails de faturação) nem o
 * segredo.
 */

const express = require('express');

const config = require('../config');
const billing = require('../lib/billing');
const { rateLimit } = require('../middleware/rateLimit');
const { newRef, recordError } = require('../lib/errors');
const { background } = require('../lib/background');

const router = express.Router();

router.post('/webhooks/stripe',
  /* Generoso: a Stripe pode reenviar muitos eventos de uma vez (ex.: depois
   * de uma falha). Só trava abusos evidentes. */
  rateLimit({ windowMs: 60 * 1000, max: 600, name: 'stripe-webhook' }),
  express.raw({ type: 'application/json', limit: '512kb' }),
  async (req, res) => {
    if (!config.billingEnabled) return res.status(503).json({ error: 'not_configured' });

    const signature = req.get('stripe-signature');
    if (!signature || !Buffer.isBuffer(req.body) || req.body.length === 0) {
      return res.status(400).json({ error: 'missing_signature' });
    }

    let event;
    try {
      event = billing.getStripe().webhooks.constructEvent(req.body, signature, config.stripe.webhookSecret);
    } catch {
      console.warn('[stripe] webhook com assinatura inválida');
      return res.status(400).json({ error: 'invalid_signature' });
    }

    try {
      const outcome = await billing.processEvent(event, billing.deps());
      console.log(`[stripe] ${event.type} ${event.id} → ${outcome}`);
      return res.json({ received: true });
    } catch (err) {
      const ref = newRef();
      console.error(`[stripe] falha a tratar ${event.type} ${event.id} (ref ${ref}):`, err && err.message);
      background(recordError(err, req, ref), 'error-events');
      return res.status(500).json({ error: 'processing_failed' });
    }
  });

module.exports = router;

'use strict';

/* Identificação do operador da plataforma e versões dos textos legais.
 *
 * Os dados do operador vêm do ambiente. Enquanto não estiverem completos, as
 * páginas dizem que a identificação está pendente de publicação e indicam o
 * contacto de suporte: é informação obrigatória (art. 10 LSSI; art. 13 RGPD)
 * que não pode ser inventada. Ver docs/legal/00-legal-review-required.md.
 *
 * Versões: ao alterar o significado de /terminos ou /encargo, incrementar a
 * versão e descrever a mudança em TERMS_CHANGES. A versão aceite fica no
 * restaurante (terms_version, dpa_version, terms_accepted_at) e cada
 * aceitação fica no histórico terms_acceptances (migration 0010). Quem tem
 * uma versão anterior vê um aviso no painel até aceitar em /panel/terminos.
 */

const config = require('../config');
const { sb, run } = require('../db');
const { PLANS, TRIAL_DAYS, formatPrice } = require('./pricing');

const TERMS_VERSION = '2026-11-04-prueba';
const DPA_VERSION = '2026-11-04-borrador';
const COOKIES_VERSION = '2026-11-04';
/* Data mostrada em /privacidad, /terminos, /encargo e /cookies. */
const LEGAL_UPDATED = '04/11/2026';

/* O que mudou na versão atual, em frases curtas para o negócio. Tem de ser
 * verdade com o pagamento online desligado e ligado (config.billingEnabled). */
const TERMS_CHANGES = [
  /* Construído a partir de src/lib/pricing.js para não escrever preços à mão. */
  `Lanzamiento con prueba gratis: ${TRIAL_DAYS} días desde el registro, sin tarjeta. Si el pago online no está activado, no se puede contratar ningún plan ni se cobra nada, y el panel lo indica.`,
  `Precios de los planes (IVA no incluido): Fundadores a ${formatPrice(PLANS.founders.monthly)}/mes para los primeros ${PLANS.founders.maxCustomers} negocios, con el precio garantizado ${PLANS.founders.lockMonths} meses; Profesional a ${formatPrice(PLANS.pro.monthly)}/mes o ${formatPrice(PLANS.pro.yearly)}/año.`,
  'Nunca se cobra nada sin tu aceptación expresa. Un cambio de precio para quien ya tenga un plan se avisará con al menos 30 días de antelación.',
  'El Acuerdo de encargo explica ahora cuándo se borran los datos: si la supresión automática no está activada, cada negocio elimina las candidaturas desde su panel al vencer el plazo.',
  'El Acuerdo de encargo y la Política de privacidad indican las métricas de uso que se envían al panel interno de NexForge, sin datos de candidatos.',
  'Las limitaciones de responsabilidad y la indemnidad no se aplican a quien tenga la condición de consumidor.',
  'Los cambios futuros se avisarán en el panel y, si el envío de correo está disponible, también por email.'
];

function termsPending(restaurant) {
  return Boolean(restaurant) &&
    (restaurant.terms_version !== TERMS_VERSION || restaurant.dpa_version !== DPA_VERSION);
}

/* Grava a aceitação das versões atuais no restaurante e no histórico. */
async function recordAcceptance({ restaurantId, userId, legalName, via, ip }) {
  const acceptedAt = new Date().toISOString();
  await run(sb().from('restaurants').update({
    terms_version: TERMS_VERSION,
    dpa_version: DPA_VERSION,
    terms_accepted_at: acceptedAt
  }).eq('id', restaurantId), 'aceitação dos termos');

  await run(sb().from('terms_acceptances').insert({
    restaurant_id: restaurantId,
    user_id: userId || null,
    legal_name: String(legalName || '').slice(0, 150),
    terms_version: TERMS_VERSION,
    dpa_version: DPA_VERSION,
    via,
    ip: String(ip || '').slice(0, 64),
    accepted_at: acceptedAt
  }), 'histórico de aceitação dos termos');
}

const env = (name) => String(process.env[name] || '').trim();

const operator = {
  name: env('OPERATOR_LEGAL_NAME'),
  nif: env('OPERATOR_NIF'),
  address: env('OPERATOR_ADDRESS'),
  email: env('OPERATOR_PRIVACY_EMAIL'),
  registry: env('OPERATOR_REGISTRY'), /* só se aplicar: um autónomo não tem */
  dpo: env('OPERATOR_DPO')
};

function operatorComplete() {
  return ['name', 'nif', 'address', 'email'].every((k) => operator[k]);
}

/* Email a que as pessoas podem mesmo escrever: o de privacidade quando está
 * definido; até lá, o de suporte. */
function privacyContact() {
  return operator.email || config.contactEmail;
}

module.exports = {
  TERMS_VERSION, DPA_VERSION, COOKIES_VERSION, LEGAL_UPDATED, TERMS_CHANGES,
  operator, operatorComplete, privacyContact, termsPending, recordAcceptance
};

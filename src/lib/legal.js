'use strict';

/* Identificação do operador da plataforma e versões dos textos legais.
 *
 * Os dados do operador vêm do ambiente. Enquanto não forem preenchidos, as
 * páginas mostram os marcadores [RAZÓN SOCIAL], [NIF]… — de propósito: é
 * informação obrigatória (art. 10 LSSI; art. 13 RGPD) que não pode ser
 * inventada. Ver docs/legal/00-legal-review-required.md.
 *
 * Versões: ao alterar o significado de /terminos ou /encargo, incrementar a
 * versão e descrever a mudança em TERMS_CHANGES. A versão aceite fica no
 * restaurante (terms_version, dpa_version, terms_accepted_at) e cada
 * aceitação fica no histórico terms_acceptances (migration 0010). Quem tem
 * uma versão anterior vê um aviso no painel até aceitar em /panel/terminos.
 */

const { sb, run } = require('../db');
const { PLANS, TRIAL_DAYS, formatPrice } = require('./pricing');

const TERMS_VERSION = '2026-11-02-precios';
const DPA_VERSION = '2026-10-borrador';
const COOKIES_VERSION = '2026-10';

/* O que mudou na versão atual, em frases curtas para o negócio. */
const TERMS_CHANGES = [
  /* Construído a partir de src/lib/pricing.js para não escrever preços à mão. */
  `Precios de lanzamiento (IVA no incluido): ${TRIAL_DAYS} días de prueba gratis desde el registro, sin tarjeta; plan Fundadores a ${formatPrice(PLANS.founders.monthly)}/mes para los primeros ${PLANS.founders.maxCustomers} negocios, con el precio garantizado ${PLANS.founders.lockMonths} meses; plan Profesional a ${formatPrice(PLANS.pro.monthly)}/mes o ${formatPrice(PLANS.pro.yearly)}/año.`,
  'No se cobra nada sin tu aceptación expresa, nunca con carácter retroactivo, y te avisaremos con al menos 30 días de antelación. Los planes mensuales se pueden cancelar en cualquier momento.',
  'Hoy no se recogen datos de pago. Cuando se activen los pagos, los tratará un proveedor de pagos y se actualizarán estos términos y la política de privacidad.',
  'Fíchame se usa mediante código QR o enlace a la página de tu negocio.',
  'Se detalla la responsabilidad de cada parte: Fíchame no responde de tus decisiones de contratación ni de los contenidos que publicas, y tú respondes si usas la plataforma incumpliendo la ley.',
  'Se explica cómo darte de baja, cuándo puede suspenderse una cuenta y cómo se te avisará de futuros cambios.',
  'Ley española y juzgados de Granada para las controversias con negocios.'
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

const operator = {
  name: process.env.OPERATOR_LEGAL_NAME || '[RAZÓN SOCIAL]',
  nif: process.env.OPERATOR_NIF || '[NIF]',
  address: process.env.OPERATOR_ADDRESS || '[DOMICILIO]',
  email: process.env.OPERATOR_PRIVACY_EMAIL || '[EMAIL DE PRIVACIDAD]',
  registry: process.env.OPERATOR_REGISTRY || '[DATOS REGISTRALES, SI APLICA]',
  dpo: process.env.OPERATOR_DPO || ''
};

function operatorComplete() {
  return !Object.entries(operator).some(([k, v]) => k !== 'dpo' && /^\[.*\]$/.test(v));
}

module.exports = {
  TERMS_VERSION, DPA_VERSION, COOKIES_VERSION, TERMS_CHANGES,
  operator, operatorComplete, termsPending, recordAcceptance
};

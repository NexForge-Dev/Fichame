'use strict';

/* Páginas legais públicas.
 *
 * TODAS são BORRADOR — REQUIERE REVISIÓN JURÍDICA ANTES DE USO COMERCIAL.
 * Não declaram conformidade: descrevem o que a plataforma faz. A identidade
 * do operador vem de OPERATOR_* (lib/legal.js); enquanto faltar, aparecem os
 * marcadores [RAZÓN SOCIAL], [NIF]… em vez de dados inventados.
 */

const express = require('express');

const { PRIVACY_NOTICE_VERSION } = require('../lib/consent');
const { TERMS_VERSION, DPA_VERSION, COOKIES_VERSION, operator, operatorComplete } = require('../lib/legal');
const { COOKIE_NAME, ANON_TTL_MS } = require('../middleware/session');
const config = require('../config');

const router = express.Router();

function common() {
  return {
    operator,
    operatorComplete: operatorComplete(),
    noticeVersion: PRIVACY_NOTICE_VERSION,
    /* Só depois da revisão por advogado: LEGAL_REVIEWED=1 esconde a faixa de borrador. */
    legalReviewed: process.env.LEGAL_REVIEWED === '1'
  };
}

router.get('/privacidad', (req, res) => {
  res.render('legal/privacy', common());
});

router.get('/cookies', (req, res) => {
  res.render('legal/cookies', {
    ...common(),
    version: COOKIES_VERSION,
    cookieName: COOKIE_NAME,
    anonHours: Math.round(ANON_TTL_MS / 3600000),
    sessionDays: Math.round(config.sessionTtlMs / 86400000)
  });
});

router.get('/terminos', (req, res) => {
  res.render('legal/terms', { ...common(), version: TERMS_VERSION });
});

router.get('/encargo', (req, res) => {
  res.render('legal/dpa', { ...common(), version: DPA_VERSION });
});

module.exports = router;

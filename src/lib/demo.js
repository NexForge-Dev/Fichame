'use strict';

/* Modo demonstração (/demo).
 *
 * Um negócio fictício com candidatos fictícios, criado por
 * `npm run demo:seed`, para quem quer ver o painel por dentro sem registar
 * um negócio. Regras:
 *  - os dados são inventados e a interface di-lo sempre (aviso no painel e
 *    na página pública); nunca entram como uso real da plataforma;
 *  - só leitura: o painel recusa qualquer alteração (ver panel.js);
 *  - a página pública do negócio demo não aceita candidaturas, para que
 *    nenhum candidato real envie dados a um negócio que não existe.
 *
 * Identificado pelo test_prefix do restaurante e pelo email do dono; o
 * domínio .invalid (RFC 2606) garante que nenhum email chega a sair.
 */

const DEMO_PREFIX = 'demo';
const DEMO_EMAIL = 'demo@fichame-demo.invalid';

function isDemoUser(user) {
  return Boolean(user) && String(user.email || '').toLowerCase() === DEMO_EMAIL;
}

/* Aviso de «só leitura», já traduzido (com os dias da prova de pricing.js). */
function demoReadOnlyMessage(req) {
  const { TRIAL_DAYS } = require('./pricing');
  const text = 'Esto es una demostración: los cambios no se guardan. Empieza tus {days} días gratis para usar Fíchame con tu negocio.';
  return req.tr ? req.tr(text, { days: TRIAL_DAYS }) : text.replace('{days}', String(TRIAL_DAYS));
}

module.exports = { DEMO_PREFIX, DEMO_EMAIL, isDemoUser, demoReadOnlyMessage };

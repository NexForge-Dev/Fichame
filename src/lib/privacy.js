'use strict';

/* Minimização de dados em logs (art. 5.1.c RGPD).
 *
 * Os logs de segurança são necessários para investigar abusos e incidentes,
 * mas não precisam de identificar pessoas que não são utilizadoras da
 * plataforma (candidatos) nem de guardar emails em claro de quem falhou um
 * login.
 */

const crypto = require('crypto');

/* IPv4 → /24 (último octeto a zero); IPv6 → /48. Continua útil para ver uma
 * rede a fazer spam, mas deixa de apontar para um dispositivo concreto. */
function truncateIp(ip) {
  const s = String(ip || '').replace(/^::ffff:/, '');
  if (/^\d{1,3}(\.\d{1,3}){3}$/.test(s)) return s.replace(/\.\d{1,3}$/, '.0');
  if (/^[0-9a-f:]+$/i.test(s) && s.includes(':')) {
    const [head, tail = ''] = s.split('::');
    const h = head ? head.split(':') : [];
    const t = tail ? tail.split(':') : [];
    const full = s.includes('::') ? [...h, ...Array(Math.max(0, 8 - h.length - t.length)).fill('0'), ...t] : h;
    return `${full.slice(0, 3).map((x) => x || '0').join(':')}::/48`;
  }
  return '';
}

/* Identificador estável de um email para correlacionar tentativas (ex.:
 * credential stuffing contra a mesma conta) sem guardar o email.
 *
 * HMAC com um segredo do servidor, não um sha256 simples: sem o segredo não se
 * consegue testar uma lista de emails contra os logs. Continua a ser um dado
 * PSEUDONIMIZADO (quem tem o segredo pode reidentificar), não anonimizado. */
function emailTag(email) {
  const config = require('../config');
  const secret = process.env.LOG_HMAC_SECRET || config.supabase.serviceRoleKey || 'sem-segredo';
  const mac = crypto.createHmac('sha256', secret).update(String(email || '').trim().toLowerCase()).digest('hex');
  return 'e:' + mac.slice(0, 12);
}

/* Validação de email partilhada por todos os formulários (candidatura,
 * interesse, direitos, registo, login, recuperação, configuração e dados do
 * negócio). Para além de espaços, @, <, >, vírgula e ponto e vírgula, recusa
 * aspas, parênteses e barra invertida: o filtro `in.(…)` do PostgREST usa-os
 * como delimitadores e um email com eles rebentava /panel/derechos (500). */
const EMAIL_RE = /^[^\s@<>,;"()\\]+@[^\s@<>,;"()\\]+\.[^\s@<>,;"()\\]{2,}$/;

function isValidEmail(email) {
  return typeof email === 'string' && email.length <= 254 && EMAIL_RE.test(email);
}

module.exports = { truncateIp, emailTag, EMAIL_RE, isValidEmail };

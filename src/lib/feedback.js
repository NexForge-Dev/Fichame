'use strict';

/* Balão de feedback e /panel/reportar: as regras comuns aos dois.
 *
 * O texto fica primeiro em problem_reports (0009); só depois segue uma cópia
 * para o Painel NexForge, com o id da linha, para reenvios não duplicarem.
 * Para lá vão apenas o tipo, o texto, o caminho da página e a data: nunca o
 * nome, o email ou o id de quem escreveu. Uma falha do painel fica no log e
 * não chega a quem enviou o reporte. */

const analytics = require('./analytics');
const { stripFlash } = require('./flash');

const MESSAGE_MAX = 4000;
const NEXFORGE_WAIT_MS = 2500;
const NEXFORGE_KINDS = { sugerencia: 'suggestion', error: 'problem', duda: 'problem' };

/* Os browsers enviam as quebras de linha como \r\n, mas o maxlength do
 * textarea conta-as como um carácter: sem normalizar, um texto no limite era
 * recusado aqui. */
function reportMessage(value) {
  return String(value == null ? '' : value).replace(/\r\n?/g, '\n').trim();
}

/* Para onde voltar depois do balão: só caminhos do painel, e nunca os ok/err
 * de quem fez o pedido (signRedirects assinaria a mensagem de outra pessoa).
 * O caminho é validado depois de normalizado: «/panel/../x» não é do painel. */
function returnPath(value) {
  const raw = String(value == null ? '' : value);
  if (raw.length > 500 || !/^\/panel(?:[/?]|$)/.test(raw) || /[\s\\]/.test(raw)) return '';
  try {
    const u = new URL(raw, 'http://local.invalid');
    if (u.host !== 'local.invalid' || !/^\/panel(?:\/|$)/.test(u.pathname)) return '';
    return stripFlash(u.pathname + u.search);
  } catch {
    return '';
  }
}

function withFlash(path, name, message) {
  const u = new URL(path, 'http://local.invalid');
  u.searchParams.set(name, message);
  return u.pathname + u.search;
}

async function forwardReport(report) {
  try {
    await analytics.feedback({
      externalId: report.id,
      kind: NEXFORGE_KINDS[report.kind] || 'problem',
      message: report.message,
      page: report.page,
      occurredAt: new Date(report.createdAt)
    }, NEXFORGE_WAIT_MS);
  } catch (err) {
    console.warn('[nexforge] feedback:', err && err.message);
  }
}

module.exports = { MESSAGE_MAX, reportMessage, returnPath, withFlash, forwardReport };

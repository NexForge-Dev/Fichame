'use strict';

/* Informação e consentimentos (arts. 6, 7, 13 RGPD; art. 11 LOPDGDD).
 *
 * Correção da auditoria de 2026-10: a gestão da candidatura deixou de ser
 * tratada como «consentimento». A base é o art. 6.1.b RGPD — medidas
 * pré-contratuais a pedido do candidato —, como indica a AEPD («La protección
 * de datos en las relaciones laborales», III.1). Um checkbox obrigatório de
 * «consentimento» para se candidatar seria um consentimento não livre e uma
 * base jurídica errada. O candidato é INFORMADO (não consente) e o envio do
 * formulário é o pedido.
 *
 * Consentimento real só existe para uma finalidade distinta e opcional: manter
 * os dados para futuras oportunidades NESTE estabelecimento. Nunca para outros
 * estabelecimentos nem para um banco global da plataforma.
 *
 * Versões: ao mudar o significado de qualquer texto, incrementar a versão
 * correspondente — nunca editar um texto mantendo a versão. Cada candidatura
 * guarda a versão do aviso informativo e o texto exato do consentimento.
 *
 * REQUIERE REVISIÓN JURÍDICA: os textos são uma base técnica.
 */

/* Aviso informativo (1.ª camada no formulário + /r/:slug/privacidad). */
const PRIVACY_NOTICE_VERSION = '2026-11';

/* Texto do consentimento de futuras oportunidades. */
const CONSENT_VERSION = 'v3-2026-10';

function days2months(days) {
  const m = Math.round(Number(days) / 30);
  return m <= 1 ? '1 mes' : `${m} meses`;
}

/* O texto inclui o nome do estabelecimento e o prazo: o consentimento é
 * específico (art. 4.11 RGPD) e é gravado tal como o candidato o leu. */
function futureText(restaurantName, reserveDays) {
  return (
    `Quiero que ${restaurantName} conserve mis datos y mi currículum durante ` +
    `${days2months(reserveDays)} para tenerme en cuenta en futuras vacantes de este ` +
    'mismo establecimiento. No autorizo que se compartan con otros establecimientos ' +
    'ni con terceros. Es voluntario: puedo retirarlo en cualquier momento sin que ' +
    'afecte a mi candidatura actual.'
  );
}

/* Formulário de interesse (contratação pausada): a única finalidade do
 * formulário é a reserva, por isso o consentimento é a base e é exigido para
 * enviar — é o próprio pedido, não uma condição imposta a outra coisa. */
function interestText(restaurantName, reserveDays) {
  return (
    `Quiero que ${restaurantName} guarde mis datos de contacto durante ` +
    `${days2months(reserveDays)} para avisarme si surge una vacante en este ` +
    'establecimiento. No autorizo que se compartan con otros establecimientos ni con ' +
    'terceros. Puedo retirarlo en cualquier momento.'
  );
}

module.exports = {
  PRIVACY_NOTICE_VERSION,
  CONSENT_VERSION,
  futureText,
  interestText,
  days2months
};

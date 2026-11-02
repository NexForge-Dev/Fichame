'use strict';

/* Mensagens de erro e de limite geradas fora das rotas (middleware de
 * autenticação, CSRF e rate limit; 404 e 500 de src/app.js). A vista
 * error.ejs mostra title e message através de tr(). Chave = texto espanhol
 * original. Textos destes ficheiros já traduzidos noutro dicionário
 * (10-panel-main.js: «Error», «Página no encontrada», «Error interno» e as
 * mensagens 404/500; 30-public-auth.js: «Sesión no válida», «Tu cuenta ha
 * sido bloqueada.» e os limites passados pelas rotas) ficam lá, não aqui. */

module.exports = {
  // src/middleware/auth.js
  'Sin permiso': { en: 'No permission', pt: 'Sem permissão' },
  'No tienes acceso a esta sección.': { en: 'You don’t have access to this section.', pt: 'Não tens acesso a esta secção.' },
  'Establecimiento desactivado': { en: 'Business deactivated', pt: 'Estabelecimento desativado' },
  'Tu establecimiento está desactivado. Contacta con el soporte de la plataforma.': {
    en: 'Your business has been deactivated. Please contact platform support.',
    pt: 'O teu estabelecimento está desativado. Contacta o suporte da plataforma.'
  },
  'No encontrado': { en: 'Not found', pt: 'Não encontrado' },
  'Página no disponible.': { en: 'Page not available.', pt: 'Página não disponível.' },

  // src/middleware/csrf.js
  'La solicitud no es válida. Vuelve atrás y reintenta.': {
    en: 'The request is not valid. Go back and try again.',
    pt: 'O pedido não é válido. Volta atrás e tenta de novo.'
  },

  // src/middleware/rateLimit.js e limite global de src/app.js
  'Demasiadas solicitudes': { en: 'Too many requests', pt: 'Demasiados pedidos' },
  'Has hecho demasiadas peticiones. Espera unos minutos y vuelve a intentarlo.': {
    en: 'You’ve made too many requests. Wait a few minutes and try again.',
    pt: 'Fizeste demasiados pedidos. Espera uns minutos e tenta de novo.'
  },
  'Demasiadas solicitudes. Espera unos minutos.': { en: 'Too many requests. Wait a few minutes.', pt: 'Demasiados pedidos. Espera uns minutos.' },

  // src/app.js (redirecionamento HTTPS)
  'HTTPS requerido.': { en: 'HTTPS required.', pt: 'HTTPS obrigatório.' },

  // src/routes/admin.js
  'No puedes bloquearte a ti mismo.': { en: 'You cannot block yourself.', pt: 'Não te podes bloquear a ti mesmo.' },
  'Usuario no encontrado.': { en: 'User not found.', pt: 'Utilizador não encontrado.' },
  'No se puede generar un enlace para un administrador.': { en: 'A link cannot be generated for an administrator.', pt: 'Não é possível gerar um link para um administrador.' },
  'Solicitud descartada.': { en: 'Request dismissed.', pt: 'Pedido descartado.' },
  'Reporte no encontrado.': { en: 'Report not found.', pt: 'Relatório não encontrado.' }
};

'use strict';

const { safeEqual } = require('../lib/crypto');

function extractToken(req) {
  if (req.body && typeof req.body._csrf === 'string') return req.body._csrf;
  const header = req.get('x-csrf-token');
  return header || '';
}

function verifyCsrf(req) {
  if (!req.session || !req.session.csrfToken) return false;
  const token = extractToken(req);
  return Boolean(token) && safeEqual(token, req.session.csrfToken);
}

const MULTIPART_ROUTES = [/^\/r\/[a-z0-9-]+\/apply$/, /^\/panel\/restaurante$/];

function csrfProtection(req, res, next) {
  if (['GET', 'HEAD', 'OPTIONS'].includes(req.method)) return next();
  /* Multipart é validado depois do multer (o campo vem no corpo do
   * formulário), mas só nas rotas que têm multer. Nas outras o corpo nem é
   * lido: sem esta lista, um POST multipart para /login chegava aos handlers
   * com req.body undefined e dava 500. */
  if (req.is('multipart/form-data') && MULTIPART_ROUTES.some((re) => re.test(req.path))) return next();
  /* Sair com a sessão já expirada não tem nada a proteger: a rota só limpa
   * o cookie e manda para /login (com sessão, verifica o token ela mesma). */
  if (req.path === '/logout' && !req.session) return next();

  if (!verifyCsrf(req)) {
    return res.status(403).render('error', {
      status: 403,
      title: 'Sesión no válida',
      message: 'La solicitud no es válida. Vuelve atrás y reintenta.'
    });
  }
  next();
}

module.exports = { csrfProtection, verifyCsrf };

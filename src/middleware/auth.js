'use strict';

/* A BD não respondeu ao carregar a sessão: não se sabe quem é a pessoa, e
 * mandá-la para /login diria que a sessão terminou. */
function sessionUnavailable(res) {
  return res.status(503).render('error', {
    status: 503,
    title: 'Servicio no disponible',
    message: 'No hemos podido cargar tu sesión. Inténtalo de nuevo en unos minutos.'
  });
}

function requireOwner(req, res, next) {
  if (req.sessionUnavailable) return sessionUnavailable(res);
  if (req.blockedSession) {
    return res.redirect('/login?error=' + encodeURIComponent('Tu cuenta ha sido bloqueada.'));
  }
  if (!req.user) {
    return res.redirect('/login');
  }
  if (req.user.role !== 'owner') {
    return res.status(403).render('error', {
      status: 403, title: 'Sin permiso', message: 'No tienes acceso a esta sección.'
    });
  }
  /* `restaurant_active` é booleano no Postgres: basta testar a falsidade. */
  if (!req.user.restaurant_active || req.user.restaurant_id == null) {
    return res.status(403).render('error', {
      status: 403,
      title: 'Establecimiento desactivado',
      message: 'Tu establecimiento está desactivado. Contacta con el soporte de la plataforma.'
    });
  }
  next();
}

function requireAdmin(req, res, next) {
  if (req.sessionUnavailable) return sessionUnavailable(res);
  if (req.blockedSession) {
    return res.redirect('/login?error=' + encodeURIComponent('Tu cuenta ha sido bloqueada.'));
  }
  if (!req.user || req.user.role !== 'admin') {
    return res.status(404).render('error', {
      status: 404, title: 'No encontrado', message: 'Página no disponible.'
    });
  }
  next();
}

module.exports = { requireOwner, requireAdmin, sessionUnavailable };

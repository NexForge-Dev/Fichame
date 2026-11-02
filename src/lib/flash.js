'use strict';

/* Mensagens ?ok= / ?err= assinadas.
 *
 * As páginas mostram ?ok= e ?err= como avisos oficiais (verde/vermelho). Sem
 * assinatura qualquer pessoa podia mandar um link como
 *   /r/bar-pepe?err=Envía tu CV por WhatsApp al +34 600…
 * e o candidato via o texto como se fosse do Fíchame (phishing). O texto é
 * escapado, mas a mensagem em si era escolhida por quem fez o link.
 *
 * Agora:
 *   - signRedirects() envolve res.redirect: um redirecionamento interno com
 *     ?ok=/?err= leva também ?fs=<hmac do caminho e das mensagens>;
 *   - verifyFlash() apaga ok/err de req.query quando a assinatura não bate.
 * A assinatura inclui o caminho: uma mensagem assinada para /panel não serve
 * em /r/:slug.
 *
 * Quem redireciona para um destino escolhido pelo cliente (ex.: /idioma
 * ?next=) tem de tirar ok/err/fs do destino com stripFlash(), senão o
 * servidor assinava a mensagem de outra pessoa.
 */

const crypto = require('crypto');

const config = require('../config');

const PARAMS = ['ok', 'err'];
const SIG = 'fs';

function key() {
  return 'flash|' + (process.env.FLASH_SECRET || process.env.LOG_HMAC_SECRET || config.supabase.serviceRoleKey || 'sem-segredo');
}

function signature(pathname, ok, err) {
  return crypto.createHmac('sha256', key())
    .update(`${pathname}\n${ok || ''}\n${err || ''}`)
    .digest('base64url')
    .slice(0, 22);
}

const BASE = 'http://flash.local';

/* URL interno (relativo «/…» ou absoluto no APP_URL) com ?fs= se tiver
 * ok/err. Outros URLs ficam iguais. */
function signUrl(url) {
  const s = String(url);
  let absolute = false;
  if (s.startsWith(config.appUrl + '/')) absolute = true;
  else if (!/^\/(?![/\\])/.test(s)) return s;

  let u;
  try {
    u = new URL(absolute ? s.slice(config.appUrl.length) : s, BASE);
  } catch {
    return s;
  }
  u.searchParams.delete(SIG);
  const ok = u.searchParams.get('ok');
  const err = u.searchParams.get('err');
  if (ok === null && err === null) return s;
  u.searchParams.set(SIG, signature(u.pathname, ok, err));
  const rel = u.pathname + u.search + u.hash;
  return absolute ? config.appUrl + rel : rel;
}

/* Tira ok/err/fs de um destino escolhido pelo cliente. */
function stripFlash(url) {
  const s = String(url);
  if (!/^\/(?![/\\])/.test(s)) return s;
  try {
    const u = new URL(s, BASE);
    for (const p of [...PARAMS, SIG]) u.searchParams.delete(p);
    return u.pathname + u.search + u.hash;
  } catch {
    return '/';
  }
}

function safeEqual(a, b) {
  const x = Buffer.from(String(a));
  const y = Buffer.from(String(b));
  return x.length === y.length && crypto.timingSafeEqual(x, y);
}

/* Middleware: só redirecionamentos feitos por este servidor ficam assinados. */
function signRedirects(req, res, next) {
  const original = res.redirect.bind(res);
  res.redirect = function redirect(a, b) {
    if (typeof a === 'number') return original(a, signUrl(b));
    return original(signUrl(a));
  };
  next();
}

/* Middleware: ?ok=/?err= sem assinatura válida (ou repetidos) desaparecem
 * de req.query antes de qualquer rota ou view os ler. */
function verifyFlash(req, res, next) {
  const q = req.query || {};
  if (!PARAMS.some((p) => p in q)) return next();

  const single = (v) => (typeof v === 'string' ? v : null);
  const ok = single(q.ok);
  const err = single(q.err);
  const sig = single(q[SIG]);
  const valid = sig && (ok !== null || err !== null) &&
    PARAMS.every((p) => !(p in q) || single(q[p]) !== null) &&
    safeEqual(sig, signature(req.path, ok, err));

  if (!valid) {
    const clean = { ...q };
    for (const p of [...PARAMS, SIG]) delete clean[p];
    /* No Express 5 req.query é um getter que volta a ler o URL. */
    Object.defineProperty(req, 'query', { value: clean, writable: true, configurable: true, enumerable: true });
  }
  next();
}

module.exports = { signUrl, stripFlash, signRedirects, verifyFlash, signature };

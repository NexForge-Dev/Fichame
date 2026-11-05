'use strict';

const config = require('../config');
const { sb, one, rpc } = require('../db');
const crypto = require('crypto');

const { randomToken, sha256, safeEqual } = require('../lib/crypto');
const { background } = require('../lib/background');

/* Em produção (HTTPS) o prefixo __Host- obriga o browser a só aceitar o
 * cookie com Secure, Path=/ e sem Domain: um subdomínio não o pode definir
 * nem sobrescrever (proteção contra session fixation via subdomínio). */
const COOKIE_NAME = config.cookieSecure ? '__Host-fichame_sid' : 'ezcv_sid';

/* Sessão anónima: só existe para dar um token CSRF ao formulário público.
 * Validade curta e sem IP nem user-agent — o candidato não é utilizador da
 * plataforma e não há motivo para guardar de onde abriu a página.
 *
 * Não vive na BD: um GET de um crawler a uma página pública não pode escrever
 * nada. O cookie leva «a1.<validade>.<nonce>.<hmac>», assinado com o segredo
 * do servidor, e o token CSRF é um HMAC do nonce. Quem não tem o segredo não
 * forja o par, e o cookie é HttpOnly, SameSite=Lax e __Host- em produção: um
 * site externo não o lê nem o planta no browser da vítima. A proteção é a
 * mesma da linha em `sessions`, sem a linha.
 *
 * Linhas anónimas antigas em `sessions` continuam válidas até caducarem. */
const ANON_TTL_MS = 2 * 60 * 60 * 1000;
const ANON_PREFIX = 'a1';

function anonKey() {
  return `anon-session|${process.env.FLASH_SECRET || process.env.LOG_HMAC_SECRET || config.supabase.serviceRoleKey}`;
}

function anonHmac(text) {
  return crypto.createHmac('sha256', anonKey()).update(text).digest('base64url');
}

function anonToken({ nonce, expiresAt }) {
  const body = `${ANON_PREFIX}.${expiresAt}.${nonce}`;
  return `${body}.${anonHmac(body)}`;
}

/* { nonce, expiresAt } de um cookie válido e dentro do prazo; senão null. */
function readAnonToken(token, now = Date.now()) {
  const parts = String(token || '').split('.');
  if (parts.length !== 4 || parts[0] !== ANON_PREFIX) return null;
  const body = parts.slice(0, 3).join('.');
  if (!safeEqual(parts[3], anonHmac(body))) return null;
  const expiresAt = Number(parts[1]);
  if (!Number.isSafeInteger(expiresAt) || expiresAt <= now) return null;
  return { nonce: parts[2], expiresAt };
}

/* Depende só do nonce: renovar a validade não invalida formulários abertos. */
function anonCsrf(nonce) {
  return anonHmac(`csrf|${nonce}`);
}

function ttlFor(userId) {
  return userId ? config.sessionTtlMs : ANON_TTL_MS;
}

function isAnonCookie(token) {
  return String(token || '').startsWith(`${ANON_PREFIX}.`);
}

/* Para apagar um cookie __Host- o Set-Cookie tem de levar Secure, tal como
 * quando foi criado: um clearCookie só com { path } é ignorado pelo browser. */
const COOKIE_CLEAR = { httpOnly: true, sameSite: 'lax', secure: config.cookieSecure, path: '/' };

function setSessionCookie(res, token, maxAge) {
  res.cookie(COOKIE_NAME, token, {
    httpOnly: true,
    sameSite: 'lax',
    secure: config.cookieSecure,
    path: '/',
    maxAge
  });
}

async function createSession(req, res, userId = null) {
  const token = randomToken(32);
  const csrf = randomToken(24);
  const now = Date.now();
  const ttl = ttlFor(userId);

  const { error } = await sb().from('sessions').insert({
    token_hash: sha256(token),
    user_id: userId,
    csrf_token: csrf,
    ip: userId ? String(req.ip || '').slice(0, 60) : '',
    user_agent: userId ? String(req.headers['user-agent'] || '').slice(0, 200) : '',
    expires_at: now + ttl,
    created_at: now
  });

  if (error) throw new Error(`Supabase: criar sessão — ${error.message}`);

  setSessionCookie(res, token, ttl);
  req.session = { csrfToken: csrf, userId, tokenHash: sha256(token) };
  if (res.locals) res.locals.csrfToken = csrf;
  return req.session;
}

/* Termina todas as sessões de um utilizador, exceto (opcionalmente) a atual.
 * Usado ao mudar a senha ou o email e na recuperação de senha. */
async function destroyUserSessions(userId, exceptTokenHash = null) {
  let q = sb().from('sessions').delete().eq('user_id', userId);
  if (exceptTokenHash) q = q.neq('token_hash', exceptTokenHash);
  const { error } = await q;
  if (error) throw new Error(`Supabase: terminar sessões — ${error.message}`);
}

async function destroySession(req, res) {
  const token = req.cookies && req.cookies[COOKIE_NAME];

  if (token && !isAnonCookie(token)) {
    try {
      await sb().from('sessions').delete().eq('token_hash', sha256(token));
    } catch (err) {
      console.error('[session] falha a apagar sessão:', err.message);
    }
  }

  res.clearCookie(COOKIE_NAME, COOKIE_CLEAR);
  req.session = null;
}

function parseCookies(header) {
  const out = {};
  if (!header) return out;

  for (const part of String(header).split(';')) {
    const idx = part.indexOf('=');
    if (idx === -1) continue;
    const k = part.slice(0, idx).trim();
    const v = part.slice(idx + 1).trim();
    if (k) {
      try { out[k] = decodeURIComponent(v); } catch { out[k] = v; }
    }
  }
  return out;
}

/* O candidato não faz login, mas precisa de um token CSRF no formulário
 * (§26). Sem escrita na BD: ver ANON_TTL_MS. Passada metade da validade o
 * cookie renova-se com o mesmo nonce, por isso o token não muda. */
function ensureSession(req, res, next) {
  const now = Date.now();
  if (!req.session) {
    const nonce = randomToken(16);
    setSessionCookie(res, anonToken({ nonce, expiresAt: now + ANON_TTL_MS }), ANON_TTL_MS);
    req.session = { csrfToken: anonCsrf(nonce), userId: null, anon: { nonce, expiresAt: now + ANON_TTL_MS } };
    res.locals.csrfToken = req.session.csrfToken;
  } else if (req.session.anon && req.session.anon.expiresAt - now < ANON_TTL_MS / 2) {
    setSessionCookie(res, anonToken({ nonce: req.session.anon.nonce, expiresAt: now + ANON_TTL_MS }), ANON_TTL_MS);
  }
  next();
}

/* Carrega sessão, utilizador e restaurante num único pedido ao Supabase.
 *
 * Corre em todos os pedidos, por isso usa a view `session_context`: separar
 * isto em duas queries duplicaria a latência de rede de cada página.
 */
async function loadSession(req, res, next) {
  req.session = null;
  req.user = null;
  req.cookies = parseCookies(req.headers.cookie);

  const token = req.cookies[COOKIE_NAME];
  if (!token) return next();

  if (isAnonCookie(token)) {
    const anon = readAnonToken(token);
    if (anon) req.session = { csrfToken: anonCsrf(anon.nonce), userId: null, anon };
    else res.clearCookie(COOKIE_NAME, COOKIE_CLEAR);
    return next();
  }

  const hash = sha256(token);
  const row = await one(
    sb().from('session_context').select('*').eq('token_hash', hash),
    'carregar sessão'
  );

  const now = Date.now();

  if (!row || Number(row.expires_at) <= now) {
    if (row) {
      try {
        await sb().from('sessions').delete().eq('token_hash', hash);
      } catch { /* sessão expirada que não se conseguiu apagar: ignora */ }
    }
    res.clearCookie(COOKIE_NAME, COOKIE_CLEAR);
    return next();
  }

  /* Renova a validade quando passou metade do tempo. Não é esperado com
   * await: é manutenção, não deve atrasar a resposta. */
  const ttl = ttlFor(row.user_id);
  if (Number(row.expires_at) - now < ttl / 2) {
    background(rpc('touch_session', {
      token_hash: hash,
      expires_at: now + ttl,
      now
    }), 'session touch');
  }

  req.session = { csrfToken: row.csrf_token, userId: row.user_id, tokenHash: hash };

  if (row.user_id) {
    /* role a null significa que o utilizador da sessão já não existe. */
    if (!row.role || row.blocked) {
      await destroySession(req, res);
      req.blockedSession = true;
      return next();
    }

    req.user = {
      id: row.user_id,
      email: row.email,
      password_hash: row.password_hash,
      full_name: row.full_name,
      role: row.role,
      blocked: row.blocked,
      restaurant_id: row.restaurant_id,
      restaurant_slug: row.restaurant_slug,
      restaurant_name: row.restaurant_name,
      restaurant_active: row.restaurant_active,
      restaurant_hiring: row.restaurant_hiring,
      /* Data de registo do negócio (0013): prova grátis no painel. */
      restaurant_created_at: row.restaurant_created_at || null
    };
  }

  next();
}

module.exports = {
  COOKIE_NAME, ANON_TTL_MS, anonToken, readAnonToken, anonCsrf, createSession, destroySession, destroyUserSessions, loadSession, ensureSession
};

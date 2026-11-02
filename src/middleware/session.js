'use strict';

const config = require('../config');
const { sb, one, rpc } = require('../db');
const { randomToken, sha256 } = require('../lib/crypto');
const { background } = require('../lib/background');

/* Em produção (HTTPS) o prefixo __Host- obriga o browser a só aceitar o
 * cookie com Secure, Path=/ e sem Domain: um subdomínio não o pode definir
 * nem sobrescrever (proteção contra session fixation via subdomínio). */
const COOKIE_NAME = config.cookieSecure ? '__Host-fichame_sid' : 'ezcv_sid';

/* Sessão anónima: só existe para dar um token CSRF ao formulário público.
 * Validade curta e sem IP nem user-agent — o candidato não é utilizador da
 * plataforma e não há motivo para guardar de onde abriu a página. */
const ANON_TTL_MS = 2 * 60 * 60 * 1000;

function ttlFor(userId) {
  return userId ? config.sessionTtlMs : ANON_TTL_MS;
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

  if (token) {
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

/* Cada GET sem cookie criava uma linha em `sessions`: um bot podia encher a
 * tabela só a pedir páginas públicas. Limite em memória, por instância e por
 * IP, à criação de sessões ANÓNIMAS. É generoso (um Wi-Fi de loja tem muitos
 * candidatos atrás do mesmo IP, e um browser normal guarda o cookie e não
 * volta a pedir). Acima do limite a página mostra-se na mesma, mas sem
 * sessão: o formulário falha o CSRF ao enviar. */
const ANON_WINDOW_MS = 10 * 60 * 1000;
const ANON_MAX_PER_IP = Math.max(1, parseInt(process.env.ANON_SESSIONS_PER_IP || '600', 10) || 600);
const anonCounts = new Map();
const anonSweeper = setInterval(() => {
  const now = Date.now();
  for (const [k, e] of anonCounts) if (e.resetAt <= now) anonCounts.delete(k);
}, 60 * 1000);
if (anonSweeper.unref) anonSweeper.unref();

function allowAnonSession(ip, now = Date.now()) {
  const k = String(ip || 'unknown');
  let entry = anonCounts.get(k);
  if (!entry || entry.resetAt <= now) {
    entry = { count: 0, resetAt: now + ANON_WINDOW_MS };
    anonCounts.set(k, entry);
  }
  entry.count += 1;
  return entry.count <= ANON_MAX_PER_IP;
}

/* O candidato não faz login, mas precisa de uma sessão para ter um token
 * CSRF no formulário (§26). */
async function ensureSession(req, res, next) {
  if (!req.session) {
    if (allowAnonSession(req.ip)) {
      await createSession(req, res, null);
    } else {
      console.warn('[session] limite de sessões anónimas por IP atingido.');
    }
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
  COOKIE_NAME, ANON_TTL_MS, ANON_MAX_PER_IP, allowAnonSession, createSession, destroySession, destroyUserSessions, loadSession, ensureSession
};

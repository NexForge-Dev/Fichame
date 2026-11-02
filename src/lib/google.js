'use strict';

/* Login com Google (OpenID Connect, fluxo «authorization code» + PKCE).
 *
 * Sem dependências: o `fetch` do Node chega. O id_token é obtido diretamente
 * do endpoint de token da Google por HTTPS, autenticado com o client secret,
 * por isso (OIDC Core §3.1.3.7) a validação TLS substitui a verificação da
 * assinatura — mas iss, aud, exp, nonce e email_verified são sempre verificados.
 *
 * Gratuito: os scopes openid/email/profile não são «sensíveis» e não exigem
 * verificação da app pela Google.
 */

const crypto = require('crypto');

const config = require('../config');

const AUTH_URL = 'https://accounts.google.com/o/oauth2/v2/auth';
const TOKEN_URL = 'https://oauth2.googleapis.com/token';
const ISSUERS = new Set(['https://accounts.google.com', 'accounts.google.com']);

/* Um client id real da Google termina sempre em .apps.googleusercontent.com.
 * Um valor de exemplo ou trocado (ex.: o secret no lugar do id) mostrava o
 * botão e a Google respondia «invalid_client» depois do clique. */
const CLIENT_ID_RE = /^[A-Za-z0-9][A-Za-z0-9._-]*\.apps\.googleusercontent\.com$/;

function clientIdLooksValid(clientId = config.google.clientId) {
  return CLIENT_ID_RE.test(String(clientId || '').trim());
}

function enabled() {
  return Boolean(clientIdLooksValid() && String(config.google.clientSecret || '').trim());
}

/* Motivo (sem valores) para o aviso no arranque, ou '' se está tudo certo ou
 * se o login com Google não foi configurado de todo. */
function configProblem() {
  const { clientId, clientSecret } = config.google;
  if (!clientId && !clientSecret) return '';
  if (!clientIdLooksValid(clientId)) return 'GOOGLE_CLIENT_ID não termina em .apps.googleusercontent.com';
  if (!String(clientSecret || '').trim()) return 'GOOGLE_CLIENT_SECRET em falta';
  return '';
}

function redirectUri() {
  return `${config.appUrl}/login/google/callback`;
}

function b64url(buf) {
  return Buffer.from(buf).toString('base64url');
}

/* state, nonce e code_verifier de um pedido. Vão num cookie HttpOnly de curta
 * duração: o callback só é aceite no mesmo browser que iniciou o fluxo. */
function newFlow(intent) {
  return {
    state: b64url(crypto.randomBytes(24)),
    nonce: b64url(crypto.randomBytes(24)),
    verifier: b64url(crypto.randomBytes(48)),
    intent
  };
}

function authUrl(flow) {
  const params = new URLSearchParams({
    client_id: config.google.clientId,
    redirect_uri: redirectUri(),
    response_type: 'code',
    scope: 'openid email profile',
    state: flow.state,
    nonce: flow.nonce,
    code_challenge: b64url(crypto.createHash('sha256').update(flow.verifier).digest()),
    code_challenge_method: 'S256',
    prompt: 'select_account'
  });
  return `${AUTH_URL}?${params}`;
}

/* Troca o code pelo id_token e devolve as claims já validadas. */
async function exchangeCode(code, flow) {
  const res = await fetch(TOKEN_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      code,
      client_id: config.google.clientId,
      client_secret: config.google.clientSecret,
      redirect_uri: redirectUri(),
      grant_type: 'authorization_code',
      code_verifier: flow.verifier
    }),
    signal: AbortSignal.timeout(10000)
  });
  if (!res.ok) throw new Error(`Google token: HTTP ${res.status}`);
  const body = await res.json();
  return validateIdToken(body.id_token, flow.nonce);
}

function decodeJwtPayload(jwt) {
  const parts = String(jwt || '').split('.');
  if (parts.length !== 3) throw new Error('id_token mal formado');
  return JSON.parse(Buffer.from(parts[1], 'base64url').toString('utf8'));
}

/* Lança erro se alguma claim não for a esperada. `now` em segundos. */
function validateIdToken(idToken, nonce, now = Math.floor(Date.now() / 1000)) {
  const c = decodeJwtPayload(idToken);
  if (!ISSUERS.has(c.iss)) throw new Error('iss inválido');
  const aud = Array.isArray(c.aud) ? c.aud : [c.aud];
  if (!aud.includes(config.google.clientId)) throw new Error('aud inválido');
  if (!(Number(c.exp) > now - 60)) throw new Error('id_token expirado');
  if (!nonce || c.nonce !== nonce) throw new Error('nonce inválido');
  if (!c.sub || typeof c.sub !== 'string') throw new Error('sub em falta');
  if (c.email_verified !== true && c.email_verified !== 'true') throw new Error('email não verificado');
  if (!c.email) throw new Error('email em falta');
  return {
    sub: c.sub,
    email: String(c.email).toLowerCase(),
    name: String(c.name || '').slice(0, 100),
    /* A Google só garante que o email continua a pertencer à conta quando é
     * @gmail.com ou de um Google Workspace (claim hd). Só nesses casos se
     * liga automaticamente a uma conta Fíchame já existente com o mesmo email. */
    authoritative: String(c.email).toLowerCase().endsWith('@gmail.com') || Boolean(c.hd)
  };
}

/* Registo pendente (Google OK, falta o formulário do negócio): dados num
 * cookie assinado com HMAC, válido 30 minutos. */
const PENDING_TTL_MS = 30 * 60 * 1000;

function hmacKey() {
  return 'google-pending|' + (process.env.LOG_HMAC_SECRET || config.supabase.serviceRoleKey || 'sem-segredo');
}

function signPending(data, now = Date.now()) {
  const payload = b64url(JSON.stringify({ ...data, exp: now + PENDING_TTL_MS }));
  const mac = crypto.createHmac('sha256', hmacKey()).update(payload).digest('base64url');
  return `${payload}.${mac}`;
}

function verifyPending(value, now = Date.now()) {
  const [payload, mac] = String(value || '').split('.');
  if (!payload || !mac) return null;
  const expected = crypto.createHmac('sha256', hmacKey()).update(payload).digest('base64url');
  const a = Buffer.from(mac);
  const b = Buffer.from(expected);
  if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) return null;
  try {
    const data = JSON.parse(Buffer.from(payload, 'base64url').toString('utf8'));
    if (!(Number(data.exp) > now)) return null;
    return data;
  } catch {
    return null;
  }
}

module.exports = {
  clientIdLooksValid, configProblem,
  enabled, newFlow, authUrl, exchangeCode, validateIdToken, signPending, verifyPending, PENDING_TTL_MS
};

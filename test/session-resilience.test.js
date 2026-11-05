'use strict';

/* Sessão com a BD em baixo e validade da sessão de administração. Executar:
 * npm run test:unit
 *
 * Supabase falso em 127.0.0.1, nunca o da .env. */

const test = require('node:test');
const assert = require('node:assert/strict');
const http = require('node:http');

process.env.NODE_ENV = 'test';
process.env.SUPABASE_SERVICE_ROLE_KEY = 'chave-de-teste-unitario';
process.env.EZCV_TEST_PREFIX = '';

const state = { down: false, row: null, touches: [] };

const fakeSupabase = http.createServer((req, res) => {
  let raw = '';
  req.on('data', (c) => { raw += c; });
  req.on('end', () => {
    const path = req.url.split('?')[0];
    if (state.down) {
      res.writeHead(503, { 'content-type': 'application/json' });
      return res.end(JSON.stringify({ message: 'indisponível', code: 'PGRST000' }));
    }
    if (path.endsWith('/rpc/touch_session')) state.touches.push(JSON.parse(raw).p);
    res.writeHead(200, { 'content-type': 'application/json' });
    const asObject = String(req.headers.accept || '').includes('vnd.pgrst.object');
    if (path.endsWith('/session_context') && state.row) return res.end(JSON.stringify(asObject ? state.row : [state.row]));
    res.end(asObject ? 'null' : '[]');
  });
});

let server;
let base;
let session;

test.before(async () => {
  await new Promise((resolve) => fakeSupabase.listen(0, '127.0.0.1', resolve));
  process.env.SUPABASE_URL = `http://127.0.0.1:${fakeSupabase.address().port}`;
  session = require('../src/middleware/session');
  const { createApp } = require('../src/app');
  server = createApp().listen(0, '127.0.0.1');
  await new Promise((resolve) => server.once('listening', resolve));
  base = `http://127.0.0.1:${server.address().port}`;
});

test.after(async () => {
  await new Promise((resolve) => setTimeout(resolve, 20));
  server.close();
  fakeSupabase.close();
});

const cookie = () => `${session.COOKIE_NAME}=token-de-sessao-real`;
const get = (path) => fetch(base + path, { redirect: 'manual', headers: { cookie: cookie() } });

test('BD em baixo, com cookie: páginas públicas abrem e a sessão não é substituída', async () => {
  state.down = true;
  try {
    for (const path of ['/', '/privacidad', '/conoce', '/login']) {
      const res = await get(path);
      assert.equal(res.status, 200, path);
      assert.equal(res.headers.get('set-cookie'), null, `${path} não mexe no cookie`);
    }
  } finally {
    state.down = false;
  }
});

test('BD em baixo, com cookie: o painel dá 503 em vez de mandar para /login', async () => {
  state.down = true;
  try {
    for (const path of ['/panel', '/admin']) assert.equal((await get(path)).status, 503, path);
    const res = await fetch(`${base}/login`, {
      method: 'POST',
      redirect: 'manual',
      headers: { cookie: cookie(), 'content-type': 'application/x-www-form-urlencoded' },
      body: 'email=a%40b.es&password=x'
    });
    assert.equal(res.status, 503);
  } finally {
    state.down = false;
  }
});

const sessionRow = (role, expiresAt) => ({
  user_id: 1,
  csrf_token: 'csrf',
  expires_at: expiresAt,
  email: 'a@exemplo.es',
  full_name: 'Pessoa',
  role,
  blocked: false,
  restaurant_id: role === 'owner' ? 7 : null,
  restaurant_slug: role === 'owner' ? 'bar' : null,
  restaurant_name: role === 'owner' ? 'Bar' : null,
  restaurant_active: true,
  restaurant_hiring: 'open',
  restaurant_created_at: new Date().toISOString()
});

test('a sessão de administração dura horas; a do dono continua em dias', () => {
  assert.equal(session.ttlFor(1, 'admin'), 12 * 3600 * 1000);
  assert.equal(session.ttlFor(1, 'owner'), 30 * 86400 * 1000);
  assert.equal(session.ttlFor(null), session.ANON_TTL_MS);
});

test('uma sessão de administração antiga, de 30 dias, é encurtada', async () => {
  state.touches = [];
  state.row = sessionRow('admin', Date.now() + 29 * 86400000);
  const before = Date.now();
  await (await get('/privacidad')).text();
  await new Promise((resolve) => setTimeout(resolve, 20));
  assert.equal(state.touches.length, 1);
  assert.ok(state.touches[0].expires_at <= before + 12 * 3600000 + 5000);
});

test('renovar a sessão renova também o cookie, com a mesma validade da BD', async () => {
  state.touches = [];
  state.row = sessionRow('admin', Date.now() + 3600000); // passou de metade das 12 h
  const res = await get('/privacidad');
  await res.text();
  await new Promise((resolve) => setTimeout(resolve, 20));
  assert.equal(state.touches.length, 1);
  const header = String(res.headers.get('set-cookie'));
  assert.ok(header.startsWith(`${session.COOKIE_NAME}=token-de-sessao-real`), header);
  assert.match(header, /Max-Age=43200/);
  state.row = null;
});

test('sessão bloqueada não renova o cookie: só o apaga', async () => {
  state.row = { ...sessionRow('owner', Date.now() + 86400000), blocked: true };
  const res = await get('/privacidad');
  await res.text();
  assert.doesNotMatch(String(res.headers.get('set-cookie')), /Max-Age=2592000/);
  state.row = null;
});

test('sessão de dono a meio do prazo não é tocada', async () => {
  state.touches = [];
  state.row = sessionRow('owner', Date.now() + 29 * 86400000);
  await (await get('/privacidad')).text();
  await new Promise((resolve) => setTimeout(resolve, 20));
  assert.equal(state.touches.length, 0);
  state.row = null;
});

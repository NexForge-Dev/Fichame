'use strict';

/* Páginas públicas e /demo por GET: um crawler não pode escrever na BD, e o
 * token CSRF tem de continuar a proteger os formulários. Executar:
 * npm run test:unit
 *
 * Sobe a app contra um Supabase falso em 127.0.0.1, que regista todos os
 * pedidos: assim «não escreveu» é uma medição e não uma suposição. */

const test = require('node:test');
const assert = require('node:assert/strict');
const http = require('node:http');

process.env.NODE_ENV = 'test';
process.env.SUPABASE_SERVICE_ROLE_KEY = 'chave-de-teste-unitario';
process.env.EZCV_TEST_PREFIX = '';

const seen = [];
const RESTAURANT = {
  id: 7, slug: 'bar-teste', name: 'Bar de Teste', commercial_name: '', legal_name: 'Bar de Teste SL',
  privacy_email: 'privacidad@exemplo.es', email: 'dono@exemplo.es', address: '', postal_code: '', city: 'Granada',
  establishment_type: 'restaurante', description: '', logo_path: '', photo_path: '', hiring_status: 'open',
  retention_closed_days: 90, retention_inactive_days: 180, retention_reserve_days: 365, test_prefix: '', active: true
};

const fakeSupabase = http.createServer((req, res) => {
  let raw = '';
  req.on('data', (c) => { raw += c; });
  req.on('end', () => {
    const path = req.url.split('?')[0];
    seen.push({ method: req.method, path });
    const asObject = String(req.headers.accept || '').includes('vnd.pgrst.object');
    const reply = (rows) => {
      res.writeHead(200, { 'content-type': 'application/json' });
      if (asObject) return res.end(rows[0] ? JSON.stringify(rows[0]) : 'null');
      res.end(JSON.stringify(rows));
    };
    if (req.method !== 'GET') return reply([]);
    if (path.endsWith('/restaurants')) return reply([RESTAURANT]);
    if (path.endsWith('/users')) return reply([{ id: 9, blocked: false }]);
    if (path.endsWith('/jobs')) return reply([{ id: 1, title: 'Camarero', description: '', requirements: '', contract_type: 'indefinido', work_schedule: 'completa' }]);
    reply([]);
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
  /* logSecurity grava em segundo plano. */
  await new Promise((resolve) => setTimeout(resolve, 20));
  server.close();
  fakeSupabase.close();
});

const writes = () => seen.filter((r) => r.method !== 'GET' && r.method !== 'HEAD');
const get = (path, cookie) => fetch(base + path, { redirect: 'manual', headers: cookie ? { cookie } : {} });
const post = (path, cookie, fields) => fetch(base + path, {
  method: 'POST',
  redirect: 'manual',
  headers: { 'content-type': 'application/x-www-form-urlencoded', ...(cookie ? { cookie } : {}) },
  body: new URLSearchParams(fields).toString()
});
const cookieOf = (res) => String(res.headers.get('set-cookie') || '').split(';')[0];
const csrfOf = (html) => (String(html).match(/name="_csrf" value="([^"]+)"/) || [])[1];

for (const path of ['/login', '/registro', '/recuperar', '/recuperar/nueva', '/r/bar-teste', '/r/bar-teste/enviado', '/r/bar-teste/privacidad']) {
  test(`GET ${path} sem cookie não escreve na BD e entrega um token CSRF`, async () => {
    seen.length = 0;
    const res = await get(path);
    const html = await res.text();
    assert.equal(res.status, 200);
    assert.deepEqual(writes(), []);
    assert.ok(cookieOf(res), 'cookie da sessão anónima');
    if (path !== '/r/bar-teste/enviado') assert.ok(csrfOf(html), 'campo _csrf no formulário');
  });
}

test('GET /demo não inicia sessão nem grava evento; só o POST com token entra', async () => {
  seen.length = 0;
  const page = await get('/demo');
  const html = await page.text();
  assert.equal(page.status, 200);
  assert.deepEqual(writes(), []);
  assert.match(page.headers.get('x-robots-tag') || '', /noindex/);

  const cookie = cookieOf(page);
  assert.equal((await post('/demo', cookie, {})).status, 403, 'sem token');
  assert.equal((await post('/demo', '', { _csrf: csrfOf(html) })).status, 403, 'sem cookie');
  assert.deepEqual(writes(), []);

  const entered = await post('/demo', cookie, { _csrf: csrfOf(html) });
  assert.equal(entered.status, 302);
  assert.equal(entered.headers.get('location'), '/panel');
  await new Promise((resolve) => setTimeout(resolve, 20));
  const written = writes().map((w) => w.path);
  assert.ok(written.some((p) => p.endsWith('/sessions')), 'sessão criada');
  assert.ok(written.some((p) => p.endsWith('/security_logs')), 'evento demo_login');
});

test('robots.txt afasta os crawlers de /demo', async () => {
  assert.match(await (await get('/robots.txt')).text(), /Disallow: \/demo/);
});

test('o token não vale noutra sessão, nem com cookie adulterado ou caducado', async () => {
  const a = await get('/login');
  const tokenA = csrfOf(await a.text());
  const cookieA = cookieOf(a);
  const b = await get('/login');
  await b.text();
  const cookieB = cookieOf(b);
  const creds = { _csrf: tokenA, email: 'a@exemplo.es', password: 'x' };

  assert.equal((await post('/login', cookieB, creds)).status, 403, 'token de outra sessão');
  assert.equal((await post('/login', '', creds)).status, 403, 'sem cookie');
  assert.equal((await post('/login', cookieA, { ...creds, _csrf: 'errado' })).status, 403, 'token errado');

  const [name, value] = cookieA.split('=');
  const parts = value.split('.');
  const forged = [...parts.slice(0, -1), 'x'.repeat(parts[parts.length - 1].length)].join('.');
  assert.equal((await post('/login', `${name}=${forged}`, creds)).status, 403, 'assinatura falsa');

  const expired = session.anonToken({ nonce: 'abc', expiresAt: Date.now() - 1000 });
  assert.equal(session.readAnonToken(expired), null);
  assert.equal(session.readAnonToken(session.anonToken({ nonce: 'abc', expiresAt: Date.now() + 1000 })).nonce, 'abc');
  /* Prolongar a validade à mão invalida a assinatura. */
  const live = session.anonToken({ nonce: 'abc', expiresAt: 1000 }).split('.');
  live[1] = String(Date.now() + 3600000);
  assert.equal(session.readAnonToken(live.join('.')), null);
});

test('a validade renova-se sem mudar o token CSRF, para não invalidar formulários abertos', async () => {
  const nonce = 'nonce-de-teste';
  const almost = session.anonToken({ nonce, expiresAt: Date.now() + 60000 });
  const name = cookieOf(await get('/login')).split('=')[0];
  const res = await get('/login', `${name}=${almost}`);
  const html = await res.text();
  assert.equal(csrfOf(html), session.anonCsrf(nonce));
  const renewed = decodeURIComponent(cookieOf(res).split('=')[1]);
  assert.ok(session.readAnonToken(renewed).expiresAt > Date.now() + 3600000);
});

test('uma página com sessão anónima não consulta session_context', async () => {
  const first = await get('/login');
  await first.text();
  seen.length = 0;
  await (await get('/login', cookieOf(first))).text();
  assert.deepEqual(seen.filter((r) => r.path.endsWith('/session_context')), []);
});

async function apply(cookie, csrf, fields) {
  const body = new FormData();
  for (const [k, v] of Object.entries({ _csrf: csrf, ...fields })) body.append(k, v);
  return fetch(`${base}/r/bar-teste/apply`, { method: 'POST', redirect: 'manual', headers: { cookie }, body });
}

test('limite de candidaturas: só os envios aceites contam, os erros não', async () => {
  const page = await get('/r/bar-teste');
  const csrf = csrfOf(await page.text());
  const cookie = cookieOf(page);

  /* Mais de 20 erros seguidos no mesmo Wi-Fi: cada um volta ao formulário. */
  for (let i = 0; i < 25; i += 1) {
    const res = await apply(cookie, csrf, { nombre: 'X' });
    await res.text();
    assert.equal(res.status, 422, `erro ${i + 1}`);
  }

  /* O honeypot responde como um envio aceite e conta, como um spam real. */
  for (let i = 0; i < 20; i += 1) {
    const res = await apply(cookie, csrf, { sitio_web: 'spam' });
    assert.match(res.headers.get('location') || '', /\/enviado$/, `envio ${i + 1}`);
  }
  const blocked = await apply(cookie, csrf, { sitio_web: 'spam' });
  assert.equal(blocked.status, 303);
  assert.match(new URL(blocked.headers.get('location'), base).searchParams.get('err'), /demasiadas candidaturas/);
});

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
const rpcBodies = {};
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
    if (path.includes('/rpc/')) {
      rpcBodies[path.split('/').pop()] = JSON.parse(raw || '{}').p;
      res.writeHead(200, { 'content-type': 'application/json' });
      return res.end(JSON.stringify({ ok: false, reason: 'email_taken' }));
    }
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

async function apply(cookie, csrf, fields, slug = 'bar-teste') {
  const body = new FormData();
  for (const [k, v] of Object.entries({ _csrf: csrf, ...fields })) body.append(k, v);
  return fetch(`${base}/r/${slug}/apply`, { method: 'POST', redirect: 'manual', headers: { cookie }, body });
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

test('sessão caducada no envio: a página de erro volta ao formulário do negócio', async () => {
  const res = await apply('', 'token-velho', { nombre: 'Ana' }, 'outro-negocio');
  const html = await res.text();
  assert.equal(res.status, 403);
  assert.match(html, /class="btn" href="\/r\/bar-teste"/);
  assert.doesNotMatch(html, />\s*Volver al inicio\s*</);
});

test('resposta a um POST com erros troca o URL da entrada do histórico (Voltar sem ERR_CACHE_MISS)', async () => {
  const page = await get('/r/bar-teste');
  const fresh = await page.text();
  assert.doesNotMatch(fresh, /data-replace-url/);
  const res = await apply(cookieOf(page), csrfOf(fresh), { nombre: 'X' }, 'outro-negocio');
  assert.match(await res.text(), /data-replace-url="\/r\/bar-teste"/);
});

test('o formulário de candidatura leva a barra de progresso do envio', async () => {
  const html = await (await get('/r/bar-teste')).text();
  assert.match(html, /<form[^>]+data-upload/);
  assert.match(html, /<progress[^>]+data-upload-progress/);
});

test('landing sem SMTP não promete avisos por email; com SMTP promete', async () => {
  const config = require('../src/config');
  const off = await (await get('/')).text();
  assert.doesNotMatch(off, /en el panel y por email/);
  assert.match(off, /Te avisamos en el panel cada vez/);
  config.smtp.host = 'smtp.exemplo.es';
  try {
    assert.match(await (await get('/')).text(), /en el panel y por email/);
  } finally {
    config.smtp.host = '';
  }
});

test('SEO: sitemap só com páginas indexáveis, robots aponta para ele e og:image é grande', async () => {
  const map = await get('/sitemap.xml');
  const xml = await map.text();
  assert.equal(map.status, 200);
  assert.match(map.headers.get('content-type') || '', /xml/);
  for (const p of ['/conoce', '/privacidad', '/cookies', '/terminos', '/encargo']) assert.ok(xml.includes(`${p}</loc>`), p);
  assert.doesNotMatch(xml, /\/(panel|login|demo)/);
  assert.match(await (await get('/robots.txt')).text(), /^Sitemap: http.+\/sitemap\.xml$/m);

  const landing = await (await get('/')).text();
  assert.match(landing, /property="og:image" content="[^"]+\/img\/og\.png/);
  assert.match(landing, /name="twitter:card" content="summary_large_image"/);
  const img = await get('/img/og.png');
  assert.equal(img.status, 200);
  const png = Buffer.from(await img.arrayBuffer());
  assert.deepEqual([png.readUInt32BE(16), png.readUInt32BE(20)], [1200, 630]);
});

test('a página pública permite denunciar uma página que se faz passar por um negócio', async () => {
  const html = await (await get('/r/bar-teste')).text();
  assert.match(html, /href="mailto:[^"]+?subject=F%C3%ADchame%20%C2%B7%20%2Fr%2Fbar-teste"/);
});

test('registo: pede um email público próprio e não publica o de acesso por omissão', async () => {
  const page = await get('/registro');
  const html = await page.text();
  assert.match(html, /name="privacy_email"/);
  const fields = {
    _csrf: csrfOf(html), restaurant_name: 'Bar Novo', legal_name: 'Bar Novo SL', owner_name: 'Ana Dueña', email: 'acesso@exemplo.es',
    ciudad: 'Granada', establecimiento: 'restaurante', acepto: '1', password: 'ClaveLocal-2026-x', password2: 'ClaveLocal-2026-x'
  };
  const cookie = cookieOf(page);
  const missing = await post('/registro', cookie, fields);
  assert.equal(missing.status, 422);
  assert.match(await missing.text(), /err-privacy_email/);

  await (await post('/registro', cookie, { ...fields, privacy_email: 'rgpd@exemplo.es' })).text();
  assert.equal(rpcBodies.register_restaurant.privacy_email, 'rgpd@exemplo.es');
  assert.equal(rpcBodies.register_restaurant.email, 'acesso@exemplo.es');
});

test('limite de candidaturas: envios em paralelo também param em 20', async () => {
  const page = await get('/r/bar-teste');
  const csrf = csrfOf(await page.text());
  const cookie = cookieOf(page);
  const all = await Promise.all(Array.from({ length: 30 }, () => apply(cookie, csrf, { sitio_web: 'spam' }, 'negocio-paralelo')));
  const accepted = all.filter((r) => /\/enviado$/.test(r.headers.get('location') || ''));
  assert.equal(accepted.length, 20);
});

test('limite de candidaturas: pedidos recusados em curso devolvem a vaga', async () => {
  const page = await get('/r/bar-teste');
  const csrf = csrfOf(await page.text());
  const cookie = cookieOf(page);
  const bad = await Promise.all(Array.from({ length: 30 }, () => apply(cookie, csrf, { nombre: 'X' }, 'negocio-erros')));
  await Promise.all(bad.map((r) => r.text()));
  await new Promise((resolve) => setTimeout(resolve, 20));
  const next = await apply(cookie, csrf, { sitio_web: 'spam' }, 'negocio-erros');
  assert.match(next.headers.get('location') || '', /\/enviado$/);
});

test('callback da Google: um GET sem fluxo iniciado não escreve na BD', async () => {
  const config = require('../src/config');
  /* Os registos em segundo plano do teste anterior não contam. */
  await new Promise((resolve) => setTimeout(resolve, 50));
  seen.length = 0;
  assert.equal((await get('/login/google/callback')).status, 404, 'Google desligado');
  assert.deepEqual(writes(), []);

  const saved = { ...config.google };
  config.google.clientId = 'teste.apps.googleusercontent.com';
  config.google.clientSecret = 'segredo-de-teste';
  try {
    const res = await get('/login/google/callback?code=x&state=y');
    await res.text();
    assert.ok(res.status >= 400 && res.status < 500, String(res.status));
    assert.deepEqual(writes(), []);
  } finally {
    Object.assign(config.google, saved);
  }
});

'use strict';

/* Testes HTTP sem BD — sobem a app (createApp) numa porta local e só usam
 * rotas que respondem antes de qualquer pedido ao Supabase. Executar:
 * npm run test:unit
 */

const test = require('node:test');
const assert = require('node:assert/strict');

process.env.SUPABASE_URL = process.env.SUPABASE_URL || 'http://127.0.0.1:54321';
process.env.SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || 'chave-de-teste-unitario';
process.env.CRON_SECRET = 'x'.repeat(40);
delete process.env.RETENTION_AUTO;

const { createApp } = require('../src/app');

let server;
let base;

test.before(async () => {
  server = createApp().listen(0, '127.0.0.1');
  await new Promise((resolve) => server.once('listening', resolve));
  base = `http://127.0.0.1:${server.address().port}`;
});

test.after(() => server.close());

const get = (path, headers = {}) => fetch(base + path, { headers, redirect: 'manual' });

test('/internal/cleanup: sem segredo ou com segredo errado → 404', async () => {
  assert.equal((await get('/internal/cleanup')).status, 404);
  assert.equal((await get('/internal/cleanup', { authorization: 'Bearer errado' })).status, 404);
});

test('/internal/retention: 404 mesmo com o segredo certo enquanto RETENTION_AUTO != 1', async () => {
  const res = await get('/internal/retention', { authorization: `Bearer ${process.env.CRON_SECRET}` });
  assert.equal(res.status, 404);
});

test('POST multipart fora das rotas com upload é recusado (sem 500)', async () => {
  const body = new FormData();
  body.append('email', 'a@b.es');
  body.append('password', 'x');
  const res = await fetch(base + '/login', { method: 'POST', body, redirect: 'manual' });
  assert.equal(res.status, 403);
});

test('estáticos: CSS servido com cache', async () => {
  const res = await get('/css/style.css');
  assert.equal(res.status, 200);
  assert.match(res.headers.get('cache-control') || '', /max-age=\d+/);
});

test('config: inteiros inválidos e APP_URL http em produção impedem o arranque', () => {
  const { execFileSync } = require('node:child_process');
  const run = (env) => {
    try {
      execFileSync(process.execPath, ['-e', "require('./src/config').assertConfig()"], {
        cwd: require('node:path').join(__dirname, '..'),
        env: { ...process.env, ...env },
        stdio: 'pipe'
      });
      return 'ok';
    } catch (err) {
      return String(err.stderr);
    }
  };
  assert.match(run({ MAX_CV_MB: 'abc' }), /MAX_CV_MB/);
  assert.match(run({ VERCEL_ENV: 'production', APP_URL: 'http://exemplo.es' }), /APP_URL tem de ser https/);
  assert.equal(run({ VERCEL_ENV: 'production', APP_URL: 'https://exemplo.es' }), 'ok');
});

test('config: na Vercel o CV nunca passa de 4 MB e cookies/proxy ficam seguros por omissão', () => {
  const { execFileSync } = require('node:child_process');
  const out = execFileSync(process.execPath, ['-e',
    "const c=require('./src/config');console.log(JSON.stringify([c.maxUploadBytes/1048576,c.cookieSecure,c.trustProxy]))"], {
    cwd: require('node:path').join(__dirname, '..'),
    env: { ...process.env, VERCEL: '1', MAX_CV_MB: '10', COOKIE_SECURE: '', TRUST_PROXY: '' },
    encoding: 'utf8'
  });
  assert.deepEqual(JSON.parse(out), [4, true, true]);
});

test('logout sem sessão: volta ao /login em vez de 403', async () => {
  const res = await fetch(base + '/logout', { method: 'POST', redirect: 'manual' });
  assert.equal(res.status, 302);
  assert.equal(res.headers.get('location'), '/login');
});

test('erro do cliente (JSON inválido) responde 400, não 500', async () => {
  const res = await fetch(base + '/login', {
    method: 'POST', redirect: 'manual',
    headers: { 'content-type': 'application/json' }, body: '{nao é json'
  });
  assert.equal(res.status, 400);
});

test('/api/health: só booleanos, 200 se ok e 503 caso contrário (sem cookies)', async () => {
  for (const path of ['/api/health', '/health']) {
    const res = await get(path);
    const body = await res.json();
    assert.deepEqual(Object.keys(body).sort(), ['config', 'db', 'migrations', 'ok']);
    for (const v of Object.values(body)) assert.equal(typeof v, 'boolean');
    assert.equal(body.config, true);
    assert.equal(res.status, body.ok ? 200 : 503);
    assert.equal(res.headers.get('set-cookie'), null);
    assert.equal(res.headers.get('cache-control'), 'no-store');
  }
});

test('index.js: configuração insegura em produção → 503 em tudo e health com config:false', async () => {
  const { execFileSync } = require('node:child_process');
  const script = `
    const app = require('./index.js');
    const s = app.listen(0, '127.0.0.1', async () => {
      const base = 'http://127.0.0.1:' + s.address().port;
      const h = await fetch(base + '/api/health');
      const p = await fetch(base + '/login');
      console.log(JSON.stringify([h.status, await h.json(), p.status]));
      s.close();
    });`;
  const out = execFileSync(process.execPath, ['-e', script], {
    cwd: require('node:path').join(__dirname, '..'),
    env: { ...process.env, VERCEL_ENV: 'production', APP_URL: 'http://localhost:3000' },
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe']
  });
  const [healthStatus, body, pageStatus] = JSON.parse(out.trim().split('\n').pop());
  assert.equal(healthStatus, 503);
  assert.deepEqual(body, { ok: false, config: false, db: false, migrations: false });
  assert.equal(pageStatus, 503);
});

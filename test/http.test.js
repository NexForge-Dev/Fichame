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
  /* Os testes com execFileSync bloqueiam este processo, onde corre o servidor:
   * com os 5 s por omissão, um filho lento fecha o socket keep-alive e o fetch
   * seguinte falha com ECONNRESET. */
  server.keepAliveTimeout = 60000;
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

test('páginas legais: faixa de borrador até LEGAL_REVIEWED=1', async () => {
  const before = await (await get('/privacidad')).text();
  assert.match(before, /BORRADOR — REQUIERE REVISIÓN JURÍDICA/);
  assert.doesNotMatch(before, /PENDIENTE DE CONFIRMAR/);
  process.env.LEGAL_REVIEWED = '1';
  try {
    const after = await (await get('/privacidad')).text();
    assert.doesNotMatch(after, /BORRADOR — REQUIERE REVISIÓN JURÍDICA/);
  } finally {
    delete process.env.LEGAL_REVIEWED;
  }
});

/* Com a chave falsa não há rede: só muda o que as views mostram. */
async function withBilling(fn) {
  const config = require('../src/config');
  config.billingEnabled = true;
  try {
    await fn();
  } finally {
    config.billingEnabled = false;
  }
}

async function withRetention(fn) {
  process.env.RETENTION_AUTO = '1';
  try {
    await fn();
  } finally {
    delete process.env.RETENTION_AUTO;
  }
}

const body = async (path) => (await get(path)).text();

test('/privacidad: proveedor genérico, métricas NexForge e art. 13 cobertos', async () => {
  const html = await body('/privacidad');
  assert.doesNotMatch(html, /\[PROVEEDOR/);
  assert.match(html, /Proveedor de envío de correo electrónico/);
  assert.doesNotMatch(html, /No usamos herramientas de analítica,/);
  for (const event of ['signup_started', 'identity_linked', 'feature_used', 'candidatura_recebida', 'account_deleted']) {
    assert.ok(html.includes(event), event);
  }
  for (const part of ['Agencia Española de Protección de Datos', 'menores de 14 años', 'Transferencias internacionales',
    'Decisiones automatizadas', 'Última actualización: 05/11/2026', 'eu-west-1', 'nexforge.d4v29@gmail.com']) {
    assert.ok(html.includes(part), part);
  }
  assert.match(html, /BORRADOR — REQUIERE REVISIÓN JURÍDICA/);
  assert.match(await body('/terminos'), /está en análisis jurídico/);
});

test('retenção: nenhuma página promete supressão automática sem RETENTION_AUTO=1', async () => {
  const dpaOff = await body('/encargo');
  assert.match(dpaOff, /La supresión automática no está activada/);
  assert.doesNotMatch(dpaOff, /La supresión automática está activada/);
  assert.match(await body('/privacidad'), /La supresión automática no está activada/);
  assert.match(await body('/terminos'), /la supresión automática no está activada/);

  await withRetention(async () => {
    const dpaOn = await body('/encargo');
    assert.match(dpaOn, /La supresión automática está activada/);
    assert.doesNotMatch(dpaOn, /no está activada/);
    assert.doesNotMatch(await body('/privacidad'), /supresión automática no está activada/);
  });
});

test('registos técnicos: sem CRON_SECRET os prazos são só previstos', async () => {
  const secret = process.env.CRON_SECRET;
  assert.doesNotMatch(await body('/privacidad'), /plazo previsto/);
  delete process.env.CRON_SECRET;
  try {
    assert.match(await body('/privacidad'), /plazo previsto/);
  } finally {
    process.env.CRON_SECRET = secret;
  }
});

test('pagamento online desligado: nenhum texto público sugere um checkout', async () => {
  const terms = await body('/terminos');
  assert.match(terms, /El pago online no está activado/);
  assert.doesNotMatch(terms, /Stripe|checkout|se renueva automáticamente/i);
  assert.doesNotMatch(await body('/privacidad'), /Stripe/);
  assert.doesNotMatch(await body('/cookies'), /Stripe/);
  for (const path of ['/', '/conoce']) {
    const html = await body(path);
    assert.match(html, /El pago online aún no está activo/, path);
    assert.doesNotMatch(html, /podrás elegir un plan|cancela cuando quieras|puedes cancelarlos/, path);
  }
});

test('pagamento online ligado: as condições de contratação voltam a aparecer', async () => {
  await withBilling(async () => {
    const terms = await body('/terminos');
    assert.match(terms, /Stripe Payments Europe/);
    assert.match(terms, /se renueva automáticamente/);
    assert.doesNotMatch(terms, /El pago online no está activado/);
    assert.match(await body('/privacidad'), /Stripe Payments Europe/);
    assert.match(await body('/cookies'), /Pagos con Stripe/);
    assert.match(await body('/'), /podrás elegir un plan de pago/);
  });
});

/* Lê as páginas legais num processo novo, porque lib/legal.js fixa OPERATOR_*
 * ao ser carregado. */
function legalPages(env) {
  const { execFileSync } = require('node:child_process');
  const script = `
    const { createApp } = require('./src/app');
    const server = createApp().listen(0, '127.0.0.1', async () => {
      const base = 'http://127.0.0.1:' + server.address().port;
      const out = [];
      for (const p of ['/terminos', '/privacidad', '/encargo']) {
        out.push(await (await fetch(base + p)).text());
      }
      server.close();
      console.log(JSON.stringify(out));
      process.exit(0);
    });`;
  const out = execFileSync(process.execPath, ['-e', script], { env, encoding: 'utf8' });
  return JSON.parse(out.trim().split('\n').pop());
}

test('dados do operador em falta: a página diz que estão pendentes, sem marcadores', () => {
  const env = { ...process.env };
  for (const k of Object.keys(env)) if (k.startsWith('OPERATOR_')) delete env[k];
  for (const html of legalPages(env)) {
    assert.doesNotMatch(html, /\[(RAZÓN SOCIAL|NIF|DOMICILIO|EMAIL DE PRIVACIDAD|DATOS REGISTRALES)/);
    assert.doesNotMatch(html, /NIF\s*(,|<br>)/);
    assert.match(html, /pendientes? de publicación/);
  }
});

test('dados do operador: basta definir OPERATOR_* para o texto pendente desaparecer', () => {
  const pages = legalPages({
      ...process.env,
      OPERATOR_LEGAL_NAME: 'Titular de Prueba',
      OPERATOR_NIF: 'NIF-DE-PRUEBA',
      OPERATOR_ADDRESS: 'Dirección de prueba',
      OPERATOR_PRIVACY_EMAIL: 'privacidad@example.com',
      OPERATOR_REGISTRY: 'Registro de prueba'
  });
  for (const html of pages) {
    assert.doesNotMatch(html, /pendientes? de publicación/);
    assert.match(html, /BORRADOR — REQUIERE REVISIÓN JURÍDICA/);
  }
  assert.match(pages[0], /Titular de Prueba/);
  assert.match(pages[1], /privacidad@example\.com/);
});

/* Mensagens ?ok= / ?err= assinadas (src/lib/flash.js): um link de fora não
 * pode pôr texto num aviso oficial. */
test('flash: só redirecionamentos do servidor mostram ?ok=/?err=', async () => {
  const express = require('express');
  const flash = require('../src/lib/flash');
  const app = express();
  app.use(flash.signRedirects, flash.verifyFlash);
  app.get('/go', (req, res) => res.redirect('/panel?err=' + encodeURIComponent('Plazo «inválido» & 100%') + '#x'));
  app.get('/go303', (req, res) => res.redirect(303, '/r/bar?ok=Hecho'));
  app.get(['/panel', '/r/bar', '/r/otro'], (req, res) => res.json(req.query));
  const srv = app.listen(0, '127.0.0.1');
  await new Promise((r) => srv.once('listening', r));
  const b = `http://127.0.0.1:${srv.address().port}`;
  try {
    const loc = (await fetch(b + '/go', { redirect: 'manual' })).headers.get('location');
    assert.match(loc, /[?&]fs=[\w-]{22}/);
    assert.ok(loc.endsWith('#x'));
    assert.deepEqual((await (await fetch(b + loc.replace('#x', ''))).json()).err, 'Plazo «inválido» & 100%');

    const loc303 = (await fetch(b + '/go303', { redirect: 'manual' })).headers.get('location');
    assert.equal((await (await fetch(b + loc303)).json()).ok, 'Hecho');
    /* A mesma assinatura noutro caminho, sem assinatura, ou com o texto mudado: nada. */
    assert.deepEqual(await (await fetch(b + loc303.replace('/r/bar', '/r/otro'))).json(), {});
    assert.deepEqual(await (await fetch(b + '/r/bar?err=Envia%20el%20CV%20por%20WhatsApp')).json(), {});
    assert.deepEqual(await (await fetch(b + loc303.replace('ok=Hecho', 'ok=Otro'))).json(), {});
    assert.deepEqual(await (await fetch(b + '/r/bar?ok=a&ok=b&fs=x&q=1')).json(), { q: '1' });

    assert.equal(flash.signUrl('https://evil.example/?ok=x'), 'https://evil.example/?ok=x');
    assert.equal(flash.signUrl('//evil.example/?ok=x'), '//evil.example/?ok=x');
    assert.equal(flash.stripFlash('/r/bar?ok=x&fs=y&lang=en'), '/r/bar?lang=en');
  } finally {
    srv.close();
  }
});

test('/idioma: o destino perde ?ok=/?err= (o servidor não assina mensagens de terceiros)', async () => {
  const res = await get('/idioma/en?next=' + encodeURIComponent('/r/bar?err=phishing&x=1'));
  assert.equal(res.status, 302);
  assert.equal(res.headers.get('location'), '/r/bar?x=1');
});

'use strict';

/* Balão de feedback e /panel/reportar — sem rede externa. Executar:
 * npm run test:unit
 *
 * Sobe a app contra um Supabase falso em 127.0.0.1 (nunca o da .env: as
 * variáveis são fixadas aqui antes de carregar a config, que não as
 * sobrescreve) e com um cliente NexForge simulado. */

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const http = require('node:http');
const path = require('node:path');

process.env.NODE_ENV = 'test';
process.env.SUPABASE_SERVICE_ROLE_KEY = 'chave-de-teste-unitario';
process.env.ADMIN_EMAIL = '';
process.env.EZCV_TEST_PREFIX = '';

const state = { rows: [], failInsert: false, userId: 1, nextId: 100 };
const CSRF = 'csrf-de-teste';

function sessionRow() {
  return {
    user_id: state.userId,
    csrf_token: CSRF,
    expires_at: Date.now() + 86400000,
    email: 'dono@exemplo.es',
    full_name: 'Dono de Exemplo',
    role: 'owner',
    blocked: false,
    restaurant_id: 7,
    restaurant_slug: 'bar-teste',
    restaurant_name: 'Bar de Teste',
    restaurant_active: true,
    restaurant_hiring: true,
    restaurant_created_at: new Date().toISOString()
  };
}

/* O suficiente de PostgREST: lê vazio, exceto a sessão, e grava os reportes. */
const fakeSupabase = http.createServer((req, res) => {
  let raw = '';
  req.on('data', (c) => { raw += c; });
  req.on('end', () => {
    const asObject = String(req.headers.accept || '').includes('vnd.pgrst.object');
    const reply = (status, row) => {
      res.writeHead(status, { 'content-type': 'application/json' });
      if (status >= 400 || asObject) return res.end(JSON.stringify(row));
      return res.end(JSON.stringify(row == null ? [] : [row]));
    };
    const url = req.url;
    if (url.startsWith('/rest/v1/session_context')) {
      return reply(200, /ezcv_sid/.test(url) ? null : sessionRow());
    }
    if (url.startsWith('/rest/v1/restaurants')) return reply(200, { id: 7, slug: 'bar-teste', name: 'Bar de Teste' });
    if (url.startsWith('/rest/v1/problem_reports') && req.method === 'POST') {
      if (state.failInsert) return reply(400, { message: 'violates check constraint', code: '23514' });
      const body = JSON.parse(raw);
      const row = { ...body, id: state.nextId++, created_at: '2026-11-05T10:00:00.000Z' };
      state.rows.push(row);
      return reply(201, { id: row.id, created_at: row.created_at });
    }
    if (req.method === 'POST') return reply(201, {});
    return reply(200, null);
  });
});

let server;
let base;
let analytics;
let sent;

function fakeClient(impl) {
  return {
    enabled: true,
    track() {},
    link() {},
    flush: async () => {},
    onceId: () => '',
    feedback: impl || (async (item, wait) => { sent.push({ item, wait }); return true; })
  };
}

test.before(async () => {
  await new Promise((resolve) => fakeSupabase.listen(0, '127.0.0.1', resolve));
  process.env.SUPABASE_URL = `http://127.0.0.1:${fakeSupabase.address().port}`;
  const { createApp } = require('../src/app');
  analytics = require('../src/lib/analytics');
  server = createApp().listen(0, '127.0.0.1');
  await new Promise((resolve) => server.once('listening', resolve));
  base = `http://127.0.0.1:${server.address().port}`;
});

test.after(() => {
  server.close();
  fakeSupabase.close();
});

let nextUser = 1;
test.beforeEach(() => {
  state.rows = [];
  state.failInsert = false;
  /* Cada teste com o seu dono: o limite de 10 por hora conta por utilizador. */
  state.userId = nextUser++;
  sent = [];
  analytics.setClient(fakeClient());
});

const COOKIE = { cookie: 'ezcv_sid=sessao-de-teste' };

const send = (fields) => fetch(base + '/panel/reportar', {
  method: 'POST',
  headers: { ...COOKIE, 'content-type': 'application/x-www-form-urlencoded', 'user-agent': 'teste' },
  body: new URLSearchParams({ _csrf: CSRF, ...fields }),
  redirect: 'manual'
});

const panelPage = (url) => fetch(base + url, { headers: COOKIE, redirect: 'manual' });

const BALLOON = { tipo: 'sugerencia', mensaje: 'Faltaria un filtro', pagina: '/panel/vagas', volver: '/panel/candidaturas?estado=nuevo' };

test('balão: grava, reencaminha para o NexForge e volta à página com o aviso', async () => {
  const res = await send(BALLOON);
  assert.equal(res.status, 302);
  const location = res.headers.get('location');
  const target = new URL(location, base);
  assert.equal(target.pathname, '/panel/candidaturas');
  assert.equal(target.searchParams.get('estado'), 'nuevo');
  assert.match(target.searchParams.get('ok'), /Hemos recibido/);
  assert.ok(target.searchParams.get('fs'), 'aviso assinado por signRedirects');

  assert.equal(state.rows.length, 1);
  assert.equal(state.rows[0].kind, 'sugerencia');
  assert.equal(state.rows[0].page, '/panel/vagas');
  assert.equal(state.rows[0].restaurant_id, 7);

  assert.equal(sent.length, 1);
  assert.equal(sent[0].wait, 2500);
  assert.deepEqual(sent[0].item, {
    externalId: state.rows[0].id,
    kind: 'suggestion',
    message: 'Faltaria un filtro',
    page: '/panel/vagas',
    occurredAt: new Date('2026-11-05T10:00:00.000Z')
  });
  assert.doesNotMatch(JSON.stringify(sent[0].item), /dono@exemplo|Dono de Exemplo/);
});

test('o aviso aparece na página de destino, mesmo sem a rota passar query', async () => {
  const res = await send({ ...BALLOON, volver: '/panel/qr' });
  const html = await (await panelPage(res.headers.get('location'))).text();
  assert.match(html, /class="flash ok"/);
});

test('/panel/reportar sem balão continua a voltar a si próprio e reencaminha', async () => {
  const res = await send({ tipo: 'duda', mensaje: 'Una duda', pagina: '/panel' });
  assert.equal(new URL(res.headers.get('location'), base).pathname, '/panel/reportar');
  assert.equal(state.rows[0].kind, 'duda');
  assert.equal(sent[0].item.kind, 'problem');
});

test('tipos: error segue como problem; tipo desconhecido fica error', async () => {
  await send({ tipo: 'error', mensaje: 'Falla' });
  await send({ tipo: 'outra-coisa', mensaje: 'Falla' });
  assert.deepEqual(state.rows.map((r) => r.kind), ['error', 'error']);
  assert.deepEqual(sent.map((s) => s.item.kind), ['problem', 'problem']);
});

test('problem_reports guarda o caminho completo; o SDK é que o reduz', async () => {
  await send({ ...BALLOON, pagina: '/panel/candidaturas/123' });
  assert.equal(state.rows[0].page, '/panel/candidaturas/123');
  assert.equal(sent[0].item.page, '/panel/candidaturas/123');
});

test('uma falha do NexForge não falha o pedido', async () => {
  analytics.setClient(fakeClient(async () => { throw new Error('painel em baixo'); }));
  const res = await send(BALLOON);
  assert.match(new URL(res.headers.get('location'), base).searchParams.get('ok'), /Hemos recibido/);
  assert.equal(state.rows.length, 1);
});

test('o texto é gravado antes de seguir para o NexForge', async () => {
  let rowsAtForward = -1;
  analytics.setClient(fakeClient(async () => { rowsAtForward = state.rows.length; return true; }));
  await send(BALLOON);
  assert.equal(rowsAtForward, 1);
});

test('falha da BD: aviso de erro na mesma página e nada segue para o NexForge', async () => {
  state.failInsert = true;
  const res = await send(BALLOON);
  const target = new URL(res.headers.get('location'), base);
  assert.equal(target.pathname, '/panel/candidaturas');
  assert.match(target.searchParams.get('err'), /No hemos podido/);
  assert.equal(sent.length, 0);
});

test('texto: 1 a 4000 caracteres depois de aparar; \\r\\n conta como um', async () => {
  const blank = await send({ ...BALLOON, mensaje: '   ' });
  assert.match(new URL(blank.headers.get('location'), base).searchParams.get('err'), /Cuéntanos/);

  const tooLong = await send({ ...BALLOON, mensaje: 'x'.repeat(4001) });
  assert.match(new URL(tooLong.headers.get('location'), base).searchParams.get('err'), /4000/);
  assert.equal(state.rows.length, 0);

  await send({ ...BALLOON, mensaje: 'a' });
  await send({ ...BALLOON, mensaje: `  ${'x'.repeat(1999)}\r\n${'y'.repeat(2000)}  ` });
  assert.deepEqual(state.rows.map((r) => r.message.length), [1, 4000]);
});

test('volver fora do painel é ignorado: nunca redireciona para outro sítio', async () => {
  for (const volver of ['https://mau.example/', '//mau.example/', '/panel/../login', '/panelx', '/\\mau.example', 'javascript:alert(1)']) {
    const res = await send({ ...BALLOON, volver });
    const location = res.headers.get('location');
    assert.ok(location.startsWith('/panel/reportar?'), `${volver} → ${location}`);
  }
});

test('volver não traz os avisos de quem fez o pedido', async () => {
  const res = await send({ ...BALLOON, volver: '/panel/vagas?ok=Falso&err=Falso&fs=x' });
  const target = new URL(res.headers.get('location'), base);
  assert.match(target.searchParams.get('ok'), /Hemos recibido/);
  assert.equal(target.searchParams.get('err'), null);
});

test('sem token CSRF → 403 e nada é gravado', async () => {
  const res = await send({ ...BALLOON, _csrf: 'errado' });
  assert.equal(res.status, 403);
  assert.equal(state.rows.length, 0);
});

test('sem sessão → /login e nada é gravado', async () => {
  const res = await fetch(base + '/panel/notificaciones', { redirect: 'manual' });
  assert.equal(res.status, 302);
  assert.match(res.headers.get('location'), /^\/login/);
});

test('o balão usa o limite do reporte: 10 por hora', async () => {
  for (let i = 0; i < 10; i++) assert.equal((await send(BALLOON)).status, 302);
  assert.equal((await send(BALLOON)).status, 429);
  assert.equal(state.rows.length, 10);
});

test('render: o balão aparece no painel, com o destino sem avisos', async () => {
  const res = await panelPage('/panel/notificaciones?filtro=1');
  assert.equal(res.status, 200);
  const html = await res.text();
  assert.match(html, /<details class="feedback" data-feedback>/);
  assert.match(html, /<summary[^>]+aria-label="Enviar comentarios"/);
  assert.match(html, /name="_csrf" value="csrf-de-teste"/);
  assert.match(html, /name="pagina" value="\/panel\/notificaciones"/);
  assert.match(html, /name="volver" value="\/panel\/notificaciones\?filtro=1"/);
  assert.match(html, /value="sugerencia"[^>]*> Ayúdanos a mejorar/);
  assert.match(html, /value="error"[^>]*> Reportar un problema/);
  assert.match(html, /maxlength="4000"/);
});

test('render: traduzido em pt e en', async () => {
  const lang = async (code) => (await fetch(base + '/panel/notificaciones', {
    headers: { ...COOKIE, 'accept-language': code }
  })).text();
  const pt = await lang('pt');
  assert.match(pt, /Ajude-nos a melhorar/);
  assert.match(pt, /> Reportar um problema/);
  const en = await lang('en');
  assert.match(en, /Help us improve/);
  assert.match(en, /> Report a problem/);
});

test('render: fora do painel não há balão', async () => {
  const html = await (await fetch(base + '/login', { redirect: 'manual' })).text();
  assert.doesNotMatch(html, /data-feedback/);
});

test('render: em /panel/reportar não há balão, só o formulário da página', async () => {
  const html = await (await panelPage('/panel/reportar')).text();
  assert.doesNotMatch(html, /data-feedback/);
  assert.match(html, /<form action="\/panel\/reportar"/);
});

test('o balão respeita o CSP e todos os textos têm tradução', () => {
  const { translate } = require('../src/lib/i18n');
  const source = fs.readFileSync(path.join(__dirname, '..', 'src/views/partials/feedback.ejs'), 'utf8');
  assert.doesNotMatch(source, /\sstyle=|\son[a-z]+=|<script/i);
  const keys = [...source.matchAll(/tr\('([^']+)'\)/g)].map((m) => m[1]);
  assert.ok(keys.length >= 6);
  for (const key of keys) {
    /* «Enviar» e «Reportar…» podem coincidir num idioma, mas não em ambos. */
    assert.ok(translate('en', key) !== key || translate('pt', key) !== key, key);
  }
  assert.equal(translate('pt', 'Enviar comentarios'), 'Enviar comentários');
});

test('SDK: feedback() envia só o combinado e ignora falhas', async () => {
  const { createNexforge } = require('../src/lib/nexforge-client.cjs');
  const opts = { endpoint: 'https://painel.exemplo/api/ingest', ingestKey: 'k', pseudonymSecret: 's' };
  const original = global.fetch;
  try {
    let call;
    global.fetch = async (url, init) => { call = { url, init }; return { ok: true, status: 200 }; };
    const ok = await createNexforge(opts).feedback({
      externalId: 12, kind: 'problem', message: 'Falla', page: '/panel', occurredAt: new Date(0)
    }, 100);
    assert.equal(ok, true);
    assert.equal(call.url, 'https://painel.exemplo/api/feedback');
    assert.deepEqual(JSON.parse(call.init.body), {
      external_id: '12', kind: 'problem', message: 'Falla', page: '/panel', occurred_at: '1970-01-01T00:00:00.000Z'
    });

    /* Os ids nos caminhos nunca saem da app. */
    for (const [page, expected] of [
      ['/panel/candidaturas/123', '/panel/candidaturas/:id'],
      ['/panel/candidaturas/123/notas?x=1#y', '/panel/candidaturas/:id/notas'],
      ['/panel/vagas/ab12-cd/editar/7', '/panel/vagas/:id/editar/:id'],
      ['/panel/vagas?id=9', '/panel/vagas'],
      ['', '']
    ]) {
      await createNexforge(opts).feedback({ externalId: 1, kind: 'problem', message: 'x', page }, 100);
      assert.equal(JSON.parse(call.init.body).page, expected);
    }

    global.fetch = async () => { throw new Error('sem rede'); };
    assert.equal(await createNexforge(opts).feedback({ externalId: 1, kind: 'problem', message: 'x' }, 100), false);

    /* Sem NEXFORGE_* configurado não faz nada. */
    assert.equal(await createNexforge({}).feedback({ externalId: 1, kind: 'problem', message: 'x' }), false);
  } finally {
    global.fetch = original;
  }
});

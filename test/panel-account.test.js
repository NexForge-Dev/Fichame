'use strict';

/* Candidaturas vencidas, exportação e pedido de baixa no painel. Executar:
 * npm run test:unit
 *
 * Supabase falso em 127.0.0.1, nunca o da .env. */

const test = require('node:test');
const assert = require('node:assert/strict');
const http = require('node:http');

process.env.NODE_ENV = 'test';
process.env.SUPABASE_SERVICE_ROLE_KEY = 'chave-de-teste-unitario';
process.env.EZCV_TEST_PREFIX = '';
process.env.CRON_SECRET = 'x'.repeat(40);
delete process.env.RETENTION_AUTO;

const CSRF = 'csrf-de-teste';
const state = { overdue: 3, reports: [], appsQueries: [], listQueries: [], rows: [], subscription: 'none', openBaja: [] };

const fakeSupabase = http.createServer((req, res) => {
  let raw = '';
  req.on('data', (c) => { raw += c; });
  req.on('end', () => {
    const url = new URL(req.url, 'http://x');
    const path = url.pathname;
    const asObject = String(req.headers.accept || '').includes('vnd.pgrst.object');
    const headers = { 'content-type': 'application/json' };
    const reply = (rows, total) => {
      if (total !== undefined) headers['content-range'] = `0-0/${total}`;
      res.writeHead(200, headers);
      if (req.method === 'HEAD') return res.end();
      if (asObject) return res.end(rows[0] ? JSON.stringify(rows[0]) : 'null');
      res.end(JSON.stringify(rows));
    };

    if (path.endsWith('/session_context')) {
      return reply([{
        user_id: 1, csrf_token: CSRF, expires_at: Date.now() + 86400000, email: 'dono@exemplo.es', full_name: 'Dono',
        role: 'owner', blocked: false, restaurant_id: 7, restaurant_slug: 'bar-teste', restaurant_name: 'Bar de Teste',
        restaurant_active: true, restaurant_hiring: 'open', restaurant_created_at: new Date().toISOString()
      }]);
    }
    if (path.endsWith('/applications')) {
      state.appsQueries.push(url.search);
      return reply(req.method === 'HEAD' ? [] : [{ id: 11 }, { id: 12 }], state.overdue);
    }
    if (path.endsWith('/application_list')) {
      state.listQueries.push(url.search);
      const page = state.rows.slice(Number(url.searchParams.get('offset') || 0), Number(url.searchParams.get('offset') || 0) + Number(url.searchParams.get('limit') || 1000));
      return reply(page, state.rows.length);
    }
    if (path.endsWith('/restaurants')) {
      return reply([{
        slug: 'bar-teste', name: 'Bar de Teste', legal_name: 'Bar SL', privacy_email: 'p@exemplo.es', terms_version: 'x', dpa_version: 'y',
        retention_closed_days: 90, retention_inactive_days: 180, retention_reserve_days: 365, subscription_status: state.subscription
      }]);
    }
    if (path.endsWith('/problem_reports')) {
      if (req.method === 'POST') {
        state.reports.push(JSON.parse(raw));
        return reply([{ id: 50, created_at: new Date().toISOString() }]);
      }
      return reply(state.openBaja);
    }
    reply([]);
  });
});

let server;
let base;
let cookie;

test.before(async () => {
  await new Promise((resolve) => fakeSupabase.listen(0, '127.0.0.1', resolve));
  process.env.SUPABASE_URL = `http://127.0.0.1:${fakeSupabase.address().port}`;
  const { COOKIE_NAME } = require('../src/middleware/session');
  cookie = `${COOKIE_NAME}=sessao-do-dono`;
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

const get = (path) => fetch(base + path, { redirect: 'manual', headers: { cookie } });
const post = (path, fields) => fetch(base + path, {
  method: 'POST',
  redirect: 'manual',
  headers: { cookie, 'content-type': 'application/x-www-form-urlencoded' },
  body: new URLSearchParams({ _csrf: CSRF, ...fields }).toString()
});

test('painel inicial avisa das candidaturas vencidas e liga à lista', async () => {
  state.overdue = 3;
  state.appsQueries = [];
  const html = await (await get('/panel')).text();
  assert.match(html, /3 candidaturas han superado su plazo de conservación/);
  assert.match(html, /href="\/panel\/candidaturas\?vencidas=1"/);
  const q = decodeURIComponent(state.appsQueries.join(' '));
  assert.match(q, /restaurant_id=eq\.7/);
  assert.match(q, /retention_until=lt\./);
  assert.match(q, /legal_hold=eq\.false/, 'bloqueio legal não conta como vencida');
});

test('sem vencidas não há aviso nem separador', async () => {
  state.overdue = 0;
  assert.doesNotMatch(await (await get('/panel')).text(), /plazo de conservación/);
  assert.doesNotMatch(await (await get('/panel/candidaturas')).text(), /vencidas=1/);
  state.overdue = 3;
});

test('com a supressão automática ligada o painel inicial não pede para apagar à mão', async () => {
  process.env.RETENTION_AUTO = '1';
  try {
    assert.doesNotMatch(await (await get('/panel')).text(), /han superado su plazo/);
  } finally {
    delete process.env.RETENTION_AUTO;
  }
});

test('filtro de vencidas: lista só essas candidaturas, com a data do prazo', async () => {
  state.listQueries = [];
  state.rows = [{ id: 11, status: 'rechazado', applied_at: '2026-01-01T10:00:00Z', first_name: 'Ana', last_name: 'Ruiz', phone: '600', retention_until: '2026-04-01T10:00:00Z' }];
  const html = await (await get('/panel/candidaturas?vencidas=1')).text();
  assert.match(decodeURIComponent(state.listQueries.join(' ')), /id=in\.\(11,12\)/);
  assert.match(html, /Venció el 01\/04\/2026/);
  assert.match(html, /name="vencidas" value="1"/, 'a busca conserva o filtro');
  assert.match(html, /aria-current="page"[^>]*>\s*<span>Vencidas/);
  state.rows = [];
});

test('exportação CSV: anexo, só do negócio da sessão e sem fórmulas de folha de cálculo', async () => {
  state.listQueries = [];
  state.rows = [
    { id: 1, first_name: '=HYPERLINK("x")', last_name: 'Ruiz, "Ana"', email: 'a@b.es', phone: '+34600111222', job_title: '', status: 'nuevo', availability: '', experience: 'linha 1\nlinha 2', observations: '', applied_at: '2026-01-01T10:00:00Z', retention_until: null }
  ];
  const res = await get('/panel/candidaturas/exportar.csv');
  const csv = await res.text();
  assert.equal(res.status, 200);
  assert.match(res.headers.get('content-type'), /text\/csv/);
  assert.match(res.headers.get('content-disposition'), /attachment; filename="candidaturas-bar-teste\.csv"/);
  assert.match(decodeURIComponent(state.listQueries[0]), /restaurant_id=eq\.7/);
  assert.ok(csv.includes(`"'=HYPERLINK(""x"")"`), 'fórmula neutralizada');
  assert.ok(csv.includes(`"'+34600111222"`), 'telefone com + neutralizado');
  assert.ok(csv.includes('"Ruiz, ""Ana"""'), 'aspas e vírgulas escapadas');
  state.rows = [];
});

test('exportação pagina para lá das 1000 linhas', async () => {
  state.rows = Array.from({ length: 1001 }, (_, i) => ({ id: i + 1, first_name: `N${i}`, last_name: '', email: '', phone: '', status: 'nuevo', applied_at: '2026-01-01T10:00:00Z' }));
  const csv = await (await get('/panel/candidaturas/exportar.csv')).text();
  assert.equal(csv.trim().split('\r\n').length, 1002);
  state.rows = [];
});

test('configuração oferece exportar e pedir a baixa', async () => {
  const html = await (await get('/panel/configuracion')).text();
  assert.match(html, /href="\/panel\/candidaturas\/exportar\.csv"/);
  assert.match(html, /action="\/panel\/baja"/);
});

test('pedido de baixa: exige escrever BAJA e fica nos reportes do admin', async () => {
  state.reports = [];
  const refused = await post('/panel/baja', { confirmar: 'nao' });
  assert.equal(refused.status, 302);
  assert.match(new URL(refused.headers.get('location'), base).searchParams.get('err'), /BAJA/);
  assert.equal(state.reports.length, 0);

  const ok = await post('/panel/baja', { confirmar: 'baja' });
  assert.match(new URL(ok.headers.get('location'), base).searchParams.get('ok'), /solicitud de baja/);
  assert.equal(state.reports.length, 1);
  assert.equal(state.reports[0].restaurant_id, 7);
  assert.equal(state.reports[0].kind, 'duda');
  assert.match(state.reports[0].message, /^Solicitud de baja/);
  assert.match(state.reports[0].message, /bar-teste/);
});

test('pedido de baixa repetido não cria outro reporte', async () => {
  state.reports = [];
  state.openBaja = [{ id: 9 }];
  const res = await post('/panel/baja', { confirmar: 'BAJA' });
  assert.match(new URL(res.headers.get('location'), base).searchParams.get('ok'), /solicitud de baja/);
  assert.equal(state.reports.length, 0);
  state.openBaja = [];
});

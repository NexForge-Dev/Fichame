'use strict';

/* Regras de negócio das correções de lançamento (sem BD). Executar:
 * node --test test/rules.test.js
 * As regras que vivem no SQL (duplicado por vaga, nomes não reescritos,
 * registo atómico, estado repetido) são testadas em test/db.js. */

const test = require('node:test');
const assert = require('node:assert/strict');

process.env.SUPABASE_URL = process.env.SUPABASE_URL || 'http://127.0.0.1:54321';
process.env.SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || 'chave-de-teste-unitario';

const { isValidEmail, EMAIL_RE } = require('../src/lib/privacy');
const { trialStatus, TRIAL_DAYS } = require('../src/lib/pricing');
const { autoRetentionEnabled } = require('../src/lib/retention');
const { rateLimit, backPath } = require('../src/middleware/rateLimit');

const DAY = 24 * 60 * 60 * 1000;

test('email: aceita endereços normais', () => {
  for (const e of ['ana@bar.es', 'ana.garcia+cv@sub.dominio.com', 'o_neil@x.io', "d'angelo@x.es"]) {
    assert.equal(isValidEmail(e), true, e);
  }
});

test('email: recusa aspas, parênteses e barra invertida (partiam o in.(…) do PostgREST)', () => {
  for (const e of ['a"b@x.es', 'a(b@x.es', 'a)b@x.es', 'a\\b@x.es', 'ana@x"y.es', 'ana@(x).es', 'ana@x.e\\s']) {
    assert.equal(isValidEmail(e), false, e);
    assert.equal(EMAIL_RE.test(e), false, e);
  }
});

test('email: recusa os casos que já eram recusados', () => {
  for (const e of ['', 'ana', 'ana@x', 'ana@x.e', 'a na@x.es', 'a<b@x.es', 'a,b@x.es', 'a;b@x.es', 'a@b@x.es', `${'a'.repeat(250)}@x.es`]) {
    assert.equal(isValidEmail(e), false, e);
  }
  assert.equal(isValidEmail(null), false);
  assert.equal(isValidEmail(['ana@x.es']), false);
});

test('trialStatus: 30 dias desde o registo', () => {
  assert.equal(TRIAL_DAYS, 30);
  const start = new Date('2026-11-01T10:00:00Z');
  const t0 = trialStatus(start, start);
  assert.equal(t0.active, true);
  assert.equal(t0.daysLeft, 30);
  assert.equal(t0.endsAt.toISOString(), '2026-12-01T10:00:00.000Z');

  const half = trialStatus(start, new Date(start.getTime() + 29.5 * DAY));
  assert.equal(half.active, true);
  assert.equal(half.daysLeft, 1);

  const ended = trialStatus(start, new Date(start.getTime() + 30 * DAY));
  assert.equal(ended.active, false);
  assert.equal(ended.daysLeft, 0);

  const later = trialStatus(start.toISOString(), new Date(start.getTime() + 90 * DAY));
  assert.equal(later.active, false);
  assert.equal(later.daysLeft, 0);
});

test('trialStatus: sem data válida devolve null (não bloqueia nada)', () => {
  assert.equal(trialStatus(null), null);
  assert.equal(trialStatus(undefined), null);
  assert.equal(trialStatus('não é data'), null);
});

test('retenção automática: a mensagem do painel só promete limpeza com RETENTION_AUTO=1 e CRON_SECRET', () => {
  const secret = 'x'.repeat(40);
  assert.equal(autoRetentionEnabled({}), false);
  assert.equal(autoRetentionEnabled({ RETENTION_AUTO: '0', CRON_SECRET: secret }), false);
  assert.equal(autoRetentionEnabled({ RETENTION_AUTO: '1' }), false);
  assert.equal(autoRetentionEnabled({ RETENTION_AUTO: '1', CRON_SECRET: 'curto' }), false);
  assert.equal(autoRetentionEnabled({ RETENTION_AUTO: '1', CRON_SECRET: secret }), true);
});

test('vercel.json: limpeza e retenção agendadas a horas diferentes', () => {
  const crons = require('../vercel.json').crons;
  const byPath = Object.fromEntries(crons.map((c) => [c.path, c.schedule]));
  assert.ok(byPath['/internal/cleanup']);
  assert.ok(byPath['/internal/retention']);
  assert.notEqual(byPath['/internal/cleanup'].split(' ')[1], byPath['/internal/retention'].split(' ')[1]);
});

test('backPath: só caminhos locais, nunca outro host', () => {
  const req = (referer, params = {}, originalUrl = '/x') => ({ params, originalUrl, get: () => referer });
  assert.equal(backPath(req('', { slug: 'bar-pepe' }, '/r/bar-pepe/apply')), '/r/bar-pepe');
  assert.equal(backPath(req('https://outro.site/panel/x')), '/panel/x');
  assert.equal(backPath(req('http://x//evil.com/a')), '/');
  assert.equal(backPath(req('/\\evil.com')), '/');
  assert.equal(backPath(req('')), '/');
});

test('rate limit num formulário multipart: volta a /r/:slug com a mensagem, não texto cru', async () => {
  const express = require('express');
  const app = express();
  const message = 'Has enviado demasiadas candidaturas desde este dispositivo. Inténtalo más tarde.';
  app.post('/r/:slug/apply', rateLimit({ windowMs: 60000, max: 0, name: 'teste-apply', message }), (req, res) => res.send('ok'));
  app.post('/json', rateLimit({ windowMs: 60000, max: 0, name: 'teste-json' }), (req, res) => res.send('ok'));
  const server = app.listen(0, '127.0.0.1');
  await new Promise((resolve) => server.once('listening', resolve));
  const base = `http://127.0.0.1:${server.address().port}`;
  try {
    const body = new FormData();
    body.append('nombre', 'Ana');
    const res = await fetch(`${base}/r/bar-pepe/apply`, { method: 'POST', body, redirect: 'manual' });
    assert.equal(res.status, 303);
    assert.equal(res.headers.get('location'), `/r/bar-pepe?err=${encodeURIComponent(message)}`);
    assert.ok(res.headers.get('retry-after'));

    const j = await fetch(`${base}/json`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: '{}' });
    assert.equal(j.status, 429);
  } finally {
    server.close();
  }
});

test('scrypt: hashes novos com N = 2^17; os antigos (2^14) verificam e pedem rehash', async () => {
  const crypto = require('node:crypto');
  const c = require('../src/lib/crypto');
  const fresh = await c.hashPasswordAsync('uma senha bem longa');
  assert.equal(fresh.split('$')[1], String(2 ** 17));
  assert.equal(await c.verifyPasswordAsync('uma senha bem longa', fresh), true);
  assert.equal(await c.verifyPasswordAsync('outra senha', fresh), false);
  assert.equal(c.needsRehash(fresh), false);

  const salt = crypto.randomBytes(16);
  const oldHash = `scrypt$16384$${salt.toString('hex')}$${crypto.scryptSync('senha antiga 123', salt, 64, { N: 16384, r: 8, p: 1 }).toString('hex')}`;
  assert.equal(await c.verifyPasswordAsync('senha antiga 123', oldHash), true);
  assert.equal(c.verifyPassword('senha antiga 123', oldHash), true);
  assert.equal(c.needsRehash(oldHash), true);

  // N absurdo ou inválido no hash guardado: recusado sem tentar alocar memória
  assert.equal(await c.verifyPasswordAsync('x', `scrypt$${2 ** 30}$00$00`), false);
  assert.equal(await c.verifyPasswordAsync('x', 'scrypt$1000$00$00'), false);
  assert.equal(c.needsRehash('lixo'), false);
});

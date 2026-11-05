'use strict';

/* Limite de envios aceites: contas exatas, com relógio controlado e sem
 * depender do evento `close`, que pode não chegar em todos os ambientes.
 * Executar: npm run test:unit */

const test = require('node:test');
const assert = require('node:assert/strict');
const { EventEmitter } = require('node:events');

process.env.SUPABASE_URL = process.env.SUPABASE_URL || 'http://127.0.0.1:54321';
process.env.SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || 'chave-de-teste-unitario';

const { acceptedLimit } = require('../src/middleware/rateLimit');

const HOUR = 60 * 60 * 1000;

function setup(max = 2) {
  const clock = { t: 1000000 };
  const limit = acceptedLimit({
    windowMs: HOUR, max, key: () => 'ip|negocio', message: 'limite', now: () => clock.t
  });
  const start = () => {
    const req = { is: () => false, get: () => '' };
    const res = new EventEmitter();
    Object.assign(res, {
      refused: false,
      set() { return this; },
      status() { return this; },
      render() { this.refused = true; }
    });
    let passed = false;
    limit.check(req, res, () => { passed = true; });
    return { req, res, passed };
  };
  /* A rota, tal como em public.js. */
  const route = (body) => limit.finish(body);
  return { clock, limit, start, route };
}

const canApply = (t) => {
  const r = t.start();
  if (r.passed) r.res.emit('close');
  return r.passed;
};

test('R1: fechar a ligação com a rota a correr não evita contar o envio aceite', async () => {
  const t = setup(2);
  for (let i = 0; i < 2; i += 1) {
    const { req, res } = t.start();
    await t.route(async () => {
      res.emit('close'); // o cliente desliga depois de enviar tudo
      await Promise.resolve();
      t.limit.hit(req); // a candidatura foi gravada
    })(req, res);
  }
  assert.equal(t.start().passed, false, 'as duas aceites contam');
});

test('R1: enquanto a rota corre, a vaga fica ocupada mesmo com a ligação fechada', async () => {
  const t = setup(1);
  const { req, res } = t.start();
  let finish;
  const running = t.route(() => new Promise((resolve) => { finish = resolve; }))(req, res);
  res.emit('close');
  assert.equal(t.start().passed, false, 'um segundo envio não aproveita a vaga');
  t.limit.hit(req);
  finish();
  await running;
  assert.equal(t.start().passed, false);
});

test('sem o evento close: 20 erros seguidos não bloqueiam o negócio durante 1 h', async () => {
  const t = setup(20);
  for (let i = 0; i < 25; i += 1) {
    const { req, res, passed } = t.start();
    assert.equal(passed, true, `erro ${i + 1}`);
    await t.route(async () => {})(req, res); // erro de validação: não chama hit
  }
});

test('sem o evento close: uma exceção na rota devolve a vaga', async () => {
  const t = setup(1);
  const { req, res } = t.start();
  await assert.rejects(t.route(async () => { throw new Error('falha'); })(req, res), /falha/);
  assert.equal(t.start().passed, true);
});

test('sem close e sem rota (recusado antes dela): a reserva caduca ao fim de 2 minutos', () => {
  const t = setup(1);
  assert.equal(t.start().passed, true);
  assert.equal(t.start().passed, false, 'reserva ativa');
  t.clock.t += 2 * 60 * 1000 - 1;
  assert.equal(t.start().passed, false, 'ainda dentro do prazo');
  t.clock.t += 2;
  assert.equal(t.start().passed, true, 'reserva caducada');
});

test('com close antes de a rota começar, a vaga volta logo', () => {
  const t = setup(1);
  assert.equal(canApply(t), true);
  assert.equal(canApply(t), true);
});

test('envio aceite depois de a reserva caducar continua a contar', async () => {
  const t = setup(1);
  const { req, res } = t.start();
  await t.route(async () => {
    t.clock.t += 3 * 60 * 1000; // upload lento
    t.limit.hit(req);
  })(req, res);
  assert.equal(t.start().passed, false);
});

test('a janela de 1 h volta a abrir', async () => {
  const t = setup(1);
  const { req, res } = t.start();
  await t.route(async () => t.limit.hit(req))(req, res);
  assert.equal(t.start().passed, false);
  t.clock.t += HOUR;
  assert.equal(t.start().passed, true);
});

'use strict';

/* Envio do CV no browser (public/js/app.js), sem browser: corre o ficheiro
 * real num contexto com um DOM mínimo, com temporizadores e XHR controlados
 * pelo teste. Assim a ordem dos eventos é exata. Executar: npm run test:unit */

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const SOURCE = fs.readFileSync(path.join(__dirname, '..', 'public', 'js', 'app.js'), 'utf8');
const ACTION = 'http://local.test/r/bar-teste/apply';
const FORM_PAGE = '<form data-upload><progress data-upload-progress></progress></form>';

function classes(hidden) {
  const set = new Set(hidden ? ['is-hidden'] : []);
  return {
    add: (c) => set.add(c),
    remove: (c) => set.delete(c),
    contains: (c) => set.has(c),
    toggle: () => {}
  };
}

function setup() {
  const listeners = {};
  const timers = new Map();
  const xhrs = [];
  let nextTimer = 1;
  const written = [];

  const attrs = {
    'data-busy': 'Enviando tu CV…',
    'data-http-error': 'erro do servidor',
    'data-network-error': 'erro de rede',
    'data-session-renewed': 'sessão renovada',
    'data-cookies-needed': 'precisa de cookies'
  };
  const btn = {
    disabled: false,
    innerHTML: 'Enviar candidatura',
    textContent: 'Enviar candidatura',
    attrs: {},
    setAttribute(k, v) { this.attrs[k] = v; },
    getAttribute(k) { return this.attrs[k]; },
    hasAttribute(k) { return k in this.attrs; },
    removeAttribute(k) { delete this.attrs[k]; }
  };
  const bar = { hidden: true, value: 0 };
  const failed = { textContent: 'erro de rede', classList: classes(true) };
  const csrf = { value: 'token-velho' };
  const form = {
    action: `${ACTION}#enviar`,
    hasAttribute: (k) => k === 'data-upload' || k === 'data-busy',
    getAttribute: (k) => attrs[k],
    querySelector(sel) {
      if (sel === '[data-upload-progress]') return bar;
      if (sel === '[data-upload-failed]') return failed;
      if (sel === 'button[type=submit]') return btn;
      if (sel === 'input[name=_csrf]') return csrf;
      return null;
    }
  };

  class FakeXhr {
    constructor() {
      this.upload = {};
      this.headers = {};
      xhrs.push(this);
    }

    open(method, url) { this.method = method; this.url = url; }

    send(body) { this.body = body; }
  }

  const documentStub = {
    documentElement: { lang: 'es' },
    addEventListener(type, fn) { (listeners[type] = listeners[type] || []).push(fn); },
    querySelector: () => null,
    querySelectorAll: () => ({ forEach: () => {} }),
    getElementById: () => null,
    open() { written.push('open'); },
    write(html) { written.push(html); },
    close() { written.push('close'); }
  };

  const windowStub = {
    addEventListener() {},
    location: { hash: '', pathname: '/', assign(url) { windowStub.assigned = url; } },
    FormData: class {}
  };

  const context = vm.createContext({
    document: documentStub,
    window: windowStub,
    FormData: windowStub.FormData,
    XMLHttpRequest: FakeXhr,
    DOMParser: class {
      parseFromString(html) {
        const m = /name="_csrf" value="([^"]+)"/.exec(html);
        return { querySelector: () => (m ? { value: m[1] } : null) };
      }
    },
    setTimeout: (fn) => { const id = nextTimer; nextTimer += 1; timers.set(id, fn); return id; },
    clearTimeout: (id) => timers.delete(id),
    navigator: {}
  });
  vm.runInContext(SOURCE, context);

  const submit = () => {
    const e = { target: form, defaultPrevented: false, preventDefault() { this.defaultPrevented = true; } };
    for (const fn of listeners.submit) fn(e);
    return e;
  };
  const runTimers = () => {
    for (const [id, fn] of [...timers]) { timers.delete(id); fn(); }
  };

  return { btn, bar, failed, form, csrf, xhrs, written, windowStub, submit, runTimers };
}

function respond(xhr, status, responseText, responseURL = ACTION) {
  Object.assign(xhr, { status, responseText, responseURL });
  xhr.onload();
}

test('F1: uma falha imediata de rede não deixa o botão desativado para sempre', () => {
  const t = setup();
  t.submit();
  t.xhrs[0].onerror(); // antes do temporizador do envio
  t.runTimers();
  assert.equal(t.btn.disabled, false);
  assert.equal(t.btn.hasAttribute('aria-busy'), false);
  assert.equal(t.failed.classList.contains('is-hidden'), false);
  assert.equal(t.failed.textContent, 'erro de rede');
});

test('F3: o segundo envio é recusado de forma síncrona: 1 só POST', () => {
  const t = setup();
  t.submit();
  assert.equal(t.btn.disabled, true, 'desativado antes de qualquer temporizador');
  const second = t.submit();
  const third = t.submit();
  assert.equal(second.defaultPrevented, true);
  assert.equal(third.defaultPrevented, true);
  assert.equal(t.xhrs.length, 1);
});

test('depois de uma falha, repetir funciona e volta a ser 1 só POST', () => {
  const t = setup();
  t.submit();
  t.xhrs[0].onerror();
  t.submit();
  t.submit();
  assert.equal(t.xhrs.length, 2);
  assert.equal(t.failed.classList.contains('is-hidden'), true, 'o aviso anterior desaparece');
});

test('F2: só a página do formulário com erros (422) substitui o documento', () => {
  const t = setup();
  t.submit();
  respond(t.xhrs[0], 422, FORM_PAGE);
  assert.deepEqual(t.written, ['open', FORM_PAGE, 'close']);
});

for (const status of [413, 500, 502, 504]) {
  test(`F2: resposta ${status} conserva o formulário, com aviso e botão ativo`, () => {
    const t = setup();
    t.submit();
    respond(t.xhrs[0], status, 'FUNCTION_INVOCATION_TIMEOUT');
    assert.deepEqual(t.written, []);
    assert.equal(t.btn.disabled, false);
    assert.equal(t.bar.hidden, true);
    assert.equal(t.failed.classList.contains('is-hidden'), false);
    assert.equal(t.failed.textContent, 'erro do servidor');
  });
}

test('F2: um 422 que não é a nossa página não apaga o formulário', () => {
  const t = setup();
  t.submit();
  respond(t.xhrs[0], 422, '{"error":"gateway"}');
  assert.deepEqual(t.written, []);
  assert.equal(t.btn.disabled, false);
});

test('F2: 403 renova o token sem apagar nada, e o reenvio leva o token novo', () => {
  const t = setup();
  t.submit();
  respond(t.xhrs[0], 403, '<h1>Sesión no válida</h1>');
  assert.deepEqual(t.written, []);

  const renew = t.xhrs[1];
  assert.equal(renew.method, 'GET');
  assert.equal(renew.url, 'http://local.test/r/bar-teste');
  Object.assign(renew, { status: 200, responseText: '<input name="_csrf" value="token-novo">' });
  renew.onload();
  assert.equal(t.csrf.value, 'token-novo');
  assert.equal(t.btn.disabled, false);
  assert.equal(t.failed.textContent, 'sessão renovada');
  t.submit();
  assert.equal(t.xhrs.length, 3);
});

test('F2: se a renovação do token falhar, o formulário continua lá', () => {
  const t = setup();
  t.submit();
  respond(t.xhrs[0], 403, 'x');
  t.xhrs[1].onerror();
  assert.equal(t.btn.disabled, false);
  assert.equal(t.failed.textContent, 'erro do servidor');
  assert.equal(t.csrf.value, 'token-velho');
});

test('redirecionamento (enviado) segue para o URL final', () => {
  const t = setup();
  t.submit();
  respond(t.xhrs[0], 200, 'ok', 'http://local.test/r/bar-teste/enviado');
  assert.equal(t.windowStub.assigned, 'http://local.test/r/bar-teste/enviado');
  assert.deepEqual(t.written, []);
});

for (const event of ['ontimeout', 'onabort']) {
  test(`R3: pedido do token novo sem resposta (${event}) acaba no estado normal de repetir`, () => {
    const t = setup();
    t.submit();
    respond(t.xhrs[0], 403, 'x');
    const renew = t.xhrs[1];
    assert.ok(renew.timeout > 0 && renew.timeout <= 30000, 'tem limite de tempo');
    renew[event]();
    assert.equal(t.btn.disabled, false);
    assert.equal(t.bar.hidden, true);
    assert.equal(t.failed.classList.contains('is-hidden'), false);
    assert.equal(t.failed.textContent, 'erro do servidor');
  });
}

function renewed(t) {
  t.submit();
  respond(t.xhrs[t.xhrs.length - 1], 403, 'x');
  const renew = t.xhrs[t.xhrs.length - 1];
  Object.assign(renew, { status: 200, responseText: '<input name="_csrf" value="token-novo">' });
  renew.onload();
}

test('R4: 403 logo depois de renovar quer dizer cookies recusados, e diz-se isso', () => {
  const t = setup();
  renewed(t);
  assert.equal(t.failed.textContent, 'sessão renovada');
  t.submit();
  const count = t.xhrs.length;
  respond(t.xhrs[count - 1], 403, 'x');
  assert.equal(t.xhrs.length, count, 'não pede outro token');
  assert.equal(t.failed.textContent, 'precisa de cookies');
  assert.equal(t.btn.disabled, false);
  assert.deepEqual(t.written, []);
  t.submit();
  respond(t.xhrs[t.xhrs.length - 1], 403, 'x');
  assert.equal(t.failed.textContent, 'precisa de cookies', 'nunca volta a dizer que renovou');
});

test('R4: uma sessão que caduca horas depois volta a renovar-se', () => {
  const t = setup();
  renewed(t);
  t.form.tokenRenewedAt -= 3 * 60 * 60 * 1000;
  renewed(t);
  assert.equal(t.failed.textContent, 'sessão renovada');
});

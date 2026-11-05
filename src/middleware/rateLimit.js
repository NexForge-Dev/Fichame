'use strict';

const { sha256 } = require('../lib/crypto');

/* Para onde voltar depois de um 429 num formulário. Nas rotas /r/:slug é a
 * página do negócio; nas outras, o caminho do Referer — só o caminho, nunca
 * o host, e nunca «//…» (seria um redirecionamento para outro site). */
function backPath(req) {
  const slug = String((req.params && req.params.slug) || '');
  if (/^[a-z0-9][a-z0-9-]{0,80}$/.test(slug) && /^\/r\//.test(req.originalUrl || req.url || '')) return `/r/${slug}`;
  try {
    const ref = new URL(req.get('referer') || '', 'http://x');
    if (/^\/(?![/\\])/.test(ref.pathname)) return ref.pathname;
  } catch { /* Referer inválido */ }
  return '/';
}

function tooMany(req, res, retry, message) {
  res.set('Retry-After', String(retry));
  if (req.xhr || req.is('application/json')) {
    return res.status(429).send('Demasiadas solicitudes. Inténtalo más tarde.');
  }
  /* Formulário HTML com ficheiro (candidatura com CV): volta à página com a
   * mensagem traduzida (?err=, como os outros erros de /r/:slug) em vez de
   * um texto cru. O multer ainda não leu o corpo, por isso não há o que
   * repor no formulário. */
  if (req.is('multipart/form-data')) {
    const msg = message || 'Demasiadas solicitudes. Inténtalo más tarde.';
    return res.redirect(303, `${backPath(req)}?err=${encodeURIComponent(msg)}`);
  }
  return res.status(429).render('error', {
    status: 429,
    title: 'Demasiadas solicitudes',
    message: message || 'Has hecho demasiadas peticiones. Espera unos minutos y vuelve a intentarlo.'
  });
}

/* Limite em memória, por instância. Barato e sem rede: serve de primeira
 * barreira e de recurso quando a BD falha. Na Vercel cada instância tem o seu
 * contador, por isso as rotas sensíveis usam também dbRateLimit. */
function rateLimit({ windowMs, max, key, message, name = 'global' }) {
  const store = new Map();

  const sweeper = setInterval(() => {
    const now = Date.now();
    for (const [k, e] of store) {
      if (e.resetAt <= now) store.delete(k);
    }
  }, 60 * 1000);
  if (sweeper.unref) sweeper.unref();

  return function limiter(req, res, next) {
    const k = `${name}:${key ? key(req) : (req.ip || 'unknown')}`;
    const now = Date.now();
    let entry = store.get(k);
    if (!entry || entry.resetAt <= now) {
      entry = { count: 0, resetAt: now + windowMs };
      store.set(k, entry);
    }
    entry.count += 1;
    if (entry.count > max) {
      return tooMany(req, res, Math.ceil((entry.resetAt - now) / 1000), message);
    }
    next();
  };
}

/* Como rateLimit, em memória, mas só contam os envios aceites: erros de
 * validação não castigam ninguém.
 *
 * `check` corre antes de ler o corpo (quem está no limite nem envia o ficheiro)
 * e reserva uma vaga: sem isso, 30 envios em paralelo passavam todos. A vaga
 * reservada acaba de uma destas formas, e nenhuma depende de só uma delas:
 *   - hit(): o envio foi aceite e passa a contar, faça o socket o que fizer;
 *   - finish(): a rota terminou sem aceitar, a vaga volta;
 *   - evento close antes de a rota começar (upload cortado, ou recusado por
 *     outro limite). Com a rota a correr o close não conta: o cliente podia
 *     desligar depois de enviar tudo e a candidatura ficava gravada sem contar;
 *   - prazo de reservaMs: rede de segurança se o close não chegar, para que uma
 *     reserva perdida não bloqueie um IP num negócio durante a janela inteira. */
function acceptedLimit({ windowMs, max, key, message, reserveMs = 2 * 60 * 1000, now = Date.now }) {
  const store = new Map();
  const slots = new WeakMap();

  const sweeper = setInterval(() => {
    const t = now();
    for (const [k, e] of store) {
      if (e.resetAt <= t) store.delete(k);
    }
  }, 60 * 1000);
  if (sweeper.unref) sweeper.unref();

  function entryFor(k, t) {
    let entry = store.get(k);
    if (!entry || entry.resetAt <= t) {
      entry = { accepted: 0, reserved: new Set(), resetAt: t + windowMs };
      store.set(k, entry);
    }
    return entry;
  }

  function release(req) {
    const slot = slots.get(req);
    if (!slot) return;
    slot.entry.reserved.delete(slot);
    slots.delete(req);
  }

  return {
    check(req, res, next) {
      const t = now();
      const entry = entryFor(key(req), t);
      for (const slot of entry.reserved) {
        if (slot.expiresAt <= t) entry.reserved.delete(slot);
      }
      if (entry.accepted + entry.reserved.size >= max) {
        return tooMany(req, res, Math.ceil((entry.resetAt - t) / 1000), message);
      }
      const slot = { entry, expiresAt: t + reserveMs, running: false };
      entry.reserved.add(slot);
      slots.set(req, slot);
      res.once('close', () => {
        if (!slot.running) release(req);
      });
      next();
    },
    /* Envolve a rota: a vaga que ela não aceitou volta quando ela termina. */
    finish(handler) {
      return async (req, res) => {
        const slot = slots.get(req);
        if (slot) slot.running = true;
        try {
          await handler(req, res);
        } finally {
          release(req);
        }
      };
    },
    hit(req) {
      release(req);
      entryFor(key(req), now()).accepted += 1;
    }
  };
}

/* Limite partilhado entre instâncias (tabela rate_limit_hits, função atómica
 * rate_limit_hit). A chave guardada é um sha256 — o IP não fica em claro.
 *
 * Se a BD falhar, não bloqueia o pedido (fail-open): o limite em memória
 * continua ativo nessa instância. Um candidato não deve ficar sem poder
 * candidatar-se por causa de uma falha do contador. */
function dbRateLimit({ windowMs, max, key, message, name }) {
  const windowSeconds = Math.max(1, Math.round(windowMs / 1000));
  return async function dbLimiter(req, res, next) {
    const { rpc } = require('../db');
    const config = require('../config');
    /* O prefixo de teste isola cada execução do E2E: os contadores ficam na
     * BD partilhada e duas execuções seguidas não se podem bloquear. */
    const raw = `${config.testPrefix}|${name}|${key ? key(req) : (req.ip || 'unknown')}`;
    try {
      const r = await rpc('rate_limit_hit', { key: sha256(raw), window_seconds: windowSeconds, max }, 'rate limit');
      if (r && r.allowed === false) return tooMany(req, res, r.retry_after || windowSeconds, message);
    } catch (err) {
      console.error('[rate-limit] contador partilhado indisponível:', err.message);
    }
    next();
  };
}

/* Contador partilhado que só sobe quando se chama hit() — por exemplo, só
 * nas tentativas de login falhadas. Um limite que conta TODOS os pedidos
 * deixa qualquer pessoa bloquear a conta de outra só com o email (que é
 * público na página de privacidade do negócio). Fail-open como dbRateLimit. */
function dbFailureLimit({ windowMs, max, key, message, name }) {
  const windowSeconds = Math.max(1, Math.round(windowMs / 1000));
  const keyOf = (req) => {
    const config = require('../config');
    return sha256(`${config.testPrefix}|${name}|${key(req)}`);
  };

  /* Segundos até ao fim da janela se o limite foi atingido; 0 se não. */
  async function retryAfter(req) {
    const { sb } = require('../db');
    try {
      const { data, error } = await sb().from('rate_limit_hits')
        .select('count, window_start').eq('key', keyOf(req)).maybeSingle();
      if (error) throw new Error(error.message);
      if (!data) return 0;
      const resetAt = Date.parse(data.window_start) + windowSeconds * 1000;
      if (resetAt > Date.now() && Number(data.count) >= max) return Math.ceil((resetAt - Date.now()) / 1000);
    } catch (err) {
      console.error('[rate-limit] contador partilhado indisponível:', err.message);
    }
    return 0;
  }

  return {
    /* true se já respondeu 429. */
    async blocked(req, res) {
      const retry = await retryAfter(req);
      if (retry > 0) {
        tooMany(req, res, retry, message);
        return true;
      }
      return false;
    },
    /* Só consulta, sem responder: para quem tem de dar a mesma resposta
     * esteja ou não bloqueado (ex.: /recuperar, sem enumeração de contas). */
    async isBlocked(req) {
      return (await retryAfter(req)) > 0;
    },
    async hit(req) {
      const { rpc } = require('../db');
      try {
        await rpc('rate_limit_hit', { key: keyOf(req), window_seconds: windowSeconds, max }, 'rate limit');
      } catch (err) {
        console.error('[rate-limit] contador partilhado indisponível:', err.message);
      }
    }
  };
}

module.exports = { rateLimit, acceptedLimit, dbRateLimit, dbFailureLimit, backPath };

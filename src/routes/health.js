'use strict';

/* Estado para monitorização (uptime checks):
 *
 *   GET /api/health   (e o alias /health)
 *
 * Responde só com booleanos — nunca valores de configuração, versões,
 * nomes de tabelas nem mensagens de erro — e 200/503 conforme o estado:
 *
 *   config      a configuração passou assertConfig()
 *   db          o Supabase responde (leitura de schema_migrations)
 *   migrations  todas as migrations exigidas pelo código estão registadas
 *
 * Fica antes da sessão (sem cookies). O resultado da BD fica em cache 15 s
 * para que um endpoint público não multiplique pedidos ao Supabase.
 *
 * Se a configuração for recusada (ex.: APP_URL http em produção), a entrada
 * da Vercel (index.js) não sobe a app: sobe configErrorApp(), que responde
 * 503 a tudo e mantém este endpoint a dizer config:false.
 */

const express = require('express');

const CACHE_MS = 15 * 1000;
const DB_TIMEOUT_MS = 3000;

let cached = null;

async function probeDb() {
  const { appliedMigrations, REQUIRED_MIGRATIONS } = require('../db/check');
  const timeout = new Promise((_, reject) => {
    setTimeout(() => reject(new Error('timeout')), DB_TIMEOUT_MS).unref();
  });
  try {
    const applied = await Promise.race([appliedMigrations(), timeout]);
    return { db: true, migrations: REQUIRED_MIGRATIONS.every((v) => applied.includes(v)) };
  } catch {
    return { db: false, migrations: false };
  }
}

async function status() {
  if (cached && Date.now() - cached.at < CACHE_MS) return cached.value;
  const value = { config: true, ...(await probeDb()) };
  value.ok = value.config && value.db && value.migrations;
  cached = { at: Date.now(), value };
  return value;
}

function send(res, body) {
  res.setHeader('Cache-Control', 'no-store');
  res.setHeader('X-Robots-Tag', 'noindex, nofollow');
  res.status(body.ok ? 200 : 503).json(body);
}

const router = express.Router();

router.get(['/api/health', '/health'], async (req, res) => {
  send(res, await status());
});

/* App mínima quando a configuração é recusada: não serve páginas com uma
 * configuração insegura, mas a monitorização vê config:false em vez de um
 * 500 genérico da Vercel. A causa fica nos Runtime Logs (sem segredos). */
function configErrorApp() {
  const app = express();
  app.set('x-powered-by', false);
  app.get(['/api/health', '/health'], (req, res) => {
    send(res, { ok: false, config: false, db: false, migrations: false });
  });
  app.use((req, res) => {
    res.setHeader('Cache-Control', 'no-store');
    res.status(503).type('text/plain').send('Fíchame no está disponible temporalmente. Inténtalo más tarde.');
  });
  return app;
}

module.exports = { router, configErrorApp, _resetCache: () => { cached = null; } };

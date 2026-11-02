'use strict';

/* Entrada para a Vercel (preset Express).
 *
 * A Vercel procura app.js, index.js, server.js e só depois src/*, e espera
 * que o ficheiro exporte a app Express. Sem este ficheiro escolhia
 * src/app.js, que exporta a fábrica { createApp } e não uma app.
 *
 * Localmente continua a usar-se `npm start` (src/server.js), que também
 * verifica o schema do Supabase no arranque. Aqui essa verificação fica de
 * fora para não pesar em cada arranque a frio; usar `npm run check`.
 *
 * Se faltar configuração ou for insegura, assertConfig() lança o erro com a
 * lista do que falta — aparece nos Runtime Logs da Vercel. A app continua a
 * NÃO servir páginas nesse caso: sobe só configErrorApp() (503 em tudo e
 * /api/health com config:false), para a monitorização ver a causa.
 */

/* Não remover: a Vercel só aceita como entrada um ficheiro cujo código
 * contenha require('express') (procura isto por regex em @vercel/express).
 * Sem esta linha ignorava este ficheiro e voltava a escolher src/app.js. */
require('express');

const config = require('./src/config');
const { createApp } = require('./src/app');
const { configErrorApp } = require('./src/routes/health');

let app;
try {
  config.assertConfig();
  app = createApp();
} catch (err) {
  console.error(`[config] Arranque recusado: ${err.message}`);
  app = configErrorApp();
}

module.exports = app;

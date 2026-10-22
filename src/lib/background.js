'use strict';

/* Trabalho que não deve atrasar a resposta (emails, logs, marcadores).
 *
 * Na Vercel a função pode ser congelada logo depois de a resposta sair, e
 * uma promessa sem await fica a meio: o email ao dono não chega, o log
 * perde-se. waitUntil() pede à Vercel que espere por ela. Fora da Vercel
 * (npm start, testes) é um no-op e a promessa corre normalmente. */

let waitUntil = null;
try {
  ({ waitUntil } = require('@vercel/functions'));
} catch (err) {
  waitUntil = null;
}

function background(promise, label = 'background') {
  const p = Promise.resolve(promise).catch((err) => console.error(`[${label}]`, err && err.message));
  if (waitUntil) {
    try { waitUntil(p); } catch (err) { /* sem contexto de pedido: segue sem esperar */ }
  }
  return p;
}

module.exports = { background };

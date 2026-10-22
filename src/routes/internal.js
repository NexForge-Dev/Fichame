'use strict';

/* Endpoint de manutenção para o agendador (ex.: Vercel Cron).
 *
 *   GET /internal/cleanup     Authorization: Bearer <CRON_SECRET>
 *   GET /internal/retention   Authorization: Bearer <CRON_SECRET>
 *
 * /internal/cleanup só faz a limpeza técnica (sessões, tokens, logs, erros,
 * reportes resolvidos, CVs órfãos): corre todos os dias pelo Vercel Cron
 * (vercel.json) e precisa apenas de CRON_SECRET.
 *
 * /internal/retention (supressão de candidaturas) fica desativado (404) se
 * CRON_SECRET não estiver definido ou se RETENTION_AUTO
 * não for 1: a supressão automática só deve ser ligada depois de os prazos
 * terem sido validados juridicamente. Não usa sessão nem cookies; a
 * comparação do segredo é em tempo constante. Não devolve dados pessoais.
 */

const express = require('express');

const { safeEqual } = require('../lib/crypto');
const { runRetention, runCleanup } = require('../lib/retention');

const router = express.Router();

function cronAuthorized(req) {
  const secret = process.env.CRON_SECRET || '';
  if (!secret || secret.length < 32) return false;
  return safeEqual(String(req.get('authorization') || ''), `Bearer ${secret}`);
}

router.get('/internal/cleanup', async (req, res) => {
  if (!cronAuthorized(req)) return res.status(404).end();
  try {
    const report = await runCleanup({ apply: true });
    res.json({
      ok: true,
      purge: report.purge,
      errorEvents: report.errorEvents,
      problemReports: report.problemReports,
      orphans: report.orphans
    });
  } catch (err) {
    console.error('[cleanup] falhou:', err.message);
    res.status(500).json({ ok: false });
  }
});

router.get('/internal/retention', async (req, res) => {
  if (process.env.RETENTION_AUTO !== '1' || !cronAuthorized(req)) return res.status(404).end();

  try {
    const report = await runRetention({ apply: true });
    res.json({
      ok: true,
      applications: report.applications,
      cvsRemoved: report.cvsRemoved,
      orphans: report.orphans
    });
  } catch (err) {
    console.error('[retention] falhou:', err.message);
    res.status(500).json({ ok: false });
  }
});

module.exports = router;

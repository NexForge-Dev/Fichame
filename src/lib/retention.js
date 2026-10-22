'use strict';

/* Retenção e limpeza (art. 5.1.e RGPD — limitação do prazo de conservação).
 *
 * Regra (fonte única: função SQL recompute_retention, migration 0005):
 *   ativa (nuevo…entrevista) → última atividade + retention_inactive_days
 *   fechada (rechazado/contratado, ou reserva sem consentimento)
 *                            → closed_at + retention_closed_days
 *   consentimento de futuras oportunidades ativo
 *                            → no mínimo concessão + retention_reserve_days
 * Os prazos são de CADA restaurante: a retenção nunca é global.
 * legal_hold = true impede a supressão (obrigação legal, reclamação…).
 *
 * Os prazos por omissão (90/180/365 dias) são VALORES TÉCNICOS PROVISÓRIOS.
 * REQUIERE REVISIÓN JURÍDICA (docs/legal/00-legal-review-required.md), em
 * particular quanto ao bloqueio do art. 32 LOPDGDD.
 *
 * Ordem: primeiro a BD (numa transação, dentro de apply_retention), depois o
 * Storage. Se a remoção de um ficheiro falhar, fica um objeto órfão sem
 * referência — nunca uma referência para um ficheiro que já não existe — e a
 * deteção de órfãos (findOrphanCvs) apanha-o na execução seguinte.
 *
 * Supressão, não «anonimização»: apagar a linha é a única forma de garantir
 * que o candidato deixa de ser identificável a partir destes dados. Ver
 * docs/legal/06-data-subject-rights.md sobre o que fica (logs técnicos com
 * ids internos, backups).
 */

const config = require('../config');
const { sb, rpc, logSecurity } = require('../db');
const storage = require('./storage');

const SECURITY_LOG_DAYS = parseInt(process.env.SECURITY_LOG_DAYS || '365', 10);
const RIGHTS_REQUEST_DAYS = parseInt(process.env.RIGHTS_REQUEST_DAYS || '1095', 10);
/* Erros do servidor e reportes resolvidos (0009): dados técnicos e de
 * suporte, sem razão para ficarem mais tempo. */
const ERROR_EVENT_DAYS = parseInt(process.env.ERROR_EVENT_DAYS || '90', 10);
const REPORT_DAYS = parseInt(process.env.REPORT_DAYS || '365', 10);

/* Conta (e, com apply, apaga) as linhas anteriores ao prazo. `column` é a
 * data a partir da qual o prazo conta (um reporte resolvido conta desde a
 * resolução, não desde que foi criado). */
async function purgeOlderThan(table, days, apply, extra = (q) => q, column = 'created_at') {
  const cutoff = new Date(Date.now() - days * 86400000).toISOString();
  const { count: n, error } = await extra(sb().from(table).select('id', { count: 'exact', head: true }).lt(column, cutoff));
  if (error) throw new Error(`Supabase: contar ${table} — ${error.message}`);
  if (apply && n > 0) {
    const { error: e2 } = await extra(sb().from(table).delete().lt(column, cutoff));
    if (e2) throw new Error(`Supabase: apagar ${table} — ${e2.message}`);
  }
  return n || 0;
}

/* Objetos no bucket de CVs sem linha em `cvs`. Só considera órfãos os que
 * têm mais de `minAgeMs` (um upload em curso ainda não tem a linha). */
async function findOrphanCvs({ minAgeMs = 24 * 60 * 60 * 1000 } = {}) {
  const bucket = sb().storage.from(storage.BUCKET_CVS);
  const orphans = [];
  const now = Date.now();

  /* As pastas (uma por negócio) também vêm paginadas: sem isto, os negócios
   * para lá dos primeiros 1000 nunca eram verificados. */
  const folders = [];
  for (let offset = 0; ; offset += 1000) {
    const { data, error } = await bucket.list('r', { limit: 1000, offset });
    if (error) throw new Error(`Storage: listar pastas — ${error.message}`);
    folders.push(...(data || []));
    if (!data || data.length < 1000) break;
  }

  for (const folder of folders) {
    if (!/^\d+$/.test(folder.name)) continue;
    let offset = 0;
    for (;;) {
      const { data: files, error: e2 } = await bucket.list(`r/${folder.name}`, { limit: 1000, offset });
      if (e2) throw new Error(`Storage: listar r/${folder.name} — ${e2.message}`);
      if (!files || files.length === 0) break;

      const paths = files.map((f) => `r/${folder.name}/${f.name}`);
      const { data: known, error: e3 } = await sb().from('cvs').select('storage_path').in('storage_path', paths);
      if (e3) throw new Error(`Supabase: cvs conhecidos — ${e3.message}`);
      const set = new Set((known || []).map((k) => k.storage_path));

      for (const f of files) {
        const p = `r/${folder.name}/${f.name}`;
        const created = Date.parse(f.created_at || f.updated_at || 0) || 0;
        if (!set.has(p) && now - created > minAgeMs) orphans.push(p);
      }
      if (files.length < 1000) break;
      offset += files.length;
    }
  }
  return orphans;
}

/* Limpeza técnica: sessões e tokens expirados, limites de pedidos, logs,
 * erros do servidor, reportes resolvidos e CVs órfãos. Não toca em
 * candidaturas, por isso pode correr todos os dias mesmo com a supressão
 * automática desligada (RETENTION_AUTO=0). */
async function runCleanup({ apply = false, log = () => {} } = {}, report = { apply, startedAt: new Date().toISOString() }) {
  const purge = await rpc('purge_expired', {
    dry_run: !apply,
    security_log_days: SECURITY_LOG_DAYS,
    rights_request_days: RIGHTS_REQUEST_DAYS
  }, 'limpeza técnica');
  report.purge = purge;
  log(`sessões expiradas: ${purge.sessions} · tokens de senha: ${purge.password_resets} · ` +
      `rate limit: ${purge.rate_limits} · logs > ${SECURITY_LOG_DAYS} d: ${purge.security_logs} · ` +
      `pedidos de direitos fechados > ${RIGHTS_REQUEST_DAYS} d: ${purge.rights_requests}`);

  report.errorEvents = await purgeOlderThan('error_events', ERROR_EVENT_DAYS, apply);
  report.problemReports = await purgeOlderThan('problem_reports', REPORT_DAYS, apply,
    (q) => q.eq('status', 'resuelto'), 'updated_at');
  log(`erros do servidor > ${ERROR_EVENT_DAYS} d: ${report.errorEvents} · reportes resolvidos > ${REPORT_DAYS} d: ${report.problemReports}`);

  const orphans = await findOrphanCvs();
  report.orphans = orphans.length;
  log(`CVs órfãos no Storage (> 24 h, sem candidatura): ${orphans.length}`);
  if (apply && orphans.length > 0) {
    await storage.removeCv(orphans);
    log('CVs órfãos removidos.');
  }
  return report;
}

/* Executa a política. apply=false → só relatório (nada é alterado). */
async function runRetention({ apply = false, log = () => {} } = {}) {
  config.assertConfig();
  const report = { apply, startedAt: new Date().toISOString() };

  const ret = await rpc('apply_retention', { dry_run: !apply, limit: 1000 }, 'retenção');
  report.applications = ret.applications;
  report.candidates = ret.candidates || 0;
  report.byRestaurant = ret.by_restaurant || {};
  log(`candidaturas com prazo vencido: ${ret.applications}`);

  if (apply && ret.paths && ret.paths.length > 0) {
    await storage.removeCv(ret.paths);
    log(`CVs removidos do Storage: ${ret.paths.length}`);
  }
  report.cvsRemoved = apply ? (ret.paths || []).length : 0;

  await runCleanup({ apply, log }, report);
  const { purge } = report;

  /* Registo técnico SEM dados pessoais: só contagens por restaurante. */
  if (apply) {
    await logSecurity('retencion_aplicada',
      `apps=${report.applications} cands=${report.candidates} cvs=${report.cvsRemoved} orfaos=${report.orphans}`,
      '', { metadata: { by_restaurant: report.byRestaurant, purge } });
  }

  return report;
}

module.exports = { runRetention, runCleanup, findOrphanCvs, SECURITY_LOG_DAYS, RIGHTS_REQUEST_DAYS, ERROR_EVENT_DAYS, REPORT_DAYS };

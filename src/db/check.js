'use strict';

/* Verificação do estado do Supabase.
 *
 * Usado no arranque do servidor e disponível como `npm run check` para
 * diagnosticar um ambiente novo sem precisar de abrir o painel.
 */

const config = require('../config');
const { sb, many } = require('../db');
const storage = require('../lib/storage');

const REQUIRED_MIGRATIONS = [
  '0001_init', '0002_views_rpc', '0003_storage', '0004_notifications_cascade', '0005_privacy_hardening',
  '0006_tenant_fk_cleanup', '0007_google_login', '0008_onboarding_steps', '0009_problem_reports', '0010_terms_acceptances',
  '0011_password_help_requests', '0012_review_fixes', '0013_launch_fixes', '0014_billing',
  '0015_retention_lock', '0016_problem_reports_length'
];

/* As views e funções de que o código depende. Sem isto, uma migration
 * esquecida só daria erro no primeiro pedido que a usasse. */
const REQUIRED_VIEWS = [
  'session_context',
  'application_list',
  'application_status_counts',
  'restaurant_metrics',
  'job_list',
  'platform_metrics',
  'admin_restaurant_list',
  'admin_user_list'
];

async function appliedMigrations() {
  const rows = await many(
    sb().from('schema_migrations').select('version'),
    'versões do schema'
  );
  return rows.map((r) => r.version);
}

async function assertSchema() {
  let applied;

  try {
    applied = await appliedMigrations();
  } catch (err) {
    throw new Error(
      `Não foi possível ler o schema do Supabase.\n${err.message}\n\n` +
      'Confirma que:\n' +
      '  1. SUPABASE_URL e SUPABASE_SERVICE_ROLE_KEY no .env estão corretos;\n' +
      '  2. aplicaste migrations/0001_init.sql no SQL Editor do Supabase.'
    );
  }

  const missing = REQUIRED_MIGRATIONS.filter((v) => !applied.includes(v));
  if (missing.length > 0) {
    throw new Error(
      `Migrations em falta: ${missing.join(', ')}.\n` +
      'Aplica os ficheiros correspondentes de migrations/ no SQL Editor do Supabase,\n' +
      'por ordem numérica.'
    );
  }

  /* Uma view em falta significa que 0002 foi aplicado a meio ou que o
   * PostgREST ainda não recarregou o schema. */
  const brokenViews = [];
  for (const view of REQUIRED_VIEWS) {
    const { error } = await sb().from(view).select('*').limit(0);
    if (error) brokenViews.push(`${view} (${error.message})`);
  }

  if (brokenViews.length > 0) {
    throw new Error(
      `Views inacessíveis:\n  ${brokenViews.join('\n  ')}\n\n` +
      'Reaplica migrations/0002_views_rpc.sql. Se as views existem mas dão erro,\n' +
      "corre `notify pgrst, 'reload schema';` no SQL Editor."
    );
  }

  await storage.assertBuckets();

  return true;
}

/* Autodiagnóstico de segurança da BD (função security_self_check, 0005):
 * tabelas sem RLS, tabelas concedidas a anon/authenticated, funções SECURITY
 * DEFINER e buckets públicos. Qualquer item é um PRODUCTION BLOCKER
 * (docs/security/production-compliance-gate.md). */
async function securityProblems() {
  const { rpc } = require('./index');
  const r = await rpc('security_self_check', {}, 'autodiagnóstico');
  const problems = [];
  if (r.tables_without_rls.length) problems.push(`tabelas sem RLS: ${r.tables_without_rls.join(', ')}`);
  if (r.tables_granted_to_anon_or_authenticated.length) {
    problems.push(`tabelas/views acessíveis a anon/authenticated: ${r.tables_granted_to_anon_or_authenticated.join(', ')}`);
  }
  if (r.security_definer_functions.length) problems.push(`funções SECURITY DEFINER: ${r.security_definer_functions.join(', ')}`);
  if (r.public_buckets.length) problems.push(`buckets públicos: ${r.public_buckets.join(', ')}`);
  return problems;
}

/* `npm run check` */
async function main() {
  console.log('');
  console.log('  Fíchame — verificação do Supabase');
  console.log('  ------------------------------');

  try {
    config.assertConfig();
    console.log(`  ✓ .env   ${config.supabase.url}`);
  } catch (err) {
    console.error(`  ✗ .env\n\n  ${String(err.message).split('\n').join('\n  ')}\n`);
    process.exit(1);
  }

  try {
    const applied = await appliedMigrations();
    console.log(`  ✓ schema  migrations aplicadas: ${applied.sort().join(', ') || 'nenhuma'}`);
  } catch (err) {
    console.error(`  ✗ schema\n\n  ${String(err.message).split('\n').join('\n  ')}\n`);
    process.exit(1);
  }

  try {
    await assertSchema();
    console.log('  ✓ views   todas acessíveis');
    console.log(`  ✓ storage ${config.supabase.bucketCvs} e ${config.supabase.bucketMedia} privados`);
  } catch (err) {
    console.error(`  ✗ ${String(err.message).split('\n').join('\n  ')}\n`);
    process.exit(1);
  }

  const problems = await securityProblems();
  if (problems.length > 0) {
    console.error('  ✗ segurança da BD (PRODUCTION BLOCKER):');
    for (const p of problems) console.error(`      - ${p}`);
    process.exit(1);
  }
  console.log('  ✓ segurança  RLS em todas as tabelas, nada concedido a anon, sem SECURITY DEFINER');

  if (!config.cookieSecure) console.log('  ! COOKIE_SECURE=0 — tem de ser 1 em produção (HTTPS, HSTS, cookie __Host-)');
  if (!config.smtp.host) console.log('  ! SMTP não configurado — sem avisos por email; recuperação de senha manual em /admin/usuarios');
  if (/\.vercel\.app$/i.test(config.appUrl)) console.log('  ! APP_URL é um domínio *.vercel.app — os QR impressos ficam presos a ele');
  const { operatorComplete } = require('../lib/legal');
  if (!operatorComplete()) console.log('  ! OPERATOR_* incompleto — páginas legais sem a identificação do titular');
  if (!require('../lib/retention').autoRetentionEnabled()) console.log('  ! RETENTION_AUTO desligado — as candidaturas vencidas só se apagam à mão, a partir do painel');

  console.log('');
  console.log('  Tudo pronto.');
  console.log('');
}

module.exports = { assertSchema, appliedMigrations, securityProblems, REQUIRED_MIGRATIONS };

if (require.main === module) main();

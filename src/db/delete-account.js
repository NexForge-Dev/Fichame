'use strict';

/* Fecho de conta de um estabelecimento — CLI, nunca por HTTP.
 *
 *   npm run delete-account -- --id <restaurant_id> --slug <slug>            simulação
 *   npm run delete-account -- --id <restaurant_id> --slug <slug> --aplicar  executa
 *
 * Apaga, numa transação, o restaurante, os seus utilizadores e sessões, vagas,
 * candidatos, candidaturas, CVs (linhas), notas, histórico, consentimentos,
 * notificações e pedidos de direitos; depois remove os ficheiros do Storage.
 * Recusa se alguma candidatura tiver legal_hold.
 *
 * Os security_logs ficam (com restaurant_id a null) até à sua própria
 * retenção. Backups: ver docs/legal/06-data-subject-rights.md.
 *
 * ANTES DE EXECUTAR: confirmar a política contratual (devolução vs.
 * supressão, art. 28.3.g RGPD) com o estabelecimento — REQUIERE REVISIÓN
 * JURÍDICA (docs/legal/00-legal-review-required.md).
 */

const config = require('../config');
const { rpc, logSecurity } = require('./index');
const storage = require('../lib/storage');
const analytics = require('../lib/analytics');

const args = process.argv.slice(2);
const val = (flag) => { const i = args.indexOf(flag); return i === -1 ? '' : String(args[i + 1] || ''); };
const id = parseInt(val('--id'), 10);
const slug = val('--slug');
const apply = args.includes('--aplicar');

async function main() {
  config.assertConfig();
  if (!Number.isInteger(id) || !slug) {
    console.error('\n  Uso: npm run delete-account -- --id <id> --slug <slug> [--aplicar]\n');
    process.exit(1);
  }

  /* Assinatura Stripe em vigor (0014): apagar o negócio não a cancela, e a
   * Stripe continuaria a cobrar. Cancelar primeiro no painel da Stripe (ou
   * pelo portal do cliente) e só depois fechar a conta. */
  const { sb, one } = require('./index');
  const sub = await one(sb().from('restaurants').select('subscription_status').eq('id', id), 'assinatura');
  if (sub && require('../lib/billing').isLive(sub.subscription_status) && !args.includes('--forzar')) {
    console.error(`\n  Recusado: o negócio tem uma assinatura Stripe em vigor (${sub.subscription_status}).` +
      '\n  Cancela-a primeiro na Stripe (Customers → assinatura → Cancel) ou usa --forzar.\n');
    process.exit(1);
  }

  const res = await rpc('delete_restaurant_account', { restaurant_id: id, confirm_slug: slug, dry_run: !apply });
  if (!res.ok) {
    console.error(`\n  Recusado: ${res.reason}${res.held ? ` (${res.held} candidatura(s) com bloqueio legal)` : ''}\n`);
    process.exit(1);
  }

  if (res.dry_run) {
    console.log(`\n  SIMULAÇÃO: apagaria ${res.applications} candidatura(s), ${res.cvs} CV(s) e ${res.media} imagem(ns).`);
    console.log('  Corre com --aplicar para executar.\n');
    return;
  }

  await storage.removeCv(res.paths);
  await storage.removeImage(res.media);
  await analytics.accountDeleted(id);
  await logSecurity('cuenta_eliminada', `rid=${id} apps=${res.applications} cvs=${res.paths.length}`, '', {});
  console.log(`\n  Conta ${id} eliminada: ${res.applications} candidatura(s), ${res.paths.length} CV(s).\n`);
}

main().catch((err) => {
  console.error(`  ${err.message}`);
  process.exit(1);
});

'use strict';

const config = require('./config');
const { createApp } = require('./app');
const { assertSchema } = require('./db/check');

/* Verifica a ligação ao Supabase antes de aceitar pedidos: é melhor falhar no
 * arranque com uma mensagem clara do que servir páginas de erro 500. */
async function main() {
  try {
    config.assertConfig();
    await assertSchema();
  } catch (err) {
    console.error('');
    console.error('  Não foi possível arrancar o Fíchame:');
    console.error('');
    console.error(`  ${String(err.message).split('\n').join('\n  ')}`);
    console.error('');
    process.exit(1);
  }

  const app = createApp();

  app.listen(config.port, () => {
    console.log('');
    console.log('  Fíchame — Reclutamiento con QR');
    console.log('  ----------------------------');
    console.log(`  Painel (dono):   ${config.appUrl}/login`);
    console.log(`  Registro:        ${config.appUrl}/registro`);
    console.log(`  Admin:           ${config.appUrl}/admin`);
    console.log(`  Privacidade:     ${config.appUrl}/privacidad`);
    console.log(`  Supabase:        ${config.supabase.url}`);
    console.log(`  Buckets:         ${config.supabase.bucketCvs} (privado), ${config.supabase.bucketMedia} (privado)`);
    console.log(`  SMTP:            ${config.smtp.host ? config.smtp.host : 'não configurado (emails em log)'}`);
    console.log('');
  });
}

process.on('uncaughtException', (err) => {
  console.error('[uncaught]', err);
});

process.on('unhandledRejection', (err) => {
  console.error('[unhandled]', err);
});

main();

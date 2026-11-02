'use strict';

const config = require('./config');
const { createApp } = require('./app');
const { assertSchema } = require('./db/check');

/* Porta ocupada ou sem permissão: mensagem clara e saída com erro (1), para
 * que quem arranca (terminal, `node --watch`, supervisor) veja que falhou. */
function listenFailed(err) {
  console.error('');
  if (err && err.code === 'EADDRINUSE') {
    console.error(`  Não foi possível arrancar o Fíchame: a porta ${config.port} já está em uso.`);
    console.error('  Fecha o outro processo que a usa ou define outra porta com PORT no .env.');
  } else if (err && err.code === 'EACCES') {
    console.error(`  Não foi possível arrancar o Fíchame: sem permissão para usar a porta ${config.port}.`);
  } else {
    console.error(`  Não foi possível arrancar o Fíchame na porta ${config.port}: ${err && err.message}`);
  }
  console.error('');
  process.exit(1);
}

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

  /* No Express 5 o callback recebe o erro do listen (porta ocupada, sem
   * permissão…). Sem isto imprimia o banner de «arrancado» e saía com 0. */
  app.listen(config.port, (err) => {
    if (err) return listenFailed(err);
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

'use strict';

const fs = require('fs');
const path = require('path');

const root = path.join(__dirname, '..');

// Carrega .env (se existir) sem dependências externas. Não sobrescreve variáveis já definidas.
(function loadEnv() {
  try {
    const envPath = path.join(root, '.env');
    if (!fs.existsSync(envPath)) return;
    for (const line of fs.readFileSync(envPath, 'utf8').split(/\r?\n/)) {
      const m = line.match(/^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)\s*$/);
      if (!m || line.trim().startsWith('#')) continue;
      let value = m[2];
      if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
        value = value.slice(1, -1);
      }
      if (process.env[m[1]] === undefined) process.env[m[1]] = value;
    }
  } catch { /* ignora .env inválido */ }
})();

const port = parseInt(process.env.PORT || '3000', 10);

/* Na Vercel o HTTPS e o proxy existem sempre: COOKIE_SECURE e TRUST_PROXY
 * ficam ligados por omissão (só um 0 explícito os desliga), e sem APP_URL
 * usa-se o domínio de produção do projeto. */
const onVercel = process.env.VERCEL === '1';
const flag = (name, fallback) => (process.env[name] === undefined || process.env[name] === ''
  ? fallback
  : process.env[name] === '1');
const vercelUrl = process.env.VERCEL_PROJECT_PRODUCTION_URL
  ? `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}`
  : '';

/* A Vercel recusa pedidos com mais de 4,5 MB antes de chegarem à app (uma
 * página de erro crua, e o candidato perde o formulário). Com o overhead do
 * multipart, 4 MB é o máximo seguro para o CV. */
const VERCEL_MAX_UPLOAD_MB = 4;
const maxCvMb = parseInt(process.env.MAX_CV_MB || '4', 10);

/* A chave secreta aceita os dois nomes: SUPABASE_SERVICE_ROLE_KEY (nome
 * histórico, §28) e SUPABASE_SECRET_KEY (nome novo no painel do Supabase). */
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SECRET_KEY || '';

/* Stripe (cobrança da assinatura, Checkout alojado). A chave publicável não
 * é precisa: o pagamento acontece todo em checkout.stripe.com.
 *
 * A cobrança só fica ligada com a chave secreta E o segredo do webhook: sem
 * o webhook o pagamento entrava na Stripe e o painel nunca sabia.
 *
 * Em produção uma chave sk_test_ é recusada (cobrança desligada) salvo com
 * STRIPE_ALLOW_TEST=1 — protege contra copiar o .env de testes para a
 * Vercel. Os valores nunca são impressos. */
const stripeSecretKey = String(process.env.STRIPE_SECRET_KEY || '').trim();
const stripeWebhookSecret = String(process.env.STRIPE_WEBHOOK_SECRET || '').trim();
const stripeTestKey = stripeSecretKey.startsWith('sk_test_') || stripeSecretKey.startsWith('rk_test_');
const stripeTestRefused = process.env.VERCEL_ENV === 'production' && stripeTestKey &&
  process.env.STRIPE_ALLOW_TEST !== '1';
/* O inverso: uma chave real (sk_live_) num deploy de pré-visualização ou de
 * desenvolvimento da Vercel cobraria dinheiro a sério a partir de código
 * ainda não publicado. Recusada salvo STRIPE_ALLOW_LIVE=1. */
const stripeLiveKey = stripeSecretKey.startsWith('sk_live_') || stripeSecretKey.startsWith('rk_live_');
const stripeLiveRefused = ['preview', 'development'].includes(process.env.VERCEL_ENV) && stripeLiveKey &&
  process.env.STRIPE_ALLOW_LIVE !== '1';
const stripeRefused = stripeTestRefused || stripeLiveRefused;

const config = {
  port,
  appUrl: (process.env.APP_URL || vercelUrl || `http://localhost:${port}`).replace(/\/+$/, ''),
  onVercel,

  /* Email de suporte e contacto, mostrado em /conoce, nos termos e na página
   * de erro. CONTACT_EMAIL sobrepõe-se ao valor por omissão. */
  contactEmail: (process.env.CONTACT_EMAIL || 'nexforge.d4v29@gmail.com').trim(),

  supabase: {
    url: (process.env.SUPABASE_URL || '').replace(/\/+$/, ''),
    anonKey: process.env.SUPABASE_ANON_KEY || process.env.SUPABASE_PUBLISHABLE_KEY || '',
    serviceRoleKey,
    bucketCvs: process.env.SUPABASE_BUCKET_CVS || 'cvs',
    bucketMedia: process.env.SUPABASE_BUCKET_MEDIA || 'media'
  },

  /* Prefixo de isolamento usado pelos testes E2E: quando definido, os dados
   * criados ficam marcados e são removidos no fim da execução. Vazio em uso real. */
  testPrefix: process.env.EZCV_TEST_PREFIX || '',

  sessionTtlMs: (parseInt(process.env.SESSION_TTL_DAYS || '30', 10)) * 24 * 60 * 60 * 1000,
  maxUploadBytes: (onVercel ? Math.min(maxCvMb, VERCEL_MAX_UPLOAD_MB) : maxCvMb) * 1024 * 1024,
  maxImageBytes: parseInt(process.env.MAX_IMAGE_MB || '2', 10) * 1024 * 1024,
  cookieSecure: flag('COOKIE_SECURE', onVercel),
  trustProxy: flag('TRUST_PROXY', onVercel),

  /* Login com Google (opcional). Sem os dois valores o botão não aparece. */
  google: {
    clientId: process.env.GOOGLE_CLIENT_ID || '',
    clientSecret: process.env.GOOGLE_CLIENT_SECRET || ''
  },

  /* Painel NexForge (métricas internas, opcional). Sem as três variáveis não envia nada. */
  analytics: {
    endpoint: (process.env.NEXFORGE_ENDPOINT || '').trim(),
    ingestKey: (process.env.NEXFORGE_INGEST_KEY || '').trim(),
    pseudonymSecret: process.env.NEXFORGE_PSEUDONYM_SECRET || ''
  },

  stripe: {
    secretKey: stripeRefused ? '' : stripeSecretKey,
    webhookSecret: stripeWebhookSecret,
    testMode: stripeTestKey,
    testRefused: stripeTestRefused,
    liveRefused: stripeLiveRefused,
    /* Configuração do Customer Portal só do Fíchame (bpc_…), opcional. */
    portalConfigurationId: String(process.env.STRIPE_PORTAL_CONFIGURATION_ID || '').trim(),
    /* 1 = Stripe Tax calcula o IVA (exige registo do IVA espanhol no
     * painel da Stripe). 0 = taxa fixa STRIPE_TAX_RATE_ID, se houver. */
    automaticTax: process.env.STRIPE_AUTOMATIC_TAX === '1',
    taxRateId: String(process.env.STRIPE_TAX_RATE_ID || '').trim()
  },
  billingEnabled: Boolean(stripeSecretKey && stripeWebhookSecret && !stripeRefused),

  smtp: {
    host: process.env.SMTP_HOST || '',
    port: parseInt(process.env.SMTP_PORT || '587', 10),
    secure: process.env.SMTP_SECURE === '1',
    user: process.env.SMTP_USER || '',
    pass: process.env.SMTP_PASS || '',
    from: process.env.SMTP_FROM || 'no-reply@fichame.local'
  }
};

/* Falha cedo e com uma mensagem útil se o Supabase não estiver configurado.
 * Nunca imprime o valor das chaves (§28). */
let warned = false;

function assertConfig() {
  const missing = [];
  if (!config.supabase.url) missing.push('SUPABASE_URL');
  if (!config.supabase.serviceRoleKey) missing.push('SUPABASE_SERVICE_ROLE_KEY');

  if (missing.length > 0) {
    throw new Error(
      `Configuração do Supabase incompleta. Falta definir no .env: ${missing.join(', ')}.\n` +
      'Copia .env.example para .env e preenche com os valores de\n' +
      'Supabase → Project Settings → API.'
    );
  }

  if (!/^https:\/\/[a-z0-9-]+\.supabase\.(co|in)$/.test(config.supabase.url) &&
      !/^http:\/\/(127\.0\.0\.1|localhost)(:\d+)?$/.test(config.supabase.url)) {
    throw new Error(
      `SUPABASE_URL não parece válido: ${config.supabase.url}\n` +
      'Esperado https://<project-ref>.supabase.co'
    );
  }

  if (config.supabase.anonKey && config.supabase.anonKey === config.supabase.serviceRoleKey) {
    throw new Error('SUPABASE_ANON_KEY e SUPABASE_SERVICE_ROLE_KEY são iguais. Confirma as chaves no painel.');
  }

  /* Inteiros: um valor como SESSION_TTL_DAYS=abc dava NaN em silêncio. */
  const badInt = ['PORT', 'SESSION_TTL_DAYS', 'MAX_CV_MB', 'MAX_IMAGE_MB', 'SMTP_PORT']
    .filter((name) => process.env[name] && !/^[1-9]\d*$/.test(process.env[name].trim()));
  if (badInt.length > 0) {
    throw new Error(`Valor inválido (esperado inteiro positivo) em: ${badInt.join(', ')}.`);
  }

  /* Em produção na Vercel, APP_URL vai parar aos QR, aos links partilhados e
   * aos emails: um http:// ou localhost é um erro que não se pode deixar passar. */
  if (process.env.VERCEL_ENV === 'production' && !/^https:\/\/(?!localhost|127\.)/.test(config.appUrl)) {
    throw new Error(`APP_URL tem de ser https em produção (atual: ${config.appUrl}).`);
  }
  /* Os avisos só saem uma vez: assertConfig() corre no arranque e outra vez
   * ao criar o cliente do Supabase (db/index.js). */
  if (warned) return;
  warned = true;

  /* Em produção, avisos (não bloqueiam o arranque) para o que falta e só se
   * notaria mais tarde: páginas legais com marcadores e limpeza diária parada. */
  if (process.env.VERCEL_ENV === 'production') {
    const missingProd = ['OPERATOR_LEGAL_NAME', 'OPERATOR_NIF', 'OPERATOR_ADDRESS', 'OPERATOR_PRIVACY_EMAIL']
      .filter((name) => !String(process.env[name] || '').trim());
    if (missingProd.length > 0) {
      console.warn(`[config] Páginas legais com marcadores: falta definir ${missingProd.join(', ')}.`);
    }
    if (String(process.env.CRON_SECRET || '').length < 32) {
      console.warn('[config] CRON_SECRET em falta ou com menos de 32 caracteres: a limpeza diária (/internal/cleanup) não corre.');
    }
  }
  /* Login com Google mal configurado: o botão fica escondido (lib/google.js)
   * em vez de aparecer e falhar depois do clique. */
  const googleProblem = require('./lib/google').configProblem();
  if (googleProblem) {
    console.warn(`[config] Login com Google desativado: ${googleProblem}.`);
  }
  /* Stripe: um único aviso, sem nunca mostrar a chave. */
  if (config.stripe.testRefused) {
    console.warn('[config] Cobrança desativada: STRIPE_SECRET_KEY é uma chave de teste em produção (define STRIPE_ALLOW_TEST=1 para a aceitar).');
  } else if (config.stripe.liveRefused) {
    console.warn('[config] Cobrança desativada: STRIPE_SECRET_KEY é uma chave real fora de produção (define STRIPE_ALLOW_LIVE=1 para a aceitar).');
  } else if (config.billingEnabled && config.stripe.testMode && process.env.VERCEL_ENV === 'production') {
    console.warn('[config] Stripe em modo de teste em produção (STRIPE_ALLOW_TEST=1): nenhum pagamento é real.');
  } else if (Boolean(stripeSecretKey) !== Boolean(stripeWebhookSecret)) {
    console.warn('[config] Cobrança desativada: definir STRIPE_SECRET_KEY e STRIPE_WEBHOOK_SECRET (as duas).');
  }
  if (config.billingEnabled && !config.stripe.automaticTax && !config.stripe.taxRateId) {
    console.warn('[config] Sem STRIPE_AUTOMATIC_TAX=1 nem STRIPE_TAX_RATE_ID: o Checkout cobra os preços sem IVA.');
  }
  if (onVercel && maxCvMb > VERCEL_MAX_UPLOAD_MB) {
    console.warn(`[config] MAX_CV_MB=${maxCvMb} acima do limite de pedidos da Vercel (4,5 MB): usa-se ${VERCEL_MAX_UPLOAD_MB}.`);
  }
  if (onVercel && (!config.cookieSecure || !config.trustProxy)) {
    console.warn('[config] Na Vercel, COOKIE_SECURE e TRUST_PROXY devem ser 1.');
  }

  if (!config.cookieSecure && config.appUrl.startsWith('https://')) {
    console.warn('[config] APP_URL é https mas COOKIE_SECURE=0. Define COOKIE_SECURE=1 em produção.');
  }
}

module.exports = config;
module.exports.assertConfig = assertConfig;

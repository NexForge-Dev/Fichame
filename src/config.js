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

const config = {
  port,
  appUrl: (process.env.APP_URL || vercelUrl || `http://localhost:${port}`).replace(/\/+$/, ''),
  onVercel,

  /* Email de contacto mostrado na página de apresentação (/conoce), para
   * receber opiniões durante a prova de mercado. Opcional. */
  contactEmail: (process.env.CONTACT_EMAIL || '').trim(),

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

  /* Em produção na Vercel, APP_URL vai parar às etiquetas NFC, aos QR e aos
   * emails: um http:// ou localhost é um erro que não se pode deixar passar. */
  if (process.env.VERCEL_ENV === 'production' && !/^https:\/\/(?!localhost|127\.)/.test(config.appUrl)) {
    throw new Error(`APP_URL tem de ser https em produção (atual: ${config.appUrl}).`);
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

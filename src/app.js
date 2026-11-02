'use strict';

const express = require('express');
const path = require('path');
const fs = require('fs');
const crypto = require('crypto');

const config = require('./config');
const { loadSession } = require('./middleware/session');
const { csrfProtection } = require('./middleware/csrf');
const { rateLimit } = require('./middleware/rateLimit');
const { STATUSES, AVAILABILITIES, DOC_TYPES, ESTABLISHMENT_TYPES, CONTRACT_TYPES, WORK_SCHEDULES, statusLabel, availabilityLabel, docTypeLabel, historyLabel } = require('./lib/statuses');
const { icon, initials } = require('./lib/icons');
const { newRef, recordError } = require('./lib/errors');
const { background } = require('./lib/background');
const { i18n, setLanguageRoute, translate, LANGS, LANG_NAMES } = require('./lib/i18n');
const pricing = require('./lib/pricing');

/* O PostgREST devolve timestamptz como ISO 8601 com fuso ("…+00:00"), que o
 * Date do JS lê diretamente. O ramo que acrescenta 'Z' cobre valores sem
 * fuso, e o instanceof cobre um Date já construído. */
function parseDbDate(value) {
  if (!value) return null;
  if (value instanceof Date) return Number.isNaN(value.getTime()) ? null : value;

  const normalized = String(value).replace(' ', 'T');
  const d = new Date(/Z|[+-]\d{2}:\d{2}$/.test(normalized) ? normalized : normalized + 'Z');
  return Number.isNaN(d.getTime()) ? null : d;
}

/* Datas sempre na hora de Espanha peninsular. Na Vercel o servidor corre em
 * UTC: sem fixar o fuso, uma candidatura às 00:30 aparecia no dia anterior e
 * «Hoy»/«Ayer» mudavam à hora errada. */
const MADRID_DAY = new Intl.DateTimeFormat('en-CA', {
  timeZone: 'Europe/Madrid', year: 'numeric', month: '2-digit', day: '2-digit'
});

function madridDay(d) {
  return MADRID_DAY.format(d); // «2026-10-06»
}

function fmtDate(value) {
  const d = parseDbDate(value);
  if (!d) return String(value || '');
  const [y, m, day] = madridDay(d).split('-');
  return `${day}/${m}/${y}`;
}

function fmtRelative(value) {
  const d = parseDbDate(value);
  if (!d) return '';
  const days = Math.round((Date.parse(madridDay(new Date())) - Date.parse(madridDay(d))) / 86400000);
  if (days === 0) return 'Hoy';
  if (days === 1) return 'Ayer';
  return fmtDate(value);
}

/* «1 candidatura» / «3 candidaturas» — em vez de «candidatura(s)». */
function plural(n, one, many) {
  return `${n} ${Number(n) === 1 ? one : many}`;
}

function fmtSize(bytes) {
  const n = Number(bytes) || 0;
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  return `${(n / (1024 * 1024)).toFixed(1)} MB`;
}

/* Versão dos assets: hash do conteúdo de style.css e app.js.
 *
 * Os ficheiros estáticos são servidos com cache longa, o que é correto para
 * desempenho mas faz o browser manter o CSS antigo depois de um deploy — e
 * HTML novo com CSS antigo é uma página sem estilos. Juntar o hash ao URL
 * (`style.css?v=abc123`) resolve: o URL muda quando o conteúdo muda, e o
 * browser pede o ficheiro novo sem precisar de recarregamento forçado.
 */
function assetVersion() {
  const files = [
    path.join(__dirname, '..', 'public', 'css', 'style.css'),
    path.join(__dirname, '..', 'public', 'js', 'app.js'),
    path.join(__dirname, '..', 'public', 'img', 'logo.svg')
  ];

  const hash = crypto.createHash('sha1');
  for (const file of files) {
    try {
      hash.update(fs.readFileSync(file));
    } catch {
      /* Ficheiro em falta: o hash fica diferente, o que é o comportamento
       * desejado — não vale a pena falhar o arranque por isto. */
      hash.update(file);
    }
  }
  return hash.digest('hex').slice(0, 10);
}

function createApp() {
  const app = express();
  /* Um salto (o proxy da Vercel), não `true`: com `true` o Express confia
   * em todo o X-Forwarded-For e o IP dos limites de pedidos falsifica-se. */
  app.set('trust proxy', config.trustProxy ? 1 : false);
  app.set('view engine', 'ejs');
  app.set('views', path.join(__dirname, 'views'));
  app.set('x-powered-by', false);

  /* Em produção (COOKIE_SECURE=1 e TRUST_PROXY=1) um pedido HTTP é
   * redirecionado para HTTPS. Só com os dois: sem TRUST_PROXY o Express não
   * sabe que o proxy terminou TLS e redirecionaria em ciclo. */
  if (config.cookieSecure && config.trustProxy) {
    app.use((req, res, next) => {
      if (req.secure) return next();
      if (!['GET', 'HEAD'].includes(req.method)) return res.status(400).send('HTTPS requerido.');
      return res.redirect(308, `https://${req.get('host')}${req.originalUrl}`);
    });
  }

  app.use((req, res, next) => {
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('X-Frame-Options', 'DENY');
    res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
    res.setHeader('Permissions-Policy',
      'camera=(), microphone=(), geolocation=(), payment=(), usb=(), interest-cohort=(), browsing-topics=()');
    res.setHeader('Cross-Origin-Opener-Policy', 'same-origin');
    res.setHeader('Cross-Origin-Resource-Policy', 'same-origin');
    /* CSP sem 'unsafe-inline' nem domínios externos: não há scripts, estilos,
     * fontes, analytics nem pixels de terceiros (ver /cookies). img data: é
     * usado por ícones em CSS. */
    res.setHeader('Content-Security-Policy',
      "default-src 'self'; img-src 'self' data:; style-src 'self'; script-src 'self'; " +
      "font-src 'self'; connect-src 'self'; object-src 'none'; frame-ancestors 'none'; " +
      "base-uri 'self'; form-action 'self'" + (config.cookieSecure ? '; upgrade-insecure-requests' : ''));
    if (config.cookieSecure) {
      /* Só com HTTPS confirmado: HSTS num ambiente sem TLS bloquearia o site. */
      res.setHeader('Strict-Transport-Security', 'max-age=31536000; includeSubDomains');
    }
    next();
  });

  /* Indexação: só a landing, a apresentação (/conoce) e as páginas legais e públicas de cada negócio
   * podem aparecer em buscadores. Painel, admin, autenticação, confirmações e
   * formulários de direitos ficam fora (X-Robots-Tag + robots.txt). Nenhuma
   * página contém dados de candidatos sem sessão. */
  app.get('/robots.txt', (req, res) => {
    res.type('text/plain').setHeader('Cache-Control', 'public, max-age=3600');
    res.send([
      'User-agent: *',
      'Disallow: /panel',
      'Disallow: /admin',
      'Disallow: /login',
      'Disallow: /registro',
      'Disallow: /recuperar',
      'Disallow: /internal',
      'Disallow: /r/*/enviado',
      'Disallow: /r/*/derechos',
      ''
    ].join('\n'));
  });

  /* Os ficheiros estáticos vêm antes da sessão de propósito: carregar a sessão
   * custa agora uma ida à rede até ao Supabase, e um CSS não precisa de
   * sessão nem de CSRF. Deixá-los depois multiplicaria essa latência por cada
   * asset da página.
   *
   * A cache é longa porque os URLs levam o hash do conteúdo (ver
   * assetVersion): quando o CSS muda, muda o URL. */
  app.use(express.static(path.join(__dirname, '..', 'public'), {
    maxAge: '30d',
    etag: true
  }));

  /* Tudo o que vem depois dos estáticos é dinâmico e pode conter dados
   * pessoais: sem cache em browser, proxy ou CDN. Rotas que servem conteúdo
   * público (imagens do negócio) substituem este cabeçalho. */
  app.use((req, res, next) => {
    res.setHeader('Cache-Control', 'no-store');
    const indexable = req.path === '/' || req.path === '/conoce' || /^\/(privacidad|cookies|terminos|aviso-legal|encargo)$/.test(req.path) ||
      /^\/r\/[a-z0-9-]+\/?$/.test(req.path);
    if (!indexable) res.setHeader('X-Robots-Tag', 'noindex, nofollow');
    next();
  });

  /* Retenção automática (Vercel Cron ou outro agendador). Antes da sessão: não
   * usa cookies. Desativada sem CRON_SECRET. */
  app.use('/', require('./routes/internal'));
  /* /api/health para monitorização: só booleanos, sem sessão. */
  app.use('/', require('./routes/health').router);

  app.use(loadSession);
  app.use((req, res, next) => {
    res.locals.csrfToken = req.session ? req.session.csrfToken : '';
    res.locals.path = req.path || '';
    /* Preços (fonte única: src/lib/pricing.js) e email de suporte, para
     * qualquer view. */
    res.locals.pricing = pricing;
    res.locals.supportEmail = config.contactEmail;
    next();
  });
  /* Idioma da interface (src/lib/i18n.js). Depois de app.locals estar
   * preenchido: os helpers traduzidos chamam os originais. */
  app.use(i18n);
  app.use(express.urlencoded({ extended: false, limit: '100kb' }));
  app.use(express.json({ limit: '50kb' }));
  /* No Express 5 um POST sem corpo deixa req.body undefined, e as rotas leem
   * req.body.x diretamente (o token CSRF também pode vir num cabeçalho). */
  app.use((req, res, next) => { if (req.body === undefined) req.body = {}; next(); });
  app.use(csrfProtection);
  app.use(rateLimit({
    windowMs: 15 * 60 * 1000,
    max: 3000,
    name: 'global',
    message: 'Demasiadas solicitudes. Espera unos minutos.'
  }));

  app.locals.STATUSES = STATUSES;
  app.locals.AVAILABILITIES = AVAILABILITIES;
  app.locals.DOC_TYPES = DOC_TYPES;
  app.locals.ESTABLISHMENT_TYPES = ESTABLISHMENT_TYPES;
  app.locals.CONTRACT_TYPES = CONTRACT_TYPES;
  app.locals.WORK_SCHEDULES = WORK_SCHEDULES;
  app.locals.statusLabel = statusLabel;
  app.locals.availabilityLabel = availabilityLabel;
  app.locals.docTypeLabel = docTypeLabel;
  app.locals.historyLabel = historyLabel;
  app.locals.fmtDate = fmtDate;
  app.locals.fmtRelative = fmtRelative;
  app.locals.plural = plural;
  app.locals.fmtSize = fmtSize;
  app.locals.icon = icon;
  app.locals.initials = initials;
  app.locals.maxUploadMb = Math.round(config.maxUploadBytes / (1024 * 1024));
  /* URLs absolutos nas tags og: (pré-visualização ao partilhar no WhatsApp). */
  app.locals.appUrl = config.appUrl;
  app.locals.maxImgMb = Math.round(config.maxImageBytes / (1024 * 1024));
  app.locals.assetV = assetVersion();
  /* Valores por omissão para páginas renderizadas antes do middleware de
   * idioma (ex.: erro ao carregar a sessão): espanhol, sem tradução. */
  app.locals.lang = 'es';
  app.locals.LANGS = LANGS;
  app.locals.LANG_NAMES = LANG_NAMES;
  app.locals.tr = (text, vars) => translate('es', text, vars);

  app.get('/idioma/:lang', setLanguageRoute);
  app.use('/', require('./routes/legal'));
  app.use('/', require('./routes/presentation'));
  app.use('/', require('./routes/public'));
  app.use('/', require('./routes/auth'));
  app.use('/', require('./routes/panel'));
  app.use('/', require('./routes/admin'));

  /* Só nos testes E2E (EZCV_TEST_PREFIX): um erro real para validar o registo
   * em error_events, a redação de dados e a página com o código. */
  if (config.testPrefix) {
    app.get('/__test/erro', () => {
      throw new Error('Falha de teste para ana.teste@example.com 600 123 456');
    });
  }

  app.use((req, res) => {
    res.status(404).render('error', {
      status: 404, title: 'Página no encontrada', message: 'La página que buscas no existe.'
    });
  });

  /* Erro inesperado: fica em error_events com um código curto que a página
   * mostra. O dono do negócio pode reportá-lo dali, já com o código; o admin
   * vê os dois ligados em /admin/reportes. Erros 4xx do body-parser (corpo
   * grande demais, JSON inválido) não são falhas do servidor e não ficam
   * registados. */
  app.use((err, req, res, _next) => {
    const serverFault = !(err && err.status >= 400 && err.status < 500);
    const ref = serverFault ? newRef() : '';
    console.error(ref ? `[erro ${ref}]` : '[erro]', err);
    /* Na Vercel a função pode congelar logo após a resposta: sem waitUntil o
     * registo perdia-se e a referência mostrada não existia em /admin. */
    if (serverFault) background(recordError(err, req, ref), 'error-events');
    if (res.headersSent) return;
    const status = serverFault ? 500 : err.status;
    res.status(status).render('error', {
      status,
      title: serverFault ? 'Error interno' : 'Solicitud no válida',
      message: serverFault ? 'Algo salió mal. Inténtalo de nuevo.' : 'No hemos podido procesar la solicitud. Revisa los datos e inténtalo de nuevo.',
      errorRef: ref,
      canReport: Boolean(req.user && req.user.role === 'owner'),
      fromPath: req.path || ''
    });
  });

  return app;
}

module.exports = { createApp };

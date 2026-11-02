'use strict';

/* Idiomas da interface: espanhol (original), inglês e português.
 *
 * Estilo gettext: o texto espanhol que está nas views É a chave. As
 * traduções vivem em src/locales/*.js, cada ficheiro um objeto
 *   { 'Texto en español': { en: 'English text', pt: 'Texto em português' } }
 * Um texto sem tradução aparece em espanhol — nunca uma chave técnica.
 * Variáveis entre chavetas: tr('Hola, {name}', { name }).
 *
 * O idioma vem do cookie (só existe se a pessoa escolheu um idioma no
 * seletor) ou, sem ele, da primeira língua do browser.
 *
 * Os textos legais (privacidade, termos, consentimentos) NÃO se traduzem
 * aqui: a versão oficial é a espanhola (ver docs/legal/).
 */

const fs = require('fs');
const path = require('path');

const config = require('../config');
const statuses = require('./statuses');
const { stripFlash } = require('./flash');

const LANGS = ['es', 'en', 'pt'];
const LANG_NAMES = { es: 'Español', en: 'English', pt: 'Português' };
const COOKIE = 'fichame_lang';

const DICT = {};
const LOCALES_DIR = path.join(__dirname, '..', 'locales');
for (const file of fs.readdirSync(LOCALES_DIR).filter((f) => f.endsWith('.js')).sort()) {
  Object.assign(DICT, require(path.join(LOCALES_DIR, file)));
}

function translate(lang, text, vars) {
  let out = text == null ? '' : String(text);
  if (lang !== 'es') {
    const entry = DICT[out];
    if (entry && entry[lang]) out = entry[lang];
  }
  if (vars) out = out.replace(/\{(\w+)\}/g, (m, k) => (vars[k] == null ? m : String(vars[k])));
  return out;
}

function fromAcceptLanguage(header) {
  for (const part of String(header || '').split(',')) {
    const code = part.trim().slice(0, 2).toLowerCase();
    if (LANGS.includes(code)) return code;
  }
  return 'es';
}

function resolveLang(req) {
  const c = req.cookies && req.cookies[COOKIE];
  if (LANGS.includes(c)) return c;
  return fromAcceptLanguage(req.headers['accept-language']);
}

/* Cópias traduzidas das listas de opções (selects e etiquetas), uma por idioma. */
function mapValues(obj, fn) {
  return Object.fromEntries(Object.entries(obj).map(([k, v]) => [k, fn(v)]));
}
const LISTS = {};
for (const lang of LANGS) {
  const tr = (s) => translate(lang, s);
  LISTS[lang] = {
    STATUSES: mapValues(statuses.STATUSES, (v) => ({ ...v, label: tr(v.label) })),
    AVAILABILITIES: mapValues(statuses.AVAILABILITIES, tr),
    DOC_TYPES: mapValues(statuses.DOC_TYPES, tr),
    ESTABLISHMENT_TYPES: mapValues(statuses.ESTABLISHMENT_TYPES, tr),
    CONTRACT_TYPES: mapValues(statuses.CONTRACT_TYPES, tr),
    WORK_SCHEDULES: mapValues(statuses.WORK_SCHEDULES, tr)
  };
}

/* Middleware: põe `lang` e `tr` nas views e no pedido, e substitui os
 * helpers de app.locals que devolvem texto pelas versões traduzidas. */
function i18n(req, res, next) {
  const lang = resolveLang(req);
  const tr = (text, vars) => translate(lang, text, vars);
  const app = req.app.locals;

  req.lang = lang;
  req.tr = tr;
  Object.assign(res.locals, LISTS[lang], {
    lang,
    tr,
    LANGS,
    LANG_NAMES,
    statusLabel: (k) => tr(app.statusLabel(k)),
    availabilityLabel: (k) => tr(app.availabilityLabel(k)),
    docTypeLabel: (k) => tr(app.docTypeLabel(k)),
    historyLabel: (k) => tr(app.historyLabel(k)),
    fmtRelative: (v) => tr(app.fmtRelative(v)),
    plural: (n, one, many) => `${n} ${tr(Number(n) === 1 ? one : many)}`
  });
  next();
}

/* GET /idioma/:lang?next=/caminho — guarda a escolha e volta à página.
 * `next` só aceita caminhos locais (nada de //host nem esquemas). */
function setLanguageRoute(req, res) {
  const lang = LANGS.includes(req.params.lang) ? req.params.lang : 'es';
  res.cookie(COOKIE, lang, {
    httpOnly: true,
    sameSite: 'lax',
    secure: config.cookieSecure,
    path: '/',
    maxAge: 365 * 24 * 60 * 60 * 1000
  });
  const next = String(req.query.next || '/');
  /* Sem ok/err: o servidor assinaria uma mensagem escolhida por quem fez o
   * link (ver src/lib/flash.js). */
  res.redirect(/^\/(?![/\\])[^\s]*$/.test(next) ? stripFlash(next) : '/');
}

module.exports = { LANGS, LANG_NAMES, COOKIE, translate, resolveLang, i18n, setLanguageRoute };

'use strict';

/* Ícones SVG inline, expostos às views como `icon('home')`.
 *
 * Inline e não ficheiros: são poucos, evitam um pedido HTTP por ícone, e
 * herdam a cor do texto através de `currentColor` — o que faz o estado ativo
 * da navegação funcionar sem precisar de duas versões de cada imagem.
 *
 * Expostos via app.locals porque o EJS não partilha funções entre includes.
 * Nas views usar `<%- icon('home') %>` (sem escape: é marcação, não dados).
 */

const PATHS = {
  home:
    '<path d="M3 10.5 12 3l9 7.5"/>' +
    '<path d="M5 9.5V20a1 1 0 0 0 1 1h12a1 1 0 0 0 1-1V9.5"/>' +
    '<path d="M9.5 21v-6h5v6"/>',

  people:
    '<circle cx="9" cy="8" r="3.2"/>' +
    '<path d="M2.5 20a6.5 6.5 0 0 1 13 0"/>' +
    '<path d="M16 5.2a3.2 3.2 0 0 1 0 5.9"/>' +
    '<path d="M17.8 14.4A6.5 6.5 0 0 1 21.5 20"/>',

  jobs:
    '<rect x="2.8" y="7" width="18.4" height="13" rx="2"/>' +
    '<path d="M8.5 7V5.2A1.7 1.7 0 0 1 10.2 3.5h3.6A1.7 1.7 0 0 1 15.5 5.2V7"/>' +
    '<path d="M2.8 12.5h18.4"/>',

  bell:
    '<path d="M18 8.6a6 6 0 1 0-12 0c0 5-2.2 6.4-2.2 6.4h16.4S18 13.6 18 8.6"/>' +
    '<path d="M13.7 19a2 2 0 0 1-3.4 0"/>',

  store:
    '<path d="M3.5 9.5 5 4h14l1.5 5.5"/>' +
    '<path d="M4.5 9.5h15V20a1 1 0 0 1-1 1h-13a1 1 0 0 1-1-1z"/>' +
    '<path d="M3.5 9.5a2.6 2.6 0 0 0 5.2 0 2.6 2.6 0 0 0 5.2 0 2.6 2.6 0 0 0 5.2 0"/>' +
    '<path d="M9.5 21v-5.5h5V21"/>',

  cog:
    '<circle cx="12" cy="12" r="3.1"/>' +
    '<path d="M12 2.5a1.5 1.5 0 0 1 1.5 1.5v.6a1.5 1.5 0 0 0 2.2 1.1l.4-.2a1.5 1.5 0 0 1 2 .6l.3.5a1.5 1.5 0 0 1-.5 2l-.5.3a1.5 1.5 0 0 0 0 2.6l.5.3a1.5 1.5 0 0 1 .5 2l-.3.5a1.5 1.5 0 0 1-2 .6l-.4-.2a1.5 1.5 0 0 0-2.2 1.1v.6a1.5 1.5 0 0 1-1.5 1.5h-.6a1.5 1.5 0 0 1-1.5-1.5v-.5a1.5 1.5 0 0 0-2.2-1.2l-.4.2a1.5 1.5 0 0 1-2-.6l-.3-.5a1.5 1.5 0 0 1 .5-2l.5-.3a1.5 1.5 0 0 0 0-2.6l-.5-.3a1.5 1.5 0 0 1-.5-2l.3-.5a1.5 1.5 0 0 1 2-.6l.4.2A1.5 1.5 0 0 0 9.9 4.6V4a1.5 1.5 0 0 1 1.5-1.5z"/>',

  chart:
    '<path d="M3 3v16.5a1.5 1.5 0 0 0 1.5 1.5H21"/>' +
    '<path d="M7.5 15.5V11"/>' +
    '<path d="M12 15.5V7"/>' +
    '<path d="M16.5 15.5v-6"/>',

  shield:
    '<path d="M12 3 4.5 6v6c0 4.6 3.1 7.9 7.5 9 4.4-1.1 7.5-4.4 7.5-9V6z"/>' +
    '<path d="m9.2 12 2 2 3.6-3.8"/>',

  /* --- Usados na landing page --- */
  file:
    '<path d="M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8z"/>' +
    '<path d="M14 3v5h5"/>' +
    '<path d="M9 13h6"/>' +
    '<path d="M9 17h4"/>',

  pause:
    '<circle cx="12" cy="12" r="9"/>' +
    '<path d="M10 9v6"/>' +
    '<path d="M14 9v6"/>',

  qr:
    '<rect x="3.5" y="3.5" width="6" height="6" rx="1"/>' +
    '<rect x="14.5" y="3.5" width="6" height="6" rx="1"/>' +
    '<rect x="3.5" y="14.5" width="6" height="6" rx="1"/>' +
    '<path d="M14.5 14.5h2.5v2.5"/>' +
    '<path d="M20.5 14.5v.01"/>' +
    '<path d="M14.5 20.5h.01"/>' +
    '<path d="M17.5 20.5h3v-3"/>',

  search:
    '<circle cx="11" cy="11" r="6.5"/>' +
    '<path d="m20 20-4.2-4.2"/>',

  chat:
    '<path d="M20.5 11.5a8 8 0 0 1-11.7 7.1L3.5 20l1.4-5A8 8 0 1 1 20.5 11.5z"/>' +
    '<path d="M8.5 11.5h.01"/>' +
    '<path d="M12.5 11.5h.01"/>' +
    '<path d="M16.5 11.5h.01"/>',

  mail:
    '<rect x="3" y="5" width="18" height="14" rx="2"/>' +
    '<path d="m3.5 6.5 8.5 6.5 8.5-6.5"/>',

  star:
    '<path d="m12 3.5 2.6 5.3 5.9.9-4.3 4.1 1 5.8L12 16.9l-5.2 2.7 1-5.8-4.3-4.1 5.9-.9z"/>',

  lock:
    '<rect x="4.5" y="10.5" width="15" height="10" rx="2"/>' +
    '<path d="M8 10.5V7.5a4 4 0 0 1 8 0v3"/>',

  check:
    '<path d="m5 12.5 4.5 4.5L19 7.5"/>',

  phone:
    '<rect x="6.5" y="2.5" width="11" height="19" rx="2.5"/>' +
    '<path d="M11 18.5h2"/>',

  /* Plan y facturación (/panel/plan) */
  card:
    '<rect x="2.5" y="5.5" width="19" height="13" rx="2"/>' +
    '<path d="M2.5 10h19"/>' +
    '<path d="M6.5 15h4"/>',

  /* Interface (setas, ações e avisos) */
  arrowRight: '<path d="M5 12h14"/><path d="m13 6 6 6-6 6"/>',
  arrowLeft: '<path d="M19 12H5"/><path d="m11 6-6 6 6 6"/>',
  chevronDown: '<path d="m6 9.5 6 6 6-6"/>',
  plus: '<path d="M12 5v14"/><path d="M5 12h14"/>',
  info: '<circle cx="12" cy="12" r="9"/><path d="M12 11v5.5"/><path d="M12 7.6v.01"/>',
  alert: '<path d="M10.4 4.2 2.9 17.5A1.8 1.8 0 0 0 4.5 20.2h15a1.8 1.8 0 0 0 1.6-2.7L13.6 4.2a1.8 1.8 0 0 0-3.2 0z"/><path d="M12 9.5v4.5"/><path d="M12 17v.01"/>',
  clock: '<circle cx="12" cy="12" r="9"/><path d="M12 7v5.2l3.4 2"/>',
  folder: '<path d="M3 7.5A2 2 0 0 1 5 5.5h4l2.2 2.5H19a2 2 0 0 1 2 2V18a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/>',
  call: '<path d="M21 16.6v2.7a1.8 1.8 0 0 1-2 1.8 17.8 17.8 0 0 1-7.8-2.8 17.5 17.5 0 0 1-5.4-5.4A17.8 17.8 0 0 1 3 5a1.8 1.8 0 0 1 1.8-2h2.7a1.8 1.8 0 0 1 1.8 1.6c.1.9.3 1.7.6 2.5a1.8 1.8 0 0 1-.4 1.9L8.3 10.2a14.4 14.4 0 0 0 5.5 5.5l1.2-1.2a1.8 1.8 0 0 1 1.9-.4c.8.3 1.6.5 2.5.6a1.8 1.8 0 0 1 1.6 1.9z"/>',
  logout: '<path d="M9.5 20.5H6a2 2 0 0 1-2-2v-13a2 2 0 0 1 2-2h3.5"/><path d="m15.5 16.5 4.5-4.5-4.5-4.5"/><path d="M20 12H9.5"/>',
  external: '<path d="M14 4.5h5.5V10"/><path d="M19.5 4.5 11 13"/><path d="M18.5 14v4.5a2 2 0 0 1-2 2h-11a2 2 0 0 1-2-2v-11a2 2 0 0 1 2-2H10"/>',
  download: '<path d="M12 4v11"/><path d="m7.5 11 4.5 4.5 4.5-4.5"/><path d="M4.5 19.5h15"/>',
  printer: '<path d="M7 8.5V3.5h10v5"/><rect x="3.5" y="8.5" width="17" height="8.5" rx="2"/><path d="M7 14h10v6.5H7z"/>',
  copy: '<rect x="9" y="9" width="11.5" height="11.5" rx="2"/><path d="M5.5 15H5a1.5 1.5 0 0 1-1.5-1.5V5A1.5 1.5 0 0 1 5 3.5h8.5A1.5 1.5 0 0 1 15 5v.5"/>',
  note: '<path d="M4 20h4L19 9a2.1 2.1 0 0 0-3-3L5 17z"/><path d="m14 8 3 3"/>'
};

function icon(name) {
  const body = PATHS[name];
  if (!body) return '';

  return '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" ' +
         'stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" ' +
         'focusable="false">' + body + '</svg>';
}

/* Iniciais do candidato para o avatar: identifica a pessoa numa lista longa
 * sem pedir uma fotografia que não é necessária para o processo. */
function initials(first, last) {
  const a = String(first || '').trim();
  const b = String(last || '').trim();
  const out = (a.charAt(0) + b.charAt(0)).toUpperCase();
  return out || (a.charAt(0) || '?').toUpperCase();
}

module.exports = { icon, initials };

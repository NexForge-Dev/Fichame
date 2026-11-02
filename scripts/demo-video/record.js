'use strict';

/* Gera o vídeo de demonstração do Fíchame (página /conoce).
 *
 * Duas fases:
 *  1. Captura — sobe a aplicação real, cria dados fictícios e grava três
 *     clips com o screencast do Chrome (criar vaga no painel, candidatura no
 *     telemóvel, painel do dono). Cada clip guarda marcadores (instante +
 *     retângulo do elemento) que dizem à câmara do palco onde fazer zoom.
 *  2. Render — stage.html monta os clips dentro de um portátil e de um
 *     telemóvel, com abertura, cartão com o código QR, transições e fecho; é
 *     capturado frame a frame (30 fps) e juntado à música de music.js.
 *
 * As ferramentas não são dependências do projeto. Instalar numa pasta à
 * parte e correr a partir dela (requer Google Chrome instalado):
 *
 *   mkdir %TEMP%\fichame-video && cd %TEMP%\fichame-video
 *   npm i puppeteer-core@24 ffmpeg-static@5
 *   node <projeto>/scripts/demo-video/record.js <projeto> es <projeto>/public/video/fichame-demo.mp4
 *   node <projeto>/scripts/demo-video/record.js <projeto> en <projeto>/public/video/fichame-demo-en.mp4
 *
 * A captura cria dados fictícios no Supabase do .env, marcados com
 * test_prefix e apagados no fim (mesmo se a gravação falhar). Com --reuse
 * salta a captura e volta a renderizar a partir da pasta work-<lang> (para
 * afinar a animação sem tocar na base de dados). PREVIEW=12.5,30 grava só
 * essas imagens em work-<lang>/preview, sem vídeo.
 * DEMO_SITE muda o endereço mostrado no fecho e no QR. */

const path = require('path');
const fs = require('fs');
const crypto = require('crypto');
const { spawn } = require('child_process');
/* Resolvidos a partir da pasta onde o comando corre (ver acima). */
const fromCwd = (m) => require(require.resolve(m, { paths: [process.cwd()] }));
const puppeteer = fromCwd('puppeteer-core');
const ffmpeg = fromCwd('ffmpeg-static');

const ROOT = process.argv[2];
const LANG = process.argv[3] || 'es';
const OUT = process.argv[4];
const CHROME = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
const PORT = 3460 + (LANG === 'en' ? 1 : 0);
const BASE = `http://localhost:${PORT}`;
const P = 'v' + crypto.randomBytes(4).toString('hex');
const WORK = path.join(process.cwd(), 'work-' + LANG);
const REUSE = process.argv.includes('--reuse');
const PREVIEW = (process.env.PREVIEW || '').split(',').filter(Boolean).map(Number);
const SITE = process.env.DEMO_SITE || 'ezcv-flax.vercel.app';
const FPS = 30;
const { pathToFileURL } = require('url');
const { buildAudio, writeWav } = require('./music');

require(path.join(ROOT, 'src', 'config')); // carrega o .env
const { createClient } = require(path.join(ROOT, 'node_modules', '@supabase', 'supabase-js'));
const QRCode = require(path.join(ROOT, 'node_modules', 'qrcode'));
const pricing = require(path.join(ROOT, 'src', 'lib', 'pricing'));

/* Os dados de demonstração ficam em espanhol nas duas versões: a aplicação
 * só existe em espanhol (a /conoce inglesa avisa disso). */
const NOTE = 'Buena actitud. Llamar el jueves para la entrevista.';


const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/* ------------------------------------------------------------------ *
 * Dados de demonstração via HTTP (como o E2E)
 * ------------------------------------------------------------------ */
class Jar {
  constructor() { this.c = {}; }
  store(res) {
    const list = res.headers.getSetCookie ? res.headers.getSetCookie() : [];
    for (const raw of list) {
      const [pair] = raw.split(';');
      const i = pair.indexOf('=');
      this.c[pair.slice(0, i)] = pair.slice(i + 1);
    }
  }
  header() { return Object.entries(this.c).map(([k, v]) => `${k}=${v}`).join('; '); }
}

async function call(method, url, jar, body) {
  const headers = {};
  if (jar && jar.header()) headers.cookie = jar.header();
  const res = await fetch(BASE + url, { method, headers, body, redirect: 'manual' });
  if (jar) jar.store(res);
  return res;
}
const csrfOf = (html) => (String(html).match(/name="_csrf" value="([^"]+)"/) || [])[1] || '';
const form = (o) => { const p = new URLSearchParams(); for (const [k, v] of Object.entries(o)) p.append(k, v); return p; };

/* PDF mínimo mas válido, com uma linha de texto. */
function cvPdf(name) {
  const content = `BT /F1 18 Tf 72 760 Td (${name} - Curriculum) Tj ET`;
  const objs = [
    '<< /Type /Catalog /Pages 2 0 R >>',
    '<< /Type /Pages /Kids [3 0 R] /Count 1 >>',
    '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595 842] /Contents 4 0 R /Resources << /Font << /F1 5 0 R >> >> >>',
    `<< /Length ${content.length} >>\nstream\n${content}\nendstream`,
    '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>'
  ];
  let out = '%PDF-1.4\n';
  const offs = [];
  objs.forEach((o, i) => { offs.push(out.length); out += `${i + 1} 0 obj\n${o}\nendobj\n`; });
  const xref = out.length;
  out += `xref\n0 ${objs.length + 1}\n0000000000 65535 f \n` + offs.map((o) => String(o).padStart(10, '0') + ' 00000 n \n').join('');
  out += `trailer\n<< /Size ${objs.length + 1} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF\n`;
  return Buffer.from(out, 'latin1');
}

async function seed() {
  const owner = new Jar();
  let email = 'carmen@laplaza.example';
  const password = 'Demo-' + crypto.randomBytes(6).toString('hex');
  let res = await call('GET', '/registro', owner);
  const csrf = csrfOf(await res.text());
  const regBody = () => form({
    restaurant_name: 'Restaurante La Plaza', owner_name: 'Carmen Ruiz',
    legal_name: 'La Plaza Hostelería SL', acepto: '1',
    email, telefono: '912345678', direccion: 'Plaza Mayor 3', cp: '28012', ciudad: 'Madrid',
    establecimiento: 'restaurante', commercial_name: 'La Plaza',
    descripcion: 'Cocina de mercado en el centro de Madrid.',
    password, password2: password, _csrf: csrf
  });
  res = await call('POST', '/registro', owner, regBody());
  if (res.status !== 302) {
    email = `carmen.${P}@laplaza.example`;
    res = await call('POST', '/registro', owner, regBody());
  }
  if (res.status !== 302) throw new Error('registo falhou: ' + res.status);

  res = await call('GET', '/panel/vagas', owner);
  let c = csrfOf(await res.text());
  res = await call('POST', '/panel/vagas/crear', owner, form({
    titulo: 'Cocinero/a', descripcion: 'Cocina de mercado, turno de mañana.', requisitos: 'Experiencia en cocina.', _csrf: c
  }));
  if (res.status !== 302) throw new Error('vaga falhou');

  res = await call('GET', '/panel/restaurante', owner);
  const slug = (String(await res.text()).match(/\/r\/([a-z0-9][a-z0-9-]*)/) || [])[1];
  if (!slug) throw new Error('slug não encontrado');

  const people = [
    ['Javier', 'Moreno', 'entrevista', '4 años como cocinero en restaurante de menú.'],
    ['Ana', 'Ruiz', 'contactar', '2 años de ayudante de cocina.'],
    ['Marta', 'Gil', 'revisado', 'Formación en cocina y prácticas en hotel.']
  ];
  for (const [nombre, apellidos, , exp] of people) {
    const pub = new Jar();
    res = await call('GET', `/r/${slug}`, pub);
    const html = await res.text();
    const job = (html.match(/<option value="(\d+)"[^>]*>\s*Cocinero\/a/) || [])[1] || '';
    const fd = new FormData();
    const f = {
      nombre, apellidos, email: `${nombre.toLowerCase()}.${apellidos.toLowerCase()}@example.com`,
      telefono: '6' + String(Math.floor(Math.random() * 1e8)).padStart(8, '0'),
      puesto: job, otro_puesto: '', disponibilidad: 'manana', experiencia: exp, observaciones: '', sitio_web: '', _csrf: csrfOf(html)
    };
    for (const [k, v] of Object.entries(f)) fd.append(k, v);
    fd.append('cv', new Blob([cvPdf(`${nombre} ${apellidos}`)], { type: 'application/pdf' }), `CV_${nombre}_${apellidos}.pdf`);
    res = await call('POST', `/r/${slug}/apply`, pub, fd);
    if (res.status !== 302) throw new Error('candidatura falhou: ' + res.status);
    await sleep(1100); // ordem estável por data
  }

  res = await call('GET', '/panel/candidaturas', owner);
  const list = await res.text();
  for (const [nombre, apellidos, status] of people) {
    const re = new RegExp(`/panel/candidaturas/(\\d+)"[\\s\\S]{0,600}?${nombre} ${apellidos}`);
    const id = (list.match(re) || [])[1];
    if (!id) continue;
    res = await call('GET', `/panel/candidaturas/${id}`, owner);
    c = csrfOf(await res.text());
    await call('POST', `/panel/candidaturas/${id}/estado`, owner, form({ status, _csrf: c }));
  }
  return { email, password, slug };
}

async function cleanup() {
  const sb = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SECRET_KEY,
    { auth: { persistSession: false, autoRefreshToken: false } });
  const { data, error } = await sb.rpc('purge_test_data', { p: { test_prefix: P } });
  if (error) { console.log('  ! limpeza falhou:', error.message); return; }
  const paths = (data && data.paths) || [];
  const media = (data && data.media) || [];
  if (paths.length) await sb.storage.from('cvs').remove(paths);
  if (media.length) await sb.storage.from('media').remove(media);
  console.log(`  limpeza: ${(data && data.restaurants) || 0} estabelecimento(s), ${paths.length} CV(s)`);
}


/* ------------------------------------------------------------------ *
 * Captura: cursor injetado, marcadores e screencast
 * ------------------------------------------------------------------ */
function cursorScript() {
  const ensure = () => {
    if (!document.body || document.getElementById('__cur')) return;
    const cur = document.createElement('div');
    cur.id = '__cur';
    cur.innerHTML = '<svg viewBox="0 0 24 24" width="30" height="30"><path d="M4 2l15 11-6.5 1.2L16 21l-3 1.4-3.6-6.8L4 19.5z" fill="#1c1917" stroke="#fff" stroke-width="1.6" stroke-linejoin="round"/></svg>';
    Object.assign(cur.style, {
      position: 'fixed', width: '30px', height: '30px', marginLeft: '-5px', marginTop: '-3px', zIndex: 2147483647, pointerEvents: 'none',
      transition: 'left .45s cubic-bezier(.4,0,.2,1), top .45s cubic-bezier(.4,0,.2,1), transform .12s',
      filter: 'drop-shadow(0 2px 3px rgba(0,0,0,.3))'
    });
    const pos = JSON.parse(sessionStorage.getItem('__cur') || 'null') || [innerWidth * 0.62, innerHeight * 0.55];
    cur.style.left = pos[0] + 'px';
    cur.style.top = pos[1] + 'px';
    document.body.appendChild(cur);
  };
  window.__ensureCursor = ensure;
  document.addEventListener('DOMContentLoaded', ensure);
}

/* Um clip em gravação: frames em disco + marcadores no mesmo relógio. */
class Rec {
  constructor(page, name) { this.page = page; this.name = name; this.markers = {}; this.clicks = []; this.frames = []; }
  now() { return Date.now() / 1000; }
  async start() {
    this.dir = path.join(WORK, this.name);
    fs.mkdirSync(this.dir, { recursive: true });
    this.cdp = await this.page.target().createCDPSession();
    this.cdp.on('Page.screencastFrame', (f) => {
      const file = path.join(this.dir, `f${String(this.frames.length).padStart(5, '0')}.jpg`);
      fs.writeFileSync(file, Buffer.from(f.data, 'base64'));
      this.frames.push([file, f.metadata.timestamp]);
      this.cdp.send('Page.screencastFrameAck', { sessionId: f.sessionId }).catch(() => {});
    });
    const vp = this.page.viewport();
    await this.cdp.send('Page.startScreencast', { format: 'jpeg', quality: 88,
      maxWidth: vp.width * vp.deviceScaleFactor, maxHeight: vp.height * vp.deviceScaleFactor, everyNthFrame: 1 });
    await sleep(250);
  }
  /* Retângulo (px CSS do viewport) do elemento: seletor, ou {text, sel} = o
   * menor elemento `sel` que contém o texto. */
  async mark(name, target) {
    let rect = null;
    if (target) {
      rect = await this.page.evaluate((tg) => {
        let el;
        if (typeof tg === 'string') el = document.querySelector(tg);
        else {
          const all = [...document.querySelectorAll(tg.sel)].filter((e) => e.textContent.includes(tg.text));
          all.sort((a, b) => a.offsetWidth * a.offsetHeight - b.offsetWidth * b.offsetHeight);
          el = all[0];
        }
        if (!el) return null;
        const r = el.getBoundingClientRect();
        return [r.x, r.y, r.width, r.height];
      }, target);
      if (!rect) console.log(`  ! marcador ${this.name}/${name}: elemento não encontrado`);
    }
    this.markers[name] = { t: this.now(), rect };
  }
  async stop() {
    await sleep(300);
    await this.cdp.send('Page.stopScreencast');
    await this.cdp.detach();
    if (!this.frames.length) throw new Error(`clip ${this.name} sem frames`);
    const t0 = this.frames[0][1];
    const span = this.frames[this.frames.length - 1][1] - t0;
    console.log(`  clip ${this.name}: ${this.frames.length} frames, ${span.toFixed(1)} s (${(this.frames.length / span).toFixed(1)} fps)`);
    const markers = {};
    for (const [k, v] of Object.entries(this.markers)) markers[k] = { t: v.t - t0, rect: v.rect };
    return {
      frames: this.frames.map(([f, ts]) => [pathToFileURL(f).href, ts - t0]),
      markers,
      clicks: this.clicks.map((c) => c - t0)
    };
  }
}

async function moveTo(page, selector) {
  const el = await page.waitForSelector(selector, { visible: true, timeout: 15000 });
  await el.evaluate((e) => e.scrollIntoView({ block: 'center', behavior: 'smooth' }));
  await sleep(550);
  const box = await el.boundingBox();
  const x = box.x + Math.min(box.width / 2, 110), y = box.y + box.height / 2;
  await page.evaluate((x, y) => {
    window.__ensureCursor && window.__ensureCursor();
    const c = document.getElementById('__cur');
    c.style.left = x + 'px'; c.style.top = y + 'px';
    sessionStorage.setItem('__cur', JSON.stringify([x, y]));
  }, x, y);
  await sleep(480);
  return { x, y };
}

async function press(page, rec) {
  if (rec) rec.clicks.push(rec.now());
  await page.evaluate(() => {
    const c = document.getElementById('__cur');
    if (!c) return;
    c.style.transform = 'scale(.8)';
    setTimeout(() => { c.style.transform = 'scale(1)'; }, 130);
  });
  await sleep(140);
}

async function click(page, rec, selector, { nav = false } = {}) {
  const { x, y } = await moveTo(page, selector);
  await press(page, rec);
  if (nav) {
    await Promise.all([page.waitForNavigation({ waitUntil: 'load', timeout: 20000 }), page.mouse.click(x, y)]);
    await page.evaluate(() => window.__ensureCursor && window.__ensureCursor());
  } else {
    await page.mouse.click(x, y);
  }
}

async function type(page, rec, selector, text, delay = 32) {
  await moveTo(page, selector);
  if (rec) await rec.mark('field:' + selector, selector);
  await press(page, rec);
  await page.click(selector);
  await page.keyboard.type(text, { delay });
  await sleep(180);
}

async function selectText(page, rec, selector, label) {
  await moveTo(page, selector);
  if (rec) await rec.mark('field:' + selector, selector);
  await press(page, rec);
  const value = await page.$eval(selector, (s, label) => {
    const o = [...s.options].find((o) => o.textContent.trim().includes(label));
    return o ? o.value : null;
  }, label);
  if (value !== null) await page.select(selector, value);
  await sleep(420);
}

async function capture(demo) {
  const cvFile = path.join(WORK, 'CV_Lucia_Fernandez.pdf');
  fs.writeFileSync(cvFile, cvPdf('Lucia Fernandez'));
  const browser = await puppeteer.launch({
    executablePath: CHROME, headless: true,
    args: ['--hide-scrollbars', '--force-color-profile=srgb', '--lang=es-ES']
  });
  try {
    const desk = await browser.newPage();
    await desk.setBypassCSP(true);
    await desk.emulateMediaFeatures([{ name: 'prefers-color-scheme', value: 'light' }]);
    await desk.setViewport({ width: 1280, height: 800, deviceScaleFactor: 2 });
    await desk.evaluateOnNewDocument(cursorScript);

    /* Sessão iniciada fora da gravação */
    await desk.goto(BASE + '/login', { waitUntil: 'networkidle0' });
    await desk.type('#email', demo.email);
    await desk.type('#password', demo.password);
    await Promise.all([desk.waitForNavigation({ waitUntil: 'load' }), desk.click('form[action="/login"] button[type=submit]')]);

    /* 1. Criar a vaga */
    await desk.goto(BASE + '/panel/vagas', { waitUntil: 'networkidle0' });
    let rec = new Rec(desk, 'vac');
    await rec.start();
    await rec.mark('start');
    await sleep(500);
    await click(desk, rec, '.create-job-summary');
    await sleep(450);
    await rec.mark('form', 'form[action="/panel/vagas/crear"]');
    await type(desk, rec, '#titulo', 'Camarero/a', 55);
    await type(desk, rec, '#descripcion', 'Sala y terraza, fines de semana.', 22);
    await selectText(desk, rec, '#contrato', 'Eventual');
    await selectText(desk, rec, '#jornada', 'parcial');
    await rec.mark('submit');
    await click(desk, rec, 'form[action="/panel/vagas/crear"] button[type=submit]', { nav: true });
    await sleep(250);
    await desk.evaluate(() => {
      const el = [...document.querySelectorAll('.card')].find((c) => c.textContent.includes('Camarero/a') && !c.matches('.create-job'));
      if (el) el.scrollIntoView({ block: 'center', behavior: 'smooth' });
    });
    await sleep(700);
    await rec.mark('created', { text: 'Camarero/a', sel: '.card:not(.create-job)' });
    await sleep(1500);
    await rec.mark('end');
    const vac = await rec.stop();

    /* 2. O candidato, no telemóvel */
    const mob = await browser.newPage();
    await mob.setBypassCSP(true);
    await mob.emulateMediaFeatures([{ name: 'prefers-color-scheme', value: 'light' }]);
    await mob.setViewport({ width: 390, height: 844, deviceScaleFactor: 2, isMobile: true, hasTouch: false });
    await mob.setUserAgent('Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1');
    await mob.evaluateOnNewDocument(cursorScript);
    await mob.goto(BASE + `/r/${demo.slug}`, { waitUntil: 'networkidle0' });
    rec = new Rec(mob, 'mob');
    await rec.start();
    await rec.mark('start');
    await sleep(1500);
    await selectText(mob, rec, '#puesto', 'Camarero');
    await type(mob, rec, '#nombre', 'Lucía', 45);
    await type(mob, rec, '#apellidos', 'Fernández', 40);
    await type(mob, rec, '#email', 'lucia.fernandez@example.com', 18);
    await type(mob, rec, '#telefono', '612345678', 30);
    await selectText(mob, rec, '#disponibilidad', 'Fines');
    await type(mob, rec, '#experiencia', '3 años de camarera en terraza.', 18);
    await moveTo(mob, '.file-pick');
    await press(mob, rec);
    const input = await mob.$('#cv');
    await input.uploadFile(cvFile);
    await input.evaluate((e) => e.dispatchEvent(new Event('change', { bubbles: true })));
    await rec.mark('cv');
    await sleep(900);
    await click(mob, rec, 'form[action$="/apply"] button[type=submit]', { nav: true });
    await sleep(200);
    await rec.mark('sent');
    await sleep(1600);
    await rec.mark('end');
    const mobClip = await rec.stop();
    await mob.close();

    /* 3. De volta ao painel */
    await desk.goto(BASE + '/panel', { waitUntil: 'networkidle0' });
    rec = new Rec(desk, 'panel');
    await rec.start();
    await rec.mark('start');
    await rec.mark('attention', '.card.attention');
    await sleep(1300);
    await rec.mark('stats', '.stats');
    await sleep(900);
    await click(desk, rec, 'a[href="/panel/candidaturas"]', { nav: true });
    await sleep(150);
    await rec.mark('list', { text: 'Lucía', sel: '.app-row' });
    await sleep(1000);
    const href = await desk.evaluate(() => {
      const a = [...document.querySelectorAll('a.app-row')].find((x) => x.textContent.includes('Lucía'));
      return a && a.getAttribute('href');
    });
    await click(desk, rec, `a[href="${href}"]`, { nav: true });
    await sleep(150);
    await rec.mark('ficha', '.card.o-cv');
    await sleep(1300);
    await rec.mark('datos', '.card.o-datos');
    await sleep(1100);
    await type(desk, rec, '#nota', NOTE, 24);
    await click(desk, rec, 'form[action$="/notas"] button[type=submit]', { nav: true });
    await desk.evaluate(() => {
      const c = document.querySelector('.card.o-notas');
      if (c) c.scrollIntoView({ block: 'center', behavior: 'smooth' });
    });
    await sleep(700);
    await rec.mark('noteSaved', '.card.o-notas');
    await sleep(1200);
    await desk.evaluate(() => window.scrollTo({ top: 0, behavior: 'smooth' }));
    await sleep(700);
    await selectText(desk, rec, 'select[name="status"]', 'Entrevista');
    await click(desk, rec, 'form[action$="/estado"] button[type=submit]', { nav: true });
    await sleep(150);
    await rec.mark('estadoOk', '.flash.ok');
    await sleep(1500);
    await click(desk, rec, 'a[href="/panel/candidaturas"]', { nav: true });
    await sleep(150);
    await rec.mark('pipeline', '.pipeline');
    await sleep(1400);
    await rec.mark('list2', { text: 'Lucía', sel: '.app-row' });
    await sleep(1600);
    await rec.mark('end');
    const panel = await rec.stop();

    return { vac, mob: mobClip, panel };
  } finally {
    await browser.close().catch(() => {});
  }
}

/* ------------------------------------------------------------------ *
 * Render: palco frame a frame + música
 * ------------------------------------------------------------------ */
async function render(clips) {
  const logoSvg = fs.readFileSync(path.join(ROOT, 'public', 'img', 'logo.svg'), 'utf8')
    .replace('<svg', '<svg width="100%" height="100%"');
  const qrSvg = await QRCode.toString(`https://${SITE}/conoce`, { errorCorrectionLevel: 'M', margin: 1, type: 'svg', color: { dark: '#1c1917', light: '#ffffff' } });

  const browser = await puppeteer.launch({
    executablePath: CHROME, headless: true,
    args: ['--hide-scrollbars', '--force-color-profile=srgb', '--allow-file-access-from-files', '--font-render-hinting=none']
  });
  try {
    const stage = await browser.newPage();
    await stage.setViewport({ width: 1920, height: 1080, deviceScaleFactor: 1 });
    stage.on('pageerror', (e) => console.log('  ! palco:', e.message));
    await stage.goto(pathToFileURL(path.join(__dirname, 'stage.html')).href, { waitUntil: 'load' });
    const tl = await stage.evaluate((d) => window.setup(d), { lang: LANG, site: SITE, logoSvg, qrSvg, clips, prices: { days: pricing.TRIAL_DAYS, founders: pricing.formatPrice(pricing.PLANS.founders.monthly, LANG) } });

    if (PREVIEW.length) {
      const dir = path.join(WORK, 'preview');
      fs.mkdirSync(dir, { recursive: true });
      for (const t of PREVIEW) {
        await stage.evaluate((t) => window.renderAt(t), t);
        await stage.screenshot({ path: path.join(dir, `t${t.toFixed(2)}.png`) });
      }
      console.log('  pré-visualização em', dir);
      return;
    }

    const wav = path.join(WORK, 'music.wav');
    writeWav(wav, buildAudio({ duration: tl.dur, dropAt: tl.drop, outroAt: tl.outro, cues: tl.cues }));

    const ff = spawn(ffmpeg, ['-y', '-loglevel', 'error',
      '-f', 'image2pipe', '-framerate', String(FPS), '-c:v', 'mjpeg', '-i', '-',
      '-i', wav,
      '-c:v', 'libx264', '-preset', 'slow', '-crf', '23', '-pix_fmt', 'yuv420p', '-r', String(FPS),
      '-c:a', 'aac', '-b:a', '160k', '-shortest', '-movflags', '+faststart', OUT], { stdio: ['pipe', 'inherit', 'inherit'] });
    const done = new Promise((res, rej) => ff.on('close', (c) => (c === 0 ? res() : rej(new Error('ffmpeg saiu com ' + c)))));

    const total = Math.round(tl.dur * FPS);
    const t0 = Date.now();
    for (let i = 0; i < total; i++) {
      await stage.evaluate((t) => window.renderAt(t), i / FPS);
      const jpg = await stage.screenshot({ type: 'jpeg', quality: 94, optimizeForSpeed: true });
      if (!ff.stdin.write(jpg)) await new Promise((r) => ff.stdin.once('drain', r));
      if (i % (FPS * 5) === 0) console.log(`  render ${(i / FPS).toFixed(0)}/${tl.dur} s (${((Date.now() - t0) / 1000).toFixed(0)} s)`);
    }
    ff.stdin.end();
    await done;
    console.log('  vídeo:', OUT, (fs.statSync(OUT).size / 1048576).toFixed(1) + ' MB');
  } finally {
    await browser.close().catch(() => {});
  }
}

/* ------------------------------------------------------------------ */
async function main() {
  const clipsFile = path.join(WORK, 'clips.json');
  let clips;
  if (REUSE) {
    clips = JSON.parse(fs.readFileSync(clipsFile, 'utf8'));
  } else {
    fs.rmSync(WORK, { recursive: true, force: true });
    fs.mkdirSync(WORK, { recursive: true });
    const server = spawn(process.execPath, ['src/server.js'], {
      cwd: ROOT,
      env: { ...process.env, EZCV_TEST_PREFIX: P, PORT: String(PORT), APP_URL: BASE },
      stdio: ['ignore', 'pipe', 'pipe']
    });
    server.stderr.on('data', (d) => process.stderr.write(d));
    try {
      for (let i = 0; i < 60; i++) {
        try { if ((await fetch(BASE + '/login')).ok) break; } catch { /* a arrancar */ }
        await sleep(500);
      }
      console.log(`  prefixo ${P} — a criar dados de demonstração`);
      const demo = await seed();
      clips = await capture(demo);
      fs.writeFileSync(clipsFile, JSON.stringify(clips));
    } finally {
      await cleanup().catch((e) => console.log('  ! limpeza:', e.message));
      server.kill();
    }
  }
  await render(clips);
}

main().catch((e) => { console.error(e); process.exit(1); });

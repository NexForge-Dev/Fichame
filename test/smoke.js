'use strict';

/* Teste E2E: sobe o servidor e valida o fluxo completo contra o Supabase real.
 * Executar: npm run test:e2e  (NÃO faz parte de `npm test`)
 *
 * Proteção: escreve na BD do .env. Só arranca se
 *   - EZCV_E2E_PROJECT_REF estiver definido e SUPABASE_URL for desse projeto
 *     (recomendado: um projeto Supabase só para testes), ou
 *   - EZCV_E2E_CONFIRM=1, para confirmar que se quer correr contra a BD do .env.
 *
 * Isolamento: cada execução gera um prefixo único (EZCV_TEST_PREFIX) que fica
 * gravado em restaurants.test_prefix. No fim, purge_test_data apaga tudo o que
 * ficou marcado com esse prefixo, incluindo os objetos no Storage. Nada toca
 * em dados que não tenham sido criados por esta execução.
 *
 * Como os dados vivem num Supabase partilhado, os nomes dos estabelecimentos
 * levam o prefixo e o slug é lido do painel em vez de ser assumido: duas
 * execuções seguidas nunca colidem.
 */

const { spawn, spawnSync } = require('child_process');
const path = require('path');
const crypto = require('crypto');

const { createClient } = require('@supabase/supabase-js');

/* Importado pelo efeito secundário de carregar o .env para process.env, que
 * é o que o cliente de limpeza e o servidor filho precisam. */
require('../src/config');

const PORT = process.env.TEST_PORT || '3456';
const BASE = `http://127.0.0.1:${PORT}`;
const root = path.join(__dirname, '..');

/* Prefixo só com letras e dígitos: entra em slugs, que são validados por
 * constraint no Postgres. */
const P = 't' + crypto.randomBytes(4).toString('hex');

/* Início da execução (ms epoch, como sessions.created_at). */
const T0 = Date.now();

let passed = 0;
let failed = 0;
const failures = [];

function check(name, cond, extra = '') {
  if (cond) {
    passed += 1;
    console.log(`  ✓ ${name}`);
  } else {
    failed += 1;
    failures.push(name + (extra ? ` — ${extra}` : ''));
    console.log(`  ✗ ${name} ${extra}`);
  }
}

class Jar {
  constructor() { this.map = new Map(); }

  header() {
    return [...this.map.entries()].map(([k, v]) => `${k}=${v}`).join('; ');
  }

  absorb(res) {
    const cookies = res.headers.getSetCookie ? res.headers.getSetCookie() : [];
    for (const c of cookies) {
      const pair = c.split(';')[0];
      const idx = pair.indexOf('=');
      if (idx > 0) {
        const name = pair.slice(0, idx).trim();
        const value = pair.slice(idx + 1).trim();
        if (value === '' || /expires=Thu, 01 Jan 1970/i.test(c)) this.map.delete(name);
        else this.map.set(name, value);
      }
    }
  }
}

async function call(method, url, { jar, body, headers = {}, redirect = 'manual' } = {}) {
  const opts = { method, redirect, headers: { ...headers } };
  if (jar) opts.headers.cookie = jar.header();
  if (body instanceof URLSearchParams || typeof body === 'string') {
    opts.headers['content-type'] = 'application/x-www-form-urlencoded';
    opts.body = String(body);
  } else if (body) {
    opts.body = body; // FormData: o undici define o content-type
  }
  const res = await fetch(BASE + url, opts);
  if (jar) jar.absorb(res);
  return res;
}

function csrfOf(html) {
  const m = String(html).match(/name="_csrf" value="([^"]+)"/);
  return m ? m[1] : '';
}

function form(data) {
  const p = new URLSearchParams();
  for (const [k, v] of Object.entries(data)) {
    if (v !== undefined && v !== null) p.append(k, String(v));
  }
  return p;
}

const PDF = Buffer.concat([
  Buffer.from('%PDF-1.4\n1 0 obj\n<< /Type /Catalog >>\nendobj\n', 'latin1'),
  Buffer.from('trailer\n<< >>\n%%EOF\n', 'latin1')
]);

const PNG = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==',
  'base64'
);

/* logSecurity grava em segundo plano: a resposta pode chegar antes do registo. */
async function logsEventually(query, min) {
  let rows = [];
  for (let i = 0; i < 30; i += 1) {
    const { data } = await query();
    rows = data || [];
    if (rows.length >= min) break;
    await new Promise((r) => setTimeout(r, 100));
  }
  return rows;
}

/* Location legível: os ok/err assinados vêm com «+» nos espaços. */
function locationText(res) {
  return decodeURIComponent(String(res.headers.get('location') || '').replace(/\+/g, ' '));
}

function applyBody(jar, csrf, overrides = {}) {
  const { __file, ...rest } = overrides;
  const fd = new FormData();
  const fields = Object.assign({
    nombre: 'Juan',
    apellidos: 'García',
    email: 'juan.garcia@example.com',
    telefono: '600111222',
    /* Enviados de propósito: o servidor tem de os IGNORAR (o documento de
     * identidade deixou de ser recolhido — minimização). */
    doc_tipo: 'nie',
    doc_numero: 'X1234567A',
    puesto: '',
    otro_puesto: '',
    disponibilidad: 'tarde',
    experiencia: '2 años como camarero',
    observaciones: 'Disponible por las tardes.',
    sitio_web: '',
    _csrf: csrf
  }, rest);

  for (const [k, v] of Object.entries(fields)) if (v !== undefined) fd.append(k, v);

  const file = __file || { name: 'CV_Juan_Garcia.pdf', type: 'application/pdf', data: PDF };
  fd.append('cv', new Blob([file.data], { type: file.type }), file.name);
  return fd;
}

async function text(res) { return res.text(); }

async function waitForServer() {
  for (let i = 0; i < 75; i++) {
    try {
      const res = await fetch(BASE + '/login');
      if (res.ok) return true;
    } catch { /* ainda a arrancar */ }
    await new Promise((r) => setTimeout(r, 400));
  }
  return false;
}

/* Extrai o slug real do estabelecimento a partir da página «Mi restaurante».
 * Não se assume o slug a partir do nome: num Supabase partilhado o gerador
 * pode ter acrescentado um sufixo para evitar colisão. */
function slugOf(html) {
  const m = String(html).match(/\/r\/([a-z0-9][a-z0-9-]*)/);
  return m ? m[1] : '';
}

/* Cliente com service_role, só para preparar e limpar o terreno do teste. */
function admin() {
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SECRET_KEY;
  if (!url || !key) return null;
  return createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
}

/* Uma limpeza falhada conta como falha do teste: pode ter ficado na BD uma
 * conta de teste (incluindo um admin). */
async function cleanup(sb) {
  if (!sb) return;
  try {
    const { data, error } = await sb.rpc('purge_test_data', { p: { test_prefix: P } });
    if (error) {
      failed += 1;
      failures.push(`limpeza falhou (prefixo ${P}): ${error.message}`);
      console.log(`  ! limpeza falhou: ${error.message}`);
      return;
    }
    const paths = (data && data.paths) || [];
    const media = (data && data.media) || [];
    if (paths.length > 0) await sb.storage.from('cvs').remove(paths);
    if (media.length > 0) await sb.storage.from('media').remove(media);
    console.log(`\n  limpeza: ${(data && data.restaurants) || 0} estabelecimento(s), ` +
      `${paths.length} CV(s), ${media.length} imagem(ns)`);
  } catch (err) {
    failed += 1;
    failures.push(`limpeza falhou (prefixo ${P}): ${err.message}`);
    console.log(`  ! limpeza falhou: ${err.message}`);
  }
}

/* Recusa correr contra uma BD que não foi explicitamente escolhida. */
function guardTarget() {
  const url = String(process.env.SUPABASE_URL || '');
  const ref = String(process.env.EZCV_E2E_PROJECT_REF || '').trim();
  if (ref) {
    if (url.includes(`//${ref}.`)) return;
    console.error(`\n  SUPABASE_URL não é o projeto de testes (${ref}). Teste cancelado.\n`);
    process.exit(1);
  }
  if (process.env.EZCV_E2E_CONFIRM === '1') return;
  console.error('');
  console.error('  Este teste escreve na base de dados do .env (dados marcados e apagados no fim).');
  console.error('  Para correr: EZCV_E2E_CONFIRM=1 npm run test:e2e');
  console.error('  Melhor: um projeto Supabase só para testes e EZCV_E2E_PROJECT_REF=<ref>.');
  console.error('');
  process.exit(1);
}

async function main() {
  guardTarget();
  const sb = admin();

  if (!sb) {
    console.error('');
    console.error('  SUPABASE_URL e SUPABASE_SERVICE_ROLE_KEY têm de estar definidos para correr os testes.');
    console.error('  Copia .env.example para .env e preenche-os.');
    console.error('');
    process.exit(1);
  }

  const server = spawn(process.execPath, ['src/server.js'], {
    cwd: root,
    env: {
      ...process.env,
      PORT,
      APP_URL: BASE,
      NODE_ENV: 'test',
      EZCV_TEST_PREFIX: P
    },
    stdio: ['ignore', 'pipe', 'pipe']
  });

  server.stdout.on('data', (d) => process.env.VERBOSE && process.stdout.write(d));
  server.stderr.on('data', (d) => process.stdout.write(d));

  /* Ctrl+C não corre o finally: sem isto os dados do teste ficavam na BD. */
  process.once('SIGINT', async () => {
    console.log('\n  interrompido — a limpar os dados de teste…');
    server.kill();
    await cleanup(sb);
    process.exit(130);
  });

  let slugA = '';
  let slugB = '';

  try {
    const up = await waitForServer();
    if (!up) throw new Error('Servidor não arrancou (vê as mensagens acima: migrations ou .env)');

    console.log(`\n  prefixo desta execução: ${P}`);

    console.log('\n— Registro e sessão —');
    const ownerJar = new Jar();
    let res = await call('GET', '/registro', { jar: ownerJar });
    let html = await text(res);
    const csrf = csrfOf(html);
    check('GET /registro renderiza', res.status === 200 && Boolean(csrf));

    res = await call('POST', '/registro', {
      jar: ownerJar,
      body: form({
        restaurant_name: `Restaurante Granada ${P}`, owner_name: 'Ana López',
        email: `ana-${P}@granada.es`, privacy_email: `ana-${P}@granada.es`, telefono: '912345678',
        direccion: 'Calle Mayor 1', cp: '28013', ciudad: 'Madrid',
        establecimiento: 'restaurante', commercial_name: 'Granada Restaurante',
        descripcion: 'Cocina mediterránea en el centro.',
        password: 'Secreta123', password2: 'Secreta123', _csrf: csrf
      })
    });
    check('registo sem aceitar Termos/Encargo e sem titular é recusado',
      res.status === 422 && (await text(res)).includes('Acuerdo de encargo'));

    const anonCookie = ownerJar.header();
    res = await call('POST', '/registro', {
      jar: ownerJar,
      body: form({
        restaurant_name: `Restaurante Granada ${P}`, owner_name: 'Ana López',
        legal_name: `Granada Hostelería SL ${P}`, acepto: '1',
        email: `ana-${P}@granada.es`, privacy_email: `ana-${P}@granada.es`, telefono: '912345678',
        direccion: 'Calle Mayor 1', cp: '28013', ciudad: 'Madrid',
        establecimiento: 'restaurante', commercial_name: 'Granada Restaurante',
        descripcion: 'Cocina mediterránea en el centro.',
        password: 'Secreta123', password2: 'Secreta123', _csrf: csrf
      })
    });
    check('POST /registro cria conta e sessão',
      res.status === 302 && res.headers.get('location') === '/panel/privacidad?bienvenida=1');
    check('sessão nova após registo (sem session fixation)', ownerJar.header() !== anonCookie && ownerJar.header() !== '');
    {
      const { data: legalRow } = await sb.from('restaurants')
        .select('legal_name, privacy_email, terms_version, dpa_version, terms_accepted_at').eq('test_prefix', P).limit(1).maybeSingle();
      check('aceitação de Termos/Encargo registada com versão e data',
        Boolean(legalRow && legalRow.terms_version && legalRow.dpa_version && legalRow.terms_accepted_at && legalRow.legal_name));
    }

    // Termos novos (art. 11): histórico, aviso no painel e aceitação.
    {
      const { data: rest } = await sb.from('restaurants').select('id, terms_version').eq('test_prefix', P).limit(1).maybeSingle();
      const acceptances = async () => (await sb.from('terms_acceptances')
        .select('via, terms_version, user_id, ip').eq('restaurant_id', rest.id).order('id')).data || [];

      let rows = await acceptances();
      check('registo grava a aceitação no histórico',
        rows.length === 1 && rows[0].via === 'registro' && rows[0].terms_version === rest.terms_version && rows[0].user_id && rows[0].ip);

      res = await call('GET', '/panel', { jar: ownerJar });
      check('sem termos novos, o painel não mostra o aviso', !(await text(res)).includes('Hemos actualizado los términos'));

      await sb.from('restaurants').update({ terms_version: '2000-01-antiga' }).eq('id', rest.id);
      res = await call('GET', '/panel', { jar: ownerJar });
      check('com versão antiga, o painel avisa e continua a funcionar',
        res.status === 200 && (await text(res)).includes('/panel/terminos'));

      res = await call('GET', '/panel/terminos', { jar: ownerJar });
      html = await text(res);
      check('GET /panel/terminos mostra o que mudou', res.status === 200 && html.includes('30 días de antelación'));
      const cT = csrfOf(html);

      res = await call('POST', '/panel/terminos', { jar: ownerJar, body: form({ _csrf: cT }) });
      check('aceitar sem marcar a caixa é recusado', res.status === 302 && res.headers.get('location').includes('err='));
      rows = await acceptances();
      check('… e não grava nada', rows.length === 1);

      res = await call('POST', '/panel/terminos', { jar: ownerJar, body: form({ acepto: '1' }) });
      check('aceitar sem CSRF é recusado', res.status === 403);

      res = await call('POST', '/panel/terminos', { jar: ownerJar, body: form({ _csrf: cT, acepto: '1' }) });
      check('aceitar os termos novos', res.status === 302 && res.headers.get('location').includes('ok='));
      rows = await acceptances();
      const { data: after } = await sb.from('restaurants').select('terms_version').eq('id', rest.id).maybeSingle();
      check('aceitação no histórico (via painel) e versão atualizada',
        rows.length === 2 && rows[1].via === 'panel' && after.terms_version === rest.terms_version);

      res = await call('POST', '/panel/terminos', { jar: ownerJar, body: form({ _csrf: cT, acepto: '1' }) });
      check('aceitar de novo não duplica o histórico', (await acceptances()).length === 2);

      res = await call('GET', '/panel', { jar: ownerJar });
      check('depois de aceitar, o aviso desaparece', !(await text(res)).includes('Hemos actualizado los términos'));
    }
    res = await call('GET', '/panel/privacidad?bienvenida=1', { jar: ownerJar });
    check('onboarding de privacidade para o negócio',
      res.status === 200 && (await text(res)).includes('Tu negocio es el responsable'));

    res = await call('GET', '/panel', { jar: ownerJar });
    html = await text(res);
    check('GET /panel mostra dashboard', res.status === 200 && html.includes('Aceptando candidaturas'));

    res = await call('GET', '/panel/restaurante', { jar: ownerJar });
    html = await text(res);
    slugA = slugOf(html);
    check('slug do estabelecimento gerado', Boolean(slugA), slugA);

    console.log('\n— Vagas —');
    res = await call('GET', '/panel/vagas', { jar: ownerJar });
    const jobCsrf = csrfOf(await text(res));
    res = await call('POST', '/panel/vagas/crear', {
      jar: ownerJar,
      body: form({ titulo: 'Camarero/a', descripcion: 'Jornada parcial, fines de semana.', _csrf: jobCsrf })
    });
    check('criar vaga', res.status === 302);
    res = await call('GET', '/panel/vagas', { jar: ownerJar });
    const jobId = (await text(res)).match(/\/panel\/vagas\/(\d+)\/toggle/);
    check('vaga aparece no painel', Boolean(jobId));

    console.log('\n— Página pública NFC —');
    const pubJar = new Jar();
    res = await call('GET', `/r/${slugA}`, { jar: pubJar });
    html = await text(res);
    check('página NFC renderiza formulário',
      res.status === 200 && html.includes('Estamos contratando') && html.includes('Vacantes abiertas'));
    const publicCsrf = csrfOf(html);

    console.log('\n— Candidatura com CV —');
    res = await call('POST', `/r/${slugA}/apply`, { jar: pubJar, body: applyBody(null, publicCsrf) });
    check('POST apply redireciona para confirmação',
      res.status === 302 && (res.headers.get('location') || '').includes('/enviado'));
    res = await call('GET', `/r/${slugA}/enviado`);
    html = await text(res);
    check('página de confirmação', res.status === 200 && html.includes('Candidatura enviada correctamente'));

    res = await call('GET', '/panel/candidaturas', { jar: ownerJar });
    html = await text(res);
    check('candidatura aparece no painel', html.includes('Juan García') && html.includes('(1)'));
    const appId = (html.match(/\/panel\/candidaturas\/(\d+)/) || [])[1];
    check('id da candidatura extraído', Boolean(appId));

    console.log('\n— Perfil, CV, estado e notas —');
    res = await call('GET', `/panel/candidaturas/${appId}`, { jar: ownerJar });
    html = await text(res);
    check('perfil mostra dados', res.status === 200 && html.includes('juan.garcia@example.com'));
    check('documento de identidade enviado pelo cliente é ignorado (não gravado)', !html.includes('X1234567A'));
    const cvId = (html.match(/\/panel\/cv\/(\d+)/) || [])[1];
    check('link do CV presente', Boolean(cvId));

    res = await call('GET', `/panel/cv/${cvId}`, { jar: ownerJar });
    const buf = Buffer.from(await res.arrayBuffer());
    check('GET CV devolve PDF do Storage',
      res.status === 200 &&
      res.headers.get('content-type') === 'application/pdf' &&
      buf.subarray(0, 5).toString('latin1') === '%PDF-');
    check('CV sem cache público', (res.headers.get('cache-control') || '').includes('no-store'));
    res = await call('GET', `/panel/cv/${cvId}?descargar=1`, { jar: ownerJar });
    check('download CV em attachment', (res.headers.get('content-disposition') || '').startsWith('attachment'));

    res = await call('GET', `/panel/candidaturas/${appId}`, { jar: ownerJar });
    const detailCsrf = csrfOf(await text(res));
    res = await call('POST', `/panel/candidaturas/${appId}/estado`, {
      jar: ownerJar, body: form({ status: 'contactar', _csrf: detailCsrf })
    });
    check('alterar estado', res.status === 302);
    res = await call('GET', `/panel/candidaturas/${appId}`, { jar: ownerJar });
    html = await text(res);
    check('estado "Por contactar" refletido', html.includes('Por contactar'));

    res = await call('POST', `/panel/candidaturas/${appId}/notas`, {
      jar: ownerJar, body: form({ nota: 'Llamar el viernes.', _csrf: detailCsrf })
    });
    check('adicionar nota interna', res.status === 302);
    res = await call('GET', `/panel/candidaturas/${appId}`, { jar: ownerJar });
    check('nota visível no perfil', (await text(res)).includes('Llamar el viernes.'));

    console.log('\n— Validação de upload —');
    res = await call('GET', `/r/${slugA}`, { jar: pubJar });
    const csrf2 = csrfOf(await text(res));
    res = await call('POST', `/r/${slugA}/apply`, {
      jar: pubJar,
      body: applyBody(null, csrf2, {
        nombre: 'María', apellidos: 'López', email: 'maria@example.com',
        telefono: '600999888', doc_tipo: 'dni', doc_numero: '12345678Z',
        __file: { name: 'fake.pdf', type: 'application/pdf', data: Buffer.from('Isto non é un PDF') }
      })
    });
    html = await text(res);
    check('PDF falso rejeitado (magic bytes)', res.status === 422 && html.includes('no es un PDF válido'));

    res = await call('GET', `/r/${slugA}`, { jar: pubJar });
    const csrf3 = csrfOf(await text(res));
    res = await call('POST', `/r/${slugA}/apply`, {
      jar: pubJar,
      body: applyBody(null, csrf3, {
        nombre: 'Pedro', email: 'pedro@example.com', telefono: '600333444',
        __file: { name: 'notas.txt', type: 'text/plain', data: Buffer.from('ola') }
      })
    });
    html = await text(res);
    check('arquivo não-PDF rejeitado', res.status === 422 && html.includes('Solo se aceptan archivos PDF'));

    console.log('\n— Minimização e informação no formulário —');
    res = await call('GET', `/r/${slugA}`, { jar: pubJar });
    html = await text(res);
    check('formulário não pede documento de identidade', !html.includes('name="doc_numero"') && !html.includes('name="doc_tipo"'));
    check('sem checkbox obrigatório de «consentimento» para se candidatar', !html.includes('consentimiento_proceso'));
    check('1.ª camada: responsável, base 6.1.b, conservação e link para informação completa',
      html.includes(`Granada Hostelería SL ${P}`) && html.includes('art. 6.1.b RGPD') &&
      html.includes('Conservación') && html.includes(`/r/${slugA}/privacidad`));
    check('futuras oportunidades: opcional, específico do estabelecimento',
      /name="consentimiento_futuro"(?![^>]*required)/.test(html) && html.includes('No autorizo que se compartan con otros establecimientos'));
    check('aviso para não incluir dados sensíveis', html.includes('Comparte solo lo necesario'));
    /* O envio sem documento é testado mais abaixo, no restaurante B: o limite
     * de 5 candidaturas/hora é por IP+slug e o orçamento de A é todo gasto
     * pelos testes de validação de upload acima. */

    console.log('\n— CSRF —');
    res = await call('POST', `/panel/candidaturas/${appId}/estado`, {
      jar: ownerJar, body: form({ status: 'revisado' })
    });
    check('POST sem CSRF → 403', res.status === 403);

    res = await call('GET', '/', { jar: ownerJar });
    check('/ com sessão vai para o painel', res.status === 302 && res.headers.get('location') === '/panel');
    res = await call('GET', '/');
    html = await text(res);
    check('/ sem sessão mostra a landing page',
      res.status === 200 && html.includes('lp-hero') && html.includes('href="/registro"'));
    check('páginas ligam o logo e os favicons',
      html.includes('/img/logo.svg') && html.includes('rel="icon"') && html.includes('apple-touch-icon'));
    console.log('\n— Página de apresentação (/conoce) —');
    res = await call('GET', '/conoce');
    html = await text(res);
    check('/conoce é pública e explica o produto',
      res.status === 200 && html.includes('lang="es"') && html.includes('href="/registro"') && html.includes('Encuentra a tu próximo empleado'));
    check('/conoce diz que a prova é grátis e sem cartão', html.includes('30 días gratis') && html.includes('Sin tarjeta'));
    check('/conoce não renderiza nenhum QR', !html.includes('crispEdges') && !html.includes('/admin/divulgacion'));
    check('/conoce tem espaço para o vídeo', html.includes('data-video'));
    res = await call('GET', '/conoce', { jar: ownerJar });
    check('/conoce com sessão de dono não redireciona', res.status === 200);
    res = await call('GET', '/conoce?lang=en');
    html = await text(res);
    check('/conoce?lang=en em inglês', res.status === 200 && html.includes('lang="en"') && html.includes('No HR team? No problem.'));
    res = await call('GET', '/conoce', { headers: { 'Accept-Language': 'en-GB,en;q=0.9' } });
    check('/conoce segue a língua do browser', (await text(res)).includes('lang="en"'));
    for (const u of ['/admin/divulgacion', '/admin/divulgacion/qr.png', '/admin/divulgacion/qr.svg']) {
      res = await call('GET', u);
      check(`anónimo → ${u} → 404`, res.status === 404, `status=${res.status}`);
      res = await call('GET', u, { jar: ownerJar });
      check(`dono → ${u} → 404`, res.status === 404, `status=${res.status}`);
    }

    for (const asset of ['/favicon.ico', '/favicon.svg', '/apple-touch-icon.png', '/img/logo.svg']) {
      res = await call('GET', asset);
      check(`${asset} é servido`, res.status === 200);
    }

    console.log('\n— Filtros e páginas do painel —');
    res = await call('GET', '/panel/restaurante', { jar: ownerJar });
    html = await text(res);
    check('Mi restaurante mostra URL NFC',
      res.status === 200 && html.includes(`/r/${slugA}`) && html.includes('Copiar enlace'));
    {
      const fd = new FormData();
      fd.append('_csrf', csrfOf(html));
      for (const [k, v] of Object.entries({
        name: 'Nombre Editado Test', owner_name: 'Ana López', email: 'ana@example.com',
        legal_name: `Granada Hostelería SL ${P}`, privacy_email: 'privacidad@example.com',
        telefono: '912345678', ciudad: 'Madrid', cp: '123', establecimiento: 'restaurante'
      })) fd.append(k, v);
      res = await call('POST', '/panel/restaurante', { jar: ownerJar, body: fd });
      const editHtml = await text(res);
      check('erro em Mi negocio mantém o que foi escrito',
        res.status === 422 && editHtml.includes('Nombre Editado Test') && editHtml.includes('5 dígitos'));
    }
    res = await call('GET', '/panel/qr', { jar: ownerJar });
    html = await text(res);
    check('página do QR renderiza SVG com a URL NFC',
      res.status === 200 && html.includes('<svg') && html.includes(`/r/${slugA}`) && html.includes('data-print'));
    res = await call('GET', '/panel/qr.png', { jar: ownerJar });
    const qrPng = Buffer.from(await res.arrayBuffer());
    check('QR em PNG para descarregar',
      res.status === 200 && res.headers.get('content-type') === 'image/png' &&
      qrPng.subarray(1, 4).toString() === 'PNG' &&
      (res.headers.get('content-disposition') || '').includes('attachment'));
    res = await call('GET', '/panel/qr');
    check('QR exige sessão', res.status !== 200 || !(await text(res)).includes('<svg'));
    res = await call('GET', '/panel/configuracion', { jar: ownerJar });
    check('Configuración renderiza', res.status === 200 && (await text(res)).includes('Contraseña actual'));
    res = await call('GET', '/panel/candidaturas?q=camarero', { jar: ownerJar });
    check('busca por texto "camarero"', (await text(res)).includes('Juan García'));
    res = await call('GET', '/panel/candidaturas?q=inexistente999', { jar: ownerJar });
    check('busca sem resultados', (await text(res)).includes('No hay candidaturas'));
    res = await call('GET', '/panel/candidaturas?q=100%25', { jar: ownerJar });
    check('curinga % na busca é escapado', (await text(res)).includes('No hay candidaturas'));
    res = await call('GET', '/panel/candidaturas?estado=contactar', { jar: ownerJar });
    check('filtro por estado (contactar)', (await text(res)).includes('Juan García'));
    res = await call('GET', '/panel/candidaturas?estado=contratado', { jar: ownerJar });
    check('filtro por estado vazio', (await text(res)).includes('No hay candidaturas'));

    console.log('\n— Pipeline, ordenação e publicidade dos dados —');
    res = await call('GET', '/panel/candidaturas', { jar: ownerJar });
    html = await text(res);
    check('separadores simples de estado',
      res.status === 200 && html.includes('class="group-tabs"') && html.includes('/panel/candidaturas?grupo=nuevas"'));
    check('card mostra telefone', html.includes('600111222'));
    check('card mostra disponibilidade', html.includes('Tarde'));
    res = await call('GET', '/panel/candidaturas?orden=antiguas', { jar: ownerJar });
    check('ordenação por mais antigas aceite', res.status === 200 && (await text(res)).includes('Más antiguas'));
    res = await call('GET', '/panel/candidaturas?favs=1', { jar: ownerJar });
    check('filtro favoritos (vazio)', (await text(res)).includes('No hay candidaturas'));
    res = await call('GET', '/panel/candidaturas?grupo=terminadas', { jar: ownerJar });
    check('separador «Terminadas» filtra (vazio)', (await text(res)).includes('No hay candidaturas'));
    res = await call('GET', `/r/${slugA}`);
    html = await text(res);
    check('página pública mostra descrição e tipo',
      html.includes('Cocina mediterránea en el centro.') && html.includes('Restaurante'));

    console.log('\n— Imágenes del establecimiento (Storage) —');
    res = await call('GET', '/panel/restaurante', { jar: ownerJar });
    const restCsrf = csrfOf(await text(res));
    const imgFields = {
      name: `Restaurante Granada ${P}`, commercial_name: 'Granada Restaurante', owner_name: 'Ana López',
      legal_name: `Granada Hostelería SL ${P}`, privacy_email: `privacidad-${P}@granada.es`,
      email: `ana-${P}@granada.es`, telefono: '912345678', direccion: 'Calle Mayor 1', cp: '28013',
      ciudad: 'Madrid', establecimiento: 'restaurante', descripcion: 'Cocina mediterránea en el centro.',
      _csrf: restCsrf
    };

    const fdImg = new FormData();
    for (const [k, v] of Object.entries(imgFields)) fdImg.append(k, v);
    fdImg.append('logo', new Blob([PNG], { type: 'image/png' }), 'logo.png');
    res = await call('POST', '/panel/restaurante', { jar: ownerJar, body: fdImg });
    check('upload de logo aceite', res.status === 302);

    res = await call('GET', `/r/${slugA}`, { jar: pubJar });
    check('logo aparece na página pública', (await text(res)).includes('imagen/logo'));
    res = await call('GET', `/r/${slugA}/imagen/logo`, { jar: pubJar });
    const logoBytes = Buffer.from(await res.arrayBuffer());
    check('rota de logo devolve PNG do Storage',
      res.status === 200 &&
      res.headers.get('content-type') === 'image/png' &&
      logoBytes[0] === 0x89 && logoBytes[1] === 0x50);

    const fdBad = new FormData();
    for (const [k, v] of Object.entries(imgFields)) fdBad.append(k, v);
    fdBad.append('logo', new Blob([Buffer.from('not an image')], { type: 'text/plain' }), 'logo.txt');
    res = await call('POST', '/panel/restaurante', { jar: ownerJar, body: fdBad });
    check('imagem inválida rejeitada',
      res.status === 302 && locationText(res).includes('Solo se aceptan imágenes'));

    console.log('\n— Favorito, historial y consentimiento —');
    res = await call('GET', `/panel/candidaturas/${appId}`, { jar: ownerJar });
    const favCsrf = csrfOf(await text(res));
    res = await call('POST', `/panel/candidaturas/${appId}/favorito`, { jar: ownerJar, body: form({ _csrf: favCsrf }) });
    check('marcar favorito', res.status === 302);
    res = await call('GET', `/panel/candidaturas/${appId}`, { jar: ownerJar });
    html = await text(res);
    check('perfil mostra favorito e base jurídica com versão do aviso',
      html.includes('aria-pressed="true"') && html.includes('art. 6.1.b RGPD') && html.includes('aviso v2026-11'));
    /* Abrir a ficha marcou-a como «Visto» antes de passar a «Por contactar». */
    check('histórico regista recepção, «Visto» automático e mudança de estado',
      html.includes('Candidatura recibida') && html.includes('Nuevo → Visto') && html.includes('Visto → Por contactar'));
    check('nota com autor', html.includes('Ana López'));
    res = await call('GET', '/panel/candidaturas?favs=1', { jar: ownerJar });
    check('filtro de favoritos encontra favorito', (await text(res)).includes('Juan García'));
    check('experiencia e observações visíveis no perfil',
      html.includes('2 años como camarero') && html.includes('Disponible por las tardes.'));

    console.log('\n— Notificaciones del panel —');
    res = await call('GET', '/panel', { jar: ownerJar });
    html = await text(res);
    // a ficha da candidatura já foi aberta acima: o aviso dela fica lido sozinho
    const { data: notifRows } = await sb.from('notifications')
      .select('status').eq('application_id', appId).eq('channel', 'panel');
    check('abrir a ficha marca o aviso como lido',
      (notifRows || []).length > 0 && notifRows.every((n) => n.status === 'read'));
    check('dashboard sem avisos por ler', !html.includes('Marcar avisos como leídos'));
    res = await call('GET', '/panel/notificaciones', { jar: ownerJar });
    html = await text(res);
    check('página de avisos lista notificações',
      res.status === 200 && html.includes('Nueva candidatura') && html.includes('Juan García'));
    const notifCsrf = csrfOf(html);
    res = await call('POST', '/panel/notificaciones/marcar-leidas', {
      jar: ownerJar, body: form({ _csrf: notifCsrf, volver: '/panel/notificaciones' })
    });
    check('marcar notificações como lidas', res.status === 302);
    res = await call('GET', '/panel', { jar: ownerJar });
    check('aviso desaparece após marcar lidas', !(await text(res)).includes('Marcar avisos como leídos'));

    console.log('\n— Privacidad (§6, §29) —');
    res = await call('GET', '/privacidad');
    html = await text(res);
    check('página de privacidade renderiza',
      res.status === 200 && html.includes('Tus derechos') && html.includes('Versión 2026-11'));
    check('privacidade distingue responsável/encarregado e sem decisões automatizadas',
      html.includes('encargado del tratamiento') && html.includes('Decisiones automatizadas') && html.includes('BORRADOR'));
    check('privacidade não inventa dados do operador', html.includes('pendiente de publicación') || Boolean(process.env.OPERATOR_LEGAL_NAME));
    for (const p of ['/cookies', '/terminos', '/encargo']) {
      res = await call('GET', p);
      check(`${p} renderiza com aviso de borrador`, res.status === 200 && (await text(res)).includes('REQUIERE REVISIÓN JURÍDICA'));
    }
    res = await call('GET', `/r/${slugA}/privacidad`);
    html = await text(res);
    check('2.ª camada do estabelecimento com formulário de direitos',
      res.status === 200 && html.includes(`Granada Hostelería SL ${P}`) && html.includes(`action="/r/${slugA}/derechos"`));

    console.log('\n— Vacantes avanzadas y exclusión —');
    res = await call('GET', '/panel/vagas', { jar: ownerJar });
    const jobsCsrf = csrfOf(await text(res));
    res = await call('POST', '/panel/vagas/crear', {
      jar: ownerJar,
      body: form({
        titulo: 'Cocinero/a', descripcion: 'Cocina regional',
        requisitos: 'Experiencia y carné de manipulación',
        contrato: 'indefinido', jornada: 'completa', disponibilidad: 'jornada_comp', _csrf: jobsCsrf
      })
    });
    check('criar vaga com contrato e jornada', res.status === 302);
    res = await call('GET', '/panel/vagas', { jar: ownerJar });
    html = await text(res);
    check('vaga mostra contrato Indefinido e jornada completa',
      html.includes('Indefinido') && html.includes('Jornada completa'));
    const cocineroDel = html.match(/<h3 class="flat">Cocinero\/a<\/h3>[\s\S]*?\/panel\/vagas\/(\d+)\/eliminar/);
    check('link de eliminar vaga presente', Boolean(cocineroDel));
    res = await call('GET', '/panel/vagas', { jar: ownerJar });
    const jobsCsrf2 = csrfOf(await text(res));
    res = await call('POST', `/panel/vagas/${cocineroDel[1]}/eliminar`, { jar: ownerJar, body: form({ _csrf: jobsCsrf2 }) });
    check('eliminar vaga', res.status === 302);
    res = await call('GET', '/panel/vagas', { jar: ownerJar });
    check('vaga eliminada some da lista', !(await text(res)).includes('<h3 class="flat">Cocinero/a</h3>'));
    res = await call('GET', '/panel/candidaturas', { jar: ownerJar });
    check('candidaturas antigas preservadas após eliminar vaga', (await text(res)).includes('Juan García'));

    res = await call('GET', '/panel/vagas', { jar: ownerJar });
    const jobCsrf2 = csrfOf(await text(res));
    res = await call('POST', `/panel/vagas/${jobId[1]}/toggle`, { jar: ownerJar, body: form({ _csrf: jobCsrf2 }) });
    check('desativar vaga', res.status === 302);
    res = await call('GET', `/r/${slugA}`, { jar: pubJar });
    check('sem vagas ativas → mensagem de futuras oportunidades',
      (await text(res)).includes('no tenemos vacantes disponibles'));
    res = await call('GET', '/panel/vagas', { jar: ownerJar });
    const jobCsrf3 = csrfOf(await text(res));
    res = await call('POST', `/panel/vagas/${jobId[1]}/toggle`, { jar: ownerJar, body: form({ _csrf: jobCsrf3 }) });
    check('reativar vaga', res.status === 302);
    res = await call('GET', `/r/${slugA}`, { jar: pubJar });
    check('vaga reativada → formulário visível', (await text(res)).includes('Vacantes abiertas'));

    console.log('\n— Honeypot (spam) —');
    res = await call('GET', `/r/${slugA}`, { jar: pubJar });
    const csrfHoneypot = csrfOf(await text(res));
    res = await call('POST', `/r/${slugA}/apply`, {
      jar: pubJar,
      body: applyBody(null, csrfHoneypot, {
        nombre: 'Bot', email: 'bot@spam.com', sitio_web: 'http://spam.example'
      })
    });
    check('honeypot redireciona sem gravar',
      res.status === 302 && (res.headers.get('location') || '').includes('/enviado'));
    res = await call('GET', '/panel/candidaturas?q=Bot', { jar: ownerJar });
    check('honeypot não criou candidatura', (await text(res)).includes('No hay candidaturas'));

    console.log('\n— Pausa de candidaturas —');
    res = await call('GET', '/panel', { jar: ownerJar });
    const dashCsrf = csrfOf(await text(res));
    res = await call('POST', '/panel/contratacion', { jar: ownerJar, body: form({ accion: 'pausar', _csrf: dashCsrf }) });
    check('pausar candidaturas', res.status === 302);
    res = await call('GET', `/r/${slugA}`);
    html = await text(res);
    check('página mostra "No estamos contratando"',
      res.status === 200 && html.includes('No estamos contratando'));
    check('formulário de interesse pede uma breve descrição',
      html.includes('action="/r/' + slugA + '/interes#interes"') && html.includes('¿En qué te gustaría trabajar?'));

    res = await call('GET', `/r/${slugA}`, { jar: pubJar });
    const csrfPause = csrfOf(await text(res));
    res = await call('POST', `/r/${slugA}/apply`, { jar: pubJar, body: applyBody(null, csrfPause) });
    const locPaused = res.headers.get('location') || '';
    check('apply bloqueado quando pausado', res.status === 302 && !locPaused.includes('/enviado'));

    res = await call('POST', `/r/${slugA}/interes`, {
      jar: pubJar,
      body: form({
        nombre: 'Lucía', email: 'lucia@example.com', telefono: '655444333',
        experiencia: 'Dependienta, 3 años en tienda de ropa',
        consentimiento_futuro: '1', _csrf: csrfPause
      })
    });
    check('formulário de interesse funciona pausado',
      res.status === 302 && (res.headers.get('location') || '').includes('tipo=futuro'));

    res = await call('GET', '/panel/candidaturas', { jar: ownerJar });
    html = await text(res);
    check('interesse guardado como Reserva',
      html.includes('Lucía') && html.includes('Para el futuro'));
    check('descrição do interesse aparece no painel', html.includes('Dependienta, 3 años en tienda de ropa'));

    res = await call('GET', '/panel', { jar: ownerJar });
    const dashCsrf2 = csrfOf(await text(res));
    res = await call('POST', '/panel/contratacion', { jar: ownerJar, body: form({ accion: 'activar', _csrf: dashCsrf2 }) });
    res = await call('GET', `/r/${slugA}`, { jar: pubJar });
    check('reativar candidaturas', (await text(res)).includes('Estamos contratando'));

    console.log('\n— Isolamento entre restaurantes —');
    const bJar = new Jar();
    res = await call('GET', '/registro', { jar: bJar });
    const csrfB = csrfOf(await text(res));
    res = await call('POST', '/registro', {
      jar: bJar,
      body: form({
        restaurant_name: `Bar Sol ${P}`, owner_name: 'Berto Ruiz',
        legal_name: `Berto Ruiz (autónomo) ${P}`, acepto: '1',
        email: `berto-${P}@barsol.es`, privacy_email: `berto-${P}@barsol.es`, telefono: '934567890',
        ciudad: 'Barcelona', establecimiento: 'bar',
        password: 'Secreta123', password2: 'Secreta123', _csrf: csrfB
      })
    });
    check('segundo restaurante criado', res.status === 302);

    res = await call('GET', '/panel/restaurante', { jar: bJar });
    slugB = slugOf(await text(res));
    check('slug do segundo restaurante', Boolean(slugB) && slugB !== slugA, slugB);

    res = await call('GET', `/panel/candidaturas/${appId}`, { jar: bJar });
    check('restaurante B não vê candidatura de A → 404', res.status === 404);
    res = await call('GET', `/panel/cv/${cvId}`, { jar: bJar });
    check('restaurante B não vê CV de A → 404', res.status === 404);
    res = await call('GET', '/panel/candidaturas', { jar: bJar });
    const htmlB = await text(res);
    check('lista de B vazia', htmlB.includes('(0)') && !htmlB.includes('Juan García'));
    res = await call('GET', `/panel/candidaturas/${appId}`);
    check('sem sessão → redirect login',
      res.status === 302 && (res.headers.get('location') || '').includes('/login'));

    console.log('\n— Isolamento do Storage —');
    const { data: restRows } = await sb.from('restaurants').select('id, slug').eq('test_prefix', P);
    const ridA = (restRows || []).find((r) => r.slug === slugA);
    const ridB = (restRows || []).find((r) => r.slug === slugB);
    check('restaurantes marcados com o prefixo do teste', Boolean(ridA) && Boolean(ridB));

    const { data: objA } = await sb.storage.from('cvs').list(`r/${ridA.id}`);
    const { data: objB } = await sb.storage.from('cvs').list(`r/${ridB.id}`);
    check('CVs de A estão no bucket privado, separados por restaurante',
      (objA || []).length >= 1 && (objB || []).length === 0,
      `A=${(objA || []).length} B=${(objB || []).length}`);

    const { data: bucketList } = await sb.storage.listBuckets();
    const cvBucket = (bucketList || []).find((b) => b.id === 'cvs');
    check('bucket cvs é privado', Boolean(cvBucket) && cvBucket.public === false);

    if (process.env.SUPABASE_ANON_KEY) {
      const anon = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_ANON_KEY, {
        auth: { persistSession: false, autoRefreshToken: false }
      });
      const { data: leak, error: leakErr } = await anon.from('applications').select('id').limit(1);
      check('chave anon não lê candidaturas (RLS deny-all)',
        Boolean(leakErr) || (leak || []).length === 0);

      /* `list` devolve só o nome do ficheiro: o caminho do objeto é
       * r/<restaurant_id>/<nome>. */
      const victim = (objA || [])[0];
      const victimPath = victim ? `r/${ridA.id}/${victim.name}` : 'r/0/inexistente.pdf';
      const { data: dl, error: dlErr } = await anon.storage.from('cvs').download(victimPath);
      check('chave anon não descarrega CVs', Boolean(dlErr) || !dl);
    } else {
      console.log('  — SUPABASE_ANON_KEY não definida: testes de RLS com chave anon saltados');
    }

    console.log('\n— Candidatura em B (minimização, consentimento futuro, XSS) —');
    res = await call('GET', '/panel/vagas', { jar: bJar });
    const jobCsrfB = csrfOf(await text(res));
    res = await call('POST', '/panel/vagas/crear', {
      jar: bJar,
      body: form({ titulo: 'Ayudante de cocina', _csrf: jobCsrfB })
    });
    check('vaga criada no restaurante B', res.status === 302);

    const noDocJar = new Jar();
    res = await call('GET', `/r/${slugB}`, { jar: noDocJar });
    const csrfNoDoc = csrfOf(await text(res));
    res = await call('POST', `/r/${slugB}/apply`, {
      jar: noDocJar,
      body: applyBody(null, csrfNoDoc, {
        nombre: 'Sofía', apellidos: '<script>alert(1)</script>', email: 'sofia@example.com',
        telefono: '600777666', doc_tipo: '', doc_numero: '', consentimiento_futuro: '1',
        __file: { name: '../../etc/<img src=x onerror=alert(1)>.pdf', type: 'application/pdf', data: PDF }
      })
    });
    check('candidatura em B aceite',
      res.status === 302 && (res.headers.get('location') || '').includes('/enviado'));

    res = await call('GET', '/panel/candidaturas?q=Sofía', { jar: bJar });
    html = await text(res);
    check('candidatura no painel de B', html.includes('Sofía'));
    const appIdB = (html.match(/\/panel\/candidaturas\/(\d+)/) || [])[1];
    res = await call('GET', `/panel/candidaturas/${appIdB}`, { jar: bJar });
    html = await text(res);
    check('XSS armazenado: nome escapado no perfil',
      html.includes('&lt;script&gt;alert(1)&lt;/script&gt;') && !html.includes('<script>alert(1)</script>'));
    check('nome do ficheiro sem caminho e escapado',
      !html.includes('../') && !html.includes('<img src=x') && html.includes('_img src=x onerror=alert(1)_.pdf'));
    check('perfil mostra consentimento futuro com data', html.includes('Futuras oportunidades:') && html.includes('desde'));
    {
      const { data: c } = await sb.from('consents')
        .select('future_opportunity_consent, future_text, future_granted_at, consent_version, selection_basis')
        .eq('application_id', appIdB).maybeSingle();
      check('consentimento registado com texto exato, versão, data e estabelecimento',
        Boolean(c && c.future_opportunity_consent && c.future_granted_at && c.consent_version === 'v3-2026-10' &&
          c.selection_basis === 'rgpd_6_1_b' && c.future_text.includes(`Bar Sol ${P}`) &&
          c.future_text.includes('No autorizo que se compartan con otros establecimientos')));
    }
    res = await call('GET', `/panel/candidaturas/${appIdB}`, { jar: ownerJar });
    check('consentimento futuro dado a B não dá acesso a A (404)', res.status === 404);
    res = await call('GET', '/panel/candidaturas?q=sofia', { jar: ownerJar });
    check('A não encontra o candidato de B na busca', (await text(res)).includes('No hay candidaturas'));
    res = await call('GET', '/panel/candidaturas?q=juan.garcia', { jar: bJar });
    check('B não encontra o candidato de A na busca', (await text(res)).includes('No hay candidaturas'));
    res = await call('GET', `/panel/candidaturas?puesto=${jobId[1]}`, { jar: bJar });
    check('filtro de B com id de vaga de A não devolve nada de A', !(await text(res)).includes('Juan García'));

    console.log('\n— Rate limiting de candidaturas —');
    const spamJar = new Jar();
    let limited = false;
    for (let i = 0; i < 25; i++) { // limite: 20 por hora por IP + negócio
      res = await call('GET', `/r/${slugB}`, { jar: spamJar });
      const c = csrfOf(await text(res));
      res = await call('POST', `/r/${slugB}/apply`, {
        jar: spamJar,
        body: applyBody(null, c, { nombre: 'Test', email: `spam${i}@example.com`, telefono: '600000000' })
      });
      if (res.status === 303 && locationText(res).includes('demasiadas candidaturas')) { limited = true; break; }
    }
    check('limite de candidaturas por IP volta à página com o aviso', limited);

    console.log('\n— Cabeçalhos de segurança, cache e indexação —');
    res = await call('GET', `/r/${slugA}`);
    {
      const h = (n) => res.headers.get(n) || '';
      check('CSP sem unsafe-inline, com object-src none e frame-ancestors none',
        h('content-security-policy').includes("script-src 'self'") && !h('content-security-policy').includes('unsafe-inline') &&
        h('content-security-policy').includes("object-src 'none'") && h('content-security-policy').includes("frame-ancestors 'none'"));
      check('nosniff, X-Frame-Options, Referrer-Policy, Permissions-Policy, COOP',
        h('x-content-type-options') === 'nosniff' && h('x-frame-options') === 'DENY' &&
        h('referrer-policy') === 'strict-origin-when-cross-origin' && h('permissions-policy').includes('camera=()') &&
        h('cross-origin-opener-policy') === 'same-origin');
      check('sem X-Powered-By', !res.headers.get('x-powered-by'));
      check('respostas dinâmicas sem cache', h('cache-control') === 'no-store');
      const cookie = (res.headers.getSetCookie ? res.headers.getSetCookie() : []).join(';');
      check('cookie de sessão HttpOnly e SameSite=Lax', /HttpOnly/i.test(cookie) && /SameSite=Lax/i.test(cookie));
    }
    res = await call('GET', '/panel', { jar: ownerJar });
    check('painel: no-store e noindex',
      (res.headers.get('cache-control') || '') === 'no-store' && (res.headers.get('x-robots-tag') || '').includes('noindex'));
    res = await call('GET', `/r/${slugA}/enviado`);
    check('confirmação de candidatura não indexável', (res.headers.get('x-robots-tag') || '').includes('noindex'));
    res = await call('GET', '/robots.txt');
    html = await text(res);
    check('robots.txt bloqueia painel, admin e confirmações',
      res.status === 200 && html.includes('Disallow: /panel') && html.includes('Disallow: /admin') && html.includes('/enviado'));

    console.log('\n— Exposição de segredos —');
    {
      const secret = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SECRET_KEY || '';
      let leaked = false;
      for (const u of ['/', `/r/${slugA}`, '/js/app.js', '/privacidad', '/login', '/registro']) {
        const body = await text(await call('GET', u));
        if ((secret && body.includes(secret)) || /service_role|SUPABASE_SERVICE/i.test(body)) leaked = true;
      }
      const panelBody = await text(await call('GET', '/panel/restaurante', { jar: ownerJar }));
      if (secret && panelBody.includes(secret)) leaked = true;
      check('chave service_role nunca aparece em respostas HTTP', !leaked);
      res = await call('GET', '/internal/retention');
      check('endpoint de retenção sem segredo → 404', res.status === 404);
      res = await call('GET', '/internal/retention', { headers: { authorization: 'Bearer x' } });
      check('endpoint de retenção com segredo errado → 404', res.status === 404);
      res = await call('GET', '/internal/cleanup');
      check('endpoint de limpeza sem segredo → 404', res.status === 404);
      res = await call('GET', '/internal/cleanup', { headers: { authorization: 'Bearer x' } });
      check('endpoint de limpeza com segredo errado → 404', res.status === 404);
    }

    console.log('\n— Upload: ficheiros maliciosos ou inesperados —');
    {
      const upJar = new Jar();
      const attempt = async (file, extra = {}) => {
        const r1 = await call('GET', `/r/${slugA}`, { jar: upJar });
        const c = csrfOf(await text(r1));
        const r2 = await call('POST', `/r/${slugA}/apply`, {
          jar: upJar,
          body: applyBody(null, c, { nombre: 'Up', email: `up${Math.random()}@example.com`, __file: file, ...extra })
        });
        return { status: r2.status, html: await text(r2) };
      };
      const cases = [
        ['PDF com JavaScript', { name: 'cv.pdf', type: 'application/pdf', data: Buffer.from('%PDF-1.4\n1 0 obj<< /OpenAction << /S /JavaScript /JS (app.alert(1)) >> >>endobj\n%%EOF\n', 'latin1') }, 'elementos activos'],
        ['PDF com nome ofuscado (/J#61vaScript)', { name: 'cv.pdf', type: 'application/pdf', data: Buffer.from('%PDF-1.4\n<< /S /J#61vaScript >>\n%%EOF\n', 'latin1') }, 'elementos activos'],
        ['PDF com ficheiro embebido', { name: 'cv.pdf', type: 'application/pdf', data: Buffer.from('%PDF-1.4\n<< /Type /EmbeddedFile >>\n%%EOF\n', 'latin1') }, 'elementos activos'],
        ['PDF truncado/corrompido', { name: 'cv.pdf', type: 'application/pdf', data: Buffer.from('%PDF-1.4\n1 0 obj << /Type /Catalog', 'latin1') }, 'incompleto o dañado'],
        ['executável renomeado .pdf', { name: 'cv.pdf', type: 'application/pdf', data: Buffer.from('MZ\x90\x00\x03\x00\x00\x00', 'latin1') }, 'no es un PDF válido'],
        ['MIME falso (PNG declarado como PDF)', { name: 'cv.pdf', type: 'application/pdf', data: PNG }, 'no es un PDF válido'],
        ['SVG', { name: 'cv.svg', type: 'image/svg+xml', data: Buffer.from('<svg onload="alert(1)"/>') }, 'Solo se aceptan archivos PDF'],
        ['ZIP', { name: 'cv.zip', type: 'application/zip', data: Buffer.from('PK\x03\x04', 'latin1') }, 'Solo se aceptan archivos PDF']
      ];
      for (const [label, file, msg] of cases) {
        const r = await attempt(file);
        check(`upload rejeitado: ${label}`, r.status === 422 && r.html.includes(msg), `status=${r.status}`);
      }
      const big = Buffer.concat([PDF, Buffer.alloc(6 * 1024 * 1024, 0x20), Buffer.from('\n%%EOF\n')]);
      const rb = await attempt({ name: 'grande.pdf', type: 'application/pdf', data: big });
      check('upload rejeitado: PDF acima do limite', rb.status === 422 && rb.html.includes('supera el límite'));
    }

    console.log('\n— Candidaturas duplicadas não revelam nada —');
    {
      const before = (await sb.from('applications').select('id', { count: 'exact', head: true }).eq('restaurant_id', ridA.id)).count;
      const dJar = new Jar();
      res = await call('GET', `/r/${slugA}`, { jar: dJar });
      const c = csrfOf(await text(res));
      res = await call('POST', `/r/${slugA}/apply`, { jar: dJar, body: applyBody(null, c) }); // mesmo email do Juan
      check('duplicado recebe a mesma resposta que um envio aceite',
        res.status === 302 && (res.headers.get('location') || '').endsWith('/enviado'));
      const after = (await sb.from('applications').select('id', { count: 'exact', head: true }).eq('restaurant_id', ridA.id)).count;
      check('duplicado não é gravado', after === before, `antes=${before} depois=${after}`);
    }

    console.log('\n— Isolamento: B tenta mexer em A (IDOR) —');
    {
      res = await call('GET', '/panel/vagas', { jar: bJar });
      const cB = csrfOf(await text(res));
      const postB = (url, data = {}) => call('POST', url, { jar: bJar, body: form({ _csrf: cB, ...data }) });
      const jobBefore = (await sb.from('jobs').select('title, active').eq('id', jobId[1]).maybeSingle()).data;

      res = await postB(`/panel/vagas/${jobId[1]}/editar`, { titulo: 'HACKEADO' });
      res = await postB(`/panel/vagas/${jobId[1]}/toggle`);
      res = await postB(`/panel/vagas/${jobId[1]}/eliminar`);
      const jobAfter = (await sb.from('jobs').select('title, active').eq('id', jobId[1]).maybeSingle()).data;
      check('B não edita, desativa nem apaga vaga de A',
        Boolean(jobAfter) && jobAfter.title === jobBefore.title && jobAfter.active === jobBefore.active);

      const idor = [
        ['estado', `/panel/candidaturas/${appId}/estado`, { status: 'rechazado' }],
        ['nota', `/panel/candidaturas/${appId}/notas`, { nota: 'nota de B' }],
        ['favorito', `/panel/candidaturas/${appId}/favorito`, {}],
        ['eliminar', `/panel/candidaturas/${appId}/eliminar`, {}],
        ['suprimir candidato', `/panel/candidaturas/${appId}/eliminar-candidato`, { confirmo: '1' }],
        ['bloqueio', `/panel/candidaturas/${appId}/bloqueo`, { accion: 'activar', motivo: 'xxxxxxxx' }],
        ['retirar consentimento', `/panel/candidaturas/${appId}/retirar-consentimiento`, {}]
      ];
      for (const [label, url, data] of idor) {
        res = await postB(url, data);
        check(`B → ${label} em candidatura de A → 404`, res.status === 404, `status=${res.status}`);
      }
      res = await call('GET', `/panel/candidaturas/${appId}/exportar`, { jar: bJar });
      check('B → exportar candidato de A → 404', res.status === 404);
      const { data: still } = await sb.from('applications').select('status, favorite, legal_hold').eq('id', appId).maybeSingle();
      const { count: notesB } = await sb.from('application_notes').select('id', { count: 'exact', head: true }).eq('application_id', appId).eq('body', 'nota de B');
      check('candidatura de A intacta após tentativas de B', Boolean(still) && still.status === 'contactar' && !still.legal_hold && notesB === 0);

      /* Ids vizinhos que NÃO são de B (os de B, B pode abrir legitimamente). */
      const { data: cvRows } = await sb.from('cvs').select('id, restaurant_id')
        .gte('id', Number(cvId) - 5).lte('id', Number(cvId) + 40);
      const foreign = (cvRows || []).filter((r) => r.restaurant_id !== ridB.id).map((r) => r.id);
      let guessed = false;
      for (const id of foreign) {
        const r = await call('GET', `/panel/cv/${id}`, { jar: bJar });
        if (r.status === 200) guessed = true;
      }
      check('B a adivinhar ids de CV de outros tenants → nenhum acessível', foreign.length > 0 && !guessed, `testados=${foreign.length}`);
      res = await call('GET', '/panel/candidaturas/abc', { jar: bJar });
      check('id não numérico → 404 (sem erro 500)', res.status === 404);
      res = await call('GET', '/panel/candidaturas/999999999999', { jar: bJar });
      const r404a = await text(res);
      res = await call('GET', `/panel/candidaturas/${appId}`, { jar: bJar });
      const r404b = await text(res);
      check('id inexistente e id de outro tenant dão a mesma resposta (sem enumeração)',
        res.status === 404 && r404a === r404b);
      res = await call('GET', `/r/${slugA}-nao-existe`);
      check('slug inexistente → 404', res.status === 404);
    }

    console.log('\n— Reserva só com consentimento —');
    res = await call('GET', `/panel/candidaturas/${appId}`, { jar: ownerJar });
    const resCsrf = csrfOf(await text(res));
    res = await call('POST', `/panel/candidaturas/${appId}/estado`, { jar: ownerJar, body: form({ status: 'reserva', _csrf: resCsrf }) });
    check('reserva sem consentimento recusada',
      res.status === 302 && locationText(res).includes('Para el futuro'));
    {
      const { data: st } = await sb.from('applications').select('status, future_interest').eq('id', appId).maybeSingle();
      check('estado e future_interest inalterados', st.status === 'contactar' && st.future_interest === false);
    }

    console.log('\n— Notas: aviso sobre características protegidas —');
    res = await call('POST', `/panel/candidaturas/${appId}/notas`, {
      jar: ownerJar, body: form({ nota: 'Está embarazada, no contratar.', _csrf: resCsrf })
    });
    check('nota com característica protegida não é gravada sem confirmação',
      res.status === 302 && locationText(res).includes('no se ha guardado'));
    {
      const { count } = await sb.from('application_notes').select('id', { count: 'exact', head: true }).eq('application_id', appId).ilike('body', '%embarazada%');
      check('nota sensível não está na BD', count === 0);
    }
    res = await call('POST', `/panel/candidaturas/${appId}/notas`, {
      jar: ownerJar, body: form({ nota: 'Necesita adaptación del puesto por discapacidad (lo pidió ella).', confirmar_sensible: '1', _csrf: resCsrf })
    });
    check('nota com confirmação explícita é gravada', res.status === 302);
    {
      const logs = await logsEventually(() => sb.from('security_logs').select('event, detail').eq('restaurant_id', ridA.id)
        .in('event', ['nota_sensible_bloqueada', 'nota_sensible_confirmada']), 2);
      check('bloqueio e confirmação registados sem o texto da nota',
        (logs || []).length >= 2 && logs.every((l) => !/embarazada|discapacidad/i.test(l.detail)));
    }

    console.log('\n— Pedido de direitos (canal funcional) —');
    {
      const rJar = new Jar();
      res = await call('GET', `/r/${slugA}/privacidad`, { jar: rJar });
      const c = csrfOf(await text(res));
      res = await call('POST', `/r/${slugA}/derechos`, {
        jar: rJar, body: form({ tipo: 'acceso', nombre: 'Juan García', email: 'juan.garcia@example.com', mensaje: 'Quiero mis datos', _csrf: c })
      });
      html = await text(res);
      const ref = (html.match(/FCH-[0-9A-F]+/) || [])[0];
      check('pedido registado com referência opaca', res.status === 200 && Boolean(ref));
      res = await call('POST', `/r/${slugA}/derechos`, {
        jar: rJar, body: form({ tipo: 'acceso', nombre: 'Nadie', email: 'nadie-existe@example.com', _csrf: c })
      });
      check('mesma resposta para email sem candidatura (sem enumeração)', res.status === 200 && /FCH-[0-9A-F]+/.test(await text(res)));

      res = await call('GET', '/panel/derechos', { jar: ownerJar });
      html = await text(res);
      check('A vê o pedido, com prazo, e as candidaturas do titular',
        html.includes(ref) && html.includes('Plazo') && html.includes(`/panel/candidaturas/${appId}`));
      res = await call('GET', '/panel/derechos', { jar: bJar });
      check('B não vê pedidos de A', !(await text(res)).includes(ref));
      const { data: rr } = await sb.from('rights_requests').select('id, due_at, created_at').eq('public_ref', ref).maybeSingle();
      const days = (Date.parse(rr.due_at) - Date.parse(rr.created_at)) / 86400000;
      check('prazo de resposta ≈ 1 mês (art. 12.3)', days >= 28 && days <= 31.5, `dias=${days}`);
      res = await call('GET', '/panel/vagas', { jar: bJar });
      const cB2 = csrfOf(await text(res));
      res = await call('POST', `/panel/derechos/${rr.id}`, { jar: bJar, body: form({ estado: 'resuelta', _csrf: cB2 }) });
      check('B não altera pedido de A → 404', res.status === 404);
      res = await call('POST', `/panel/derechos/${rr.id}`, { jar: ownerJar, body: form({ estado: 'resuelta', nota: 'Exportación enviada', _csrf: resCsrf }) });
      check('A resolve o pedido', res.status === 302);
    }

    console.log('\n— Acesso/portabilidade: exportação —');
    res = await call('GET', `/panel/candidaturas/${appId}/exportar`, { jar: ownerJar });
    {
      const body = await text(res);
      let json = null;
      try { json = JSON.parse(body); } catch { /* inválido */ }
      check('exportação JSON em attachment',
        res.status === 200 && (res.headers.get('content-disposition') || '').startsWith('attachment') && Boolean(json));
      check('exportação inclui notas, histórico e base jurídica',
        Boolean(json) && json.candidate.email === 'juan.garcia@example.com' &&
        json.applications[0].notes.some((n) => n.body.includes('Llamar el viernes')) &&
        json.applications[0].history.length > 0 && json.applications[0].consent.selection_basis === 'rgpd_6_1_b');
      check('exportação não inclui outros candidatos', !body.includes('lucia@example.com') && !body.includes('sofia@example.com'));
    }

    console.log('\n— Retirada de consentimento e supressão (B: Sofía) —');
    res = await call('GET', `/panel/candidaturas/${appIdB}`, { jar: bJar });
    const cSof = csrfOf(await text(res));
    res = await call('POST', `/panel/candidaturas/${appIdB}/retirar-consentimiento`, { jar: bJar, body: form({ _csrf: cSof }) });
    check('retirada do consentimento registada', res.status === 302);
    {
      const { data: c } = await sb.from('consents').select('future_withdrawn_at').eq('application_id', appIdB).maybeSingle();
      check('data de retirada gravada', Boolean(c && c.future_withdrawn_at));
    }
    const { data: sofCv } = await sb.from('cvs').select('storage_path').eq('application_id', appIdB).maybeSingle();
    res = await call('POST', `/panel/candidaturas/${appIdB}/eliminar-candidato`, { jar: bJar, body: form({ _csrf: cSof }) });
    check('supressão exige confirmação', res.status === 302 && locationText(res).includes('confirmación'));
    res = await call('POST', `/panel/candidaturas/${appIdB}/eliminar-candidato`, { jar: bJar, body: form({ _csrf: cSof, confirmo: '1' }) });
    check('supressão do candidato', res.status === 302 && locationText(res).includes('suprimidos'));
    {
      const { count: left } = await sb.from('candidates').select('id', { count: 'exact', head: true }).eq('restaurant_id', ridB.id).eq('email', 'sofia@example.com');
      const { data: dl } = await sb.storage.from('cvs').download(sofCv.storage_path);
      check('candidato e CV apagados (BD e Storage)', left === 0 && !dl);
      const logs = await logsEventually(() => sb.from('security_logs').select('detail').eq('event', 'candidato_suprimido').eq('restaurant_id', ridB.id), 1);
      check('supressão auditada sem dados pessoais', (logs || []).length === 1 && !/sofia|Sofía/i.test(logs[0].detail));
    }

    console.log('\n— Auditoria e minimização dos logs —');
    {
      const cvLogs = await logsEventually(() => sb.from('security_logs').select('event, detail').eq('restaurant_id', ridA.id).in('event', ['cv_visto', 'cv_descargado']), 2);
      check('acessos ao CV auditados (ver e descarregar)',
        (cvLogs || []).some((l) => l.event === 'cv_visto') && (cvLogs || []).some((l) => l.event === 'cv_descargado'));
      const appLogs = await logsEventually(() => sb.from('security_logs').select('ip, user_agent, detail').eq('restaurant_id', ridA.id).eq('event', 'candidatura_enviada'), 1);
      check('logs de candidatos com IP truncado, sem user-agent e sem email',
        (appLogs || []).length > 0 && appLogs.every((l) => /\.0$|::\/48$|^$/.test(l.ip) && l.user_agent === '' && !/@/.test(l.detail)));
      const { count: anonRows } = await sb.from('sessions').select('token_hash', { count: 'exact', head: true }).is('user_id', null).gte('created_at', T0);
      check('páginas públicas não criam linhas em sessions', anonRows === 0);
    }

    console.log('\n— Login: enumeração, força bruta, sessões —');
    {
      const lj = new Jar();
      res = await call('GET', '/login', { jar: lj });
      const c = csrfOf(await text(res));
      const r1 = await call('POST', '/login', { jar: lj, body: form({ email: `ana-${P}@granada.es`, password: 'errada-123', _csrf: c }) });
      const h1 = await text(r1);
      const r2 = await call('POST', '/login', { jar: lj, body: form({ email: `naoexiste-${P}@x.es`, password: 'errada-123', _csrf: c }) });
      const h2 = await text(r2);
      check('email inexistente e senha errada: resposta idêntica', r1.status === 401 && r2.status === 401 &&
        h1.includes('Email o contraseña incorrectos') && h2.includes('Email o contraseña incorrectos'));
      const fl = await logsEventually(() => sb.from('security_logs').select('detail').eq('event', 'login_fallido').order('id', { ascending: false }).limit(5), 1);
      check('login falhado não grava o email em claro', (fl || []).every((l) => !l.detail.includes('@')));

      let blocked = false;
      for (let i = 0; i < 12; i += 1) {
        const r = await call('POST', '/login', { jar: lj, body: form({ email: `bruta-${P}@x.es`, password: `x${i}xxxxxxxx`, _csrf: c }) });
        if (r.status === 429) { blocked = true; break; }
      }
      check('força bruta contra uma conta → 429', blocked);

      /* Mudar a senha termina as OUTRAS sessões. */
      const second = new Jar();
      res = await call('GET', '/login', { jar: second });
      const c2 = csrfOf(await text(res));
      res = await call('POST', '/login', { jar: second, body: form({ email: `ana-${P}@granada.es`, password: 'Secreta123', _csrf: c2 }) });
      check('segunda sessão de A', res.status === 302);
      res = await call('GET', '/panel/configuracion', { jar: ownerJar });
      const cs = csrfOf(await text(res));
      res = await call('POST', '/panel/configuracion', { jar: ownerJar, body: form({ password_actual: 'Secreta123', password_nuevo: 'corta', password_repetir: 'corta', _csrf: cs }) });
      check('senha nova curta recusada', locationText(res).includes('al menos 10'));
      res = await call('POST', '/panel/configuracion', { jar: ownerJar, body: form({ password_actual: 'Secreta123', password_nuevo: 'OutraSecreta456', password_repetir: 'OutraSecreta456', _csrf: cs }) });
      check('alterar senha', res.status === 302);
      res = await call('GET', '/panel', { jar: second });
      check('outra sessão terminada após mudar a senha', res.status === 302 && (res.headers.get('location') || '').includes('/login'));
      res = await call('GET', '/panel', { jar: ownerJar });
      check('sessão atual mantém-se', res.status === 200);
    }

    console.log('\n— Recuperação de senha (B) —');
    {
      const fj = new Jar();
      res = await call('GET', '/recuperar', { jar: fj });
      const c = csrfOf(await text(res));
      const ra = await text(await call('POST', '/recuperar', { jar: fj, body: form({ email: `berto-${P}@barsol.es`, _csrf: c }) }));
      const rb = await text(await call('POST', '/recuperar', { jar: fj, body: form({ email: `ninguem-${P}@x.es`, _csrf: c }) }));
      check('recuperação: resposta idêntica exista ou não a conta', ra === rb && ra.includes('Si existe una cuenta'));
      const { data: uB } = await sb.from('users').select('id').eq('email', `berto-${P}@barsol.es`).maybeSingle();
      check('sem SMTP: a resposta fala do equipo, não de um enlace', ra.includes('equipo de Fíchame'));
      const { data: tok } = await sb.from('password_resets').select('token_hash').eq('user_id', uB.id);
      check('sem SMTP: nenhum token criado (o link nunca chegaria)', (tok || []).length === 0);
      const { data: help } = await sb.from('password_help_requests').select('id').eq('user_id', uB.id);
      check('sem SMTP: fica um pedido para o admin', (help || []).length === 1);
      await call('POST', '/recuperar', { jar: fj, body: form({ email: `berto-${P}@barsol.es`, _csrf: c }) });
      const { data: help2 } = await sb.from('password_help_requests').select('id').eq('user_id', uB.id);
      check('pedido repetido não duplica', (help2 || []).length === 1);

      /* Com SMTP o token iria por email: cria-se um conhecido diretamente na
       * BD para testar o fluxo de reposição por link. */
      const known = crypto.randomBytes(32).toString('hex');
      await sb.from('password_resets').insert({ token_hash: crypto.createHash('sha256').update(known).digest('hex'), user_id: uB.id, expires_at: new Date(Date.now() + 600000).toISOString() });
      const expired = crypto.randomBytes(32).toString('hex');
      await sb.from('password_resets').insert({ token_hash: crypto.createHash('sha256').update(expired).digest('hex'), user_id: uB.id, expires_at: new Date(Date.now() - 1000).toISOString() });

      res = await call('GET', '/recuperar/nueva', { jar: fj });
      check('página de reposição sem Referer', (res.headers.get('referrer-policy') || '') === 'no-referrer');
      const c3 = csrfOf(await text(res));
      res = await call('POST', '/recuperar/nueva', { jar: fj, body: form({ token: expired, password: 'NovaSenha789', password2: 'NovaSenha789', _csrf: c3 }) });
      check('token expirado recusado', res.status === 400);
      res = await call('POST', '/recuperar/nueva', { jar: fj, body: form({ token: known, password: 'NovaSenha789', password2: 'NovaSenha789', _csrf: c3 }) });
      check('reposição com token válido', res.status === 302 && (res.headers.get('location') || '').includes('/login'));
      res = await call('GET', '/panel', { jar: bJar });
      check('todas as sessões de B terminadas após reposição', res.status === 302);
      const fj2 = new Jar();
      res = await call('GET', '/recuperar/nueva', { jar: fj2 });
      const c4 = csrfOf(await text(res));
      res = await call('POST', '/recuperar/nueva', { jar: fj2, body: form({ token: known, password: 'OutraNova789', password2: 'OutraNova789', _csrf: c4 }) });
      check('token de uso único: reutilização recusada', res.status === 400);
    }

    console.log('\n— Retenção (simulação, não altera dados) —');
    {
      const sim = spawnSync(process.execPath, ['src/db/retention.js'], { cwd: root, env: process.env, encoding: 'utf8' });
      check('npm run retention simula por omissão', sim.status === 0 && sim.stdout.includes('simulação') && sim.stdout.includes('Nada foi alterado'),
        (sim.stderr || '').trim());
      const { data: ru } = await sb.from('applications').select('retention_until').eq('id', appId).maybeSingle();
      check('candidatura tem data de supressão calculada', Boolean(ru && ru.retention_until));
    }

    console.log('\n— Área admin —');
    const adminEmail = `admin-${P}@test.local`;
    /* Senha aleatória por execução: se a limpeza falhar, a conta que fica
     * não tem uma senha conhecida (versionada no repositório). */
    const adminPassword = `Adm!${crypto.randomBytes(12).toString('base64url')}`;
    const seed = spawnSync(process.execPath, ['src/db/seed.js'], {
      cwd: root,
      env: { ...process.env, ADMIN_EMAIL: adminEmail, ADMIN_PASSWORD: adminPassword },
      encoding: 'utf8'
    });
    check('seed do admin', seed.status === 0, (seed.stderr || '').trim());

    const adminJar = new Jar();
    res = await call('GET', '/login', { jar: adminJar });
    const adminCsrf = csrfOf(await text(res));
    res = await call('POST', '/login', {
      jar: adminJar, body: form({ email: adminEmail, password: adminPassword, _csrf: adminCsrf })
    });
    check('login admin', res.status === 302 && res.headers.get('location') === '/admin');
    res = await call('GET', '/admin', { jar: adminJar });
    html = await text(res);
    check('admin vê métricas',
      res.status === 200 && html.includes('Establecimiento') && html.includes(`Restaurante Granada ${P}`));
    /* O pedido de B fechou-se quando B repôs a senha pelo link (acima):
     * abre-se outro, como se B voltasse a pedir. */
    {
      const { data: uB } = await sb.from('users').select('id').eq('email', `berto-${P}@barsol.es`).maybeSingle();
      await sb.from('password_help_requests').insert({ user_id: uB.id });
    }
    res = await call('GET', '/admin/usuarios', { jar: adminJar });
    html = await text(res);
    check('admin vê usuários', res.status === 200 && html.includes(`ana-${P}@granada.es`));
    check('admin vê o pedido de contraseña de B', html.includes('Solicitudes de contraseña') && html.includes('Pide contraseña'));

    console.log('\n— Admin gera link de recuperação —');
    {
      const { data: uB } = await sb.from('users').select('id').eq('email', `berto-${P}@barsol.es`).maybeSingle();
      const { data: uAdmin } = await sb.from('users').select('id').eq('email', adminEmail).maybeSingle();
      const ac = csrfOf(html);
      const LINK_RE = /\/recuperar\/nueva#t=([a-f0-9]{64})/;
      res = await call('POST', `/admin/usuarios/${uAdmin.id}/enlace`, { jar: adminJar, body: form({ _csrf: ac }) });
      check('não gera link para um administrador', res.status === 302 && (res.headers.get('location') || '').includes('err='));
      res = await call('POST', `/admin/usuarios/${uB.id}/enlace`, { jar: adminJar, body: form({ _csrf: 'x' }) });
      check('gerar link sem CSRF recusado', res.status === 403);
      res = await call('POST', `/admin/usuarios/${uB.id}/enlace`, { jar: adminJar, body: form({ _csrf: ac }) });
      const first = (await text(res)).match(LINK_RE);
      res = await call('POST', `/admin/usuarios/${uB.id}/enlace`, { jar: adminJar, body: form({ _csrf: ac }) });
      const page = await text(res);
      const m = page.match(LINK_RE);
      check('admin vê o link e o botão de email', res.status === 200 && Boolean(m) && page.includes('mailto:'));
      check('página do link sem cache nem Referer',
        (res.headers.get('cache-control') || '').includes('no-store') && res.headers.get('referrer-policy') === 'no-referrer');
      res = await call('GET', '/admin/usuarios', { jar: adminJar });
      check('pedido mostra «Enlace generado»', (await text(res)).includes('Enlace generado'));

      const rj = new Jar();
      res = await call('GET', '/recuperar/nueva', { jar: rj });
      const rc = csrfOf(await text(res));
      res = await call('POST', '/recuperar/nueva', { jar: rj, body: form({ token: first && first[1], password: 'AdminNova7890', password2: 'AdminNova7890', _csrf: rc }) });
      check('gerar outro link anula o anterior', res.status === 400);
      res = await call('POST', '/recuperar/nueva', { jar: rj, body: form({ token: m && m[1], password: 'AdminNova7890', password2: 'AdminNova7890', _csrf: rc }) });
      check('dono escolhe a senha com o link do admin', res.status === 302 && (res.headers.get('location') || '').includes('/login'));
      const { data: helpLeft } = await sb.from('password_help_requests').select('id').eq('user_id', uB.id);
      check('pedido fechado quando o dono muda a senha', (helpLeft || []).length === 0);
      const lj = new Jar();
      res = await call('GET', '/login', { jar: lj });
      const lc = csrfOf(await text(res));
      res = await call('POST', '/login', { jar: lj, body: form({ email: `berto-${P}@barsol.es`, password: 'NovaSenha789', _csrf: lc }) });
      check('senha antiga deixa de funcionar', res.status === 401);
      res = await call('POST', '/login', { jar: lj, body: form({ email: `berto-${P}@barsol.es`, password: 'AdminNova7890', _csrf: lc }) });
      check('login com a senha nova', res.status === 302);
    }
    res = await call('GET', '/admin/logs', { jar: adminJar });
    html = await text(res);
    check('admin vê logs de segurança',
      res.status === 200 && html.includes('Logs de seguridad') && html.includes('registro_restaurante'));
    check('acesso admin a dados pessoais fica registado', html.includes('admin_lista_usuarios'));
    res = await call('GET', '/admin', { jar: ownerJar });
    check('owner sem acesso a /admin → 404', res.status === 404);
    res = await call('GET', '/admin/divulgacion', { jar: adminJar });
    html = await text(res);
    check('admin vê o QR de divulgação para /conoce',
      res.status === 200 && html.includes('<svg') && html.includes('/conoce') && html.includes('Copiar enlace'));
    res = await call('GET', '/admin/divulgacion/qr.png', { jar: adminJar });
    check('admin descarrega o QR em PNG',
      res.status === 200 && res.headers.get('content-type') === 'image/png' &&
      (res.headers.get('content-disposition') || '').startsWith('attachment'));
    res = await call('GET', '/admin/divulgacion/qr.svg', { jar: adminJar });
    check('admin descarrega o QR em SVG',
      res.status === 200 && (res.headers.get('content-type') || '').startsWith('image/svg+xml') && (await text(res)).includes('<svg'));
    console.log('\n— Reportes e erros do servidor —');
    res = await call('GET', '/__test/erro', { jar: ownerJar });
    html = await text(res);
    const errRef = (html.match(/Código de referencia: <strong>([A-F0-9]{6})<\/strong>/) || [])[1];
    check('erro 500 mostra código de referência', res.status === 500 && Boolean(errRef));
    check('dono pode reportar o erro a partir da página',
      html.includes(`/panel/reportar?ref=${errRef}&amp;desde=%2F__test%2Ferro`));
    {
      let row = null;
      for (let i = 0; i < 10 && !row; i++) {
        const { data } = await sb.from('error_events').select('*').eq('ref', errRef || '-').maybeSingle();
        row = data;
        if (!row) await new Promise((r) => setTimeout(r, 300));
      }
      check('erro registado em error_events', Boolean(row && row.path === '/__test/erro' && row.restaurant_id));
      check('mensagem do erro sem email nem telefone',
        Boolean(row && row.message.includes('[email]') && !row.message.includes('ana.teste@') && !row.message.includes('123 456')));
    }
    res = await call('GET', '/__test/erro');
    html = await text(res);
    check('visitante vê o código mas não o botão de reporte',
      res.status === 500 && html.includes('Código de referencia') && !html.includes('/panel/reportar'));

    res = await call('GET', `/panel/reportar?ref=${errRef}&desde=/__test/erro`, { jar: ownerJar });
    html = await text(res);
    check('formulário de reporte com código e página', res.status === 200 &&
      html.includes(`value="${errRef}"`) && html.includes('value="/__test/erro"') && html.includes('No incluyas datos de candidatos'));
    const repCsrf = csrfOf(html);
    res = await call('POST', '/panel/reportar', { jar: ownerJar, body: form({ _csrf: repCsrf, tipo: 'error', mensaje: ' ', ref: errRef }) });
    check('reporte vazio é recusado', res.status === 302 && (res.headers.get('location') || '').includes('err='));
    res = await call('POST', '/panel/reportar', { jar: ownerJar, body: form({
      _csrf: repCsrf, tipo: 'error', mensaje: `Al guardar falla ${P}`, ref: errRef, pagina: '/__test/erro?x=1'
    }) });
    check('reporte enviado', res.status === 302 && (res.headers.get('location') || '').includes('ok='));
    res = await call('POST', '/panel/reportar', { jar: ownerJar, body: form({ tipo: 'duda', mensaje: 'sem csrf' }) });
    check('reporte sem CSRF → 403', res.status === 403);
    {
      const { data } = await sb.from('problem_reports').select('*').ilike('message', `%${P}%`).maybeSingle();
      check('reporte gravado com negócio, código e página sem query',
        Boolean(data && data.restaurant_id && data.error_ref === errRef && data.page === '/__test/erro' && data.status === 'nuevo'));
    }
    res = await call('GET', '/panel/reportar', { jar: ownerJar });
    check('dono vê os seus reportes', (await text(res)).includes(`Al guardar falla ${P}`));

    for (const u of ['/admin/reportes']) {
      res = await call('GET', u);
      check(`anónimo → ${u} → 404`, res.status === 404);
      res = await call('GET', u, { jar: ownerJar });
      check(`dono → ${u} → 404`, res.status === 404);
    }
    res = await call('GET', '/admin/reportes', { jar: adminJar });
    html = await text(res);
    check('admin vê o reporte e o erro ligados',
      res.status === 200 && html.includes(`Al guardar falla ${P}`) && html.includes(`id="err-${errRef}"`) && html.includes('Reportado'));
    {
      const repId = (html.match(new RegExp(`id="r-(\\d+)"[\\s\\S]{0,1200}?Al guardar falla ${P}`)) || [])[1];
      res = await call('POST', `/admin/reportes/${repId}/estado`, { jar: adminJar, body: form({ _csrf: csrfOf(html), status: 'resuelto' }) });
      const { data } = await sb.from('problem_reports').select('status').eq('id', Number(repId) || 0).maybeSingle();
      check('admin marca o reporte como resolvido', res.status === 302 && data && data.status === 'resuelto');
      res = await call('POST', `/admin/reportes/${repId}/estado`, { jar: ownerJar, body: form({ _csrf: csrfOf(html), status: 'nuevo' }) });
      const { data: after } = await sb.from('problem_reports').select('status').eq('id', Number(repId) || 0).maybeSingle();
      check('dono não altera estados de reportes', [403, 404].includes(res.status) && after && after.status === 'resuelto', `status=${res.status}`);
    }
    res = await call('GET', '/admin/logs?event=admin_lista_reportes', { jar: adminJar });
    check('acesso do admin aos reportes fica registado', (await text(res)).includes('admin_lista_reportes'));


    console.log('\n— Admin sem acesso a dados de candidatos —');
    for (const u of [`/panel/candidaturas/${appId}`, `/panel/cv/${cvId}`, '/panel/candidaturas', `/panel/candidaturas/${appId}/exportar`, '/panel/derechos']) {
      res = await call('GET', u, { jar: adminJar });
      check(`admin → ${u.replace(/\d+/g, ':id')} → 403`, res.status === 403, `status=${res.status}`);
    }
    res = await call('GET', '/admin/logs', { jar: adminJar });
    html = await text(res);
    check('logs do admin não mostram emails de candidatos', !html.includes('juan.garcia@example.com') && !html.includes('lucia@example.com'));

    console.log('\n— Bloqueio de conta sem enumeração —');
    {
      const { data: uB } = await sb.from('users').select('id').eq('email', `berto-${P}@barsol.es`).maybeSingle();
      res = await call('GET', '/admin/usuarios', { jar: adminJar });
      const ac = csrfOf(await text(res));
      res = await call('POST', `/admin/usuarios/${uB.id}/bloquear`, { jar: adminJar, body: form({ _csrf: ac }) });
      check('admin bloqueia utilizador', res.status === 302);
      const lj = new Jar();
      res = await call('GET', '/login', { jar: lj });
      const c = csrfOf(await text(res));
      res = await call('POST', '/login', { jar: lj, body: form({ email: `berto-${P}@barsol.es`, password: 'senha-errada-1', _csrf: c }) });
      const wrong = await text(res);
      check('conta bloqueada + senha errada: resposta genérica (não revela o bloqueio)',
        res.status === 401 && !wrong.includes('bloqueada'));
      res = await call('POST', '/login', { jar: lj, body: form({ email: `berto-${P}@barsol.es`, password: 'AdminNova7890', _csrf: c }) });
      check('conta bloqueada + senha certa: informa o bloqueio', res.status === 403 && (await text(res)).includes('bloqueada'));

      const { data: rowB } = await sb.from('restaurants').select('id').eq('slug', slugB).maybeSingle();
      res = await call('GET', '/admin', { jar: adminJar });
      const ac2 = csrfOf(await text(res));
      res = await call('POST', `/admin/restaurantes/${rowB.id}/toggle`, { jar: adminJar, body: form({ _csrf: ac2 }) });
      res = await call('GET', `/r/${slugB}`);
      const inactive = await text(res);
      const missing = await text(await call('GET', `/r/zz-${P}-inexistente`));
      check('negócio desativado = página 404 igual à de um inexistente', res.status === 404 && inactive === missing);
      res = await call('GET', `/r/${slugB}/privacidad`);
      check('privacidade de negócio desativado continua acessível para exercer direitos', res.status === 200);
    }

    console.log('\n— Contratação (§37, passo 17) —');
    res = await call('GET', `/panel/candidaturas/${appId}`, { jar: ownerJar });
    const hireCsrf = csrfOf(await text(res));
    res = await call('POST', `/panel/candidaturas/${appId}/estado`, {
      jar: ownerJar, body: form({ status: 'contratado', _csrf: hireCsrf })
    });
    check('marcar como contratado', res.status === 302);

    res = await call('GET', '/panel/candidaturas?estado=contratado', { jar: ownerJar });
    check('filtro por contratado encontra o candidato', (await text(res)).includes('Juan García'));

    res = await call('GET', `/panel/candidaturas/${appId}`, { jar: ownerJar });
    check('histórico regista Por contactar → Contratado',
      (await text(res)).includes('Por contactar → Contratado'));

    console.log('\n— Bloqueio legal impede supressão —');
    res = await call('GET', `/panel/candidaturas/${appId}`, { jar: ownerJar });
    const delCsrf = csrfOf(await text(res));
    res = await call('POST', `/panel/candidaturas/${appId}/bloqueo`, { jar: ownerJar, body: form({ accion: 'activar', motivo: '', _csrf: delCsrf }) });
    check('bloqueio exige motivo', locationText(res).includes('motivo'));
    res = await call('POST', `/panel/candidaturas/${appId}/bloqueo`, { jar: ownerJar, body: form({ accion: 'activar', motivo: 'Reclamación laboral en curso', _csrf: delCsrf }) });
    check('bloqueio ativado', res.status === 302);
    res = await call('POST', `/panel/candidaturas/${appId}/eliminar`, { jar: ownerJar, body: form({ _csrf: delCsrf }) });
    check('eliminar com bloqueio é recusado', locationText(res).includes('bloqueo'));
    res = await call('GET', `/panel/candidaturas/${appId}`, { jar: ownerJar });
    check('candidatura bloqueada continua a existir', res.status === 200);
    res = await call('POST', `/panel/candidaturas/${appId}/bloqueo`, { jar: ownerJar, body: form({ accion: 'retirar', _csrf: delCsrf }) });
    check('bloqueio retirado', res.status === 302);

    console.log('\n— Exclusão segura —');
    const { count: notifBefore } = await sb.from('notifications')
      .select('id', { count: 'exact', head: true }).eq('application_id', appId);
    res = await call('POST', `/panel/candidaturas/${appId}/eliminar`, { jar: ownerJar, body: form({ _csrf: delCsrf }) });
    check('eliminar candidatura', res.status === 302);
    const { count: notifAfter } = await sb.from('notifications')
      .select('id', { count: 'exact', head: true }).eq('application_id', appId);
    const { count: orphans } = await sb.from('notifications')
      .select('id', { count: 'exact', head: true }).eq('restaurant_id', ridA.id).eq('type', 'nueva_candidatura').is('application_id', null);
    check('notificações da candidatura eliminada também são apagadas',
      notifBefore > 0 && notifAfter === 0 && orphans === 0, `antes=${notifBefore} depois=${notifAfter} órfãs=${orphans}`);
    res = await call('GET', `/panel/candidaturas/${appId}`, { jar: ownerJar });
    check('candidatura eliminada → 404', res.status === 404);
    res = await call('GET', `/panel/cv/${cvId}`, { jar: ownerJar });
    check('CV da candidatura eliminada → 404', res.status === 404);

    const { data: objAfter } = await sb.storage.from('cvs').list(`r/${ridA.id}`);
    const before = (objA || []).length;
    const after = (objAfter || []).length;
    check('ficheiro CV removido do Storage', after === before - 1, `antes=${before} depois=${after}`);
  } catch (err) {
    failed += 1;
    failures.push(`ERRO FATAL: ${err.message}`);
    console.error('\nERRO FATAL:', err);
  } finally {
    server.kill();
    await cleanup(sb);
  }

  console.log(`\nResultado: ${passed} ok, ${failed} falharam`);
  if (failures.length) {
    console.log('Falhas:');
    failures.forEach((f) => console.log(`  - ${f}`));
  }
  process.exit(failed === 0 ? 0 : 1);
}

main();

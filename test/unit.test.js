'use strict';

/* Testes unitários — sem rede nem Supabase. Executar: npm run test:unit
 *
 * Cobrem as peças de segurança/privacidade que não precisam de BD: validação
 * de PDF, nomes de ficheiro, deteção de características protegidas,
 * truncagem de IP, política de senha, textos de consentimento e cabeçalhos
 * HTTP de rotas estáticas.
 */

const test = require('node:test');
const assert = require('node:assert/strict');

/* A app exige configuração mínima para carregar; valores fictícios chegam
 * porque estes testes não fazem pedidos ao Supabase. */
process.env.SUPABASE_URL = process.env.SUPABASE_URL || 'http://127.0.0.1:54321';
process.env.SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || 'chave-de-teste-unitario';
process.env.GOOGLE_CLIENT_ID = 'cliente-teste.apps.googleusercontent.com';
process.env.GOOGLE_CLIENT_SECRET = 'segredo-teste';

const { inspectPdf, safeFilename, isPdf, sniffImage } = require('../src/middleware/uploads');
const { findProtectedTerms } = require('../src/lib/sensitive');
const { truncateIp, emailTag } = require('../src/lib/privacy');
const { passwordProblem } = require('../src/routes/auth');
const { futureText, interestText, CONSENT_VERSION, PRIVACY_NOTICE_VERSION } = require('../src/lib/consent');
const { hashPassword, verifyPassword, safeEqual } = require('../src/lib/crypto');
const google = require('../src/lib/google');
const { COPY, pickLang } = require('../src/lib/conoce');

const pdf = (body) => Buffer.from(`%PDF-1.4\n${body}\n%%EOF\n`, 'latin1');

test('PDF simples é aceite', () => {
  assert.deepEqual(inspectPdf(pdf('1 0 obj << /Type /Catalog /OpenAction [3 0 R /Fit] >> endobj')), { ok: true });
});

test('PDF com conteúdo ativo é recusado (incl. nomes ofuscados)', () => {
  for (const body of ['<< /S /JavaScript /JS (x) >>', '<< /S /Launch /F (cmd.exe) >>', '<< /Type /EmbeddedFile >>',
    '<< /XFA 5 0 R >>', '<< /S /J#61vaScript >>', '<< /RichMedia 1 >>', '<< /S /SubmitForm >>']) {
    assert.equal(inspectPdf(pdf(body)).reason, 'ACTIVO', body);
  }
});

test('nomes parecidos não dão falso positivo', () => {
  assert.equal(inspectPdf(pdf('<< /JSON 1 /JSXType 2 /Launcher 3 >>')).ok, true);
});

test('PDF truncado, não-PDF e vazio são recusados', () => {
  assert.equal(inspectPdf(Buffer.from('%PDF-1.4\n1 0 obj', 'latin1')).reason, 'CORRUPTO');
  assert.equal(inspectPdf(Buffer.from('MZ\x90\x00', 'latin1')).reason, 'NO_PDF');
  assert.equal(inspectPdf(Buffer.alloc(0)).reason, 'NO_PDF');
  assert.equal(isPdf('não é buffer'), false);
});

test('imagens: só PNG/JPEG/WEBP reais', () => {
  assert.equal(sniffImage(Buffer.from('<svg onload=alert(1)>          ')), null);
  assert.equal(sniffImage(Buffer.from('89504e470d0a1a0a0000000d', 'hex')), 'image/png');
});

test('nome de ficheiro: sem diretórios, controlo nem HTML', () => {
  assert.equal(safeFilename('../../etc/passwd'), 'passwd.pdf');
  assert.equal(safeFilename('..\\..\\win.ini'), 'win.ini.pdf');
  assert.equal(safeFilename('<img src=x onerror=alert(1)>.pdf'), '_img src=x onerror=alert(1)_.pdf');
  assert.equal(safeFilename('a\u0000b\r\n.pdf'), 'a_b__.pdf');
  assert.equal(safeFilename(''), 'cv.pdf');
  assert.equal(safeFilename('...'), 'cv.pdf');
  assert.ok(safeFilename('x'.repeat(500)).length <= 124);
});

test('notas: deteta características protegidas, sem falsos positivos óbvios', () => {
  assert.deepEqual(findProtectedTerms('Está embarazada, no contratar'), ['embaraz']);
  assert.ok(findProtectedTerms('Es musulmana y lleva hiyab').includes('musulm'));
  assert.ok(findProtectedTerms('Muy mayor para el puesto').includes('muy mayor'));
  assert.ok(findProtectedTerms('Afiliado al sindicato').length > 0);
  assert.deepEqual(findProtectedTerms('Buena actitud, sabe integrar equipos, velocidad alta, disponibilidad de tarde'), []);
  assert.deepEqual(findProtectedTerms('2 años en sala. Entrevista el viernes.'), []);
});

test('IP truncado (IPv4 /24, IPv6 /48)', () => {
  assert.equal(truncateIp('203.0.113.77'), '203.0.113.0');
  assert.equal(truncateIp('::ffff:10.1.2.3'), '10.1.2.0');
  assert.equal(truncateIp('2001:db8:aa:bb::1'), '2001:db8:aa::/48');
  assert.equal(truncateIp('lixo'), '');
});

test('emailTag: estável, sem o email, normalizado', () => {
  const t = emailTag('Ana@Example.com ');
  assert.equal(t, emailTag('ana@example.com'));
  assert.ok(!t.includes('ana') && /^e:[a-f0-9]{12}$/.test(t));
});

test('política de senha', () => {
  assert.ok(passwordProblem('curta', 'a@b.es'));
  assert.ok(passwordProblem('1234567890', 'a@b.es'));
  assert.ok(passwordProblem('aaaaaaaaaaaa', 'a@b.es'));
  assert.ok(passwordProblem('juanito2024xx', 'juanito@b.es'));
  assert.equal(passwordProblem('caballo-bateria-grapa', 'a@b.es'), '');
});

test('hash de senha: scrypt com salt individual, verificação em tempo constante', () => {
  const a = hashPassword('uma senha longa');
  const b = hashPassword('uma senha longa');
  assert.notEqual(a, b);
  assert.ok(a.startsWith('scrypt$'));
  assert.ok(verifyPassword('uma senha longa', a));
  assert.ok(!verifyPassword('outra', a));
  assert.ok(!verifyPassword('x', 'lixo'));
  assert.ok(!safeEqual('abc', 'abcd'));
});

test('consentimento futuro: específico do estabelecimento, prazo, sem cessão', () => {
  const t = futureText('Bar Sol', 365);
  assert.ok(t.includes('Bar Sol'));
  assert.ok(t.includes('12 meses'));
  assert.ok(t.includes('No autorizo que se compartan con otros establecimientos'));
  assert.ok(t.includes('retirarlo'));
  assert.ok(interestText('Bar Sol', 180).includes('6 meses'));
  assert.ok(CONSENT_VERSION && PRIVACY_NOTICE_VERSION);
});

test('cabeçalhos de segurança, robots.txt e estáticos (sem BD)', async () => {
  const { createApp } = require('../src/app');
  const app = createApp();
  const server = app.listen(0);
  const base = `http://127.0.0.1:${server.address().port}`;
  try {
    let res = await fetch(`${base}/robots.txt`);
    const body = await res.text();
    assert.equal(res.status, 200);
    assert.ok(body.includes('Disallow: /panel') && body.includes('Disallow: /admin'));
    assert.ok((res.headers.get('content-security-policy') || '').includes("object-src 'none'"));
    assert.equal(res.headers.get('x-frame-options'), 'DENY');
    assert.equal(res.headers.get('x-content-type-options'), 'nosniff');
    assert.equal(res.headers.get('cross-origin-opener-policy'), 'same-origin');
    assert.equal(res.headers.get('x-powered-by'), null);

    res = await fetch(`${base}/css/style.css`);
    assert.equal(res.status, 200);
    assert.ok((res.headers.get('cache-control') || '').includes('max-age'));

    res = await fetch(`${base}/internal/retention`);
    assert.equal(res.status, 404);
  } finally {
    server.close();
  }
});

/* ---------------------------------------------------------------- *
 * Login com Google
 * ---------------------------------------------------------------- */
const jwt = (claims) => ['e30', Buffer.from(JSON.stringify(claims)).toString('base64url'), 'sig'].join('.');
const goodClaims = {
  iss: 'https://accounts.google.com', aud: 'cliente-teste.apps.googleusercontent.com', exp: 2000,
  nonce: 'n1', sub: '1234567890', email: 'Ana@Gmail.com', email_verified: true, name: 'Ana'
};

test('google: id_token válido devolve sub, email normalizado e autoridade', () => {
  const a = google.validateIdToken(jwt(goodClaims), 'n1', 1000);
  assert.deepEqual(a, { sub: '1234567890', email: 'ana@gmail.com', name: 'Ana', authoritative: true });
  assert.equal(google.validateIdToken(jwt({ ...goodClaims, email: 'ana@empresa.es' }), 'n1', 1000).authoritative, false);
  assert.equal(google.validateIdToken(jwt({ ...goodClaims, email: 'ana@empresa.es', hd: 'empresa.es' }), 'n1', 1000).authoritative, true);
});

test('google: id_token com claims erradas é recusado', () => {
  for (const [bad, nonce] of [
    [{ iss: 'https://evil.example' }, 'n1'],
    [{ aud: 'outro-cliente' }, 'n1'],
    [{ exp: 100 }, 'n1'],
    [{}, 'n2'],
    [{ email_verified: false }, 'n1'],
    [{ sub: '' }, 'n1']
  ]) {
    assert.throws(() => google.validateIdToken(jwt({ ...goodClaims, ...bad }), nonce, 1000), undefined, JSON.stringify(bad));
  }
  assert.throws(() => google.validateIdToken('nao-e-jwt', 'n1', 1000));
});

test('google: registo pendente assinado, à prova de alteração e com validade', () => {
  const v = google.signPending({ sub: 's', email: 'a@gmail.com', name: 'A' }, 0);
  assert.equal(google.verifyPending(v, 1000).sub, 's');
  assert.equal(google.verifyPending(v, google.PENDING_TTL_MS + 1), null);
  const [payload, mac] = v.split('.');
  const forged = Buffer.from(JSON.stringify({ sub: 'outro', email: 'x@gmail.com', exp: 9e15 })).toString('base64url');
  assert.equal(google.verifyPending(`${forged}.${mac}`, 1000), null);
  assert.equal(google.verifyPending(payload, 1000), null);
});

test('google: URL de autorização com PKCE S256, state e nonce', () => {
  const flow = google.newFlow('login');
  const url = new URL(google.authUrl(flow));
  assert.equal(url.origin, 'https://accounts.google.com');
  assert.equal(url.searchParams.get('state'), flow.state);
  assert.equal(url.searchParams.get('nonce'), flow.nonce);
  assert.equal(url.searchParams.get('code_challenge_method'), 'S256');
  assert.notEqual(url.searchParams.get('code_challenge'), flow.verifier);
  assert.equal(url.searchParams.get('scope'), 'openid email profile');
});

test('/conoce: língua por ?lang=, depois a do site (req.lang), por omissão espanhol', () => {
  const req = (lang, siteLang) => ({ query: lang ? { lang } : {}, headers: {}, lang: siteLang });
  assert.equal(pickLang(req()), 'es');
  assert.equal(pickLang(req('en')), 'en');
  assert.equal(pickLang(req('EN')), 'en');
  assert.equal(pickLang(req('pt')), 'pt');
  assert.equal(pickLang(req('fr')), 'es');
  assert.equal(pickLang(req('', 'en')), 'en');
  assert.equal(pickLang(req('', 'pt')), 'pt');
  assert.equal(pickLang(req('fr', 'pt')), 'pt');
  assert.equal(pickLang(req('es', 'en')), 'es');
});

test('/conoce: espanhol, inglês e português têm exatamente a mesma estrutura', () => {
  const shape = (v) => Array.isArray(v) ? v.map(shape)
    : v && typeof v === 'object' ? Object.fromEntries(Object.keys(v).sort().map((k) => [k, shape(v[k])]))
    : typeof v;
  assert.deepEqual(shape(COPY.en), shape(COPY.es));
  assert.deepEqual(shape(COPY.pt), shape(COPY.es));
});

test('/conoce: o texto não promete funcionalidades que o produto não tem', () => {
  /* As únicas menções a automatismos são negações honestas. */
  const all = JSON.stringify(COPY).toLowerCase()
    .replace(/sin filtros automáticos|no automatic filters|sem filtros automáticos/g, '')
    .replace(/cobrar automáticamente|charged automatically|cobrado automaticamente/g, '');
  for (const word of ['inteligencia artificial', 'artificial intelligence', ' ia ', ' ai ', 'matching',
    'automátic', 'automatic', 'videollamada', 'video call', 'agenda', 'calendar']) {
    assert.ok(!all.includes(word), `texto menciona «${word.trim()}»`);
  }
});

test('/conoce: preço honesto — prova de 30 dias e planos, nada de «100 % gratis» nem plano avançado', () => {
  const pricing = require('../src/lib/pricing');
  const all = JSON.stringify(COPY);
  for (const claim of ['100 % gratis', '100% free', '100 % grátis', 'Sin cuota mensual', 'No monthly fee', 'Sem mensalidade',
    'prueba de mercado', 'market test', 'teste de mercado', 'sin pagar nada', 'nothing to pay', 'sem pagar nada']) {
    assert.ok(!all.toLowerCase().includes(claim.toLowerCase()), `texto promete «${claim}»`);
  }
  for (const lang of ['es', 'en', 'pt']) {
    assert.ok(!JSON.stringify(COPY[lang]).includes(pricing.formatPrice(pricing.PLANS.advanced.monthly, lang)), `plano avançado em ${lang}`);
    assert.ok(JSON.stringify(COPY[lang]).includes(String(pricing.TRIAL_DAYS)), `prazo da prova em ${lang}`);
  }
});

const { redact, newRef } = require('../src/lib/errors');

test('erros: código curto em hexadecimal maiúsculo', () => {
  for (let i = 0; i < 20; i++) assert.match(newRef(), /^[A-F0-9]{6}$/);
});

test('erros: emails e números longos saem da mensagem', () => {
  const out = redact('Key (email)=(ana.lopez@gmail.com) already exists; tel +34 612 345 678; id 42');
  assert.ok(!out.includes('ana.lopez'), out);
  assert.ok(!out.includes('612 345'), out);
  assert.ok(out.includes('[email]') && out.includes('[número]'), out);
  assert.ok(out.includes('id 42'), 'números curtos (ids) ficam');
});

test('google: botão só com client id com formato real e secret definido', () => {
  const config = require('../src/config');
  const saved = { ...config.google };
  try {
    assert.equal(google.enabled(), true);
    for (const [clientId, clientSecret] of [
      ['fake-client-id', 'segredo'],
      ['GOCSPX-trocado', 'segredo'],
      ['x.apps.googleusercontent.com.evil.com', 'segredo'],
      ['123-abc.apps.googleusercontent.com', ''],
      ['', '']
    ]) {
      Object.assign(config.google, { clientId, clientSecret });
      assert.equal(google.enabled(), false, clientId);
    }
    Object.assign(config.google, { clientId: '123-abc.apps.googleusercontent.com', clientSecret: 'segredo' });
    assert.equal(google.enabled(), true);
    assert.equal(google.configProblem(), '');
    Object.assign(config.google, { clientId: 'fake', clientSecret: 'segredo' });
    assert.match(google.configProblem(), /GOOGLE_CLIENT_ID/);
    Object.assign(config.google, { clientId: '', clientSecret: '' });
    assert.equal(google.configProblem(), '');
  } finally {
    Object.assign(config.google, saved);
  }
});

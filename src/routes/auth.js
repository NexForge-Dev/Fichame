'use strict';

const express = require('express');

const config = require('../config');
const { sb, one, run, rpc, logSecurity } = require('../db');
const { createSession, destroySession, destroyUserSessions, ensureSession } = require('../middleware/session');
const { verifyCsrf } = require('../middleware/csrf');
const { rateLimit, dbRateLimit, dbFailureLimit } = require('../middleware/rateLimit');
const { hashPasswordAsync, verifyPasswordAsync, needsRehash, randomToken, sha256, safeEqual } = require('../lib/crypto');
const { background } = require('../lib/background');
const google = require('../lib/google');
const { slugify } = require('../lib/slug');
const { emailTag, isValidEmail, truncateIp } = require('../lib/privacy');
const { sendPasswordReset } = require('../lib/mailer');
const { TERMS_VERSION, DPA_VERSION } = require('../lib/legal');
const { ESTABLISHMENT_TYPES } = require('../lib/statuses');
const { DEMO_EMAIL, isDemoUser, demoReadOnlyMessage } = require('../lib/demo');
const analytics = require('../lib/analytics');

const router = express.Router();

/* Mostra o botão «Continuar con Google» só quando está configurado. */
router.use((req, res, next) => {
  res.locals.googleEnabled = google.enabled();
  next();
});


const MIN_PASSWORD = 10;

/* Hash fictício: quando o email não existe, verifica-se a senha contra isto
 * para que a resposta demore o mesmo que com um email existente. Sem isto,
 * o tempo de resposta revelaria que contas existem. */
let dummyHash = null;
function dummyHashOnce() {
  if (!dummyHash) {
    /* Não guardar uma promessa rejeitada: tenta de novo no próximo login. */
    dummyHash = hashPasswordAsync(randomToken(16)).catch((err) => {
      dummyHash = null;
      throw err;
    });
  }
  return dummyHash;
}

const RESET_TTL_MS = 30 * 60 * 1000;

/* Landing page para quem ainda não tem conta; quem já entrou vai direto
 * para o painel, como antes. */
router.get('/', (req, res) => {
  if (req.user) return res.redirect(req.user.role === 'admin' ? '/admin' : '/panel');
  res.render('public/landing');
});

/* Só texto: um campo repetido chega como array e um corpo JSON pode trazer
 * objetos, que em String() davam lixo ou rebentavam (500). */
function clean(value, max = 200) {
  return typeof value === 'string' ? value.trim().slice(0, max) : '';
}

function badCsrf(res) {
  return res.status(403).render('error', {
    status: 403, title: 'Sesión no válida', message: 'Recarga la página e inténtalo de nuevo.'
  });
}

/* Senha: comprimento mínimo e recusa das mais óbvias. Sem regras de
 * composição (que levam a senhas previsíveis), como recomenda o NIST SP 800-63B. */
const COMMON = new Set(['1234567890', '12345678910', 'contraseña', 'contrasena1', 'password123', 'qwertyuiop', '123456789a', 'fichame123']);
function passwordProblem(pw, email) {
  if (pw.length < MIN_PASSWORD) return `La contraseña debe tener al menos ${MIN_PASSWORD} caracteres.`;
  if (COMMON.has(pw.toLowerCase())) return 'Esa contraseña es demasiado común. Elige otra.';
  if (email && pw.toLowerCase().includes(String(email).split('@')[0].toLowerCase()) && String(email).split('@')[0].length >= 4) {
    return 'La contraseña no debe contener tu email.';
  }
  if (/^(.)\1+$/.test(pw)) return 'La contraseña es demasiado simple.';
  return '';
}

/* ------------------------------------------------------------------ *
 * Registro de establecimiento (§9)
 * ------------------------------------------------------------------ *
 * Minimização: só o necessário para a conta e para que o estabelecimento
 * possa ser identificado como responsável do tratamento perante os
 * candidatos (art. 13.1.a RGPD). Telefone e morada são opcionais.
 * A aceitação dos Termos e do Acordo de Encargo é contratual (não é um
 * consentimento RGPD) e fica registada com a versão e a data.
 */
router.get('/registro', ensureSession, async (req, res) => {
  /* Da demo para o registo: a sessão demo termina aqui. */
  if (isDemoUser(req.user)) {
    await destroySession(req, res);
    return res.redirect('/registro');
  }
  if (req.user) return res.redirect(req.user.role === 'admin' ? '/admin' : '/panel');
  res.render('auth/register', { form: {}, errors: null, minPassword: MIN_PASSWORD });
});

const registerLimiters = [
  rateLimit({ windowMs: 15 * 60 * 1000, max: 10, name: 'register' }),
  dbRateLimit({ windowMs: 60 * 60 * 1000, max: 10, name: 'register' })
];

/* Formulário do negócio, comum ao registo com senha e com Google. Com
 * `googleAccount` o email vem da Google (já verificado) e não há senha. */
async function handleRegister(req, res, googleAccount = null) {
  const form = {
    restaurant_name: clean(req.body.restaurant_name, 100),
    commercial_name: clean(req.body.commercial_name, 100),
    legal_name: clean(req.body.legal_name, 150),
    owner_name: clean(req.body.owner_name, 100),
    email: googleAccount ? googleAccount.email : clean(req.body.email, 120),
    phone: clean(req.body.telefono, 30),
    address: clean(req.body.direccion, 200),
    postal_code: clean(req.body.cp, 10),
    city: clean(req.body.ciudad, 100),
    establishment_type: clean(req.body.establecimiento, 40),
    description: clean(req.body.descripcion, 1500),
    accept: req.body.acepto === '1',
    password: String(req.body.password || '').slice(0, 200),
    password2: String(req.body.password2 || '').slice(0, 200)
  };

  if (isValidEmail(form.email)) analytics.signupStarted(form.email, googleAccount ? 'google' : 'email');

  const errors = {};
  if (form.restaurant_name.length < 2) errors.restaurant_name = 'Indica el nombre del negocio.';
  if (form.legal_name.length < 2) errors.legal_name = 'Indica la razón social o el nombre del titular del negocio.';
  if (form.owner_name.length < 2) errors.owner_name = 'Indica el responsable.';
  if (!isValidEmail(form.email)) errors.email = 'Indica un email válido.';
  if (form.phone && !/^[\d\s().+-]{6,25}$/.test(form.phone)) errors.phone = 'Indica un teléfono válido.';
  if (form.city.length < 2) errors.city = 'Indica la ciudad.';
  if (form.postal_code && !/^\d{5}$/.test(form.postal_code)) errors.postal_code = 'El código postal debe tener 5 dígitos (ej.: 28013).';
  if (!Object.prototype.hasOwnProperty.call(ESTABLISHMENT_TYPES, form.establishment_type)) {
    errors.establishment_type = 'Selecciona el tipo de negocio.';
  }
  if (!googleAccount) {
    const pwErr = passwordProblem(form.password, form.email);
    if (pwErr) errors.password = pwErr;
    if (form.password !== form.password2) errors.password2 = 'Las contraseñas no coinciden.';
  }
  if (!form.accept) errors.acepto = 'Debes aceptar los Términos y el Acuerdo de encargo del tratamiento.';

  const rejectWith = (fieldErrors) => {
    delete form.password;
    delete form.password2;
    return res.status(422).render('auth/register', {
      form, errors: fieldErrors, minPassword: MIN_PASSWORD, google: googleAccount
    });
  };

  if (Object.keys(errors).length > 0) return rejectWith(errors);

  /* Negócio, dono, dados legais e aceitação dos termos numa só função
   * (register_restaurant v3, 0013): uma falha a meio não deixa a conta criada
   * sem razão social nem sem prova da aceitação. */
  const result = await rpc('register_restaurant', {
    slug_base: slugify(form.restaurant_name),
    name: form.restaurant_name,
    commercial_name: form.commercial_name,
    owner_name: form.owner_name,
    email: form.email,
    phone: form.phone,
    address: form.address,
    postal_code: form.postal_code,
    city: form.city,
    establishment_type: form.establishment_type,
    description: form.description,
    password_hash: googleAccount ? '' : await hashPasswordAsync(form.password),
    google_sub: googleAccount ? googleAccount.sub : '',
    test_prefix: config.testPrefix,
    legal_name: form.legal_name,
    privacy_email: form.email,
    terms_version: TERMS_VERSION,
    dpa_version: DPA_VERSION,
    ip: String(req.ip || '').slice(0, 64)
  }, 'registar estabelecimento');

  if (!result || !result.ok) {
    /* LIMITAÇÃO conhecida: sem verificação de email no registo, dizer que o
     * email já existe permite enumerar contas de negócios. Mitigado por rate
     * limit; ver docs/security/production-compliance-gate.md (WARNING). */
    if (result && result.reason === 'email_taken') {
      return rejectWith({ email: 'No se pudo crear la cuenta con este email. Si ya tienes cuenta, inicia sesión o recupera tu contraseña.' });
    }
    return res.status(500).render('error', {
      status: 500, title: 'Error', message: 'No se pudo crear la cuenta. Inténtalo de nuevo.'
    });
  }

  analytics.signupCompleted(result.restaurant_id, form.email, googleAccount ? 'google' : 'email');
  logSecurity('registro_restaurante', `rid=${result.restaurant_id} terms=${TERMS_VERSION} dpa=${DPA_VERSION}${googleAccount ? ' via=google' : ''}`, req.ip, {
    userId: result.user_id,
    restaurantId: result.restaurant_id,
    userAgent: req.headers['user-agent']
  });

  if (googleAccount) clearShortCookie(res, GOOGLE_PENDING_COOKIE);

  /* Sessão nova depois de autenticar: o id anterior (anónimo) é descartado
   * (proteção contra session fixation). */
  await destroySession(req, res);
  await createSession(req, res, result.user_id);
  res.redirect('/panel/privacidad?bienvenida=1');
}

router.post('/registro', ...registerLimiters, async (req, res) => {
  if (!verifyCsrf(req)) return badCsrf(res);
  return handleRegister(req, res);
});

/* ------------------------------------------------------------------ *
 * Login com Google (OpenID Connect)
 * ------------------------------------------------------------------ *
 *  - state + nonce + PKCE num cookie HttpOnly de 10 min: o callback só é
 *    aceite no browser que iniciou o fluxo (sem login CSRF);
 *  - a conta é encontrada pelo `sub` da Google; pelo email só se a Google
 *    for autoritativa para esse email (gmail.com ou Workspace). Senão, quem
 *    controlasse uma conta Google com um email antigo de outra pessoa
 *    entraria na conta dela;
 *  - sem conta: o registo continua no formulário do negócio (os Termos e o
 *    Acordo de encargo têm de ser aceites na mesma); a identidade Google
 *    fica num cookie assinado até lá;
 *  - contas de administração não entram com Google.
 */
const GOOGLE_FLOW_COOKIE = config.cookieSecure ? '__Host-fichame_gflow' : 'fichame_gflow';
const GOOGLE_PENDING_COOKIE = config.cookieSecure ? '__Host-fichame_greg' : 'fichame_greg';

function shortCookie(res, name, value, maxAge) {
  res.cookie(name, value, { httpOnly: true, sameSite: 'lax', secure: config.cookieSecure, path: '/', maxAge });
}

/* Mesmas opções da criação: sem Secure o browser ignora o apagar de um
 * cookie __Host- e os dados do registo Google ficavam no dispositivo. */
function clearShortCookie(res, name) {
  res.clearCookie(name, { httpOnly: true, sameSite: 'lax', secure: config.cookieSecure, path: '/' });
}

function googleFail(res, message, status = 400) {
  return res.status(status).render('auth/login', { error: message, email: '', info: '' });
}

function notFound(res) {
  return res.status(404).render('error', { status: 404, title: 'Página no encontrada', message: '' });
}

router.get('/login/google',
  rateLimit({ windowMs: 15 * 60 * 1000, max: 30, name: 'google-start' }),
  (req, res) => {
    if (!google.enabled()) return notFound(res);
    /* Vincular faz-se por POST com a senha (ver abaixo); links antigos para
     * ?modo=vincular voltam à Configuración. */
    if (req.query.modo === 'vincular') return res.redirect(req.user ? '/panel/configuracion' : '/login');
    if (req.user) return res.redirect(req.user.role === 'admin' ? '/admin' : '/panel');
    startGoogleFlow(res, 'login');
  });

function startGoogleFlow(res, intent) {
  const flow = google.newFlow(intent);
  shortCookie(res, GOOGLE_FLOW_COOKIE, Buffer.from(JSON.stringify(flow)).toString('base64url'), 10 * 60 * 1000);
  res.redirect(google.authUrl(flow));
}

/* Vincular Google exige a senha atual, como desvincular: uma sessão esquecida
 * aberta não pode servir para ligar outra conta Google e ficar com acesso
 * mesmo depois de o dono mudar a senha. Fora da demo (só de leitura). */
router.post('/login/google/vincular',
  rateLimit({ windowMs: 15 * 60 * 1000, max: 10, name: 'google-link', key: (req) => String(req.user && req.user.id) }),
  async (req, res) => {
    if (!google.enabled()) return notFound(res);
    if (!req.user) return res.redirect('/login');
    if (!verifyCsrf(req)) return badCsrf(res);
    const back = (msg) => res.redirect('/panel/configuracion?err=' + encodeURIComponent(msg));
    if (req.user.role === 'admin') return back('Las cuentas de administración no pueden usar Google.');
    if (isDemoUser(req.user)) return back(demoReadOnlyMessage(req));
    if (!req.user.password_hash || !(await verifyPasswordAsync(String(req.body.password_actual || ''), req.user.password_hash))) {
      logSecurity('configuracion_password_incorrecta', `user=${req.user.id}`, req.ip, { userId: req.user.id });
      return back('La contraseña actual es incorrecta.');
    }
    startGoogleFlow(res, 'link');
  });

router.get('/login/google/callback',
  rateLimit({ windowMs: 15 * 60 * 1000, max: 30, name: 'google-callback' }),
  dbRateLimit({ windowMs: 15 * 60 * 1000, max: 60, name: 'google-ip', key: (req) => String(req.ip) }),
  async (req, res) => {
    if (!google.enabled()) return notFound(res);

    let flow = null;
    try {
      flow = JSON.parse(Buffer.from(String(req.cookies[GOOGLE_FLOW_COOKIE] || ''), 'base64url').toString('utf8'));
    } catch { flow = null; }
    clearShortCookie(res, GOOGLE_FLOW_COOKIE);

    // a pessoa cancelou no ecrã da Google
    if (req.query.error) return res.redirect(flow && flow.intent === 'link' ? '/panel/configuracion' : '/login');

    const tryAgain = 'No se pudo iniciar sesión con Google. Inténtalo de nuevo.';
    if (!flow || !flow.state || !req.query.code || !safeEqual(String(req.query.state || ''), flow.state)) {
      return googleFail(res, tryAgain);
    }

    let account;
    try {
      account = await google.exchangeCode(String(req.query.code).slice(0, 2000), flow);
    } catch (err) {
      logSecurity('google_fallido', String(err.message).slice(0, 100), req.ip, { userAgent: req.headers['user-agent'] });
      return googleFail(res, tryAgain);
    }

    const bySub = await one(
      sb().from('users').select('id, email, role, blocked, google_sub, restaurant_id').eq('google_sub', account.sub),
      'login google (sub)'
    );

    /* Vincular a uma conta já autenticada (Configuración). */
    if (flow.intent === 'link') {
      if (!req.user) return res.redirect('/login');
      const back = (key, msg) => res.redirect(`/panel/configuracion?${key}=` + encodeURIComponent(msg));
      if (req.user.role === 'admin') return back('err', 'Las cuentas de administración no pueden usar Google.');
      if (isDemoUser(req.user)) return back('err', demoReadOnlyMessage(req));
      if (bySub && bySub.id !== req.user.id) return back('err', 'Esa cuenta de Google ya está vinculada a otra cuenta de Fíchame.');
      await run(sb().from('users').update({ google_sub: account.sub }).eq('id', req.user.id), 'vincular google');
      logSecurity('google_vinculado', `user=${req.user.id}`, req.ip, { userId: req.user.id, userAgent: req.headers['user-agent'] });
      return back('ok', 'Cuenta de Google vinculada.');
    }

    let user = bySub;
    if (!user) {
      const byEmail = await one(
        sb().from('users').select('id, email, role, blocked, google_sub, restaurant_id, password_hash').eq('email', account.email),
        'login google (email)'
      );
      if (byEmail) {
        /* Conta com senha: NÃO se vincula sozinha. Quem registou antes o
         * email de outra pessoa (com uma senha sua) continuaria a entrar com
         * essa senha depois de a vítima «Continuar con Google». O dono
         * vincula em Configuración, com a senha (/login/google/vincular). */
        if (byEmail.google_sub || byEmail.password_hash || !account.authoritative || byEmail.role === 'admin') {
          logSecurity('google_sin_vincular', `user=${byEmail.id}`, req.ip, { userId: byEmail.id, userAgent: req.headers['user-agent'] });
          return googleFail(res, 'Ya existe una cuenta con este email. Inicia sesión con tu contraseña y vincula Google desde Configuración.', 409);
        }
        await run(sb().from('users').update({ google_sub: account.sub }).eq('id', byEmail.id), 'vincular google por email');
        logSecurity('google_vinculado', `user=${byEmail.id} auto=email`, req.ip, { userId: byEmail.id, userAgent: req.headers['user-agent'] });
        user = byEmail;
      }
    }

    if (!user) {
      shortCookie(res, GOOGLE_PENDING_COOKIE,
        google.signPending({ sub: account.sub, email: account.email, name: account.name }), google.PENDING_TTL_MS);
      return res.redirect('/registro/google');
    }

    if (user.role === 'admin') return googleFail(res, 'Las cuentas de administración entran con contraseña.', 403);
    if (user.blocked) {
      logSecurity('login_bloqueado', `user=${user.id} via=google`, req.ip, { userId: user.id, userAgent: req.headers['user-agent'] });
      return googleFail(res, 'Tu cuenta ha sido bloqueada.', 403);
    }

    await destroySession(req, res);
    await createSession(req, res, user.id);
    if (user.role === 'owner') analytics.sessionStarted(user.restaurant_id);
    logSecurity('login_ok', `user=${user.id} role=${user.role} via=google`, req.ip, {
      userId: user.id, userAgent: req.headers['user-agent']
    });
    res.redirect('/panel');
  });

function pendingGoogle(req) {
  return google.enabled() ? google.verifyPending(req.cookies && req.cookies[GOOGLE_PENDING_COOKIE]) : null;
}

router.get('/registro/google', ensureSession, (req, res) => {
  if (req.user) return res.redirect('/panel');
  const account = pendingGoogle(req);
  if (!account) return res.redirect('/registro');
  res.render('auth/register', {
    form: { owner_name: account.name, email: account.email }, errors: null, minPassword: MIN_PASSWORD, google: account
  });
});

router.post('/registro/google', ...registerLimiters, async (req, res) => {
  if (!verifyCsrf(req)) return badCsrf(res);
  const account = pendingGoogle(req);
  if (!account) return res.redirect('/registro');
  return handleRegister(req, res, account);
});

/* ------------------------------------------------------------------ *
 * Login
 * ------------------------------------------------------------------ */
router.get('/login', ensureSession, (req, res) => {
  if (req.user) return res.redirect(req.user.role === 'admin' ? '/admin' : '/panel');
  res.render('auth/login', { error: req.query.error ? 'Tu cuenta ha sido bloqueada.' : '', email: '', info: req.query.info || '' });
});

const loginLimiters = [
  // por IP + email (erros de digitação de um utilizador real)
  rateLimit({
    windowMs: 15 * 60 * 1000, max: 10, name: 'login',
    key: (req) => `${req.ip}|${clean((req.body || {}).email, 120).toLowerCase()}`,
    message: 'Demasiados intentos. Espera unos minutos.'
  }),
  // por IP, todas as contas (credential stuffing a partir de um IP)
  dbRateLimit({
    windowMs: 15 * 60 * 1000, max: 30, name: 'login-ip',
    key: (req) => String(req.ip),
    message: 'Demasiados intentos desde esta conexión. Espera unos minutos.'
  }),
];

/* Por conta e por rede (/24 em IPv4, /48 em IPv6). Só as tentativas
 * FALHADAS contam. A chave inclui a rede: só com o email (público na página
 * de privacidade do negócio), 50 tentativas falhadas a partir de qualquer
 * sítio bloqueavam o login do dono mesmo com a senha certa. Assim o bloqueio
 * fica na rede de quem ataca; contra muitos IPs ficam os limites por IP. */
const loginAccountLimit = dbFailureLimit({
  windowMs: 60 * 60 * 1000, max: 50, name: 'login-account-fail',
  key: (req) => `${clean((req.body || {}).email, 120).toLowerCase()}|${truncateIp(req.ip) || String(req.ip || '')}`,
  message: 'Demasiados intentos para esta cuenta. Espera una hora o recupera tu contraseña.'
});

router.post('/login', ...loginLimiters, async (req, res) => {
  if (!verifyCsrf(req)) return badCsrf(res);
  if (await loginAccountLimit.blocked(req, res)) return;

  const email = clean(req.body.email, 120);
  const password = String(req.body.password || '').slice(0, 200);

  /* `email` é citext: a comparação é insensível a maiúsculas no Postgres. */
  const user = isValidEmail(email) ? await one(
    sb().from('users').select('id, email, password_hash, role, blocked, restaurant_id').eq('email', email),
    'login'
  ) : null;

  /* A senha é sempre verificada (contra o hash real ou o fictício) ANTES de
   * dizer qualquer coisa sobre a conta: «conta bloqueada» só aparece a quem
   * sabe a senha, e o tempo de resposta não distingue contas existentes. */
  const passwordOk = (await verifyPasswordAsync(password, user && user.password_hash ? user.password_hash : await dummyHashOnce())) &&
    Boolean(user && user.password_hash);

  if (!passwordOk) {
    /* Conta também emails sem conta: só assim o tempo de resposta não
     * distingue contas existentes. */
    await loginAccountLimit.hit(req);
    logSecurity('login_fallido', user ? `user=${user.id}` : emailTag(email), req.ip, {
      userId: user ? user.id : null, userAgent: req.headers['user-agent']
    });
    return res.status(401).render('auth/login', { error: 'Email o contraseña incorrectos.', email, info: '' });
  }

  if (user.blocked) {
    logSecurity('login_bloqueado', `user=${user.id}`, req.ip, {
      userId: user.id, userAgent: req.headers['user-agent']
    });
    return res.status(403).render('auth/login', { error: 'Tu cuenta ha sido bloqueada.', email, info: '' });
  }

  /* Hash antigo (N de scrypt abaixo do atual): refaz-se agora, que se
   * conhece a senha. Não atrasa o login. */
  if (needsRehash(user.password_hash)) {
    background(hashPasswordAsync(password).then((h) => run(
      sb().from('users').update({ password_hash: h }).eq('id', user.id).eq('password_hash', user.password_hash),
      'atualizar hash da senha'
    )), 'rehash');
  }

  await destroySession(req, res);
  await createSession(req, res, user.id, user.role);

  if (user.role === 'owner') analytics.sessionStarted(user.restaurant_id);
  logSecurity('login_ok', `user=${user.id} role=${user.role}`, req.ip, {
    userId: user.id, userAgent: req.headers['user-agent']
  });

  res.redirect(user.role === 'admin' ? '/admin' : '/panel');
});

/* ------------------------------------------------------------------ *
 * Logout
 * ------------------------------------------------------------------ */
router.post('/logout', async (req, res) => {
  if (req.session && !verifyCsrf(req)) {
    return res.status(403).render('error', {
      status: 403, title: 'Sesión no válida', message: 'Operación no válida.'
    });
  }
  if (req.user) logSecurity('logout', `user=${req.user.id}`, req.ip, { userId: req.user.id });
  await destroySession(req, res);
  res.redirect('/login');
});

/* ------------------------------------------------------------------ *
 * Demo — entra no painel do negócio fictício (src/lib/demo.js)
 * ------------------------------------------------------------------ *
 * O link na /conoce abre uma página com um botão: entrar cria uma sessão e um
 * registo, e isso só acontece num POST com token CSRF. Um GET (crawler,
 * pré-visualização de um link) não escreve nada. Quem já tem sessão de um
 * negócio real não é desligado: volta ao seu painel. Sem `npm run demo:seed`
 * a conta não existe e a rota dá 404. */
async function demoAccount(req, res) {
  const user = await one(
    sb().from('users').select('id, blocked').eq('email', DEMO_EMAIL),
    'conta demo'
  );
  if (user && !user.blocked) return user;
  res.status(404).render('error', {
    status: 404, title: 'Demo no disponible', message: 'La demostración no está disponible en este momento.'
  });
  return null;
}

function leaveDemoPage(req, res) {
  return res.redirect(req.user.role === 'admin' ? '/admin' : '/panel');
}

router.get('/demo', ensureSession, async (req, res) => {
  if (req.user) return leaveDemoPage(req, res);
  if (await demoAccount(req, res)) res.render('public/demo');
});

router.post('/demo',
  rateLimit({
    windowMs: 15 * 60 * 1000, max: 20, name: 'demo',
    message: 'Demasiados accesos a la demo. Espera unos minutos.'
  }),
  async (req, res) => {
    if (req.user) return leaveDemoPage(req, res);

    const user = await demoAccount(req, res);
    if (!user) return;

    await destroySession(req, res);
    await createSession(req, res, user.id);
    logSecurity('demo_login', `user=${user.id}`, req.ip, { userId: user.id });
    res.redirect('/panel');
  }
);

/* ------------------------------------------------------------------ *
 * Recuperação de senha
 * ------------------------------------------------------------------ *
 *  - resposta idêntica exista ou não a conta (sem enumeração);
 *  - token aleatório de 256 bits, guardado só como sha256, 30 min, uso único;
 *  - o link leva o token no fragmento (#t=…), que não chega ao servidor nem
 *    aos logs de acesso; o JS da página copia-o para o formulário;
 *  - ao repor: todos os tokens e TODAS as sessões do utilizador são anulados;
 *  - sem SMTP o link não sai daqui: fica um pedido em password_help_requests
 *    e o admin gera o link em /admin/usuarios e envia-o do seu email.
 */
const GENERIC_RESET_MSG = 'Si existe una cuenta con ese email, te hemos enviado un enlace para restablecer la contraseña. Caduca en 30 minutos.';
const GENERIC_HELP_MSG = 'Si existe una cuenta con ese email, hemos avisado al equipo de Fíchame. Te enviaremos a ese email un enlace para elegir una contraseña nueva.';

router.get('/recuperar', ensureSession, (req, res) => {
  res.render('auth/forgot', { sent: false, manual: !config.smtp.host });
});

/* Por conta, só os pedidos que criam mesmo um link (3/h). Contar todos os
 * pedidos deixava qualquer pessoa bloquear a recuperação de um dono só com o
 * email dele. */
const forgotAccountLimit = dbFailureLimit({
  windowMs: 60 * 60 * 1000, max: 3, name: 'forgot-account',
  key: (req) => clean((req.body || {}).email, 120).toLowerCase()
});

router.post('/recuperar',
  rateLimit({ windowMs: 15 * 60 * 1000, max: 5, name: 'forgot' }),
  dbRateLimit({ windowMs: 60 * 60 * 1000, max: 10, name: 'forgot-ip', key: (req) => String(req.ip) }),
  async (req, res) => {
    if (!verifyCsrf(req)) return badCsrf(res);
    const email = clean(req.body.email, 120);

    if (isValidEmail(email)) {
      const user = await one(sb().from('users').select('id, email, blocked, role').eq('email', email), 'recuperar');
      if (user && !user.blocked && !config.smtp.host) {
        /* Sem SMTP o link nunca chegaria: fica um pedido para o admin, que
         * define uma senha nova em /admin/usuarios (0011). Um por conta. */
        await run(sb().from('password_help_requests')
          .upsert({ user_id: user.id }, { onConflict: 'user_id', ignoreDuplicates: true }), 'pedido de ajuda com senha');
        logSecurity('password_ajuda_pedido', `user=${user.id}`, req.ip, { userId: user.id, userAgent: req.headers['user-agent'] });
      } else if (user && !user.blocked && await forgotAccountLimit.isBlocked(req)) {
        /* Já se enviaram 3 links nesta hora: não se envia outro, mas a
         * resposta é a mesma (não revela que a conta existe). */
        logSecurity('password_reset_limitado', `user=${user.id}`, req.ip, { userId: user.id, userAgent: req.headers['user-agent'] });
      } else if (user && !user.blocked) {
        await forgotAccountLimit.hit(req);
        const token = randomToken(32);
        await run(sb().from('password_resets').insert({
          token_hash: sha256(token),
          user_id: user.id,
          expires_at: new Date(Date.now() + RESET_TTL_MS).toISOString()
        }), 'criar token de senha');
        background(sendPasswordReset({ to: user.email, token }), 'mailer');
        logSecurity('password_reset_pedido', `user=${user.id}`, req.ip, { userId: user.id, userAgent: req.headers['user-agent'] });
      } else {
        logSecurity('password_reset_pedido', emailTag(email), req.ip, { userAgent: req.headers['user-agent'] });
      }
    }
    const manual = !config.smtp.host;
    res.render('auth/forgot', { sent: true, manual, message: manual ? GENERIC_HELP_MSG : GENERIC_RESET_MSG });
  });

router.get('/recuperar/nueva', ensureSession, (req, res) => {
  /* Página sem recursos externos e sem Referer: o token nunca sai do browser
   * a não ser no POST para este servidor. */
  res.setHeader('Referrer-Policy', 'no-referrer');
  res.render('auth/reset', { error: '', minPassword: MIN_PASSWORD });
});

router.post('/recuperar/nueva',
  rateLimit({ windowMs: 15 * 60 * 1000, max: 10, name: 'reset' }),
  dbRateLimit({ windowMs: 60 * 60 * 1000, max: 20, name: 'reset-ip', key: (req) => String(req.ip) }),
  async (req, res) => {
    if (!verifyCsrf(req)) return badCsrf(res);
    res.setHeader('Referrer-Policy', 'no-referrer');

    const token = clean(req.body.token, 200);
    const pw = String(req.body.password || '').slice(0, 200);
    const pw2 = String(req.body.password2 || '').slice(0, 200);
    const fail = (msg, status = 422) => res.status(status).render('auth/reset', { error: msg, minPassword: MIN_PASSWORD });

    if (!/^[a-f0-9]{64}$/.test(token)) return fail('El enlace no es válido o ha caducado. Solicita uno nuevo.', 400);

    const row = await one(
      sb().from('password_resets').select('token_hash, user_id, expires_at, used_at').eq('token_hash', sha256(token)),
      'token de senha'
    );
    if (!row || row.used_at || Date.parse(row.expires_at) < Date.now()) {
      return fail('El enlace no es válido o ha caducado. Solicita uno nuevo.', 400);
    }

    const user = await one(sb().from('users').select('id, email, blocked, password_hash').eq('id', row.user_id), 'utilizador do token');
    if (!user || user.blocked) return fail('El enlace no es válido o ha caducado. Solicita uno nuevo.', 400);

    const problem = passwordProblem(pw, user.email);
    if (problem) return fail(problem);
    if (pw !== pw2) return fail('Las contraseñas no coinciden.');

    /* Marca como usado ANTES de mudar a senha e só se ainda não estava usado:
     * dois pedidos simultâneos com o mesmo token não passam os dois. */
    const claimed = await run(
      sb().from('password_resets').update({ used_at: new Date().toISOString() })
        .eq('token_hash', row.token_hash).is('used_at', null).select('token_hash'),
      'consumir token'
    );
    if (!claimed || claimed.length === 0) return fail('El enlace no es válido o ha caducado. Solicita uno nuevo.', 400);

    /* Numa conta que já tinha senha, repor também retira o vínculo Google:
     * quem repõe a senha pode estar a recuperar a conta de alguém que lhe
     * ligou o seu Google. Numa conta criada com Google (sem senha) a reposição
     * é a forma de criar a primeira senha e o vínculo fica. */
    const resetUpdates = { password_hash: await hashPasswordAsync(pw) };
    if (user.password_hash) resetUpdates.google_sub = null;
    await run(sb().from('users').update(resetUpdates).eq('id', user.id), 'repor senha');
    await run(sb().from('password_resets').delete().eq('user_id', user.id), 'anular tokens');
    await run(sb().from('password_help_requests').delete().eq('user_id', user.id), 'fechar pedido de senha');
    await destroyUserSessions(user.id);

    logSecurity('password_reset_completado', `user=${user.id}`, req.ip, { userId: user.id, userAgent: req.headers['user-agent'] });

    await destroySession(req, res);
    res.redirect('/login?info=' + encodeURIComponent('restablecida'));
  });

module.exports = router;
module.exports.passwordProblem = passwordProblem;
module.exports.MIN_PASSWORD = MIN_PASSWORD;

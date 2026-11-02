'use strict';

const crypto = require('crypto');
const express = require('express');

const config = require('../config');
const { sb, one, many, rpc, logSecurity } = require('../db');
const { ensureSession } = require('../middleware/session');
const { verifyCsrf } = require('../middleware/csrf');
const { rateLimit, dbRateLimit } = require('../middleware/rateLimit');
const { uploadCvFile, inspectPdf, safeFilename } = require('../middleware/uploads');
const { notifyNewApplication, notifyRightsRequest } = require('../lib/mailer');
const analytics = require('../lib/analytics');
const { PRIVACY_NOTICE_VERSION, CONSENT_VERSION, futureText, interestText, days2months } = require('../lib/consent');
const { operator } = require('../lib/legal');
const storage = require('../lib/storage');
const { DEMO_PREFIX } = require('../lib/demo');
const { background } = require('../lib/background');

const router = express.Router();

const EMAIL_RE = /^[^\s@<>,;]+@[^\s@<>,;]+\.[^\s@<>,;]{2,}$/;
/* Aceita os separadores habituais (espaços, pontos, hífens, parênteses):
 * «612.345.678» é um telefone válido e não deve fazer perder o CV. */
const PHONE_RE = /^[\d\s().+-]{6,25}$/;

const RIGHTS_KINDS = {
  acceso: 'Acceso — saber qué datos míos se conservan',
  rectificacion: 'Rectificación — corregir datos incorrectos',
  supresion: 'Supresión — que se borren mis datos y mi CV',
  oposicion: 'Oposición',
  limitacion: 'Limitación del tratamiento',
  portabilidad: 'Portabilidad — recibir una copia de mis datos',
  retirada_consentimiento: 'Retirar el consentimiento de futuras oportunidades',
  otro: 'Otra consulta sobre mis datos'
};

/* Só texto: um campo repetido chega como array e um corpo JSON pode trazer
 * objetos, que em String() davam lixo ou rebentavam (500). */
function clean(value, max = 200) {
  return typeof value === 'string' ? value.trim().slice(0, max) : '';
}

/* Só as colunas que a página pública usa. A view nunca recebe o email de
 * login, os prazos internos nem os metadados de conta. */
const PUBLIC_COLUMNS = [
  'id', 'slug', 'name', 'commercial_name', 'legal_name', 'privacy_email', 'email',
  'address', 'postal_code', 'city', 'establishment_type', 'description',
  'logo_path', 'photo_path', 'hiring_status',
  'retention_closed_days', 'retention_inactive_days', 'retention_reserve_days', 'test_prefix'
].join(', ');

/* Estabelecimento inexistente e estabelecimento desativado dão a MESMA
 * resposta 404: a página pública não permite descobrir que contas existem
 * nem quais foram desativadas. */
async function getPublicRestaurant(slug) {
  const s = String(slug || '');
  if (!/^[a-z0-9][a-z0-9-]{0,80}$/.test(s)) return null;
  const r = await one(
    sb().from('restaurants').select(PUBLIC_COLUMNS).eq('slug', s).eq('active', true),
    'restaurante público'
  );
  if (r) {
    /* Negócio fictício do modo demo: a página mostra-se, mas não recebe
     * candidaturas nem pedidos (ver src/lib/demo.js). */
    r.demo = r.test_prefix === DEMO_PREFIX;
    delete r.test_prefix;
    r.controller = r.legal_name || r.name;
    r.contact = r.privacy_email || r.email;
  }
  return r;
}

async function openJobs(restaurantId) {
  return many(
    sb().from('jobs').select('id, title, description, contract_type, work_schedule')
      .eq('restaurant_id', restaurantId).eq('active', true).order('title'),
    'vagas abertas'
  );
}

function pageMode(restaurant, jobs) {
  if (restaurant.hiring_status !== 'open') return 'paused';
  if (jobs.length === 0) return 'no_jobs';
  return 'form';
}

function renderPublic(req, res, { restaurant, jobs, mode, form = {}, errors = null, status = 200 }) {
  res.status(status).render('public/restaurant', {
    restaurant,
    jobs,
    mode,
    form,
    errors,
    consentFutureText: futureText(restaurant.commercial_name || restaurant.name, restaurant.retention_reserve_days),
    consentInterestText: interestText(restaurant.commercial_name || restaurant.name, restaurant.retention_reserve_days),
    retention: {
      inactive: days2months(restaurant.retention_inactive_days),
      closed: days2months(restaurant.retention_closed_days),
      reserve: days2months(restaurant.retention_reserve_days)
    },
    query: req.query
  });
}

function notFoundRestaurant(res, message) {
  return res.status(404).render('error', {
    status: 404,
    title: 'Establecimiento no encontrado',
    message: message || 'No encontramos este establecimiento. Comprueba el enlace o el código QR.'
  });
}

/* Eventos de candidatos: IP truncado, sem user-agent (db.logSecurity). */
function logPublic(event, detail, req, restaurantId) {
  logSecurity(event, detail, req.ip, { restaurantId, anonymous: true });
}

/* ------------------------------------------------------------------ *
 * GET /r/:slug — página pública (NFC)
 * ------------------------------------------------------------------ */
router.get('/r/:slug', ensureSession, async (req, res) => {
  const restaurant = await getPublicRestaurant(req.params.slug);
  if (!restaurant) return notFoundRestaurant(res);

  const jobs = await openJobs(restaurant.id);
  renderPublic(req, res, { restaurant, jobs, mode: pageMode(restaurant, jobs) });
});

/* ------------------------------------------------------------------ *
 * POST /r/:slug/apply — candidatura com CV
 * ------------------------------------------------------------------ */
const applyLimiters = [
  /* Por IP + negócio. 20 e não 5: numa loja com Wi-Fi vários candidatos
   * saem pelo mesmo IP, e o duplicado (mesmo email em 48 h) já trava spam. */
  rateLimit({
    windowMs: 60 * 60 * 1000, max: 20, name: 'apply',
    key: (req) => `${req.ip}|${req.params.slug}`,
    message: 'Has enviado demasiadas candidaturas desde este dispositivo. Inténtalo más tarde.'
  }),
  /* Partilhado entre instâncias: por IP em toda a plataforma (CV flood). */
  dbRateLimit({
    windowMs: 60 * 60 * 1000, max: 60, name: 'apply-ip',
    key: (req) => String(req.ip),
    message: 'Has enviado demasiadas candidaturas desde esta conexión. Inténtalo más tarde.'
  })
];

router.post('/r/:slug/apply', ...applyLimiters, uploadCvFile, async (req, res) => {
  const restaurant = await getPublicRestaurant(req.params.slug);
  if (!restaurant || restaurant.demo) return notFoundRestaurant(res, 'Enlace no válido.');

  const jobs = await openJobs(restaurant.id);

  /* Minimização: NÃO se recolhe documento de identidade, data de
   * nascimento, nacionalidade, morada, estado civil nem fotografia. Campos
   * extra enviados pelo cliente são ignorados (lista fechada). */
  const form = {
    nombre: clean(req.body.nombre, 100),
    apellidos: clean(req.body.apellidos, 100),
    email: clean(req.body.email, 120),
    telefono: clean(req.body.telefono, 30),
    puesto: clean(req.body.puesto, 60),
    otro_puesto: clean(req.body.otro_puesto, 80),
    disponibilidad: clean(req.body.disponibilidad, 30),
    experiencia: clean(req.body.experiencia, 2000),
    observaciones: clean(req.body.observaciones, 1000),
    consent_futuro: req.body.consentimiento_futuro === '1'
  };

  const fail = (errors) => renderPublic(req, res, {
    restaurant, jobs, mode: pageMode(restaurant, jobs), form, errors, status: 422
  });

  /* CSRF: em multipart é validado aqui, depois de o multer ter lido o corpo. */
  if (!verifyCsrf(req)) {
    return res.status(403).render('error', {
      status: 403,
      title: 'Sesión no válida',
      message: 'La sesión ha caducado. Vuelve a abrir la página e inténtalo de nuevo.'
    });
  }

  /* Honeypot: confirma sem gravar nada (§26). */
  if (clean(req.body.sitio_web, 200)) {
    logPublic('spam_honeypot', `rid=${restaurant.id}`, req, restaurant.id);
    return res.redirect(`/r/${restaurant.slug}/enviado`);
  }

  /* Pausado ou sem vagas: a candidatura normal não é aceite. A página mostra
   * em vez disso o formulário de futuras oportunidades (§20). */
  if (restaurant.hiring_status !== 'open' || jobs.length === 0) {
    return res.redirect(`/r/${restaurant.slug}`);
  }

  const errors = {};
  if (form.nombre.length < 2) errors.nombre = 'Indica tu nombre.';
  if (!EMAIL_RE.test(form.email)) errors.email = 'Indica un email válido.';
  if (!PHONE_RE.test(form.telefono)) errors.telefono = 'Indica un teléfono válido.';
  if (form.disponibilidad && !Object.prototype.hasOwnProperty.call(res.app.locals.AVAILABILITIES, form.disponibilidad)) {
    form.disponibilidad = '';
  }

  const jobIds = jobs.map((j) => String(j.id));
  let job = null;
  let jobTitle = form.otro_puesto;

  if (form.puesto === 'otro') {
    if (form.otro_puesto.length < 2) errors.puesto = 'Indica el puesto al que aspiras.';
  } else if (form.puesto) {
    if (!jobIds.includes(form.puesto)) {
      errors.puesto = 'Puesto no disponible.';
    } else {
      job = jobs.find((j) => String(j.id) === form.puesto);
      jobTitle = job ? job.title : '';
    }
  } else {
    jobTitle = '';
  }

  if (!req.file) {
    if (req.uploadError === 'TAMAÑO') {
      errors.cv = 'El archivo supera el límite de {n} MB.';
    } else if (req.uploadError === 'TIPO') {
      errors.cv = 'Solo se aceptan archivos PDF.';
    } else {
      errors.cv = 'Adjunta tu currículum en PDF.';
    }
  } else {
    /* Extensão e MIME vêm do cliente; isto olha para o conteúdo real. */
    const pdf = inspectPdf(req.file.buffer);
    if (!pdf.ok) {
      errors.cv = pdf.reason === 'ACTIVO'
        ? 'El PDF contiene elementos activos (scripts, adjuntos o formularios) que no se aceptan. Expórtalo de nuevo como PDF simple.'
        : pdf.reason === 'CORRUPTO'
          ? 'El PDF parece incompleto o dañado. Vuelve a exportarlo e inténtalo de nuevo.'
          : 'El archivo no es un PDF válido.';
      if (pdf.reason === 'ACTIVO') logPublic('cv_rechazado_activo', `rid=${restaurant.id}`, req, restaurant.id);
    }
  }

  if (Object.keys(errors).length > 0) return fail(errors);

  /* Duplicado (mesmo email, mesmo estabelecimento, < 48 h): a resposta é
   * IGUAL à de um envio aceite. Dizer «ya te habías candidatado» deixaria
   * qualquer pessoa descobrir, só com um email, se alguém se candidatou a
   * este negócio. O segundo envio não é gravado. */
  const dupResponse = () => {
    logPublic('candidatura_duplicada', `rid=${restaurant.id}`, req, restaurant.id);
    return res.redirect(`/r/${restaurant.slug}/enviado`);
  };

  const since = new Date(Date.now() - 2 * 24 * 60 * 60 * 1000).toISOString();
  const dup = await one(
    sb().from('application_list').select('id')
      .eq('restaurant_id', restaurant.id).eq('email', form.email).gt('applied_at', since).limit(1),
    'candidatura duplicada'
  );
  if (dup) return dupResponse();

  /* Ordem: primeiro o ficheiro, depois a BD. Se a função falhar, o objeto é
   * removido; se essa remoção também falhar, a deteção de órfãos da
   * retenção apanha-o. */
  let storagePath;
  try {
    storagePath = await storage.uploadCv(req.file.buffer, restaurant.id);
  } catch (err) {
    console.error('[apply] upload falhou:', err.message);
    return fail({ cv: 'No se pudo guardar el archivo. Inténtalo de nuevo.' });
  }

  let result;
  try {
    result = await rpc('submit_application', {
      restaurant_id: restaurant.id,
      first_name: form.nombre,
      last_name: form.apellidos,
      email: form.email,
      phone: form.telefono,
      job_id: job ? String(job.id) : '',
      job_title: jobTitle || '',
      availability: form.disponibilidad,
      experience: form.experiencia,
      observations: form.observaciones,
      future_consent: form.consent_futuro,
      future_text: form.consent_futuro
        ? futureText(restaurant.commercial_name || restaurant.name, restaurant.retention_reserve_days)
        : '',
      consent_version: CONSENT_VERSION,
      privacy_notice_version: PRIVACY_NOTICE_VERSION,
      storage_path: storagePath,
      original_filename: safeFilename(req.file.originalname),
      size_bytes: req.file.size
    }, 'enviar candidatura');
  } catch (err) {
    await storage.removeCv(storagePath);
    console.error('[apply] erro:', err.message);
    return res.status(500).render('error', {
      status: 500, title: 'Error', message: 'No se pudo enviar la candidatura. Inténtalo de nuevo.'
    });
  }

  if (!result || !result.ok) {
    await storage.removeCv(storagePath);
    if (result && result.reason === 'duplicate') return dupResponse();
    return res.status(500).render('error', {
      status: 500, title: 'Error', message: 'No se pudo enviar la candidatura. Inténtalo de nuevo.'
    });
  }

  /* Email ao restaurante: só aviso + link para o painel (sem CV nem dados do
   * candidato). Não bloqueia a resposta ao candidato. */
  background(notifyNewApplication({ restaurant, applicationId: result.application_id, jobTitle }), 'mailer');

  /* Métrica do negócio (Painel NexForge): só «chegou uma candidatura», nada do candidato. */
  analytics.feature(restaurant.id, 'candidatura_recebida');
  logPublic('candidatura_enviada', `rid=${restaurant.id} app=${result.application_id}`, req, restaurant.id);

  /* POST-Redirect-GET: evita reenvio ao recarregar (§7). */
  res.redirect(`/r/${restaurant.slug}/enviado`);
});

/* ------------------------------------------------------------------ *
 * POST /r/:slug/interes — deixar dados quando pausado / sem vagas (§20)
 * ------------------------------------------------------------------ */
const interestLimiters = [
  rateLimit({
    windowMs: 60 * 60 * 1000, max: 20, name: 'interest',
    key: (req) => `${req.ip}|${req.params.slug}`,
    message: 'Demasiadas solicitudes. Inténtalo más tarde.'
  }),
  dbRateLimit({
    windowMs: 60 * 60 * 1000, max: 60, name: 'interest-ip',
    key: (req) => String(req.ip),
    message: 'Demasiadas solicitudes. Inténtalo más tarde.'
  })
];

router.post('/r/:slug/interes', ...interestLimiters, async (req, res) => {
  const restaurant = await getPublicRestaurant(req.params.slug);
  if (!restaurant || restaurant.demo) return notFoundRestaurant(res, 'Enlace no válido.');

  if (!verifyCsrf(req)) {
    return res.status(403).render('error', {
      status: 403, title: 'Sesión no válida', message: 'Vuelve a abrir la página e inténtalo de nuevo.'
    });
  }

  const form = {
    nombre: clean(req.body.nombre, 100),
    email: clean(req.body.email, 120),
    telefono: clean(req.body.telefono, 30),
    experiencia: clean(req.body.experiencia, 500),
    consent_futuro: req.body.consentimiento_futuro === '1'
  };

  if (clean(req.body.sitio_web, 200)) {
    logPublic('spam_honeypot', `rid=${restaurant.id}`, req, restaurant.id);
    return res.redirect(`/r/${restaurant.slug}/enviado?tipo=futuro`);
  }

  const errors = [];
  if (form.nombre.length < 2) errors.push('Indica tu nombre.');
  if (!EMAIL_RE.test(form.email)) errors.push('Indica un email válido.');
  if (!PHONE_RE.test(form.telefono)) errors.push('Indica un teléfono válido.');
  /* Aqui o consentimento é o próprio pedido: o formulário só serve para a
   * reserva. Sem ele não há nada para guardar. */
  if (!form.consent_futuro) {
    errors.push('Para guardar tus datos necesitamos que marques la casilla de futuras oportunidades.');
  }

  if (errors.length > 0) {
    const jobs = await openJobs(restaurant.id);
    return renderPublic(req, res, {
      restaurant,
      jobs,
      mode: restaurant.hiring_status === 'open' ? 'no_jobs' : 'paused',
      form,
      errors: { general: errors },
      status: 422
    });
  }

  const result = await rpc('submit_interest', {
    restaurant_id: restaurant.id,
    first_name: form.nombre,
    email: form.email,
    phone: form.telefono,
    experience: form.experiencia,
    consent_version: CONSENT_VERSION,
    privacy_notice_version: PRIVACY_NOTICE_VERSION,
    future_text: interestText(restaurant.commercial_name || restaurant.name, restaurant.retention_reserve_days)
  }, 'registar interesse');

  if (!result || !result.ok) {
    if (result && result.reason === 'duplicate') {
      /* Mesma resposta que um envio aceite (sem enumeração). */
      return res.redirect(`/r/${restaurant.slug}/enviado?tipo=futuro`);
    }
    return res.status(500).render('error', {
      status: 500, title: 'Error', message: 'No se pudo guardar. Inténtalo de nuevo.'
    });
  }

  background(notifyNewApplication({ restaurant, applicationId: result.application_id, jobTitle: 'Oportunidades futuras' }), 'mailer');
  analytics.feature(restaurant.id, 'candidatura_recebida');
  logPublic('interes_registrado', `rid=${restaurant.id} app=${result.application_id}`, req, restaurant.id);

  res.redirect(`/r/${restaurant.slug}/enviado?tipo=futuro`);
});

/* ------------------------------------------------------------------ *
 * GET /r/:slug/enviado — confirmação (§7)
 * ------------------------------------------------------------------ *
 * Não mostra nada interno: nem posição, nem estado, nem outros candidatos.
 */
router.get('/r/:slug/enviado', ensureSession, async (req, res) => {
  const restaurant = await getPublicRestaurant(req.params.slug);
  if (!restaurant || restaurant.demo) return notFoundRestaurant(res, 'Enlace no válido.');
  res.render('public/sent', { restaurant, future: req.query.tipo === 'futuro' });
});

/* ------------------------------------------------------------------ *
 * Informação completa (2.ª camada) e exercício de direitos
 * ------------------------------------------------------------------ *
 * GET  /r/:slug/privacidad  informação do art. 13 RGPD deste estabelecimento
 * POST /r/:slug/derechos    pedido de acesso, supressão, etc.
 *
 * O pedido chega ao painel do estabelecimento (responsável), com o prazo de
 * 1 mês do art. 12.3 RGPD. O Fíchame, como encarregado, encaminha e não
 * decide (art. 28.3.e RGPD). A verificação de identidade é proporcional: o
 * estabelecimento responde ao email que consta na candidatura.
 */
router.get('/r/:slug/privacidad', ensureSession, async (req, res) => {
  const restaurant = await getPublicRestaurant(req.params.slug);
  if (!restaurant) return notFoundRestaurant(res);
  res.render('public/restaurant_privacy', {
    restaurant,
    operator,
    kinds: RIGHTS_KINDS,
    form: {},
    errors: null,
    noticeVersion: PRIVACY_NOTICE_VERSION,
    retention: {
      inactive: days2months(restaurant.retention_inactive_days),
      closed: days2months(restaurant.retention_closed_days),
      reserve: days2months(restaurant.retention_reserve_days)
    },
    sentRef: ''
  });
});

router.post('/r/:slug/derechos',
  rateLimit({ windowMs: 60 * 60 * 1000, max: 5, name: 'rights', key: (req) => `${req.ip}|${req.params.slug}` }),
  dbRateLimit({ windowMs: 24 * 60 * 60 * 1000, max: 10, name: 'rights-ip', key: (req) => String(req.ip) }),
  async (req, res) => {
    const restaurant = await getPublicRestaurant(req.params.slug);
    if (!restaurant || restaurant.demo) return notFoundRestaurant(res);
    if (!verifyCsrf(req)) {
      return res.status(403).render('error', { status: 403, title: 'Sesión no válida', message: 'Vuelve a abrir la página.' });
    }

    const form = {
      kind: clean(req.body.tipo, 40),
      name: clean(req.body.nombre, 100),
      email: clean(req.body.email, 120),
      message: clean(req.body.mensaje, 1500)
    };

    const render = (extra) => res.status(extra.status || 200).render('public/restaurant_privacy', {
      restaurant,
      operator,
      kinds: RIGHTS_KINDS,
      noticeVersion: PRIVACY_NOTICE_VERSION,
      retention: {
        inactive: days2months(restaurant.retention_inactive_days),
        closed: days2months(restaurant.retention_closed_days),
        reserve: days2months(restaurant.retention_reserve_days)
      },
      form,
      errors: null,
      sentRef: '',
      ...extra
    });

    if (clean(req.body.sitio_web, 200)) return render({ sentRef: 'FCH-' + crypto.randomBytes(4).toString('hex').toUpperCase() });

    const errors = {};
    if (!Object.prototype.hasOwnProperty.call(RIGHTS_KINDS, form.kind)) errors.tipo = 'Selecciona el tipo de solicitud.';
    if (form.name.length < 2) errors.nombre = 'Indica tu nombre.';
    if (!EMAIL_RE.test(form.email)) errors.email = 'Indica el email con el que te candidataste.';
    if (Object.keys(errors).length > 0) return render({ errors, status: 422 });

    const ref = 'FCH-' + crypto.randomBytes(5).toString('hex').toUpperCase();
    const result = await rpc('create_rights_request', {
      restaurant_id: restaurant.id,
      public_ref: ref,
      kind: form.kind,
      requester_name: form.name,
      requester_email: form.email,
      message: form.message
    }, 'pedido de direitos');

    background(notifyRightsRequest({ restaurant, dueAt: result.due_at }), 'mailer');
    logPublic('derechos_solicitud', `rid=${restaurant.id} req=${result.id} tipo=${form.kind}`, req, restaurant.id);

    /* A resposta é a mesma exista ou não uma candidatura com esse email: o
     * formulário não serve para descobrir se alguém se candidatou. */
    render({ sentRef: ref, form: {} });
  });

/* ------------------------------------------------------------------ *
 * GET /r/:slug/imagen/:tipo — logo ou foto do estabelecimento
 * ------------------------------------------------------------------ *
 * As imagens são públicas por destino (aparecem na página NFC) mas vivem num
 * bucket privado e são servidas por aqui. Assim o CSP continua a ser
 * `img-src 'self'` e o domínio do Supabase não precisa de ser autorizado no
 * browser.
 */
router.get('/r/:slug/imagen/:tipo', async (req, res) => {
  const field = req.params.tipo === 'foto' ? 'photo_path' : 'logo_path';
  if (!/^[a-z0-9][a-z0-9-]{0,80}$/.test(String(req.params.slug || ''))) return res.status(404).end();

  const restaurant = await one(
    sb().from('restaurants').select(`id, ${field}`).eq('slug', String(req.params.slug || '')).eq('active', true),
    'imagem do restaurante'
  );

  if (!restaurant || !restaurant[field]) return res.status(404).end();

  const buffer = await storage.downloadImage(restaurant[field]);
  if (!buffer) return res.status(404).end();

  /* O tipo é derivado da extensão que o upload atribuiu a partir dos magic
   * bytes do conteúdo, não de nada enviado pelo cliente. */
  const ext = String(restaurant[field]).split('.').pop().toLowerCase();
  const mime = ext === 'png' ? 'image/png' : ext === 'webp' ? 'image/webp' : 'image/jpeg';

  res.setHeader('Content-Type', mime);
  res.setHeader('Content-Length', buffer.length);
  /* Conteúdo público do negócio (não dados de candidatos): pode ficar em
   * cache. Com ?v=<ficheiro> o URL muda a cada novo upload. */
  res.setHeader('Cache-Control', req.query.v
    ? 'public, max-age=604800, s-maxage=604800, immutable'
    : 'public, max-age=300');
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.end(buffer);
});

module.exports = router;

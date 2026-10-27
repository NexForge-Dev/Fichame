'use strict';

const express = require('express');
const QRCode = require('qrcode');

const config = require('../config');
const { sb, one, many, count, run, rpc, escapeLike, logSecurity, dbError } = require('../db');
const { requireOwner } = require('../middleware/auth');
const { verifyCsrf } = require('../middleware/csrf');
const { rateLimit } = require('../middleware/rateLimit');
const { hashPassword, verifyPassword } = require('../lib/crypto');
const google = require('../lib/google');
const { uploadRestaurantImages } = require('../middleware/uploads');
const { destroyUserSessions } = require('../middleware/session');
const { findProtectedTerms } = require('../lib/sensitive');
const { passwordProblem } = require('./auth');
const { isDemoUser } = require('../lib/demo');
const storage = require('../lib/storage');
const { QR_OPTIONS } = require('../lib/qr');
const { background } = require('../lib/background');
const { TERMS_VERSION, TERMS_CHANGES, operator, termsPending, recordAcceptance } = require('../lib/legal');
const {
  STATUSES, STATUS_KEYS, STATUS_GROUPS, AVAILABILITIES, ESTABLISHMENT_TYPES,
  CONTRACT_TYPES, WORK_SCHEDULES, statusLabel
} = require('../lib/statuses');

const router = express.Router();

router.use('/panel', requireOwner);

/* Nome do estabelecimento, contador de notificações para o menu e aviso de
 * termos novos por aceitar. As duas queries vão em paralelo para não somar
 * latência a cada página. */
router.use('/panel', async (req, res, next) => {
  res.locals.restaurantName = req.user.restaurant_name || '';
  const [unread, legal] = await Promise.allSettled([
    count(
      sb().from('notifications')
        .select('id', { count: 'exact', head: true })
        .eq('restaurant_id', req.user.restaurant_id)
        .eq('channel', 'panel')
        .eq('status', 'unread'),
      'notificações não lidas'
    ),
    one(
      sb().from('restaurants').select('terms_version, dpa_version').eq('id', req.user.restaurant_id),
      'versão dos termos aceite'
    )
  ]);
  res.locals.unreadCount = unread.status === 'fulfilled' ? unread.value : 0;
  res.locals.termsPending = legal.status === 'fulfilled' && termsPending(legal.value);
  next();
});

/* Demo só de leitura: qualquer alteração volta à página de onde veio com o
 * aviso. Só o caminho do Referer é usado (nunca o host), por isso não há
 * redirecionamento para fora do site. */
router.use('/panel', (req, res, next) => {
  res.locals.isDemo = isDemoUser(req.user);
  if (!res.locals.isDemo || ['GET', 'HEAD'].includes(req.method)) return next();

  let back = '/panel';
  try {
    const ref = new URL(req.get('referer') || '', 'http://x');
    if (ref.pathname.startsWith('/panel')) back = ref.pathname;
  } catch { /* Referer inválido: volta ao início */ }
  res.redirect(back + '?err=' + encodeURIComponent('Esto es una demostración: los cambios no se guardan. Crea tu cuenta gratis para usar Fíchame con tu negocio.'));
});

/* «2026-03-15» + hora → instante com o offset de Madrid nesse dia (+01:00
 * no inverno, +02:00 no verão), para comparar com timestamptz. */
function madridTime(date, time) {
  const part = new Intl.DateTimeFormat('en-US', { timeZone: 'Europe/Madrid', timeZoneName: 'longOffset' })
    .formatToParts(new Date(`${date}T12:00:00Z`))
    .find((p) => p.type === 'timeZoneName');
  const offset = part ? part.value.replace('GMT', '') : '';
  return `${date}T${time}${offset || '+00:00'}`;
}

/* «AAAA-MM-DD» que existe no calendário. Só a forma não chega: 2026-13-01
 * rebentava em madridTime e 2026-02-30 era recusado pelo Postgres (500). */
function validDate(value) {
  const s = String(value || '');
  if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) return '';
  const d = new Date(`${s}T00:00:00Z`);
  return !Number.isNaN(d.getTime()) && d.toISOString().startsWith(s) ? s : '';
}

function clean(value, max = 200) {
  return String(value == null ? '' : value).trim().slice(0, max);
}

function restaurantId(req) {
  return req.user.restaurant_id;
}

function notFound(res) {
  return res.status(404).render('error', {
    status: 404,
    title: 'No encontrado',
    message: 'Este elemento no existe o no pertenece a tu establecimiento.'
  });
}

/* Ids nas rotas são sempre inteiros positivos. Sem isto, /panel/cv/abc
 * chegava ao Postgres como NaN e dava 500 em vez de 404. */
for (const name of ['id', 'noteId']) {
  router.param(name, (req, res, next, value) => {
    if (!/^\d{1,18}$/.test(String(value))) return notFound(res);
    next();
  });
}

function invalidSession(res) {
  return res.status(403).render('error', {
    status: 403, title: 'Sesión no válida', message: 'Recarga la página.'
  });
}

/* Candidatura do restaurante da sessão, ou null.
 *
 * O filtro por restaurant_id é a proteção contra IDOR (§8): trocar o id no
 * URL para uma candidatura de outro estabelecimento devolve 404, não os
 * dados. É esta função que todas as rotas de candidatura usam. */
async function ownApplication(req) {
  return one(
    sb().from('application_list')
      .select('*')
      .eq('id', Number(req.params.id))
      .eq('restaurant_id', restaurantId(req)),
    'candidatura'
  );
}

/* Contagem por estado para o pipeline visual (§13). */
async function statusCounts(rid) {
  const rows = await many(
    sb().from('application_status_counts').select('status, n').eq('restaurant_id', rid),
    'contagem por estado'
  );

  const counts = {};
  for (const key of STATUS_KEYS) counts[key] = 0;
  for (const row of rows) {
    if (counts[row.status] !== undefined) counts[row.status] = Number(row.n) || 0;
  }
  return counts;
}

/* ================================================================== *
 * Dashboard (§11)
 * ================================================================== */
router.get('/panel', async (req, res) => {
  const rid = restaurantId(req);

  const [counts, metrics, recent, profile, openJobList] = await Promise.all([
    statusCounts(rid),
    one(sb().from('restaurant_metrics').select('*').eq('restaurant_id', rid), 'métricas'),
    many(
      sb().from('application_list')
        .select('id, status, applied_at, job_title, first_name, last_name')
        .eq('restaurant_id', rid)
        .order('applied_at', { ascending: false })
        .order('id', { ascending: false })
        .limit(8),
      'candidaturas recentes'
    ),
    // só para o guia de primeiros passos
    one(sb().from('restaurants').select('logo_path, page_viewed_at, qr_viewed_at').eq('id', rid), 'perfil do restaurante'),
    // vagas abertas, para o ecrã «à espera da primeira candidatura»
    many(
      sb().from('job_list').select('id, title, applicants')
        .eq('restaurant_id', rid).eq('active', true)
        .order('created_at', { ascending: false })
        .limit(6),
      'vagas abertas'
    )
  ]);

  const firstName = String(req.user.full_name || '').trim().split(/\s+/)[0] || '';

  res.render('panel/dashboard', {
    firstName,
    hasLogo: Boolean(profile && profile.logo_path),
    pageViewed: Boolean(profile && profile.page_viewed_at),
    qrViewed: Boolean(profile && profile.qr_viewed_at),
    nfcUrl: `${config.appUrl}/r/${req.user.restaurant_slug}`,
    counts,
    total: Number(metrics && metrics.total) || 0,
    weekCount: Number(metrics && metrics.week) || 0,
    monthCount: Number(metrics && metrics.month) || 0,
    openJobs: Number(metrics && metrics.open_jobs) || 0,
    openJobList,
    recent,
    restaurant: {
      name: req.user.restaurant_name,
      slug: req.user.restaurant_slug,
      hiring: req.user.restaurant_hiring
    },
    query: req.query
  });
});

/* ================================================================== *
 * Lista de candidaturas com filtros (§12)
 * ================================================================== */
router.get('/panel/candidaturas', async (req, res) => {
  const rid = restaurantId(req);

  const q = clean(req.query.q, 80);
  const estado = STATUS_KEYS.includes(req.query.estado) ? req.query.estado : '';
  const grupo = !estado && Object.prototype.hasOwnProperty.call(STATUS_GROUPS, req.query.grupo) ? req.query.grupo : '';
  const puesto = /^\d{1,15}$/.test(String(req.query.puesto || '')) ? String(req.query.puesto) : '';
  const disp = Object.prototype.hasOwnProperty.call(AVAILABILITIES, req.query.disp) ? String(req.query.disp) : '';
  const desde = validDate(req.query.desde);
  const hasta = validDate(req.query.hasta);
  const favs = req.query.favs === '1';
  const ascending = req.query.orden === 'antiguas';

  /* count: o total real dos filtros, não só as 200 linhas mostradas. */
  let query = sb().from('application_list')
    .select('id, status, applied_at, job_title, availability, future_interest, favorite, experience, first_name, last_name, email, phone',
      { count: 'exact' })
    .eq('restaurant_id', rid);

  /* A busca livre cobre nome, email, telefone, documento, vaga, experiência e
   * observações. A view concentra tudo em `search_text`, por isso é um único
   * ilike em vez de um OR sobre sete colunas de duas tabelas. */
  if (q) query = query.ilike('search_text', `%${escapeLike(q.toLowerCase())}%`);

  if (estado) query = query.eq('status', estado);
  if (grupo) query = query.in('status', STATUS_GROUPS[grupo].statuses);
  if (puesto) query = query.eq('job_id', Number(puesto));
  if (disp) query = query.eq('availability', disp);
  /* As datas do ecrã estão em hora de Madrid; sem o offset, o PostgREST lia
   * os limites em UTC e uma candidatura das 00:30 caía no dia anterior. */
  if (desde) query = query.gte('applied_at', madridTime(desde, '00:00:00'));
  if (hasta) query = query.lte('applied_at', madridTime(hasta, '23:59:59.999'));
  if (favs) query = query.eq('favorite', true);

  query = query
    .order('applied_at', { ascending })
    .order('id', { ascending })
    .limit(200);

  const [{ rows, total }, jobs, pipeline] = await Promise.all([
    (async () => {
      const { data, count: n, error } = await query;
      if (error) throw dbError(error, 'lista de candidaturas');
      return { rows: data || [], total: Number(n) || 0 };
    })(),
    many(
      sb().from('jobs').select('id, title').eq('restaurant_id', rid).order('title'),
      'vagas'
    ),
    statusCounts(rid)
  ]);

  res.render('panel/applications', {
    rows,
    jobs,
    groups: STATUS_GROUPS,
    filters: { q, estado, grupo, puesto, disp, desde, hasta, favs, orden: ascending ? 'antiguas' : 'recientes' },
    totalFiltered: Math.max(total, rows.length),
    pipeline,
    query: req.query
  });
});

/* ================================================================== *
 * Perfil do candidato (§14)
 * ================================================================== */
router.get('/panel/candidaturas/:id', async (req, res) => {
  const application = await ownApplication(req);
  if (!application) return notFound(res);

  const rid = restaurantId(req);

  /* Abrir a ficha de uma candidatura nova é vê-la: passa sozinha a «Visto»,
   * para o dono não ter de mudar o estado à mão só para a tirar de «Nuevas».
   * Corre antes das leituras para o histórico já mostrar a mudança. Na demo
   * nada se grava. */
  if (application.status === 'nuevo' && !res.locals.isDemo) {
    const seen = await rpc('set_application_status', {
      application_id: application.id,
      restaurant_id: rid,
      user_id: req.user.id,
      status: 'revisado'
    }, 'marcar como visto');
    if (seen && seen.ok) application.status = 'revisado';
  }

  /* «Siguiente candidato»: primeiro a nova mais recente que falte ver; se não
   * houver, a seguinte da lista (mais antiga que esta). */
  const nextQuery = () => sb().from('application_list').select('id')
    .eq('restaurant_id', rid).neq('id', application.id)
    .order('applied_at', { ascending: false }).order('id', { ascending: false }).limit(1);

  const [extra, notes, cv, consent, history, markedRead, nextNew, nextOlder] = await Promise.all([
    one(
      sb().from('applications')
        .select('legal_hold, legal_hold_reason, retention_until, closed_at')
        .eq('id', application.id).eq('restaurant_id', rid),
      'retenção da candidatura'
    ),
    many(
      sb().from('application_notes')
        .select('id, body, created_at, user_id, users(full_name)')
        .eq('application_id', application.id)
        .eq('restaurant_id', rid)
        .order('created_at', { ascending: false })
        .order('id', { ascending: false }),
      'notas'
    ),
    one(
      sb().from('cvs').select('*').eq('application_id', application.id).eq('restaurant_id', rid),
      'cv'
    ),
    /* consents não tem restaurant_id; a posse já foi verificada em
     * ownApplication (a candidatura é deste restaurante). */
    one(
      sb().from('consents').select('*').eq('application_id', application.id),
      'consentimentos'
    ),
    many(
      sb().from('application_history')
        .select('id, event, old_status, new_status, detail, created_at, user_id, users(full_name)')
        .eq('application_id', application.id)
        .eq('restaurant_id', rid)
        .order('created_at', { ascending: false })
        .order('id', { ascending: false }),
      'histórico'
    ),
    /* Abrir a ficha conta como ver o aviso: sem isto o contador do menu
     * só baixava com «Marcar como leídas». */
    /* Na demo (só de leitura) não se escreve nada. */
    res.locals.isDemo ? Promise.resolve([]) : many(
      sb().from('notifications')
        .update({ status: 'read', read_at: new Date().toISOString() })
        .eq('application_id', application.id)
        .eq('restaurant_id', rid)
        .eq('channel', 'panel')
        .eq('status', 'unread')
        .select('id'),
      'marcar aviso como lido'
    ),
    one(nextQuery().eq('status', 'nuevo'), 'seguinte nova'),
    one(nextQuery().lt('applied_at', application.applied_at), 'seguinte candidatura')
  ]);

  logSecurity('candidatura_vista', `app=${application.id}`, req.ip, { userId: req.user.id, restaurantId: rid });

  if (markedRead.length > 0 && res.locals.unreadCount > 0) {
    res.locals.unreadCount = Math.max(0, res.locals.unreadCount - markedRead.length);
  }

  /* As views do EJS esperam `author` como texto simples. */
  const withAuthor = (rows) => rows.map((r) => ({
    ...r,
    author: (r.users && r.users.full_name) || ''
  }));

  res.render('panel/application', {
    a: { ...application, ...(extra || {}) },
    notes: withAuthor(notes),
    history: withAuthor(history),
    cv,
    consent,
    next: nextNew || nextOlder || null,
    nextIsNew: Boolean(nextNew),
    query: req.query
  });
});

/* ================================================================== *
 * Alterar estado (§13)
 * ================================================================== */
router.post('/panel/candidaturas/:id/estado', async (req, res) => {
  if (!verifyCsrf(req)) return invalidSession(res);

  const id = Number(req.params.id);
  const status = clean(req.body.status, 40);

  if (!STATUS_KEYS.includes(status)) {
    return res.redirect(`/panel/candidaturas/${id}?err=` + encodeURIComponent('Estado no válido.'));
  }

  /* A posse é verificada dentro da função: não há janela entre validar e
   * escrever, e o histórico fica no mesmo commit que a alteração.
   * O texto do histórico é composto na view a partir de old_status/new_status,
   * para não congelar aqui as etiquetas em espanhol. */
  const result = await rpc('set_application_status', {
    application_id: id,
    restaurant_id: restaurantId(req),
    user_id: req.user.id,
    status
  }, 'alterar estado');

  if (result && result.reason === 'no_consent') {
    return res.redirect(`/panel/candidaturas/${id}?err=` + encodeURIComponent(
      'Solo se puede marcar «Para el futuro» si el candidato aceptó que le guardes para otras vacantes. ' +
      'Si no lo aceptó, sus datos se borran al terminar el proceso.'));
  }
  if (!result || !result.ok) return notFound(res);

  if (result.old_status !== result.new_status) {
    logSecurity('estado_cambiado', `app=${id} ${result.old_status} → ${status}`, req.ip, {
      userId: req.user.id, restaurantId: restaurantId(req)
    });
  }

  res.redirect(`/panel/candidaturas/${id}?ok=` +
    encodeURIComponent(req.tr('Estado actualizado: {status}', { status: req.tr(statusLabel(status)) })));
});

/* ================================================================== *
 * Favorito (§16)
 * ================================================================== */
router.post('/panel/candidaturas/:id/favorito', async (req, res) => {
  if (!verifyCsrf(req)) return invalidSession(res);

  const id = Number(req.params.id);

  const result = await rpc('toggle_favorite', {
    application_id: id,
    restaurant_id: restaurantId(req),
    user_id: req.user.id
  }, 'favorito');

  if (!result || !result.ok) return notFound(res);

  res.redirect(`/panel/candidaturas/${id}?ok=` + encodeURIComponent(
    result.favorite ? 'Candidato marcado como favorito.' : 'Favorito retirado.'
  ));
});

/* ================================================================== *
 * Notas internas (§17)
 * ================================================================== */
router.post('/panel/candidaturas/:id/notas', rateLimit({
  windowMs: 10 * 60 * 1000, max: 30, name: 'notes', key: (req) => String(req.user && req.user.id)
}), async (req, res) => {
  if (!verifyCsrf(req)) return invalidSession(res);

  const application = await ownApplication(req);
  if (!application) return notFound(res);

  const body = clean(req.body.nota, 2000);
  if (body.length < 2) {
    return res.redirect(`/panel/candidaturas/${application.id}?err=` + encodeURIComponent('La nota está vacía.'));
  }

  /* Fricção contra notas com características protegidas (ver
   * lib/sensitive.js — não é uma garantia). Sem confirmação explícita a nota
   * não é gravada; com confirmação fica registado que o foi (sem o texto). */
  const terms = findProtectedTerms(body);
  if (terms.length > 0 && req.body.confirmar_sensible !== '1') {
    logSecurity('nota_sensible_bloqueada', `app=${application.id}`, req.ip, {
      userId: req.user.id, restaurantId: restaurantId(req), metadata: { terms }
    });
    return res.redirect(`/panel/candidaturas/${application.id}?sensible=1&err=` + encodeURIComponent(
      'La nota no se ha guardado: parece mencionar salud, religión, origen, edad, situación familiar u otra ' +
      'característica protegida. No registres esa información: es un dato especialmente protegido o puede ser ' +
      'discriminatorio. Si es imprescindible y legítimo para el puesto, reescribe la nota y marca la casilla de confirmación.'));
  }

  await run(
    sb().from('application_notes').insert({
      application_id: application.id,
      restaurant_id: restaurantId(req),
      user_id: req.user.id,
      body
    }),
    'guardar nota'
  );

  logSecurity(terms.length > 0 ? 'nota_sensible_confirmada' : 'nota_creada', `app=${application.id}`, req.ip, {
    userId: req.user.id, restaurantId: restaurantId(req), metadata: terms.length > 0 ? { terms } : {}
  });

  res.redirect(`/panel/candidaturas/${application.id}?ok=` + encodeURIComponent('Nota guardada.'));
});

router.post('/panel/candidaturas/:id/notas/:noteId/eliminar', async (req, res) => {
  if (!verifyCsrf(req)) return invalidSession(res);

  const application = await ownApplication(req);
  if (!application) return notFound(res);

  await run(
    sb().from('application_notes')
      .delete()
      .eq('id', Number(req.params.noteId))
      .eq('application_id', application.id)
      .eq('restaurant_id', restaurantId(req)),
    'eliminar nota'
  );

  logSecurity('nota_eliminada', `app=${application.id} nota=${Number(req.params.noteId)}`, req.ip, {
    userId: req.user.id, restaurantId: restaurantId(req)
  });

  res.redirect(`/panel/candidaturas/${application.id}?ok=` + encodeURIComponent('Nota eliminada.'));
});

/* ================================================================== *
 * Eliminar candidatura, com o CV
 * ================================================================== */
router.post('/panel/candidaturas/:id/eliminar', async (req, res) => {
  if (!verifyCsrf(req)) return invalidSession(res);

  const id = Number(req.params.id);
  const rid = restaurantId(req);

  const result = await rpc('delete_application', {
    application_id: id,
    restaurant_id: rid
  }, 'eliminar candidatura');

  if (result && result.reason === 'legal_hold') {
    return res.redirect(`/panel/candidaturas/${id}?err=` + encodeURIComponent(
      'Esta candidatura tiene un bloqueo de conservación activo. Retíralo antes de eliminarla.'));
  }
  if (!result || !result.ok) return notFound(res);

  /* A função devolve o caminho do objeto porque não tem acesso ao Storage.
   * O ficheiro é apagado aqui, depois de a candidatura já não existir. */
  if (result.storage_path) await storage.removeCv(result.storage_path);

  logSecurity('candidatura_eliminada', `app=${id} rid=${rid}`, req.ip, {
    userId: req.user.id, restaurantId: rid
  });

  res.redirect('/panel/candidaturas?ok=' + encodeURIComponent('Candidatura eliminada junto con su CV.'));
});

/* ================================================================== *
 * CV: visualização e download (§14, §24)
 * ================================================================== */
/* O bucket é privado e não existe URL pública. O ficheiro só sai daqui depois
 * de confirmado que: a sessão é válida (requireOwner), o CV existe, e
 * pertence ao restaurante da sessão. */
router.get('/panel/cv/:id', async (req, res) => {
  const cv = await one(
    sb().from('cvs')
      .select('*')
      .eq('id', Number(req.params.id))
      .eq('restaurant_id', restaurantId(req)),
    'cv'
  );

  /* Defesa em profundidade: além do filtro por restaurant_id na BD, o objeto
   * tem de estar na pasta do próprio restaurante no bucket. */
  if (!cv || !String(cv.storage_path).startsWith(`r/${Number(restaurantId(req))}/`)) return notFound(res);

  const download = req.query.descargar === '1';

  /* Auditoria: quem abriu que CV e quando (sem dados do candidato). Esperado
   * com await: um acesso a um CV sem registo não é auditável. */
  await logSecurity(download ? 'cv_descargado' : 'cv_visto', `cv=${cv.id} app=${cv.application_id}`, req.ip, {
    userId: req.user.id, restaurantId: restaurantId(req), userAgent: req.headers['user-agent']
  });

  const buffer = await storage.downloadCv(cv.storage_path);
  if (!buffer) {
    return res.status(404).render('error', {
      status: 404, title: 'CV no disponible', message: 'El archivo ya no existe.'
    });
  }

  const asciiName = String(cv.original_filename)
    .replace(/[^\x20-\x7E]/g, '_')
    .replace(/["\\;]/g, '_') || 'cv.pdf';

  res.setHeader('Content-Type', 'application/pdf');
  res.setHeader('Content-Length', buffer.length);
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('Cache-Control', 'private, no-store');
  res.setHeader('Content-Disposition',
    `${download ? 'attachment' : 'inline'}; filename="${asciiName}"; ` +
    `filename*=UTF-8''${encodeURIComponent(cv.original_filename)}`);

  res.end(buffer);
});

/* ================================================================== *
 * Vagas (§19)
 * ================================================================== */
router.get('/panel/vagas', async (req, res) => {
  const jobs = await many(
    sb().from('job_list')
      .select('*')
      .eq('restaurant_id', restaurantId(req))
      .order('active', { ascending: false })
      .order('title'),
    'vagas'
  );

  res.render('panel/jobs', { jobs, query: req.query });
});

function jobForm(body) {
  const pick = (table, value) =>
    Object.prototype.hasOwnProperty.call(table, value) ? String(value) : '';

  return {
    title: clean(body.titulo, 80),
    description: clean(body.descripcion, 2000),
    requirements: clean(body.requisitos, 2000),
    availability: pick(AVAILABILITIES, body.disponibilidad),
    contract_type: pick(CONTRACT_TYPES, body.contrato),
    work_schedule: pick(WORK_SCHEDULES, body.jornada)
  };
}

router.post('/panel/vagas/crear', rateLimit({
  windowMs: 10 * 60 * 1000, max: 20, name: 'jobs-new', key: (req) => String(req.user && req.user.id)
}), async (req, res) => {
  if (!verifyCsrf(req)) return invalidSession(res);

  const f = jobForm(req.body);
  if (f.title.length < 2) {
    return res.redirect('/panel/vagas?err=' + encodeURIComponent('Indica el título de la vacante.'));
  }

  await run(
    sb().from('jobs').insert({ restaurant_id: restaurantId(req), ...f }),
    'criar vaga'
  );

  res.redirect('/panel/vagas?ok=' + encodeURIComponent('Vacante creada.'));
});

router.post('/panel/vagas/:id/toggle', async (req, res) => {
  if (!verifyCsrf(req)) return invalidSession(res);

  const result = await rpc('toggle_job_active', {
    job_id: Number(req.params.id),
    restaurant_id: restaurantId(req)
  }, 'ativar/desativar vaga');
  if (!result || !result.ok) return notFound(res);

  res.redirect('/panel/vagas?ok=' + encodeURIComponent('Vacante actualizada.'));
});

router.post('/panel/vagas/:id/editar', async (req, res) => {
  if (!verifyCsrf(req)) return invalidSession(res);

  const f = jobForm(req.body);
  if (f.title.length < 2) {
    return res.redirect('/panel/vagas?err=' + encodeURIComponent('Indica el título de la vacante.'));
  }

  const updated = await many(
    sb().from('jobs')
      .update(f)
      .eq('id', Number(req.params.id))
      .eq('restaurant_id', restaurantId(req))
      .select('id'),
    'editar vaga'
  );
  if (updated.length === 0) return notFound(res);

  res.redirect('/panel/vagas?ok=' + encodeURIComponent('Vacante actualizada.'));
});

/* Eliminar a vaga não apaga candidaturas: job_id fica null e o título
 * continua guardado em applications.job_title. */
router.post('/panel/vagas/:id/eliminar', async (req, res) => {
  if (!verifyCsrf(req)) return invalidSession(res);

  const id = Number(req.params.id);
  const result = await rpc('delete_job', {
    job_id: id,
    restaurant_id: restaurantId(req)
  }, 'eliminar vaga');

  if (!result || !result.ok) {
    return res.redirect('/panel/vagas?err=' + encodeURIComponent('Vacante no encontrada.'));
  }

  logSecurity('vacante_eliminada', `job=${id} ${result.title}`, req.ip, {
    userId: req.user.id, restaurantId: restaurantId(req)
  });

  res.redirect('/panel/vagas?ok=' +
    encodeURIComponent('Vacante eliminada. Las candidaturas asociadas se conservan.'));
});

/* ================================================================== *
 * Pausar / ativar candidaturas (§20)
 * ================================================================== */
/* A etiqueta NFC não muda: a URL continua a funcionar e é o backend que
 * decide o que mostrar. */
router.post('/panel/contratacion', async (req, res) => {
  if (!verifyCsrf(req)) return invalidSession(res);

  const action = clean(req.body.accion, 20);
  if (!['pausar', 'activar'].includes(action)) {
    return res.redirect('/panel?err=' + encodeURIComponent('Acción no válida.'));
  }

  const status = action === 'pausar' ? 'paused' : 'open';

  await run(
    sb().from('restaurants').update({ hiring_status: status }).eq('id', restaurantId(req)),
    'pausar/ativar contratação'
  );

  logSecurity(action === 'pausar' ? 'candidaturas_pausadas' : 'candidaturas_activadas',
    `rid=${restaurantId(req)}`, req.ip, {
      userId: req.user.id, restaurantId: restaurantId(req)
    });

  const msg = status === 'paused'
    ? 'Candidaturas pausadas. La página NFC seguirá funcionando.'
    : 'Candidaturas activadas.';

  res.redirect(`/panel?ok=${encodeURIComponent(msg)}&estado=${status}`);
});

/* ================================================================== *
 * Dados do restaurante + URL NFC (§33)
 * ================================================================== */
router.get('/panel/restaurante', async (req, res) => {
  const restaurant = await one(
    sb().from('restaurants').select('*').eq('id', restaurantId(req)),
    'restaurante'
  );

  if (!restaurant) return notFound(res);

  res.render('panel/restaurant', {
    restaurant,
    nfcUrl: `${config.appUrl}/r/${restaurant.slug}`,
    query: req.query
  });
});

/* ================================================================== *
 * QR code da URL NFC — alternativa impressa à etiqueta
 * ------------------------------------------------------------------
 * Gerado no servidor: o CSP (`script-src 'self'`) não permite libs de
 * CDN, e o QR fica igual ao que é impresso ou descarregado.
 * Margem 4 = zona de silêncio mínima do padrão; nível M aguenta
 * pequenos riscos no papel sem tornar o código demasiado denso.
 * ================================================================== */

async function ownRestaurantUrl(req) {
  const restaurant = await one(
    sb().from('restaurants').select('name, commercial_name, slug').eq('id', restaurantId(req)),
    'restaurante (QR)'
  );
  if (!restaurant) return null;
  return { restaurant, url: `${config.appUrl}/r/${restaurant.slug}` };
}

/* Passos 3 e 4 do guia de primeiros passos: só a primeira vez conta. Não é
 * esperado com await — é um marcador, não deve atrasar a página. */
function markOnboarding(req, column) {
  background(run(sb().from('restaurants').update({ [column]: new Date().toISOString() })
    .eq('id', restaurantId(req)).is(column, null), 'primeiros passos'), 'onboarding');
}

/* «Abrir página» do guia: regista o passo e segue para a página pública. */
router.get('/panel/ver-pagina', (req, res) => {
  markOnboarding(req, 'page_viewed_at');
  res.redirect(`${config.appUrl}/r/${req.user.restaurant_slug}`);
});

router.get('/panel/qr', async (req, res) => {
  const found = await ownRestaurantUrl(req);
  if (!found) return notFound(res);
  markOnboarding(req, 'qr_viewed_at');

  const qrSvg = await QRCode.toString(found.url, { ...QR_OPTIONS, type: 'svg' });

  res.render('panel/qr', {
    restaurant: found.restaurant,
    nfcUrl: found.url,
    qrSvg
  });
});

router.get('/panel/qr.png', async (req, res) => {
  const found = await ownRestaurantUrl(req);
  if (!found) return notFound(res);

  /* 1024 px: nítido impresso até ~10 cm a 300 dpi. */
  const png = await QRCode.toBuffer(found.url, { ...QR_OPTIONS, type: 'png', width: 1024 });

  res.setHeader('Content-Type', 'image/png');
  res.setHeader('Content-Disposition', `attachment; filename="qr-${found.restaurant.slug}.png"`);
  res.setHeader('Cache-Control', 'no-store');
  res.send(png);
});

router.post('/panel/restaurante', uploadRestaurantImages, async (req, res) => {
  if (!verifyCsrf(req)) return invalidSession(res);

  const errParam = (msg) => '/panel/restaurante?err=' + encodeURIComponent(msg);

  if (req.uploadError) {
    const msg = req.uploadError === 'TAMAÑO_IMAGEN'
      ? req.tr('La imagen supera el límite de {mb} MB.', { mb: Math.round(config.maxImageBytes / (1024 * 1024)) })
      : req.uploadError === 'IMAGEN_INVALIDA'
        ? 'El archivo no es una imagen válida (solo PNG, JPG o WEBP).'
        : 'Solo se aceptan imágenes PNG, JPG o WEBP.';
    return res.redirect(errParam(msg));
  }

  const form = {
    name: clean(req.body.name, 100),
    commercial_name: clean(req.body.commercial_name, 100),
    legal_name: clean(req.body.legal_name, 150),
    owner_name: clean(req.body.owner_name, 100),
    email: clean(req.body.email, 120),
    privacy_email: clean(req.body.privacy_email, 120),
    phone: clean(req.body.telefono, 30),
    address: clean(req.body.direccion, 200),
    postal_code: clean(req.body.cp, 10),
    city: clean(req.body.ciudad, 100),
    establishment_type: clean(req.body.establecimiento, 40),
    description: clean(req.body.descripcion, 1500)
  };

  const EMAIL_OK = /^[^\s@<>,;]+@[^\s@<>,;]+\.[^\s@<>,;]{2,}$/;
  const errors = {};
  if (form.name.length < 2) errors.name = 'Indica el nombre del establecimiento.';
  if (form.legal_name.length < 2) errors.legal_name = 'Indica la razón social o el nombre del titular.';
  if (form.owner_name.length < 2) errors.owner_name = 'Indica el responsable.';
  if (!EMAIL_OK.test(form.email)) errors.email = 'Indica un email válido.';
  if (!EMAIL_OK.test(form.privacy_email)) errors.privacy_email = 'Indica un email de contacto para privacidad.';
  if (form.phone && !/^[\d\s().+-]{6,25}$/.test(form.phone)) errors.phone = 'Indica un teléfono válido.';
  if (form.city.length < 2) errors.city = 'Indica la ciudad.';
  if (form.postal_code && !/^\d{5}$/.test(form.postal_code)) errors.postal_code = 'El código postal debe tener 5 dígitos.';
  if (!Object.prototype.hasOwnProperty.call(ESTABLISHMENT_TYPES, form.establishment_type)) {
    errors.establishment_type = 'Selecciona el tipo de establecimiento.';
  }

  if (Object.keys(errors).length > 0) {
    /* Volta a mostrar o formulário com o que a pessoa escreveu. Antes era um
     * redirect com ?err=, que apagava todas as alterações por um único
     * código postal mal escrito. */
    const saved = await one(
      sb().from('restaurants').select('*').eq('id', restaurantId(req)),
      'restaurante (erro de validação)'
    );
    if (!saved) return notFound(res);
    return res.status(422).render('panel/restaurant', {
      restaurant: { ...saved, ...form },
      nfcUrl: `${config.appUrl}/r/${saved.slug}`,
      query: { err: Object.values(errors).map((e) => req.tr(e)).join(' ') }
    });
  }

  const rid = restaurantId(req);
  const current = await one(
    sb().from('restaurants').select('logo_path, photo_path').eq('id', rid),
    'restaurante atual'
  );

  if (!current) return res.redirect(errParam('Establecimiento no encontrado.'));

  /* Imagens novas primeiro: se o upload falhar, nada é alterado na BD. */
  const files = req.imageFiles || {};
  let newLogo = '';
  let newPhoto = '';

  try {
    if (files.logo) newLogo = await storage.uploadImage(files.logo.buffer, rid, 'logo', files.logo.mime);
    if (files.foto) newPhoto = await storage.uploadImage(files.foto.buffer, rid, 'foto', files.foto.mime);
  } catch (err) {
    await storage.removeImage([newLogo, newPhoto]);
    console.error('[restaurante] upload de imagem falhou:', err.message);
    return res.redirect(errParam('No se pudo guardar la imagen. Inténtalo de nuevo.'));
  }

  const clearLogo = req.body.borrar_logo === '1';
  const clearPhoto = req.body.borrar_foto === '1';

  /* As colunas das imagens só entram no update quando mudam: reescrever o
   * valor lido acima podia repor um ficheiro que outro pedido em paralelo
   * (outra aba) já tinha substituído e apagado. */
  const updates = { ...form };
  if (newLogo || clearLogo) updates.logo_path = newLogo || '';
  if (newPhoto || clearPhoto) updates.photo_path = newPhoto || '';

  try {
    await run(sb().from('restaurants').update(updates).eq('id', rid), 'guardar restaurante');
  } catch (err) {
    await storage.removeImage([newLogo, newPhoto]);
    throw err;
  }

  logSecurity('restaurante_actualizado', `rid=${rid}`, req.ip, { userId: req.user.id, restaurantId: rid });

  /* Só agora se apagam as imagens que deixaram de ser referenciadas. */
  const orphans = [
    current.logo_path && 'logo_path' in updates && current.logo_path !== updates.logo_path ? current.logo_path : '',
    current.photo_path && 'photo_path' in updates && current.photo_path !== updates.photo_path ? current.photo_path : ''
  ];
  await storage.removeImage(orphans);

  res.redirect('/panel/restaurante?ok=' + encodeURIComponent('Datos guardados.'));
});

/* ================================================================== *
 * Configurações: email de acesso e senha
 * ================================================================== */
router.get('/panel/configuracion', async (req, res) => {
  const row = await one(sb().from('users').select('google_sub').eq('id', req.user.id), 'conta google');
  res.render('panel/settings', {
    userEmail: req.user.email,
    query: req.query,
    hasPassword: Boolean(req.user.password_hash),
    hasGoogle: Boolean(row && row.google_sub),
    googleEnabled: google.enabled()
  });
});

/* Desvincular Google exige a senha atual: sem ela a conta ficaria sem forma
 * de entrar (e uma sessão roubada não chega para o fazer). */
router.post('/panel/configuracion/google', rateLimit({
  windowMs: 15 * 60 * 1000, max: 10, name: 'settings', key: (req) => String(req.user && req.user.id)
}), async (req, res) => {
  if (!verifyCsrf(req)) return invalidSession(res);
  const back = (key, msg) => res.redirect(`/panel/configuracion?${key}=` + encodeURIComponent(msg));

  if (!req.user.password_hash) return back('err', 'Antes de desvincular Google, crea una contraseña con «¿Has olvidado tu contraseña?».');
  if (!verifyPassword(String(req.body.password_actual || ''), req.user.password_hash)) {
    logSecurity('configuracion_password_incorrecta', `user=${req.user.id}`, req.ip, {
      userId: req.user.id, restaurantId: restaurantId(req)
    });
    return back('err', 'La contraseña actual es incorrecta.');
  }

  await run(sb().from('users').update({ google_sub: null }).eq('id', req.user.id), 'desvincular google');
  logSecurity('google_desvinculado', `user=${req.user.id}`, req.ip, { userId: req.user.id, restaurantId: restaurantId(req) });
  back('ok', 'Cuenta de Google desvinculada.');
});

router.post('/panel/configuracion', rateLimit({
  windowMs: 15 * 60 * 1000, max: 10, name: 'settings', key: (req) => String(req.user && req.user.id)
}), async (req, res) => {
  if (!verifyCsrf(req)) return invalidSession(res);

  const err = (msg) => res.redirect('/panel/configuracion?err=' + encodeURIComponent(msg));

  const newEmail = clean(req.body.email, 120);
  const currentPassword = String(req.body.password_actual || '');
  const newPassword = String(req.body.password_nuevo || '').slice(0, 200);
  const confirmPassword = String(req.body.password_repetir || '').slice(0, 200);

  /* Conta criada com Google: ainda não há senha para confirmar. A primeira
   * define-se pelo email de recuperação, que prova o acesso à caixa de correio. */
  if (!req.user.password_hash) {
    return err('Tu cuenta entra con Google y aún no tiene contraseña. Para crear una, usa «¿Has olvidado tu contraseña?» en la página de inicio de sesión.');
  }

  if (!verifyPassword(currentPassword, req.user.password_hash)) {
    logSecurity('configuracion_password_incorrecta', `user=${req.user.id}`, req.ip, {
      userId: req.user.id, restaurantId: restaurantId(req)
    });
    return err('La contraseña actual es incorrecta.');
  }

  const doEmail = newEmail && newEmail.toLowerCase() !== String(req.user.email).toLowerCase();
  const doPassword = newPassword.length > 0;

  if (doEmail && !/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(newEmail)) {
    return err('Email no válido.');
  }

  if (doEmail) {
    const taken = await one(
      sb().from('users').select('id').eq('email', newEmail).neq('id', req.user.id),
      'email em uso'
    );
    if (taken) return err('Ya existe una cuenta con ese email.');
  }

  if (doPassword) {
    const problem = passwordProblem(newPassword, doEmail ? newEmail : req.user.email);
    if (problem) return err(problem);
    if (newPassword !== confirmPassword) return err('Las contraseñas nuevas no coinciden.');
  }

  const updates = {};
  if (doEmail) updates.email = newEmail;
  if (doPassword) updates.password_hash = hashPassword(newPassword);

  if (Object.keys(updates).length > 0) {
    await run(sb().from('users').update(updates).eq('id', req.user.id), 'atualizar conta');
    /* Credenciais mudaram: todas as OUTRAS sessões deste utilizador terminam
     * (um atacante com uma sessão roubada perde-a). A atual mantém-se. */
    await destroyUserSessions(req.user.id, req.session && req.session.tokenHash);
    /* E os links de reposição já enviados deixam de valer: se o dono mudou de
     * email por suspeitar da caixa antiga, um link nessa caixa não pode
     * servir para lhe tirar a conta. */
    await run(sb().from('password_resets').delete().eq('user_id', req.user.id), 'anular links de reposição');
  }

  logSecurity(doPassword ? 'password_cambiada' : (doEmail ? 'email_cambiado' : 'configuracion_actualizada'),
    `user=${req.user.id}`, req.ip, { userId: req.user.id, restaurantId: restaurantId(req) });

  res.redirect('/panel/configuracion?ok=' + encodeURIComponent('Configuración actualizada.'));
});

/* ================================================================== *
 * Notificações (§21)
 * ================================================================== */
router.get('/panel/notificaciones', async (req, res) => {
  const rows = await many(
    sb().from('notifications')
      .select('id, type, channel, status, detail, read_at, created_at, application_id, applications(job_title, candidates(first_name, last_name))')
      .eq('restaurant_id', restaurantId(req))
      // «logged» = sem SMTP configurado: não houve email nenhum, só confunde o dono
      .neq('status', 'logged')
      .order('created_at', { ascending: false })
      .order('id', { ascending: false })
      .limit(100),
    'notificações'
  );

  const notifications = rows.map((n) => {
    const app = n.applications || null;
    const cand = (app && app.candidates) || null;
    return {
      ...n,
      candidateName: cand ? `${cand.first_name} ${cand.last_name || ''}`.trim() : '',
      jobTitle: n.type === 'solicitud_derechos' ? 'Solicitud de derechos (RGPD)' : ((app && app.job_title) || '')
    };
  });

  res.render('panel/notifications', { notifications, query: req.query });
});

router.post('/panel/notificaciones/marcar-leidas', async (req, res) => {
  if (!verifyCsrf(req)) return invalidSession(res);

  await rpc('mark_notifications_read', { restaurant_id: restaurantId(req) }, 'marcar lidas');

  /* Só caminhos internos: «//site.com» ou «/\site.com» são URLs externos
   * para o browser (open redirect). */
  const volver = typeof req.body.volver === 'string' ? req.body.volver : '';
  const back = volver.startsWith('/') && volver[1] !== '/' && volver[1] !== '\\'
    ? volver
    : '/panel';

  res.redirect(back);
});

/* ================================================================== *
 * Privacidade do estabelecimento: guia + prazos de conservação
 * ================================================================== */
router.get('/panel/privacidad', async (req, res) => {
  const r = await one(
    sb().from('restaurants')
      .select('slug, name, legal_name, privacy_email, terms_version, dpa_version, terms_accepted_at, retention_closed_days, retention_inactive_days, retention_reserve_days')
      .eq('id', restaurantId(req)),
    'privacidade do restaurante'
  );
  if (!r) return notFound(res);
  res.render('panel/privacy', { r, query: req.query, welcome: req.query.bienvenida === '1' });
});

router.post('/panel/privacidad/conservacion', async (req, res) => {
  if (!verifyCsrf(req)) return invalidSession(res);

  const toInt = (v) => parseInt(String(v || ''), 10);
  /* O teto evita que um número enorme rebente o ::int na função SQL (500);
   * os limites exatos de cada prazo continuam a ser os da BD. */
  const inRange = (v) => Number.isInteger(toInt(v)) && toInt(v) >= 1 && toInt(v) <= 3650;
  if (![req.body.cerrados, req.body.inactivos, req.body.reserva].every(inRange)) {
    return res.redirect('/panel/privacidad?err=' + encodeURIComponent('Plazos fuera de los límites permitidos.'));
  }
  const result = await rpc('set_retention_settings', {
    restaurant_id: restaurantId(req),
    closed_days: toInt(req.body.cerrados),
    inactive_days: toInt(req.body.inactivos),
    reserve_days: toInt(req.body.reserva)
  }, 'prazos de conservação');

  if (!result || !result.ok) {
    return res.redirect('/panel/privacidad?err=' + encodeURIComponent('Plazos fuera de los límites permitidos.'));
  }

  logSecurity('retencion_configurada',
    `rid=${restaurantId(req)} cerrados=${toInt(req.body.cerrados)} inactivos=${toInt(req.body.inactivos)} reserva=${toInt(req.body.reserva)}`,
    req.ip, { userId: req.user.id, restaurantId: restaurantId(req) });

  res.redirect('/panel/privacidad?ok=' + encodeURIComponent('Plazos guardados y aplicados a las candidaturas existentes.'));
});

/* ================================================================== *
 * Termos novos: o negócio aceita a versão atual (art. 11 dos termos).
 * Não bloqueia o painel — os termos dão 30 dias para aceitar ou sair,
 * e o negócio tem de continuar a atender os candidatos entretanto.
 * ================================================================== */
router.get('/panel/terminos', async (req, res) => {
  const r = await one(
    sb().from('restaurants')
      .select('legal_name, terms_version, dpa_version, terms_accepted_at')
      .eq('id', restaurantId(req)),
    'termos do restaurante'
  );
  if (!r) return notFound(res);
  res.render('panel/terms', {
    r, pending: termsPending(r), version: TERMS_VERSION, changes: TERMS_CHANGES, operator, query: req.query
  });
});

router.post('/panel/terminos', rateLimit({
  windowMs: 60 * 60 * 1000, max: 20, name: 'aceitar-termos', key: (req) => String(req.user && req.user.id)
}), async (req, res) => {
  if (!verifyCsrf(req)) return invalidSession(res);
  if (req.body.acepto !== '1') {
    return res.redirect('/panel/terminos?err=' + encodeURIComponent('Marca la casilla para aceptar los nuevos términos.'));
  }

  const r = await one(
    sb().from('restaurants').select('legal_name, terms_version, dpa_version').eq('id', restaurantId(req)),
    'termos do restaurante'
  );
  if (!r) return notFound(res);
  if (!termsPending(r)) return res.redirect('/panel/terminos');

  await recordAcceptance({
    restaurantId: restaurantId(req),
    userId: req.user.id,
    legalName: r.legal_name,
    via: 'panel',
    ip: req.ip
  });
  logSecurity('terminos_aceptados', `rid=${restaurantId(req)} terms=${TERMS_VERSION}`, req.ip, {
    userId: req.user.id, restaurantId: restaurantId(req), userAgent: req.headers['user-agent']
  });

  res.redirect('/panel/terminos?ok=' + encodeURIComponent('Gracias. Has aceptado la nueva versión de los términos.'));
});

/* ================================================================== *
 * Pedidos de exercício de direitos (arts. 15-22 RGPD)
 * ================================================================== */
const RIGHTS_STATUS = ['recibida', 'en_curso', 'resuelta', 'denegada'];

router.get('/panel/derechos', async (req, res) => {
  const rid = restaurantId(req);
  const requests = await many(
    sb().from('rights_requests')
      .select('id, public_ref, kind, requester_name, requester_email, message, status, due_at, extended, resolution_note, resolved_at, created_at')
      .eq('restaurant_id', rid)
      /* Abertos primeiro (resolved_at vazio), pelo prazo mais próximo; depois
       * os fechados, do mais recente para o mais antigo. Ordenar por status
       * punha «denegada» à frente de «recibida», que é a urgente. */
      .order('resolved_at', { ascending: false, nullsFirst: true })
      .order('due_at', { ascending: true })
      .limit(200),
    'pedidos de direitos'
  );

  /* Para cada pedido, as candidaturas DESTE restaurante com o mesmo email —
   * é assim que o estabelecimento localiza os dados do titular. */
  const emails = [...new Set(requests.map((r) => String(r.requester_email).toLowerCase()))];
  const matches = emails.length === 0 ? [] : await many(
    sb().from('application_list').select('id, candidate_id, email, first_name, last_name, job_title, applied_at')
      .eq('restaurant_id', rid).in('email', emails),
    'candidaturas do titular'
  );
  const byEmail = {};
  for (const m of matches) {
    const k = String(m.email).toLowerCase();
    (byEmail[k] = byEmail[k] || []).push(m);
  }

  res.render('panel/rights', { requests, byEmail, query: req.query, now: Date.now() });
});

router.post('/panel/derechos/:id', async (req, res) => {
  if (!verifyCsrf(req)) return invalidSession(res);

  const status = clean(req.body.estado, 20);
  if (!RIGHTS_STATUS.includes(status)) {
    return res.redirect('/panel/derechos?err=' + encodeURIComponent('Estado no válido.'));
  }

  const result = await rpc('update_rights_request', {
    id: Number(req.params.id),
    restaurant_id: restaurantId(req),
    status,
    note: clean(req.body.nota, 2000),
    extend: req.body.prorrogar === '1',
    user_id: req.user.id
  }, 'atualizar pedido de direitos');

  if (!result || !result.ok) return notFound(res);

  logSecurity('derechos_actualizada', `req=${Number(req.params.id)} estado=${status}${req.body.prorrogar === '1' ? ' prorroga' : ''}`,
    req.ip, { userId: req.user.id, restaurantId: restaurantId(req) });

  res.redirect('/panel/derechos?ok=' + encodeURIComponent('Solicitud actualizada.'));
});

/* ================================================================== *
 * Acesso / portabilidade: exportação dos dados de UM candidato
 * ================================================================== *
 * Tudo o que este restaurante tem sobre a pessoa (por candidate_id, dentro do
 * tenant): dados, candidaturas, notas internas (as valorações subjetivas
 * também são dados pessoais — AEPD, relações laborais, III.1), histórico,
 * consentimentos e metadados do CV (o PDF descarrega-se à parte). Nunca
 * dados de outros candidatos nem de outros restaurantes.
 */
router.get('/panel/candidaturas/:id/exportar', async (req, res) => {
  const application = await ownApplication(req);
  if (!application) return notFound(res);
  const rid = restaurantId(req);

  const [candidate, apps] = await Promise.all([
    one(
      sb().from('candidates').select('first_name, last_name, email, phone, doc_type, doc_number, created_at, updated_at')
        .eq('id', application.candidate_id).eq('restaurant_id', rid),
      'candidato (exportação)'
    ),
    many(
      sb().from('applications')
        .select('id, job_title, status, availability, experience, observations, future_interest, applied_at, updated_at, closed_at, retention_until')
        .eq('candidate_id', application.candidate_id).eq('restaurant_id', rid).order('applied_at'),
      'candidaturas (exportação)'
    )
  ]);
  const ids = apps.map((a) => a.id);
  const [notes, history, consents, cvs] = ids.length === 0 ? [[], [], [], []] : await Promise.all([
    many(sb().from('application_notes').select('application_id, body, created_at').eq('restaurant_id', rid).in('application_id', ids), 'notas (exportação)'),
    many(sb().from('application_history').select('application_id, event, old_status, new_status, detail, created_at').eq('restaurant_id', rid).in('application_id', ids), 'histórico (exportação)'),
    many(sb().from('consents').select('application_id, selection_basis, privacy_notice_version, future_opportunity_consent, future_text, future_granted_at, future_withdrawn_at, consent_version').in('application_id', ids), 'consentimentos (exportação)'),
    many(sb().from('cvs').select('application_id, original_filename, size_bytes, created_at').eq('restaurant_id', rid).in('application_id', ids), 'cvs (exportação)')
  ]);

  const out = {
    generated_at: new Date().toISOString(),
    controller: req.user.restaurant_name,
    note: 'Datos personales del candidato tratados por este establecimiento a través de Fíchame. Los currículums se entregan aparte en PDF.',
    candidate: { ...candidate, doc_type: candidate && candidate.doc_type ? candidate.doc_type : undefined, doc_number: candidate && candidate.doc_number ? candidate.doc_number : undefined },
    applications: apps.map((a) => ({
      ...a,
      notes: notes.filter((n) => n.application_id === a.id).map(({ application_id, ...n }) => n),
      history: history.filter((h) => h.application_id === a.id).map(({ application_id, ...h }) => h),
      consent: consents.find((c) => c.application_id === a.id) || null,
      cv: cvs.find((c) => c.application_id === a.id) || null
    }))
  };

  await logSecurity('candidato_exportado', `app=${application.id} apps=${apps.length}`, req.ip, {
    userId: req.user.id, restaurantId: rid
  });

  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.setHeader('Content-Disposition', `attachment; filename="datos-candidato-${application.id}.json"`);
  res.send(JSON.stringify(out, null, 2));
});

/* ================================================================== *
 * Supressão de TODOS os dados do candidato neste restaurante (art. 17)
 * ================================================================== */
router.post('/panel/candidaturas/:id/eliminar-candidato', async (req, res) => {
  if (!verifyCsrf(req)) return invalidSession(res);
  const application = await ownApplication(req);
  if (!application) return notFound(res);

  if (req.body.confirmo !== '1') {
    return res.redirect(`/panel/candidaturas/${application.id}?err=` + encodeURIComponent('Marca la casilla de confirmación.'));
  }

  const result = await rpc('delete_candidate', {
    candidate_id: application.candidate_id,
    restaurant_id: restaurantId(req)
  }, 'suprimir candidato');

  if (result && result.reason === 'legal_hold') {
    return res.redirect(`/panel/candidaturas/${application.id}?err=` + encodeURIComponent(
      'Alguna candidatura de esta persona tiene un bloqueo de conservación. Retíralo antes de suprimir sus datos.'));
  }
  if (!result || !result.ok) return notFound(res);

  if (result.paths && result.paths.length > 0) await storage.removeCv(result.paths);

  logSecurity('candidato_suprimido', `app=${application.id} apps=${result.applications} cvs=${(result.paths || []).length}`, req.ip, {
    userId: req.user.id, restaurantId: restaurantId(req)
  });

  res.redirect('/panel/candidaturas?ok=' + encodeURIComponent(
    req.tr('Datos del candidato suprimidos: {n} candidatura(s) con sus CV, notas, historial y consentimientos.', { n: result.applications })));
});

/* ================================================================== *
 * Retirada do consentimento de futuras oportunidades (art. 7.3)
 * ================================================================== */
router.post('/panel/candidaturas/:id/retirar-consentimiento', async (req, res) => {
  if (!verifyCsrf(req)) return invalidSession(res);
  const id = Number(req.params.id);
  const result = await rpc('withdraw_future_consent', {
    application_id: id, restaurant_id: restaurantId(req), user_id: req.user.id
  }, 'retirar consentimento');

  if (result && result.reason === 'no_consent') {
    return res.redirect(`/panel/candidaturas/${id}?err=` + encodeURIComponent('Este candidato no tiene un consentimiento activo.'));
  }
  if (!result || !result.ok) return notFound(res);

  logSecurity('consentimiento_retirado', `app=${id}`, req.ip, { userId: req.user.id, restaurantId: restaurantId(req) });
  /* Só se promete a limpeza automática quando ela está mesmo ligada
   * (RETENTION_AUTO=1, ver src/routes/internal.js). */
  res.redirect(`/panel/candidaturas/${id}?ok=` + encodeURIComponent(process.env.RETENTION_AUTO === '1'
    ? 'Consentimiento retirado. Si la candidatura estaba en reserva, sus datos se borrarán en la próxima limpieza automática.'
    : 'Consentimiento retirado. Si la candidatura estaba en reserva y ya no necesitas sus datos, elimínala desde esta página.'));
});

/* ================================================================== *
 * Bloqueio de conservação (legal_hold)
 * ================================================================== */
router.post('/panel/candidaturas/:id/bloqueo', async (req, res) => {
  if (!verifyCsrf(req)) return invalidSession(res);
  const id = Number(req.params.id);
  const hold = req.body.accion === 'activar';

  const result = await rpc('set_legal_hold', {
    application_id: id, restaurant_id: restaurantId(req), user_id: req.user.id,
    hold, reason: clean(req.body.motivo, 300)
  }, 'bloqueio legal');

  if (result && result.reason === 'reason_required') {
    return res.redirect(`/panel/candidaturas/${id}?err=` + encodeURIComponent('Indica el motivo del bloqueo (p. ej., reclamación en curso).'));
  }
  if (!result || !result.ok) return notFound(res);

  logSecurity(hold ? 'bloqueo_activado' : 'bloqueo_retirado', `app=${id}`, req.ip, {
    userId: req.user.id, restaurantId: restaurantId(req)
  });
  res.redirect(`/panel/candidaturas/${id}?ok=` + encodeURIComponent(hold ? 'Bloqueo de conservación activado.' : 'Bloqueo retirado.'));
});

/* ================================================================== *
 * Reportar un problema (prova de mercado)
 * ================================================================== *
 * O dono do negócio envia um erro, uma sugestão ou uma dúvida. Fica em
 * problem_reports (0009) e o admin lê-o em /admin/reportes. Junta-se a página
 * de onde veio (só o caminho interno, sem query) e, se veio da página de
 * erro, o código do erro registado em error_events. */
const REPORT_KINDS = { error: 'Algo no funciona', sugerencia: 'Una sugerencia', duda: 'Tengo una duda' };
const REPORT_STATUS = { nuevo: 'Recibido', revisando: 'En revisión', resuelto: 'Resuelto' };

function reportPage(value) {
  const p = String(value || '').split(/[?#]/)[0];
  return /^\/[a-z0-9/_-]{0,150}$/i.test(p) && p !== '/panel/reportar' ? p : '';
}

function refererPage(req) {
  try {
    const u = new URL(req.get('referer') || '');
    return u.host === req.get('host') ? reportPage(u.pathname) : '';
  } catch {
    return '';
  }
}

function reportRef(value) {
  const v = String(value || '').toUpperCase();
  return /^[A-F0-9]{6}$/.test(v) ? v : '';
}

router.get('/panel/reportar', async (req, res) => {
  const mine = await many(
    sb().from('problem_reports')
      .select('id, kind, message, status, created_at')
      .eq('restaurant_id', restaurantId(req))
      .order('created_at', { ascending: false })
      .limit(10),
    'reportes do negócio'
  );

  res.render('panel/report', {
    ref: reportRef(req.query.ref),
    page: reportPage(req.query.desde) || refererPage(req),
    mine,
    kinds: REPORT_KINDS,
    statuses: REPORT_STATUS,
    query: req.query
  });
});

router.post('/panel/reportar', rateLimit({
  windowMs: 60 * 60 * 1000, max: 10, name: 'reports', key: (req) => String(req.user && req.user.id)
}), async (req, res) => {
  if (!verifyCsrf(req)) return invalidSession(res);

  const kind = Object.prototype.hasOwnProperty.call(REPORT_KINDS, req.body.tipo) ? req.body.tipo : 'error';
  const message = clean(req.body.mensaje, 2000);
  const ref = reportRef(req.body.ref);
  const page = reportPage(req.body.pagina);

  if (message.length < 3) {
    const back = new URLSearchParams({ err: 'Cuéntanos qué ha pasado.' });
    if (ref) back.set('ref', ref);
    if (page) back.set('desde', page);
    return res.redirect('/panel/reportar?' + back.toString());
  }

  await run(sb().from('problem_reports').insert({
    restaurant_id: restaurantId(req),
    user_id: req.user.id,
    kind,
    message,
    page,
    error_ref: ref,
    user_agent: String(req.headers['user-agent'] || '').slice(0, 200)
  }), 'gravar reporte');

  logSecurity('reporte_enviado', `kind=${kind}${ref ? ` ref=${ref}` : ''}`, req.ip, {
    userId: req.user.id, restaurantId: restaurantId(req)
  });

  /* O aviso ao admin não atrasa a resposta. */
  background(require('../lib/mailer').notifyProblemReport({ kind, restaurantName: req.user.restaurant_name }),
    'reporte aviso');

  res.redirect('/panel/reportar?ok=' + encodeURIComponent('Gracias. Hemos recibido tu reporte y lo revisaremos.'));
});

module.exports = router;

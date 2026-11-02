'use strict';

/* Teste das migrations numa base de dados TEMPORÁRIA (nunca no Supabase).
 * Executar: npm run test:db
 *
 * Cria um cluster PostgreSQL descartável (initdb + pg_ctl) numa pasta
 * temporária, simula o que o Supabase tem e as migrations assumem (roles anon /
 * authenticated / service_role, schema storage, default privileges que
 * concedem tudo a anon), aplica todas as migrations DUAS vezes (idempotência) e
 * verifica ao nível da BD:
 *
 *   - isolamento entre tenants (FKs compostas, funções com restaurant_id);
 *   - reserva só com consentimento; retirada de consentimento;
 *   - retenção por tenant (o prazo de A não apaga B);
 *   - legal_hold impede supressão;
 *   - supressão de candidato limitada ao tenant;
 *   - deny-all para anon e autodiagnóstico de segurança.
 *
 * Requer os binários do PostgreSQL (PATH, PG_BIN, ou C:\Program Files\PostgreSQL).
 * Sem eles o teste é SALTADO com aviso (não conta como sucesso silencioso).
 */

const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawnSync } = require('child_process');

const MIGRATIONS = path.join(__dirname, '..', 'migrations');

function findBin(name) {
  const exe = process.platform === 'win32' ? `${name}.exe` : name;
  if (process.env.PG_BIN && fs.existsSync(path.join(process.env.PG_BIN, exe))) {
    return path.join(process.env.PG_BIN, exe);
  }
  const onPath = spawnSync(name, ['--version'], { encoding: 'utf8' });
  if (!onPath.error) return name;
  const base = 'C:\\Program Files\\PostgreSQL';
  try {
    for (const v of fs.readdirSync(base).filter((d) => /^\d+$/.test(d)).sort((a, b) => b - a)) {
      const c = path.join(base, v, 'bin', exe);
      if (fs.existsSync(c)) return c;
    }
  } catch { /* não é Windows */ }
  return null;
}

let passed = 0;
let failed = 0;
function check(name, cond, extra = '') {
  if (cond) { passed += 1; console.log(`  ✓ ${name}`); } else { failed += 1; console.log(`  ✗ ${name} ${extra}`); }
}

function main() {
  const initdb = findBin('initdb');
  const pgctl = findBin('pg_ctl');
  const psqlBin = findBin('psql');

  if (!initdb || !pgctl || !psqlBin) {
    console.log('\n  SALTADO: binários do PostgreSQL não encontrados (define PG_BIN).\n');
    process.exit(process.env.CI ? 1 : 0);
  }

  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'fichame-pg-'));
  const data = path.join(dir, 'data');
  const port = String(55000 + Math.floor(Math.random() * 5000));
  const url = `postgresql://postgres@127.0.0.1:${port}/postgres`;

  const psql = (sql, { file } = {}) => {
    const args = [url, '--no-psqlrc', '-v', 'ON_ERROR_STOP=1', '-At', '-q'];
    if (file) args.push('-f', file);
    /* SQL por stdin e não por -c: no Windows os argumentos chegam ao psql na
     * code page ANSI e os acentos partiam o UTF-8. */
    const r = spawnSync(psqlBin, args, {
      encoding: 'utf8',
      input: file ? undefined : sql,
      env: { ...process.env, PGCLIENTENCODING: 'UTF8' }
    });
    return { ok: r.status === 0, out: (r.stdout || '').trim(), err: (r.stderr || '').trim() };
  };
  const q = (sql) => {
    const r = psql(sql);
    if (!r.ok) throw new Error(`${sql}\n${r.err}`);
    return r.out;
  };
  const rpc = (fn, obj) => JSON.parse(q(`select ${fn}('${JSON.stringify(obj).replace(/'/g, "''")}'::jsonb)`));

  console.log(`\n  base temporária em ${dir} (porta ${port})\n`);

  let started = false;
  try {
    let r = spawnSync(initdb, ['-D', data, '-U', 'postgres', '--auth=trust', '-E', 'UTF8', '--no-locale'], { encoding: 'utf8' });
    if (r.status !== 0) throw new Error(`initdb falhou: ${r.stderr}`);
    /* stdio 'ignore': o postmaster herda os descritores; com pipes o
     * spawnSync ficaria à espera dele para sempre. */
    /* Socket Unix na pasta temporária: os pacotes Debian/Ubuntu (o runner
     * ubuntu-24.04 do CI) compilam o PostgreSQL com o socket em
     * /var/run/postgresql, onde só o utilizador postgres escreve, e o
     * postmaster morria com «could not create lock file ... Permission denied».
     * O psql liga por TCP (127.0.0.1), por isso o socket só tem de ser criável.
     * No Windows não se mexe (sem sockets Unix por omissão; o caminho tem espaços). */
    const socketOpt = process.platform === 'win32' ? '' : ` -c unix_socket_directories=${dir}`;
    const logFile = path.join(dir, 'log.txt');
    r = spawnSync(pgctl, ['-D', data, '-o', `-p ${port} -c listen_addresses=127.0.0.1${socketOpt}`, '-l', logFile, '-w', 'start'], { stdio: 'ignore' });
    if (r.status !== 0) {
      let tail = '';
      try { tail = fs.readFileSync(logFile, 'utf8').trim().split(/\r?\n/).slice(-5).join('\n'); } catch { /* sem log */ }
      throw new Error(`pg_ctl start falhou. Fim do log do PostgreSQL:\n${tail}`);
    }
    started = true;

    /* Simulação mínima do Supabase. */
    q(`
      create role anon nologin; create role authenticated nologin; create role service_role nologin bypassrls;
      grant usage on schema public to anon, authenticated, service_role;
      alter default privileges in schema public grant all on tables to anon, authenticated, service_role;
      alter default privileges in schema public grant all on functions to anon, authenticated, service_role;
      alter default privileges in schema public grant all on sequences to anon, authenticated, service_role;
      create schema storage;
      create table storage.buckets (id text primary key, name text, public boolean, file_size_limit bigint, allowed_mime_types text[]);
      create table storage.objects (id bigserial primary key, bucket_id text, name text);
      alter table storage.objects enable row level security;
    `);

    console.log('— Aplicação das migrations (2×, idempotência) —');
    const files = fs.readdirSync(MIGRATIONS).filter((f) => /^\d{4}_.*\.sql$/.test(f) && f !== '0000_reset.sql').sort();
    for (let round = 1; round <= 2; round += 1) {
      for (const f of files) {
        const res = psql(null, { file: path.join(MIGRATIONS, f) });
        check(`ronda ${round}: ${f}`, res.ok, res.err.split('\n').filter((l) => /ERROR/.test(l)).join(' '));
        if (!res.ok) throw new Error('migration falhou');
      }
    }
    check('schema_migrations tem 0005 e 0006',
      q("select count(*) from schema_migrations where version in ('0005_privacy_hardening','0006_tenant_fk_cleanup')") === '2');
    /* O arranque (src/db/check.js) exige cada versão: uma migration que não se
     * regista impede `npm start` mesmo depois de aplicada. */
    const registered = q('select version from schema_migrations').split(/\r?\n/).map((v) => v.trim());
    const unregistered = files.map((f) => f.replace(/\.sql$/, '')).filter((v) => !registered.includes(v));
    check('schema_migrations regista todas as migrations', unregistered.length === 0, unregistered.join(', '));
    /* PostgREST recusa embeds quando há duas FKs entre as mesmas tabelas
     * (PGRST201). Cada par usado em embeds tem de ter exatamente uma. */
    for (const [child, parent] of [['notifications', 'applications'], ['applications', 'candidates'], ['applications', 'jobs'],
      ['cvs', 'applications'], ['application_notes', 'applications'], ['application_history', 'applications']]) {
      const n = q(`select count(*) from pg_constraint where contype='f' and conrelid='${child}'::regclass and confrelid='${parent}'::regclass`);
      check(`uma só FK ${child} → ${parent} (embeds do PostgREST)`, n === '1', `n=${n}`);
    }

    /* Dados: dois restaurantes, o mesmo email nos dois (titulares distintos
     * perante responsáveis distintos). */
    const A = rpc('register_restaurant', { slug_base: 'rest-a', name: 'A', owner_name: 'Ana', email: 'a@a.es', password_hash: 'x' });
    const B = rpc('register_restaurant', { slug_base: 'rest-b', name: 'B', owner_name: 'Bea', email: 'b@b.es', password_hash: 'x' });
    const ra = A.restaurant_id;
    const rb = B.restaurant_id;
    const apply = (rid, email, extra = {}) => rpc('submit_application', {
      restaurant_id: rid, first_name: 'Juan', email, phone: '600000000',
      storage_path: `r/${rid}/${Math.random().toString(16).slice(2)}.pdf`, size_bytes: 10,
      consent_version: 'v3', privacy_notice_version: 'p1', ...extra
    });

    console.log('\n— Candidatura e base jurídica —');
    const a1 = apply(ra, 'juan@x.es');
    const b1 = apply(rb, 'juan@x.es', { future_consent: true, future_text: 'texto' });
    check('candidatura em A criada', a1.ok);
    check('mesmo email em B é outra pessoa/registo (sem unicidade global)', b1.ok && b1.candidate_id !== a1.candidate_id);
    check('duplicado só dentro do mesmo tenant', apply(ra, 'juan@x.es').reason === 'duplicate');
    check('seleção registada como art. 6.1.b, não consentimento',
      q(`select selection_basis || '|' || selection_consent from consents where application_id=${a1.application_id}`) === 'rgpd_6_1_b|false');
    check('documento de identidade não é gravado',
      q(`select doc_number from candidates where id=${a1.candidate_id}`) === '');
    check('consentimento futuro com data e texto',
      q(`select (future_granted_at is not null) || '|' || future_text from consents where application_id=${b1.application_id}`) === 'true|texto');

    console.log('\n— Isolamento entre tenants na BD —');
    check('B não muda estado de candidatura de A',
      rpc('set_application_status', { application_id: a1.application_id, restaurant_id: rb, status: 'revisado' }).reason === 'not_found');
    check('B não apaga candidatura de A',
      rpc('delete_application', { application_id: a1.application_id, restaurant_id: rb }).reason === 'not_found');
    check('B não apaga candidato de A',
      rpc('delete_candidate', { candidate_id: a1.candidate_id, restaurant_id: rb }).reason === 'not_found');
    check('B não põe legal_hold em A',
      rpc('set_legal_hold', { application_id: a1.application_id, restaurant_id: rb, hold: true, reason: 'xxxxx' }).reason === 'not_found');
    const a0 = rpc('submit_interest', { restaurant_id: ra, first_name: 'Sin', email: 'sincv@x.es', future_text: 't' });
    let cross = psql(`insert into cvs (application_id, restaurant_id, storage_path) values (${a0.application_id}, ${rb}, 'r/${rb}/x.pdf')`);
    check('FK composta impede CV de B ligado a candidatura de A', !cross.ok && /same_tenant/.test(cross.err));
    cross = psql(`insert into application_notes (application_id, restaurant_id, body) values (${a1.application_id}, ${rb}, 'x')`);
    check('FK composta impede nota de B numa candidatura de A', !cross.ok);
    cross = psql(`insert into applications (restaurant_id, candidate_id) values (${rb}, ${a1.candidate_id})`);
    check('FK composta impede candidatura de B com candidato de A', !cross.ok);
    cross = psql(`update cvs set storage_path='r/${rb}/x.pdf' where application_id=${a1.application_id}`);
    check('CV só pode estar na pasta do próprio tenant', !cross.ok);

    console.log('\n— Reserva e consentimento —');
    check('reserva sem consentimento é recusada',
      rpc('set_application_status', { application_id: a1.application_id, restaurant_id: ra, status: 'reserva' }).reason === 'no_consent');
    check('rejeitar não põe na reserva',
      rpc('set_application_status', { application_id: a1.application_id, restaurant_id: ra, status: 'rechazado' }).ok &&
      q(`select future_interest from applications where id=${a1.application_id}`) === 'f');
    check('reserva com consentimento aceite',
      rpc('set_application_status', { application_id: b1.application_id, restaurant_id: rb, status: 'reserva' }).ok);
    check('retirada de consentimento por outro tenant falha',
      rpc('withdraw_future_consent', { application_id: b1.application_id, restaurant_id: ra }).reason === 'not_found');
    check('retirada de consentimento',
      rpc('withdraw_future_consent', { application_id: b1.application_id, restaurant_id: rb }).ok &&
      q(`select (future_withdrawn_at is not null) || '|' || (select status from applications where id=${b1.application_id}) from consents where application_id=${b1.application_id}`) === 'true|rechazado');
    check('retirada torna a candidatura elegível para supressão',
      q(`select retention_until <= now() from applications where id=${b1.application_id}`) === 't');

    console.log('\n— Retenção por tenant —');
    const a2 = apply(ra, 'maria@x.es');
    const b2 = apply(rb, 'maria@x.es');
    // A: candidatura fechada há 100 dias (prazo A = 90) → vence; B: fechada há 100 dias com prazo B = 365 → mantém
    q(`update restaurants set retention_closed_days = 365 where id = ${rb}`);
    q(`update applications set status='rechazado', closed_at = now() - interval '100 days' where id in (${a2.application_id}, ${b2.application_id})`);
    q(`select recompute_retention(${a2.application_id}), recompute_retention(${b2.application_id})`);
    const dry = rpc('apply_retention', { dry_run: true });
    check('simulação não apaga nada', dry.dry_run === true &&
      q(`select count(*) from applications where id=${a2.application_id}`) === '1');
    // hold numa candidatura vencida de A
    const a3 = apply(ra, 'pedro@x.es');
    q(`update applications set status='rechazado', closed_at = now() - interval '200 days' where id=${a3.application_id}`);
    q(`select recompute_retention(${a3.application_id})`);
    check('legal_hold exige motivo',
      rpc('set_legal_hold', { application_id: a3.application_id, restaurant_id: ra, hold: true, reason: '' }).reason === 'reason_required');
    rpc('set_legal_hold', { application_id: a3.application_id, restaurant_id: ra, hold: true, reason: 'Reclamación en curso' });
    const run = rpc('apply_retention', { dry_run: false });
    check('A: vencida apagada', q(`select count(*) from applications where id=${a2.application_id}`) === '0');
    check('B: mesmo cenário, prazo de B maior → mantida', q(`select count(*) from applications where id=${b2.application_id}`) === '1');
    check('legal_hold protege da retenção', q(`select count(*) from applications where id=${a3.application_id}`) === '1');
    check('retenção devolve caminhos de CV para o Storage', Array.isArray(run.paths) && run.paths.length >= 1);
    check('retenção apaga candidato sem outras candidaturas',
      q(`select count(*) from candidates where restaurant_id=${ra} and email='maria@x.es'`) === '0');
    check('candidatura ativa recente não é apagada', q(`select count(*) from applications where id=${a1.application_id}`) === '1');
    check('delete_application respeita legal_hold',
      rpc('delete_application', { application_id: a3.application_id, restaurant_id: ra }).reason === 'legal_hold');

    console.log('\n— Supressão de candidato (art. 17) —');
    const before = q(`select count(*) from candidates where restaurant_id=${rb} and email='juan@x.es'`);
    const del = rpc('delete_candidate', { candidate_id: a1.candidate_id, restaurant_id: ra });
    check('supressão do candidato em A', del.ok && del.paths.length === 1);
    check('mesmo email em B não é afetado', q(`select count(*) from candidates where restaurant_id=${rb} and email='juan@x.es'`) === before);
    check('notas/histórico/consentimentos de A apagados em cascata',
      q(`select count(*) from consents where application_id=${a1.application_id}`) === '0' &&
      q(`select count(*) from application_history where application_id=${a1.application_id}`) === '0');

    console.log('\n— Rate limit, direitos, limpeza técnica —');
    let last;
    for (let i = 0; i < 4; i += 1) last = rpc('rate_limit_hit', { key: 'k1', window_seconds: 60, max: 3 });
    check('rate_limit_hit bloqueia acima do máximo', last.allowed === false && last.retry_after >= 1);
    const rr = rpc('create_rights_request', { restaurant_id: ra, public_ref: 'REF1', kind: 'supresion', requester_name: 'Juan', requester_email: 'juan@x.es' });
    check('pedido de direitos com prazo de 1 mês', rr.ok);
    check('B não altera pedido de A',
      rpc('update_rights_request', { id: rr.id, restaurant_id: rb, status: 'resuelta' }).reason === 'not_found');
    check('prorrogação única de 2 meses',
      rpc('update_rights_request', { id: rr.id, restaurant_id: ra, status: 'en_curso', extend: true }).ok &&
      q(`select extended from rights_requests where id=${rr.id}`) === 't');
    rpc('update_rights_request', { id: rr.id, restaurant_id: ra, status: 'resuelta' });
    q(`update rights_requests set resolved_at = now() - interval '10 days' where id=${rr.id}`);
    rpc('update_rights_request', { id: rr.id, restaurant_id: ra, status: 'resuelta', note: 'só a nota' });
    check('guardar de novo um pedido resolvido mantém resolved_at (0012)',
      q(`select resolved_at < now() - interval '9 days' from rights_requests where id=${rr.id}`) === 't');
    check('prazo de retenção vazio → out_of_bounds, não erro (0012)',
      rpc('set_retention_settings', { restaurant_id: ra, closed_days: null, inactive_days: 180, reserve_days: 365 }).reason === 'out_of_bounds');
    const pe = rpc('purge_expired', { dry_run: true });
    check('purge_expired em simulação', pe.ok && pe.dry_run === true);

    console.log('\n— Permissões —');
    check('anon não lê candidates',
      !psql('set role anon; select * from candidates').ok);
    check('anon não executa funções',
      !psql(`set role anon; select rate_limit_hit('{}'::jsonb)`).ok);
    q('create table _nova_tabela_teste (x int)');
    check('tabela NOVA não é concedida a anon (default privileges revogados)',
      !psql('set role anon; select * from _nova_tabela_teste').ok);
    q('drop table _nova_tabela_teste');
    const sc = rpc('security_self_check', {});
    check('autodiagnóstico: todas as tabelas com RLS', sc.tables_without_rls.length === 0, JSON.stringify(sc.tables_without_rls));
    check('autodiagnóstico: nenhuma tabela concedida a anon/authenticated',
      sc.tables_granted_to_anon_or_authenticated.length === 0, JSON.stringify(sc.tables_granted_to_anon_or_authenticated));
    check('autodiagnóstico: nenhuma função SECURITY DEFINER', sc.security_definer_functions.length === 0);
    check('autodiagnóstico: nenhum bucket público', sc.public_buckets.length === 0);

    console.log('\n— Fecho de conta sem órfãos —');
    const sim = rpc('delete_restaurant_account', { restaurant_id: ra, confirm_slug: 'rest-a', dry_run: true });
    check('fecho bloqueado por legal_hold', sim.ok === false && sim.reason === 'legal_hold');
    check('slug errado recusa', rpc('delete_restaurant_account', { restaurant_id: rb, confirm_slug: 'rest-a' }).ok === false);
    const closeB = rpc('delete_restaurant_account', { restaurant_id: rb, confirm_slug: 'rest-b', dry_run: false });
    check('fecho de B devolve caminhos de CV', closeB.ok && Array.isArray(closeB.paths));
    check('nada de B fica na BD',
      q(`select (select count(*) from applications where restaurant_id=${rb}) + (select count(*) from users where restaurant_id=${rb}) + (select count(*) from cvs where restaurant_id=${rb})`) === '0');
    check('A intacto após fecho de B', q(`select count(*) from restaurants where id=${ra}`) === '1');
  } catch (err) {
    failed += 1;
    console.log(`\n  ✗ erro: ${err.message}`);
  } finally {
    if (started) spawnSync(pgctl, ['-D', data, '-m', 'fast', 'stop'], { stdio: 'ignore' });
    try { fs.rmSync(dir, { recursive: true, force: true }); } catch { /* ignora */ }
  }

  console.log(`\nResultado: ${passed} ok, ${failed} falharam\n`);
  process.exit(failed > 0 ? 1 : 0);
}

main();

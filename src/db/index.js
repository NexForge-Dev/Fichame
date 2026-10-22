'use strict';

/* Acesso ao Supabase.
 *
 * O cliente usa a service_role, que ignora Row Level Security. Isso é
 * deliberado e só é seguro porque:
 *
 *   - a chave existe exclusivamente no backend (§28);
 *   - toda a leitura e escrita filtra por restaurant_id, sempre vindo da
 *     sessão e nunca do pedido do cliente (§8);
 *   - as escritas que envolvem várias tabelas passam por funções RPC, que
 *     recebem o restaurant_id e verificam a posse lá dentro.
 *
 * O RLS deny-all das migrations é a rede de segurança: se a chave anon for
 * exposta, não lê nada.
 */

const { createClient } = require('@supabase/supabase-js');
const config = require('../config');

let client = null;

function sb() {
  if (client) return client;

  config.assertConfig();

  client = createClient(config.supabase.url, config.supabase.serviceRoleKey, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
      detectSessionInUrl: false
    },
    global: {
      headers: { 'X-Client-Info': 'ezcv/2.0' }
    }
  });

  return client;
}

/* Erro de BD legível, sem nunca incluir credenciais. */
function dbError(error, context) {
  const parts = [];
  if (context) parts.push(context);
  if (error && error.code) parts.push(`[${error.code}]`);
  if (error && error.message) parts.push(error.message);
  if (error && error.details) parts.push(`(${error.details})`);
  if (error && error.hint) parts.push(`dica: ${error.hint}`);

  const err = new Error(`Supabase: ${parts.join(' ') || 'erro desconhecido'}`);
  err.supabaseCode = error && error.code;
  return err;
}

/* Uma linha ou null. Receber o builder sem .single()/.maybeSingle(). */
async function one(builder, context = '') {
  const { data, error } = await builder.maybeSingle();
  if (error) throw dbError(error, context);
  return data || null;
}

/* Lista de linhas (array vazio se não houver nenhuma). */
async function many(builder, context = '') {
  const { data, error } = await builder;
  if (error) throw dbError(error, context);
  return data || [];
}

/* Contagem sem transferir linhas.
 * Usar com .select('id', { count: 'exact', head: true }). */
async function count(builder, context = '') {
  const { count: n, error } = await builder;
  if (error) throw dbError(error, context);
  return Number(n) || 0;
}

/* Escrita simples; devolve a linha inserida/atualizada se o builder pedir
 * .select(), caso contrário null. */
async function run(builder, context = '') {
  const { data, error } = await builder;
  if (error) throw dbError(error, context);
  return data || null;
}

/* Chama uma função RPC. Todas as funções do Fíchame recebem um único parâmetro
 * jsonb chamado `p`, por isso o objeto é embrulhado aqui. */
async function rpc(fn, params = {}, context = '') {
  const { data, error } = await sb().rpc(fn, { p: params });
  if (error) throw dbError(error, context || `rpc ${fn}`);
  return data;
}

/* Escapa os caracteres que o LIKE/ILIKE trata como curingas, para que uma
 * busca por "100%" não se transforme num padrão que encontra tudo. */
function escapeLike(value) {
  return String(value == null ? '' : value).replace(/[\\%_]/g, (c) => `\\${c}`);
}

/* Registo de segurança (§22, §26).
 *
 * Nunca lança: um log que falha não deve impedir um candidato de se
 * candidatar. A maioria das chamadas não é esperada com await — o pedido não
 * deve ficar à espera do log.
 *
 * Devolve a promessa para os casos em que o registo é o próprio objetivo e
 * não pode ficar ao critério do agendador: o acesso do administrador a dados
 * pessoais (§22) é auditoria, e uma auditoria que às vezes não chega não é
 * auditoria. Nesses casos, usar await.
 */
/* Minimização (docs/security/incident-response.md, «Logs»):
 *   - `detail` nunca leva emails, nomes, telefones, notas nem conteúdo de
 *     candidaturas — só ids internos e o tipo de ação;
 *   - eventos originados por candidatos (extra.anonymous) guardam o IP
 *     truncado e não guardam user-agent;
 *   - retenção: purge_expired apaga logs com mais de SECURITY_LOG_DAYS.
 */
function logSecurity(event, detail = '', ip = '', extra = {}) {
  const { truncateIp } = require('../lib/privacy');
  const row = {
    event: String(event).slice(0, 80),
    detail: String(detail).slice(0, 500),
    ip: extra.anonymous ? truncateIp(ip) : String(ip || '').slice(0, 60),
    user_id: extra.userId || null,
    restaurant_id: extra.restaurantId || null,
    user_agent: extra.anonymous ? '' : String(extra.userAgent || '').slice(0, 200),
    metadata: extra.metadata || {}
  };

  /* background(): na Vercel o log termina mesmo que a resposta já tenha
   * saído (quase todas as chamadas não fazem await). */
  return require('../lib/background').background(
    Promise.resolve(sb().from('security_logs').insert(row))
      .then(({ error }) => {
        if (error) console.error('[security-log] falha:', error.message);
      }),
    'security-log'
  );
}

module.exports = { sb, one, many, count, run, rpc, escapeLike, logSecurity, dbError };

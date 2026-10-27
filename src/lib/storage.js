'use strict';

/* Supabase Storage.
 *
 * Dois buckets, ambos PRIVADOS:
 *
 *   cvs    — currículos em PDF. Nunca é gerada uma URL pública permanente
 *            (§14, §24). O ficheiro só sai daqui através de /panel/cv/:id,
 *            depois de o backend confirmar a posse.
 *   media  — logo e foto do estabelecimento. São públicas por destino, mas
 *            são servidas pelo backend em /r/:slug/imagen/:tipo para manter
 *            o CSP em `img-src 'self'`.
 *
 * O nome do objeto é sempre aleatório (§26): nem o nome original do ficheiro
 * nem qualquer dado do candidato entram no caminho.
 */

const crypto = require('crypto');

const config = require('../config');
const { sb } = require('../db');

const BUCKET_CVS = config.supabase.bucketCvs;
const BUCKET_MEDIA = config.supabase.bucketMedia;

const IMAGE_EXT = {
  'image/png': 'png',
  'image/jpeg': 'jpg',
  'image/webp': 'webp'
};

function storageError(error, context) {
  const err = new Error(`Storage: ${context} — ${(error && error.message) || 'erro desconhecido'}`);
  err.storageStatus = error && error.statusCode;
  return err;
}

function randomName() {
  return crypto.randomBytes(24).toString('hex');
}

/* ------------------------------------------------------------------ *
 * CVs
 * ------------------------------------------------------------------ */

/* Carrega o PDF e devolve o caminho do objeto.
 * O PDF já foi validado (extensão, MIME e magic bytes) antes de chegar aqui. */
async function uploadCv(buffer, restaurantId) {
  const path = `r/${Number(restaurantId)}/${randomName()}.pdf`;

  const { error } = await sb().storage.from(BUCKET_CVS).upload(path, buffer, {
    contentType: 'application/pdf',
    cacheControl: 'no-store',
    upsert: false
  });

  if (error) throw storageError(error, 'upload do CV');
  return path;
}

async function downloadCv(path) {
  const { data, error } = await sb().storage.from(BUCKET_CVS).download(path);
  if (error) {
    /* Objeto em falta não é uma falha do servidor: a candidatura pode existir
     * com o ficheiro já removido. Quem chama distingue pelo null. */
    if (error.statusCode === '404' || error.statusCode === 404) return null;
    throw storageError(error, 'download do CV');
  }
  return Buffer.from(await data.arrayBuffer());
}

/* ------------------------------------------------------------------ *
 * Imagens do estabelecimento
 * ------------------------------------------------------------------ */

async function uploadImage(buffer, restaurantId, kind, mime) {
  const ext = IMAGE_EXT[mime];
  if (!ext) throw new Error(`Tipo de imagem não suportado: ${mime}`);

  const path = `r/${Number(restaurantId)}/${kind}-${randomName()}.${ext}`;

  const { error } = await sb().storage.from(BUCKET_MEDIA).upload(path, buffer, {
    contentType: mime,
    cacheControl: '3600',
    upsert: false
  });

  if (error) throw storageError(error, `upload da imagem (${kind})`);
  return path;
}

async function downloadImage(path) {
  const { data, error } = await sb().storage.from(BUCKET_MEDIA).download(path);
  if (error) {
    if (error.statusCode === '404' || error.statusCode === 404) return null;
    throw storageError(error, 'download da imagem');
  }
  return Buffer.from(await data.arrayBuffer());
}

/* ------------------------------------------------------------------ *
 * Remoção
 * ------------------------------------------------------------------ */

/* Remoção que não lança: usada em caminhos de limpeza (rollback de uma
 * candidatura que falhou, substituição de logo, eliminação de candidatura).
 * Um objeto órfão é um problema menor do que um pedido que explode. */
async function removeQuietly(bucket, paths) {
  const list = (Array.isArray(paths) ? paths : [paths]).filter(Boolean);
  if (list.length === 0) return;

  /* A API do Storage aceita no máximo 1000 caminhos por pedido; acima disso
   * o pedido inteiro falhava e nada era apagado. */
  for (let i = 0; i < list.length; i += 1000) {
    try {
      const { error } = await sb().storage.from(bucket).remove(list.slice(i, i + 1000));
      if (error) console.error(`[storage] falha a remover de ${bucket}:`, error.message);
    } catch (err) {
      console.error(`[storage] falha a remover de ${bucket}:`, err.message);
    }
  }
}

async function removeCv(paths) {
  return removeQuietly(BUCKET_CVS, paths);
}

async function removeImage(paths) {
  return removeQuietly(BUCKET_MEDIA, paths);
}

/* ------------------------------------------------------------------ *
 * Verificação de arranque
 * ------------------------------------------------------------------ */

/* Confirma que os buckets existem e que nenhum deles é público.
 * Um bucket `cvs` público seria uma fuga de currículos (§24). */
async function assertBuckets() {
  const { data, error } = await sb().storage.listBuckets();
  if (error) throw storageError(error, 'listar buckets');

  const byId = new Map((data || []).map((b) => [b.id, b]));
  const problems = [];

  for (const id of [BUCKET_CVS, BUCKET_MEDIA]) {
    const bucket = byId.get(id);
    if (!bucket) {
      problems.push(`bucket "${id}" não existe — aplica migrations/0003_storage.sql`);
    } else if (bucket.public) {
      problems.push(`bucket "${id}" está PÚBLICO — tem de ser privado`);
    }
  }

  if (problems.length > 0) throw new Error(problems.join('\n'));
  return true;
}

module.exports = {
  BUCKET_CVS,
  BUCKET_MEDIA,
  uploadCv,
  downloadCv,
  removeCv,
  uploadImage,
  downloadImage,
  removeImage,
  assertBuckets
};

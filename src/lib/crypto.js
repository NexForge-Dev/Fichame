'use strict';

const crypto = require('crypto');

/* scrypt com N = 2^17, r = 8, p = 1 (recomendação OWASP atual). Usa
 * 128·N·r = 128 MB de memória por hash, por isso maxmem vai a 256 MB.
 *
 * O N fica gravado no hash (`scrypt$N$sal$hash`): os hashes antigos (2^14)
 * continuam a verificar-se e são refeitos com o N atual no login seguinte
 * (needsRehash). SCRYPT_N permite baixar o custo só em testes/desenvolvimento;
 * aceita potências de 2 entre 2^14 e 2^20. */
const DEFAULT_N = 2 ** 17;
const MIN_N = 2 ** 14;
const MAX_N = 2 ** 20;

function configuredN() {
  const n = parseInt(process.env.SCRYPT_N || '', 10);
  if (Number.isInteger(n) && n >= MIN_N && n <= MAX_N && (n & (n - 1)) === 0) return n;
  return DEFAULT_N;
}

const SCRYPT_PARAMS = { N: configuredN(), r: 8, p: 1 };
const KEYLEN = 64;

/* Memória necessária para um N, com folga (o Node recusa acima de maxmem). */
function optionsFor(N) {
  return { N, r: SCRYPT_PARAMS.r, p: SCRYPT_PARAMS.p, maxmem: Math.max(256 * 1024 * 1024, 256 * N * SCRYPT_PARAMS.r) };
}

function format(salt, hash) {
  return `scrypt$${SCRYPT_PARAMS.N}$${salt.toString('hex')}$${hash.toString('hex')}`;
}

/* Lê `scrypt$N$sal$hash`; null se não for um hash válido. O N vem do próprio
 * hash, mas só dentro de limites (um valor absurdo não pode pôr o servidor a
 * alocar gigabytes). */
function parse(stored) {
  const [scheme, nStr, saltHex, hashHex] = String(stored || '').split('$');
  if (scheme !== 'scrypt' || !saltHex || !hashHex) return null;
  const N = parseInt(nStr, 10);
  if (!Number.isInteger(N) || N < 2 || N > MAX_N || (N & (N - 1)) !== 0) return null;
  return { N, salt: Buffer.from(saltHex, 'hex'), expected: Buffer.from(hashHex, 'hex') };
}

/* Versões síncronas: seeds e testes. As rotas usam as assíncronas, que não
 * bloqueiam o event loop durante o hash. */
function hashPassword(password) {
  const salt = crypto.randomBytes(16);
  return format(salt, crypto.scryptSync(password, salt, KEYLEN, optionsFor(SCRYPT_PARAMS.N)));
}

function verifyPassword(password, stored) {
  try {
    const h = parse(stored);
    if (!h) return false;
    const actual = crypto.scryptSync(password, h.salt, h.expected.length, optionsFor(h.N));
    return crypto.timingSafeEqual(actual, h.expected);
  } catch {
    return false;
  }
}

function scryptAsync(password, salt, keylen, options) {
  return new Promise((resolve, reject) => {
    crypto.scrypt(password, salt, keylen, options, (err, key) => (err ? reject(err) : resolve(key)));
  });
}

async function hashPasswordAsync(password) {
  const salt = crypto.randomBytes(16);
  return format(salt, await scryptAsync(password, salt, KEYLEN, optionsFor(SCRYPT_PARAMS.N)));
}

async function verifyPasswordAsync(password, stored) {
  try {
    const h = parse(stored);
    if (!h) return false;
    const actual = await scryptAsync(password, h.salt, h.expected.length, optionsFor(h.N));
    return crypto.timingSafeEqual(actual, h.expected);
  } catch {
    return false;
  }
}

/* Hash válido mas com um N abaixo do atual: refazer no próximo login certo. */
function needsRehash(stored) {
  const h = parse(stored);
  return Boolean(h) && h.N < SCRYPT_PARAMS.N;
}

function randomToken(bytes = 32) {
  return crypto.randomBytes(bytes).toString('hex');
}

function sha256(value) {
  return crypto.createHash('sha256').update(String(value)).digest('hex');
}

function safeEqual(a, b) {
  const bufA = Buffer.from(String(a));
  const bufB = Buffer.from(String(b));
  if (bufA.length !== bufB.length) return false;
  return crypto.timingSafeEqual(bufA, bufB);
}

module.exports = {
  SCRYPT_PARAMS, hashPassword, verifyPassword, hashPasswordAsync, verifyPasswordAsync, needsRehash,
  randomToken, sha256, safeEqual
};

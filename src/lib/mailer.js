'use strict';

const net = require('net');
const tls = require('tls');
const config = require('../config');
const { sb } = require('../db');

function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, (c) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
  }[c]));
}

/* Cabeçalhos de email só admitem ASCII: texto com acentos («Fíchame», nomes
 * de vagas no assunto) vai como encoded-word UTF-8/base64 (RFC 2047), senão
 * alguns servidores e clientes mostram caracteres trocados. */
function encodeHeaderWord(text) {
  const s = String(text);
  if (/^[\x20-\x7e]*$/.test(s)) return s;
  return '=?UTF-8?B?' + Buffer.from(s, 'utf8').toString('base64') + '?=';
}

/* ---------------------------------------------------------------------------
 * Cliente SMTP mínimo (apenas para envio de notificações).
 * Se SMTP_HOST não estiver definido, o email é apenas registado em log.
 * ------------------------------------------------------------------------- */

function readReply(socket) {
  return new Promise((resolve, reject) => {
    let buffer = '';
    const onData = (chunk) => {
      buffer += chunk.toString('utf8');
      const lines = buffer.split(/\r?\n/).filter(Boolean);
      const last = lines[lines.length - 1] || '';
      if (/^\d{3} /.test(last)) {
        cleanup();
        resolve({ code: parseInt(last.slice(0, 3), 10), lines, raw: buffer });
      }
    };
    const onErr = (err) => { cleanup(); reject(err); };
    const onClose = () => { cleanup(); reject(new Error('Conexão SMTP fechada inesperadamente')); };
    function cleanup() {
      socket.off('data', onData);
      socket.off('error', onErr);
      socket.off('close', onClose);
    }
    socket.on('data', onData);
    socket.on('error', onErr);
    socket.on('close', onClose);
  });
}

async function expect(socket, codes) {
  const reply = await readReply(socket);
  if (!codes.includes(reply.code)) {
    throw new Error(`SMTP respondeu ${reply.code}: ${reply.lines[0] || ''}`);
  }
  return reply;
}

async function smtpSend({ to, subject, text, html }) {
  const { host, port, secure, user, pass, from } = config.smtp;

  /* Injeção SMTP/cabeçalhos: um endereço com CR/LF ou <> podia acrescentar
   * comandos (RCPT TO extra) ou cabeçalhos (Bcc). Os emails já são validados
   * na entrada; isto é a última barreira. */
  for (const addr of [to, from]) {
    if (!/^[^\s@<>,;]+@[^\s@<>,;]+$/.test(String(addr))) throw new Error('Endereço de email inválido');
  }

  let socket = secure
    ? tls.connect({ host, port, servername: host })
    : net.connect({ host, port });

  /* Um servidor SMTP que não responde não pode prender o pedido para sempre
   * (na Vercel isso consome o tempo da função). */
  socket.setTimeout(15000, () => socket.destroy(new Error('Tempo esgotado a falar com o servidor SMTP')));

  await new Promise((resolve, reject) => {
    socket.once('secureConnect', resolve);
    socket.once('connect', resolve);
    socket.once('error', reject);
  });

  try {
    await expect(socket, [220]);
    socket.write(`EHLO fichame.local\r\n`);
    let reply = await expect(socket, [250]);
    let caps = reply.lines.join(' ').toLowerCase();

    /* Sem TLS implícito, o STARTTLS é obrigatório: se alguém na rede o
     * retirar do EHLO, não se seguem credenciais nem links em claro.
     * SMTP_INSECURE=1 (só para testes locais) aceita a ligação sem TLS. */
    if (!secure && !caps.includes('starttls') && process.env.SMTP_INSECURE !== '1') {
      throw new Error('O servidor SMTP não oferece STARTTLS; envio cancelado.');
    }

    if (!secure && caps.includes('starttls')) {
      socket.write('STARTTLS\r\n');
      await expect(socket, [220]);
      /* Depois do STARTTLS tudo passa pelo socket TLS: continuar a escrever
       * no socket TCP original mandava o EHLO em claro e o servidor fechava. */
      socket = await new Promise((resolve, reject) => {
        const upgraded = tls.connect({
          socket, servername: host,
          rejectUnauthorized: process.env.SMTP_INSECURE !== '1'
        }, () => resolve(upgraded));
        upgraded.once('error', reject);
      });
      socket.setTimeout(15000, () => socket.destroy(new Error('Tempo esgotado a falar com o servidor SMTP')));
      socket.write(`EHLO fichame.local\r\n`);
      reply = await expect(socket, [250]);
      caps = reply.lines.join(' ').toLowerCase();
    }

    if (user) {
      if (caps.includes('auth login')) {
        socket.write('AUTH LOGIN\r\n');
        await expect(socket, [334]);
        socket.write(`${Buffer.from(user, 'utf8').toString('base64')}\r\n`);
        await expect(socket, [334]);
        socket.write(`${Buffer.from(pass, 'utf8').toString('base64')}\r\n`);
        await expect(socket, [235]);
      } else if (caps.includes('auth plain')) {
        const token = Buffer.from(`\0${user}\0${pass}`, 'utf8').toString('base64');
        socket.write(`AUTH PLAIN ${token}\r\n`);
        await expect(socket, [235]);
      } else {
        throw new Error('Servidor SMTP não suporta AUTH LOGIN/PLAIN');
      }
    }

    socket.write(`MAIL FROM:<${from}>\r\n`);
    await expect(socket, [250]);
    socket.write(`RCPT TO:<${to}>\r\n`);
    await expect(socket, [250]);
    socket.write('DATA\r\n');
    await expect(socket, [354]);

    const boundary = 'ezcv-' + Math.random().toString(36).slice(2);
    const headers = [
      `From: ${encodeHeaderWord('Fíchame')} <${from}>`,
      `To: <${to}>`,
      `Subject: ${encodeHeaderWord(subject.replace(/[\r\n]+/g, ' '))}`,
      'MIME-Version: 1.0',
      `Content-Type: multipart/alternative; boundary="${boundary}"`,
      ''
    ].join('\r\n');

    const body = [
      `--${boundary}`,
      'Content-Type: text/plain; charset=utf-8',
      '', text,
      `--${boundary}`,
      'Content-Type: text/html; charset=utf-8',
      '', html,
      `--${boundary}--`,
      ''
    ].join('\r\n');

    const dotStuff = (headers + body).split(/\r?\n/).map((l) => (l.startsWith('.') ? '.' + l : l)).join('\r\n');
    socket.write(dotStuff + '\r\n.\r\n');
    await expect(socket, [250]);
    socket.write('QUIT\r\n');
    try { await expect(socket, [221]); } catch { /* ignora erro no QUIT */ }
  } finally {
    socket.destroy();
  }
}

async function recordNotification(restaurantId, applicationId, status, detail, type = 'nueva_candidatura') {
  try {
    const { error } = await sb().from('notifications').insert({
      restaurant_id: restaurantId,
      application_id: applicationId,
      type,
      channel: 'email',
      status,
      detail: String(detail || '').slice(0, 300)
    });
    if (error) throw new Error(error.message);
  } catch (err) {
    console.error('[mailer] falha ao registar notificação:', err.message);
  }
}

/* Envio genérico. Sem SMTP configurado NADA do conteúdo vai para o log: nem
 * o destinatário, nem o corpo (que pode ter um link de recuperação de senha).
 * Devolve 'sent' | 'failed' | 'logged'. */
async function deliver({ to, subject, text, html, kind }) {
  if (!config.smtp.host) {
    console.log(`[EMAIL] ${kind}: SMTP não configurado, email não enviado.`);
    return 'logged';
  }
  try {
    await smtpSend({ to, subject, text, html });
    console.log(`[EMAIL] ${kind}: enviado.`);
    return 'sent';
  } catch (err) {
    console.error(`[EMAIL] ${kind}: falha — ${err.message}`);
    return 'failed';
  }
}

/* Notificação de nova candidatura ao restaurante (§21).
 *
 * Minimização: o email NÃO leva o CV, nem o nome, email ou telefone do
 * candidato, nem as observações — só o aviso, o puesto (dado do próprio
 * restaurante) e um link para o painel, onde o acesso é autenticado. Um email
 * sai do controlo da plataforma e fica em caixas de correio indefinidamente. */
async function notifyNewApplication({ restaurant, applicationId, jobTitle }) {
  const subject = 'Nueva candidatura recibida en Fíchame';
  const position = jobTitle || 'Sin puesto especificado';
  const link = `${config.appUrl}/panel/candidaturas/${applicationId}`;

  const text = [
    'Has recibido una nueva candidatura en Fíchame.',
    '',
    `Puesto: ${position}`,
    '',
    `Ver en tu panel (requiere iniciar sesión): ${link}`
  ].join('\n');

  const html = [
    '<p><strong>Has recibido una nueva candidatura en Fíchame.</strong></p>',
    `<p>Puesto: <strong>${escapeHtml(position)}</strong></p>`,
    `<p><a href="${escapeHtml(link)}">Ver en tu panel</a> (requiere iniciar sesión)</p>`
  ].join('\n');

  const status = await deliver({ to: restaurant.email, subject, text, html, kind: 'nova candidatura' });
  await recordNotification(restaurant.id, applicationId, status, status === 'logged' ? 'SMTP não configurado' : '');
}

/* Pedido de exercício de direitos recebido. Sem o nome nem o email do
 * titular: o restaurante vê o pedido no painel. */
async function notifyRightsRequest({ restaurant, dueAt }) {
  const to = restaurant.privacy_email || restaurant.email;
  const due = new Date(dueAt).toISOString().slice(0, 10);
  const link = `${config.appUrl}/panel/derechos`;
  const subject = 'Solicitud de ejercicio de derechos de protección de datos';
  const text = [
    'Has recibido una solicitud de ejercicio de derechos (RGPD) a través de Fíchame.',
    `Plazo legal de respuesta: hasta el ${due} (1 mes, art. 12.3 RGPD).`,
    '',
    `Gestiónala en tu panel: ${link}`
  ].join('\n');
  const html = [
    '<p><strong>Has recibido una solicitud de ejercicio de derechos (RGPD) a través de Fíchame.</strong></p>',
    `<p>Plazo legal de respuesta: hasta el <strong>${escapeHtml(due)}</strong> (1 mes, art. 12.3 RGPD).</p>`,
    `<p><a href="${escapeHtml(link)}">Gestionar en tu panel</a></p>`
  ].join('\n');
  const status = await deliver({ to, subject, text, html, kind: 'pedido de direitos' });
  await recordNotification(restaurant.id, null, status, '', 'solicitud_derechos');
}

/* Recuperação de senha. O link leva o token no FRAGMENTO (#), que o browser
 * não envia ao servidor: não aparece em logs de acesso, proxies nem Referer. */
async function sendPasswordReset({ to, token }) {
  const link = `${config.appUrl}/recuperar/nueva#t=${token}`;
  const subject = 'Restablecer tu contraseña de Fíchame';
  const text = [
    'Hemos recibido una solicitud para restablecer la contraseña de tu cuenta de Fíchame.',
    'El enlace caduca en 30 minutos y solo se puede usar una vez:',
    '',
    link,
    '',
    'Si no lo has pedido tú, ignora este mensaje: tu contraseña no cambia.'
  ].join('\n');
  const html = [
    '<p>Hemos recibido una solicitud para restablecer la contraseña de tu cuenta de Fíchame.</p>',
    '<p>El enlace caduca en 30 minutos y solo se puede usar una vez:</p>',
    `<p><a href="${escapeHtml(link)}">Restablecer contraseña</a></p>`,
    '<p>Si no lo has pedido tú, ignora este mensaje: tu contraseña no cambia.</p>'
  ].join('\n');
  return deliver({ to, subject, text, html, kind: 'recuperação de senha' });
}

/* Confirmação da mudança do email de acesso (/panel/configuracion). Vai para
 * o email NOVO: só muda quando o dono, com sessão iniciada, abre o link.
 * Uso único, 24 h. O link leva o token na query (a página que o abre não
 * carrega recursos externos e responde com Referrer-Policy: no-referrer). */
async function sendEmailChangeConfirmation({ to, token }) {
  const link = `${config.appUrl}/panel/configuracion/email?t=${token}`;
  const subject = 'Confirma tu nuevo email de acceso a Fíchame';
  const text = [
    'Has pedido cambiar el email con el que entras en Fíchame a esta dirección.',
    'Para confirmarlo, abre este enlace con la sesión iniciada en tu cuenta. Caduca en 24 horas y solo se puede usar una vez:',
    '',
    link,
    '',
    'Si no lo has pedido tú, ignora este mensaje: el email de la cuenta no cambia.'
  ].join('\n');
  const html = [
    '<p>Has pedido cambiar el email con el que entras en Fíchame a esta dirección.</p>',
    '<p>Para confirmarlo, abre este enlace con la sesión iniciada en tu cuenta. Caduca en 24 horas y solo se puede usar una vez:</p>',
    `<p><a href="${escapeHtml(link)}">Confirmar el nuevo email</a></p>`,
    '<p>Si no lo has pedido tú, ignora este mensaje: el email de la cuenta no cambia.</p>'
  ].join('\n');
  return deliver({ to, subject, text, html, kind: 'confirmação de email' });
}

/* Novo reporte de problema (/panel/reportar) para o admin da plataforma
 * (ADMIN_EMAIL). Sem o texto do reporte — pode trazer dados que não devem
 * sair por email: só o tipo, o negócio e o link para o admin. */
async function notifyProblemReport({ kind, restaurantName }) {
  const to = String(process.env.ADMIN_EMAIL || '').trim();
  if (!to) return 'skipped';
  const link = `${config.appUrl}/admin/reportes`;
  const label = { error: 'Error', sugerencia: 'Sugerencia', duda: 'Duda' }[kind] || kind;
  const subject = `Nuevo reporte en Fíchame: ${label}`;
  const text = [
    `${restaurantName || 'Un negocio'} ha enviado un reporte (${label}).`,
    '',
    `Ver en el panel de administración: ${link}`
  ].join('\n');
  const html = [
    `<p><strong>${escapeHtml(restaurantName || 'Un negocio')}</strong> ha enviado un reporte (${escapeHtml(label)}).</p>`,
    `<p><a href="${escapeHtml(link)}">Ver en el panel de administración</a></p>`
  ].join('\n');
  return deliver({ to, subject, text, html, kind: 'reporte de problema' });
}

module.exports = { notifyNewApplication, notifyRightsRequest, sendPasswordReset, sendEmailChangeConfirmation, notifyProblemReport };

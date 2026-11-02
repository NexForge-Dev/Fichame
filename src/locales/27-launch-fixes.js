'use strict';

/* Textos das correções de lançamento (0013): confirmação da mudança do
 * email de acesso (src/routes/panel.js, views panel/settings.ejs e
 * panel/email_confirm.ejs). Chave = texto espanhol original. */

module.exports = {
  // panel/settings.ejs
  'Cambio pendiente de confirmar:': { en: 'Change pending confirmation:', pt: 'Alteração pendente de confirmação:' },
  'Abre el enlace que te hemos enviado a ese email.': {
    en: 'Open the link we sent to that email.',
    pt: 'Abre o link que enviámos para esse email.'
  },
  'Te enviaremos un enlace al nuevo email: el cambio solo se hace cuando lo abras.': {
    en: 'We’ll send a link to the new email: the change only happens when you open it.',
    pt: 'Vamos enviar um link para o novo email: a alteração só é feita quando o abrires.'
  },
  'Repetir nuevo email': { en: 'Repeat new email', pt: 'Repetir novo email' },
  'Escríbelo otra vez para evitar errores: si te equivocas, no podrías entrar.': {
    en: 'Type it again to avoid mistakes: if it’s wrong, you wouldn’t be able to log in.',
    pt: 'Escreve-o outra vez para evitar erros: se te enganares, não conseguirias entrar.'
  },

  // panel/email_confirm.ejs
  'Confirmar nuevo email': { en: 'Confirm new email', pt: 'Confirmar novo email' },
  'Volver a Configuración': { en: 'Back to Settings', pt: 'Voltar às Definições' },
  'A partir de ahora entrarás con el nuevo email. Se cerrarán tus demás sesiones.': {
    en: 'From now on you’ll log in with the new email. Your other sessions will be closed.',
    pt: 'A partir de agora entras com o novo email. As tuas outras sessões serão terminadas.'
  },
  'Confirmar el cambio de email': { en: 'Confirm the email change', pt: 'Confirmar a alteração de email' },

  // src/routes/panel.js (mensagens passadas por ?ok= / ?err= ou à view)
  'Los dos emails nuevos no coinciden.': { en: 'The two new emails don’t match.', pt: 'Os dois emails novos não coincidem.' },
  'No pudimos enviar el enlace de confirmación al nuevo email. Inténtalo de nuevo.': {
    en: 'We couldn’t send the confirmation link to the new email. Please try again.',
    pt: 'Não conseguimos enviar o link de confirmação para o novo email. Tenta de novo.'
  },
  'La contraseña se ha cambiado, pero no pudimos enviar el enlace de confirmación al nuevo email. Inténtalo de nuevo.': {
    en: 'Your password has been changed, but we couldn’t send the confirmation link to the new email. Please try again.',
    pt: 'A palavra-passe foi alterada, mas não conseguimos enviar o link de confirmação para o novo email. Tenta de novo.'
  },
  'Te hemos enviado un enlace a {email}. Tu email de acceso cambiará cuando lo abras con la sesión iniciada (caduca en 24 horas).': {
    en: 'We’ve sent a link to {email}. Your login email will change when you open it while logged in (it expires in 24 hours).',
    pt: 'Enviámos um link para {email}. O teu email de acesso muda quando o abrires com a sessão iniciada (expira em 24 horas).'
  },
  'El enlace no es válido o ha caducado. Vuelve a pedir el cambio en Configuración.': {
    en: 'The link is not valid or has expired. Request the change again in Settings.',
    pt: 'O link não é válido ou expirou. Volta a pedir a alteração nas Definições.'
  },
  'Email de acceso actualizado.': { en: 'Login email updated.', pt: 'Email de acesso atualizado.' },

  // src/routes/auth.js, panel.js e public.js («negocio» em vez de «establecimiento»)
  'Indica el nombre del negocio.': { en: 'Enter the business name.', pt: 'Indica o nome do negócio.' },
  'Selecciona el tipo de negocio.': { en: 'Select the type of business.', pt: 'Seleciona o tipo de negócio.' },
  'No encontramos este negocio. Comprueba el enlace o el código QR.': {
    en: 'We couldn’t find this business. Check the link or the QR code.',
    pt: 'Não encontrámos este negócio. Verifica o link ou o código QR.'
  }
};

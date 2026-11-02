'use strict';

/* Mensagens produzidas por src/routes/panel.js: ?ok= / ?err= dos redirects
 * (mostradas pelo partials/flash com tr(query.ok/err)), páginas de erro e
 * erros de validação. Chave = texto espanhol exato enviado pela rota.
 * As mensagens com interpolação (`${…}`) não têm chave fixa e ficam em
 * espanhol. */

module.exports = {
  // Erros genéricos
  'Este elemento no existe o no pertenece a tu establecimiento.': {
    en: 'This item does not exist or does not belong to your business.',
    pt: 'Este elemento não existe ou não pertence ao teu estabelecimento.'
  },
  'Recarga la página.': { en: 'Reload the page.', pt: 'Recarrega a página.' },
  'CV no disponible': { en: 'CV not available', pt: 'CV não disponível' },
  'El archivo ya no existe.': { en: 'The file no longer exists.', pt: 'O ficheiro já não existe.' },

  // Candidaturas
  'Estado no válido.': { en: 'Invalid status.', pt: 'Estado inválido.' },
  'Solo se puede marcar «Para el futuro» si el candidato aceptó que le guardes para otras vacantes. Si no lo aceptó, sus datos se borran al terminar el proceso.': {
    en: 'You can only mark “For the future” if the candidate agreed to be kept for other openings. If they did not, their data is deleted when the process ends.',
    pt: 'Só podes marcar «Para o futuro» se o candidato aceitou ficar guardado para outras vagas. Se não aceitou, os dados são apagados quando o processo termina.'
  },
  'Candidato marcado como favorito.': { en: 'Candidate marked as favourite.', pt: 'Candidato marcado como favorito.' },
  'Favorito retirado.': { en: 'Removed from favourites.', pt: 'Favorito removido.' },
  'La nota está vacía.': { en: 'The note is empty.', pt: 'A nota está vazia.' },
  'La nota no se ha guardado: parece mencionar salud, religión, origen, edad, situación familiar u otra característica protegida. No registres esa información: es un dato especialmente protegido o puede ser discriminatorio. Si es imprescindible y legítimo para el puesto, reescribe la nota y marca la casilla de confirmación.': {
    en: 'The note was not saved: it seems to mention health, religion, origin, age, family situation or another protected characteristic. Do not record that information: it is specially protected data or may be discriminatory. If it is essential and legitimate for the job, rewrite the note and tick the confirmation box.',
    pt: 'A nota não foi guardada: parece mencionar saúde, religião, origem, idade, situação familiar ou outra característica protegida. Não registes essa informação: é um dado especialmente protegido ou pode ser discriminatório. Se for imprescindível e legítimo para a função, reescreve a nota e marca a caixa de confirmação.'
  },
  'Nota guardada.': { en: 'Note saved.', pt: 'Nota guardada.' },
  'Nota eliminada.': { en: 'Note deleted.', pt: 'Nota eliminada.' },
  'Esta candidatura tiene un bloqueo de conservación activo. Retíralo antes de eliminarla.': {
    en: 'This application has an active retention hold. Remove it before deleting the application.',
    pt: 'Esta candidatura tem um bloqueio de conservação ativo. Retira-o antes de a eliminar.'
  },
  'Candidatura eliminada junto con su CV.': { en: 'Application deleted along with its CV.', pt: 'Candidatura eliminada juntamente com o CV.' },
  'Marca la casilla de confirmación.': { en: 'Tick the confirmation box.', pt: 'Marca a caixa de confirmação.' },
  'Alguna candidatura de esta persona tiene un bloqueo de conservación. Retíralo antes de suprimir sus datos.': {
    en: 'One of this person’s applications has a retention hold. Remove it before erasing their data.',
    pt: 'Uma das candidaturas desta pessoa tem um bloqueio de conservação. Retira-o antes de suprimir os seus dados.'
  },
  'Este candidato no tiene un consentimiento activo.': { en: 'This candidate has no active consent.', pt: 'Este candidato não tem um consentimento ativo.' },
  'Consentimiento retirado. Si la candidatura estaba en reserva, sus datos se borrarán en la próxima limpieza automática.': {
    en: 'Consent withdrawn. If the application was in the talent pool, its data will be deleted in the next automatic clean-up.',
    pt: 'Consentimento retirado. Se a candidatura estava em reserva, os seus dados serão apagados na próxima limpeza automática.'
  },
  'Consentimiento retirado. Si la candidatura estaba en reserva y ya no necesitas sus datos, elimínala desde esta página.': {
    en: 'Consent withdrawn. If the application was in the talent pool and you no longer need its data, delete it from this page.',
    pt: 'Consentimento retirado. Se a candidatura estava em reserva e já não precisas dos dados, elimina-a nesta página.'
  },
  'Indica el motivo del bloqueo (p. ej., reclamación en curso).': {
    en: 'Give the reason for the hold (e.g. ongoing complaint).',
    pt: 'Indica o motivo do bloqueio (p. ex., reclamação em curso).'
  },
  'Bloqueo de conservación activado.': { en: 'Retention hold enabled.', pt: 'Bloqueio de conservação ativado.' },
  'Bloqueo retirado.': { en: 'Hold removed.', pt: 'Bloqueio retirado.' },

  // Vagas
  'Indica el título de la vacante.': { en: 'Enter the opening title.', pt: 'Indica o título da vaga.' },
  'Vacante creada.': { en: 'Opening created.', pt: 'Vaga criada.' },
  'Vacante actualizada.': { en: 'Opening updated.', pt: 'Vaga atualizada.' },
  'Vacante no encontrada.': { en: 'Opening not found.', pt: 'Vaga não encontrada.' },
  'Vacante eliminada. Las candidaturas asociadas se conservan.': {
    en: 'Opening deleted. Its applications are kept.',
    pt: 'Vaga eliminada. As candidaturas associadas são mantidas.'
  },

  // Contratação
  'Acción no válida.': { en: 'Invalid action.', pt: 'Ação inválida.' },
  'Candidaturas pausadas. Tu enlace y tu QR seguirán funcionando.': { en: 'Applications paused. Your link and QR code will keep working.', pt: 'Candidaturas pausadas. O teu link e o teu QR continuam a funcionar.' },
  'Candidaturas activadas.': { en: 'Applications open.', pt: 'Candidaturas ativadas.' },

  // O meu negócio
  'El archivo no es una imagen válida (solo PNG, JPG o WEBP).': {
    en: 'The file is not a valid image (PNG, JPG or WEBP only).',
    pt: 'O ficheiro não é uma imagem válida (só PNG, JPG ou WEBP).'
  },
  'Solo se aceptan imágenes PNG, JPG o WEBP.': { en: 'Only PNG, JPG or WEBP images are accepted.', pt: 'Só se aceitam imagens PNG, JPG ou WEBP.' },
  'Indica la razón social o el nombre del titular.': { en: 'Enter the legal name or the owner’s name.', pt: 'Indica a denominação social ou o nome do titular.' },
  'Indica un email de contacto para privacidad.': { en: 'Enter a privacy contact email.', pt: 'Indica um email de contacto para privacidade.' },
  'El código postal debe tener 5 dígitos.': { en: 'The postcode must have 5 digits.', pt: 'O código postal tem de ter 5 dígitos.' },
  'Establecimiento no encontrado.': { en: 'Business not found.', pt: 'Estabelecimento não encontrado.' },
  'No se pudo guardar la imagen. Inténtalo de nuevo.': { en: 'The image could not be saved. Please try again.', pt: 'Não foi possível guardar a imagem. Tenta de novo.' },
  'Datos guardados.': { en: 'Details saved.', pt: 'Dados guardados.' },

  // Configuração
  'Antes de desvincular Google, crea una contraseña con «¿Has olvidado tu contraseña?».': {
    en: 'Before unlinking Google, create a password using “Forgot your password?”.',
    pt: 'Antes de desassociar o Google, cria uma palavra-passe com «Esqueceste-te da palavra-passe?».'
  },
  'La contraseña actual es incorrecta.': { en: 'The current password is incorrect.', pt: 'A palavra-passe atual está incorreta.' },
  'Cuenta de Google desvinculada.': { en: 'Google account unlinked.', pt: 'Conta Google desassociada.' },
  'Tu cuenta entra con Google y aún no tiene contraseña. Para crear una, usa «¿Has olvidado tu contraseña?» en la página de inicio de sesión.': {
    en: 'Your account signs in with Google and has no password yet. To create one, use “Forgot your password?” on the sign-in page.',
    pt: 'A tua conta entra com o Google e ainda não tem palavra-passe. Para criar uma, usa «Esqueceste-te da palavra-passe?» na página de início de sessão.'
  },
  'Email no válido.': { en: 'Invalid email.', pt: 'Email inválido.' },
  'Ya existe una cuenta con ese email.': { en: 'An account with that email already exists.', pt: 'Já existe uma conta com esse email.' },
  'Las contraseñas nuevas no coinciden.': { en: 'The new passwords do not match.', pt: 'As novas palavras-passe não coincidem.' },
  'Configuración actualizada.': { en: 'Settings updated.', pt: 'Definições atualizadas.' },

  // Avisos (título mostrado em vez do nome da vaga)
  'Solicitud de derechos (RGPD)': { en: 'Rights request (GDPR)', pt: 'Pedido de direitos (RGPD)' },

  // Privacidade, termos e direitos
  'Plazos fuera de los límites permitidos.': { en: 'Periods outside the allowed limits.', pt: 'Prazos fora dos limites permitidos.' },
  'Plazos guardados y aplicados a las candidaturas existentes.': {
    en: 'Periods saved and applied to existing applications.',
    pt: 'Prazos guardados e aplicados às candidaturas existentes.'
  },
  'Marca la casilla para aceptar los nuevos términos.': { en: 'Tick the box to accept the new terms.', pt: 'Marca a caixa para aceitar os novos termos.' },
  'Gracias. Has aceptado la nueva versión de los términos.': {
    en: 'Thank you. You have accepted the new version of the terms.',
    pt: 'Obrigado. Aceitaste a nova versão dos termos.'
  },
  'Solicitud actualizada.': { en: 'Request updated.', pt: 'Pedido atualizado.' },

  // Reportar um problema
  'Cuéntanos qué ha pasado.': { en: 'Tell us what happened.', pt: 'Conta-nos o que aconteceu.' },
  'Gracias. Hemos recibido tu reporte y lo revisaremos.': {
    en: 'Thank you. We have received your report and will look into it.',
    pt: 'Obrigado. Recebemos o teu relatório e vamos analisá-lo.'
  }
};

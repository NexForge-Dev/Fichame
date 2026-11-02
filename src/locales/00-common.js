'use strict';

/* Traduções partilhadas: estados, listas de opções, datas, rodapé e
 * seletor de idioma. Chave = texto espanhol original (ver src/lib/i18n.js). */

module.exports = {
  // Estados da candidatura
  'Nuevo': { en: 'New', pt: 'Novo' },
  'Revisado': { en: 'Reviewed', pt: 'Revisto' },
  'Contactar': { en: 'To contact', pt: 'Contactar' },
  'Visto': { en: 'Seen', pt: 'Visto' },
  'Por contactar': { en: 'To contact', pt: 'Por contactar' },
  'Para el futuro': { en: 'For the future', pt: 'Para o futuro' },
  'Contactado': { en: 'Contacted', pt: 'Contactado' },
  'Entrevista': { en: 'Interview', pt: 'Entrevista' },
  'Contratado': { en: 'Hired', pt: 'Contratado' },
  'Rechazado': { en: 'Rejected', pt: 'Rejeitado' },
  'Reserva / Futuras oportunidades': { en: 'Talent pool / Future opportunities', pt: 'Reserva / Oportunidades futuras' },

  // Disponibilidade
  'Sin especificar': { en: 'Not specified', pt: 'Sem especificar' },
  'Mañana': { en: 'Morning', pt: 'Manhã' },
  'Tarde': { en: 'Afternoon', pt: 'Tarde' },
  'Flexible / turnos rotativos': { en: 'Flexible / rotating shifts', pt: 'Flexível / turnos rotativos' },
  'Fines de semana': { en: 'Weekends', pt: 'Fins de semana' },
  'Jornada completa': { en: 'Full-time', pt: 'Tempo inteiro' },
  'Jornada parcial': { en: 'Part-time', pt: 'Tempo parcial' },

  // Documentos
  'Pasaporte': { en: 'Passport', pt: 'Passaporte' },
  'Otro documento': { en: 'Other document', pt: 'Outro documento' },

  // Tipos de estabelecimento
  'Restaurante': { en: 'Restaurant', pt: 'Restaurante' },
  'Bar': { en: 'Bar', pt: 'Bar' },
  'Cafetería': { en: 'Café', pt: 'Café / pastelaria' },
  'Panadería / pastelería': { en: 'Bakery / patisserie', pt: 'Padaria / pastelaria' },
  'Food truck': { en: 'Food truck', pt: 'Food truck' },
  'Tienda de alimentación / supermercado': { en: 'Grocery store / supermarket', pt: 'Mercearia / supermercado' },
  'Tienda / comercio': { en: 'Shop / retail', pt: 'Loja / comércio' },
  'Hotel / alojamiento': { en: 'Hotel / accommodation', pt: 'Hotel / alojamento' },
  'Peluquería / estética': { en: 'Hair salon / beauty', pt: 'Cabeleireiro / estética' },
  'Gimnasio / deporte': { en: 'Gym / sports', pt: 'Ginásio / desporto' },
  'Oficina / servicios': { en: 'Office / services', pt: 'Escritório / serviços' },
  'Otro': { en: 'Other', pt: 'Outro' },

  // Contratos e horários
  'Indefinido': { en: 'Permanent', pt: 'Sem termo' },
  'Eventual / temporal': { en: 'Temporary', pt: 'Temporário' },
  'Prácticas': { en: 'Internship', pt: 'Estágio' },
  'Por obra o servicio': { en: 'Fixed project', pt: 'Por obra ou serviço' },
  'Autónomo / freelance': { en: 'Self-employed / freelance', pt: 'Independente / freelancer' },
  'Turnos rotativos': { en: 'Rotating shifts', pt: 'Turnos rotativos' },
  'Noches': { en: 'Nights', pt: 'Noites' },

  // Histórico
  'Candidatura recibida': { en: 'Application received', pt: 'Candidatura recebida' },
  'Estado cambiado': { en: 'Status changed', pt: 'Estado alterado' },
  'Favorito actualizado': { en: 'Favourite updated', pt: 'Favorito atualizado' },
  'Bloqueo legal actualizado': { en: 'Legal hold updated', pt: 'Bloqueio legal atualizado' },
  'Consentimiento retirado': { en: 'Consent withdrawn', pt: 'Consentimento retirado' },
  'Solicitud no válida': { en: 'Invalid request', pt: 'Pedido inválido' },
  'No hemos podido procesar la solicitud. Revisa los datos e inténtalo de nuevo.': { en: 'We could not process the request. Check the details and try again.', pt: 'Não foi possível processar o pedido. Revê os dados e tenta de novo.' },

  // Datas e plurais comuns
  'Hoy': { en: 'Today', pt: 'Hoje' },
  'Ayer': { en: 'Yesterday', pt: 'Ontem' },
  'candidatura': { en: 'application', pt: 'candidatura' },
  'candidaturas': { en: 'applications', pt: 'candidaturas' },
  'vacante': { en: 'opening', pt: 'vaga' },
  'vacantes': { en: 'openings', pt: 'vagas' },

  // Rodapé e idioma
  'Fíchame · Candidaturas con QR para cualquier negocio': { en: 'Fíchame · QR job applications for any business', pt: 'Fíchame · Candidaturas por QR para qualquer negócio' },
  'Privacidad': { en: 'Privacy', pt: 'Privacidade' },
  'Cookies': { en: 'Cookies', pt: 'Cookies' },
  'Términos': { en: 'Terms', pt: 'Termos' },
  'Idioma': { en: 'Language', pt: 'Idioma' },
  'Elige el idioma en el que quieres ver Fíchame. Se guarda en este navegador.': {
    en: 'Choose the language you want to use Fíchame in. It is saved in this browser.',
    pt: 'Escolhe o idioma em que queres ver o Fíchame. Fica guardado neste browser.'
  },
  'Los textos legales (privacidad, términos y consentimientos) se muestran en español, que es su versión oficial.': {
    en: 'Legal texts (privacy, terms and consents) are shown in Spanish, which is their official version.',
    pt: 'Os textos legais (privacidade, termos e consentimentos) aparecem em espanhol, que é a sua versão oficial.'
  },

  // Demo
  'Demostración con datos ficticios.': { en: 'Demo with fictional data.', pt: 'Demonstração com dados fictícios.' },
  'Ningún candidato ni negocio de esta cuenta es real y los cambios no se guardan.': {
    en: 'No candidate or business in this account is real, and changes are not saved.',
    pt: 'Nenhum candidato nem negócio desta conta é real e as alterações não são guardadas.'
  },
  'Crea tu cuenta gratis': { en: 'Create your free account', pt: 'Cria a tua conta grátis' },
  'Esto es una demostración: los cambios no se guardan. Crea tu cuenta gratis para usar Fíchame con tu negocio.': {
    en: 'This is a demo: changes are not saved. Create your free account to use Fíchame with your business.',
    pt: 'Isto é uma demonstração: as alterações não são guardadas. Cria a tua conta grátis para usar o Fíchame no teu negócio.'
  },
  'Página de demostración.': { en: 'Demo page.', pt: 'Página de demonstração.' },
  'Este negocio es ficticio y el formulario no envía nada.': {
    en: 'This business is fictional and the form does not send anything.',
    pt: 'Este negócio é fictício e o formulário não envia nada.'
  },
  'Crea la página de tu negocio gratis': { en: 'Create your business page for free', pt: 'Cria a página do teu negócio grátis' },
  'Hemos actualizado los términos de uso.': { en: 'We have updated the terms of use.', pt: 'Atualizámos os termos de utilização.' },
  'Revisa los cambios y acéptalos': { en: 'Review and accept the changes', pt: 'Revê as alterações e aceita-as' }
};

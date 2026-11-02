'use strict';

/* Traduções do painel de gestão: vagas, o meu negócio, configuração,
 * privacidade, direitos, termos e reportar um problema.
 * Chave = texto espanhol original (ver src/lib/i18n.js). */

module.exports = {
  // Genéricos do painel
  'Guardar': { en: 'Save', pt: 'Guardar' },
  'Guardar cambios': { en: 'Save changes', pt: 'Guardar alterações' },
  'Aceptar': { en: 'Accept', pt: 'Aceitar' },
  'Editar…': { en: 'Edit…', pt: 'Editar…' },
  'Título': { en: 'Title', pt: 'Título' },
  'Descripción': { en: 'Description', pt: 'Descrição' },
  'Requisitos': { en: 'Requirements', pt: 'Requisitos' },
  'Requisitos:': { en: 'Requirements:', pt: 'Requisitos:' },
  'Tipo de contrato': { en: 'Contract type', pt: 'Tipo de contrato' },
  'Jornada': { en: 'Working hours', pt: 'Horário' },
  'opcional': { en: 'optional', pt: 'opcional' },
  'y': { en: 'and', pt: 'e' },
  'en': { en: 'in', pt: 'em' },
  'y el': { en: 'and the', pt: 'e o' },
  'y en el': { en: 'and in the', pt: 'e no' },
  'y del': { en: 'and the', pt: 'e o' },
  'Acuerdo de encargo del tratamiento': { en: 'Data Processing Agreement', pt: 'Acordo de subcontratação do tratamento' },
  'Términos de uso': { en: 'Terms of use', pt: 'Termos de utilização' },

  // Vagas
  'Nueva vacante': { en: 'New opening', pt: 'Nova vaga' },
  'Mientras no haya ninguna vacante activa, tu página ofrece el formulario de futuras oportunidades.': {
    en: 'While there are no active openings, your page offers the future opportunities form.',
    pt: 'Enquanto não houver nenhuma vaga ativa, a tua página mostra o formulário de oportunidades futuras.'
  },
  'Ej.: Dependiente/a, Camarero/a…': { en: 'E.g. Shop assistant, Waiter/Waitress…', pt: 'Ex.: Empregado/a de loja, Empregado/a de mesa…' },
  'Ej.: Buscamos dependiente/a para tienda céntrica…': {
    en: 'E.g. We are looking for a shop assistant for our town-centre store…',
    pt: 'Ex.: Procuramos empregado/a de loja para loja no centro…'
  },
  'Ej.: Experiencia previa (valorada), disponibilidad de fines de semana…': {
    en: 'E.g. Previous experience (a plus), weekend availability…',
    pt: 'Ex.: Experiência anterior (valorizada), disponibilidade aos fins de semana…'
  },
  'Vacantes actuales': { en: 'Current openings', pt: 'Vagas atuais' },
  'No tienes vacantes. Crea la primera arriba. Mientras no haya vacantes activas, tu página pública ofrecerá el formulario de futuras oportunidades.': { en: 'You have no openings. Create the first one above. While there are no active openings, your public page will offer the future opportunities form.', pt: 'Não tens vagas. Cria a primeira acima. Enquanto não houver vagas ativas, a tua página pública mostra o formulário de oportunidades futuras.' },
  'Activa': { en: 'Active', pt: 'Ativa' },
  'Desactivada': { en: 'Inactive', pt: 'Desativada' },
  'candidatura recibida': { en: 'application received', pt: 'candidatura recebida' },
  'candidaturas recibidas': { en: 'applications received', pt: 'candidaturas recebidas' },
  'creada el {date}': { en: 'created on {date}', pt: 'criada a {date}' },
  'Desactivar vacante': { en: 'Deactivate opening', pt: 'Desativar vaga' },
  'Activar vacante': { en: 'Activate opening', pt: 'Ativar vaga' },
  'Eliminar vacante…': { en: 'Delete opening…', pt: 'Eliminar vaga…' },
  'Las candidaturas recibidas para esta vacante se conservan.': {
    en: 'Applications received for this opening are kept.',
    pt: 'As candidaturas recebidas para esta vaga são mantidas.'
  },
  'Sí, eliminar esta vacante': { en: 'Yes, delete this opening', pt: 'Sim, eliminar esta vaga' },

  // O meu negócio
  'URL de tu página pública': { en: 'Your public page URL', pt: 'URL da tua página pública' },
  'Copiar URL': { en: 'Copy URL', pt: 'Copiar URL' },
  'Generar código QR': { en: 'Generate QR code', pt: 'Gerar código QR' },
  'Comparte esta URL o imprime su código QR. Nunca cambiará, aunque pauses o reactives las candidaturas.': { en: 'Share this URL or print its QR code. It will never change, even if you pause or reopen applications.', pt: 'Partilha este URL ou imprime o seu código QR. Nunca vai mudar, mesmo que pauses ou reatives as candidaturas.' },
  'Estado de contratación': { en: 'Hiring status', pt: 'Estado do recrutamento' },
  'Al pausar, tu página pública mostrará «No estamos contratando» y solo recibirá datos para futuras oportunidades. El enlace y el QR siguen siendo los mismos.': { en: 'When paused, your public page will show “We are not hiring” and will only collect details for future opportunities. The link and the QR code stay the same.', pt: 'Ao pausar, a tua página pública mostra «Não estamos a contratar» e só recebe dados para oportunidades futuras. O link e o QR continuam os mesmos.' },
  'Pausado': { en: 'Paused', pt: 'Pausado' },
  'Al activar, el formulario de candidaturas vuelve a estar disponible al instante.': {
    en: 'When reopened, the application form is available again straight away.',
    pt: 'Ao ativar, o formulário de candidaturas volta a estar disponível de imediato.'
  },
  'Datos del negocio': { en: 'Business details', pt: 'Dados do negócio' },
  'Se muestra a los candidatos como responsable del tratamiento de sus datos.': {
    en: 'Shown to candidates as the controller of their data.',
    pt: 'Aparece aos candidatos como responsável pelo tratamento dos seus dados.'
  },
  'Email de contacto para privacidad': { en: 'Privacy contact email', pt: 'Email de contacto para privacidade' },
  'Público: los candidatos lo ven para ejercer sus derechos. Aquí recibirás también los avisos de solicitudes.': {
    en: 'Public: candidates see it so they can exercise their rights. You will also receive request notifications here.',
    pt: 'Público: os candidatos veem-no para exercer os seus direitos. Também vais receber aqui os avisos de pedidos.'
  },
  'Persona de contacto': { en: 'Contact person', pt: 'Pessoa de contacto' },
  'Email para avisos de candidaturas': { en: 'Email for application notifications', pt: 'Email para avisos de candidaturas' },
  'Los avisos no incluyen datos del candidato: solo un enlace a tu panel.': {
    en: 'Notifications contain no candidate data: just a link to your dashboard.',
    pt: 'Os avisos não incluem dados do candidato: só uma ligação para o teu painel.'
  },
  'Imágenes de tu página pública': { en: 'Public page images', pt: 'Imagens da tua página pública' },
  'PNG, JPG o WEBP · máximo {mb} MB. Se muestran en la página pública que ven los candidatos.': {
    en: 'PNG, JPG or WEBP · max {mb} MB. Shown on the public page candidates see.',
    pt: 'PNG, JPG ou WEBP · máximo {mb} MB. Aparecem na página pública que os candidatos veem.'
  },
  'Logo': { en: 'Logo', pt: 'Logótipo' },
  'Foto': { en: 'Photo', pt: 'Fotografia' },
  'Elegir imagen': { en: 'Choose image', pt: 'Escolher imagem' },
  'PNG, JPG o WEBP': { en: 'PNG, JPG or WEBP', pt: 'PNG, JPG ou WEBP' },
  'Logo actual': { en: 'Current logo', pt: 'Logótipo atual' },
  'Eliminar logo': { en: 'Remove logo', pt: 'Eliminar logótipo' },
  'Foto actual': { en: 'Current photo', pt: 'Fotografia atual' },
  'Eliminar foto': { en: 'Remove photo', pt: 'Eliminar fotografia' },
  'Tu slug': { en: 'Your slug', pt: 'O teu slug' },
  'identificador único de tu negocio en la plataforma.': {
    en: 'your business’s unique identifier on the platform.',
    pt: 'identificador único do teu negócio na plataforma.'
  },
  'Contacta con soporte si necesitas cambiarlo: cambiarlo invalidaría tu enlace y los códigos QR que ya hayas impreso.': { en: 'Contact support if you need to change it: changing it would break your link and any QR codes you have already printed.', pt: 'Contacta o suporte se precisares de o mudar: mudá-lo invalidaria o teu link e os códigos QR que já tenhas impresso.' },

  // Configuração
  'Solicitudes de derechos': { en: 'Rights requests', pt: 'Pedidos de direitos' },
  'Guía y plazos de conservación': { en: 'Guide and retention periods', pt: 'Guia e prazos de conservação' },
  '¿Algo no funciona?': { en: 'Something not working?', pt: 'Alguma coisa não funciona?' },
  'Fíchame está en fase de prueba. Cuéntanos errores, dudas o ideas.': {
    en: 'Fíchame is in its trial phase. Tell us about bugs, questions or ideas.',
    pt: 'O Fíchame está em fase de testes. Conta-nos erros, dúvidas ou ideias.'
  },
  'Cuenta de acceso': { en: 'Login account', pt: 'Conta de acesso' },
  'Email actual:': { en: 'Current email:', pt: 'Email atual:' },
  'Entras con Google': { en: 'You sign in with Google', pt: 'Entras com o Google' },
  'Tu cuenta aún no tiene contraseña. Si quieres poder entrar también con email y contraseña, créala desde': {
    en: 'Your account has no password yet. If you also want to sign in with email and password, create one from',
    pt: 'A tua conta ainda não tem palavra-passe. Se quiseres poder entrar também com email e palavra-passe, cria-a a partir de'
  },
  'te enviaremos un enlace a': { en: 'we will send a link to', pt: 'vamos enviar uma ligação para' },
  'Nuevo email de acceso': { en: 'New login email', pt: 'Novo email de acesso' },
  'Déjalo vacío para no cambiarlo': { en: 'Leave empty to keep it', pt: 'Deixa vazio para não o mudar' },
  'Es el email con el que inicias sesión.': { en: 'This is the email you sign in with.', pt: 'É o email com que inicias sessão.' },
  'Cambiar contraseña': { en: 'Change password', pt: 'Mudar palavra-passe' },
  'Contraseña actual': { en: 'Current password', pt: 'Palavra-passe atual' },
  'No disponible en la demostración.': { en: 'Not available in the demo.', pt: 'Não disponível na demonstração.' },
  'Hace falta siempre, también para cambiar solo el email.': {
    en: 'Always required, even to change only the email.',
    pt: 'É sempre necessária, também para mudar só o email.'
  },
  'Mínimo 10 caracteres. Déjalo vacío para no cambiarla. Al cambiarla se cierran tus demás sesiones.': {
    en: 'At least 10 characters. Leave empty to keep it. Changing it signs out your other sessions.',
    pt: 'Mínimo 10 caracteres. Deixa vazio para não a mudar. Ao mudá-la, as tuas outras sessões são terminadas.'
  },
  'Repetir contraseña nueva': { en: 'Repeat new password', pt: 'Repetir nova palavra-passe' },
  'Guardar configuración': { en: 'Save settings', pt: 'Guardar definições' },
  'Tu cuenta está vinculada a Google: puedes entrar con el botón «Continuar con Google».': {
    en: 'Your account is linked to Google: you can sign in with the “Continue with Google” button.',
    pt: 'A tua conta está associada ao Google: podes entrar com o botão «Continuar com o Google».'
  },
  'Desvincular Google': { en: 'Unlink Google', pt: 'Desassociar Google' },
  'Para desvincularla, crea antes una contraseña: si no, no podrías entrar.': {
    en: 'To unlink it, create a password first: otherwise you could not sign in.',
    pt: 'Para a desassociar, cria primeiro uma palavra-passe: caso contrário não conseguirias entrar.'
  },
  'Vincula tu cuenta de Google para entrar sin contraseña.': {
    en: 'Link your Google account to sign in without a password.',
    pt: 'Associa a tua conta Google para entrar sem palavra-passe.'
  },
  'Vincular Google': { en: 'Link Google', pt: 'Associar Google' },

  // Privacidade
  'Privacidad y candidatos': { en: 'Privacy and candidates', pt: 'Privacidade e candidatos' },
  'Cuenta creada. Antes de compartir tu enlace, lee esta página: son 2 minutos.': { en: 'Account created. Before sharing your link, read this page: it takes 2 minutes.', pt: 'Conta criada. Antes de partilhar o teu link, lê esta página: são 2 minutos.' },
  'Falta información obligatoria': { en: 'Required information missing', pt: 'Falta informação obrigatória' },
  'Los candidatos deben saber quién es el responsable de sus datos y cómo contactarlo. Completa la': {
    en: 'Candidates must know who controls their data and how to contact them. Fill in the',
    pt: 'Os candidatos têm de saber quem é o responsável pelos seus dados e como o contactar. Preenche a'
  },
  'razón social': { en: 'legal name', pt: 'denominação social' },
  'email de privacidad': { en: 'privacy email', pt: 'email de privacidade' },
  'Lo esencial, sin jerga': { en: 'The essentials, without jargon', pt: 'O essencial, sem jargão' },
  'Tu negocio es el responsable': { en: 'Your business is the controller', pt: 'O teu negócio é o responsável' },
  'de los datos de quien se candidata ({name}). Fíchame solo guarda y organiza esos datos por ti, siguiendo tus instrucciones.': {
    en: 'of the data of anyone who applies ({name}). Fíchame only stores and organises that data for you, following your instructions.',
    pt: 'pelos dados de quem se candidata ({name}). O Fíchame só guarda e organiza esses dados por ti, seguindo as tuas instruções.'
  },
  'Úsalos solo para seleccionar personal': { en: 'Use it only to recruit staff', pt: 'Usa-os só para recrutar pessoal' },
  'para tu negocio. No los uses para publicidad ni los pases a otros negocios, aunque sean amigos o del mismo grupo: para eso haría falta el consentimiento del candidato.': {
    en: 'for your business. Do not use it for advertising or pass it to other businesses, even friendly ones or ones in the same group: that would require the candidate’s consent.',
    pt: 'para o teu negócio. Não os uses para publicidade nem os passes a outros negócios, mesmo que sejam amigos ou do mesmo grupo: para isso seria preciso o consentimento do candidato.'
  },
  'Decide con criterios del puesto.': { en: 'Decide based on the job’s requirements.', pt: 'Decide com critérios da função.' },
  'Está prohibido discriminar por sexo, edad, origen, nacionalidad, religión, discapacidad, salud, orientación sexual, ideas políticas, afiliación sindical, estado civil o idioma. No preguntes por ello ni lo anotes.': {
    en: 'Discrimination on grounds of sex, age, origin, nationality, religion, disability, health, sexual orientation, political opinions, trade union membership, marital status or language is prohibited. Do not ask about it or write it down.',
    pt: 'É proibido discriminar por sexo, idade, origem, nacionalidade, religião, deficiência, saúde, orientação sexual, ideias políticas, filiação sindical, estado civil ou língua. Não perguntes por isso nem o anotes.'
  },
  'No pidas más datos de los necesarios.': { en: 'Do not ask for more data than necessary.', pt: 'Não peças mais dados do que os necessários.' },
  'DNI/NIE, número de la Seguridad Social o cuenta bancaria se piden': {
    en: 'ID card/NIE, Social Security number or bank account are requested',
    pt: 'DNI/NIE, número da Segurança Social ou conta bancária pedem-se'
  },
  'al contratar': { en: 'when hiring', pt: 'ao contratar' },
  ', en tu proceso de alta, no en la candidatura.': {
    en: ', in your onboarding process, not in the application.',
    pt: ', no teu processo de admissão, não na candidatura.'
  },
  'No guardes los datos para siempre.': { en: 'Do not keep data forever.', pt: 'Não guardes os dados para sempre.' },
  'Fíchame borra automáticamente según los plazos de abajo. Si descargas un CV, bórralo también de tu dispositivo cuando ya no lo necesites.': {
    en: 'Fíchame deletes automatically according to the periods below. If you download a CV, also delete it from your device when you no longer need it.',
    pt: 'O Fíchame apaga automaticamente segundo os prazos abaixo. Se descarregares um CV, apaga-o também do teu dispositivo quando já não precisares dele.'
  },
  'Responde a los derechos en un mes.': { en: 'Respond to rights requests within a month.', pt: 'Responde aos pedidos de direitos no prazo de um mês.' },
  'Las solicitudes llegan a': { en: 'Requests arrive in', pt: 'Os pedidos chegam a' },
  'Tienes herramientas para exportar y suprimir los datos de un candidato desde su ficha.': {
    en: 'You have tools to export and erase a candidate’s data from their profile.',
    pt: 'Tens ferramentas para exportar e suprimir os dados de um candidato a partir da sua ficha.'
  },
  'Protege el acceso.': { en: 'Protect access.', pt: 'Protege o acesso.' },
  'No compartas tu contraseña. Si sospechas que alguien ha entrado en tu cuenta o ves algo raro, cambia la contraseña y avisa a Fíchame enseguida: puede ser una brecha de datos que tienes que valorar en 72 horas.': {
    en: 'Do not share your password. If you suspect someone has accessed your account or you notice anything odd, change your password and tell Fíchame straight away: it may be a data breach you must assess within 72 hours.',
    pt: 'Não partilhes a tua palavra-passe. Se suspeitares que alguém entrou na tua conta ou vires algo estranho, muda a palavra-passe e avisa o Fíchame de imediato: pode ser uma violação de dados que tens de avaliar em 72 horas.'
  },
  'Esto es un resumen práctico, no asesoramiento jurídico. El detalle está en los': {
    en: 'This is a practical summary, not legal advice. The details are in the',
    pt: 'Isto é um resumo prático, não aconselhamento jurídico. O detalhe está nos'
  },
  'aceptados el {date}, versión {version}': { en: 'accepted on {date}, version {version}', pt: 'aceites a {date}, versão {version}' },
  'Plazos de conservación': { en: 'Retention periods', pt: 'Prazos de conservação' },
  'Fíchame borra automáticamente las candidaturas (con su CV, notas e historial) cuando vence el plazo. Los valores por defecto son una propuesta técnica:': {
    en: 'Fíchame automatically deletes applications (with their CV, notes and history) when the period expires. The default values are a technical proposal:',
    pt: 'O Fíchame apaga automaticamente as candidaturas (com o CV, notas e histórico) quando o prazo termina. Os valores por defeito são uma proposta técnica:'
  },
  'confírmalos con tu asesor': { en: 'confirm them with your adviser', pt: 'confirma-os com o teu consultor' },
  'Si un caso concreto exige conservar datos (por ejemplo, una reclamación), usa el bloqueo en la ficha del candidato.': {
    en: 'If a specific case requires keeping data (for example, a complaint), use the hold on the candidate’s profile.',
    pt: 'Se um caso concreto exigir conservar dados (por exemplo, uma reclamação), usa o bloqueio na ficha do candidato.'
  },
  'Proceso abierto sin ninguna actividad (días, 30–365)': {
    en: 'Open process with no activity (days, 30–365)',
    pt: 'Processo aberto sem qualquer atividade (dias, 30–365)'
  },
  'Proceso terminado: contratado o descartado (días, 1–365)': {
    en: 'Finished process: hired or rejected (days, 1–365)',
    pt: 'Processo terminado: contratado ou excluído (dias, 1–365)'
  },
  'Si contratas a alguien, lleva sus datos a tu gestión de personal: Fíchame no es un sistema de nóminas ni de expedientes.': {
    en: 'If you hire someone, move their data to your HR records: Fíchame is not a payroll or personnel file system.',
    pt: 'Se contratares alguém, passa os seus dados para a tua gestão de pessoal: o Fíchame não é um sistema de salários nem de processos individuais.'
  },
  'Futuras oportunidades, con consentimiento (días, 30–730)': {
    en: 'Future opportunities, with consent (days, 30–730)',
    pt: 'Oportunidades futuras, com consentimento (dias, 30–730)'
  },
  'Se informa al candidato de este plazo antes de que dé su consentimiento.': {
    en: 'The candidate is told about this period before giving consent.',
    pt: 'O candidato é informado deste prazo antes de dar o seu consentimento.'
  },
  'Guardar plazos': { en: 'Save periods', pt: 'Guardar prazos' },

  // Direitos
  'Acceso': { en: 'Access', pt: 'Acesso' },
  'Rectificación': { en: 'Rectification', pt: 'Retificação' },
  'Supresión': { en: 'Erasure', pt: 'Apagamento' },
  'Limitación': { en: 'Restriction', pt: 'Limitação' },
  'Portabilidad': { en: 'Portability', pt: 'Portabilidade' },
  'Retirada del consentimiento': { en: 'Withdrawal of consent', pt: 'Retirada do consentimento' },
  'Otra consulta': { en: 'Other enquiry', pt: 'Outra questão' },
  'Recibida': { en: 'Received', pt: 'Recebida' },
  'En curso': { en: 'In progress', pt: 'Em curso' },
  'Resuelta': { en: 'Resolved', pt: 'Resolvida' },
  'Denegada': { en: 'Refused', pt: 'Recusada' },
  'Guía de privacidad': { en: 'Privacy guide', pt: 'Guia de privacidade' },
  'Las personas que se candidatan pueden pedir acceso, rectificación, supresión, oposición, limitación, portabilidad o retirar su consentimiento.': {
    en: 'People who apply can request access, rectification, erasure, objection, restriction, portability or withdraw their consent.',
    pt: 'As pessoas que se candidatam podem pedir acesso, retificação, apagamento, oposição, limitação, portabilidade ou retirar o seu consentimento.'
  },
  'Tienes un mes para responder': { en: 'You have one month to respond', pt: 'Tens um mês para responder' },
  '(ampliable dos meses en casos complejos, avisando al interesado). Responde siempre al email que figura en la candidatura; si el email de la solicitud no coincide con ninguna candidatura, pide una verificación razonable antes de entregar datos. Para acceso/portabilidad usa «Exportar datos» en la ficha; para supresión, «Suprimir datos del candidato».': {
    en: '(extendable by two months in complex cases, letting the person know). Always reply to the email on the application; if the request email does not match any application, ask for reasonable verification before handing over data. For access/portability use “Export data” on the profile; for erasure, “Erase candidate data”.',
    pt: '(prorrogável por dois meses em casos complexos, avisando o titular). Responde sempre para o email que consta da candidatura; se o email do pedido não coincidir com nenhuma candidatura, pede uma verificação razoável antes de entregar dados. Para acesso/portabilidade usa «Exportar dados» na ficha; para apagamento, «Suprimir dados do candidato».'
  },
  'No hay solicitudes.': { en: 'No requests.', pt: 'Não há pedidos.' },
  'De:': { en: 'From:', pt: 'De:' },
  'Plazo:': { en: 'Deadline:', pt: 'Prazo:' },
  'prorrogado': { en: 'extended', pt: 'prorrogado' },
  'VENCIDO': { en: 'OVERDUE', pt: 'EXPIRADO' },
  'Ninguna candidatura con este email en tu negocio.': {
    en: 'No application with this email at your business.',
    pt: 'Nenhuma candidatura com este email no teu negócio.'
  },
  'Candidaturas con este email:': { en: 'Applications with this email:', pt: 'Candidaturas com este email:' },
  'sin puesto': { en: 'no position', pt: 'sem função' },
  'Nota interna (qué se hizo)': { en: 'Internal note (what was done)', pt: 'Nota interna (o que foi feito)' },
  'Prorrogar 2 meses (solo si es complejo; debes informar al interesado dentro del primer mes).': {
    en: 'Extend by 2 months (only if complex; you must inform the person within the first month).',
    pt: 'Prorrogar 2 meses (só se for complexo; tens de informar o titular dentro do primeiro mês).'
  },

  // Termos
  'Hemos actualizado los términos': { en: 'We have updated the terms', pt: 'Atualizámos os termos' },
  'Hay una nueva versión de los': { en: 'There is a new version of the', pt: 'Há uma nova versão dos' },
  'versión {version}': { en: 'version {version}', pt: 'versão {version}' },
  'Esto es lo que cambia:': { en: 'This is what changes (in Spanish, the official version):', pt: 'Isto é o que muda (em espanhol, a versão oficial):' },
  'He leído y acepto la nueva versión de los': { en: 'I have read and accept the new version of the', pt: 'Li e aceito a nova versão dos' },
  'Si no estás de acuerdo, puedes darte de baja escribiendo a {email}. Antes del cierre puedes pedir una copia de los datos de tus candidatos.': {
    en: 'If you do not agree, you can close your account by writing to {email}. Before closing, you can request a copy of your candidates’ data.',
    pt: 'Se não concordares, podes cancelar a conta escrevendo para {email}. Antes do encerramento podes pedir uma cópia dos dados dos teus candidatos.'
  },
  'Tienes aceptada la versión vigente de los': { en: 'You have accepted the current version of the', pt: 'Tens aceite a versão em vigor dos' },
  'desde el {date}': { en: 'since {date}', pt: 'desde {date}' },
  'Si los cambiamos, te avisaremos aquí y por email con al menos 30 días de antelación.': {
    en: 'If we change them, we will let you know here and by email at least 30 days in advance.',
    pt: 'Se os mudarmos, avisamos-te aqui e por email com pelo menos 30 dias de antecedência.'
  },

  // Reportar um problema
  'Fíchame está en fase de prueba. Si algo no funciona, no se entiende o echas algo en falta, cuéntanoslo: lo leemos todo.': {
    en: 'Fíchame is in its trial phase. If something does not work, is unclear or is missing, tell us: we read everything.',
    pt: 'O Fíchame está em fase de testes. Se algo não funciona, não se percebe ou sentes falta de alguma coisa, conta-nos: lemos tudo.'
  },
  '¿Qué quieres contarnos?': { en: 'What would you like to tell us?', pt: 'O que nos queres contar?' },
  '¿Qué ha pasado?': { en: 'What happened?', pt: 'O que aconteceu?' },
  'Ej.: al guardar una vacante me sale un error. Estaba usando el móvil.': {
    en: 'E.g. I get an error when saving an opening. I was using my phone.',
    pt: 'Ex.: ao guardar uma vaga aparece-me um erro. Estava a usar o telemóvel.'
  },
  'No incluyas datos de candidatos': { en: 'Do not include candidate data', pt: 'Não incluas dados de candidatos' },
  'Ni nombres, ni teléfonos, ni emails, ni contenido de los CV. Para ayudarte basta con describir lo que hacías.': {
    en: 'No names, phone numbers, emails or CV content. To help you, it is enough to describe what you were doing.',
    pt: 'Nem nomes, nem telefones, nem emails, nem conteúdo dos CV. Para te ajudarmos basta descreveres o que estavas a fazer.'
  },
  'Se adjunta automáticamente:': { en: 'Automatically attached:', pt: 'Anexado automaticamente:' },
  'la página': { en: 'the page', pt: 'a página' },
  'el código de error': { en: 'the error code', pt: 'o código de erro' },
  'Enviar reporte': { en: 'Send report', pt: 'Enviar relatório' },
  'Tus reportes': { en: 'Your reports', pt: 'Os teus relatórios' },
  'Algo no funciona': { en: 'Something is not working', pt: 'Algo não funciona' },
  'Una sugerencia': { en: 'A suggestion', pt: 'Uma sugestão' },
  'Tengo una duda': { en: 'I have a question', pt: 'Tenho uma dúvida' },
  'Recibido': { en: 'Received', pt: 'Recebido' },
  'En revisión': { en: 'Under review', pt: 'Em análise' },
  'Resuelto': { en: 'Resolved', pt: 'Resolvido' }
};

'use strict';

/* Traduções das páginas de entrada (login, registo, recuperação de senha),
 * da página pública do negócio (NFC), da confirmação de envio e do
 * formulário de direitos. Inclui as mensagens que src/routes/auth.js e
 * src/routes/public.js passam às views. Os textos legais (camadas de
 * privacidade, consentimentos, aceitação dos termos) ficam em espanhol. */

module.exports = {
  // Campos e botões comuns
  'Email': { en: 'Email', pt: 'Email' },
  'Contraseña': { en: 'Password', pt: 'Palavra-passe' },
  'Repetir contraseña': { en: 'Repeat password', pt: 'Repetir palavra-passe' },
  '(mínimo {n} caracteres)': { en: '(at least {n} characters)', pt: '(mínimo {n} caracteres)' },
  '(opcional)': { en: '(optional)', pt: '(opcional)' },
  'Selecciona…': { en: 'Select…', pt: 'Seleciona…' },
  'Enviar solicitud': { en: 'Send request', pt: 'Enviar pedido' },
  'Volver a la página': { en: 'Back to the page', pt: 'Voltar à página' },
  'Ejercer mis derechos': { en: 'Exercise my rights', pt: 'Exercer os meus direitos' },
  'Iniciar sesión': { en: 'Log in', pt: 'Iniciar sessão' },
  'Inicia sesión': { en: 'Log in', pt: 'Inicia sessão' },
  'o con tu email': { en: 'or with your email', pt: 'ou com o teu email' },

  // Login
  'Candidaturas por NFC para cualquier negocio': { en: 'NFC job applications for any business', pt: 'Candidaturas por NFC para qualquer negócio' },
  'Contraseña restablecida. Por seguridad, se han cerrado todas tus sesiones: inicia sesión de nuevo.': {
    en: 'Password reset. For security, all your sessions have been closed: please log in again.',
    pt: 'Palavra-passe redefinida. Por segurança, todas as tuas sessões foram terminadas: inicia sessão novamente.'
  },
  'Continuar con Google': { en: 'Continue with Google', pt: 'Continuar com o Google' },
  'Entrar': { en: 'Log in', pt: 'Entrar' },
  '¿Has olvidado tu contraseña?': { en: 'Forgot your password?', pt: 'Esqueceste-te da palavra-passe?' },
  '¿Todavía no tienes cuenta?': { en: "Don't have an account yet?", pt: 'Ainda não tens conta?' },
  'Registra tu establecimiento': { en: 'Register your business', pt: 'Regista o teu estabelecimento' },

  // Registo
  'Registro': { en: 'Sign up', pt: 'Registo' },
  'Crea la página de candidaturas de tu establecimiento': { en: "Create your business's job application page", pt: 'Cria a página de candidaturas do teu estabelecimento' },
  'Cuenta de Google verificada:': { en: 'Google account verified:', pt: 'Conta Google verificada:' },
  'Completa los datos de tu negocio para terminar.': { en: "Fill in your business details to finish.", pt: 'Preenche os dados do teu negócio para terminar.' },
  'Después podrás usar tu URL exclusiva en la etiqueta NFC.': { en: 'You can then use your unique URL on the NFC tag.', pt: 'Depois poderás usar o teu URL exclusivo na etiqueta NFC.' },
  'Registrarse con Google': { en: 'Sign up with Google', pt: 'Registar com o Google' },
  'Nombre del establecimiento': { en: 'Business name', pt: 'Nome do estabelecimento' },
  'Nombre comercial': { en: 'Trading name', pt: 'Nome comercial' },
  '(si es diferente)': { en: '(if different)', pt: '(se for diferente)' },
  'Es el nombre que verán los candidatos en la página de la etiqueta NFC.': {
    en: 'This is the name candidates will see on the NFC tag page.',
    pt: 'É o nome que os candidatos vão ver na página da etiqueta NFC.'
  },
  'Tipo de establecimiento': { en: 'Type of business', pt: 'Tipo de estabelecimento' },
  'Razón social o nombre del titular': { en: 'Legal name or owner name', pt: 'Denominação social ou nome do titular' },
  'La empresa o persona autónoma titular del negocio. Se muestra a los candidatos como': {
    en: 'The company or self-employed person who owns the business. It is shown to candidates as the',
    pt: 'A empresa ou trabalhador independente titular do negócio. É mostrado aos candidatos como'
  },
  'responsable del tratamiento': { en: 'data controller', pt: 'responsável pelo tratamento' },
  'de sus datos (art. 13 RGPD).': { en: 'of their data (art. 13 GDPR).', pt: 'dos seus dados (art. 13.º RGPD).' },
  'Nombre de la persona de contacto': { en: 'Contact person name', pt: 'Nome da pessoa de contacto' },
  'Dirección': { en: 'Address', pt: 'Morada' },
  'Código postal': { en: 'Postcode', pt: 'Código postal' },
  'Ciudad': { en: 'City', pt: 'Cidade' },
  'Descripción breve': { en: 'Short description', pt: 'Descrição breve' },
  'Ej.: Cocina mediterránea en el centro de Madrid. Buscamos equipo con ganas de aprender.': {
    en: 'E.g.: Mediterranean cuisine in central Madrid. We are looking for people keen to learn.',
    pt: 'Ex.: Cozinha mediterrânica no centro de Madrid. Procuramos equipa com vontade de aprender.'
  },
  'Se muestra en la página pública de tu etiqueta NFC.': { en: 'Shown on the public page of your NFC tag.', pt: 'Aparece na página pública da tua etiqueta NFC.' },
  'Antes de crear la cuenta': { en: 'Before creating your account', pt: 'Antes de criares a conta' },
  'Tu negocio será el': { en: 'Your business will be the', pt: 'O teu negócio será o' },
  'de los datos de las personas que se candidaten. Fíchame trata esos datos solo por tu cuenta y siguiendo tus instrucciones': {
    en: 'for the data of the people who apply. Fíchame processes that data only on your behalf and following your instructions',
    pt: 'dos dados das pessoas que se candidatarem. O Fíchame trata esses dados apenas por tua conta e segundo as tuas instruções'
  },
  'encargado del tratamiento': { en: 'data processor', pt: 'subcontratante' },
  'Fíchame no selecciona candidatos ni decide por ti.': { en: 'Fíchame does not select candidates or decide for you.', pt: 'O Fíchame não seleciona candidatos nem decide por ti.' },
  'Crear cuenta': { en: 'Create account', pt: 'Criar conta' },
  '¿Ya tienes cuenta?': { en: 'Already have an account?', pt: 'Já tens conta?' },

  // Recuperação de senha
  'Recuperar contraseña': { en: 'Recover password', pt: 'Recuperar palavra-passe' },
  'Si no lo recibes en unos minutos, revisa la carpeta de spam.': { en: "If it doesn't arrive in a few minutes, check your spam folder.", pt: 'Se não o receberes dentro de alguns minutos, verifica a pasta de spam.' },
  'Indica el email de tu cuenta. Avisaremos al equipo de Fíchame, que te enviará un enlace para elegir una contraseña nueva.': {
    en: "Enter your account email. We'll let the Fíchame team know, and they'll send you a link to choose a new password.",
    pt: 'Indica o email da tua conta. Vamos avisar a equipa do Fíchame, que te enviará um link para escolheres uma nova palavra-passe.'
  },
  'Indica el email de tu cuenta. Si existe, te enviaremos un enlace de un solo uso que caduca en 30 minutos.': {
    en: "Enter your account email. If it exists, we'll send you a one-time link that expires in 30 minutes.",
    pt: 'Indica o email da tua conta. Se existir, vamos enviar-te um link de utilização única que expira em 30 minutos.'
  },
  'Enviar enlace': { en: 'Send link', pt: 'Enviar link' },
  'Volver a iniciar sesión': { en: 'Back to log in', pt: 'Voltar a iniciar sessão' },
  'Nueva contraseña': { en: 'New password', pt: 'Nova palavra-passe' },
  'Elige una contraseña nueva': { en: 'Choose a new password', pt: 'Escolhe uma nova palavra-passe' },
  'Código del enlace': { en: 'Link code', pt: 'Código do link' },
  'Se rellena solo al abrir el enlace del email.': { en: 'Filled in automatically when you open the link in the email.', pt: 'É preenchido automaticamente ao abrires o link do email.' },
  'Contraseña nueva': { en: 'New password', pt: 'Nova palavra-passe' },
  'Guardar contraseña': { en: 'Save password', pt: 'Guardar palavra-passe' },
  'Solicitar un enlace nuevo': { en: 'Request a new link', pt: 'Pedir um novo link' },

  // Mensagens de src/routes/auth.js
  'Recarga la página e inténtalo de nuevo.': { en: 'Reload the page and try again.', pt: 'Recarrega a página e tenta novamente.' },
  'Sesión no válida': { en: 'Invalid session', pt: 'Sessão inválida' },
  'La contraseña debe tener al menos 10 caracteres.': { en: 'The password must be at least 10 characters long.', pt: 'A palavra-passe deve ter pelo menos 10 caracteres.' },
  'Esa contraseña es demasiado común. Elige otra.': { en: 'That password is too common. Choose another one.', pt: 'Essa palavra-passe é demasiado comum. Escolhe outra.' },
  'La contraseña no debe contener tu email.': { en: 'The password must not contain your email.', pt: 'A palavra-passe não deve conter o teu email.' },
  'La contraseña es demasiado simple.': { en: 'The password is too simple.', pt: 'A palavra-passe é demasiado simples.' },
  'Indica el nombre del establecimiento.': { en: 'Enter the business name.', pt: 'Indica o nome do estabelecimento.' },
  'Indica la razón social o el nombre del titular del negocio.': { en: "Enter the legal name or the business owner's name.", pt: 'Indica a denominação social ou o nome do titular do negócio.' },
  'Indica el responsable.': { en: 'Enter the contact person.', pt: 'Indica o responsável.' },
  'Indica un email válido.': { en: 'Enter a valid email.', pt: 'Indica um email válido.' },
  'Indica un teléfono válido.': { en: 'Enter a valid phone number.', pt: 'Indica um telefone válido.' },
  'Indica la ciudad.': { en: 'Enter the city.', pt: 'Indica a cidade.' },
  'El código postal debe tener 5 dígitos (ej.: 28013).': { en: 'The postcode must have 5 digits (e.g. 28013).', pt: 'O código postal deve ter 5 dígitos (ex.: 28013).' },
  'Selecciona el tipo de establecimiento.': { en: 'Select the type of business.', pt: 'Seleciona o tipo de estabelecimento.' },
  'Las contraseñas no coinciden.': { en: "The passwords don't match.", pt: 'As palavras-passe não coincidem.' },
  'Debes aceptar los Términos y el Acuerdo de encargo del tratamiento.': {
    en: 'You must accept the Terms and the Data Processing Agreement.',
    pt: 'Tens de aceitar os Termos e o Acordo de subcontratação do tratamento.'
  },
  'No se pudo crear la cuenta con este email. Si ya tienes cuenta, inicia sesión o recupera tu contraseña.': {
    en: "We couldn't create the account with this email. If you already have an account, log in or recover your password.",
    pt: 'Não foi possível criar a conta com este email. Se já tens conta, inicia sessão ou recupera a tua palavra-passe.'
  },
  'No se pudo crear la cuenta. Inténtalo de nuevo.': { en: "We couldn't create the account. Please try again.", pt: 'Não foi possível criar a conta. Tenta novamente.' },
  'Página no encontrada': { en: 'Page not found', pt: 'Página não encontrada' },
  'No se pudo iniciar sesión con Google. Inténtalo de nuevo.': { en: "We couldn't log you in with Google. Please try again.", pt: 'Não foi possível iniciar sessão com o Google. Tenta novamente.' },
  'Las cuentas de administración no pueden usar Google.': { en: 'Admin accounts cannot use Google.', pt: 'As contas de administração não podem usar o Google.' },
  'Esa cuenta de Google ya está vinculada a otra cuenta de Fíchame.': { en: 'That Google account is already linked to another Fíchame account.', pt: 'Essa conta Google já está associada a outra conta do Fíchame.' },
  'Cuenta de Google vinculada.': { en: 'Google account linked.', pt: 'Conta Google associada.' },
  'Ya existe una cuenta con este email. Inicia sesión con tu contraseña y vincula Google desde Configuración.': {
    en: 'An account with this email already exists. Log in with your password and link Google from Settings.',
    pt: 'Já existe uma conta com este email. Inicia sessão com a tua palavra-passe e associa o Google em Configurações.'
  },
  'Las cuentas de administración entran con contraseña.': { en: 'Admin accounts log in with a password.', pt: 'As contas de administração entram com palavra-passe.' },
  'Tu cuenta ha sido bloqueada.': { en: 'Your account has been blocked.', pt: 'A tua conta foi bloqueada.' },
  'Demasiados intentos. Espera unos minutos.': { en: 'Too many attempts. Wait a few minutes.', pt: 'Demasiadas tentativas. Espera alguns minutos.' },
  'Demasiados intentos desde esta conexión. Espera unos minutos.': { en: 'Too many attempts from this connection. Wait a few minutes.', pt: 'Demasiadas tentativas a partir desta ligação. Espera alguns minutos.' },
  'Demasiados intentos para esta cuenta. Espera una hora o recupera tu contraseña.': {
    en: 'Too many attempts for this account. Wait an hour or recover your password.',
    pt: 'Demasiadas tentativas para esta conta. Espera uma hora ou recupera a tua palavra-passe.'
  },
  'Email o contraseña incorrectos.': { en: 'Incorrect email or password.', pt: 'Email ou palavra-passe incorretos.' },
  'Operación no válida.': { en: 'Invalid operation.', pt: 'Operação inválida.' },
  'Demasiados accesos a la demo. Espera unos minutos.': { en: 'Too many demo visits. Wait a few minutes.', pt: 'Demasiados acessos à demonstração. Espera alguns minutos.' },
  'Demo no disponible': { en: 'Demo unavailable', pt: 'Demonstração indisponível' },
  'La demostración no está disponible en este momento.': { en: 'The demo is not available right now.', pt: 'A demonstração não está disponível neste momento.' },
  'Si existe una cuenta con ese email, te hemos enviado un enlace para restablecer la contraseña. Caduca en 30 minutos.': {
    en: "If an account with that email exists, we've sent you a link to reset your password. It expires in 30 minutes.",
    pt: 'Se existir uma conta com esse email, enviámos-te um link para redefinires a palavra-passe. Expira em 30 minutos.'
  },
  'Si existe una cuenta con ese email, hemos avisado al equipo de Fíchame. Te enviaremos a ese email un enlace para elegir una contraseña nueva.': {
    en: "If an account with that email exists, we've let the Fíchame team know. We'll send a link to that email so you can choose a new password.",
    pt: 'Se existir uma conta com esse email, avisámos a equipa do Fíchame. Vamos enviar para esse email um link para escolheres uma nova palavra-passe.'
  },
  'El enlace no es válido o ha caducado. Solicita uno nuevo.': { en: 'The link is invalid or has expired. Request a new one.', pt: 'O link não é válido ou expirou. Pede um novo.' },

  // Página pública do negócio
  'Logo de {name}': { en: '{name} logo', pt: 'Logótipo de {name}' },
  'No estamos contratando': { en: "We're not hiring", pt: 'Não estamos a contratar' },
  'Vacantes abiertas': { en: 'Open positions', pt: 'Vagas abertas' },
  'Puedes elegir una en el formulario, o dejarlo sin especificar.': { en: 'You can choose one in the form, or leave it unspecified.', pt: 'Podes escolher uma no formulário, ou deixar sem especificar.' },
  'Envía tu candidatura': { en: 'Send your application', pt: 'Envia a tua candidatura' },
  'Menos de 2 minutos. Solo necesitas tus datos y tu CV en PDF. No hace falta crear ninguna cuenta.': {
    en: 'Less than 2 minutes. You only need your details and your CV as a PDF. No account needed.',
    pt: 'Menos de 2 minutos. Só precisas dos teus dados e do teu CV em PDF. Não é preciso criar conta.'
  },
  'Tus datos': { en: 'Your details', pt: 'Os teus dados' },
  'Apellidos': { en: 'Last name', pt: 'Apelidos' },
  'Número de teléfono': { en: 'Phone number', pt: 'Número de telefone' },
  'El puesto': { en: 'The position', pt: 'O posto' },
  'Puesto al que aspiras': { en: 'Position you are applying for', pt: 'Posto a que te candidatas' },
  'No especifico / cualquiera': { en: 'Not specified / any', pt: 'Não especifico / qualquer um' },
  '¿Qué puesto?': { en: 'Which position?', pt: 'Que posto?' },
  'Ej.: 2 años de atención al cliente en…': { en: 'E.g.: 2 years of customer service at…', pt: 'Ex.: 2 anos de atendimento ao cliente em…' },
  'Observaciones': { en: 'Comments', pt: 'Observações' },
  'Ej.: puedo incorporarme en dos semanas.': { en: 'E.g.: I can start in two weeks.', pt: 'Ex.: posso começar daqui a duas semanas.' },
  'Comparte solo lo necesario para el puesto.': { en: 'Share only what the position needs.', pt: 'Partilha só o necessário para o posto.' },
  'No hace falta —ni en el formulario ni en el CV— tu DNI/NIE, fecha de nacimiento, nacionalidad, estado civil, fotografía, ni datos sobre salud, discapacidad, religión, ideas políticas, afiliación sindical, origen étnico u orientación sexual. Si tu CV los incluye, puedes quitarlos antes de enviarlo.': {
    en: 'There is no need — in the form or in your CV — for your ID number, date of birth, nationality, marital status, photo, or any data about health, disability, religion, political opinions, trade union membership, ethnic origin or sexual orientation. If your CV includes them, you can remove them before sending it.',
    pt: 'Não é preciso — nem no formulário nem no CV — o teu documento de identificação, data de nascimento, nacionalidade, estado civil, fotografia, nem dados sobre saúde, deficiência, religião, opiniões políticas, filiação sindical, origem étnica ou orientação sexual. Se o teu CV os incluir, podes retirá-los antes de o enviares.'
  },
  'Tu currículum': { en: 'Your CV', pt: 'O teu currículo' },
  'CV en PDF': { en: 'CV as PDF', pt: 'CV em PDF' },
  'Elegir PDF': { en: 'Choose PDF', pt: 'Escolher PDF' },
  'Cambiar archivo': { en: 'Change file', pt: 'Mudar ficheiro' },
  'Toca para buscar tu CV en el móvil': { en: 'Tap to find your CV on your phone', pt: 'Toca para procurar o teu CV no telemóvel' },
  'PDF · máximo {n} MB': { en: 'PDF · max {n} MB', pt: 'PDF · máximo {n} MB' },
  'Protección de datos': { en: 'Data protection', pt: 'Proteção de dados' },
  'Opcional.': { en: 'Optional.', pt: 'Opcional.' },
  'Enviar candidatura': { en: 'Send application', pt: 'Enviar candidatura' },
  'Actualmente no estamos contratando.': { en: "We're not hiring at the moment.", pt: 'De momento não estamos a contratar.' },
  'Puedes volver a consultar más adelante.': { en: 'You can check back later.', pt: 'Podes voltar a consultar mais tarde.' },
  'Actualmente no tenemos vacantes disponibles.': { en: "We don't have any open positions at the moment.", pt: 'De momento não temos vagas disponíveis.' },
  'Déjanos tus datos y te contactaremos cuando haya una oportunidad.': { en: "Leave us your details and we'll contact you when there's an opportunity.", pt: 'Deixa-nos os teus dados e contactamos-te quando houver uma oportunidade.' },
  '¿Quieres que guardemos tu candidatura para futuras oportunidades?': { en: 'Would you like us to keep your application for future opportunities?', pt: 'Queres que guardemos a tua candidatura para oportunidades futuras?' },
  '¿En qué te gustaría trabajar?': { en: 'What would you like to work as?', pt: 'Em que gostarias de trabalhar?' },
  'Ej.: camarero/a o dependiente/a, 2 años de experiencia, disponible por las tardes.': {
    en: 'E.g.: waiter or shop assistant, 2 years of experience, available in the afternoons.',
    pt: 'Ex.: empregado/a de mesa ou de loja, 2 anos de experiência, disponível à tarde.'
  },
  'Opcional. Una frase basta. No incluyas datos personales que no sean necesarios.': {
    en: "Optional. One sentence is enough. Don't include personal data that isn't needed.",
    pt: 'Opcional. Uma frase chega. Não incluas dados pessoais que não sejam necessários.'
  },
  'Guardar mi candidatura': { en: 'Save my application', pt: 'Guardar a minha candidatura' },
  'Información completa y ejercicio de derechos': { en: 'Full information and exercising your rights', pt: 'Informação completa e exercício de direitos' },

  // Confirmação de envio
  'Candidatura enviada': { en: 'Application sent', pt: 'Candidatura enviada' },
  'Gracias por tu interés': { en: 'Thank you for your interest', pt: 'Obrigado pelo teu interesse' },
  '¡Datos guardados correctamente!': { en: 'Details saved successfully!', pt: 'Dados guardados com sucesso!' },
  'Conservaremos tu candidatura para futuras oportunidades laborales y te contactaremos si surge una vacante.': {
    en: "We'll keep your application for future job opportunities and contact you if a position opens up.",
    pt: 'Vamos guardar a tua candidatura para futuras oportunidades de emprego e contactar-te se surgir uma vaga.'
  },
  '¡Candidatura enviada correctamente!': { en: 'Application sent successfully!', pt: 'Candidatura enviada com sucesso!' },
  'El establecimiento ha recibido tus datos y tu CV. Si tu perfil encaja, te contactarán por teléfono o email.': {
    en: "The business has received your details and your CV. If your profile is a good fit, they'll contact you by phone or email.",
    pt: 'O estabelecimento recebeu os teus dados e o teu CV. Se o teu perfil encaixar, vão contactar-te por telefone ou email.'
  },
  'Puedes pedir el acceso, la rectificación o la supresión de tus datos, o retirar el consentimiento de futuras oportunidades, en cualquier momento.': {
    en: 'You can request access to, correction or deletion of your data, or withdraw your consent for future opportunities, at any time.',
    pt: 'Podes pedir o acesso, a retificação ou o apagamento dos teus dados, ou retirar o consentimento para oportunidades futuras, a qualquer momento.'
  },

  // Privacidade do negócio e pedido de direitos
  'Protección de datos de las candidaturas': { en: 'Data protection for applications', pt: 'Proteção de dados das candidaturas' },
  'Solicitud registrada': { en: 'Request registered', pt: 'Pedido registado' },
  'Referencia:': { en: 'Reference:', pt: 'Referência:' },
  'La solicitud se ha enviado al establecimiento, que es quien decide sobre tus datos. Debe responderte en el plazo de': {
    en: 'The request has been sent to the business, which is the one that decides about your data. It must reply within',
    pt: 'O pedido foi enviado ao estabelecimento, que é quem decide sobre os teus dados. Deve responder-te no prazo de'
  },
  'un mes': { en: 'one month', pt: 'um mês' },
  '(ampliable dos meses más en casos complejos, avisándote). Te contestará al email que has indicado; para proteger tus datos, puede pedirte que confirmes tu identidad.': {
    en: "(extendable by two more months in complex cases, letting you know). They'll reply to the email you provided; to protect your data, they may ask you to confirm your identity.",
    pt: '(prorrogável por mais dois meses em casos complexos, avisando-te). Vai responder-te para o email que indicaste; para proteger os teus dados, pode pedir-te que confirmes a tua identidade.'
  },
  'Si no recibes respuesta, puedes reclamar ante la Agencia Española de Protección de Datos (aepd.es).': {
    en: "If you don't get a reply, you can file a complaint with the Spanish Data Protection Agency (aepd.es).",
    pt: 'Se não receberes resposta, podes reclamar junto da Agência Espanhola de Proteção de Dados (aepd.es).'
  },
  'Información sobre el tratamiento de tus datos': { en: 'Information about how your data is processed', pt: 'Informação sobre o tratamento dos teus dados' },
  'Versión del texto:': { en: 'Text version:', pt: 'Versão do texto:' },
  'La solicitud llega al establecimiento, que debe responderte en un mes. Usa el mismo email con el que enviaste la candidatura: así pueden encontrar tus datos.': {
    en: 'The request goes to the business, which must reply within one month. Use the same email you applied with, so they can find your data.',
    pt: 'O pedido chega ao estabelecimento, que deve responder-te no prazo de um mês. Usa o mesmo email com que enviaste a candidatura: assim podem encontrar os teus dados.'
  },
  '¿Qué quieres solicitar?': { en: 'What would you like to request?', pt: 'O que queres pedir?' },
  'Email con el que te candidataste': { en: 'Email you applied with', pt: 'Email com que te candidataste' },
  'Detalles': { en: 'Details', pt: 'Detalhes' },
  'Ej.: quiero que corrijan mi teléfono.': { en: 'E.g.: I want my phone number corrected.', pt: 'Ex.: quero que corrijam o meu telefone.' },
  'No incluyas documentos de identidad ni datos sensibles.': { en: "Don't include ID documents or sensitive data.", pt: 'Não incluas documentos de identificação nem dados sensíveis.' },

  // Tipos de pedido de direitos (RIGHTS_KINDS em src/routes/public.js)
  'Acceso — saber qué datos míos se conservan': { en: 'Access — find out what data of mine is kept', pt: 'Acesso — saber que dados meus são conservados' },
  'Rectificación — corregir datos incorrectos': { en: 'Rectification — correct inaccurate data', pt: 'Retificação — corrigir dados incorretos' },
  'Supresión — que se borren mis datos y mi CV': { en: 'Erasure — delete my data and my CV', pt: 'Apagamento — que apaguem os meus dados e o meu CV' },
  'Oposición': { en: 'Objection', pt: 'Oposição' },
  'Limitación del tratamiento': { en: 'Restriction of processing', pt: 'Limitação do tratamento' },
  'Portabilidad — recibir una copia de mis datos': { en: 'Portability — receive a copy of my data', pt: 'Portabilidade — receber uma cópia dos meus dados' },
  'Retirar el consentimiento de futuras oportunidades': { en: 'Withdraw consent for future opportunities', pt: 'Retirar o consentimento para oportunidades futuras' },
  'Otra consulta sobre mis datos': { en: 'Other question about my data', pt: 'Outra questão sobre os meus dados' },

  // Mensagens de src/routes/public.js
  'Establecimiento no encontrado': { en: 'Business not found', pt: 'Estabelecimento não encontrado' },
  'No encontramos este establecimiento. Comprueba el enlace de la etiqueta NFC.': {
    en: "We couldn't find this business. Check the NFC tag link.",
    pt: 'Não encontrámos este estabelecimento. Verifica o link da etiqueta NFC.'
  },
  'Enlace no válido.': { en: 'Invalid link.', pt: 'Link inválido.' },
  'Has enviado demasiadas candidaturas desde este dispositivo. Inténtalo más tarde.': {
    en: "You've sent too many applications from this device. Try again later.",
    pt: 'Enviaste demasiadas candidaturas a partir deste dispositivo. Tenta mais tarde.'
  },
  'Has enviado demasiadas candidaturas desde esta conexión. Inténtalo más tarde.': {
    en: "You've sent too many applications from this connection. Try again later.",
    pt: 'Enviaste demasiadas candidaturas a partir desta ligação. Tenta mais tarde.'
  },
  'La sesión ha caducado. Vuelve a abrir la página e inténtalo de nuevo.': {
    en: 'Your session has expired. Open the page again and try again.',
    pt: 'A sessão expirou. Volta a abrir a página e tenta novamente.'
  },
  'Indica tu nombre.': { en: 'Enter your name.', pt: 'Indica o teu nome.' },
  'Indica el puesto al que aspiras.': { en: 'Enter the position you are applying for.', pt: 'Indica o posto a que te candidatas.' },
  'Puesto no disponible.': { en: 'Position not available.', pt: 'Posto não disponível.' },
  'El archivo supera el límite de {n} MB.': { en: 'The file exceeds the {n} MB limit.', pt: 'O ficheiro ultrapassa o limite de {n} MB.' },
  'Revisa los campos marcados en rojo.': { en: 'Check the fields marked in red.', pt: 'Revê os campos assinalados a vermelho.' },
  'Por seguridad, el navegador no guarda el archivo: vuelve a adjuntar tu CV.': {
    en: 'For security, the browser does not keep the file: attach your CV again.',
    pt: 'Por segurança, o browser não guarda o ficheiro: volta a anexar o teu CV.'
  },
  'Los campos con * son obligatorios.': { en: 'Fields marked * are required.', pt: 'Os campos com * são obrigatórios.' },
  'Enviando tu CV…': { en: 'Sending your CV…', pt: 'A enviar o teu CV…' },
  'Enviando…': { en: 'Sending…', pt: 'A enviar…' },
  'Envía tu candidatura en menos de 2 minutos, desde el móvil y sin crear ninguna cuenta.': {
    en: 'Apply in under 2 minutes from your phone, no account needed.',
    pt: 'Envia a tua candidatura em menos de 2 minutos, pelo telemóvel e sem criar conta.'
  },
  'Solo se aceptan archivos PDF.': { en: 'Only PDF files are accepted.', pt: 'Só são aceites ficheiros PDF.' },
  'Adjunta tu currículum en PDF.': { en: 'Attach your CV as a PDF.', pt: 'Anexa o teu currículo em PDF.' },
  'El PDF contiene elementos activos (scripts, adjuntos o formularios) que no se aceptan. Expórtalo de nuevo como PDF simple.': {
    en: 'The PDF contains active elements (scripts, attachments or forms) that are not accepted. Export it again as a plain PDF.',
    pt: 'O PDF contém elementos ativos (scripts, anexos ou formulários) que não são aceites. Exporta-o novamente como PDF simples.'
  },
  'El PDF parece incompleto o dañado. Vuelve a exportarlo e inténtalo de nuevo.': {
    en: 'The PDF seems incomplete or damaged. Export it again and try again.',
    pt: 'O PDF parece incompleto ou danificado. Volta a exportá-lo e tenta novamente.'
  },
  'El archivo no es un PDF válido.': { en: 'The file is not a valid PDF.', pt: 'O ficheiro não é um PDF válido.' },
  'No se pudo guardar el archivo. Inténtalo de nuevo.': { en: "We couldn't save the file. Please try again.", pt: 'Não foi possível guardar o ficheiro. Tenta novamente.' },
  'No se pudo enviar la candidatura. Inténtalo de nuevo.': { en: "We couldn't send the application. Please try again.", pt: 'Não foi possível enviar a candidatura. Tenta novamente.' },
  'Demasiadas solicitudes. Inténtalo más tarde.': { en: 'Too many requests. Try again later.', pt: 'Demasiados pedidos. Tenta mais tarde.' },
  'Vuelve a abrir la página e inténtalo de nuevo.': { en: 'Open the page again and try again.', pt: 'Volta a abrir a página e tenta novamente.' },
  'Para guardar tus datos necesitamos que marques la casilla de futuras oportunidades.': {
    en: 'To save your details, you need to tick the future opportunities box.',
    pt: 'Para guardarmos os teus dados, precisas de marcar a caixa de oportunidades futuras.'
  },
  'No se pudo guardar. Inténtalo de nuevo.': { en: "We couldn't save it. Please try again.", pt: 'Não foi possível guardar. Tenta novamente.' },
  'Vuelve a abrir la página.': { en: 'Open the page again.', pt: 'Volta a abrir a página.' },
  'Selecciona el tipo de solicitud.': { en: 'Select the type of request.', pt: 'Seleciona o tipo de pedido.' },
  'Indica el email con el que te candidataste.': { en: 'Enter the email you applied with.', pt: 'Indica o email com que te candidataste.' }
};

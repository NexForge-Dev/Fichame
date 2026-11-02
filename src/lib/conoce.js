'use strict';

/* Texto da página de apresentação (/conoce), em espanhol, inglês e português.
 *
 * É a página para onde aponta o QR dos cartões que o admin entrega aos
 * estabelecimentos (Admin → Divulgación). Quem a abre não conhece o produto:
 * cada secção responde a uma pergunta, pela ordem em que a pessoa a faz.
 *
 * Regra: só descrever o que o produto faz hoje. Sem IA, sem matching, sem
 * publicação em portais de emprego, sem agendamento de entrevistas, sem
 * mensagens automáticas. «Entrevista» é um estado da candidatura, não uma
 * agenda. Ao acrescentar uma frase aqui, confirmar primeiro no painel.
 */

const LANGS = ['es', 'en', 'pt'];

/* ?lang= explícito ganha; senão o idioma do site (req.lang, do middleware
 * i18n: cookie do seletor ou língua do browser). Por omissão espanhol: os
 * cartões são entregues em Espanha. */
function pickLang(req) {
  const q = String((req.query && req.query.lang) || '').toLowerCase();
  if (LANGS.includes(q)) return q;
  return LANGS.includes(req.lang) ? req.lang : 'es';
}

const es = {
  htmlLang: 'es',
  title: 'Contrata a la persona adecuada sin perder candidatos — gratis',
  description: 'Gratis durante la prueba de mercado: recibe a tus candidatos, ve su CV y organiza tus contrataciones en un solo lugar, sin departamento de RR. HH.',
  nav: { login: 'Entrar', start: 'Empezar gratis', langLabel: 'Idioma' },

  hero: {
    badge: 'Prueba de mercado · 100 % gratis',
    title: 'Encuentra a tu próximo empleado',
    titleHl: 'sin perder tiempo ni candidatos.',
    lead: 'Cuando te falta alguien en el negocio, cada día cuenta. Fíchame reúne en un solo lugar a todos los que quieren trabajar contigo: ves sus datos y su CV, los organizas y eliges a la persona adecuada. Sin departamento de Recursos Humanos y sin pagar nada.',
    cta: 'Empezar gratis',
    cta2: 'Ver cómo funciona',
    note: 'Gratis durante la prueba de mercado · Sin tarjeta · Sin permanencia'
  },

  quick: {
    title: 'En pocas palabras',
    items: [
      { q: '¿Qué es?', a: 'Una web para organizar a tus candidatos y tus contrataciones.' },
      { q: '¿Necesito RR. HH.?', a: 'No. Lo puedes llevar tú mismo, desde el móvil.' },
      { q: '¿Hay que instalar algo?', a: 'No. Funciona en el navegador.' },
      { q: '¿Cuánto cuesta?', a: 'Nada: 0 € durante la prueba de mercado, sin tarjeta y sin permanencia.' }
    ]
  },

  problem: {
    kicker: 'El problema',
    title: '¿Cuántos buenos candidatos se te han escapado ya?',
    items: [
      { emoji: '📄', text: 'Recibir currículums' },
      { emoji: '📱', text: 'Contestar mensajes' },
      { emoji: '🗂️', text: 'Ordenar candidatos' },
      { emoji: '📞', text: 'Llamar y quedar para entrevistas' },
      { emoji: '📝', text: 'Tomar notas' },
      { emoji: '⏳', text: 'Recordar en qué punto está cada uno' }
    ],
    scatter: 'Y todo repartido entre papeles, WhatsApp, emails, hojas de cálculo… y tu memoria.',
    pain: 'Mientras buscas aquel CV entre mensajes, el buen candidato acepta otro trabajo. Y el turno que falta lo cubres tú.',
    answer: 'Fíchame pone orden en todo eso, en un solo lugar. Y es gratis.'
  },

  what: {
    kicker: '¿Qué es Fíchame?',
    title: 'Tus contrataciones, ordenadas en un solo sitio.',
    p1: 'Fíchame es una plataforma de reclutamiento pensada para que negocios y pequeños establecimientos organicen sus contrataciones.',
    p2: 'En lugar de llevar a los candidatos en papeles, mensajes y hojas de cálculo sueltas, lo sigues todo dentro de la plataforma.',
    highlight: 'Puedes gestionar a tus candidatos tú mismo. No hace falta tener un equipo de Recursos Humanos para empezar.',
    for: 'Para restaurantes, bares, cafeterías, tiendas, comercios y cualquier negocio que necesite contratar.',
    biz: ['Restaurantes', 'Bares', 'Cafeterías', 'Tiendas', 'Comercios', 'Hoteles', 'Peluquerías', 'Gimnasios', '…y más']
  },

  can: {
    kicker: 'Qué puedes hacer',
    title: 'Todo lo que necesitas para contratar, sin complicaciones.',
    items: [
      {
        icon: 'jobs',
        title: 'Crear vacantes',
        text: 'Cuando necesitas a alguien, creas la vacante con el tipo de contrato, la jornada y los requisitos.',
        chips: ['Camarero/a', 'Dependiente/a', 'Cocinero/a', 'Recepcionista']
      },
      {
        icon: 'people',
        title: 'Recibir candidatos',
        text: 'Tu negocio tiene su propio enlace. Quien quiera trabajar contigo lo abre desde el móvil, elige la vacante y envía sus datos y su CV en PDF, sin crear ninguna cuenta.'
      },
      {
        icon: 'file',
        title: 'Ver a tus candidatos',
        text: 'Cada candidato tiene su ficha: contacto, disponibilidad, experiencia y CV. Sin buscar en mensajes ni en papeles.'
      },
      {
        icon: 'chart',
        title: 'Organizar el proceso',
        text: 'Marca en qué etapa está cada persona y sabrás siempre a quién llamar, a quién entrevistar y a quién guardar para más adelante.',
        pipeline: ['Nuevo', 'Visto', 'Por contactar', 'Entrevista', 'Contratado']
      },
      {
        icon: 'search',
        title: 'Gestionarlo todo en un solo lugar',
        text: 'Busca y filtra, marca favoritos, apunta notas internas y llama, escribe un email o abre WhatsApp desde la ficha.'
      }
    ],
    share: {
      title: '¿Cómo llegan los candidatos?',
      text: 'A través del enlace de tu negocio. Puedes ponerlo en tu local con el código QR que Fíchame te prepara para imprimir, o compartirlo por WhatsApp y redes sociales.',
      note: 'Fíchame no publica tus vacantes en portales de empleo: tú decides dónde compartes tu enlace.'
    }
  },

  nohr: {
    kicker: 'Sin RR. HH.',
    title: '¿No tienes equipo de Recursos Humanos? No pasa nada.',
    lead: 'Fíchame está pensado también para negocios en los que el propio dueño o encargado se ocupa de contratar.',
    start: 'Sin departamento de RR. HH.',
    steps: [
      'Tú creas la vacante',
      'Recibes a los candidatos',
      'Revisas su información',
      'Los organizas por etapas',
      'Eliges quién sigue adelante'
    ],
    end: 'Lo puedes hacer tú solo.'
  },

  how: {
    kicker: 'Cómo funciona',
    title: '¿Cómo funciona?',
    lead: 'Seis pasos, del «necesito a alguien» al «ya tengo a la persona».',
    steps: [
      { title: 'Necesitas contratar', text: 'Te das cuenta de que te hace falta una persona más en tu negocio.' },
      { title: 'Creas la vacante en Fíchame', text: 'Indicas qué puesto buscas, el tipo de contrato, la jornada y los requisitos.' },
      { title: 'Los candidatos se apuntan', text: 'Quien está interesado abre tu enlace, elige la vacante y envía sus datos y su CV.' },
      { title: 'Sigues a tus candidatos', text: 'Todas las candidaturas llegan ordenadas a tu panel. Te avisamos cuando entra una nueva.' },
      { title: 'Valoras y organizas', text: 'Lees el CV, apuntas notas y mueves a cada persona de etapa: revisado, contactar, entrevista…' },
      { title: 'Encuentras a la persona adecuada', text: 'Con toda la información a mano, decides tú quién sigue adelante. Sin filtros automáticos.' }
    ]
  },

  video: {
    kicker: 'Fíchame en la práctica',
    title: 'Mira Fíchame funcionando.',
    lead: 'En un minuto verás cómo funciona, de principio a fin, con la aplicación real.',
    play: 'Ver el vídeo',
    soon: 'Vídeo en preparación',
    soonText: 'Muy pronto podrás ver aquí una grabación de la aplicación paso a paso.',
    chapters: [
      'Crear una vacante',
      'Poner tu QR a la vista',
      'Recibir candidaturas',
      'Ver a los candidatos',
      'Organizar el proceso'
    ],
    unsupported: 'Tu navegador no puede reproducir este vídeo.'
  },

  demo: {
    kicker: 'Pruébalo tú mismo',
    title: 'Entra en un panel de ejemplo.',
    lead: 'Un restaurante ficticio con más de 100 candidaturas inventadas, para que veas el panel por dentro: filtros, estados, notas y CV. Sin registrarte.',
    cta: 'Abrir la demo',
    note: 'Datos de demostración: ninguna persona ni negocio de la demo es real, y los cambios no se guardan.'
  },

  benefits: {
    kicker: 'Ventajas',
    title: '¿Por qué lo necesita tu negocio?',
    items: [
      { icon: 'home', title: 'Ningún candidato se pierde', text: 'Todos los que se apuntan llegan a tu panel con sus datos y su CV. Nada se queda olvidado en un chat.' },
      { icon: 'file', title: 'Menos papel', text: 'Menos currículums impresos y documentos que se pierden.' },
      { icon: 'chart', title: 'Decides antes', text: 'Ves de un vistazo quién es cada candidato y en qué etapa está, para llamar a tiempo a los mejores.' },
      { icon: 'phone', title: 'Desde el móvil', text: 'Lo llevas entre cliente y cliente, sin saltar entre papeles, WhatsApp y hojas de cálculo.' },
      { icon: 'star', title: 'Tú tienes el control', text: 'El dueño o el encargado sigue el proceso directamente.' },
      { icon: 'store', title: 'Sin equipo de RR. HH.', text: 'Un proceso de selección ordenado sin contratar a nadie para gestionarlo.' }
    ]
  },

  free: {
    kicker: 'Precio',
    title: 'Gratis. Sin letra pequeña.',
    p1: 'Fíchame está en fase de prueba de mercado: lo estamos probando con negocios reales para que sea de verdad útil en el día a día.',
    p2: 'Por eso, durante esta fase, lo usas gratis. Tu negocio gana orden y no arriesgas nada.',
    price: '0 €',
    priceLabel: 'Gratis durante la prueba de mercado',
    items: ['Sin cuota mensual', 'Sin tarjeta de crédito', 'Sin compromiso de permanencia'],
    fine: 'No te pedimos ningún dato de pago, así que no hay nada que se pueda cobrar automáticamente.'
  },

  feedback: {
    kicker: 'Tu opinión cuenta',
    title: 'Ayúdanos a mejorar Fíchame.',
    text: 'Estamos construyendo Fíchame a partir de las necesidades reales de quien contrata. Al probarlo y contarnos tu opinión, nos ayudas a entender qué funciona y qué se puede mejorar.',
    cta: 'Probar Fíchame',
    mail: 'Escríbenos'
  },

  faq: {
    kicker: 'Dudas frecuentes',
    title: 'Lo que suelen preguntarnos',
    items: [
      { q: '¿Es difícil de usar?', a: 'No. Está pensado para usarse desde el móvil, entre cliente y cliente. Crear la cuenta y la primera vacante lleva pocos minutos, y el panel te guía con unos primeros pasos.' },
      { q: '¿Tengo que instalar algo?', a: 'No. Ni tú ni los candidatos tenéis que instalar ninguna aplicación: todo funciona en el navegador del móvil o del ordenador.' },
      { q: '¿Y si ya no necesito contratar?', a: 'Pausas las candidaturas con un botón. Tu página mostrará que no estás contratando y podrás reactivarla cuando quieras.' },
      { q: '¿Quién ve los CV de mis candidatos?', a: 'Solo tú, desde tu panel. Los CV no tienen enlaces públicos y ningún otro negocio puede ver tus candidaturas.' }
    ]
  },

  final: {
    title: 'Tu próxima contratación puede empezar hoy.',
    lead: 'Crea tu cuenta gratis, prepara tu primera vacante en pocos minutos y comparte tu enlace para empezar a recibir candidatos.',
    cta: 'Empezar gratis',
    login: 'Ya tengo cuenta',
    note: 'Gratis durante la prueba de mercado. Sin tarjeta de crédito.'
  }
};

const en = {
  htmlLang: 'en',
  title: 'Hire the right person without losing candidates — free',
  description: 'Free during the market test: receive your candidates, see their CV and organise your hiring in one place, without an HR department.',
  nav: { login: 'Log in', start: 'Start free', langLabel: 'Language' },

  hero: {
    badge: 'Market test · 100% free',
    title: 'Find your next employee',
    titleHl: 'without losing time or candidates.',
    lead: 'When you’re short-staffed, every day counts. Fíchame gathers everyone who wants to work with you in one place: you see their details and CV, organise them and pick the right person. No HR department, and nothing to pay.',
    cta: 'Start free',
    cta2: 'See how it works',
    note: 'Free during the market test · No card · No commitment'
  },

  quick: {
    title: 'In a nutshell',
    items: [
      { q: 'What is it?', a: 'A web app to organise your candidates and your hiring.' },
      { q: 'Do I need HR?', a: 'No. You can run it yourself, from your phone.' },
      { q: 'Do I need to install anything?', a: 'No. It works in the browser.' },
      { q: 'How much does it cost?', a: 'Nothing: €0 during the market test, no card and no commitment.' }
    ]
  },

  problem: {
    kicker: 'The problem',
    title: 'How many good candidates have you already lost?',
    items: [
      { emoji: '📄', text: 'Collecting CVs' },
      { emoji: '📱', text: 'Answering messages' },
      { emoji: '🗂️', text: 'Sorting candidates' },
      { emoji: '📞', text: 'Calling and arranging interviews' },
      { emoji: '📝', text: 'Taking notes' },
      { emoji: '⏳', text: 'Remembering where everyone is' }
    ],
    scatter: 'And all of it spread across paper, WhatsApp, emails, spreadsheets… and your memory.',
    pain: 'While you dig for that CV in your messages, the good candidate takes another job. And you end up covering the missing shift yourself.',
    answer: 'Fíchame puts all of that in order, in one place. And it’s free.'
  },

  what: {
    kicker: 'What is Fíchame?',
    title: 'Your hiring, organised in one place.',
    p1: 'Fíchame is a recruitment platform built to help businesses and small venues organise their hiring.',
    p2: 'Instead of tracking candidates across loose papers, messages and spreadsheets, you follow everything inside the platform.',
    highlight: 'You can manage your candidates yourself. You don’t need an HR team to get started.',
    for: 'For restaurants, bars, cafés, shops and any business that needs to hire.',
    biz: ['Restaurants', 'Bars', 'Cafés', 'Shops', 'Retail', 'Hotels', 'Hair salons', 'Gyms', '…and more']
  },

  can: {
    kicker: 'What you can do',
    title: 'Everything you need to hire, without the hassle.',
    items: [
      {
        icon: 'jobs',
        title: 'Create job openings',
        text: 'When you need someone, you create the opening with the contract type, hours and requirements.',
        chips: ['Waiter', 'Shop assistant', 'Cook', 'Receptionist']
      },
      {
        icon: 'people',
        title: 'Receive candidates',
        text: 'Your business has its own link. Anyone who wants to work with you opens it on their phone, picks the opening and sends their details and CV as a PDF, without creating an account.'
      },
      {
        icon: 'file',
        title: 'See your candidates',
        text: 'Each candidate has a profile: contact details, availability, experience and CV. No digging through messages or paper.'
      },
      {
        icon: 'chart',
        title: 'Organise the process',
        text: 'Mark which stage each person is at, so you always know who to call, who to interview and who to keep for later.',
        pipeline: ['New', 'Seen', 'To contact', 'Interview', 'Hired']
      },
      {
        icon: 'search',
        title: 'Manage it all in one place',
        text: 'Search and filter, star favourites, keep private notes, and call, email or open WhatsApp straight from the profile.'
      }
    ],
    share: {
      title: 'How do candidates reach you?',
      text: 'Through your business link. You can put it in your venue with the printable QR code Fíchame prepares for you, or share it on WhatsApp and social media.',
      note: 'Fíchame does not post your openings on job boards: you decide where to share your link.'
    }
  },

  nohr: {
    kicker: 'No HR',
    title: 'No HR team? No problem.',
    lead: 'Fíchame is also designed for businesses where the owner or manager does the hiring.',
    start: 'No HR department',
    steps: [
      'You create the opening',
      'You receive candidates',
      'You review their details',
      'You organise them by stage',
      'You choose who moves forward'
    ],
    end: 'You can do it on your own.'
  },

  how: {
    kicker: 'How it works',
    title: 'How does it work?',
    lead: 'Six steps, from “I need someone” to “I’ve found the right person”.',
    steps: [
      { title: 'You need to hire', text: 'You realise your business needs one more person.' },
      { title: 'You create the opening in Fíchame', text: 'You say which role you’re looking for, the contract type, hours and requirements.' },
      { title: 'Candidates apply', text: 'Interested people open your link, pick the opening and send their details and CV.' },
      { title: 'You follow your candidates', text: 'Every application lands in your dashboard, in order. We let you know when a new one arrives.' },
      { title: 'You review and organise', text: 'You read the CV, add notes and move each person through the stages: reviewed, to contact, interview…' },
      { title: 'You find the right person', text: 'With all the information at hand, you decide who moves forward. No automatic filters.' }
    ]
  },

  video: {
    kicker: 'Fíchame in practice',
    title: 'See Fíchame in action.',
    lead: 'In one minute you’ll see how it works from start to finish, using the real app.',
    play: 'Play the video',
    soon: 'Video coming soon',
    soonText: 'You’ll soon be able to watch a step-by-step recording of the app here.',
    chapters: [
      'Creating an opening',
      'Putting up your QR code',
      'Receiving applications',
      'Viewing candidates',
      'Organising the process'
    ],
    unsupported: 'Your browser cannot play this video.'
  },

  demo: {
    kicker: 'Try it yourself',
    title: 'Open a sample dashboard.',
    lead: 'A fictional restaurant with over 100 made-up applications, so you can see the dashboard from the inside: filters, statuses, notes and CVs. No sign-up needed.',
    cta: 'Open the demo',
    note: 'Demo data: no person or business in the demo is real, and changes are not saved.'
  },

  benefits: {
    kicker: 'Benefits',
    title: 'Why your business needs it',
    items: [
      { icon: 'home', title: 'No candidate gets lost', text: 'Everyone who applies lands in your dashboard with their details and CV. Nothing gets forgotten in a chat.' },
      { icon: 'file', title: 'Less paper', text: 'Fewer printed CVs and documents that get lost.' },
      { icon: 'chart', title: 'Decide sooner', text: 'See at a glance who each candidate is and which stage they’re at, so you call the best ones in time.' },
      { icon: 'phone', title: 'From your phone', text: 'Run it between customers, without juggling paper, WhatsApp and spreadsheets.' },
      { icon: 'star', title: 'You’re in control', text: 'The owner or manager follows the process directly.' },
      { icon: 'store', title: 'No HR team needed', text: 'An organised hiring process without hiring anyone to run it.' }
    ]
  },

  free: {
    kicker: 'Price',
    title: 'Free. No small print.',
    p1: 'Fíchame is in its market test phase: we’re testing it with real businesses so it’s genuinely useful day to day.',
    p2: 'That’s why, during this phase, you use it for free. Your business gets organised and you risk nothing.',
    price: '€0',
    priceLabel: 'Free during the market test',
    items: ['No monthly fee', 'No credit card', 'No commitment'],
    fine: 'We don’t ask for any payment details, so there is nothing that could be charged automatically.'
  },

  feedback: {
    kicker: 'Your opinion matters',
    title: 'Help us improve Fíchame.',
    text: 'We are building Fíchame around the real needs of people who hire. By trying it and telling us what you think, you help us understand what works and what could be better.',
    cta: 'Try Fíchame',
    mail: 'Email us'
  },

  faq: {
    kicker: 'Common questions',
    title: 'What people usually ask us',
    items: [
      { q: 'Is it hard to use?', a: 'No. It’s designed to be used on your phone, between customers. Creating your account and first opening takes a few minutes, and the dashboard guides you through the first steps.' },
      { q: 'Do I have to install anything?', a: 'No. Neither you nor your candidates need to install an app: everything works in the browser, on a phone or a computer.' },
      { q: 'What if I stop hiring?', a: 'Pause applications with one button. Your page will show you’re not hiring, and you can switch it back on whenever you like.' },
      { q: 'Who can see my candidates’ CVs?', a: 'Only you, from your dashboard. CVs have no public links and no other business can see your applications.' }
    ]
  },

  final: {
    title: 'Your next hire can start today.',
    lead: 'Create your free account, set up your first opening in a few minutes and share your link to start receiving candidates.',
    cta: 'Start free',
    login: 'I already have an account',
    note: 'Free during the market test. No credit card.'
  }
};

const pt = {
  htmlLang: 'pt',
  title: 'Contrata a pessoa certa sem perder candidatos — grátis',
  description: 'Grátis durante o teste de mercado: recebe os teus candidatos, vê o CV deles e organiza as tuas contratações num só lugar, sem departamento de RH.',
  nav: { login: 'Entrar', start: 'Começar grátis', langLabel: 'Idioma' },

  hero: {
    badge: 'Teste de mercado · 100 % grátis',
    title: 'Encontra o teu próximo funcionário',
    titleHl: 'sem perder tempo nem candidatos.',
    lead: 'Quando te falta alguém no negócio, cada dia conta. O Fíchame reúne num só lugar todos os que querem trabalhar contigo: vês os dados e o CV de cada um, organiza-los e escolhes a pessoa certa. Sem departamento de Recursos Humanos e sem pagar nada.',
    cta: 'Começar grátis',
    cta2: 'Ver como funciona',
    note: 'Grátis durante o teste de mercado · Sem cartão · Sem fidelização'
  },

  quick: {
    title: 'Em poucas palavras',
    items: [
      { q: 'O que é?', a: 'Uma web para organizar os teus candidatos e as tuas contratações.' },
      { q: 'Preciso de RH?', a: 'Não. Podes tratar disso tu mesmo, a partir do telemóvel.' },
      { q: 'É preciso instalar alguma coisa?', a: 'Não. Funciona no browser.' },
      { q: 'Quanto custa?', a: 'Nada: 0 € durante o teste de mercado, sem cartão e sem fidelização.' }
    ]
  },

  problem: {
    kicker: 'O problema',
    title: 'Quantos bons candidatos já te escaparam?',
    items: [
      { emoji: '📄', text: 'Receber currículos' },
      { emoji: '📱', text: 'Responder a mensagens' },
      { emoji: '🗂️', text: 'Organizar candidatos' },
      { emoji: '📞', text: 'Ligar e marcar entrevistas' },
      { emoji: '📝', text: 'Tomar notas' },
      { emoji: '⏳', text: 'Lembrar em que ponto está cada um' }
    ],
    scatter: 'E tudo espalhado entre papéis, WhatsApp, emails, folhas de cálculo… e a tua memória.',
    pain: 'Enquanto procuras aquele CV entre as mensagens, o bom candidato aceita outro trabalho. E o turno que falta acabas por fazê-lo tu.',
    answer: 'O Fíchame põe ordem em tudo isso, num só lugar. E é grátis.'
  },

  what: {
    kicker: 'O que é o Fíchame?',
    title: 'As tuas contratações, organizadas num só sítio.',
    p1: 'O Fíchame é uma plataforma de recrutamento pensada para que negócios e pequenos estabelecimentos organizem as suas contratações.',
    p2: 'Em vez de acompanhares os candidatos em papéis, mensagens e folhas de cálculo soltas, segues tudo dentro da plataforma.',
    highlight: 'Podes gerir os teus candidatos tu mesmo. Não é preciso ter uma equipa de Recursos Humanos para começar.',
    for: 'Para restaurantes, bares, cafés, lojas, comércio e qualquer negócio que precise de contratar.',
    biz: ['Restaurantes', 'Bares', 'Cafés', 'Lojas', 'Comércio', 'Hotéis', 'Cabeleireiros', 'Ginásios', '…e mais']
  },

  can: {
    kicker: 'O que podes fazer',
    title: 'Tudo o que precisas para contratar, sem complicações.',
    items: [
      {
        icon: 'jobs',
        title: 'Criar vagas',
        text: 'Quando precisas de alguém, crias a vaga com o tipo de contrato, o horário e os requisitos.',
        chips: ['Empregado/a de mesa', 'Empregado/a de loja', 'Cozinheiro/a', 'Rececionista']
      },
      {
        icon: 'people',
        title: 'Receber candidatos',
        text: 'O teu negócio tem o seu próprio link. Quem quiser trabalhar contigo abre-o no telemóvel, escolhe a vaga e envia os seus dados e o CV em PDF, sem criar nenhuma conta.'
      },
      {
        icon: 'file',
        title: 'Ver os teus candidatos',
        text: 'Cada candidato tem a sua ficha: contacto, disponibilidade, experiência e CV. Sem procurar em mensagens nem em papéis.'
      },
      {
        icon: 'chart',
        title: 'Organizar o processo',
        text: 'Marca em que etapa está cada pessoa e saberás sempre a quem ligar, quem entrevistar e quem guardar para mais tarde.',
        pipeline: ['Novo', 'Visto', 'Por contactar', 'Entrevista', 'Contratado']
      },
      {
        icon: 'search',
        title: 'Gerir tudo num só lugar',
        text: 'Pesquisa e filtra, marca favoritos, escreve notas internas e liga, envia um email ou abre o WhatsApp a partir da ficha.'
      }
    ],
    share: {
      title: 'Como chegam os candidatos?',
      text: 'Através do link do teu negócio. Podes pô-lo no teu espaço com o código QR que o Fíchame te prepara para imprimir, ou partilhá-lo por WhatsApp e nas redes sociais.',
      note: 'O Fíchame não publica as tuas vagas em portais de emprego: és tu que decides onde partilhas o teu link.'
    }
  },

  nohr: {
    kicker: 'Sem RH',
    title: 'Não tens equipa de Recursos Humanos? Não faz mal.',
    lead: 'O Fíchame também foi pensado para negócios em que é o próprio dono ou gerente que trata das contratações.',
    start: 'Sem departamento de RH',
    steps: [
      'Tu crias a vaga',
      'Recebes os candidatos',
      'Revês a informação deles',
      'Organiza-los por etapas',
      'Escolhes quem segue em frente'
    ],
    end: 'Consegues fazê-lo sozinho.'
  },

  how: {
    kicker: 'Como funciona',
    title: 'Como funciona?',
    lead: 'Seis passos, do «preciso de alguém» ao «já tenho a pessoa».',
    steps: [
      { title: 'Precisas de contratar', text: 'Percebes que te faz falta mais uma pessoa no teu negócio.' },
      { title: 'Crias a vaga no Fíchame', text: 'Indicas que função procuras, o tipo de contrato, o horário e os requisitos.' },
      { title: 'Os candidatos inscrevem-se', text: 'Quem estiver interessado abre o teu link, escolhe a vaga e envia os seus dados e o CV.' },
      { title: 'Acompanhas os teus candidatos', text: 'Todas as candidaturas chegam organizadas ao teu painel. Avisamos-te quando entra uma nova.' },
      { title: 'Avalias e organizas', text: 'Lês o CV, escreves notas e passas cada pessoa de etapa: revisto, contactar, entrevista…' },
      { title: 'Encontras a pessoa certa', text: 'Com toda a informação à mão, és tu que decides quem segue em frente. Sem filtros automáticos.' }
    ]
  },

  video: {
    kicker: 'O Fíchame na prática',
    title: 'Vê o Fíchame a funcionar.',
    lead: 'Num minuto vais ver como funciona, do princípio ao fim, com a aplicação real.',
    play: 'Ver o vídeo',
    soon: 'Vídeo em preparação',
    soonText: 'Muito em breve vais poder ver aqui uma gravação da aplicação passo a passo.',
    chapters: [
      'Criar uma vaga',
      'Colocar o teu QR à vista',
      'Receber candidaturas',
      'Ver os candidatos',
      'Organizar o processo'
    ],
    unsupported: 'O teu browser não consegue reproduzir este vídeo.'
  },

  demo: {
    kicker: 'Experimenta tu mesmo',
    title: 'Entra num painel de exemplo.',
    lead: 'Um restaurante fictício com mais de 100 candidaturas inventadas, para veres o painel por dentro: filtros, estados, notas e CV. Sem te registares.',
    cta: 'Abrir a demo',
    note: 'Dados de demonstração: nenhuma pessoa nem negócio da demo é real, e as alterações não são guardadas.'
  },

  benefits: {
    kicker: 'Vantagens',
    title: 'Porque é que o teu negócio precisa disto?',
    items: [
      { icon: 'home', title: 'Nenhum candidato se perde', text: 'Todos os que se inscrevem chegam ao teu painel com os seus dados e o CV. Nada fica esquecido numa conversa.' },
      { icon: 'file', title: 'Menos papel', text: 'Menos currículos impressos e documentos que se perdem.' },
      { icon: 'chart', title: 'Decides mais cedo', text: 'Vês de relance quem é cada candidato e em que etapa está, para ligares a tempo aos melhores.' },
      { icon: 'phone', title: 'A partir do telemóvel', text: 'Tratas disso entre cliente e cliente, sem saltar entre papéis, WhatsApp e folhas de cálculo.' },
      { icon: 'star', title: 'O controlo é teu', text: 'O dono ou o gerente acompanha o processo diretamente.' },
      { icon: 'store', title: 'Sem equipa de RH', text: 'Um processo de seleção organizado sem contratar ninguém para o gerir.' }
    ]
  },

  free: {
    kicker: 'Preço',
    title: 'Grátis. Sem letras pequenas.',
    p1: 'O Fíchame está em fase de teste de mercado: estamos a testá-lo com negócios reais para que seja mesmo útil no dia a dia.',
    p2: 'Por isso, durante esta fase, usas o Fíchame grátis. O teu negócio ganha organização e não arriscas nada.',
    price: '0 €',
    priceLabel: 'Grátis durante o teste de mercado',
    items: ['Sem mensalidade', 'Sem cartão de crédito', 'Sem fidelização'],
    fine: 'Não te pedimos nenhum dado de pagamento, por isso não há nada que possa ser cobrado automaticamente.'
  },

  feedback: {
    kicker: 'A tua opinião conta',
    title: 'Ajuda-nos a melhorar o Fíchame.',
    text: 'Estamos a construir o Fíchame a partir das necessidades reais de quem contrata. Ao experimentá-lo e dares-nos a tua opinião, ajudas-nos a perceber o que funciona e o que pode melhorar.',
    cta: 'Experimentar o Fíchame',
    mail: 'Escreve-nos'
  },

  faq: {
    kicker: 'Dúvidas frequentes',
    title: 'O que costumam perguntar-nos',
    items: [
      { q: 'É difícil de usar?', a: 'Não. Foi pensado para ser usado no telemóvel, entre cliente e cliente. Criar a conta e a primeira vaga leva poucos minutos, e o painel guia-te com uns primeiros passos.' },
      { q: 'Tenho de instalar alguma coisa?', a: 'Não. Nem tu nem os candidatos têm de instalar nenhuma aplicação: tudo funciona no browser do telemóvel ou do computador.' },
      { q: 'E se já não precisar de contratar?', a: 'Pausas as candidaturas com um botão. A tua página vai mostrar que não estás a contratar e podes reativá-la quando quiseres.' },
      { q: 'Quem vê os CV dos meus candidatos?', a: 'Só tu, a partir do teu painel. Os CV não têm links públicos e nenhum outro negócio pode ver as tuas candidaturas.' }
    ]
  },

  final: {
    title: 'A tua próxima contratação pode começar hoje.',
    lead: 'Cria a tua conta grátis, prepara a tua primeira vaga em poucos minutos e partilha o teu link para começares a receber candidatos.',
    cta: 'Começar grátis',
    login: 'Já tenho conta',
    note: 'Grátis durante o teste de mercado. Sem cartão de crédito.'
  }
};

const COPY = { es, en, pt };

module.exports = { LANGS, pickLang, COPY };

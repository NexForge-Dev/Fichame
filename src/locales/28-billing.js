'use strict';

/* Textos da cobrança com Stripe (0014): /panel/plan (views panel/plan.ejs),
 * aviso da prova e do pagamento em flash.ejs, menu e Configuración, e as
 * mensagens ?ok= / ?err= de src/routes/panel.js e src/lib/billing.js.
 * Chave = texto espanhol original. Os preços entram sempre por variável
 * ({price}), vindos de src/lib/pricing.js. */

module.exports = {
  // menu, Configuración
  'Plan y facturación': { en: 'Plan and billing', pt: 'Plano e faturação' },
  'Plan': { en: 'Plan', pt: 'Plano' },
  'Ver mi plan': { en: 'See my plan', pt: 'Ver o meu plano' },

  // panel/plan.ejs — estado atual
  'Tu plan': { en: 'Your plan', pt: 'O teu plano' },
  'Prueba gratis': { en: 'Free trial', pt: 'Experiência grátis' },
  'Pago pendiente': { en: 'Payment pending', pt: 'Pagamento pendente' },
  'Pago sin completar': { en: 'Payment not completed', pt: 'Pagamento por concluir' },
  'Cancelada': { en: 'Cancelled', pt: 'Cancelada' },
  'Pago anual': { en: 'Paid yearly', pt: 'Pagamento anual' },
  'Pago mensual': { en: 'Paid monthly', pt: 'Pagamento mensal' },
  'primer cobro el {date}': { en: 'first charge on {date}', pt: 'primeira cobrança a {date}' },
  'próxima renovación el {date}': { en: 'next renewal on {date}', pt: 'próxima renovação a {date}' },
  'Precio Fundadores garantizado hasta el {date}.': {
    en: 'Founders price guaranteed until {date}.',
    pt: 'Preço Fundadores garantido até {date}.'
  },
  'Tu prueba gratis termina el {date}.': { en: 'Your free trial ends on {date}.', pt: 'A tua experiência grátis termina a {date}.' },
  'Tu prueba gratis terminó el {date}. Puedes seguir usando Fíchame mientras eliges un plan.': {
    en: 'Your free trial ended on {date}. You can keep using Fíchame while you choose a plan.',
    pt: 'A tua experiência grátis terminou a {date}. Podes continuar a usar o Fíchame enquanto escolhes um plano.'
  },
  'No hemos podido cobrar tu suscripción.': {
    en: 'We couldn’t charge your subscription.',
    pt: 'Não conseguimos cobrar a tua subscrição.'
  },
  'Revisa o cambia tu tarjeta en el portal de pagos. Mientras tanto puedes seguir usando Fíchame con normalidad.': {
    en: 'Check or change your card in the billing portal. Meanwhile you can keep using Fíchame as usual.',
    pt: 'Verifica ou muda o teu cartão no portal de pagamentos. Entretanto podes continuar a usar o Fíchame normalmente.'
  },
  'Gestionar suscripción y facturas': { en: 'Manage subscription and invoices', pt: 'Gerir subscrição e faturas' },
  'En el portal de Stripe puedes cambiar entre pago mensual y anual, actualizar la tarjeta, descargar tus facturas o cancelar. La cancelación se aplica al final del periodo ya pagado.': {
    en: 'In the Stripe portal you can switch between monthly and yearly billing, update your card, download your invoices or cancel. Cancellation takes effect at the end of the period already paid.',
    pt: 'No portal da Stripe podes mudar entre pagamento mensal e anual, atualizar o cartão, descarregar as tuas faturas ou cancelar. O cancelamento aplica-se no fim do período já pago.'
  },

  // panel/plan.ejs — escolher plano
  'Elige tu plan': { en: 'Choose your plan', pt: 'Escolhe o teu plano' },
  'El pago online se activará pronto. Mientras tanto puedes seguir usando Fíchame sin coste.': {
    en: 'Online payment will be available soon. Meanwhile you can keep using Fíchame at no cost.',
    pt: 'O pagamento online vai ficar disponível em breve. Entretanto podes continuar a usar o Fíchame sem custo.'
  },
  'Antes de contratar un plan, revisa y acepta los nuevos términos de uso.': {
    en: 'Before choosing a plan, review and accept the new terms of use.',
    pt: 'Antes de contratar um plano, revê e aceita os novos termos de utilização.'
  },
  'Si eliges un plan ahora, no pagarás nada hasta el {date}, cuando termina tu prueba gratis.': {
    en: 'If you choose a plan now, you won’t pay anything until {date}, when your free trial ends.',
    pt: 'Se escolheres um plano agora, não pagas nada até {date}, quando termina a tua experiência grátis.'
  },
  'El primer cobro se hace al confirmar el pago.': {
    en: 'The first charge is made when you confirm the payment.',
    pt: 'A primeira cobrança é feita ao confirmares o pagamento.'
  },
  'Queda {n} plaza.': { en: '{n} spot left.', pt: 'Resta {n} vaga.' },
  'Quedan {n} plazas.': { en: '{n} spots left.', pt: 'Restam {n} vagas.' },
  'Las plazas del plan Fundadores se han agotado.': {
    en: 'All Founders plan spots have been taken.',
    pt: 'As vagas do plano Fundadores esgotaram.'
  },
  'Acepto los Términos y que se cobre {price} + IVA {periodicidad}. Puedo cancelar cuando quiera.': {
    en: 'I accept the Terms and to be charged {price} + VAT {periodicidad}. I can cancel at any time.',
    pt: 'Aceito os Termos e que seja cobrado {price} + IVA {periodicidad}. Posso cancelar quando quiser.'
  },
  'al mes': { en: 'per month', pt: 'por mês' },
  'al año': { en: 'per year', pt: 'por ano' },
  'Elegir Fundadores': { en: 'Choose Founders', pt: 'Escolher Fundadores' },
  'Mensual': { en: 'Monthly', pt: 'Mensal' },
  'Anual': { en: 'Yearly', pt: 'Anual' },
  '/año': { en: '/year', pt: '/ano' },
  'Elegir Profesional mensual': { en: 'Choose Professional monthly', pt: 'Escolher Profissional mensal' },
  'Elegir Profesional anual': { en: 'Choose Professional yearly', pt: 'Escolher Profissional anual' },
  'Precios en euros, IVA no incluido: el IVA se añade en el pago.': {
    en: 'Prices in euros, VAT not included: VAT is added at payment.',
    pt: 'Preços em euros, IVA não incluído: o IVA é acrescentado no pagamento.'
  },
  'El pago se hace en Stripe; Fíchame nunca ve ni guarda los datos de tu tarjeta.': {
    en: 'Payment is made on Stripe; Fíchame never sees or stores your card details.',
    pt: 'O pagamento é feito na Stripe; o Fíchame nunca vê nem guarda os dados do teu cartão.'
  },
  'Leer los Términos': { en: 'Read the Terms', pt: 'Ler os Termos' },

  // partials/flash.ejs
  'Te queda {n} día de prueba gratis. Si eliges ya tu plan (Fundadores desde {price}/mes, IVA no incluido), no pagarás nada hasta que termine la prueba.': {
    en: 'You have {n} day of free trial left. If you choose your plan now (Founders from {price}/month, VAT not included), you won’t pay anything until the trial ends.',
    pt: 'Resta-te {n} dia de experiência grátis. Se escolheres já o teu plano (Fundadores desde {price}/mês, IVA não incluído), não pagas nada até a experiência terminar.'
  },
  'Te quedan {n} días de prueba gratis. Si eliges ya tu plan (Fundadores desde {price}/mes, IVA no incluido), no pagarás nada hasta que termine la prueba.': {
    en: 'You have {n} days of free trial left. If you choose your plan now (Founders from {price}/month, VAT not included), you won’t pay anything until the trial ends.',
    pt: 'Restam-te {n} dias de experiência grátis. Se escolheres já o teu plano (Fundadores desde {price}/mês, IVA não incluído), não pagas nada até a experiência terminar.'
  },
  'Elegir plan': { en: 'Choose plan', pt: 'Escolher plano' },
  'Ver planes': { en: 'See plans', pt: 'Ver planos' },
  'Tu prueba gratuita ha terminado. Puedes seguir usando Fíchame; activa tu plan cuando quieras.': {
    en: 'Your free trial has ended. You can keep using Fíchame; activate your plan whenever you like.',
    pt: 'A tua experiência grátis terminou. Podes continuar a usar o Fíchame; ativa o teu plano quando quiseres.'
  },
  'Revisa tu método de pago': { en: 'Check your payment method', pt: 'Verifica o teu método de pagamento' },

  // src/routes/panel.js e src/lib/billing.js (?ok= / ?err=)
  'Gracias. Estamos confirmando el pago con Stripe: tu plan aparecerá aquí en unos segundos.': {
    en: 'Thank you. We’re confirming the payment with Stripe: your plan will appear here in a few seconds.',
    pt: 'Obrigado. Estamos a confirmar o pagamento com a Stripe: o teu plano aparece aqui dentro de segundos.'
  },
  'El pago online todavía no está disponible.': {
    en: 'Online payment is not available yet.',
    pt: 'O pagamento online ainda não está disponível.'
  },
  'Plan no válido.': { en: 'Invalid plan.', pt: 'Plano inválido.' },
  'Marca la casilla para aceptar los términos y el cobro.': {
    en: 'Tick the box to accept the terms and the charge.',
    pt: 'Marca a caixa para aceitar os termos e a cobrança.'
  },
  'Ya no quedan plazas del plan Fundadores. Puedes elegir el plan Profesional.': {
    en: 'There are no Founders plan spots left. You can choose the Professional plan.',
    pt: 'Já não há vagas do plano Fundadores. Podes escolher o plano Profissional.'
  },
  'No podemos conectar con el sistema de pago en este momento. Inténtalo más tarde.': {
    en: 'We can’t connect to the payment system right now. Please try again later.',
    pt: 'Não conseguimos ligar ao sistema de pagamento neste momento. Tenta mais tarde.'
  },
  'Todavía no tienes ninguna suscripción.': {
    en: 'You don’t have a subscription yet.',
    pt: 'Ainda não tens nenhuma subscrição.'
  },
  'Redirigiendo al pago…': { en: 'Redirecting to payment…', pt: 'A redirecionar para o pagamento…' },
  'Abriendo el portal…': { en: 'Opening the portal…', pt: 'A abrir o portal…' },
  'Hemos recibido tu suscripción y estamos revisando tu plan. Te escribiremos en breve; si tienes dudas, contacta con {email}.': {
    en: 'We have received your subscription and are reviewing your plan. We will write to you shortly; if you have any questions, contact {email}.',
    pt: 'Recebemos a tua subscrição e estamos a rever o teu plano. Vamos escrever-te em breve; se tiveres dúvidas, contacta {email}.'
  }
};

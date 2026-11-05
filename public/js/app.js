document.addEventListener('change', function (e) {
  if (e.target && e.target.id === 'puesto') {
    /* Alterna uma classe em vez de escrever em element.style: mantém a
       decisão visual no CSS, onde está o resto do design. */
    var field = document.getElementById('otro-puesto-field');
    if (field) field.classList.toggle('is-hidden', e.target.value !== 'otro');
  }
  if (e.target && e.target.matches('input[type=file]')) {
    var field = e.target.closest('.field');
    var out = field && field.querySelector('[data-file-name]');
    if (out) {
      var f = e.target.files && e.target.files[0];
      out.textContent = f ? f.name : '';
      out.classList.toggle('is-shown', Boolean(f));
    }
    /* Botão próprio (.file-pick): o texto nativo do input vem na língua do
       browser e não pode ser traduzido, por isso o input fica escondido. */
    var pick = e.target.closest('.file-pick');
    if (pick) {
      var has = Boolean(e.target.files && e.target.files[0]);
      pick.classList.toggle('has-file', has);
      var action = pick.querySelector('[data-file-action]');
      if (action) action.textContent = action.getAttribute(has ? 'data-change' : 'data-empty');
    }
  }
});

document.addEventListener('click', function (e) {
  var btn = e.target.closest('[data-copy]');
  if (!btn) return;
  var text = btn.getAttribute('data-copy');
  var done = function () {
    /* innerHTML: o botão pode ter um ícone. */
    var old = btn.innerHTML;
    btn.textContent = { en: 'Copied!', pt: 'Copiado!' }[document.documentElement.lang] || '¡Copiado!';
    btn.classList.add('is-done');
    setTimeout(function () { btn.innerHTML = old; btn.classList.remove('is-done'); }, 1600);
  };
  if (navigator.clipboard && navigator.clipboard.writeText) {
    navigator.clipboard.writeText(text).then(done).catch(done);
  } else {
    var ta = document.createElement('textarea');
    ta.value = text;
    document.body.appendChild(ta);
    ta.select();
    try { document.execCommand('copy'); } catch (err) { /* ignora */ }
    document.body.removeChild(ta);
    done();
  }
});

/* Recuperação de senha: o token vem no fragmento (#t=…), que o browser não
   envia ao servidor. Copia-o para o formulário e limpa-o da barra de
   endereço (não fica no histórico). */
(function () {
  var input = document.querySelector('[data-reset-token]');
  if (!input) return;
  var m = /(?:^#|&)t=([a-f0-9]{64})/.exec(window.location.hash || '');
  if (m) {
    input.value = m[1];
    if (window.history && window.history.replaceState) {
      window.history.replaceState(null, '', window.location.pathname);
    }
  }
})();

/* Balão de feedback: <details> já abre e fecha sozinho; aqui só o Esc e o
   clique fora, com o foco devolvido ao botão. */
(function () {
  var box = document.querySelector('[data-feedback]');
  if (!box) return;
  var toggle = box.querySelector('summary');
  box.addEventListener('toggle', function () {
    if (box.open) box.querySelector('input[name=tipo]').focus();
  });
  document.addEventListener('keydown', function (e) {
    if (e.key === 'Escape' && box.open) {
      box.open = false;
      toggle.focus();
    }
  });
  document.addEventListener('click', function (e) {
    if (box.open && !box.contains(e.target)) box.open = false;
  });
})();

/* Botão «Imprimir» da página do QR — sem onclick inline por causa do CSP. */
document.addEventListener('click', function (e) {
  if (e.target.closest('[data-print]')) window.print();
});

/* Guia de primeiros passos: «Abrir página» abre noutro separador. Ao voltar
   a este, recarrega para o passo aparecer como concluído. */
(function () {
  var opened = false;
  document.addEventListener('click', function (e) {
    if (e.target.closest('[data-refresh-on-return]')) opened = true;
  });
  document.addEventListener('visibilitychange', function () {
    if (opened && document.visibilityState === 'visible') window.location.reload();
  });
})();

/* Vídeo da página de apresentação (/conoce): a capa é um botão por cima do
   <video preload="none">. Nada é descarregado até a pessoa carregar no play
   — importante para quem abre a página com dados móveis. */
document.addEventListener('click', function (e) {
  var cover = e.target.closest('[data-video-play]');
  if (!cover) return;
  var box = cover.closest('[data-video]');
  var video = box && box.querySelector('video');
  if (!video) return;
  box.classList.add('is-playing');
  var p = video.play();
  if (p && p.catch) p.catch(function () { /* o utilizador usa os controlos */ });
  video.focus();
});

/* CV acima do limite: avisa logo ao escolher o ficheiro, antes de um upload
   que o servidor (ou a Vercel, acima de 4,5 MB) ia recusar. O
   setCustomValidity impede o envio até se escolher outro ficheiro. */
document.addEventListener('change', function (e) {
  var input = e.target;
  if (!input || !input.matches || !input.matches('input[type=file][data-max-bytes]')) return;
  var f = input.files && input.files[0];
  var max = Number(input.getAttribute('data-max-bytes'));
  var tooBig = Boolean(f && max && f.size > max);
  var msg = tooBig ? input.getAttribute('data-too-big') : '';
  input.setCustomValidity(msg);
  var field = input.closest('.field');
  var out = field && field.querySelector('[data-file-error]');
  if (out) {
    out.textContent = msg;
    out.classList.toggle('is-hidden', !tooBig);
  }
});

/* Envio: desativa o botão e mostra «Enviando…». Com um CV em 4G o envio
   demora vários segundos; sem isto a pessoa toca outra vez (o browser
   recomeça o upload) ou desiste. O evento submit só dispara depois de a
   validação do browser passar. */
document.addEventListener('submit', function (e) {
  var form = e.target;
  if (!form || !form.hasAttribute('data-busy')) return;
  var btn = form.querySelector('button[type=submit]');
  if (!btn) return;
  if (btn.disabled) { e.preventDefault(); return; }
  btn.setAttribute('data-label', btn.innerHTML);
  btn.textContent = form.getAttribute('data-busy');
  /* Desativar só depois de o browser ter recolhido os dados do formulário. */
  form.busyTimer = setTimeout(function () { btn.disabled = true; btn.setAttribute('aria-busy', 'true'); }, 0);
});

function releaseBusyButton(btn) {
  btn.disabled = false;
  btn.removeAttribute('aria-busy');
  if (btn.hasAttribute('data-label')) btn.innerHTML = btn.getAttribute('data-label');
}

/* Voltar atrás para a página (bfcache) não pode deixar o botão preso. */
window.addEventListener('pageshow', function () {
  document.querySelectorAll('form[data-busy] button[aria-busy]').forEach(releaseBusyButton);
});

/* Candidatura com CV: envio por XHR para mostrar a percentagem real. Com
   400 kbps um CV de 4 MB demora mais de um minuto. Se a rede falhar, o
   formulário fica como estava, com os dados e o ficheiro. Sem JS, o POST
   normal continua a funcionar. Corre depois do tratamento de data-busy. */
document.addEventListener('submit', function (e) {
  var form = e.target;
  if (e.defaultPrevented || !form || !form.hasAttribute('data-upload')) return;
  var bar = form.querySelector('[data-upload-progress]');
  var failed = form.querySelector('[data-upload-failed]');
  var btn = form.querySelector('button[type=submit]');
  if (!bar || !failed || !btn || !window.FormData) return;
  e.preventDefault();

  var body = new FormData(form);
  /* O FormData já recolheu os dados: desativa-se já. O temporizador de cima
     podia voltar a desativar o botão depois de uma falha imediata, e um duplo
     toque antes dele enviava o CV duas vezes. */
  clearTimeout(form.busyTimer);
  btn.disabled = true;
  btn.setAttribute('aria-busy', 'true');

  var label = form.getAttribute('data-busy');
  var action = form.action.split('#')[0];
  var xhr = new XMLHttpRequest();
  var giveUp = function (message) {
    bar.hidden = true;
    bar.value = 0;
    releaseBusyButton(btn);
    failed.textContent = message;
    failed.classList.remove('is-hidden');
  };
  var networkError = function () { giveUp(form.getAttribute('data-network-error')); };
  var httpError = function () { giveUp(form.getAttribute('data-http-error')); };

  /* 403: o token caducou com o formulário aberto. Um token novo, pedido à
     própria página, deixa repetir sem perder os dados nem o ficheiro. Se voltar
     a dar 403 pouco depois de renovar (a sessão anónima dura 2 h), o browser
     não está a guardar o cookie: renovar outra vez seria dizer uma falsidade. */
  var renewToken = function () {
    if (form.tokenRenewedAt && Date.now() - form.tokenRenewedAt < 3600000) {
      giveUp(form.getAttribute('data-cookies-needed'));
      return;
    }
    var page = new XMLHttpRequest();
    page.open('GET', action.replace(/\/apply$/, ''));
    page.timeout = 15000;
    page.onload = function () {
      var fresh = page.status === 200 && new DOMParser().parseFromString(page.responseText, 'text/html').querySelector('input[name=_csrf]');
      if (!fresh) { httpError(); return; }
      form.querySelector('input[name=_csrf]').value = fresh.value;
      form.tokenRenewedAt = Date.now();
      giveUp(form.getAttribute('data-session-renewed'));
    };
    page.onerror = httpError;
    page.ontimeout = httpError;
    page.onabort = httpError;
    page.send();
  };

  xhr.open('POST', action);
  bar.hidden = false;
  failed.classList.add('is-hidden');
  xhr.upload.onprogress = function (ev) {
    if (!ev.lengthComputable) return;
    var pct = Math.round((ev.loaded / ev.total) * 100);
    bar.value = pct;
    btn.textContent = label + ' ' + pct + ' %';
  };
  xhr.onload = function () {
    /* Redirecionamento (enviado, ou voltar à página com ?err=): segue-o. */
    if (xhr.responseURL && xhr.responseURL.split('#')[0] !== action) {
      window.location.assign(xhr.responseURL);
      return;
    }
    if (xhr.status === 403) { renewToken(); return; }
    /* Só a nossa página do formulário com os erros substitui esta. Qualquer
       outra resposta (5xx, 413, a página de erro da Vercel) apagaria os dados
       sem deixar sequer o Voltar para os recuperar. */
    if (xhr.status !== 422 || xhr.responseText.indexOf('data-upload-progress') === -1) { httpError(); return; }
    document.open();
    document.write(xhr.responseText);
    document.close();
    var top = document.getElementById('enviar');
    if (top) top.scrollIntoView();
  };
  xhr.onerror = networkError;
  xhr.ontimeout = networkError;
  xhr.onabort = networkError;
  xhr.send(body);
});

/* Página que é resposta a um POST: a entrada do histórico passa a ser o URL
   normal. Sem isto, voltar atrás a partir da confirmação dava ERR_CACHE_MISS
   (as páginas são no-store e um POST não se repete). */
(function () {
  var el = document.querySelector('[data-replace-url]');
  if (el && window.history && window.history.replaceState) {
    window.history.replaceState(null, '', el.getAttribute('data-replace-url') + window.location.hash);
  }
})();

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
  setTimeout(function () { btn.disabled = true; btn.setAttribute('aria-busy', 'true'); }, 0);
});

/* Voltar atrás para a página (bfcache) não pode deixar o botão preso. */
window.addEventListener('pageshow', function () {
  document.querySelectorAll('form[data-busy] button[aria-busy]').forEach(function (btn) {
    btn.disabled = false;
    btn.removeAttribute('aria-busy');
    if (btn.hasAttribute('data-label')) btn.innerHTML = btn.getAttribute('data-label');
  });
});

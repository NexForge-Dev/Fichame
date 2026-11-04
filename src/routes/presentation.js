'use strict';

const express = require('express');
const fs = require('fs');
const path = require('path');

const config = require('../config');
const { copyFor, pickLang } = require('../lib/conoce');
const { translate } = require('../lib/i18n');

const router = express.Router();

/* Vídeo de demonstração (gravação da própria aplicação). Basta colocar o
 * ficheiro em public/video/ — sem ele, a página mostra o espaço reservado
 * «Vídeo en preparación». Verificado a cada pedido para que copiar o ficheiro
 * não exija reiniciar o servidor; o mtime entra no URL porque os estáticos
 * têm cache longa. Opcionalmente, um vídeo próprio para a versão inglesa
 * (o português usa o espanhol). */
const VIDEO_DIR = path.join(__dirname, '..', '..', 'public', 'video');

function demoVideo(lang) {
  const names = lang === 'en' ? ['fichame-demo-en.mp4', 'fichame-demo.mp4'] : ['fichame-demo.mp4'];
  for (const name of names) {
    try {
      const st = fs.statSync(path.join(VIDEO_DIR, name));
      if (st.isFile() && st.size > 0) {
        return { src: `/video/${name}?v=${Math.floor(st.mtimeMs)}` };
      }
    } catch { /* ficheiro ausente: tenta o seguinte */ }
  }
  return null;
}

/* Página pública de apresentação: é o destino estável do QR dos cartões
 * (Admin → Divulgación). O URL não deve mudar — os cartões já impressos
 * continuam a funcionar quando o conteúdo for atualizado.
 *
 * Ao contrário de «/», não redireciona quem tem sessão: o admin precisa de
 * ver a página que está a distribuir. Não renderiza nenhum QR. */
router.get('/conoce', (req, res) => {
  const lang = pickLang(req);
  res.setHeader('Vary', 'Accept-Language, Cookie');
  res.render('public/conoce', {
    t: copyFor(lang, config.billingEnabled),
    lang,
    // ?lang= pode diferir do idioma do site: o rodapé segue a página.
    tr: (text, vars) => translate(lang, text, vars),
    video: demoVideo(lang),
    contactEmail: config.contactEmail
  });
});

module.exports = router;

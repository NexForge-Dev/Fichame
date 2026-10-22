# Fíchame

**Candidaturas por NFC para qualquer negócio em Espanha — restaurantes, lojas, hotéis, cabeleireiros, ginásios…**

O candidato aproxima o telemóvel da etiqueta NFC do estabelecimento, abre a página do negócio, preenche o formulário e envia o CV em PDF. A candidatura aparece no painel do restaurante, onde o dono a organiza, contacta o candidato e acompanha o processo até à contratação.

```
Etiqueta NFC → /r/:slug → formulário + CV (PDF) → painel do restaurante → Nuevo … Contratado
```

A etiqueta **não é programada pelo sistema**: o Fíchame fornece a URL e o dono grava-a na tag com qualquer app de escrita NFC (ex.: NFC Tools).

> 🎨 Logo e cores da marca: [`brand/`](brand/README.md)
>
> 📄 Documentação técnica completa (rotas, fluxos, modelo de dados, segurança, testes): [`docs/DOCUMENTACAO.md`](docs/DOCUMENTACAO.md)
>
> ⚖️ Auditoria jurídica e de segurança (2026-10): [`docs/legal/`](docs/legal/00-legal-review-required.md) (em espanhol, para o assessor jurídico) e [`docs/security/`](docs/security/production-compliance-gate.md)

---

## Funcionalidades

**Candidato** — sem conta, mobile-first, em espanhol
- Página pública `/r/:slug` com logo, descrição e estado de contratação (🟢 / 🔴).
- Formulário com vaga, disponibilidade, experiência e CV em PDF validado.
- Minimização: sem documento de identidade, data de nascimento, nacionalidade nem foto; aviso para não incluir dados sensíveis.
- Informação por camadas (responsável, finalidade, base jurídica 6.1.b, conservação, direitos) antes de enviar; 2.ª camada em `/r/:slug/privacidad`.
- Consentimento **opcional** e específico do negócio para futuras oportunidades (texto exato, versão, data, retirada).
- Canal de exercício de direitos (`/r/:slug/privacidad#derechos`) que chega ao painel do negócio com prazo de 1 mês.
- Com as candidaturas em pausa: formulário para guardar dados para futuras oportunidades.

**Restaurante** — painel `/panel`
- Métricas, caixa «Necesita atención» e pipeline visual com 8 estados.
- Pesquisa livre, filtros (estado, vaga, disponibilidade, datas), favoritos e ordenação.
- Perfil do candidato com CV, notas internas, histórico e atalhos `tel:`, `mailto:` e WhatsApp.
- Vacantes: criar, editar, ativar/desativar e eliminar.
- Pausar/ativar candidaturas **sem mexer na etiqueta NFC**.
- Código QR da mesma URL, pronto a imprimir ou descarregar em PNG (`/panel/qr`).
- Notificações no painel e por email (SMTP opcional).

**Landing page** — `/`
- Apresenta o produto aos donos de negócios: como funciona, funcionalidades, privacidade e FAQ.
- As maquetas do formulário e do painel são HTML/CSS (sem imagens), por isso seguem o modo escuro.

**Página de apresentação** — `/conoce`
- Destino do QR impresso nos cartões entregues aos estabelecimentos: explica do zero o que é o Fíchame, como funciona, que não é preciso RH e que é gratuito durante a prova de mercado.
- Espanhol por omissão, inglês com `?lang=en` (ou se o browser estiver em inglês). Texto em `src/lib/conoce.js` — só descreve o que o produto faz hoje.
- **Vídeo:** `public/video/fichame-demo.mp4` (legendas em espanhol) e `fichame-demo-en.mp4` (inglês), ~1 min 45 s, gravados da aplicação real com dados fictícios. Para regenerar depois de mudar a interface: ver o cabeçalho de [`scripts/demo-video/record.js`](scripts/demo-video/record.js). Sem ficheiro, a página mostra «Vídeo en preparación». Nada é descarregado até carregar no play.
- `CONTACT_EMAIL` (opcional) mostra um botão «Escríbenos» na secção de opinião.

**Idiomas** — espanhol, inglês e português
- Detetado pelo browser; escolha em *Configuración → Idioma* ou no rodapé (cookie `fichame_lang`, só quando se escolhe).
- Estilo gettext: o texto espanhol nas views é a chave de `tr('…')`; traduções em `src/locales/`. `node scripts/i18n-check.js` lista o que falta.
- Textos legais (privacidade, termos, consentimentos) ficam em espanhol, a versão oficial. O `/admin` também.

**Demo** — `/demo` (botão na `/conoce`)
- Negócio fictício com 124 candidaturas inventadas, criado por `npm run demo:seed` (correr de novo recria-o com datas atuais).
- Identificado como demonstração em todos os ecrãs; painel só de leitura; a página pública `/r/demo` não aceita candidaturas. Emails em `example.com`, telefones `000…`.

**Admin da plataforma** — `/admin`
- Métricas globais, ativação de estabelecimentos, bloqueio de utilizadores e logs de segurança.
- **Divulgación** (`/admin/divulgacion`): o QR único que leva a `/conoce`, para descarregar (PNG/SVG), imprimir ou copiar o link. Só o admin o vê.
- **Reportes** (`/admin/reportes`): reportes enviados pelos negócios (erro, sugestão, dúvida), com estado Nuevo → En revisión → Resuelto, e os últimos erros 500 do servidor. Cada erro tem um código (ex.: `A3F9C2`) que a pessoa vê no ecrã; se reportar a partir dali, o reporte fica ligado ao erro. Aviso por email para `ADMIN_EMAIL` (com SMTP), sem o texto do reporte.

**Reportar un problema** — `/panel/reportar` (no menu lateral; no telemóvel em Ajustes)
- Formulário curto para o dono do negócio. Junta a página de onde veio e o código do erro, se houver. Pede para não incluir dados de candidatos.
- Erros do servidor e reportes resolvidos são apagados pela retenção ao fim de `ERROR_EVENT_DAYS` (90) e `REPORT_DAYS` (365) dias.
- **Sem acesso a dados de candidatos**, por desenho (testado: admin → rotas de candidatos = 403).

---

## Stack

| Camada | Tecnologia |
|---|---|
| Servidor | Node.js 22 + Express 5 |
| Views | EJS server-rendered, CSS mobile-first, sem build step |
| Base de dados | Supabase PostgreSQL via PostgREST (`@supabase/supabase-js`) |
| Ficheiros | Supabase Storage — buckets privados `cvs` e `media` |
| Uploads | Multer (em memória) + validação por magic bytes |
| Autenticação | Sessões próprias em BD (não usa Supabase Auth) |

A lógica que o PostgREST não exprime (agregações, pesquisa em vários campos, operações transacionais) vive no Postgres como **views e funções `jsonb`** — ver [`migrations/0002_views_rpc.sql`](migrations/0002_views_rpc.sql).

---

## Como executar

**Requisitos:** Node.js ≥ 22 e um projeto [Supabase](https://supabase.com).

### 1. Instalar e configurar

```bash
git clone https://github.com/Jpsoaresfig/EZCV.git
cd EZCV
npm install
cp .env.example .env
```

Preencher o `.env` com os dados de **Supabase → Project Settings → API**:

- `SUPABASE_URL`
- `SUPABASE_ANON_KEY`
- `SUPABASE_SERVICE_ROLE_KEY` — secreta, **só no backend**

### 2. Criar o schema

**Opção A — pelo terminal** (requer `psql` e `DATABASE_URL` no `.env`):

```bash
npm run migrate
```

**Opção B — pelo painel:** em **SQL Editor → New query**, colar e correr por ordem:

1. `migrations/0001_init.sql`
2. `migrations/0002_views_rpc.sql`
3. `migrations/0003_storage.sql`
4. `migrations/0004_notifications_cascade.sql`
5. `migrations/0005_privacy_hardening.sql`
6. `migrations/0006_tenant_fk_cleanup.sql`
7. `migrations/0007_google_login.sql`
8. `migrations/0008_onboarding_steps.sql`
9. `migrations/0009_problem_reports.sql`
10. `migrations/0010_terms_acceptances.sql`
11. `migrations/0011_password_help_requests.sql`
12. `migrations/0012_review_fixes.sql`

As migrations são idempotentes. `0000_reset.sql` é **destrutivo** (apaga o schema) e só corre com `npm run migrate -- --reset`.

### 3. Verificar e arrancar

```bash
npm run check    # valida .env, migrations, views e buckets privados
npm run setup    # cria o admin da plataforma (requer ADMIN_PASSWORD)
npm run dev      # http://localhost:3000, com auto-reload
```

O servidor verifica o Supabase no arranque e recusa-se a servir se faltar uma migration ou um bucket, indicando o que corrigir.

### 4. Primeiro uso

1. Registar um estabelecimento em `/registro` — entra direto no painel.
2. Criar uma vaga em **Vacantes**.
3. Em **Mi restaurante**, copiar a URL da etiqueta (`https://<APP_URL>/r/<slug>`) e gravá-la na tag NFC.

> Defina `APP_URL` com o domínio real **antes** de gravar as etiquetas.

---

## Scripts

| Comando | Descrição |
|---|---|
| `npm start` | Arranca o servidor |
| `npm run dev` | Arranca com auto-reload (`node --watch`) |
| `npm run migrate` | Aplica as migrations via `psql` (`--reset`, `--so <n>`) |
| `npm run check` | Diagnóstico do ambiente e do Supabase |
| `npm run setup` | Cria o admin da plataforma |
| `npm run retention` | Retenção por negócio — **simula** por omissão; `--aplicar` suprime candidaturas vencidas, CVs (BD + Storage), CVs órfãos, sessões/tokens/logs expirados |
| `npm run delete-account` | Fecho de conta sem órfãos (`--id`, `--slug`, `--aplicar`) |
| `npm test` | Unitários + HTTP (sem BD) + migrations numa BD temporária. **Não** toca no Supabase |
| `npm run test:unit` / `test:db` | Cada suite isoladamente |
| `EZCV_E2E_CONFIRM=1 npm run test:e2e` | E2E — escreve na BD do `.env` (dados marcados e apagados no fim). Melhor: projeto Supabase de testes + `EZCV_E2E_PROJECT_REF` |
| `npm run audit` | `npm audit` das dependências de produção |

---

## Variáveis de ambiente

Ver [`.env.example`](.env.example) para a lista comentada.

| Variável | Padrão | Descrição |
|---|---|---|
| `PORT` | `3000` | Porta HTTP |
| `APP_URL` | `http://localhost:3000` | URL pública — **base das URLs NFC** |
| `SUPABASE_URL` | — | **Obrigatória** |
| `SUPABASE_ANON_KEY` | — | Chave publishable |
| `SUPABASE_SERVICE_ROLE_KEY` | — | **Obrigatória.** Nunca no frontend, no git ou em logs |
| `SUPABASE_BUCKET_CVS` / `_MEDIA` | `cvs` / `media` | Buckets privados |
| `DATABASE_URL` | — | Só para `npm run migrate`; a app não a usa |
| `SESSION_TTL_DAYS` | `30` | Validade da sessão de negócio (sessões anónimas: 2 h) |
| `COOKIE_SECURE` / `TRUST_PROXY` | `0` (na Vercel: `1`) | `1` em produção com HTTPS / atrás de proxy. Na Vercel ligam-se sozinhos; em produção um `APP_URL` sem https impede o arranque |
| `MAX_CV_MB` / `MAX_IMAGE_MB` | `4` / `2` | Limites de upload. Na Vercel o CV nunca passa de 4 MB (limite de 4,5 MB por pedido) |
| `ADMIN_EMAIL` / `ADMIN_PASSWORD` / `ADMIN_NAME` | — | Seed do admin |
| `SMTP_*` | vazio | Sem SMTP não há avisos por email e a recuperação de senha passa pelo admin (`/admin/usuarios`). Sem `SMTP_SECURE=1`, o STARTTLS é obrigatório |
| `OPERATOR_*` | marcadores | Identificação do titular do Fíchame nas páginas legais |
| `CRON_SECRET` / `RETENTION_AUTO` | — / `0` | Limpeza técnica diária via `GET /internal/cleanup` (Vercel Cron em `vercel.json`, só precisa de `CRON_SECRET`); supressão de candidaturas via `GET /internal/retention` (também precisa de `RETENTION_AUTO=1`) |
| `SECURITY_LOG_DAYS` / `RIGHTS_REQUEST_DAYS` | `365` / `1095` | Conservação de logs e pedidos de direitos fechados |

---

## Estrutura

```
migrations/          SQL versionado: tabelas, RLS, views/RPC, storage
src/
  server.js          arranque (verifica o Supabase antes de servir)
  app.js             Express: middlewares, cabeçalhos de segurança, rotas
  config.js          leitura e validação do ambiente
  db/                cliente Supabase, migrate, check, seed, retention
  middleware/        session, csrf, auth, rate limit, uploads
  lib/               crypto, slug, statuses, consent, storage, mailer
  routes/            public (NFC), auth, panel, admin, legal
  views/             templates EJS
public/              CSS e JS do cliente
test/smoke.js        teste E2E
docs/                documentação técnica
```

---

## Segurança

- Autorização sempre no backend, filtrada pelo `restaurant_id` da sessão — IDs alheios devolvem 404.
- Row Level Security **deny-all** em todas as tabelas e direitos revogados a `anon`/`authenticated`.
- CVs em bucket privado com nomes aleatórios, servidos só pela rota autenticada após verificação de posse; sem URLs públicas nem assinadas.
- Uploads validados por extensão, MIME, magic bytes e tamanho.
- Integridade por tenant também na BD: FKs compostas `(id, restaurant_id)` e CHECK da pasta do CV no Storage.
- Senhas com `scrypt` (mín. 10); login sem enumeração; recuperação de senha com token de uso único (hash, 30 min); mudar/repor a senha termina as outras sessões.
- Sessões com token opaco (só o hash na BD), cookie `__Host-` + `Secure` em produção, `HttpOnly`, `SameSite=Lax`.
- CSRF em todos os POST; rate limiting em memória e partilhado na BD; honeypot; duplicados tratados sem revelar nada.
- PDF: magic bytes, conteúdo ativo (JavaScript, ficheiros embebidos, XFA…) e ficheiros truncados recusados.
- CSP estrita sem scripts inline, HSTS (produção), `no-store` em respostas dinâmicas, `noindex` fora das páginas públicas.
- Auditoria (sem conteúdo pessoal): acessos a CV, exportações, supressões, notas, mudanças de estado, configuração; IP truncado nos eventos de candidatos.

Inventário completo em [`docs/DOCUMENTACAO.md` §8](docs/DOCUMENTACAO.md#8-segurança-inventário).

> **Proteção de dados:** o Fíchame foi desenhado com medidas de proteção de dados e segurança, sujeitas à configuração adequada, às responsabilidades de cada parte e à revisão jurídica aplicável. **Não é uma declaração de conformidade.** Há PRODUCTION BLOCKERS e pontos de LEGAL REVIEW REQUIRED — ver [`docs/security/production-compliance-gate.md`](docs/security/production-compliance-gate.md) e [`docs/legal/00-legal-review-required.md`](docs/legal/00-legal-review-required.md). Para os dados de candidatos, o papel proposto é: negócio = responsável, Fíchame = encarregado (análise por tratamento em `docs/legal/02-…`).

---

## Testes

```bash
npm test                              # sem Supabase (também corre no CI: .github/workflows/ci.yml)
EZCV_E2E_CONFIRM=1 npm run test:e2e   # E2E, escreve no Supabase do .env
```

- `test/http.test.js` — sobe a app sem BD: endpoints internos, multipart fora das rotas de upload, cabeçalhos de cache e validação da configuração.
- `test/unit.test.js` — sem rede: validação de PDF e nomes de ficheiro, detetor de características protegidas, truncagem de IP, política de senha, textos de consentimento, cabeçalhos.
- `test/db.js` — cria um PostgreSQL **temporário** (initdb), simula o Supabase, aplica as migrations 2× e testa isolamento entre tenants na BD, reserva/consentimento, retenção por tenant, `legal_hold`, supressão, permissões de `anon` e autodiagnóstico. Requer os binários do PostgreSQL (`PG_BIN`).
- `test/smoke.js` — E2E contra o Supabase (só com `EZCV_E2E_CONFIRM=1` ou `EZCV_E2E_PROJECT_REF`): fluxo completo, informação legal, IDOR A↔B, uploads maliciosos, XSS, CSRF, cabeçalhos, enumeração, força bruta, recuperação de senha, invalidação de sessões, direitos (exportação, supressão, retirada), auditoria, admin sem acesso a candidatos.

Cada execução marca os seus dados com um prefixo único e apaga-os no fim com `purge_test_data`, incluindo os objetos no Storage.

---

## Antes de ir para produção

Resolver os **BLOCKERS** de [`docs/security/production-compliance-gate.md`](docs/security/production-compliance-gate.md), em especial:

- Dictamen sobre **agência de colocação** (Ley 3/2023) — [`docs/legal/01-…`](docs/legal/01-analisis-agencia-colocacion.md).
- Dados do operador (`OPERATOR_*`), regiões UE e DPA de Supabase/Vercel, textos legais revistos.
- HTTPS com `COOKIE_SECURE=1`, `TRUST_PROXY=1`, `APP_URL=https://…`; SMTP real.
- `CRON_SECRET` definido na Vercel (limpeza técnica diária); prazos de retenção validados antes de `RETENTION_AUTO=1`.
- Backups (retenção, restauro testado) e 2FA em Supabase/Vercel/GitHub.
- Pendente técnico: verificação de email no registo, 2FA para negócios, utilizadores múltiplos por negócio (RBAC).
- Paginação real na lista de candidaturas (hoje mostra 200 e o total real dos filtros).

Lista completa em [`docs/DOCUMENTACAO.md` §12](docs/DOCUMENTACAO.md#12-pendências-produção).

# Fíchame — Documentação Técnica

Documentação do que foi construído no sistema **Fíchame — Reclutamiento por código QR para cualquier negocio**.

> Público-alvo desta documentação: quem vai manter, auditar ou evoluir o código.
> Para instruções de uso, ver também o [`README.md`](../README.md).

---

## 1. Resumo

Sistema web completo de recrutamento para bares/restaurantes da Espanha, com alta rotatividade de funcionários. Cada negócio tem uma **URL única** e o respetivo **código QR**; o candidato lê o QR com o telemóvel (ou abre o link), preenche o formulário, envia o CV em PDF e a candidatura cai organizada no painel do restaurante.

- **Código QR como mecanismo principal**: QR → navegador → página do negócio. O QR (`/panel/qr`) é gerado no servidor, impresso ou descarregado pelo dono, e aponta para a mesma URL que se partilha por WhatsApp e redes.
- **Sem login para o candidato**: fluxo em menos de 2 minutos, mobile-first, em espanhol.
- **Sem tocar na tag para pausar**: o dono pausa/ativa as candidaturas pelo painel; a URL da tag nunca muda.

---

## 2. O que foi feito (etapas)

| # | Etapa | Resultado |
|---|---|---|
| 1 | Análise do repositório | Diretório vazio — projeto criado do zero |
| 2 | Escolha de stack | Node 22 + Express 5 + EJS + Multer. Começou em SQLite nativo (`node:sqlite`) e migrou para Supabase PostgreSQL na etapa 14 |
| 3 | Schema do banco | 13 tabelas com FKs, índices, checks e isolamento por `restaurant_id` |
| 4 | Middleware de segurança | Sessão própria em BD, CSRF, rate limiting, auth owner/admin |
| 5 | Autenticação | Registro de estabelecimento, login, logout, admin seed |
| 6 | Página pública do negócio | `/r/:slug` com estados (formulário / pausado / sem vagas) |
| 7 | Upload de CV | PDF validado por extensão + MIME + magic bytes + tamanho, bucket privado |
| 8 | Painel do dono | Dashboard, lista+filtros, perfil, CV, estados, notas, vagas, pausa, dados, link público + QR |
| 9 | Área admin | Métricas, ativar/desativar restaurantes, bloquear usuários |
| 10 | Notificações | Email via SMTP mínimo (opcional) + tabela `notifications` + log |
| 11 | Testes E2E | `test/smoke.js` — **54 verificações, todas passando** |
| 12 | Documentação | README (uso) + este documento (técnico) |
| 13 | Feature-complete da spec | Revisão secção a secção: registo completo, dashboard com métricas/pipeline, favoritos, histórico, WhatsApp, notificações no painel, vagas avançadas + eliminação, versão de consentimento, imagens do estabelecimento, logs admin → **80 verificações** |
| 14 | **Migração para Supabase** (2026-10-06) | SQLite → Supabase PostgreSQL via PostgREST; CVs e imagens → Supabase Storage privado; migrations versionadas; candidato passou a ser por restaurante; área de notificações, página de privacidade, documento opcional e estrutura de retenção → **98 verificações** |

---

## 3. Funcionalidades por persona

### 3.1 Candidato (público, sem conta)
- Página pública com estado (🟢/🔴) + **logo, nome comercial, descrição, tipo de estabelecimento e endereço**.
- Com vagas ativas: formulário com *nombre, apellidos, email, teléfono, tipo de documento (NIE/DNI/Pasaporte/Otro — não assume NIE), puesto (select das vagas + "Otro"), disponibilidad, experiencia, observaciones, CV em PDF*.
- Consentimentos RGPD separados com **versão registada** (`CONSENT_VERSION = 'v2-2026-10'`, com o texto exato também guardado):
  - ☑️ tratamento de dados para o processo de seleção (obrigatório);
  - ☑️ conservação para futuras oportunidades (opcional).
- Confirmação após envio (padrão POST-redirect-GET): *«¡Candidatura enviada correctamente!»*.
- Sem vagas ou pausado: mensagem + formulário curto para **guardar dados para futuras oportunidades** (entra como estado *Reserva* com `future_interest=1`).

### 3.2 Dono/gerente (painel `/panel`)
- **Início**: contadores (Total, Nuevas, Para contactar, Entrevistas, Contratados, Reserva) + **métricas 7/30 dias e vagas abertas** + caixa **«Necesita atención»** + notificações não lidas (badge) + botão pausar/ativar.
- **Candidaturas**: filtros (texto livre, estado, vaga, disponibilidade, datas), **ordenação** (recentes/antigas), **favoritos** (★ + filtro), **pipeline visual** com contagem por estado, cards completos (telefone, email, disponibilidade).
- **Perfil**: dados + consentimentos (com versão) + **histórico** (recebida + mudanças de estado com data/hora), botões 📞 `tel:`, ✉️ `mailto:` e **WhatsApp** (`wa.me/<somente dígitos>`), Ver/Descargar CV, seletor dos 8 estados, **notas internas com autor**, favorito, eliminação segura.
- **Vacantes**: criar/editar/ativar/desativar/**eliminar**; campos extra **contrato** (Indefinido/Temporal…), **jornada**, **requisitos**, **disponibilidade**; contagem de candidaturas (preservada após eliminar a vaga via snapshot `job_title`).
- **Mi restaurante**: edição dos dados + **logo/foto** (PNG/JPG/WEBP validados) + link público (copiar/abrir) e código QR + pausa/ativação + slug.
- **Notificações**: badge com não lidas + «Marcar todas como leídas» (`/panel/notificaciones/marcar-leidas`).
- **Configuração**: trocar email de acesso e senha (exige senha atual).

### 3.3 Admin da plataforma (`/admin`)
- Métricas: estabelecimentos (total/ativos), candidaturas (total/7 dias), usuários (total/bloqueados), vagas, emails falhados.
- Tabela de estabelecimentos com toggle ativar/desativar.
- Lista de usuários com bloqueio/desbloqueio (bloqueio remove as sessões ativas).
- **`/admin/logs`**: logs de segurança (`security_logs`) com filtro por evento, IP, data.
- **`/admin/reportes`**: reportes enviados pelos negócios em `/panel/reportar` e erros 500 do servidor (`error_events`, migration 0009), ligados pelo código de referência que a página de erro mostra. Acesso registado (`admin_lista_reportes`).
- **`/admin/divulgacion`**: QR único da página de apresentação `/conoce`, para os cartões entregues aos negócios — ver, copiar o link, descarregar (PNG 2048 px ou SVG) e imprimir. Avisa se `APP_URL` não for um endereço público HTTPS.
- Donos de restaurante recebem **404** em `/admin`.

---

## 4. Mapa de rotas

### Públicas (página do negócio)
| Método | Rota | Descrição |
|---|---|---|
| GET | `/r/:slug` | Página pública: formulário, pausado ou sem vagas |
| GET | `/r/:slug/imagen/:tipo` | Logo/foto do estabelecimento (`logo`\|`foto`) — cache pública 1h |
| POST | `/r/:slug/apply` | Envio de candidatura + CV (multipart, rate limit 5/h por IP+slug) |
| POST | `/r/:slug/interes` | Guardar dados para futuras oportunidades (rate limit 5/h) |
| GET | `/r/:slug/enviado` | Página de confirmação (`?tipo=futuro` na variante de interesse) |
| GET | `/conoce` | Página de apresentação para donos de negócios (destino do QR dos cartões); `?lang=en` em inglês |
| GET | `/privacidad` | Política de privacidade, finalidades, prazos e direitos do titular |

### Autenticação
| Método | Rota | Descrição |
|---|---|---|
| GET | `/` | Redireciona para `/panel` ou `/login` |
| GET/POST | `/registro` | Cadastro do estabelecimento (cria restaurante + dono + sessão) |
| GET/POST | `/login` | Login (rate limit 10/15min por IP+email) |
| POST | `/logout` | Destroi a sessão |
| GET | `/login/google` | Inicia o login Google (OIDC + PKCE); `?modo=vincular` liga Google à conta com sessão. Só ativo com `GOOGLE_CLIENT_ID`/`GOOGLE_CLIENT_SECRET` |
| GET | `/login/google/callback` | Valida state/nonce, troca o code pelo id_token e entra; conta nova → `/registro/google`. Liga a conta existente pelo email só se for @gmail.com ou Workspace (`hd`); contas admin nunca |
| GET/POST | `/registro/google` | Formulário do negócio sem email nem senha (identidade Google num cookie assinado, 30 min) |
| POST | `/panel/configuracion/google` | Desvincula Google (exige a senha atual) |

### Painel (exige sessão de dono + restaurante ativo)
| Método | Rota | Descrição |
|---|---|---|
| GET | `/panel` | Dashboard + métricas + atenção + botão pausar/ativar |
| GET/POST | `/panel/terminos` | Aceitar uma versão nova dos termos/encargo; o painel mostra um aviso (sem bloquear) enquanto houver versão por aceitar. Histórico em `terms_acceptances` (migration 0010) |
| GET/POST | `/panel/reportar` | Reportar um problema (`?ref=` código do erro, `?desde=` página); lista os reportes do próprio negócio |
| GET | `/panel/candidaturas` | Lista com filtros (`q`, `estado`, `puesto`, `disp`, `desde`, `hasta`, `orden`, `favs`), máx. 200 |
| GET | `/panel/candidaturas/:id` | Perfil do candidato |
| POST | `/panel/candidaturas/:id/estado` | Altera estado (valida contra os 8 keys) + regista histórico |
| POST | `/panel/candidaturas/:id/favorito` | Liga/desliga favorito ★ |
| POST | `/panel/candidaturas/:id/notas` | Adiciona nota interna com autor (rate limit 30/10min) |
| POST | `/panel/candidaturas/:id/notas/:noteId/eliminar` | Apaga nota |
| POST | `/panel/candidaturas/:id/eliminar` | Apaga candidatura + objeto do CV no Storage + notas/consentimentos/histórico (cascata) |
| GET | `/panel/cv/:id` | Serve o PDF (inline; `?descargar=1` → attachment) |
| GET | `/panel/vagas` | Lista de vagas |
| POST | `/panel/vagas/crear` | Cria vaga (título, descrição, requisitos, contrato, jornada, disponibilidade) |
| POST | `/panel/vagas/:id/editar` | Edita vaga |
| POST | `/panel/vagas/:id/eliminar` | Elimina vaga (candidaturas preservadas) |
| POST | `/panel/vagas/:id/toggle` | Liga/desliga vaga |
| POST | `/panel/contratacion` | `accion=pausar|activar` |
| GET/POST | `/panel/restaurante` | Edita dados (multipart: logo/foto) + mostra o link público |
| GET | `/panel/qr` | Folha imprimível com o código QR do link público (SVG gerado no servidor) |
| GET | `/panel/qr.png` | QR code em PNG 1024 px para descarregar |
| GET | `/panel/notificaciones` | Área de notificações: histórico de avisos + estado de entrega dos emails |
| POST | `/panel/notificaciones/marcar-leidas` | Marca notificações do restaurante como lidas |
| GET/POST | `/panel/configuracion` | Troca email de acesso / senha (rate limit 10/15min) |

### Admin (exige role `admin`)
| Método | Rota | Descrição |
|---|---|---|
| GET | `/admin` | Métricas + estabelecimentos + emails falhados |
| GET | `/admin/usuarios` | Lista de usuários |
| GET | `/admin/logs` | Logs de segurança (`security_logs`) com filtro por evento |
| GET | `/admin/divulgacion` | QR da página de apresentação (`/conoce`) + `qr.png` / `qr.svg` |
| GET | `/admin/reportes` | Reportes dos negócios (`?estado=`) e últimos 100 erros 500 (`error_events`) |
| POST | `/admin/reportes/:id/estado` | Muda o estado do reporte (nuevo / revisando / resuelto) |
| POST | `/admin/restaurantes/:id/toggle` | Ativa/desativa restaurante |
| POST | `/admin/usuarios/:id/bloquear` | Bloqueia/desbloqueia (não a si próprio; não afeta outros admins) |

Todas as rotas POST passam por verificação de CSRF (multipart validado após o Multer).

---

## 5. Fluxos principais

### 5.1 Candidatura por código QR
```
Código QR / link → GET /r/:slug
  ├─ restaurante não existe/inativo → 404 genérico (anti-enumeration)
  ├─ hiring_status=paused          → mensagem + formulário de interesse
  ├─ sem vagas ativas              → "no tenemos vacantes" + interesse
  └─ open + vagas                  → formulário completo
POST /r/:slug/apply
  1. rate limit (5/h por IP+slug — conta também tentativas rejeitadas)
  2. Multer (1 ficheiro, ext .pdf, MIME pdf, ≤ MAX_CV_MB) → memória
  3. CSRF (token do corpo multipart)
  4. honeypot → resposta falsa, nada gravado
  5. se pausado/sem vagas → redirect (nada gravado)
  6. validação dos campos → 422 re-render com valores preservados
     (documento é opcional: minimização de dados, §5/§29)
  7. magic bytes "%PDF-" no início do buffer
  8. duplicado (mesmo email, mesmo restaurante, 48h) → erro
  9. upload para o bucket privado `cvs` → caminho aleatório
 10. RPC submit_application (transação única: upsert candidate → application
     → cv → consents → history → notification)
     ↳ se falhar, o objeto carregado no passo 9 é removido
 11. email de notificação (fire-and-forget, com link e sem anexo) + security_logs
 12. redirect → /r/:slug/enviado
```

A ordem importa: o caminho do objeto é preciso para gravar a linha em `cvs`, por isso o upload vem antes da BD. O rollback do passo 10 é o que evita CVs órfãos e candidaturas sem CV.

### 5.2 Pausa de candidaturas (tag intocada)
```
Painel → POST /panel/contratacion (accion=pausar)
  → restaurants.hiring_status = 'paused'
  → página pública passa a mostrar "Actualmente no estamos contratando"
  → POST /apply é rejeitado; /interes continua ativo (entra como Reserva)
Painel → accion=activar
  → formulário volta no mesmo instante; URL da tag inalterada
```

### 5.3 Exclusão de candidatura
```
POST /panel/candidaturas/:id/eliminar
  → RPC delete_application (filtra por restaurant_id da sessão)
      transação: DELETE application (cascata: cvs, notes, consents,
                 history, notifications)
                 + DELETE candidate se não tem outras candidaturas
      devolve o storage_path do CV
  → remoção do objeto no bucket `cvs`
      (a função não tem — nem deve ter — acesso ao Storage)
  → security_logs
```

---

## 6. Modelo de dados

```
restaurants 1 ──── * users            (dono: role='owner'; admin: restaurant_id NULL)
restaurants 1 ──── * jobs             (título, descrição, requisitos, contrato, jornada, disponibilidade)
restaurants 1 ──── * candidates       (UNIQUE (restaurant_id, email) — ver nota abaixo)
restaurants 1 ──── * applications ──── * application_notes
candidates  1 ──── * applications
applications 1 ──── 1 cvs             (storage_path no bucket privado, nome original, MIME, tamanho)
applications 1 ──── 1 consents        (selection_consent, future_opportunity_consent, versão + texto)
applications 1 ──── * application_history (event, old_status, new_status, detail, metadata)
restaurants 1 ──── * notifications    (painel: unread|read · email: pending|sent|failed|logged)
users/sessions    sessions            (token_hash PK, csrf_token, expires_at em ms, ip, ua)
security_logs                         (event, user_id, restaurant_id, ip, user_agent, detail, metadata)
```

> **O candidato é por restaurante.** No schema SQLite anterior `candidates.email` era `UNIQUE` global e a linha era atualizada a cada candidatura — uma candidatura no restaurante B sobrescrevia o nome, telefone e documento que o restaurante A estava a ver, e não havia forma de apagar ou anonimizar dados de um restaurante sem afetar o outro (§29). Com `UNIQUE (restaurant_id, email)` cada estabelecimento tem a sua própria cópia.

| Tabela | Campos principais | Notas |
|---|---|---|
| `restaurants` | slug UNIQUE, name, commercial_name, establishment_type, postal_code, description, `logo_path`, `photo_path`, owner_name, email, phone, address, city, `hiring_status` ('open'/'paused'), `active`, `test_prefix` | slug = link público (e QR); `*_path` são caminhos no bucket `media`, não URLs |
| `users` | email UNIQUE (citext), password_hash, full_name, phone, role ('owner'/'admin'), blocked | scrypt |
| `jobs` | restaurant_id FK, title, description, requirements, contract_type, work_schedule, availability, active | contrato/jornada em `CONTRACT_TYPES`/`WORK_SCHEDULES` |
| `candidates` | **restaurant_id FK**, first_name, last_name, email (citext), phone, doc_type, doc_number | `UNIQUE (restaurant_id, email)`; documento pode ficar vazio |
| `applications` | restaurant_id FK, candidate_id FK, job_id FK, `job_title` (snapshot), status, availability, experience, observations, favorite, future_interest, `retention_until`, `anonymized_at`, applied_at | índices em (restaurant_id,status), (restaurant_id,applied_at) e parcial em favoritos |
| `application_notes` | application_id FK, restaurant_id FK, user_id FK (autor), body, created_at | notas privadas |
| `application_history` | application_id FK, restaurant_id FK, event, `old_status`, `new_status`, detail, `metadata` jsonb, created_at | o texto da mudança de estado é composto na view a partir de old/new |
| `cvs` | application_id UNIQUE FK, restaurant_id FK, `storage_path`, `original_filename`, `mime_type`, `size_bytes` | ficheiro no bucket privado `cvs` |
| `consents` | application_id UNIQUE FK, `selection_consent`, `future_opportunity_consent`, `consent_version`, `consent_text` | guarda o **texto exato** aceite, não só a versão |
| `notifications` | restaurant_id FK, application_id FK, type, channel, status, detail, read_at | lidas via painel |
| `sessions` | token_hash PK, user_id FK, csrf_token, ip, user_agent, expires_at (bigint ms), created_at | ms epoch para comparar direto com `Date.now()`, sem ambiguidade de fuso |
| `security_logs` | event, `user_id`, `restaurant_id`, ip, `user_agent`, detail, `metadata` jsonb, created_at | |

### 6.1 Views e funções

O PostgREST não faz `GROUP BY`, subselects no `SELECT`, `OR` entre colunas de tabelas unidas, nem transações com vários statements. Essas operações vivem no Postgres (`migrations/0002_views_rpc.sql`):

| Objeto | Porquê existe |
|---|---|
| view `session_context` | sessão + utilizador + restaurante numa só ida à rede, em cada pedido |
| view `application_list` | candidatura achatada; `search_text` permite um `ilike` em vez de `OR` sobre 7 colunas |
| view `application_status_counts` | `GROUP BY status` para o pipeline |
| view `restaurant_metrics` | agregados do dashboard (total, 7d, 30d, vagas, não lidas) |
| view `job_list` | vaga + contagem de candidaturas |
| views `platform_metrics`, `admin_restaurant_list`, `admin_user_list` | agregados e listas do admin |
| fn `register_restaurant` | restaurante + utilizador + slug único, à prova de corrida |
| fn `submit_application` / `submit_interest` | candidatura completa numa transação |
| fn `set_application_status` / `toggle_favorite` | alteração + histórico no mesmo commit |
| fn `delete_application` | exclusão em cascata; devolve o `storage_path` a apagar |
| fn `toggle_job_active`, `delete_job`, `mark_notifications_read`, `toggle_restaurant_active`, `toggle_user_blocked`, `touch_session` | escritas curtas com a posse verificada lá dentro |
| fn `purge_test_data` | limpeza dos dados de uma execução de testes |

Todas as views têm `security_invoker = on` e todas as funções recebem um único parâmetro `jsonb` chamado `p`. Nenhuma é `SECURITY DEFINER`, e o `EXECUTE` está revogado de `anon`/`authenticated`.

### 6.2 Row Level Security

Todas as tabelas têm RLS **ativo sem nenhuma política permissiva** (deny-all) e os direitos de `anon`/`authenticated` são revogados. O backend usa a `service_role`, que ignora RLS por design — o isolamento real é o filtro por `restaurant_id` em todas as queries e dentro das funções. O RLS é defesa em profundidade: se a chave publishable for exposta, não lê nada. Verificado em teste com a chave anon real.

**Estados (`applications.status`):** `nuevo`, `revisado`, `contactar`, `contactado`, `entrevista`, `contratado`, `rechazado`, `reserva` (labels em `src/lib/statuses.js`).

**Disponibilidade:** `manana`, `tarde`, `flexible`, `fin_semana`, `jornada_comp`, `jornada_part`.

**Tipos de estabelecimento (`restaurants.establishment_type`):** `bar`, `restaurante`, `terraza`, `cafeteria`, `pub`, `foodtruck`, `otro`.

**Contrato de vaga (`jobs.contract_type`):** `indefinido`, `temporal`, `forma`, `practicas`.

**Jornada (`jobs.work_schedule`):** `completa`, `parcial`, `turnos`.

**Versão de consentimento:** `CONSENT_VERSION = 'v2-2026-10'` (constante em `src/lib/consent.js`, gravada em `consents.consent_version`).

**Eventos de histórico (`application_history.event`):** `recibida`, `estado`, `nota`, `nota_borrada`, `eliminada` (`historyLabel()` gera os textos exibidos).

---

## 7. Arquitetura técnica

### Pipeline de middlewares (ordem)
```
security headers (CSP, X-Frame-Options, nosniff, Referrer-Policy, Permissions-Policy)
→ loadSession (cookie → hash → BD; sliding expiry; bloqueia utilizadores blocked)
→ res.locals (csrfToken, path)
→ express.urlencoded / express.json (limits 100kb/50kb)
→ csrfProtection (POST/PUT/DELETE; multipart adiado para a rota)
→ rate limit global (3000 req/15min/IP)
→ express.static (public/, 1h)
→ rotas: public → auth → panel (/panel protegido) → admin (/admin protegido)
→ 404 renderizado → error handler
```

### Estrutura de ficheiros
```
src/
  server.js              arranque + listeners de erro
  app.js                 Express factory + segurança + view helpers (fmtDate, fmtRelative…)
  config.js              env + loader próprio de .env (sem dependências)
  db/index.js            schema (SCHEMA SQL) + getDb() + logSecurity() + tx() + migrações (migrate/ensureColumn)
  db/seed.js             cria admin (ADMIN_EMAIL/ADMIN_PASSWORD)
  middleware/session.js  createSession/destroySession/loadSession/ensureSession + parse de cookies
  middleware/csrf.js     csrfProtection + verifyCsrf (exportado p/ multipart)
  middleware/auth.js     requireOwner, requireAdmin
  middleware/rateLimit.js limiter em memória com janitor
  middleware/uploads.js  multer logo/foto + sniffImage (PNG/JPG/WEBP) + safeUnlink/purgeImages
  lib/crypto.js          scrypt hash/verify, randomToken, sha256, safeEqual
  lib/slug.js            slugify (acentos ES/PT) + uniqueSlug
  lib/statuses.js        estados, disponibilidades, tipos de documento, tipos de estabelecimento,
                         contratos, jornadas, CONSENT_VERSION, HISTORY_EVENTS + labels
  lib/mailer.js          cliente SMTP mínimo (EHLO/STARTTLS/AUTH/DATA) + notifications
  routes/public.js       página pública + imagens + apply + interes + enviado
  routes/auth.js         /, registro, login, logout
  routes/panel.js        todo o painel (prefixo /panel protegido)
  routes/admin.js        área admin (prefixo /admin protegido)
  views/**               17 templates EJS (incl. admin/logs.ejs)
public/css/style.css     design system mobile-first (+ pipeline, timeline, badges, previews)
public/js/app.js         copiar URL, nome do ficheiro, toggle "Otro puesto"
test/smoke.js            teste E2E (sobe servidor temporário, 80 checks)
```

> **Migrations:** ficheiros numerados em `migrations/`, registados em `schema_migrations`, idempotentes. Aplicar com `npm run migrate` (usa `psql` com a `DATABASE_URL`) ou colando o conteúdo no SQL Editor do Supabase. O `supabase-js` não executa DDL, por isso a aplicação nunca cria nem altera schema em runtime — ao contrário do que fazia a versão SQLite.

### Decisões de design
- **Server-rendered (EJS)** em vez de SPA: dono não-técnico, mobile rápido, sem build step, XSS escapado por omissão.
- **PostgREST (`supabase-js`) em vez de `pg` com SQL direto**: escolha explícita. O custo é que `GROUP BY`, subselects e transações multi-statement têm de viver em views e funções no Postgres (§6.1); o benefício é não ter uma camada de SQL própria a manter. Ao acrescentar funcionalidade, seguir esse padrão.
- **Autenticação própria mantida** na migração: já funcionava e era segura, e o Supabase Auth obrigaria a reescrever sessões, CSRF e o modelo de papéis sem ganho real (§27).
- **Funções `jsonb` em vez de argumentos posicionais**: `submit_application` tem 18 campos; um objeto é mais legível do lado do JS e não rompe quando se acrescenta um campo.
- **Upload antes da BD, com rollback do objeto**: o `storage_path` é preciso para gravar a linha em `cvs`. Se a função falhar, o objeto é removido — nunca fica um CV órfão nem uma candidatura sem CV.
- **`job_title` snapshot** em `applications`: histórico preservado se a vaga for renomeada/apagada.
- **Candidato por restaurante** (`UNIQUE (restaurant_id, email)`): corrige a contaminação entre tenants do schema anterior e torna possível apagar ou anonimizar por estabelecimento (§29).
- **Imagens servidas pelo backend** em vez de bucket público: mantém o CSP em `img-src 'self'` e evita autorizar o domínio do Supabase no browser. Custa uma passagem pelo servidor, irrelevante nesta escala.
- **`sessions.expires_at` em ms epoch** (`bigint`): comparado diretamente com `Date.now()`, sem ambiguidade de fuso horário.
- **Estáticos antes de `loadSession`**: com a BD remota, carregar a sessão custa uma ida à rede; um CSS não precisa de sessão nem de CSRF.

---

## 8. Segurança (inventário)

| Área | Implementação |
|---|---|
| Autenticação | Sessão opaca (32 bytes) no cookie `HttpOnly` + `SameSite=Lax`; apenas SHA-256 do token na BD; sliding expiry; destruição em logout/bloqueio; sessão antiga destruída no login/registo (anti session-fixation) |
| Senhas | `crypto.scrypt` N=16384 r=8 p=1, salt 16 bytes, verificação `timingSafeEqual` |
| Autorização | `requireOwner`/`requireAdmin` por prefixo de rota; **todas** as queries de candidaturas/CVs/notas filtram `restaurant_id` da sessão; ID alheio → **404** (não confirma existência) |
| CSRF | Token por sessão validado em todos os POST; no multipart é validado após o Multer (campo no corpo) |
| Upload (CV) | 1 ficheiro; extensão `.pdf`; MIME `application/pdf\|x-pdf`; magic bytes `%PDF-`; limite `MAX_CV_MB`; ficheiro eliminado em qualquer falha |
| Upload (imagens) | `logo`/`foto` em `data/img/` (fora da web root); valores permitidos PNG/JPEG/WEBP por **magic bytes** (`sniffImage`) + extensão no nome final + limite `MAX_IMAGE_MB` (2 MB); ficheiro anterior removido na substituição; URLs servidas só por `GET /r/:slug/imagen/:tipo` |
| CV privado | Bucket privado `cvs` do Supabase Storage, caminho aleatório de 48 caracteres hex; sem URL pública nem assinada; transmitido só por `/panel/cv/:id` com posse verificada; `Cache-Control: private, no-store`; `X-Content-Type-Options: nosniff`; nome ASCII + `filename*` UTF-8 |
| Rate limiting | Global 3000/15min/IP · login 10/15min (IP+email) · registo 10/15min · apply 5/h (IP+slug) · interesse 5/h · notas 30/10min · vagas 20/10min · config 10/15min |
| Anti-spam | Campo honeypot `sitio_web` (resposta falsa, log `spam_honeypot`); duplicado de candidatura em 48h |
| Rastreabilidade | `application_history` regista recebida/estado/nota/eliminada com autor (`user_id`) e timestamp; `security_logs` + `/admin/logs` |
| XSS | EJS `<%= %>` escuta sempre; CSP `default-src 'self'` (sem scripts/styles inline); nenhum `innerHTML` no JS |
| SQL | Exclusivamente queries parametrizadas com `?` |
| Headers | CSP + `X-Frame-Options: DENY` + `Referrer-Policy: strict-origin-when-cross-origin` + `Permissions-Policy` + `X-Powered-By` removido |
| Enumeração | 404 genérico para slug inexistente/inativo e para IDs alheios |
| Logs | `security_logs`: login ok/falhado/bloqueado, registo, estado alterado, pausa/ativação, exclusão, spam |
| RGPD | Consentimentos granulares por candidatura **com versão**, aviso no formulário, eliminação total (dados+CV+notas+histórico), auditoria de mudanças, sem banco público de currículos, conservação futura só com opt-in |
| Concorrência | Transações BEGIN/COMMIT/ROLLBACK nas escritas multi-tabela |

---

## 9. Notificações por email

- **Com `SMTP_HOST`**: cliente SMTP próprio (`net`/`tls`) — EHLO → STARTTLS (se anunciado) → AUTH LOGIN/PLAIN → MAIL FROM → RCPT → DATA → QUIT. SuportaMULTILINE responses e dot-stuffing.
- **Sem SMTP**: email impresso no log (`[EMAIL → addr] …`) e registado na tabela `notifications` com status `logged`.
- **Conteúdo**: *«Nueva candidatura recibida»* + nome do candidato + posto + botão *Ver candidatura* (`{APP_URL}/panel/candidaturas/{id}`).
- **Falhas**: status `failed` com a mensagem — visíveis no `/admin` («Notificaciones fallidas»).
- Futuro (WhatsApp/webhook): trocar o canal em `src/lib/mailer.js` sem tocar no fluxo.

---

## 10. Testes

```bash
EZCV_E2E_CONFIRM=1 npm run test:e2e    # test/smoke.js, exit code 0
```

O teste sobe um servidor e valida, **contra o Supabase real**, por esta ordem. Cada execução gera um prefixo único gravado em `restaurants.test_prefix`; no fim, a função `purge_test_data` apaga apenas o que ficou marcado com esse prefixo, incluindo os objetos no Storage. Os nomes dos estabelecimentos levam o prefixo e o slug é lido do painel em vez de assumido, para que execuções consecutivas não colidam:

1. **Registro e sessão** — render, criação de conta (com tipo de estabelecimento), dashboard
2. **Vagas** — criação e presença no painel
3. **Página pública** — render com estado contratando + vagas
4. **Candidatura** — envio multipart com PDF → confirmação → aparece no painel
5. **Perfil/CV** — dados completos, PDF servido com `application/pdf` + `no-store`, download attachment
6. **Estado e notas** — alteração refletida, nota guardada
7. **Upload inválido** — PDF sem magic bytes (422), `.txt` (422)
8. **CSRF** — POST sem token → 403
9. **Filtros** — busca por texto, estado vazio/populado, Mi restaurante/Configuración
10. **Pipeline/ordenar/publicidade** — pipeline visual, telefone/email/disponibilidade nos cards, `orden=antiguas`, favoritos vazio, descrição/tipo na página pública
11. **Imagens** — upload de logo válido (PNG) + rota `/imagen/logo` serve `image/png`; ficheiro não-imagem rejeitado
12. **Favorito/histórico/consentimento** — ★, perfil mostra versão `v2-2026-10`, histórico `recibida` + `Nuevo → Contactar`, nota com autor, favorito nos filtros, experiência/observações
13. **Notificações no painel** — badge/alerta → marcar lidas → aviso desaparece
14. **Vacantes avançadas + exclusão** — contrato/jornada exibidos, eliminar vaga (candidaturas preservadas), desativar/reativar (mensagem "no tenemos vacantes")
15. **Honeypot** — candidatura não gravada
16. **Pausa** — mensagem, apply bloqueado, interesse funciona (Reserva), reativação
17. **Isolamento** — restaurante B: 404 no perfil e no CV de A, lista vazia, sem sessão → login
18. **Rate limit** — 6º apply em 1h → 429
19. **Admin** — seed, login, métricas, usuários, **logs de segurança**, dono bloqueado em `/admin`
20. **Exclusão** — remoção da candidatura **e** do ficheiro do disco

Verificado também manualmente: upload de 6 MB → 422 «supera el límite», sem ficheiros órfãos; migração automática de uma base antiga (colunas novas + `application_history`) preservando os dados.

---

## 11. Execução e configuração

```bash
npm install
npm run setup     # admin da plataforma (ADMIN_EMAIL/ADMIN_PASSWORD)
npm start         # produção  → http://localhost:3000
npm run dev       # watch mode
npm test          # unitários + HTTP + migrations (sem Supabase)
```

Variáveis em `.env` (ver `.env.example`): `PORT`, `APP_URL` (**base do link público e do código QR**), `SUPABASE_URL`, `SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`, `SUPABASE_BUCKET_CVS`, `SUPABASE_BUCKET_MEDIA`, `DATABASE_URL` (só para `npm run migrate`), `SESSION_TTL_DAYS`, `COOKIE_SECURE`, `TRUST_PROXY`, `MAX_CV_MB`, `MAX_IMAGE_MB`, `ADMIN_*`, `SMTP_*`.

A `SUPABASE_SERVICE_ROLE_KEY` ignora RLS e existe exclusivamente no backend: nunca no frontend, no git ou em logs. O `npm run check` valida o ambiente (ligação, migrations aplicadas, views acessíveis, buckets privados) e corre também no arranque do servidor.

---

## 12. Pendências (produção)

Estado atualizado pela auditoria de 2026-10-06 — fonte de verdade: [`security/production-compliance-gate.md`](security/production-compliance-gate.md).

| Antes | Estado |
|---|---|
| HTTPS + `COOKIE_SECURE=1` + `TRUST_PROXY=1` | Código pronto (HSTS, `__Host-`, redirect HTTPS); falta configurar na Vercel |
| Backups | Por confirmar no plano Supabase; restauro por testar |
| SMTP real | Por configurar |
| Páginas legais e canal de direitos | **Feito** (borradores): `/privacidad`, `/cookies`, `/terminos`, `/encargo`, `/r/:slug/privacidad`, `/panel/derechos` — revisão jurídica pendente |
| Retenção automática | **Feito**: prazos por negócio, `npm run retention`, `/internal/retention`; prazos por validar. Limpeza técnica diária (`/internal/cleanup`, Vercel Cron) |
| Recuperação de senha | **Feito**; verificação de email no registo pendente |
| Rate limit persistente | **Feito** (tabela `rate_limit_hits`) |
| Paginação | Pendente (200 mais recentes) |
| Multi-utilizador / RBAC | Pendente; auditoria de alterações **feita** (`security_logs`) |
| Monitorização | Pendente |

---

## 13. Auditoria de privacidade e segurança (2026-10)

- Documentos jurídicos (espanhol, borradores): [`legal/`](legal/00-legal-review-required.md) — agência de colocação, papéis RGPD, minimização, discriminação, IA, direitos, fornecedores, RAT, EIPD/DPD, acordo de encargo.
- Segurança (português): [`security/`](security/production-compliance-gate.md) — gate de produção e matriz, avaliação de riscos, resposta a incidentes, auditoria de rotas, segurança operacional.
- Migrations: `0005_privacy_hardening` (default privileges, FKs por tenant, base jurídica e consentimentos, retenção por tenant, direitos, recuperação de senha, rate limit, autodiagnóstico, minimização retroativa) e `0006_tenant_fk_cleanup` (uma FK por par de tabelas para os embeds do PostgREST).
- Mudanças de comportamento visíveis: o formulário deixou de pedir documento de identidade e de ter checkbox obrigatório de «consentimento»; «Reserva» exige consentimento; email de nova candidatura sem dados do candidato; senha mínima 10; sessões anónimas de 2 h sem IP.

# Fíchame — checklist de lançamento (go-live)

Lista curta do que **o dono** tem de fazer antes de abrir ao público. O código não
precisa de mais alterações para isto; falta configuração, contas e decisões.

> O Fíchame **não tem cobrança/pagamentos** implementados: o produto diz-se
> «gratuito durante a prova de mercado». Para cobrar é preciso decidir o modelo
> (preço, faturação) e integrar um fornecedor (ex.: Stripe) — trabalho novo.

## 1. Base de dados (Supabase cloud)

1. **SQL Editor** do Supabase → executar (é idempotente, não altera dados):
   ```sql
   insert into schema_migrations (version) values
     ('0007_google_login'), ('0008_onboarding_steps')
   on conflict (version) do nothing;
   ```
   As colunas de 0007/0008 já existem na BD, mas as versões não estavam
   registadas e `npm start` / `npm run check` recusavam arrancar.
   (Alternativa: voltar a correr `migrations/0007_google_login.sql` e
   `migrations/0008_onboarding_steps.sql`, que agora se registam sozinhos.)
2. Localmente: `npm run check` → tem de terminar sem erros.
3. Região: Supabase **eu-west-1 (Irlanda)**, funções Vercel **dub1 (Dublim)** em `vercel.json`
   (já indicadas em /privacidad). Aceitar o DPA do Supabase e da Vercel (transferências internacionais).
   Desligar os registos do **Supabase Auth** (não usado — ver `docs/security/operational-security.md`).
4. Criar o admin da plataforma: definir `ADMIN_EMAIL` e `ADMIN_PASSWORD` no
   `.env` local e correr `npm run setup` (escreve na BD de produção).

## 2. Contas e chaves

| O quê | Onde criar | Variáveis |
|---|---|---|
| Supabase (já existe) | Project Settings → API | `SUPABASE_URL`, `SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY` |
| Domínio próprio | registador + Vercel → Domains | `APP_URL=https://o-teu-dominio` (**antes** de gravar etiquetas NFC/QR) |
| Email transacional (SMTP) | Brevo, Mailgun, Amazon SES, Postmark… (servidor na UE de preferência). Configurar SPF/DKIM do domínio | `SMTP_HOST`, `SMTP_PORT`, `SMTP_SECURE`, `SMTP_USER`, `SMTP_PASS`, `SMTP_FROM` |
| Login com Google (opcional) | Google Cloud Console → Credentials → OAuth client (Web). Redirect: `<APP_URL>/login/google/callback` | `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET` |
| Segredo do cron | `openssl rand -hex 32` | `CRON_SECRET` (≥ 32 caracteres) |
| Segredo dos logs | `openssl rand -hex 32` | `LOG_HMAC_SECRET` |
| Dados legais do operador | empresa/autónomo que opera o Fíchame | `OPERATOR_LEGAL_NAME`, `OPERATOR_NIF`, `OPERATOR_ADDRESS`, `OPERATOR_PRIVACY_EMAIL`, `OPERATOR_REGISTRY`, (`OPERATOR_DPO` se houver) |
| Contacto e alertas | — | `CONTACT_EMAIL` (botão em /conoce), `ADMIN_EMAIL` (alertas de reportes) |

Sem SMTP a app funciona, mas não há emails (avisos de candidatura; a
recuperação de senha passa pelo admin em `/admin/usuarios`).

## 3. Deploy na Vercel

1. Projeto Vercel: **`fichame`** na team **`nex-forge4`** (o antigo `ezcv` já não é usado).
   Ligação local: `npx vercel link --project fichame --scope nex-forge4` (sem `--yes`: recusar
   o `env pull`, que reescreve o `.env.local`)
   (cria `.vercel/project.json`, que está no .gitignore). Confirmar que repositório/branch
   está ligado ao projeto (Settings → Git). Node: `engines` fixa **22.x** (sobrepõe-se ao 26.x do painel).
   **Passo a passo do dia: [`docs/DEPLOY-TODAY.md`](docs/DEPLOY-TODAY.md).**
2. Vercel → Project → Settings → **Environment Variables** (Production): colar
   todas as variáveis da secção 2. **Não** definir `COOKIE_SECURE=0` nem
   `TRUST_PROXY=0` (na Vercel ficam 1 por omissão). `MAX_CV_MB` ≤ 4.
   `RETENTION_AUTO` fica `0` até os prazos de conservação terem validação jurídica.
3. Deploy (push para a branch de produção ou `vercel --prod`).
4. `curl https://<domínio>/api/health` → `{"config":true,"db":true,"migrations":true,"ok":true}` (200).
   Com `config:false` (503) a configuração foi recusada: ver Runtime Logs (`[config] Arranque recusado`).
5. Vercel → **Logs**: não pode haver `[config] Páginas legais com marcadores`
   nem `[config] CRON_SECRET em falta`.
6. Vercel → Settings → **Cron Jobs**: confirmar `/internal/cleanup` diário (03:00 UTC).

## 4. Legal (antes de vender)

- `/privacidad`, `/terminos`, `/encargo`, `/cookies` existem (em espanhol — o
  mercado é Espanha, RGPD/LOPDGDD/LSSI). Mostram a faixa **«BORRADOR — REQUIERE
  REVISIÓN JURÍDICA»** (some só com `LEGAL_REVIEWED=1`, depois da revisão) e marcadores `[RAZÓN SOCIAL]`, `[NIF]`… até preencher `OPERATOR_*`.
- Revisão por advogado: ver `docs/legal/00-legal-review-required.md` e
  `docs/security/production-compliance-gate.md` (itens BLOCKER: identidade do
  operador, transferências internacionais, análise «agencia de colocación»).
- Indicar o fornecedor SMTP real nos textos (aparece `[PROVEEDOR DE EMAIL SMTP]`).

## 5. Smoke test depois do deploy (≈10 min)

1. `https://<domínio>/` e `/conoce` abrem; `/privacidad` sem marcadores `[…]`.
2. `curl -I https://<domínio>/` → `Strict-Transport-Security` e `Content-Security-Policy` presentes.
3. `curl -i https://<domínio>/internal/cleanup` → **404** (sem o segredo).
4. Registar um negócio de teste em `/registro` → cai no painel; criar uma vaga.
5. Abrir `/r/<slug>` no telemóvel, enviar candidatura com um PDF pequeno →
   aparece em *Candidaturas*; abrir o CV; chega o email de aviso (se SMTP).
6. `/recuperar` com o email do teste → chega o email (se SMTP).
7. Entrar como admin em `/admin` → vê o negócio; `/admin/reportes` sem erros novos.
8. Apagar o negócio de teste: `npm run delete-account -- --slug <slug>` (dry run)
   e depois com `--aplicar`.
9. Gravar a etiqueta NFC com `https://<domínio>/r/<slug>` (NFC Tools) e testar.

# Fíchame — checklist de lançamento (go-live)

Lista curta do que **o dono** tem de fazer antes de abrir ao público. O código não
precisa de mais alterações para isto; falta configuração, contas e decisões.

> Cobrança: assinaturas Stripe (Checkout e Customer Portal alojados) em
> `/panel/plan`. Os preços (prova grátis de 30 dias, Fundadores, Profissional,
> todos + IVA) vivem só em `src/lib/pricing.js`. Sem `STRIPE_SECRET_KEY` e
> `STRIPE_WEBHOOK_SECRET` a cobrança fica desligada e o painel só mostra os planos.
> Configuração: secção **Stripe** abaixo. O fim da prova ou um pagamento falhado
> **nunca bloqueiam** o uso (só avisos).

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
| Domínio próprio | registador + Vercel → Domains | `APP_URL=https://o-teu-dominio` (**antes** de imprimir códigos QR) |
| Email transacional (SMTP) | Brevo, Mailgun, Amazon SES, Postmark… (servidor na UE de preferência). Configurar SPF/DKIM do domínio | `SMTP_HOST`, `SMTP_PORT`, `SMTP_SECURE`, `SMTP_USER`, `SMTP_PASS`, `SMTP_FROM` |
| Login com Google (opcional) | Google Cloud Console → Credentials → OAuth client (Web). Redirect: `<APP_URL>/login/google/callback` | `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET` |
| Segredo do cron | `openssl rand -hex 32` | `CRON_SECRET` (≥ 32 caracteres) |
| Segredo dos logs | `openssl rand -hex 32` | `LOG_HMAC_SECRET` |
| Dados legais do operador | empresa/autónomo que opera o Fíchame | `OPERATOR_LEGAL_NAME`, `OPERATOR_NIF`, `OPERATOR_ADDRESS`, `OPERATOR_PRIVACY_EMAIL`, `OPERATOR_REGISTRY`, (`OPERATOR_DPO` se houver) |
| Contacto e alertas | — | `CONTACT_EMAIL` (botão em /conoce), `ADMIN_EMAIL` (alertas de reportes) |

Sem SMTP a app funciona, mas não há emails (avisos de candidatura; a
recuperação de senha passa pelo admin em `/admin/usuarios`).

## 3. Deploy na Vercel

1. Projeto Vercel: **`fichame`** na team **`nex-forge5`** (o antigo `ezcv` já não é usado).
   Ligação local: `npx vercel link --project fichame --scope nex-forge5` (sem `--yes`: recusar
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

## 3b. Stripe (subscriptions)

Start in **test mode** (`sk_test_…`). Order: **migrate 0014 → deploy**.

1. **Database first:** `npm run migrate` (applies `0014_billing.sql`), then
   `npm run check` must end with "Tudo pronto." Without 0014 `/api/health` reports
   `migrations:false`.
2. **Prices:** with `STRIPE_SECRET_KEY` in your local `.env`, run
   `npm run stripe:setup`. It creates the product "Fíchame" and three recurring
   EUR prices (tax behaviour *exclusive*) with lookup keys derived from
   `src/lib/pricing.js`: `fichame_founders_monthly_990`, `fichame_pro_monthly_1490`,
   `fichame_pro_yearly_14900`. It is idempotent, prints the account country (warns
   if not ES) and never prints secrets. Run it once with the test key and once
   with the live key. After changing a price in `pricing.js`, run it again (new
   lookup key → new price); until then Checkout refuses with a logged error.
3. **Webhook:** Dashboard → Developers → Webhooks → Add endpoint
   `https://fichame-ten.vercel.app/webhooks/stripe` (or the custom domain) with the events
   `checkout.session.completed`, `customer.subscription.created`,
   `customer.subscription.updated`, `customer.subscription.deleted`,
   `invoice.paid`, `invoice.payment_failed`. Copy its signing secret (`whsec_…`).
4. **Customer Portal:** Settings → Billing → Customer portal → enable it; allow
   cancellation **at the end of the billing period**; allow updating payment
   methods and viewing invoices; under "Subscriptions → switch plans" add only the
   Profesional monthly and yearly prices (never Fundadores).
5. **IVA:** with `STRIPE_AUTOMATIC_TAX=1`, register for Spanish VAT in Stripe Tax
   (Settings → Tax → Registrations → Spain) and set the origin address. With
   automatic tax off, create a 21 % *exclusive* tax rate and set
   `STRIPE_TAX_RATE_ID=txr_…` (otherwise no IVA is added).
6. **Vercel env vars (Production):** `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`,
   `STRIPE_AUTOMATIC_TAX` (`1` or `0`), optional `STRIPE_TAX_RATE_ID`, and
   `STRIPE_ALLOW_TEST=1` **only** while testing with an `sk_test_` key in
   production (without it a test key is refused there). No publishable key is
   needed (hosted Checkout, no Stripe.js).
7. **Deploy**, then test with card `4242 4242 4242 4242`: `/panel/plan` → plan →
   Stripe → back; the plan shows as active within seconds (Dashboard → Webhooks
   shows `200`). Try the portal (switch monthly/yearly, cancel at period end).

Production: Vercel project `fichame`, team `nex-forge5`, https://fichame-ten.vercel.app.

## 4. Legal (antes de vender)

- `/privacidad`, `/terminos`, `/encargo`, `/cookies` existem (em espanhol — o
  mercado é Espanha, RGPD/LOPDGDD/LSSI). Mostram a faixa **«BORRADOR — REQUIERE
  REVISIÓN JURÍDICA»** (some só com `LEGAL_REVIEWED=1`, depois da revisão) e dizem que a identificação do titular está pendente de publicação até preencher `OPERATOR_*`.
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
9. Imprimir o código QR do negócio (`/panel/qr`), lê-lo com o telemóvel e confirmar que abre `https://<domínio>/r/<slug>`.

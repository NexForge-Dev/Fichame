# Deploy today — Fíchame on Vercel


> **Order matters (migration 0013):** run `npm run migrate` against the cloud
> database **before** the new code takes production traffic. The code relies on
> `register_restaurant` v3, the `email_changes` table and
> `session_context.restaurant_created_at`. Then `npm run check` must end with
> "Tudo pronto." and only then deploy/promote.

> **Stripe billing (migration 0014):** same rule — `npm run migrate` (0014) and
> `npm run check` **before** deploying the billing code. See [§6 Stripe](#6-stripe).

Owner checklist to bring production back up (it currently answers **HTTP 500**
on every route). Nothing here has been applied: run each step yourself.
Never paste secret values into chats, issues or commits.

- Vercel project: **`fichame`**, team **`nex-forge5`** (the old `ezcv` project is not used).
- Production URL today: **`https://fichame-ten.vercel.app`** (alias of the production
  deployment). `fichame.vercel.app` belongs to **another** Vercel account — do not use it.
- `fichame-nex-forge5.vercel.app` and `fichame-git-main-…` are behind Vercel
  Authentication (SSO); the public uses `fichame-ten.vercel.app` or a custom domain.

## Why production is down

`APP_URL` is `http://localhost:3000` in Vercel. In production `assertConfig()`
refuses a non-https `APP_URL` (it ends up in QR codes, shared links and emails),
and `index.js` used to throw at import → generic 500.

After the `fix/launch` branch is deployed the app still refuses that config,
but it answers **503** everywhere and `GET /api/health` returns
`{"ok":false,"config":false,"db":false,"migrations":false}`; the cause is in
the Runtime Logs as `[config] Arranque recusado: …`.

## 1. Vercel environment variables

Variables currently set (Production **and** Preview): `PORT`, `APP_URL`,
`SUPABASE_URL`, `SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`,
`SUPABASE_BUCKET_CVS`, `SUPABASE_BUCKET_MEDIA`, `DATABASE_URL`,
`SESSION_TTL_DAYS`, `COOKIE_SECURE`, `TRUST_PROXY`, `MAX_CV_MB`,
`MAX_IMAGE_MB`, `ADMIN_EMAIL`, `ADMIN_NAME`, `ADMIN_PASSWORD`, `SMTP_*`,
`GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`.

Use the dashboard (Settings → Environment Variables) or the CLI from the repo
folder (`npx vercel link --project fichame --scope nex-forge5` first; decline
the env pull so `.env.local` is not overwritten). The commands below read
secret values from stdin so they are never echoed.

### Change

| Variable | Action | Why |
|---|---|---|
| `APP_URL` | Production: set to `https://fichame-ten.vercel.app` (later: the custom domain, **before** printing QR codes). Preview: delete | Must be https in production; the fallback for Preview is `VERCEL_PROJECT_PRODUCTION_URL` (https) |
| `COOKIE_SECURE` | Delete (or set `1`) | On Vercel it defaults to `1`; a copied `0` breaks `__Host-` cookies and HSTS |
| `TRUST_PROXY` | Delete (or set `1`) | Defaults to `1` on Vercel; `0` breaks HTTPS detection and rate-limit IPs |
| `MAX_CV_MB` | `4` or delete | Vercel rejects bodies > 4.5 MB; values above 4 are clamped with a warning |
| `GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET` | Delete until you have a real OAuth client; then set both (redirect URI `<APP_URL>/login/google/callback`) | The current id is a placeholder. The button now only shows with an id ending in `.apps.googleusercontent.com` + a secret |
| `SMTP_*` | Check the values are a real EU provider (host, port, user, pass, `SMTP_FROM` on your domain with SPF/DKIM). If not ready, delete `SMTP_HOST` | Without `SMTP_HOST` there are no emails; password recovery goes through `/admin/usuarios` |

### Delete (verified unused at runtime)

| Variable | Used only by | Note |
|---|---|---|
| `DATABASE_URL` | `src/db/migrate.js` (`npm run migrate`, run locally) | Full Postgres credential — it should not live in Vercel at all |
| `ADMIN_PASSWORD` | `src/db/seed.js` (`npm run setup`, run locally) | |
| `ADMIN_NAME` | `src/db/seed.js` | |
| `PORT` | `src/server.js` (local only; Vercel ignores it) | Harmless, but noise |

Keep `ADMIN_EMAIL` (runtime: email alert for new problem reports).

Also consider: `SUPABASE_SERVICE_ROLE_KEY` is also set for **Preview**, so any
preview deployment of any branch has full access to the production database.
Restrict it (and `SUPABASE_URL`) to Production, or point Preview at a separate
Supabase project.

### Add (Production)

| Variable | Value |
|---|---|
| `CRON_SECRET` | random, ≥ 32 chars — daily `/internal/cleanup` cron does not run without it |
| `LOG_HMAC_SECRET` | random, 32 bytes hex — pseudonymises emails in logs (otherwise derived from the service key). Set it now: changing it later changes the log pseudonyms |
| `OPERATOR_LEGAL_NAME` | legal name of the operator (company or self-employed) |
| `OPERATOR_NIF` | NIF/CIF |
| `OPERATOR_ADDRESS` | registered address |
| `OPERATOR_PRIVACY_EMAIL` | privacy contact email |
| `OPERATOR_REGISTRY` | Registro Mercantil data, or e.g. `No aplica` if self-employed |
| `OPERATOR_DPO` | only if a DPO was appointed |
| `CONTACT_EMAIL` | email shown on `/conoce` (optional) |
| `RETENTION_AUTO` | `0` (default; turn on only after legal validation of retention periods) |

Do **not** set `LEGAL_REVIEWED=1` until a lawyer has reviewed the legal texts:
it hides the “BORRADOR — REQUIERE REVISIÓN JURÍDICA” banner.

Optional (NexForge panel metrics): `NEXFORGE_ENDPOINT`, `NEXFORGE_INGEST_KEY`,
`NEXFORGE_PSEUDONYM_SECRET` — without all three nothing is sent.

### CLI example (Git Bash, from the repo folder)

```bash
# remove
for v in COOKIE_SECURE TRUST_PROXY DATABASE_URL ADMIN_PASSWORD ADMIN_NAME PORT GOOGLE_CLIENT_ID GOOGLE_CLIENT_SECRET; do
  npx vercel env rm $v production --yes
  npx vercel env rm $v preview --yes
done
npx vercel env rm APP_URL production --yes
npx vercel env rm APP_URL preview --yes

# set
printf %s "https://fichame-ten.vercel.app" | npx vercel env add APP_URL production
node -e "process.stdout.write(require('crypto').randomBytes(32).toString('hex'))" | npx vercel env add CRON_SECRET production
node -e "process.stdout.write(require('crypto').randomBytes(32).toString('hex'))" | npx vercel env add LOG_HMAC_SECRET production
npx vercel env add OPERATOR_LEGAL_NAME production   # prompts for the value
npx vercel env add OPERATOR_NIF production
npx vercel env add OPERATOR_ADDRESS production
npx vercel env add OPERATOR_PRIVACY_EMAIL production
npx vercel env add OPERATOR_REGISTRY production
npx vercel env add CONTACT_EMAIL production
```

Env changes only apply to **new** deployments: redeploy afterwards
(`npx vercel --prod` or Deployments → ⋯ → Redeploy).

## 2. Register migrations 0007 / 0008 (Supabase SQL Editor)

The columns from `0007_google_login` and `0008_onboarding_steps` already
exist in the cloud database, but the versions are not in `schema_migrations`,
so `npm start` / `npm run check` (and `/api/health` → `migrations:false`)
refuse. Production runtime (`index.js`) does not block on this, but run it
before deploying.

**Step 2a — confirm the objects exist** (read-only):

```sql
select
  exists (select 1 from information_schema.columns
          where table_schema = 'public' and table_name = 'users' and column_name = 'google_sub')        as users_google_sub,
  exists (select 1 from pg_indexes
          where schemaname = 'public' and indexname = 'users_google_sub_key')                           as users_google_sub_key,
  (select is_nullable = 'YES' from information_schema.columns
   where table_schema = 'public' and table_name = 'users' and column_name = 'password_hash')            as password_hash_nullable,
  exists (select 1 from pg_constraint where conname = 'users_has_credential')                           as users_has_credential,
  pg_get_functiondef('public.register_restaurant(jsonb)'::regprocedure) like '%google_sub%'             as register_restaurant_v0007,
  exists (select 1 from information_schema.columns
          where table_schema = 'public' and table_name = 'restaurants' and column_name = 'page_viewed_at') as restaurants_page_viewed_at,
  exists (select 1 from information_schema.columns
          where table_schema = 'public' and table_name = 'restaurants' and column_name = 'qr_viewed_at')   as restaurants_qr_viewed_at;

select version, applied_at from schema_migrations order by version;
```

**Step 2b — if every column above is `true`**, register the versions
(idempotent, touches no data):

```sql
insert into schema_migrations (version) values
  ('0007_google_login'),
  ('0008_onboarding_steps')
on conflict (version) do nothing;
```

**If any value is `false`**, do not insert: paste and run
`migrations/0007_google_login.sql` and then `migrations/0008_onboarding_steps.sql`
from the repo instead (both are idempotent and register themselves; no later
migration redefines `register_restaurant`, so re-running 0007 is safe).

Then, locally: `npm run check` must finish without errors.

## 3. Supabase dashboard

1. **Turn off Supabase Auth sign-ups** — Fíchame uses its own sessions
   (`sessions` table) and never uses Supabase Auth. With sign-ups open, anyone
   with the public anon key can create rows in `auth.users`.
   Authentication → Sign In / Providers → **Allow new users to sign up: off**;
   disable unused providers (Email, Phone, Anonymous, OAuth);
   Authentication → Users: delete any test accounts.
2. Project Settings → General: confirm region **eu-west-1 (Ireland)** — this is
   what `/privacidad` now states (Vercel functions: `dub1`, Dublin, from `vercel.json`).
3. Accept/sign the Supabase DPA (Organization → Legal documents).
4. 2FA on the Supabase organisation; minimum number of members.

## 4. Node version

`package.json` now pins `"engines": { "node": "22.x" }`. Vercel uses `engines`
over the dashboard setting (currently 26.x, untested); optionally also set
Settings → General → Node.js Version → 22.x so they match. CI reads the same
value (`node-version-file: package.json`).

## 5. After deploying

```bash
curl -s https://fichame-ten.vercel.app/api/health
# expect 200 {"config":true,"db":true,"migrations":true,"ok":true}
curl -sI https://fichame-ten.vercel.app/ | grep -iE "strict-transport|content-security"
curl -s -o /dev/null -w '%{http_code}\n' https://fichame-ten.vercel.app/internal/cleanup   # 404
```

- Runtime Logs: no `[config] Arranque recusado`, `Páginas legais com marcadores`,
  `CRON_SECRET em falta`, `Login com Google desativado` (unless intended).
- Settings → Cron Jobs: `/internal/cleanup` daily at 03:00 UTC.
- Point an uptime monitor at `/api/health` (503 = something is wrong; the body
  only has booleans).
- Continue with the smoke test in [`LANCAMENTO.md` §5](../LANCAMENTO.md).

## 6. Stripe

Production: Vercel project **`fichame`**, team **`nex-forge5`**,
**https://fichame-ten.vercel.app**. Start with test keys (`sk_test_…`).

1. **Order:** `npm run migrate` (applies `0014_billing.sql`) → `npm run check`
   ("Tudo pronto.") → set the env vars → deploy.
2. **Env vars (Vercel → Settings → Environment Variables → Production):**

   | Variable | Value |
   |---|---|
   | `STRIPE_SECRET_KEY` | `sk_test_…` first, `sk_live_…` at launch (secret) |
   | `STRIPE_WEBHOOK_SECRET` | `whsec_…` of the endpoint below (secret) |
   | `STRIPE_AUTOMATIC_TAX` | `1` = Stripe Tax computes IVA; `0` (default) = fixed rate |
   | `STRIPE_TAX_RATE_ID` | optional `txr_…` (21 % exclusive), used only when automatic tax is off |
   | `STRIPE_ALLOW_TEST` | `1` only while using an `sk_test_` key in production; delete at launch |

   No publishable key: Checkout and the portal are hosted by Stripe. Billing is
   enabled only when both the secret key and the webhook secret are set.
3. **Prices:** locally, with `STRIPE_SECRET_KEY` in `.env`, run
   `npm run stripe:setup` (idempotent; creates product "Fíchame" and the prices
   `fichame_founders_monthly_990`, `fichame_pro_monthly_1490`,
   `fichame_pro_yearly_14900` from `src/lib/pricing.js`). Repeat with the live key.
4. **Webhook:** Developers → Webhooks → Add endpoint
   `https://fichame-ten.vercel.app/webhooks/stripe`, events:
   `checkout.session.completed`, `customer.subscription.created`,
   `customer.subscription.updated`, `customer.subscription.deleted`,
   `invoice.paid`, `invoice.payment_failed`. Copy the signing secret into
   `STRIPE_WEBHOOK_SECRET`. If you move to a custom domain, update the endpoint URL.
5. **Customer Portal:** Settings → Billing → Customer portal: enable; cancel **at
   period end**; allow switching between Profesional monthly and yearly (only
   those two prices); allow payment-method updates and invoice history.
6. **IVA:** if `STRIPE_AUTOMATIC_TAX=1`, register Spain in Stripe Tax (Settings →
   Tax → Registrations) before the first live charge.
7. **Check:** `curl -s https://fichame-ten.vercel.app/api/health` → `migrations:true`;
   `curl -sI https://fichame-ten.vercel.app/ | grep -i content-security` shows
   `form-action 'self' https://checkout.stripe.com https://billing.stripe.com`.
   Buy a plan with card `4242 4242 4242 4242`; Stripe → Webhooks shows `200`
   responses; `/admin` shows the business's plan and status.

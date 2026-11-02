# Fíchame

**NFC-based job applications for any business in Spain — restaurants, shops, hotels, hair salons, gyms…**

The candidate taps their phone on the business's NFC tag, opens the business page, fills in the form and uploads their CV as a PDF. The application shows up in the business owner's dashboard, where they organize it, contact the candidate and follow the process through to hiring.

```
NFC tag → /r/:slug → form + CV (PDF) → business dashboard → Nuevo … Contratado
```

The tag is **not programmed by the system**: Fíchame provides the URL and the owner writes it to the tag with any NFC writer app (e.g. NFC Tools).

> 🎨 Logo and brand colors: [`brand/`](brand/README.md)
>
> 📄 Full technical documentation (routes, flows, data model, security, tests — in Portuguese): [`docs/DOCUMENTACAO.md`](docs/DOCUMENTACAO.md)
>
> ⚖️ Legal and security audit (2026-10): [`docs/legal/`](docs/legal/00-legal-review-required.md) (in Spanish, for the legal advisor) and [`docs/security/`](docs/security/production-compliance-gate.md)

---

## Features

**Candidate** — no account, mobile-first, in Spanish
- Public page `/r/:slug` with logo, description and hiring status (🟢 / 🔴).
- Form with position, availability, experience and a validated PDF CV.
- Data minimization: no ID document, date of birth, nationality or photo; a notice asks not to include sensitive data.
- Layered privacy information (controller, purpose, legal basis 6.1.b, retention, rights) before submitting; second layer at `/r/:slug/privacidad`.
- **Optional**, business-specific consent for future opportunities (exact text, version, date, withdrawal).
- Data-subject rights channel (`/r/:slug/privacidad#derechos`) that reaches the business dashboard with a 1-month deadline.
- When applications are paused: a form to keep the candidate's details for future opportunities.

**Business** — dashboard at `/panel`
- Metrics, a “Needs attention” box and a visual pipeline with 8 statuses.
- Free-text search, filters (status, position, availability, dates), favorites and sorting.
- Candidate profile with CV, internal notes, history and `tel:`, `mailto:` and WhatsApp shortcuts.
- Positions: create, edit, enable/disable and delete.
- Pause/resume applications **without touching the NFC tag**.
- QR code for the same URL, ready to print or download as PNG (`/panel/qr`).
- In-dashboard and email notifications (optional SMTP).

**Landing page** — `/`
- Presents the product to business owners: how it works, features, privacy and FAQ.
- The form and dashboard mockups are HTML/CSS (no images), so they follow dark mode.

**Introduction page** — `/conoce`
- Target of the QR printed on the cards handed to businesses: explains from scratch what Fíchame is, how it works, that no HR team is needed and that it is free during the market test.
- Spanish by default, English with `?lang=en` (or if the browser is in English). Copy lives in `src/lib/conoce.js` — it only describes what the product does today.
- **Video:** `public/video/fichame-demo.mp4` (Spanish subtitles) and `fichame-demo-en.mp4` (English), recorded from the real app with fictitious data. To regenerate after UI changes, see the header of [`scripts/demo-video/record.js`](scripts/demo-video/record.js). Without the file, the page shows “Vídeo en preparación”. Nothing is downloaded until play is pressed.
- `CONTACT_EMAIL` (optional) shows a “Write to us” button in the feedback section.

**Languages** — Spanish, English and Portuguese
- Detected from the browser; can be chosen in *Settings → Language* or in the footer (`fichame_lang` cookie, set only when the user chooses).
- gettext style: the Spanish text in the views is the key for `tr('…')`; translations live in `src/locales/`. `node scripts/i18n-check.js` lists missing strings.
- Legal texts (privacy, terms, consents) stay in Spanish, the official version. So does `/admin`.

**Demo** — `/demo` (button on `/conoce`)
- Fictitious business with 124 made-up applications, created by `npm run demo:seed` (running it again recreates it with current dates).
- Marked as a demo on every screen; read-only dashboard; the public page `/r/demo` does not accept applications. Emails use `example.com`, phone numbers `000…`.

**Platform admin** — `/admin`
- Global metrics, business activation, user blocking and security logs.
- **Divulgación** (`/admin/divulgacion`): the single QR code that leads to `/conoce`, to download (PNG/SVG), print or copy the link. Admin only.
- **Reportes** (`/admin/reportes`): reports sent by businesses (bug, suggestion, question), with status Nuevo → En revisión → Resuelto, plus the latest server 500 errors. Each error has a code (e.g. `A3F9C2`) that the user sees on screen; if they report from there, the report is linked to the error. Email alert to `ADMIN_EMAIL` (with SMTP), without the report text.
- **No access to candidate data**, by design (tested: admin → candidate routes = 403).

**Report a problem** — `/panel/reportar` (in the side menu; under Settings on mobile)
- Short form for the business owner. Attaches the originating page and the error code, if any. Asks not to include candidate data.
- Server errors and resolved reports are deleted by the retention job after `ERROR_EVENT_DAYS` (90) and `REPORT_DAYS` (365) days.

---

## Stack

| Layer | Technology |
|---|---|
| Server | Node.js 22 + Express 5 |
| Views | Server-rendered EJS, mobile-first CSS, no build step |
| Database | Supabase PostgreSQL via PostgREST (`@supabase/supabase-js`) |
| Files | Supabase Storage — private buckets `cvs` and `media` |
| Uploads | Multer (in memory) + magic-byte validation |
| Authentication | Custom database-backed sessions (does not use Supabase Auth) |

Logic that PostgREST cannot express (aggregations, multi-field search, transactional operations) lives in Postgres as **views and `jsonb` functions** — see [`migrations/0002_views_rpc.sql`](migrations/0002_views_rpc.sql).

---

## Getting started

**Requirements:** Node.js 22.x (pinned in `engines`; Vercel and CI use it) and a [Supabase](https://supabase.com) project.

### 1. Install and configure

```bash
git clone https://github.com/NexForge-Dev/Fichame.git
cd Fichame
npm install
cp .env.example .env
```

Fill in `.env` with the values from **Supabase → Project Settings → API**:

- `SUPABASE_URL`
- `SUPABASE_ANON_KEY`
- `SUPABASE_SERVICE_ROLE_KEY` — secret, **backend only**

### 2. Create the schema

**Option A — from the terminal** (requires `psql` and `DATABASE_URL` in `.env`):

```bash
npm run migrate
```

**Option B — from the dashboard:** in **SQL Editor → New query**, paste and run in order:

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

Migrations are idempotent. `0000_reset.sql` is **destructive** (drops the schema) and only runs with `npm run migrate -- --reset`.

### 3. Check and start

```bash
npm run check    # validates .env, migrations, views and private buckets
npm run setup    # creates the platform admin (requires ADMIN_PASSWORD)
npm run dev      # http://localhost:3000, with auto-reload
```

The server checks Supabase on startup and refuses to serve if a migration or bucket is missing, telling you what to fix.

### 4. First use

1. Register a business at `/registro` — you land straight in the dashboard.
2. Create a position under **Vacantes**.
3. Under **Mi restaurante**, copy the tag URL (`https://<APP_URL>/r/<slug>`) and write it to the NFC tag.

> Set `APP_URL` to the real domain **before** writing the tags.

---

## Scripts

| Command | Description |
|---|---|
| `npm start` | Starts the server |
| `npm run dev` | Starts with auto-reload (`node --watch`) |
| `npm run migrate` | Applies migrations via `psql` (`--reset`, `--so <n>`) |
| `npm run check` | Environment and Supabase diagnostics |
| `npm run setup` | Creates the platform admin |
| `npm run retention` | Per-business retention — **dry run** by default; `--aplicar` erases expired applications, CVs (DB + Storage), orphaned CVs, expired sessions/tokens/logs |
| `npm run delete-account` | Account closure without orphans (`--id`, `--slug`, `--aplicar`) |
| `npm run demo:seed` | Creates (or recreates) the demo business |
| `npm test` | Unit + HTTP (no DB) + migrations on a temporary DB. Does **not** touch Supabase |
| `npm run test:unit` / `test:db` | Each suite on its own |
| `EZCV_E2E_CONFIRM=1 npm run test:e2e` | E2E — writes to the DB in `.env` (data is tagged and deleted at the end). Better: a test Supabase project + `EZCV_E2E_PROJECT_REF` |
| `npm run audit` | `npm audit` of production dependencies |

---

## Environment variables

See [`.env.example`](.env.example) for the commented list.

| Variable | Default | Description |
|---|---|---|
| `PORT` | `3000` | HTTP port |
| `APP_URL` | `http://localhost:3000` | Public URL — **base of the NFC URLs** |
| `SUPABASE_URL` | — | **Required** |
| `SUPABASE_ANON_KEY` | — | Publishable key |
| `SUPABASE_SERVICE_ROLE_KEY` | — | **Required.** Never in the frontend, in git or in logs |
| `SUPABASE_BUCKET_CVS` / `_MEDIA` | `cvs` / `media` | Private buckets |
| `DATABASE_URL` | — | Only for `npm run migrate`; the app does not use it |
| `SESSION_TTL_DAYS` | `30` | Business session lifetime (anonymous sessions: 2 h) |
| `COOKIE_SECURE` / `TRUST_PROXY` | `0` (on Vercel: `1`) | `1` in production with HTTPS / behind a proxy. On Vercel they turn on automatically; in production a non-https `APP_URL` prevents startup |
| `MAX_CV_MB` / `MAX_IMAGE_MB` | `4` / `2` | Upload limits. On Vercel the CV is clamped to 4 MB (4.5 MB per-request limit) with a warning |
| `ADMIN_EMAIL` / `ADMIN_PASSWORD` / `ADMIN_NAME` | — | Admin seed |
| `SMTP_*` | empty | Without SMTP there are no email alerts and password recovery goes through the admin (`/admin/usuarios`). Without `SMTP_SECURE=1`, STARTTLS is mandatory |
| `OPERATOR_*` | placeholders | Identification of the Fíchame operator on the legal pages |
| `CRON_SECRET` / `RETENTION_AUTO` | — / `0` | Daily technical cleanup via `GET /internal/cleanup` (Vercel Cron in `vercel.json`, needs only `CRON_SECRET`); erasure of applications via `GET /internal/retention` (also needs `RETENTION_AUTO=1`) |
| `SECURITY_LOG_DAYS` / `RIGHTS_REQUEST_DAYS` | `365` / `1095` | Retention of logs and closed rights requests |
| `CONTACT_EMAIL` | — | Optional “Write to us” button on `/conoce` |
| `GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET` | — | Optional Google login. The button only shows when the id ends in `.apps.googleusercontent.com` and the secret is set (otherwise a startup warning) |
| `LOG_HMAC_SECRET` | derived from the service key | Secret used to pseudonymise emails in logs |
| `LEGAL_REVIEWED` | — | `1` hides the “BORRADOR — REQUIERE REVISIÓN JURÍDICA” banner. Set only after a real legal review |

---

## Project structure

```
migrations/          versioned SQL: tables, RLS, views/RPC, storage
src/
  server.js          startup (checks Supabase before serving)
  app.js             Express: middleware, security headers, routes
  config.js          environment loading and validation
  db/                Supabase client, migrate, check, seed, retention
  middleware/        session, csrf, auth, rate limit, uploads
  lib/               crypto, slug, statuses, consent, storage, mailer
  locales/           UI translations (English, Portuguese)
  routes/            public (NFC), auth, panel, admin, legal
  views/             EJS templates
public/              client-side CSS and JS
test/                unit, HTTP, DB and E2E tests
docs/                technical documentation
```

---

## Security

- Authorization always enforced on the backend, filtered by the session's `restaurant_id` — other tenants' IDs return 404.
- **Deny-all** Row Level Security on every table, with privileges revoked from `anon`/`authenticated`.
- CVs in a private bucket with random names, served only through the authenticated route after an ownership check; no public or signed URLs.
- Uploads validated by extension, MIME type, magic bytes and size.
- Tenant integrity also enforced in the DB: composite FKs `(id, restaurant_id)` and a CHECK on the CV's Storage folder.
- Passwords hashed with `scrypt` (min. 10 chars); login without user enumeration; password recovery with a single-use token (hashed, 30 min); changing/resetting the password ends other sessions.
- Sessions with an opaque token (only the hash in the DB), `__Host-` + `Secure` cookie in production, `HttpOnly`, `SameSite=Lax`.
- CSRF protection on every POST; in-memory and DB-shared rate limiting; honeypot; duplicates handled without leaking information.
- PDFs: magic bytes checked; active content (JavaScript, embedded files, XFA…) and truncated files rejected.
- Strict CSP with no inline scripts, HSTS (production), `no-store` on dynamic responses, `noindex` outside public pages.
- Audit log (no personal content): CV access, exports, erasures, notes, status changes, settings; truncated IP on candidate events.

Full inventory in [`docs/DOCUMENTACAO.md` §8](docs/DOCUMENTACAO.md#8-segurança-inventário).

> **Data protection:** Fíchame was designed with data-protection and security measures, subject to proper configuration, each party's responsibilities and the applicable legal review. **It is not a statement of compliance.** There are PRODUCTION BLOCKERS and LEGAL REVIEW REQUIRED items — see [`docs/security/production-compliance-gate.md`](docs/security/production-compliance-gate.md) and [`docs/legal/00-legal-review-required.md`](docs/legal/00-legal-review-required.md). For candidate data, the proposed roles are: business = controller, Fíchame = processor (per-processing analysis in `docs/legal/02-…`).

---

## Tests

```bash
npm test                              # no Supabase needed (also runs in CI: .github/workflows/ci.yml)
EZCV_E2E_CONFIRM=1 npm run test:e2e   # E2E, writes to the Supabase project in .env
```

- `test/http.test.js` — boots the app without a DB: health endpoint and refused-config fallback, legal draft banner, internal endpoints, multipart outside upload routes, cache headers and config validation.
- `test/unit.test.js` — no network: PDF and filename validation, protected-characteristics detector, IP truncation, password policy, consent texts, headers.
- `test/db.js` — creates a **temporary** PostgreSQL (initdb), simulates Supabase, applies the migrations twice and tests tenant isolation in the DB, reservation/consent, per-tenant retention, `legal_hold`, erasure, `anon` permissions and self-diagnostics. Requires the PostgreSQL binaries (`PG_BIN`).
- `test/smoke.js` — E2E against Supabase (only with `EZCV_E2E_CONFIRM=1` or `EZCV_E2E_PROJECT_REF`): full flow, legal information, A↔B IDOR, malicious uploads, XSS, CSRF, headers, enumeration, brute force, password recovery, session invalidation, rights (export, erasure, withdrawal), auditing, admin without access to candidates.

Each run tags its data with a unique prefix and deletes it at the end with `purge_test_data`, including Storage objects.

---

## Before going to production

Resolve the **BLOCKERS** in [`docs/security/production-compliance-gate.md`](docs/security/production-compliance-gate.md), in particular:

- Legal opinion on **placement agency** status (Spanish Ley 3/2023) — [`docs/legal/01-…`](docs/legal/01-analisis-agencia-colocacion.md).
- Operator details (`OPERATOR_*`), EU regions and DPAs for Supabase/Vercel, reviewed legal texts.
- HTTPS with `COOKIE_SECURE=1`, `TRUST_PROXY=1`, `APP_URL=https://…`; real SMTP.
- `CRON_SECRET` set on Vercel (daily technical cleanup); retention periods validated before `RETENTION_AUTO=1`.
- Backups (retention, tested restore) and 2FA on Supabase/Vercel/GitHub.
- Supabase Auth sign-ups turned off (the app has its own sessions and never uses Supabase Auth).
- Uptime monitor on `GET /api/health` (booleans only: `config`, `db`, `migrations`, `ok`; 200 or 503).

Today's deploy steps (Vercel env vars, SQL, Supabase dashboard): [`docs/DEPLOY-TODAY.md`](docs/DEPLOY-TODAY.md).
- Technical to-dos: email verification at sign-up, 2FA for businesses, multiple users per business (RBAC).
- Real pagination in the application list (it currently shows 200 plus the real filtered total).

Full list in [`docs/DOCUMENTACAO.md` §12](docs/DOCUMENTACAO.md#12-pendências-produção).

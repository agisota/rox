# Deploy secrets — what to set, and where

This is a **names-only** reference. No secret values live in the repo. It maps
each red deploy check to the GitHub **repository secret** / **variable** (or
Vercel project env var) the maintainer must set in the dashboards.

> Set GitHub secrets at: repo → Settings → Secrets and variables → Actions.
> Set Vercel env at: Vercel project → Settings → Environment Variables.
>
> Code can't set these. Until they're set, the deploy checks are red by design;
> the app code and all CI code-checks (lint/typecheck/test/build) are unaffected.

## Deploy checks → required secret/variable

| Red check | Needs | Where |
| --- | --- | --- |
| Deploy Database (Neon) | `NEON_API_KEY` (secret), `NEON_PROJECT_ID` (variable) | GitHub Actions |
| Deploy Web / API / Admin / Marketing / Docs (Vercel) | `VERCEL_TOKEN`, per-app `*_ALIAS`, app env (below) | GitHub Actions + Vercel |

The Neon preview job runs `neondatabase/create-branch-action`; it only needs the
two Neon entries above. Vercel deploys need `VERCEL_TOKEN` plus the runtime env
each app reads (database, auth, providers).

## Variable names by area (fill values in the dashboards)

### Database (Neon)
- `DATABASE_URL`
- `DATABASE_URL_UNPOOLED`
- `NEON_API_KEY` (secret), `NEON_PROJECT_ID` (variable)

### Auth
- `BETTER_AUTH_SECRET`
- `BETTER_AUTH_API_KEY`
- `SECRETS_ENCRYPTION_KEY`

### Public URLs / aliases (per app)
- `NEXT_PUBLIC_WEB_URL`, `NEXT_PUBLIC_API_URL`, `NEXT_PUBLIC_ADMIN_URL`,
  `NEXT_PUBLIC_MARKETING_URL`, `NEXT_PUBLIC_DOCS_URL`, `NEXT_PUBLIC_COOKIE_DOMAIN`
- `API_ALIAS`, `ADMIN_ALIAS`, `MARKETING_ALIAS`, `DOCS_ALIAS`

### Analytics / telemetry
- `NEXT_PUBLIC_POSTHOG_KEY`, `NEXT_PUBLIC_POSTHOG_HOST`, `POSTHOG_API_KEY`,
  `POSTHOG_PROJECT_ID`
- `NEXT_PUBLIC_OPENPANEL_CLIENT_ID`, `OPENPANEL_API_URL` (OpenPanel slice; unset = no-op)
- Sentry: `SENTRY_AUTH_TOKEN`, `NEXT_PUBLIC_SENTRY_DSN_WEB`/`_API`/`_ADMIN`/`_MARKETING`/`_DOCS`, `SENTRY_DSN_DESKTOP`

### GitHub App (integrations)
- `GH_APP_ID`, `GH_CLIENT_ID`, `GH_CLIENT_SECRET`, `GH_APP_PRIVATE_KEY`, `GH_WEBHOOK_SECRET`

### OAuth providers
- `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`
- `LINEAR_CLIENT_ID`, `LINEAR_CLIENT_SECRET`, `LINEAR_WEBHOOK_SECRET`

### Queues / cache (Upstash)
- `QSTASH_URL`, `QSTASH_TOKEN`, `QSTASH_CURRENT_SIGNING_KEY`, `QSTASH_NEXT_SIGNING_KEY`
- `KV_REST_API_URL`, `KV_REST_API_TOKEN`, `KV_URL`

### Storage
- `BLOB_READ_WRITE_TOKEN` (or S3/R2 equivalents)

### Email
- `RESEND_API_KEY`

### CDN / DNS
- `CLOUDFLARE_API_TOKEN`, `CLOUDFLARE_ACCOUNT_ID`

### AI (Rox model gateway)
- `ANTHROPIC_API_KEY` (and any Rox gateway base-url/key the runtime reads)

### Crypto top-ups (dv.net slice)
- `DVNET_API_KEY`, `DVNET_API_URL` (unset = crypto top-ups disabled, no crash)

### Desktop signing / release (only for desktop release workflows)
- `APPLE_ID`, `APPLE_ID_PASSWORD`, `APPLE_TEAM_ID`, `MAC_CERTIFICATE`,
  `MAC_CERTIFICATE_PASSWORD`, `HOMEBREW_TAP_TOKEN`

---

⚠️ If any of these were ever shared in plaintext (chat, screenshot, ticket),
**rotate them** before/after setting — sharing exposes them regardless of intent.

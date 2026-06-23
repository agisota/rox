# rox-email-inbound (Cloudflare Email Worker — D3)

Catch-all `*@rox.one` inbound ingest for the D3 per-user email domain.

**STANDALONE.** This Worker is intentionally NOT part of the Rox bun/turbo
workspace (`workers/*` is excluded from `package.json#workspaces`), so it never
participates in root `bun install` / `turbo run build|typecheck|test` and cannot
break monorepo CI. Install + typecheck + deploy it from this directory only.

## Flow

```
external sender ─SMTP→ Cloudflare MX (rox.one) ─catch-all→ this Worker
  → parse MIME (postal-mime)
  → stream raw .eml + attachments → R2 (MAIL_BUCKET)
  → HMAC-sign a compact JSON envelope (metadata + R2 keys; NO bodies)
  → POST /api/mail/inbound  (X-Rox-Mail-Signature / -Timestamp / -Nonce)
```

The API does the heavy work (handle→user resolution, spam scoring/quarantine,
DB writes, D1 unified-inbox emit). The Worker stays a thin, signed ingester.

## Deploy (manual — never from CI)

```bash
cd workers/email-inbound
bun install                       # or npm/pnpm — standalone lockfile
wrangler secret put MAIL_INBOUND_SECRET   # MUST equal the API's MAIL_INBOUND_SECRET
wrangler deploy
```

Then, in the Cloudflare dashboard for the `rox.one` zone, enable Email Routing
and add a catch-all rule routing `*@rox.one` to this Worker. Requires the
**Workers Paid** plan (the free tier's 10 ms CPU cap is too small for MIME parse
+ R2 streaming; paid gives 30 s).

## Config

| Binding / var          | Purpose                                            |
| ---------------------- | -------------------------------------------------- |
| `MAIL_BUCKET` (R2)     | raw `.eml` + attachment object store               |
| `ROX_API_URL`          | API origin for the signed POST                     |
| `MAIL_INBOUND_SECRET`  | HMAC key — must match the API secret               |
| `MAX_INBOUND_BYTES`    | size cap (Cloudflare hard cap 25 MiB)              |

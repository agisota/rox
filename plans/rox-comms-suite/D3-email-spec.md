## D3 — Per-User Email (`username@rox.one`)

> Domain D3 of the Rox Comms Suite. Owns every user's externally reachable mailbox at
> `username@rox.one`, hung off the canonical Rox handle (ROX-522). Inbound is ingested via
> Cloudflare Email Routing → Email Worker → Rox API; outbound is sent through Resend.
> Bodies/attachments live in Drive (D8); D3 stores only structured metadata + a pointer.
> Parsed messages feed the unified inbox (D1) through the same `messages` envelope shape.

---

### 1 Scope & user stories

**In scope**
- Provision one routable address `<handle>@rox.one` per user, derived 1:1 from `user_profiles.handle` (ROX-522). No second namespace — the handle *is* the local part.
- INBOUND: receive any mail to `<handle>@rox.one`, parse it, persist envelope + body pointer + attachments, raise an event into the unified inbox (D1), and de-dup/thread it.
- OUTBOUND: send as `<handle>@rox.one` via Resend (already a dependency at `packages/email`), with correct From/Reply-To, threading headers, and per-user rate/quota enforcement (WS-E token economy).
- Domain auth: MX, SPF, DKIM, DMARC, and an optional per-user "verified sender" gate.
- Abuse/spam controls on both directions (inbound scoring + outbound throttling/blocklists).
- Optional: real IMAP/SMTP access for external clients (Thunderbird/Apple Mail) — *evaluated, deferred to Phase 5* (see §3).

**Out of scope (owned elsewhere)**
- Blob storage of raw `.eml` + attachments → **D8/Drive** (R2). D3 only writes/reads pointers.
- Unified cross-channel inbox UI/aggregation → **D1**. D3 emits into it.
- Calendar invites parsing (`.ics`) → D5; D3 only flags `has_calendar_invite`.
- Contact resolution → reuses existing `identity_links` (`kind='email'`) via `resolveIdentity`.

**User stories**
1. As a new Rox user with handle `mark`, I automatically get `mark@rox.one` reachable from any external sender, with zero setup.
2. As a user, mail sent to me appears in my Rox inbox within seconds, threaded, with attachments downloadable from Drive.
3. As a user, I can compose and reply from `mark@rox.one`; recipients see it pass SPF/DKIM/DMARC (no spam folder).
4. As a user, replies I send thread correctly in the external recipient's client (In-Reply-To/References preserved).
5. As an operator, inbound spam is scored and quarantined, not delivered to the inbox; outbound abuse is throttled per token balance.
6. As a power user, I can (later) connect Apple Mail over IMAP/SMTP and see the same mailbox.
7. As a user, if I rename my handle, my old address keeps receiving for a grace window (alias) so mail isn't lost.

---

### 2 Target design

**ASCII flow**

```
INBOUND
  external sender ──SMTP──▶ Cloudflare MX (rox.one zone, CF-managed)
                              │  Email Routing rule: *@rox.one ─▶ Email Worker (catch-all)
                              ▼
                    ┌──────────────────────────────┐
                    │ Email Worker (apps/relay-mail │  edge, Workers Paid
                    │  OR workers/email-inbound)    │  - parse headers (postal-mime)
                    │                               │  - reject > limits / failed SPF+DMARC
                    │                               │  - stream raw .eml ▶ R2 (Drive/D8)
                    │                               │  - HMAC-sign compact JSON envelope
                    └───────────────┬───────────────┘
                                    │ POST /api/mail/inbound  (HMAC + nonce)
                                    ▼
                    ┌──────────────────────────────┐
                    │ Rox API (apps/api)            │
                    │  - verify HMAC + replay guard │
                    │  - resolve handle ▶ userId    │
                    │  - resolveIdentity(email)     │  (existing identity_links)
                    │  - spam score + quarantine    │
                    │  - upsert mail_messages +     │
                    │    mail_attachments + thread  │
                    │  - emit unified-inbox event   │ ───▶ D1 (messages envelope)
                    └──────────────────────────────┘
                                    │
                          Electric live-sync ▶ web / desktop / mobile inbox

OUTBOUND
  client compose ─tRPC─▶ mail.send ─▶ quota check (WS-E) ─▶ Resend API
                                          │  From: <handle>@rox.one (DKIM-signed by Resend)
                                          ▼
                              persist mail_messages(direction=out, status)
                              raw .eml ▶ R2 (Drive/D8)
                              Resend delivery webhook ─▶ /api/mail/events ─▶ status update
```

**Why API in the middle (not Worker-direct-to-DB):** the Worker has no Neon driver/Drizzle and 30s CPU cap; keeping the heavy write path in `apps/api` reuses `resolveIdentity`, the economy ledger, and Electric publication. The Worker stays a thin, signed ingester.

**ERD (additive to `packages/db/src/schema`, new file `mail.ts`, all tables prefixed `mail_`)**

Conventions follow the repo: `uuid().primaryKey().defaultRandom()`, `organization_id` FK → `organizations.id` (cascade), `withTimezone` timestamps, `pgEnum` values declared in `enums.ts`.

```
mail_addresses            -- the routable identity, 1:1 with handle (+ aliases)
  id                uuid  PK
  user_id           uuid  FK auth.users.id (cascade)            NOT NULL
  organization_id   uuid  FK organizations.id (cascade)         NOT NULL
  local_part        text  NOT NULL          -- '<handle>' normalized lowercase
  domain            text  NOT NULL default 'rox.one'
  address           text  NOT NULL          -- generated 'local_part@domain', stored normalized
  kind              mail_address_kind NOT NULL default 'primary'  -- primary | alias
  status            mail_address_status NOT NULL default 'active' -- active | grace | disabled
  grace_until       timestamptz NULL        -- for renamed-handle aliases
  created_at        timestamptz NOT NULL default now()
  INDEX  mail_addresses_user_idx (user_id)
  UNIQUE mail_addresses_address_uniq (address)               -- global: one owner per address
  INDEX  mail_addresses_org_idx (organization_id)

mail_threads              -- conversation grouping (RFC References / subject-normalized)
  id                uuid  PK
  organization_id   uuid  FK organizations.id (cascade)         NOT NULL
  owner_user_id     uuid  FK auth.users.id (cascade)            NOT NULL
  root_message_ref  text  NULL              -- first Message-ID seen
  subject_norm      text  NULL              -- subject with re:/fwd: stripped, for fallback grouping
  last_message_at   timestamptz NOT NULL default now()
  message_count     integer NOT NULL default 0
  created_at        timestamptz NOT NULL default now()
  INDEX  mail_threads_owner_last_idx (owner_user_id, last_message_at DESC)
  INDEX  mail_threads_org_idx (organization_id)

mail_messages             -- one row per inbound/outbound message (envelope only)
  id                uuid  PK
  organization_id   uuid  FK organizations.id (cascade)         NOT NULL
  owner_user_id     uuid  FK auth.users.id (cascade)            NOT NULL  -- the rox mailbox owner
  address_id        uuid  FK mail_addresses.id (set null)       NULL      -- which rox address
  thread_id         uuid  FK mail_threads.id (cascade)          NULL
  direction         mail_direction NOT NULL                     -- inbound | outbound
  status            mail_status NOT NULL                        -- received|quarantined|sending|sent|delivered|bounced|failed
  rfc_message_id    text  NULL              -- Message-ID header (for threading + dedup)
  in_reply_to       text  NULL
  references_ids    text[] NULL
  from_addr         text  NOT NULL
  from_name         text  NULL
  to_addrs          text[] NOT NULL
  cc_addrs          text[] NULL default '{}'
  bcc_addrs         text[] NULL default '{}'
  reply_to          text  NULL
  subject           text  NULL
  snippet           text  NULL              -- first ~200 chars plaintext, for list view (no body here)
  raw_blob_key      text  NULL              -- D8/R2 object key for full .eml
  body_text_key     text  NULL              -- R2 key for extracted text/plain
  body_html_key     text  NULL              -- R2 key for sanitized text/html
  has_attachments   boolean NOT NULL default false
  has_calendar_invite boolean NOT NULL default false
  spam_score        integer NULL            -- 0..100; >= threshold ⇒ quarantined
  spf_pass          boolean NULL
  dkim_pass         boolean NULL
  dmarc_pass        boolean NULL
  provider          mail_provider NOT NULL  -- cloudflare | resend
  provider_event_id text  NULL              -- Resend email_id / CF message id
  is_read           boolean NOT NULL default false
  received_at       timestamptz NULL
  sent_at           timestamptz NULL
  created_at        timestamptz NOT NULL default now()
  UNIQUE mail_messages_owner_msgid_uniq (owner_user_id, rfc_message_id)  -- idempotent ingest
  INDEX  mail_messages_owner_received_idx (owner_user_id, received_at DESC)
  INDEX  mail_messages_thread_idx (thread_id)
  INDEX  mail_messages_status_idx (status)
  INDEX  mail_messages_org_idx (organization_id)

mail_attachments          -- per-attachment metadata, content in Drive/D8 (R2)
  id                uuid  PK
  message_id        uuid  FK mail_messages.id (cascade)         NOT NULL
  organization_id   uuid  FK organizations.id (cascade)         NOT NULL
  filename          text  NOT NULL
  content_type      text  NOT NULL
  size_bytes        integer NOT NULL
  content_id        text  NULL              -- for inline (cid:) references
  is_inline         boolean NOT NULL default false
  blob_key          text  NOT NULL          -- D8/R2 object key
  drive_file_id     uuid  NULL              -- FK to D8 drive file row when promoted to Drive
  created_at        timestamptz NOT NULL default now()
  INDEX  mail_attachments_message_idx (message_id)
  INDEX  mail_attachments_org_idx (organization_id)

mail_events               -- raw provider webhook/delivery log (audit + replay-debug)
  id                uuid  PK
  organization_id   uuid  FK organizations.id (cascade)         NULL
  message_id        uuid  FK mail_messages.id (set null)        NULL
  provider          mail_provider NOT NULL
  event_type        text  NOT NULL          -- received|delivered|bounced|complained|delivery_delayed...
  provider_event_id text  NULL
  payload           jsonb NOT NULL
  created_at        timestamptz NOT NULL default now()
  UNIQUE mail_events_provider_evt_uniq (provider, provider_event_id)  -- webhook dedup
  INDEX  mail_events_message_idx (message_id)
```

**New `enums.ts` values (append-only, end of file):**
- `mailAddressKindValues = ["primary","alias"]`
- `mailAddressStatusValues = ["active","grace","disabled"]`
- `mailDirectionValues = ["inbound","outbound"]`
- `mailStatusValues = ["received","quarantined","sending","sent","delivered","bounced","failed"]`
- `mailProviderValues = ["cloudflare","resend"]`

**Reuse, do not duplicate:** contact resolution uses existing `identity_links` (`kind='email'`, `value=from_addr` lowercased) via `resolveIdentity`. The unified inbox (D1) is fed by emitting a message-envelope event keyed by `mail_messages.id`; D3 does not own that table.

---

### 3 Providers / tech choices + tradeoffs

**Inbound transport — DECISION: Cloudflare Email Routing → Email Worker.**

| Option | Pros | Cons | Verdict |
|---|---|---|---|
| **Cloudflare Email Routing + Worker** | rox.one DNS zone already on Cloudflare → MX is one API call; no extra vendor/cost; raw MIME stream available at edge; can stream `.eml` straight to **R2 (same Cloudflare account, zero egress)**; reject/spam at edge before any DB write; catch-all `*@rox.one` → one Worker handles all users. | 25 MiB inbound cap; Worker free-tier CPU 10ms (need **Workers Paid**, 30s); we parse MIME ourselves (postal-mime); no built-in inbound spam UI. | **CHOSEN.** Tightest fit with existing infra (R2 D8 + CF zone), lowest marginal cost, edge-side abuse rejection. |
| Resend inbound | Same vendor as outbound; stores message even if webhook down; replay in dashboard; `resend.webhooks.verify()`. | **Webhook is metadata-only** — body + each attachment require *separate* API round-trips (latency, failure points, Resend-side egress); ties our mailbox store to Resend retention; another MX dependency. | Fallback only. |
| Postmark inbound | Full content + base64 attachments + `StrippedTextReply` in **one** webhook; HTTP Basic Auth; 10 retries. | Separate vendor; per-message cost; attachments inline inflate payloads; doesn't co-locate with R2. | Good ergonomics, but not co-located with our storage; not chosen. |
| Mailgun inbound | Mature routes/regex matching. | Extra vendor, deliverability reputation work, cost. | Not chosen. |

**Outbound — DECISION: Resend** (already `resend@4.8.0` in `packages/email`). Per-user From `<handle>@rox.one`; Resend signs DKIM for the `rox.one` sending domain. Track delivery via Resend webhooks → `/api/mail/events`. (Cloudflare Email Service can also *send* via Worker binding, but Resend gives us templates/React-email, suppression lists, and is already wired — keep it.)

**Storage of bodies + attachments — DECISION: R2 via D8/Drive.** Raw `.eml`, extracted text/html, and attachments are objects in R2 under the user's Drive namespace (counts toward the 10 GB free quota; overage bills via WS-E). D3 stores only object keys. This is consistent with the suite-wide storage decision (R2: S3-compatible, public buckets for share links, zero egress, same CF account as the email zone).

**Real IMAP/SMTP mailboxes (external clients) — EVALUATED, DEFERRED to Phase 5.** Cloudflare/Resend give us *programmatic* mail, not an IMAP server. To offer Apple Mail/Thunderbird we'd either (a) run/operate an IMAP+SMTP stack (Stalwart/Dovecot) — heavy ops, deliverability burden — or (b) resell a hosted provider (**Migadu** flat per-domain pricing, or **Purelymail** cheap per-user) pointed at `rox.one`. Recommendation: ship the in-app inbox first (Phases 1-4); if external-client demand is real, integrate **Migadu** (single MX for the domain, IMAP/SMTP creds per mailbox) rather than building an IMAP server. This conflicts with the catch-all Worker MX, so IMAP would require a subdomain split (e.g. `imap.rox.one` mailboxes vs Worker catch-all) — call out as an open question (§7).

**Worker contract — `POST /api/mail/inbound`** (Worker → API):
```
Headers:
  X-Rox-Mail-Signature: hex(HMAC-SHA256(secret, body))
  X-Rox-Mail-Timestamp: <unix ms>        // reject if skew > 5 min (replay guard)
  X-Rox-Mail-Nonce:     <uuid>           // stored short-TTL for dedup
Body (application/json):
{
  "rcptTo": "mark@rox.one",
  "mailFrom": "alice@example.com",
  "fromName": "Alice",
  "messageId": "<...>",
  "inReplyTo": "<...>|null",
  "references": ["<...>"],
  "subject": "...",
  "to": ["mark@rox.one"], "cc": [], "bcc": [],
  "replyTo": "...|null",
  "rawSize": 12345,
  "rawBlobKey": "mail/raw/<owner>/<uuid>.eml",   // Worker already streamed to R2
  "snippet": "first 200 chars text...",
  "auth": { "spf": true, "dkim": true, "dmarc": true },
  "attachments": [
    { "filename":"a.pdf","contentType":"application/pdf","sizeBytes":1024,
      "contentId":null,"isInline":false,"blobKey":"mail/att/<owner>/<uuid>" }
  ],
  "hasCalendarInvite": false
}
Response: 200 {accepted:true,messageId} | 202 {quarantined:true} | 401 bad-sig | 404 no-such-handle | 409 duplicate
```
Worker rejects (`message.setReject`) before POST when: size > 25 MiB, recipient handle unknown (catch-all default-reject to avoid backscatter), or SPF+DMARC both hard-fail from an enforcing domain. Everything else is POSTed; spam *scoring/quarantine* happens API-side so we keep the message.

---

### 4 Phased tasks (bite-sized; file paths; test approach — no code here)

**Phase 0 — DNS & domain auth (S, ops, no code merge)**
- Configure Cloudflare for `rox.one`: MX records, SPF (`v=spf1 include:resend ... include:cloudflare ~all`), DKIM CNAMEs for Resend sending domain, DMARC TXT (`p=quarantine; rua=...`). Document in `plans/rox-comms-suite/dns/rox-one-mail.md`.
- Verify Resend sending domain `rox.one`; confirm DKIM green. Evidence: `dig MX/TXT` + Resend dashboard screenshot.

**Phase 1 — Schema (M)**
- `T1` Append the 5 enum value arrays to `packages/db/src/schema/enums.ts` (end of file, append-only).
- `T2` New `packages/db/src/schema/mail.ts`: `mail_addresses`, `mail_threads`, `mail_messages`, `mail_attachments`, `mail_events` + Drizzle `relations`. Re-export `Insert*/Select*` types.
- `T3` Add `export * from "./mail"` to `packages/db/src/schema/index.ts`.
- `T4` `bunx drizzle-kit generate --name="add_mail_tables"` (offline diff only — never migrate/push prod).
- *Test:* `bun test packages/db` (schema imports compile, types infer); review generated SQL by hand for additive-only.

**Phase 2 — Inbound Worker + ingest (L)**
- `T5` New Worker package `apps/relay-mail/` (or `workers/email-inbound/`): `wrangler.jsonc` (Email + R2 + secret bindings), `src/index.ts` `email()` handler using `postal-mime`, streaming raw + attachments to R2, building the signed envelope, POSTing to API. Catch-all default-reject for unknown handles.
- `T6` API route `apps/api/src/app/api/mail/inbound/route.ts`: HMAC + timestamp + nonce verification (mirror `apps/api/src/app/api/integrations/telegram/webhook/route.ts` patterns), handle→user resolution against `mail_addresses` (incl. `grace` aliases), `resolveIdentity` for sender contact, idempotent upsert into `mail_messages`/`mail_attachments`, threading (by `references`/`in_reply_to`, fallback `subject_norm`), `mail_events` insert.
- `T7` Spam scoring helper `packages/email/src/lib/spam-score.ts`: combine SPF/DKIM/DMARC + simple heuristics → `spam_score`; >= threshold ⇒ `status='quarantined'` (not emitted to D1 inbox).
- `T8` Emit unified-inbox event (D1 envelope) on accepted, non-quarantined inbound.
- *Test:* `apps/api/.../inbound/route.test.ts` with fixture envelopes (valid sig, bad sig, replay, duplicate Message-ID, unknown handle, spam-quarantine, threading by References). Worker: unit-test the parse/sign pure functions with sample `.eml` fixtures (Workers `vitest` pool or extracted pure modules).

**Phase 3 — Outbound send + tRPC (M)**
- `T9` `packages/trpc/src/router/mail/mail.ts` (+ `index.ts`), register in `packages/trpc/src/root.ts` (append-only, after existing routers): `mail.send` (compose/reply: quota check via WS-E `roxBalances`/`roxLedger`, Resend send as `<handle>@rox.one`, persist `mail_messages` direction=out, stream `.eml` to R2), `mail.list` (paginated by thread/owner), `mail.getThread`, `mail.markRead`, `mail.getAttachmentUrl` (signed R2 URL).
- `T10` Resend delivery webhook `apps/api/src/app/api/mail/events/route.ts`: `resend.webhooks.verify()` (Svix), dedup via `mail_events_provider_evt_uniq`, update `mail_messages.status` (delivered/bounced/complained → also feed outbound abuse counters).
- *Test:* router unit tests mocking Resend client + balance helpers (assert quota gate blocks when balance insufficient, From is `<handle>@rox.one`, threading headers set on reply). Webhook test: signature verify + status transitions + dedup.

**Phase 4 — Provisioning, aliases, client wiring (M)**
- `T11` Provision hook: on `user_profiles` handle create/rename, upsert `mail_addresses` (`primary`), and on rename mark old as `alias` `status='grace'` with `grace_until = now()+30d`. Place in profile/identity service path; reuse handle-normalization util.
- `T12` Client surfaces: inbox list + thread view consuming Electric-synced `mail_messages`/`mail_threads` (cache-first per AGENTS.md rule), compose/reply UI calling `mail.send`, attachment download via `mail.getAttachmentUrl`. Shared in `packages/chat`/`packages/ui` where applicable; mounted in web + desktop + mobile.
- *Test:* component tests for cache-first rendering (existing rows shown before `isReady`), compose validation; e2e smoke for send→delivery-status.

**Phase 5 — (deferred) IMAP/SMTP via Migadu (L)** — only if demand confirmed (§7).

---

### 5 Effort & Risks

**Effort**
| Phase | Size | Rough |
|---|---|---|
| P0 DNS/auth | S | 0.3 wk |
| P1 Schema | M | 0.5 wk |
| P2 Inbound Worker + ingest | L | 1.5 wk |
| P3 Outbound + webhooks | M | 1 wk |
| P4 Provisioning + clients | M | 1 wk |
| P5 IMAP/SMTP (deferred) | L | 2 wk (if pursued) |
| **Total (P0-P4)** | **L** | **~4.3 wk** |

**Risks**
- **Deliverability / reputation (HIGH):** new domain sending → spam folder. Mitigate: DKIM+SPF+DMARC strict, warm-up, monitor Resend bounce/complaint, suppression list. DMARC start at `p=quarantine` then `p=reject`.
- **Inbound spam/backscatter (HIGH):** catch-all invites dictionary spam. Mitigate: edge default-reject unknown handles (no catch-all delivery), SPF+DMARC hard-fail reject at Worker, API-side scoring + quarantine, per-sender rate counters.
- **Outbound abuse / spam cannon (HIGH):** compromised account blasts mail, torching domain reputation. Mitigate: per-user send rate caps + WS-E token cost per send (overage gated by balance), velocity anomaly detection, kill-switch per `mail_addresses.status='disabled'`.
- **Worker CPU/size limits (MED):** 10ms free tier insufficient → must run **Workers Paid** (30s); 25 MiB inbound hard cap → reject larger with clear SMTP error.
- **PII / body exposure (MED):** bodies in R2 must be private-by-default; signed, short-TTL URLs only; never reuse Drive *public* share links for raw mail. Sanitize HTML bodies (strip scripts/trackers) before render.
- **Quota coupling (MED):** mail attachments consume Drive 10 GB; large mailboxes hit quota → overage billing surprises. Mitigate: show mail storage in Drive usage; retention/auto-archive policy option.
- **Handle rename data-loss (MED):** addressed via `grace` alias window; risk if user expects forwarding forever — document the 30-day window.
- **Vendor lock-in (LOW):** envelope abstraction (`mail_provider` enum) lets us swap inbound (CF↔Postmark) or add IMAP later without schema change.

---

### 6 Dependencies on other domains + Rox infra reused

**Depends on**
- **D8/Drive (R2):** object store for raw `.eml`, bodies, attachments; signed-URL issuance; 10 GB quota accounting. Hard dependency for body storage.
- **D1 Unified Inbox:** consumes D3's accepted inbound as a message envelope; D3 must emit in D1's shape.
- **WS-E token economy** (`economy.ts`: `roxBalances`, `roxLedger`, `roxTopups`): per-send quota/cost + storage overage. Reused, not rebuilt.
- **ROX-522 identity / `user_profiles.handle`:** the local part source; provisioning hook listens to handle lifecycle.

**Rox infra reused (no new copies)**
- `packages/email` (`resend@4.8.0`, react-email) for outbound + templates.
- `identity_links` + `resolveIdentity` for sender→contact resolution (`kind='email'`).
- Existing webhook patterns at `apps/api/src/app/api/integrations/*/webhook/route.ts` (signature verify, dedup) as the template for `/api/mail/inbound` and `/api/mail/events`.
- Drizzle/Neon schema conventions (`packages/db/src/schema/_shared.ts`, `enums.ts`); Electric live-sync for client delivery; tRPC root registration pattern (`packages/trpc/src/root.ts`).
- Cloudflare account already owning the `rox.one` zone (DNS + R2 + Workers in one account → zero-egress inbound→storage).

---

### 7 Open questions for the owner

1. **Org scoping:** is a user's mailbox personal (their `organization_id` = personal org) or can a *team* own a shared address (`team@rox.one`)? Schema supports both via `owner_user_id` + `organization_id`, but routing/UX differs — confirm whether shared/team mailboxes are in scope now.
2. **Handle rename grace window:** is 30 days the right alias retention? Permanent alias, or hard cut-off?
3. **External IMAP/SMTP (Phase 5):** real demand? If yes, accept the MX split (Migadu on a subdomain vs Worker catch-all on `rox.one`), or do we want full self-hosted Stalwart? This is the biggest fork.
4. **Inbound retention / archival:** keep all mail forever in R2 (quota cost), or auto-archive/expire after N days? Affects 10 GB free-tier viability.
5. **Quarantine UX:** where do quarantined/spam messages surface — a Spam folder in D1, or hidden entirely? And who can release them?
6. **Outbound send cost:** does each send debit the WS-E ledger (and how much), or is sending free with only *storage* metered? Need the pricing rule before P3.
7. **DMARC posture timeline:** start `p=none` for monitoring, or jump to `p=quarantine`? Determines initial deliverability risk vs spoof protection.
8. **Reply-via-inbound vs reply-via-Resend:** all replies go out through Resend (chosen), but should the Worker's `message.reply()` ever be used for instant auto-responders (e.g. vacation responder) to avoid an API round-trip?

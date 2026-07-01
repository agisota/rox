## D9 — Storage Provider Decision for Rox Drive (10GB/user, public sharing, S3-compatible)

> Status: SPEC (no code). Owner decision required on §3 recommendation and §7 open questions.
> Grounded in: live SSH probe of the `aws-swiss-migration` Tailscale node, the real `packages/db` schema, and current (2026-05/06) Render + Cloudflare R2 facts.

This domain (D9) chooses the **object-storage substrate** that the Rox Drive domain (per-user 10GB free, public share links, overage billed via the WS-E token economy) is built on. It does **not** specify the Drive product surface, the upload UI, or the share-link auth model — those belong to the Drive domain spec. D9's deliverable is: *which bucket(s), why, how they're wired into the Rox monorepo, and what it costs at 1k and 10k users.*

---

### 1 Scope & user stories

**In scope**
- Pick the object-storage backend(s) for Rox Drive: evaluate Render object storage, Cloudflare R2, and the user-owned `aws-swiss-migration` node (MinIO).
- Define how public share links are served (custom domain, CDN, signed URLs).
- Define the storage abstraction layer in the monorepo so the Drive domain is provider-agnostic and the choice is reversible.
- Cost model at 1k and 10k users × 10GB, including the abuse/egress blowup case.
- Tie overage into the existing WS-E economy (`rox_balances` / `rox_ledger` / `usage_requests`).

**Out of scope (other domains)**
- Drive UI, folder model, file picker, react-flow canvas attachments (#293 owns canvas).
- Email attachments / XMPP file transfer wiring (consume D9's storage client, but spec'd elsewhere).
- The username/identity model itself (ROX-522 / `identity.ts` — D9 *hangs* per-user prefixes off the username, it does not define it).

**User stories**
- *As a Rox user* I upload a file to my Drive and get 10GB free; usage and remaining quota are visible.
- *As a Rox user* I create a public share link (`https://drive.rox.one/u/<username>/<token>`) that anyone can open without an account.
- *As a Rox user* I cross 10GB and overage is metered against my token balance instead of being hard-blocked (configurable: soft-meter vs hard-cap).
- *As Rox ops* I can see per-user storage bytes, throttle/abuse-flag a user, and revoke a share link instantly.
- *As Rox ops* the storage bill does not explode from a single user's public link going viral (egress is the cost risk).
- *As a developer* I write against one `StorageProvider` interface and the backend (R2 / MinIO) is a config swap, not a rewrite.

---

### 2 Target design

**ASCII architecture**

```
                        ┌─────────────────────────────────────────────┐
  upload (signed PUT)   │  apps/web · apps/desktop · apps/mobile        │
  ───────────────────►  │  Drive UI  → tRPC drive.* (packages/trpc)     │
                        └───────────────┬───────────────────────────────┘
                                        │ presign / quota / ledger
                                        ▼
                        ┌─────────────────────────────────────────────┐
                        │  apps/api  (drive router)                     │
                        │  packages/storage  ← NEW provider abstraction │
                        │   ├─ R2Provider   (S3 SDK → R2)               │
                        │   └─ MinioProvider(S3 SDK → swiss MinIO)      │
                        │  quota check vs drive_files SUM(bytes)        │
                        │  overage → rox_ledger debit (WS-E)            │
                        └───────┬───────────────────────┬───────────────┘
              signed URL        │                       │ signed URL
              (private get/put) │                       │ (private get/put)
                                ▼                       ▼
        PRIMARY  ┌───────────────────────┐   COLD/BACKUP ┌────────────────────────┐
                 │ Cloudflare R2          │   (optional)  │ aws-swiss-migration     │
                 │ bucket: rox-drive      │  ──nightly──► │ MinIO on /srv/extra     │
                 │ zero egress            │   replicate   │ 467GB free, EC2 use1    │
                 └──────────┬─────────────┘               └──────────┬─────────────┘
                            │ public objects                          │ (private only,
                            ▼                                         │  not public path)
              ┌─────────────────────────────┐                        ▼
              │ drive.rox.one (custom domain)│              Caddy drive-cold.rox.one
              │ Cloudflare CDN + WAF + cache │              (ops/restore only)
              │ → PUBLIC share links         │
              └─────────────────────────────┘
                            ▲
                   anyone (no account)
```

**Why this shape:** R2 is the public-facing primary (zero egress is the whole game for viral share links), the Cloudflare zone already manages `rox.one` DNS so `drive.rox.one` is a CNAME + custom-domain bind, and the swiss MinIO is the owner-controlled cold copy / disaster-recovery target (it already has 467GB free and a public Caddy, but its egress is metered AWS bandwidth so it must **not** be the public hot path).

**ERD — additive tables in `packages/db/src/schema/` (new file `drive.ts`, prefix `drive_`)**

All tables are **additive**. Convention matches existing schema (`snake_case` pgTable names, `rox_*` for economy). Migrations authored offline via `bunx drizzle-kit generate --name="add_drive_tables"` — never `migrate`/`push` prod.

```
drive_files                       one row per stored object
─────────────────────────────────────────────────────────────────────
  id              uuid  PK  default gen_random_uuid()
  owner_user_id   uuid  NOT NULL  FK → auth user (.id)         [idx]
  storage_key     text  NOT NULL  UNIQUE   "u/<username>/<uuid>/<name>"
  provider        text  NOT NULL  enum: 'r2' | 'minio'  default 'r2'
  bucket          text  NOT NULL                       (e.g. 'rox-drive')
  byte_size       bigint NOT NULL                       (quota math)
  content_type    text  NOT NULL
  checksum_sha256 text  NULL                            (dedupe / integrity)
  is_public       boolean NOT NULL default false
  parent_folder_id uuid NULL  FK → drive_folders.id     [idx]
  deleted_at      timestamptz NULL                      (soft delete)
  created_at      timestamptz NOT NULL default now()
  updated_at      timestamptz NOT NULL default now()
  INDEX (owner_user_id, deleted_at)        — list + quota SUM
  INDEX (parent_folder_id)
  UNIQUE (storage_key)

drive_folders                     optional nesting (P2)
─────────────────────────────────────────────────────────────────────
  id              uuid  PK
  owner_user_id   uuid  NOT NULL  FK → auth user           [idx]
  parent_id       uuid  NULL      FK → drive_folders.id (self)
  name            text  NOT NULL
  created_at      timestamptz NOT NULL default now()
  INDEX (owner_user_id, parent_id)

drive_share_links                 public sharing (LOCKED requirement)
─────────────────────────────────────────────────────────────────────
  id              uuid  PK
  file_id         uuid  NOT NULL  FK → drive_files.id  ON DELETE CASCADE [idx]
  token           text  NOT NULL  UNIQUE   (url-safe, ~22 chars, unguessable)
  owner_user_id   uuid  NOT NULL  FK → auth user           [idx]
  expires_at      timestamptz NULL          (NULL = no expiry)
  password_hash   text  NULL                 (optional gate)
  max_downloads   integer NULL
  download_count  integer NOT NULL default 0
  revoked_at      timestamptz NULL           (instant kill)
  created_at      timestamptz NOT NULL default now()
  UNIQUE (token)
  INDEX (file_id)

drive_user_quota                  per-user allowance (default 10GB)
─────────────────────────────────────────────────────────────────────
  user_id         uuid  PK  FK → auth user
  free_bytes      bigint NOT NULL default 10737418240   (10 GiB)
  used_bytes      bigint NOT NULL default 0             (denormalized; reconciled)
  overage_policy  text  NOT NULL default 'meter'  enum: 'meter' | 'hard_cap'
  updated_at      timestamptz NOT NULL default now()

drive_storage_events              audit + abuse + overage→ledger bridge
─────────────────────────────────────────────────────────────────────
  id              uuid  PK
  user_id         uuid  NOT NULL                         [idx]
  kind            text  NOT NULL  enum: 'upload'|'delete'|'share_open'|
                                       'overage_charge'|'abuse_flag'
  file_id         uuid  NULL  FK → drive_files.id
  bytes_delta     bigint NULL
  ledger_id       uuid  NULL  FK → rox_ledger.id   (overage debit link, WS-E)
  meta            jsonb NULL
  created_at      timestamptz NOT NULL default now()
  INDEX (user_id, created_at)
```

**Relations / reuse:**
- `owner_user_id` / `user_id` → existing `auth` user; share-link path uses the **username** (ROX-522 identity) as the `storage_key` prefix so every Drive object hangs off the one identity.
- `drive_storage_events.ledger_id` → existing `rox_ledger` (WS-E) so overage charges are real economy transactions, not a parallel billing system.
- `drive_user_quota.free_bytes` defaults to 10 GiB per the LOCKED decision; `overage_policy` lets the owner choose soft-meter vs hard-cap without schema change.

---

### 3 Providers / tech choices + tradeoffs

**Investigated facts (grounded):**

- **Render** — Confirmed via Render docs (2026): Render has **no native object storage** — it is listed as *"Object storage (Coming Soon)"* on render.com. Today Render offers only **Persistent Disks** (block storage, SSD, encrypted, daily snapshots) which are **single-instance** ("accessible by only a single service instance… you can't scale a service to multiple instances if it has a disk attached"). You *can* self-host MinIO on Render (they publish a one-click MinIO blueprint backed by a 10GB disk), but that MinIO inherits the disk's single-instance ceiling and Render's metered bandwidth — so it does not scale horizontally and egress is not free. **Verdict: not viable as the Drive primary.**

- **Cloudflare R2** — Confirmed pricing (R2 docs, updated 2026-05-28): Standard **$0.015/GB-month**, **zero egress**, Class A (writes/lists) **$4.50/M**, Class B (reads) **$0.36/M**, Infrequent-Access tier **$0.01/GB-month**. Free tier: 10GB-month storage + 1M Class A + 10M Class B/month. **S3-compatible API, public buckets, custom-domain binding** (so `drive.rox.one` sits in front of Cloudflare CDN + WAF). Cloudflare already manages the `rox.one` zone → custom domain is a config step, not a migration. **Verdict: best public-facing primary.**

- **`aws-swiss-migration` node — INVESTIGATED LIVE (SSH probe today):**
  - Tailscale: `100.119.215.92`, linux, **active exit node**, public IP `44.212.103.96` (AWS EC2, us-east-1).
  - Specs: **2 vCPU, 15 GiB RAM**, root disk 174G (54% used), plus **a 500GB EBS volume mounted at `/srv/extra` with 467GB free** and a separate 300GB volume.
  - Already runs **Caddy on :80/:443** as the public reverse proxy for `api.rox.one`, `app.rox.one`, `dash.rox.one`, `design.rox.one`, `mcp.rox.one` (Cloudflare-fronted, with a `cloudflare.env` for DNS/cert).
  - No MinIO running today, but MinIO is **trivially deployable** here: docker image + bind to `/srv/extra/minio` + a `drive-cold.rox.one` Caddy block. SSH access works (key-based, BatchMode).
  - **BUT:** it is a single 2-core box already hosting the prod-ish Rox stack (electric, neo4j, omniroute, flow services). It is a **single point of failure**, its public egress is **billed AWS bandwidth** (~$0.09/GB out — the opposite of R2), and 467GB caps it at ~46 users-worth of full 10GB Drives before the volume needs growing. **Verdict: excellent owner-controlled cold/backup + DR target; wrong choice for the public hot path.**
  - Note: the home-doc-referenced MinIO at `s3.max` / `bit-1.blenny-gar.ts.net:9000` (`agent-artifacts` bucket) lives on the **`bit-1`** node, which is **offline (last seen 2d ago)** — not a candidate for user-facing Drive.

**Comparison table** (monthly, USD; user Drive = 10GB allotment, assume avg 40% fill → 4GB actually stored, realistic-but-not-worst-case):

| Dimension | Render (disk/self-MinIO) | Cloudflare R2 | swiss MinIO (`/srv/extra`) |
|---|---|---|---|
| Native object store | No (block only; OS "coming soon") | **Yes, S3-compatible** | Self-hosted MinIO (S3-compatible) |
| Public sharing / custom domain | Weak (single instance, no CDN) | **Yes — `drive.rox.one` + CDN + WAF** | Yes via Caddy, but egress-billed, no CDN |
| Egress cost | Metered Render bandwidth | **$0 (free)** | **~$0.09/GB AWS out (bad)** |
| Horizontal scale | No (disk = 1 instance) | **Unlimited (Cloudflare)** | Capped by one EBS vol (467GB free now) |
| Ops burden | Medium (you run MinIO) | **Low (managed)** | High (you patch/back up/monitor MinIO) |
| Durability | Single disk + snapshots | **Multi-region replicated** | Single EBS vol (+EBS snapshot if enabled) |
| Storage @1k users (4GB avg = 4TB) | n/a (won't scale) | **~$60/mo** (4000GB × $0.015) | EBS gp3: ~$0.08/GB → **~$320/mo** + needs ~4TB vol |
| Storage @10k users (4GB avg = 40TB) | n/a | **~$600/mo** | ~40TB EBS = **~$3,200/mo** + multi-vol/box |
| Egress @viral link (say 5TB/mo) | huge | **$0** | **~$450/mo** |
| Free-tier offset | none | first 10GB + 1M/10M ops free | n/a (you own the box) |

(R2 storage at *full* 10GB fill: 1k→~$150/mo, 10k→~$1,500/mo. The op fees are negligible for Drive-scale traffic: even 100M reads/mo ≈ $36.)

**RECOMMENDATION — R2 primary, swiss MinIO as cold/backup (verified):**

1. **Primary = Cloudflare R2**, bucket `rox-drive`, public objects served via **`drive.rox.one` custom domain** (Cloudflare zone already in hand). Zero egress is decisive for public share links — it removes the single largest cost/abuse risk and is the only option that scales to 10k users without re-architecture. Ops burden is lowest.
2. **Cold/backup = `aws-swiss-migration` MinIO** on `/srv/extra` (467GB free today). Nightly async replication of R2 → MinIO for owner-controlled DR and "the data is on my box" sovereignty. **Private only** (`drive-cold.rox.one`, ops/restore use) — never the public download path, because its egress is billed AWS bandwidth.
3. **Abstraction = new `packages/storage`** with a `StorageProvider` interface (`R2Provider`, `MinioProvider`) so the choice is a config swap and the spec is reversible. The MinIO adapter is the *same S3 SDK code* as R2 (both S3-compatible), so the cold-tier path is nearly free to build.

Render is rejected as a storage backend (no object store; block storage can't scale or serve public links). Render remains fine for *compute* (the Drive API can still run there) — D9 only rules it out for *storage*.

---

### 4 Phased tasks (bite-sized; file paths in the Rox monorepo; no code here)

**Phase 0 — Provider provisioning (ops, no app code)**
- T0.1 Create R2 bucket `rox-drive` + bind custom domain `drive.rox.one` in the Cloudflare dashboard (zone already managed). Create scoped R2 API token (object read/write only). *Verify: `aws s3 ls --endpoint <r2>` lists the empty bucket; `https://drive.rox.one/<known-key>` 404s cleanly.*
- T0.2 (deferred to Phase 4) Deploy MinIO on `aws-swiss-migration`: docker compose at `/srv/extra/minio`, add `drive-cold.rox.one` Caddy block (private/ops). *Verify: `mc alias` + `mc ls` against the node over Tailscale.*

**Phase 1 — Schema (additive, offline migration)**
- T1.1 Add `packages/db/src/schema/drive.ts` with the 5 tables from §2; export from `packages/db/src/schema/index.ts`. Add any new enum values to `enums.ts` (`drive_provider`, `drive_overage_policy`, `drive_event_kind`).
- T1.2 `bunx drizzle-kit generate --name="add_drive_tables"` (offline, no DB touch). Do **not** edit `packages/db/drizzle/**` by hand. Hand the generated SQL to the owner to apply.
- *Test: `bun test packages/db` (schema compiles, zod inference holds); typecheck.*

**Phase 2 — Storage abstraction package**
- T2.1 New `packages/storage/` (`@rox/storage`): `StorageProvider` interface (`putSignedUrl`, `getSignedUrl`, `delete`, `head`, `publicUrl`), `R2Provider`, `MinioProvider` (both via the AWS S3 SDK / S3-compatible client), provider selection from env.
- T2.2 Env keys in `apps/api/src/env.ts` (additive, optional): `R2_ACCOUNT_ID`, `R2_ACCESS_KEY_ID`, `R2_SECRET_ACCESS_KEY`, `R2_BUCKET`, `R2_PUBLIC_BASE_URL`, plus `MINIO_*` for the cold tier.
- *Test: unit tests with a mocked S3 client (no live calls); signed-URL shape + key-prefix-from-username assertions.*

**Phase 3 — Drive API surface (consumed by Drive product domain)**
- T3.1 `drive` tRPC router in `packages/trpc/` (and `apps/api`): `presignUpload` (quota check first), `confirmUpload` (insert `drive_files`, bump `drive_user_quota.used_bytes`, write `drive_storage_events`), `list`, `delete`, `createShareLink`, `revokeShareLink`.
- T3.2 Public share-link resolver route in `apps/api` (or a thin `apps/web` route): `GET /s/<token>` → validate `drive_share_links` (expiry/revoked/password/max_downloads) → 302 to the R2 public URL or a short-lived signed URL; increment `download_count`; emit `share_open` event.
- T3.3 Overage hook: when `confirmUpload` pushes `used_bytes` past `free_bytes` and `overage_policy='meter'`, debit `rox_ledger` (WS-E) and link via `drive_storage_events.ledger_id`; if `hard_cap`, reject the presign.
- *Test: router unit tests (quota boundary at exactly 10GiB, overage debit path, revoked-link 410, expired-link 410).*

**Phase 4 — Cold backup + DR (after primary is live)**
- T4.1 Execute T0.2 (MinIO on swiss node).
- T4.2 Nightly replication job (cron on the swiss node or a `packages/scripts` task): `mc mirror` / S3 sync R2 `rox-drive` → MinIO `rox-drive-cold`. *Verify: object counts + sample checksum match after a run.*
- T4.3 Documented restore runbook in `plans/rox-comms-suite/` (or `apps/api/docs/`): how to re-point `provider` to `minio` if R2 is unavailable.

**Phase 5 — Abuse / quota ops**
- T5.1 Admin read in the existing admin router: per-user `used_bytes`, top-N by storage, share-link list, one-click revoke + abuse_flag.
- T5.2 Rate-limit + size-cap on `presignUpload` (per-user, per-IP); WAF rule on `drive.rox.one` for hotlink/viral abuse.
- *Test: admin router unit tests; manual abuse-flag → presign-blocked check.*

---

### 5 Effort (S/M/L + rough weeks) & Risks

| Phase | Effort | ~Weeks |
|---|---|---|
| P0 provisioning (R2 + domain) | S | 0.25 |
| P1 schema | S | 0.25 |
| P2 `@rox/storage` abstraction | M | 0.75 |
| P3 Drive API (presign/share/overage) | M–L | 1.5 |
| P4 cold backup + DR | M | 0.75 |
| P5 abuse/quota ops | M | 0.75 |
| **Total D9** | **M–L** | **~3.5–4 wks** (1 eng; less if P4/P5 deferred) |

**Risks**
- **Egress/cost blowup (HIGH→mitigated):** a viral public link is the top cost risk. R2 zero-egress neutralizes it; keeping MinIO off the public path avoids AWS bandwidth bills. Add per-link `max_downloads`/expiry + WAF as backstops.
- **Abuse / illegal content (MED):** public buckets invite malware/CSAM/piracy hosting. Mitigate: unguessable tokens (not directory listing), revoke-on-flag, optional content scanning hook, abuse report endpoint, store `checksum_sha256` for known-bad matching.
- **Quota drift (MED):** denormalized `used_bytes` can desync from real object bytes. Mitigate: nightly reconcile job (SUM `drive_files.byte_size` per user) + treat ledger as source of truth for overage.
- **Single-box DR (LOW, accepted):** swiss node is one EC2 instance; if it dies the *cold copy* is lost but the *primary (R2)* is intact and multi-region. Acceptable for a backup tier; enable EBS snapshots on `/srv/extra`.
- **Vendor lock (LOW):** mitigated by the S3-compatible `StorageProvider` abstraction — R2↔MinIO↔S3 are interchangeable.
- **Secrets sprawl (LOW):** R2/MinIO keys must go through Infisical, never committed; scope R2 token to the single bucket.
- **swiss volume ceiling (LOW for backup):** 467GB free ≈ partial cold copy only; fine for backup of a young user base, revisit before the cold tier needs full 10k-user parity.

---

### 6 Dependencies on other domains + Rox infra reuse

**Reuses (already in the repo):**
- **ROX-522 identity / username** (`packages/db/src/schema/identity.ts`) — the `storage_key` prefix `u/<username>/…` and public path `drive.rox.one/u/<username>/…` hang off the one identity. **Hard dependency.**
- **WS-E token economy** (`rox_balances` / `rox_ledger` / `usage_requests` in `economy.ts`) — overage billing debits the ledger; `drive_storage_events.ledger_id` is the bridge. **Hard dependency** for the overage path (P3.3).
- **Auth** (`packages/auth`) — owner identity for every Drive op.
- **tRPC** (`packages/trpc`) — the `drive` router lives here, consumed by web/desktop/mobile.
- **Cloudflare zone** for `rox.one` (already managed) — `drive.rox.one` custom domain on R2.
- **`aws-swiss-migration` Caddy + `/srv/extra`** — existing public reverse proxy + 467GB block storage for the MinIO cold tier.
- **`packages/email` (Resend)** — only as a consumer (share-link notifications) — not required by D9 itself.

**Depended-on-by (D9 is a substrate for):**
- **Drive product domain** (UI, folders, picker) — consumes `@rox/storage` + the `drive` router.
- **Email attachments / XMPP file transfer** — store blobs via D9, reference by `drive_files.id`.
- **Canvas #293 (react-flow / Obsidian)** — file/image attachments can live in Drive.

---

### 7 Open questions for the owner

1. **Overage default:** soft-meter against WS-E balance (recommended, `overage_policy='meter'`) or hard-cap at 10GB (`'hard_cap'`)? Sets the P3.3 behavior.
2. **R2 billing account:** confirm Cloudflare account + payment is set so `rox-drive` can exceed the 10GB free tier; which Cloudflare account owns the `rox.one` zone vs the R2 bucket?
3. **Public share-link host:** `drive.rox.one/s/<token>` (recommended, token-based, revocable) vs `drive.rox.one/u/<username>/<file>` (pretty but enumerable)? Affects abuse surface.
4. **Cold tier now or later:** build P4 MinIO replication in this pass, or ship R2-only first and add the swiss backup once there are paying users? (Recommend: R2-only first, cold tier in a fast-follow.)
5. **Content moderation appetite:** do we add a scanning/abuse-report pipeline now, or rely on revoke-on-report + unguessable tokens for v1?
6. **Per-user 10GB vs per-org:** is the 10GB free allotment strictly per *user* (per username) or shareable within an org/team? Changes `drive_user_quota` keying.
7. **swiss node growth path:** if MinIO cold tier fills `/srv/extra`, grow the EBS volume vs add a second node vs let cold tier lag behind primary?

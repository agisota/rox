## D8 — Drive (per-user file storage, quota, public sharing)

> Status: SPEC (no code). Owner sign-off required on §7 before implementation.
> Part of the Rox Comms Suite. Coordinates the object-storage provider with **D9 (provider/infra)**, reuses **WS-E (token economy)** for overage billing, and hangs every file off the **ROX-522 identity** (the `user_profiles.handle` username).

Drive is the heavy domain: per-user object storage with a **10 GB free** default, atomic quota accounting + enforcement, overage metered into the Rox token economy, folders, direct upload/download, **public share links** (optional expiry + password), trash, and optional versioning. Chat (D2) and email (D3) attachments are unified into Drive so there is one storage substrate, one quota, one billing path.

---

### 1 Scope & user stories

**In scope**
- Per-user namespace of files + folders (tree), backed by S3-compatible object storage.
- 10 GB free quota per user; `bytes_used` accounted atomically on every upload/delete/restore.
- Overage beyond 10 GB billed via the WS-E Rox ledger (`drive_overage` ledger kind), metered daily by stored GB-month.
- Upload (browser/desktop/mobile) via **presigned PUT** direct-to-bucket; download via **presigned GET**.
- Public sharing: share a file or folder via a stable `rox.one/d/<token>` link, optional `expiresAt`, optional password (hashed).
- Trash (soft delete + retention window) and Drive-side **dedup by content hash** (sha256) so identical bytes are stored once.
- Optional file versioning (keep N prior versions per file).
- Unification: chat (D2) and email (D3) attachments are first-class `drive_files` rows (no separate `chat_attachments`/email blob silo long-term; bridge tables map them).
- Abuse controls: MIME allow/deny, per-file size cap, rate limits, async malware scan, takedown flags on public shares.

**Out of scope (this spec)**
- The provider procurement/IaC itself (lives in **D9**); D8 only consumes a `StorageDriver` interface.
- Real-time collaborative editing of file contents (that is the canvas #293 / @rox/collab domain).
- E2E client-side encryption (parked — see §7).

**User stories**
1. As a Rox user I upload a 200 MB video from web; it appears in my Drive immediately and counts against my 10 GB.
2. As a user near my limit, an upload that would exceed 10 GB either fails with a clear "upgrade/top-up" prompt, or (if I have Rox balance and opted in) succeeds and accrues overage to my ledger.
3. As a user I create folders, move/rename files, and drag a file into a folder.
4. As a user I generate a public link to `report.pdf` with a 7-day expiry and a password, and send it to a non-Rox person who downloads it in a browser.
5. As a user I delete a file; it goes to Trash and is restorable for 30 days, then is hard-deleted and reclaims quota.
6. As a chat user I drag a screenshot into a chat; it is stored once in Drive and referenced from the message.
7. As an email user an inbound attachment is persisted to my Drive under an `Email/` system folder.
8. As an admin I see a flagged public share and can disable it (takedown) without deleting the owner's file.
9. As a desktop/mobile user the same Drive tree syncs (cache-first via Electric) and uploads resume.

---

### 2 Target design

#### 2.1 Architecture (ASCII)

```
            ┌──────────────────────────────────────────────────────────────┐
            │  Clients: apps/web · apps/desktop (Electron) · apps/mobile     │
            │  - drive UI (tree, upload, share dialog)                       │
            │  - direct PUT/GET to bucket via presigned URLs                 │
            └───────────────┬───────────────────────────┬──────────────────┘
                            │ tRPC (packages/trpc)       │ direct HTTPS (presigned)
                            ▼                            ▼
   ┌─────────────────────────────────────────┐   ┌──────────────────────────┐
   │ apps/api  drive router + upload service  │   │ Object store (D9 choice) │
   │  drive.requestUpload  -> presigned PUT   │──▶│  Cloudflare R2 (default) │
   │  drive.completeUpload -> commit + quota  │   │  bucket: rox-drive        │
   │  drive.requestDownload-> presigned GET   │   │  key: u/<userId>/<sha256> │
   │  drive.move/rename/trash/restore/share   │   └──────────────────────────┘
   │  drive.listFolder (or Electric snapshot) │             ▲
   └───────┬───────────────────┬─────────────┘             │ public read
           │                   │                            │
           ▼                   ▼                  ┌─────────────────────────────┐
   ┌──────────────┐   ┌────────────────────┐     │ apps/web  /d/<token>         │
   │ Neon (Drizzle)│   │ Electric live-sync │     │ public share resolver:       │
   │ drive_* tables│──▶│ drive tree -> cache│     │  validates token/expiry/pw   │
   │ + storage_qta │   │ -first clients     │     │  -> 302 to presigned GET     │
   └──────────────┘   └────────────────────┘     └─────────────────────────────┘
           ▲
           │ ledger delta (overage)              ┌─────────────────────────────┐
           └─────────────────────────────────────│ WS-E economy: rox_ledger     │
                                                 │ kind='drive_overage'         │
                                                 └─────────────────────────────┘

   Async lane:  completeUpload --enqueue--> scan worker (malware/MIME) --> mark clean|quarantined
   Bridges:     chat message ──> drive_file_refs ──> drive_files ; inbound email ──> Email/ folder
```

**Key flows**
- **Upload (direct-to-bucket, never proxy bytes through the API):**
  1. Client calls `drive.requestUpload({ folderId, filename, mediaType, sizeBytes, sha256 })`.
  2. API does a *pre-flight quota check* (`bytes_used + sizeBytes <= quota_bytes` OR overage allowed). If a `drive_files` row with the same `(userId, sha256)` already exists → dedup short-circuit, return existing key, no upload needed.
  3. API returns a presigned PUT URL (TTL ~10 min) for key `u/<userId>/<sha256>` and creates a `pending` `drive_files` row.
  4. Client PUTs bytes directly to the store.
  5. Client calls `drive.completeUpload({ fileId })`. API HEADs the object to confirm size, flips status to `clean|scanning`, and **atomically** increments `storage_quota.bytes_used` (see §2.4). Enqueues scan.
- **Download:** `drive.requestDownload({ fileId })` → presigned GET (TTL ~5 min). UI streams from the store.
- **Public share:** resolver route `apps/web/src/app/d/[token]/route.ts` validates the `drive_shares` row (not revoked, not expired, password matches if set), then 302-redirects to a freshly minted short-TTL presigned GET. Bytes are never served through Next.js. Class-B reads only; R2 egress is free.

#### 2.2 ERD — additive tables in `packages/db/src/schema/`

New file **`packages/db/src/schema/drive.ts`** (added to the barrel `index.ts`). All tables prefixed `drive_*` except the per-user accounting table `storage_quota`. **Additive only** — no edits to existing tables; chat/email integration uses *new* bridge tables, not column changes. New enum values appended in `enums.ts`.

```
storage_quota                         (one row per user; the accounting record)
  id              uuid pk
  user_id         uuid  -> auth.users(id) ON DELETE CASCADE   UNIQUE
  quota_bytes     bigint NOT NULL DEFAULT 10737418240         -- 10 GiB free
  bytes_used      bigint NOT NULL DEFAULT 0                    -- maintained atomically
  overage_opt_in  boolean NOT NULL DEFAULT false              -- allow billed overage
  updated_at      timestamptz NOT NULL DEFAULT now()
  INDEX storage_quota_user_uniq (user_id) UNIQUE
  CHECK bytes_used >= 0

drive_folders                         (per-user folder tree; root = parent_id NULL)
  id              uuid pk
  user_id         uuid  -> auth.users(id) ON DELETE CASCADE
  parent_id       uuid  -> drive_folders(id) ON DELETE CASCADE  NULL
  name            text NOT NULL
  is_system       boolean NOT NULL DEFAULT false   -- e.g. Email/, Chat/, Trash anchor
  created_at      timestamptz NOT NULL DEFAULT now()
  updated_at      timestamptz NOT NULL DEFAULT now()
  INDEX drive_folders_user_parent_idx (user_id, parent_id)
  UNIQUE drive_folders_sibling_name_uniq (user_id, parent_id, name)   -- no dup names per dir

drive_files                           (logical file = pointer to a stored object)
  id              uuid pk
  user_id         uuid  -> auth.users(id) ON DELETE CASCADE
  folder_id       uuid  -> drive_folders(id) ON DELETE SET NULL  NULL  -- NULL = root
  name            text NOT NULL                  -- display filename
  media_type      text NOT NULL
  size_bytes      bigint NOT NULL
  sha256          text NOT NULL                  -- content hash (dedup + integrity)
  storage_key     text NOT NULL                  -- u/<userId>/<sha256>
  status          drive_file_status NOT NULL DEFAULT 'pending'  -- pending|clean|scanning|quarantined|trashed
  scan_result     jsonb                          -- {engine, verdict, ts}
  trashed_at      timestamptz NULL               -- soft delete; hard-deleted after retention
  version         integer NOT NULL DEFAULT 1
  created_at      timestamptz NOT NULL DEFAULT now()
  updated_at      timestamptz NOT NULL DEFAULT now()
  INDEX drive_files_user_folder_idx (user_id, folder_id)
  INDEX drive_files_user_sha_idx (user_id, sha256)        -- dedup lookup
  INDEX drive_files_status_idx (status)
  INDEX drive_files_trashed_idx (trashed_at)              -- trash sweep
  UNIQUE drive_files_user_sha_uniq (user_id, sha256, version)  -- one logical row per (user,content,version)

drive_file_versions                   (optional history; only if versioning enabled)
  id              uuid pk
  file_id         uuid  -> drive_files(id) ON DELETE CASCADE
  version         integer NOT NULL
  sha256          text NOT NULL
  size_bytes      bigint NOT NULL
  storage_key     text NOT NULL
  created_at      timestamptz NOT NULL DEFAULT now()
  UNIQUE drive_file_versions_uniq (file_id, version)

drive_shares                          (public access grants for a file OR folder)
  id              uuid pk
  user_id         uuid  -> auth.users(id) ON DELETE CASCADE     -- owner
  file_id         uuid  -> drive_files(id)   ON DELETE CASCADE   NULL
  folder_id       uuid  -> drive_folders(id) ON DELETE CASCADE   NULL
  token           text NOT NULL                 -- url-safe random (>=128-bit); rox.one/d/<token>
  password_hash   text NULL                     -- argon2/bcrypt; NULL = no password
  expires_at      timestamptz NULL              -- NULL = never
  permission      drive_share_perm NOT NULL DEFAULT 'view'   -- view|download
  revoked_at      timestamptz NULL
  takedown        boolean NOT NULL DEFAULT false  -- admin abuse flag
  view_count      integer NOT NULL DEFAULT 0
  created_at      timestamptz NOT NULL DEFAULT now()
  UNIQUE drive_shares_token_uniq (token)
  INDEX drive_shares_user_idx (user_id)
  INDEX drive_shares_file_idx (file_id)
  INDEX drive_shares_folder_idx (folder_id)
  CHECK (file_id IS NOT NULL) <> (folder_id IS NOT NULL)   -- exactly one target

drive_file_refs                       (bridge: a Drive file referenced by another domain)
  id              uuid pk
  file_id         uuid  -> drive_files(id) ON DELETE CASCADE
  source_kind     drive_ref_source NOT NULL    -- chat_message | email_message | canvas | other
  source_id       uuid NOT NULL                -- e.g. chat message id, email id
  organization_id uuid -> auth.organizations(id) ON DELETE CASCADE  NULL
  created_at      timestamptz NOT NULL DEFAULT now()
  INDEX drive_file_refs_file_idx (file_id)
  UNIQUE drive_file_refs_source_uniq (source_kind, source_id, file_id)
```

**New enum values (append-only in `enums.ts`, backing pgEnums):**
- `driveFileStatusValues = ["pending","clean","scanning","quarantined","trashed"]`
- `driveSharePermValues = ["view","download"]`
- `driveRefSourceValues = ["chat_message","email_message","canvas","other"]`
- Append `"drive_overage"` to existing `roxLedgerKindValues` (currently `topup|request_charge|adjustment|seed`) — append at end, never reorder.

**Relation to identity (ROX-522):** Drive hangs off `auth.users(id)`; the public-facing namespace and share-link branding use `user_profiles.handle` (e.g. `rox.one/@alice` profile can surface their public files). The object key uses `userId` (UUID, stable even if handle is renamed); handle is resolved at the presentation layer only.

#### 2.3 Object-storage layout (bucket/key scheme)
- Single bucket `rox-drive` (private). Optional second public-CDN bucket `rox-drive-public` only if we later promote share files to a custom domain; v1 uses presigned GET from the private bucket, so one bucket suffices.
- Key scheme: `u/<userId>/<sha256>` — content-addressed, so dedup is automatic and the same bytes uploaded twice reuse one object. Filenames live only in the DB (`drive_files.name`), decoupled from the key.
- Versioning: object keys are immutable (content-addressed). A new version = new sha256 = new key; `drive_file_versions` records the chain. No reliance on bucket-native versioning.
- Hard delete: only delete the object when **no** `drive_files` row (any version) and **no** `drive_file_versions` row references that `(userId, sha256)` — reference-counted to protect dedup.

#### 2.4 Quota model (atomic accounting)
- Source of truth for current usage = `storage_quota.bytes_used`, maintained transactionally:
  - On `completeUpload` (after object HEAD confirms `size_bytes`, and only if this `(userId, sha256)` was newly stored, i.e. dedup miss): `UPDATE storage_quota SET bytes_used = bytes_used + :size WHERE user_id = :u` inside the same tx that flips the file to `clean/scanning`.
  - On hard-delete (after ref-count hits 0): `bytes_used = bytes_used - :size`.
  - Pre-flight check in `requestUpload` is advisory (race-tolerant); the **authoritative** enforcement is a DB `CHECK`/conditional update at commit: reject if `bytes_used + size > quota_bytes AND overage_opt_in = false`.
- Concurrency: use a single conditional `UPDATE ... WHERE bytes_used + :size <= quota_bytes` (or row lock `SELECT ... FOR UPDATE`) so two parallel uploads cannot both pass the limit.
- Reconciliation cron: nightly job recomputes `bytes_used` from `SUM(size_bytes)` of distinct `(userId, sha256)` non-trashed objects and corrects drift; emits an admin metric.
- **Overage billing (WS-E):** a daily cron computes `max(0, bytes_used - quota_bytes)` per user, converts GB-over-month to a Rox cost (rate is a config constant, e.g. `DRIVE_OVERAGE_ROX_PER_GB_MONTH`), and writes a `rox_ledger` row with `kind='drive_overage'` + a balance debit. No new billing rails — reuse the existing balance/ledger/topup machinery from `economy.ts`. Users with insufficient balance get blocked from *new* uploads (existing files retained, read-only) per the policy chosen in §7.

#### 2.5 Share-link public access path
- Two candidate mechanisms (chosen below):
  - **(A) Public bucket + token-in-path** — object served directly; simplest but the object is world-readable if the URL leaks and gives no expiry/password control at the storage layer.
  - **(B) Private bucket + resolver + short-TTL presigned GET** *(chosen for v1)* — `rox.one/d/<token>` hits a Rox resolver that enforces revoke/expiry/password/takedown, increments `view_count`, then 302s to a freshly signed presigned GET (TTL ≈ 60–300 s). Bytes never traverse our server; R2 egress is free; access policy stays in Postgres where we can revoke instantly.
- Password-protected shares: resolver renders a tiny password page (POST), verifies against `password_hash` (argon2), sets a short signed cookie scoped to the token, then issues the presigned GET.

---

### 3 Providers / tech choices + tradeoffs

**Decision: Cloudflare R2 is the default object store (coordinate final pick with D9).**

| Option | Verdict | Why / tradeoffs (verified facts) |
|---|---|---|
| **(1) Render.com object storage** | **Reject for v1** | Render's native object storage is still **alpha / waitlist**, not GA (Canny "in progress" since 2019; alpha sign-up only). The only production path on Render today is **self-hosted MinIO on a 10 GB SSD disk** — a single-node, disk-bound box that does not scale to per-user multi-GB drives, has no zero-egress story, and makes us run the storage tier. Unsuitable as the primary backbone. |
| **(2) Cloudflare R2** | **CHOSEN** | GA, **S3-compatible** (AWS SigV4), **zero egress fees** (critical for a drive that streams downloads + public shares), `$0.015/GB-mo` standard storage, **10 GB-month free tier**, Class A (writes/list) `$4.50/M`, Class B (reads) `$0.36/M`. Native **presigned URLs** for GET/PUT/HEAD/DELETE with TTL 1s–7d (direct browser upload/download), plus **public buckets + custom domain** if we ever want CDN-origin. Cloudflare already manages the `rox.one` DNS zone, so custom-domain/Worker integration is in-house. Best fit for a download-heavy product. |
| **(3) `aws-swiss-migration` user node** | **Reject as primary; keep as cold-backup target** | An owner-run node (S3-compatible/MinIO-class) could host bytes, but it is single-tenant, self-operated, no managed durability/SLA, no zero-egress edge, and couples Drive uptime to one box. Investigation note: I do **not** have verified live access to this node from this workspace (no credentials/endpoint surfaced in repo). Best use is an **optional off-site backup/replication target** (rclone from R2), not the hot path. Owner to confirm endpoint + access if they want replication (see §7). |

**Why content-addressed keys + presigned direct upload:** keeps the API stateless and cheap (never proxies file bytes), gives free dedup, and makes the `StorageDriver` interface portable across R2 / MinIO / S3 so D9 can swap providers without touching the drive router.

**Driver abstraction:** define a `StorageDriver` interface (`presignPut`, `presignGet`, `head`, `delete`, `copy`) in `packages/shared` so apps/api depends on the interface, with an R2 implementation. This makes the Render/MinIO and `aws-swiss-migration` options drop-in if priorities change, and lets tests use an in-memory fake.

**Reuse over rebuild:** current code already uses `@vercel/blob` for `chat_attachments` (`apps/api/src/app/api/chat-attachments/[id]/route.ts`, `apps/api/src/env.ts:BLOB_READ_WRITE_TOKEN`). D8 supersedes that with the R2-backed `StorageDriver`; chat attachments migrate to `drive_files` + `drive_file_refs` (the old table stays during a deprecation window — additive, no destructive migration).

---

### 4 Phased tasks (bite-sized; file paths; test approach — no code here)

> Migrations: edit schema files, then `bunx drizzle-kit generate --name="..."` (offline). Never `migrate`/`push` prod. Test a generated migration on a throwaway Neon branch only.

**Phase 0 — Schema + driver contract**
- T0.1 Append enum values in `packages/db/src/schema/enums.ts` (`driveFileStatusValues`, `driveSharePermValues`, `driveRefSourceValues`; append `drive_overage` to `roxLedgerKindValues`). *Test:* unit assert array order unchanged + new values present.
- T0.2 New `packages/db/src/schema/drive.ts` with all tables in §2.2; add `export * from "./drive"` to `index.ts`; add relations in `relations.ts`. *Test:* `bun test packages/db` type-infer + zod round-trip; snapshot the generated SQL.
- T0.3 Run `drizzle-kit generate --name="drive_d8"`; verify migration is additive (no `DROP`/`ALTER` of existing tables) by reading the generated SQL. *Test:* apply on a fresh Neon branch, assert tables/indexes exist.
- T0.4 `StorageDriver` interface + R2 implementation in `packages/shared/src/storage-driver/` (`presignPut/presignGet/head/delete/copy`, content-addressed key helper). *Test:* in-memory fake driver + unit tests for key derivation and TTL bounds.

**Phase 1 — Quota engine**
- T1.1 Quota helpers in `packages/shared/src/drive/quota/` (pre-flight check, atomic conditional increment/decrement, ref-count delete guard). *Test:* concurrency test simulating two parallel uploads that together exceed quota — exactly one must fail.
- T1.2 Seed `storage_quota` row lazily on first Drive use (10 GiB default), mirroring how `rox_balances` seeds 500 Rox. *Test:* first-read seeds exactly once.
- T1.3 Reconciliation + overage cron jobs (recompute `bytes_used`; daily overage → `rox_ledger` debit). Wire as scheduled tasks (reuse existing cron infra). *Test:* fixture user with usage > quota produces correct ledger delta; idempotent per day.

**Phase 2 — Upload/download service + tRPC router**
- T2.1 `drive` tRPC router in `packages/trpc` (`requestUpload`, `completeUpload`, `requestDownload`, `listFolder`, `createFolder`, `rename`, `move`, `trash`, `restore`, `hardDeleteSweep`). *Test:* router unit tests with fake driver + test DB (mirror existing tRPC router test pattern, e.g. WS-E topup tests).
- T2.2 Upload-complete flow: HEAD confirm size, dedup short-circuit, atomic quota commit, enqueue scan. *Test:* dedup hit reuses object + does not double-count quota; size mismatch rejects.
- T2.3 Register `drive` router in `packages/trpc` root (append-only after existing routers). *Test:* root router type compiles; smoke call.
- T2.4 API env additions in `apps/api/src/env.ts` (`R2_ACCOUNT_ID`, `R2_ACCESS_KEY_ID`, `R2_SECRET_ACCESS_KEY`, `R2_BUCKET`, `DRIVE_OVERAGE_ROX_PER_GB_MONTH`). *Test:* env schema parse with required keys.

**Phase 3 — Public sharing**
- T3.1 `drive.createShare/revokeShare/listShares` procedures (token gen ≥128-bit, optional argon2 password hash, expiry, permission). *Test:* token uniqueness, password verify, expired/revoked rejected.
- T3.2 Public resolver route `apps/web/src/app/d/[token]/route.ts` (+ password page component) → validates → 302 to short-TTL presigned GET; increments `view_count`; honors `takedown`. *Test:* e2e: valid token downloads; expired/revoked/takedown 404; wrong password blocked.
- T3.3 Admin takedown action in `apps/admin` (flag a share without deleting the file). *Test:* takedown flips flag; resolver then refuses.

**Phase 4 — UI (web first, then desktop/mobile)**
- T4.1 Drive UI in `apps/web/src/app/drive/` (tree, breadcrumb, upload dropzone with direct presigned PUT + progress, context menu move/rename/trash, share dialog, quota bar). *Test:* component tests for upload state machine; Playwright happy-path upload+share evidence.
- T4.2 Electric live collection for the drive tree (cache-first per AGENTS.md rule 9: render existing rows before `isReady`). *Test:* renders persisted rows while not ready; empty-vs-loading correctness.
- T4.3 Desktop (`apps/desktop`) + mobile (`apps/mobile`) Drive screens reusing the shared core + tRPC. *Test:* smoke per platform; resumable upload on mobile.

**Phase 5 — Domain unification + abuse**
- T5.1 Bridge chat attachments (D2) to Drive: write `drive_files` + `drive_file_refs(source_kind='chat_message')` on chat upload; keep `chat_attachments` readable during deprecation. *Test:* chat upload creates a Drive file + ref; quota counted once.
- T5.2 Bridge inbound email (D3) attachments into `Email/` system folder via `drive_file_refs(source_kind='email_message')`. *Test:* inbound attachment persisted + dedup across messages.
- T5.3 Async scan worker (MIME allow/deny + malware engine) flips `clean|quarantined`; quarantined files are undownloadable + unshareable. *Test:* known-bad fixture quarantines; clean fixture passes; share of quarantined file refused.
- T5.4 Rate limits + per-file size cap + per-user upload throttle. *Test:* over-cap upload rejected; burst throttled.

---

### 5 Effort (S/M/L + rough weeks) & Risks

| Phase | Size | Rough |
|---|---|---|
| P0 schema + driver | M | ~1 wk |
| P1 quota engine | M | ~1 wk |
| P2 upload/download + router | L | ~1.5 wk |
| P3 public sharing | M | ~1 wk |
| P4 UI (web→desktop→mobile) | L | ~2 wk |
| P5 unification + abuse | M–L | ~1.5 wk |
| **Total** | **L** | **~7–8 weeks** (1 eng) |

**Risks**
- **Abuse / illegal-content hosting (public shares).** Public links make Drive a potential malware/CSAM/phishing host. Mitigation: async scan before any download is allowed, MIME allow-list, takedown flag, view-count + rate caps, and a report endpoint on `/d/<token>`. Residual: no perfect scanner; need a takedown SLA + DMCA path.
- **Quota race / over-billing.** Parallel uploads double-counting or skipping the limit. Mitigation: conditional atomic `UPDATE` + nightly reconciliation. Residual: brief over-quota window between presign and commit (bounded by presign TTL).
- **Presigned-URL leakage.** A leaked presigned GET grants access until TTL. Mitigation: short TTLs (60–300 s downloads, 10 min uploads), never embed in cacheable HTML, password-gate sensitive shares. Residual: in-TTL leak is unrecoverable — accept with short TTL.
- **Cost blow-up.** Storage + Class-A/B ops. R2 zero-egress removes the scariest line; storage at $0.015/GB-mo means 1 TB ≈ $15/mo. Risk is overage users storing huge cold data — covered by WS-E overage billing + balance gate. Class-B reads on hot public shares are cheap but non-zero; cache the resolver redirect, not the bytes.
- **Provider lock-in / migration.** Mitigated by the `StorageDriver` interface (R2 ↔ MinIO ↔ S3 ↔ aws-swiss-migration) and content-addressed keys that copy cleanly with rclone/Super Slurper.
- **Dedup deletion bug.** Deleting one user's file must not delete shared bytes (we key per-user `u/<userId>/<sha256>` so dedup is per-user, avoiding cross-user ref hazards) — confirm we do NOT globally dedup across users (privacy + ref-count safety).
- **Data durability on a self node.** If `aws-swiss-migration` ever becomes primary, single-node durability is a real risk — keep it backup-only.

---

### 6 Dependencies on other domains + Rox infra reused

**Depends on**
- **D9 (provider/infra):** final object-store decision + bucket/credentials provisioning + DNS/custom-domain if public bucket is later used. D8 ships against the `StorageDriver` interface so it is not blocked, but production cutover needs D9's R2 account.
- **WS-E token economy (merged):** `rox_balances` / `rox_ledger` / `rox_topups` in `packages/db/src/schema/economy.ts` — reused verbatim for overage billing (new `drive_overage` ledger kind). No new billing rails.
- **ROX-522 identity:** `auth.users(id)` for ownership keys + `user_profiles.handle` for public-facing share/profile branding (`packages/db/src/schema/profiles.ts`).
- **D2 chat / D3 email:** consume Drive via `drive_file_refs`; D8 provides the substrate, they provide the source rows.

**Reuses existing Rox infra**
- `packages/db` (Drizzle + Neon) — additive `drive.ts` schema.
- `packages/trpc` — new `drive` router registered append-only.
- ElectricSQL live-sync — drive tree cache-first collection (AGENTS.md rule 9).
- `apps/api` — upload service + env (replaces the `@vercel/blob` path used today by chat attachments).
- `apps/web` / `apps/desktop` / `apps/mobile` — shared tRPC + shared core, multiplatform from day one.
- Existing cron/scheduled-task infra — reconciliation + overage jobs.
- Cloudflare (manages `rox.one` zone) — R2 + optional custom domain in-house.

---

### 7 Open questions for the owner

1. **Overage policy when balance runs out:** block new uploads but keep existing files readable (recommended), or also throttle/disable downloads? Pick one.
2. **Overage rate:** confirm `DRIVE_OVERAGE_ROX_PER_GB_MONTH` value (and whether the free 10 GB is per-user-forever or per-org).
3. **Versioning in v1?** Ship `drive_file_versions` now (more cost/complexity) or defer to v2 (simpler)? Recommended: defer; keep schema reserved.
4. **`aws-swiss-migration` node:** do you want R2→node off-site backup replication? If yes, provide the endpoint + S3 credentials (I could not verify live access from this workspace).
5. **E2E client-side encryption:** out of scope for v1 — confirm OK to park (it conflicts with server-side scan + dedup + preview).
6. **Public share default permission:** `view` (in-browser preview, no save) vs `download` as the default for a new link?
7. **Cross-user dedup:** keep dedup strictly per-user (privacy-safe, slightly more storage) — confirm we do NOT want global content dedup.
8. **Trash retention window:** 30 days default — confirm or change.

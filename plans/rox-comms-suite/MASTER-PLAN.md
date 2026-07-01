# Rox Workspace Suite — Master Plan

> **For Claude:** Use `${SUPERPOWERS_SKILLS_ROOT}/skills/collaboration/executing-plans/SKILL.md` to implement the per-domain specs task-by-task. This master plan is the program-level orchestration layer that sequences the nine domain specs (`D1`–`D9` in this directory) into one shippable program.

**Goal:** Build the Rox Workspace Suite — a unified comms + calendar + notes + drive product where **one rox username** (`user_profiles.handle`, ROX-522) is the single identity behind in-app chat, `username@rox.one` email, `username@rox.one` XMPP, an optional mesh transport, a calendar, collaborative notes, and a 10 GB personal drive — all over one additive `comms/*`+sibling schema, one tRPC surface, one ElectricSQL live-sync fabric, and one WS-E token economy for metering.

**Architecture:** D1 is the identity spine + unified inbox + transport-adapter fabric. Sibling transports (D2 team-chat, D3 email, D4 XMPP, D5 mesh) implement the D1 adapter contract. D6 calendar / D7 notes / D8 drive are productivity surfaces hung off the same identity. D9 is the object-storage substrate (Cloudflare R2) every attachment/file lands on. All schema is **additive-only** (`bunx drizzle-kit generate` offline, never `migrate`/`push` prod); all reads are Electric live-sync (cache-first per AGENTS.md #9); all writes are tRPC.

**Tech Stack:** Bun + Turbo monorepo · Drizzle + Neon Postgres · tRPC · ElectricSQL + TanStack DB · React/Next 16 (web) + Electron (desktop) + Expo (mobile) · `@rox/collab` (LiveBlocks presence/Yjs) + `@rox/rtc` (LiveKit calls) · Cloudflare (rox.one zone, Email Routing+Workers, R2) · Resend (outbound mail) · ejabberd (XMPP) · nostr-tools (mesh fallback) · WS-E token economy (`rox_balances`/`rox_ledger`).

---

## 1. Vision + Architecture

**The pitch:** today a founder/team juggles Slack + Gmail + Google Calendar + Notion + Google Drive + (maybe) a federated/offline chat — five vendors, five identities, five bills. The Rox Workspace Suite collapses that into **one workspace behind one handle**. Claim `@mark` and you instantly own `mark@rox.one` (email + XMPP JID + mesh key), a unified inbox that threads in-app DMs next to email replies, a calendar that invites by `@handle`, collaborative notes that publish to `rox.one/s/<slug>`, and a 10 GB drive that backs every attachment in the suite. Heavy infra (own mail/XMPP servers) is what makes it *yours*, not rented; mesh is the resilience differentiator nobody else ships.

**Single identity, many transports, one storage floor.**

```
                                  ┌──────────────────────────────────────────────────────────┐
                                  │                    IDENTITY SPINE                          │
                                  │   auth.users.id  ◄──1:1──  user_profiles.handle (ROX-522)  │
                                  │            "@mark"  ──derives──▶                            │
                                  │   mark@rox.one (email) · mark@rox.one (JID) · ed25519 pub   │
                                  │   identity_links (external → contact)  ·  rox_balances (WS-E)│
                                  └───────────────┬──────────────────────────────────────────┘
                                                  │ provisionIdentity(userId, handle)
        ┌─────────────────────────────────────────┼──────────────────────────────────────────────┐
        │                          D1  COMMS HUB  (packages/comms-core)                            │
        │   TransportAdapter registry  ·  Routing engine  ·  Presence aggregator  ·  Unified inbox  │
        │   comms_threads / comms_messages / comms_participants / comms_deliveries / comms_presence  │
        └───┬──────────────┬──────────────┬──────────────┬───────────────────────────────────────┘
            │ adapter      │ adapter      │ adapter      │ adapter
   ┌────────▼───┐  ┌───────▼────┐  ┌──────▼─────┐  ┌─────▼──────────┐        PRODUCTIVITY SURFACES
   │ D2 in-app  │  │ D3 email   │  │ D4 XMPP    │  │ D5 mesh        │     ┌──────────┬──────────┬─────────┐
   │ team-chat  │  │ username@  │  │ username@  │  │ nostr (all) +  │     │ D6 cal   │ D7 notes │ (graph, │
   │ tc_*       │  │ rox.one    │  │ rox.one    │  │ BLE (mobile)   │     │ cal_*    │ note_*   │ journal,│
   │ (LiveKit/  │  │ mail_*     │  │ xmpp_*     │  │ mesh_*         │     │          │ (reuse   │ memory  │
   │ LiveBlocks)│  │ (CF EW +   │  │ (ejabberd  │  │ (offline       │     │ RRULE +  │ knowledge│  reuse) │
   │            │  │  Resend)   │  │  on Fly)   │  │  P-last)       │     │ ICS +    │ _documents)│       │
   └─────┬──────┘  └─────┬──────┘  └─────┬──────┘  └─────┬──────────┘     │ invites) │          │         │
         │ files         │ bodies/att    │ (text in D1)  │ (text only)    └────┬─────┴────┬─────┴─────────┘
         │               │               │               │                     │ invites   │ attachments
         ▼               ▼               ▼               ▼                     ▼ (D3)      ▼ (D8)
   ┌──────────────────────────────────────────────────────────────────────────────────────────────┐
   │                          D8 DRIVE  (per-user, 10 GB free, public share)                         │
   │   storage_quota / drive_folders / drive_files / drive_shares / drive_file_refs                  │
   │   presigned PUT/GET · content-addressed keys u/<userId>/<sha256> · WS-E overage billing          │
   └────────────────────────────────────┬───────────────────────────────────────────────────────────┘
                                         │ StorageDriver (packages/storage)
                                         ▼
   ┌──────────────────────────────────────────────────────────────────────────────────────────────┐
   │            D9 SUBSTRATE  —  Cloudflare R2 (primary, zero egress) · MinIO swiss node (cold/DR)    │
   └──────────────────────────────────────────────────────────────────────────────────────────────┘

   LIVE FABRIC (all surfaces):  ElectricSQL shapes ──▶ web / desktop / mobile  (cache-first)
   PRESENCE/RTC:                @rox/collab (LiveBlocks) · @rox/rtc (LiveKit)   (WS-L, merged)
   METERING:                    WS-E token economy (rox_ledger) — calls, mail sends, drive overage
```

**Read this diagram top-down:** identity at the top derives every address. D1 owns the message/thread model and the adapter seam. D2–D5 are *transports* that plug into D1. D6/D7 are productivity surfaces that reuse the same identity + Electric + share infra. D8 is the storage floor every attachment falls through to, and D9 is the bucket underneath. Text is always free; the cost drivers (calls, mail egress, drive bytes) all meter through one ledger.

---

## 2. Consolidated ERD

Every table below is **ADDITIVE** — new files in `packages/db/src/schema/`, new `pgEnum` value arrays appended to `enums.ts` (never reordered), barrel-exported from `index.ts`, migrations authored offline via `bunx drizzle-kit generate`. **No existing table is altered.** Existing Rox tables are *reused by FK reference only*.

### 2.1 Existing Rox schema reused (NOT modified)

| Existing table | Role in the suite | Referenced by |
|---|---|---|
| `auth.users(id)` | account root | every new table |
| `user_profiles.handle` (ROX-522) | canonical identity; derives all addresses | D1, D3, D4, D5, D6, D7, D8 |
| `auth.organizations(id)` | org/tenant scope (Electric shape gate) | every new table (`organization_id`) |
| `auth.teams`, `auth.members` | team membership / channel scoping | D2, D6 |
| `identity_links` + `resolveIdentity` | external sender/JID/npub → contact node | D1, D3, D4, D5, D6 |
| `knowledge_documents`, `knowledge_links` | note content + `[[backlinks]]` (D7 reuses as the note row) | D7 |
| `public_shares` + `/s/[slug]` | public link sharing | D7 (enum append `note`,`notebook`) |
| `access_grants` | role ACL (viewer/editor) | D7 (enum append `note`,`notebook`) |
| `rox_balances`, `rox_ledger`, `rox_topups` (WS-E) | token economy / overage billing | D2 (calls), D3 (sends), D6 (invites), D8/D9 (drive overage) |
| `packages/shared/src/rrule.ts` | recurrence engine (extend, don't fork) | D6 |
| `@rox/collab` / `@rox/rtc` (WS-L) | presence, Yjs, calls | D1, D2, D7 |

### 2.2 New tables, grouped by domain

**Identity & hub — `comms.ts` (D1), 8 tables · enums: `comms_address_kind`, `comms_transport`, `comms_direction`, `comms_participant_role`, `comms_delivery_status`, `comms_presence_state`**

```
comms_addresses     (user_id, kind email|xmpp|mesh|inapp, value, is_primary, is_alias)  -- derived from handle
comms_keypairs      (user_id, algo ed25519, public_key, secret_ref)                     -- private key NEVER in db
comms_threads       (organization_id, subject, last_message_at, dedup_key)              -- cross-transport thread
comms_participants  (thread_id, user_id?|contact_entity_id?, role, last_read_message_id)
comms_messages      (thread_id, transport, direction, external_id, in_reply_to, body, attachments jsonb)
comms_deliveries    (message_id, transport, to_address, status, provider_id)            -- outbound fan-out
comms_presence      (user_id PK, state, per_transport jsonb)                            -- merged presence
```

**Team chat — `team-chat.ts` (D2), 5 tables · enums: `tc_conversation_kind`, `tc_conversation_visibility`, `tc_member_role`, `tc_message_kind`**

```
tc_conversations        (organization_id, kind dm|channel, team_id?, slug, visibility, dm_key, last_message_at)
tc_conversation_members (conversation_id, user_id, organization_id*, role, muted)        -- *denorm for Electric shape
tc_messages             (conversation_id, organization_id*, author_id, parent_message_id, kind text|system|call, content)
tc_message_reads        (conversation_id, user_id, last_read_message_id)
tc_attachments          (message_id, organization_id*, drive_object_id? → D8, storage_key, file_name)
```

**Email — `mail.ts` (D3), 5 tables · enums: `mailAddressKind`, `mailAddressStatus`, `mailDirection`, `mailStatus`, `mailProvider`**

```
mail_addresses   (user_id, local_part, domain rox.one, address UNIQUE, kind primary|alias, status, grace_until)
mail_threads     (owner_user_id, root_message_ref, subject_norm, last_message_at)
mail_messages    (owner_user_id, thread_id, direction, status, rfc_message_id, raw_blob_key → D8, spam_score)
mail_attachments (message_id, filename, blob_key → D8, drive_file_id? → D8)
mail_events      (message_id?, provider, event_type, provider_event_id UNIQUE)          -- webhook dedup
```

**XMPP — `xmpp.ts` (D4), 5 tables · enums: `xmpp_account_status`, `xmpp_subscription`, `xmpp_direction`, `xmpp_fed_policy` (+ append `"xmpp"` to `identityKindValues`)**

```
xmpp_accounts          (user_id UNIQUE, jid_localpart, domain rox.one, status)          -- (domain,localpart) UNIQUE
xmpp_jid_aliases       (account_id, jid_localpart UNIQUE, reserved_until)               -- rename grace
xmpp_roster_links      (account_id, remote_jid, contact_entity_id? → identity_links, subscription)
xmpp_offline_queue     (account_id, direction, stanza jsonb, origin_id, expires_at)     -- TTL relay buffer only
xmpp_federation_policy (domain UNIQUE, policy allow|deny|throttle, rate_per_min)
```
> Note: ejabberd's own SQL (roster/MAM/offline) lives in a **separate Postgres DB**, NOT `packages/db`. Bridged message bodies live in D1, not here.

**Mesh — `mesh.ts` (D5), 4 tables (+ append npub/noise kinds to `identityKindValues`)**

```
mesh_device_keys     (user_id, noise_static_pub, nostr_npub UNIQUE, ed25519_pub, revoked)  -- pub keys only
mesh_relay_endpoints (organization_id?, url, enabled, priority)                            -- null-org = global default
mesh_delivery_log    (message_id loose-ref, idempotency_key, transport, direction, status) -- UNIQUE dedup
mesh_peer_sightings  (reporter_user_id, seen_noise_pub, rssi)                              -- opt-in telemetry, default OFF
```

**Calendar — `calendar.ts` (D6), 7 tables · enums: `cal_calendar_kind`, `cal_visibility`, `cal_member_role`, `cal_event_status`, `cal_attendee_role`, `cal_rsvp_status`, `cal_reminder_method`, `cal_feed_direction`**

```
cal_calendars         (owner_user_id, name, timezone, kind personal|team, visibility, public_token)
cal_calendar_members  (calendar_id, user_id, role owner|writer|reader|freebusy)         -- shared/team ACL
cal_events            (calendar_id, dt_start, rrule, exdates jsonb, uid, sequence)      -- master event
cal_event_occurrences (event_id, recurrence_id, is_cancelled, dt_start?)               -- per-instance override/EXDATE
cal_attendees         (event_id, user_id?, email, rsvp_status, is_organizer)            -- @handle or external
cal_reminders         (event_id, user_id?, offset_minutes, method app|email, next_fire_at)
cal_ics_feeds         (calendar_id, direction import|export, token)
```

**Notes — `notes.ts` (D7), 2 NEW tables (+ enum appends `note`,`notebook` on `publicShareResourceTypeValues` & `accessResourceTypeValues`)**

```
note_books      (organization_id, created_by, slug, title, is_default, sort_order)     -- named container
note_book_items (note_book_id, document_id → knowledge_documents, sort_order)          -- note∈notebook edge
```
> Note: a "note" IS a `knowledge_documents` row (`type='note'`). No parallel notes/content table — D7 reuses the existing knowledge engine + backlinks + public-share + access-grant machinery.

**Drive — `drive.ts` (D8/D9 — single reconciled file), 6 tables · enums: `driveFileStatus`, `driveSharePerm`, `driveRefSource`, `drive_overage_policy` (+ append `"drive_overage"` to `roxLedgerKindValues`)**

```
storage_quota       (user_id UNIQUE, quota_bytes default 10 GiB, bytes_used, overage_opt_in)  -- atomic accounting
drive_folders       (user_id, parent_id?, name, is_system)                                    -- tree
drive_files         (user_id, folder_id?, name, sha256, storage_key u/<userId>/<sha256>, status, size_bytes)
drive_file_versions (file_id, version, sha256, storage_key)                                    -- optional, schema reserved
drive_shares        (user_id, file_id?|folder_id?, token UNIQUE, password_hash?, expires_at?, takedown)
drive_file_refs     (file_id, source_kind chat_message|email_message|canvas, source_id)        -- D2/D3 bridge
```
> **D8 vs D9 reconciliation (RESOLVED):** both specs proposed a `drive.ts`. They MERGE into one file. Use **D8's table set** (richer: `storage_quota`, content-addressed `u/<userId>/<sha256>` keys, `drive_file_refs` bridge, ref-counted dedup) as canonical. Adopt **D9's substrate decision** (R2 primary + swiss MinIO cold) and D9's `drive_storage_events.ledger_id`→`rox_ledger` overage-bridge pattern, folding the audit/event log into D8's model. Do not create two competing drive schemas.

### 2.3 Cross-domain relations (additive FKs / loose refs)

```
user_profiles.handle ──derives──▶ comms_addresses · mail_addresses · xmpp_accounts.jid_localpart · mesh_device_keys
identity_links ◄──external counterpart── comms_participants · mail (resolveIdentity) · xmpp_roster_links · mesh · cal_attendees
comms_messages.attachments[].url ──▶ drive_files (via D8)        tc_attachments.drive_object_id ──▶ drive_files
mail_messages.raw_blob_key / mail_attachments.blob_key ──▶ drive_files (D8 Email/ system folder)
cal_attendees(@handle) ──▶ users.id ;  invites ──▶ D3 mail_messages (.ics REQUEST)
note_book_items.document_id ──▶ knowledge_documents (reuse)
drive_files ◄── drive_file_refs ──(source_kind) chat_message=D2 | email_message=D3
storage_quota.bytes_used overage ──▶ rox_ledger(kind=drive_overage)  [WS-E]
```

**Multi-tenant invariant:** every new table carries `organization_id` (denormalized where needed for Electric shape filtering), matching the existing `chat_messages`/`team_members` convention. Electric shapes filter on `user_id + organization_id`; shape mis-scoping is the top data-leak risk and gets an isolation test as a release gate.

---

## 3. Storage / Provider Decision (from D9)

**RECOMMENDATION (decisive): Cloudflare R2 as the public Drive primary; the `aws-swiss-migration` MinIO node as private cold/DR backup. Render is rejected for storage.**

- **R2 is GA, S3-compatible (SigV4), zero egress, `$0.015/GB-mo`, 10 GB-mo free tier**, presigned URLs (1s–7d), and custom-domain `drive.rox.one` on the **already-managed `rox.one` Cloudflare zone**. Zero egress is the decisive factor: a viral public share link costs $0 in bandwidth.
- **Render rejected:** no native object store ("coming soon"); only single-instance block disks + self-hosted MinIO that can't scale or serve public links. Render stays fine for *compute*.
- **Swiss node (`aws-swiss-migration`):** live-probed — AWS EC2 us-east-1, 2 vCPU/15 GB, 467 GB free on `/srv/extra`, public Caddy already serving `*.rox.one`. Viable as **private cold/DR** (nightly `mc mirror` from R2), but its AWS egress is billed (~$0.09/GB), so it must NEVER be on the public hot path. Fast-follow, not P0.
- **Abstraction:** new `packages/storage` (`@rox/storage`) with a `StorageDriver`/`StorageProvider` interface (`presignPut/presignGet/head/delete/copy`) + `R2Provider` + `MinioProvider`. Same S3 SDK for both → cold tier is nearly free to build, provider is a config swap, choice is reversible.

### 3.1 Rough cost model (avg 4 GB fill assumption; full-10 GB in parens)

| Users | Stored (4 GB avg) | R2 storage/mo | Viral-link egress | (Full 10 GB fill) |
|---|---|---|---|---|
| **1,000** | ~4 TB | **~$60/mo** | **$0** (R2 zero egress) | ~$150/mo |
| **10,000** | ~40 TB | **~$600/mo** | **$0** | ~$1,500/mo |

Op fees negligible at Drive scale (100M reads/mo ≈ $36). For contrast, serving the same viral 5 TB/mo from the swiss node would cost ~$450/mo in AWS egress — which is exactly why R2 owns the public path.

### 3.2 10 GB free + overage ↔ WS-E economy

- Every user gets `storage_quota.quota_bytes = 10 GiB` (seeded lazily on first Drive use, same pattern as `rox_balances` seeding 500 Rox).
- `bytes_used` is maintained **atomically** (conditional `UPDATE ... WHERE bytes_used + :size <= quota_bytes`), with a nightly reconciliation cron correcting drift.
- Beyond 10 GB: a **daily overage cron** computes `max(0, bytes_used − quota_bytes)`, converts GB-over-month to a Rox cost (`DRIVE_OVERAGE_ROX_PER_GB_MONTH` config), and writes a `rox_ledger` row `kind='drive_overage'` debiting the balance — **no new billing rails**, it reuses WS-E verbatim. Insufficient balance → new uploads blocked, existing files stay readable (policy in §7 Q).
- The same WS-E ledger meters the suite's *other* cost drivers: LiveKit call-minutes (D2, over free allotment), outbound mail sends (D3, token-gated), and calendar invite-email volume (D6). **Text/chat is always free.**

---

## 4. Phase Roadmap P0 → P5 (cross-domain, dependency-ordered, each phase shippable)

**Ordering principle:** identity spine first → highest-value in-house surface (team chat) → productivity surfaces that reuse existing engines (notes/calendar/drive) → heavy own-server infra (email, XMPP) → mesh last. Every phase ends green (`lint`/`typecheck`/`test`/Electric isolation test) and ships a user-visible slice.

```
P0 ─▶ P1 ─▶ P2 ─▶ P3 ─▶ P4 ─▶ P5
spine  chat   notes  email  xmpp   mesh
       +drive +cal          (own server infra)   (P-last differentiator)
```

### P0 — Identity spine + storage substrate (UNBLOCKS EVERYTHING)
**Domains:** D1 (Phases 0–4), D9 (P0–P2), D8 (P0–P1).
**Ships:** `provisionIdentity(userId, handle)` deriving addresses; `comms_*` schema; the `TransportAdapter` contract + registry + `InAppAdapter`; routing engine (`resolveCounterpart`/`resolveThread`/`selectTransport`); presence aggregator; `@rox/storage` with R2 provider + `rox-drive` bucket + `drive.rox.one`; `storage_quota` + `drive_*` schema + quota engine.
**Why first:** D2/D3/D4/D5 all implement the D1 adapter contract; D8 needs the storage driver; nothing real ships without the identity binding and the bucket. This is the hard prerequisite every other domain's spec flags.
**Done when:** a handle claim provisions addresses + a keypair (public only) + a 10 GB quota row; an in-app message round-trips through the router into `comms_messages`; presigned PUT/GET works against R2; CI green.

### P1 — Team chat + Drive UI (highest in-house value)
**Domains:** D2 (full P1.0–P1.4), D8 (P2–P4).
**Ships:** member-to-member DMs + channels (`tc_*`), presence/typing via `@rox/collab`, voice/video via `@rox/rtc`, drag-drop files into chat → Drive, unread/read state, light threads, mentions; Drive UI (tree, presigned upload, public share `rox.one/d/<token>`, quota bar) on web→desktop→mobile.
**Depends on:** P0 (identity, adapter seam, storage driver, quota). Uses WS-L (already merged) + WS-E (calls/overage).
**Why second:** team chat is the flagship, fully in-house (no external server), and exercises the whole stack (Electric shapes, presence, calls, Drive bridge) end-to-end — proving the architecture before heavier infra.
**Done when:** two seeded members in one org DM each other live across web+desktop+mobile; a dragged file stores once in Drive + renders as an attachment; a public share link downloads in an incognito browser; Electric shape-isolation test passes (no cross-org leak); CI green.

### P2 — Notes + Calendar (productivity surfaces, reuse-heavy)
**Domains:** D7 (P0–P4), D6 (P0–P5).
**Ships:** notebooks (`note_*`) over the reused `knowledge_documents` engine, collaborative live editing (LiveBlocks room `note:<id>` gated by `editor` ACL), public note share via existing `/s/[slug]`; calendars (`cal_*`) with RRULE recurrence (extend `shared/rrule.ts`), `@handle`/email attendees, RSVP, reminders via the existing automation scheduler, ICS import/export, invite email via D3 outbound (or stub until P3).
**Depends on:** P0 (identity). D7 reuses existing share/access/collab infra (low new surface). D6 invite *email* soft-depends on D3 — until P3, D6 can ship in-app invites + outbound `.ics REQUEST` is queued/stubbed.
**Why third:** both are mostly *reuse* (knowledge engine, rrule engine, share infra, scheduler) → high value, low new infra, parallelizable with each other.
**Done when:** a notebook groups notes, two users co-edit a note live, a published note opens at `/s/<slug>`; a recurring event previews correct occurrences across DST, `@dana` gets an in-app invite, an external attendee gets a working `.ics`; CI green.

### P3 — Email (own inbound + outbound)
**Domains:** D3 (P0–P4), D8 (P5 chat/email→Drive bridge), D1 unified-inbox surfacing.
**Ships:** DNS/SPF/DKIM/DMARC on `rox.one`; Cloudflare Email Worker (catch-all `*@rox.one` → R2 + signed webhook → `apps/api/.../mail/inbound`); inbound ingest + spam scoring + threading + dedup; outbound via Resend as `<handle>@rox.one`; provisioning + rename grace aliases; inbound mail surfaced in the D1 unified inbox next to in-app threads; mail attachments into Drive `Email/` folder.
**Depends on:** P0 (identity + EmailAdapter seam), D8 (R2 body/attachment storage), WS-E (send quota).
**Why fourth:** first *external-facing own-server* infra (deliverability reputation, abuse surface) — higher risk, so it lands after the in-house surfaces are proven. It also delivers the headline "every user gets `@rox.one` email" moment.
**Done when:** mail to `mark@rox.one` lands threaded in the unified inbox within seconds with attachments in Drive; a reply from the app passes SPF/DKIM/DMARC and threads in the recipient's client; spam is quarantined; CI green + `dig`/Resend evidence.

### P4 — XMPP federation (heaviest infra)
**Domains:** D4 (P0–P4).
**Ships:** ejabberd on Fly owning the `rox.one` XMPP domain (s2s STARTTLS-required + dialback); TS extauth helper (Rox-token-as-password); XEP-0114 component bridge (`bridge.rox.one`) relaying stanzas ↔ D1 hub so users get external Jabber messages in-app without an XMPP client; provisioning + rename aliases; offline queue; federation policy + spam hardening.
**Depends on:** P0 (identity, D1 hub event contract — HARD gate for the bridge in D4 Phase 3), D3 (share the `username@rox.one` namespace; reserve email + JID localpart atomically), Fly deploy pattern from `apps/relay`.
**Why fifth:** the heaviest ops (Erlang server, s2s reputation, federation spam) and it gates Phase 3 on a frozen D1 hub contract. Ship after email proves the own-server muscle.
**Done when:** `alice@rox.one` is reachable from Conversations/Gajim; an external message appears in the Rox app via the bridge; a reply is delivered as `alice@rox.one`; s2s passes a compliance check; CI green + compliance.im evidence.

### P5 — Mesh (P-last differentiator)
**Domains:** D5 (P0–P3; P3 BLE optional).
**Ships:** `MeshTransport` adapters into D1's router — Nostr NIP-17 gift-wrapped fallback (`@rox/mesh-nostr`, all platforms, fires only when server adapter unavailable) + reconciliation/dedup; optional Rox-run Nostr relay beside `apps/relay`; "delivered via fallback network" UX + `MESH_TRANSPORT` flag. BLE local mesh (`@rox/mesh-ble`) is mobile-first/Electron best-effort/web-impossible and explicitly **deferred within P5**.
**Depends on:** P0 (D1 adapter seam — the hard prerequisite), ROX-522 (device key derivation), `identity_links` (npub→contact).
**Why last:** pure differentiator/resilience, not the backbone; BLE is real native work + app-store review. Ship Nostr fallback (~3–4 wk) as the acceptance bar; BLE as a later marketing push.
**Done when:** with the server backbone forced down, an outgoing DM flushes over Nostr E2E and reconciles with no dupes + stable IDs when back online; web never shows a BLE prompt; CI green (+ two-device video evidence if BLE pursued).

---

## 5. Effort & Risk Rollup

| Domain | Size | Weeks (1 eng) | Phase | Top risk |
|---|---|---|---|---|
| **D1 identity hub** | L | ~6 | P0 | handle recycling/impersonation; cross-transport thread mismatch |
| **D9 storage substrate** | M–L | ~3.5–4 | P0 | egress/cost blowup on viral links (mitigated by R2 zero-egress) |
| **D8 drive** | L | ~7–8 | P0/P1 | abuse/illegal-content hosting on public shares; quota race |
| **D2 team chat** | L | ~5–6 | P1 | Electric shape mis-scoping = cross-org data leak |
| **D7 notes** | M–L | ~4–5 | P2 | LiveBlocks MAU cost; public-share abuse; notebook→note ACL leak |
| **D6 calendar** | L | ~7.5 (+2 CalDAV) | P2 | recurrence/DST correctness; invite spam; public-token leak |
| **D3 email** | L | ~4.3 (+2 IMAP) | P3 | deliverability/reputation; inbound backscatter; outbound abuse |
| **D4 xmpp** | L | ~6–8 | P4 | federation spam; s2s IP reputation; Rox↔ejabberd store drift |
| **D5 mesh** | M (+L BLE) | ~3–4 (+4–6 BLE) | P5 | spam on open relays; iOS background-BLE reality; clean-room licensing |

**Program total (sequential, 1 eng):** ~46–52 weeks core (excluding deferred CalDAV/IMAP/BLE). **Parallelizable** after P0: D8+D2 (P1), D6+D7 (P2), D3+D4 prep can overlap → realistic ~28–34 weeks with 2–3 engs. D1+D9+D8-foundation in P0 is the critical path that gates everything.

---

## 6. Cross-Cutting Concerns

**Abuse / spam / security**
- Public inboxes (`@rox.one`) + public XMPP JIDs + public share links + open Nostr relays are all spam/abuse magnets. Defenses: edge default-reject unknown handles (D3 Worker), `mod_register` locked + message-from-stranger drop + per-domain policy (D4), spam scoring + quarantine (D3), unguessable tokens + revoke + takedown + async malware scan (D8), inbound-from-known-contacts-only (D5).
- **Identity integrity:** handle = email + JID + mesh key, so a recycled handle could inherit a predecessor's mail/messages. Defense: permanent reservation of previously-active handles + 90-day alias grace across D1/D3/D4.
- **E2E key custody:** mesh/E2E private keys NEVER server-side — `expo-secure-store` (mobile) / Electron `safeStorage` (desktop) / Infisical pointer (`secret_ref`); Neon stores public keys only.
- **Data leak (top risk):** Electric shape mis-scoping. Defense: every table carries `organization_id`; shapes filter `user_id+organization_id`; a shape-isolation integration test is a release gate.

**Deliverability** — new sending domain risks the spam folder. Defense: strict SPF/DKIM/DMARC on `rox.one` (Cloudflare DNS), DMARC `p=quarantine`→`p=reject`, Resend bounce/complaint monitoring + suppression list, warm-up. For XMPP s2s: stable Fly IP + correct rDNS + valid cert, Cloudflare gray-cloud (proxy OFF) for XMPP records.

**Quota accounting** — one quota (`storage_quota`), atomic conditional updates, ref-counted dedup deletes (per-user `u/<userId>/<sha256>` — NOT cross-user, for privacy), nightly reconciliation, daily overage → one ledger. Chat/email attachments count against the same 10 GB (confirm in §7).

**Multiplatform (web/desktop/mobile)** — one tRPC contract + one Electric shape set per domain, consumed by `apps/web` (Next 16), `apps/desktop` (Electron IPC tRPC + SQLite persistence), `apps/mobile` (Expo). Cache-first rendering everywhere (AGENTS.md #9: render persisted rows before `isReady`). No platform-specific data model. Web is honestly degraded only where physics forbids (mesh BLE: web = Nostr-only).

**Cost** — text is free (Electric/Postgres). Metered cost drivers all flow through WS-E: LiveKit minutes (D2), mail sends (D3), invite email (D6), Drive overage (D8/D9). R2 zero-egress kills the scariest line. LiveBlocks/LiveKit are MAU/minute-metered and gated behind ACL/flags. Own servers (ejabberd on Fly, Email Worker on CF) are small fixed cost.

---

## 7. Open Questions for the Owner (decisions needed before/within execution)

**Identity & namespace (P0, blocking)**
1. **Handle recycling:** permanently reserve freed handles vs release after N days? (Recommend: permanent reservation for previously-active handles, 90-day alias grace.) — affects D1/D3/D4 atomically.
2. **Org scoping of comms:** is the unified inbox / mail / calendar per-user-global or per-organization? Schema is org-scoped; confirm a user's personal `@rox.one` mail/calendar isn't siloed per org. (D1, D3, D6.)
3. **E2E encryption scope:** mesh-only E2E v1, or also in-app/XMPP DMs (OMEMO)? (Recommend: mesh-only v1.)

**Storage & economy (P0, blocking)**
4. **R2 billing account:** confirm the Cloudflare account owning the `rox.one` zone can hold the `rox-drive` R2 bucket + payment past the free tier.
5. **Overage policy + rate:** soft-meter against WS-E balance (recommended) vs hard-cap at 10 GB? Confirm `DRIVE_OVERAGE_ROX_PER_GB_MONTH`. Is 10 GB free **per user** or per org? Do chat/email attachments share the user's 10 GB? (Recommend: per-user, shared quota.)
6. **Cold tier timing:** R2-only first, swiss MinIO replication as fast-follow (recommended) vs build P4 backup now?

**Infra targets (P3/P4)**
7. **Inbound mail vendor:** confirm Cloudflare Email Routing+Workers primary (uses the zone + R2 we own) vs one-vendor Resend send+receive. (Recommend: Cloudflare primary.)
8. **External IMAP/SMTP:** real demand for Apple Mail/Thunderbird? If yes, accept MX split (Migadu on a subdomain) vs self-hosted Stalwart — the biggest D3 fork. (Recommend: defer.)
9. **XMPP hosting + federation posture:** Fly primary (mirror `apps/relay`) vs sovereign swiss node? Open federation + blocklist vs allowlist-only at launch? (Recommend: Fly primary; open + aggressive stranger-drop.)

**Product scope (P1/P2/P5)**
10. **Free call-minute allotment** per MAU before WS-E overage (D2); **free invite/reminder-email allowance** (D6). Need both numbers to wire metering.
11. **Notes:** public-share default snapshot vs live; LiveBlocks room lazy-open on 2nd editor (cost control)? (Recommend: snapshot p1, lazy room.)
12. **Mesh ship line:** "Nostr fallback works" (P5 core, ~3–4 wk) as the bar, BLE explicitly deferred? Stand up a Rox-run Nostr relay on Fly? Restrict mesh inbound to known contacts? (Recommend: yes / yes / yes.)

---

## Executive Summary

**Storage recommendation:** **Cloudflare R2** as the public Drive primary (GA, S3-compatible, **zero egress**, `$0.015/GB-mo`, `drive.rox.one` on the already-owned zone) with the **`aws-swiss-migration` MinIO node as private cold/DR** (fast-follow, never the public path). Render rejected for storage. Cost: ~$60/mo @1k users, ~$600/mo @10k users (4 GB avg); viral-link egress = $0. The 10 GB free quota + overage bridges into the existing **WS-E `rox_ledger`** (`kind=drive_overage`) — no new billing rails.

**Phase list (dependency-ordered, each shippable):**
- **P0 — Identity spine + storage substrate** (D1 hub + adapter contract, D9 R2 substrate, D8 quota engine). Unblocks everything.
- **P1 — Team chat + Drive UI** (D2 in-app chat/calls/files, D8 UI + public shares). Highest in-house value, exercises full stack.
- **P2 — Notes + Calendar** (D7 notebooks over knowledge engine, D6 RRULE calendar + invites). Reuse-heavy, parallelizable.
- **P3 — Email** (D3 Cloudflare inbound Worker + Resend outbound, unified inbox). First own-server infra.
- **P4 — XMPP** (D4 ejabberd on Fly + bridge into D1). Heaviest infra.
- **P5 — Mesh** (D5 Nostr fallback now, BLE deferred). P-last differentiator.

**Top 3 open questions blocking execution:**
1. **Handle recycling + org-scoping policy** — permanent reservation + 90-day alias grace, and confirm personal `@rox.one` mail/calendar is NOT siloed per org (blocks D1/D3/D4/D6 schema semantics).
2. **R2 billing account + overage policy** — confirm the Cloudflare account holds `rox-drive` with payment, and soft-meter-vs-hard-cap + `DRIVE_OVERAGE_ROX_PER_GB_MONTH` + per-user-vs-per-org 10 GB (blocks D8/D9 P0).
3. **Inbound mail vendor + XMPP federation posture** — confirm Cloudflare Email Routing+Workers primary, and open-federation-with-blocklist vs allowlist-only (blocks D3/D4 infra design).

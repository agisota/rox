## D2 — In-App Team Chat (Phase-1, in-house)

> Status: **SUPERSEDED (as-built diverged)** — see the reconciliation section directly below before reading the original spec. The original `tc_*` design (this document) was **not built**. Owner sign-off required before any future implementation of the deltas listed below.
> Part of the Rox Comms Suite. Sibling domains referenced: D8 (Drive/file storage), WS-L (@rox/collab + @rox/rtc), WS-E (token economy), ROX-522 (handle/identity).
> Grounding: real tables read from `packages/db/src/schema/` (`auth.ts`, `chat.ts`, `economy.ts`, `schema.ts`), real router list in `packages/trpc/src/root.ts`, real Electric wiring in `apps/desktop/.../CollectionsProvider/collections.ts`.

---

### 0 SUPERSEDED / as-built reconciliation (2026-06-23)

> **Decision (owner-accepted in HARDENING-AUDIT finding T2):** the as-built "team chat" surface is the **`comms_*` D1 unified-comms spine**, NOT the `tc_*` D2 model this spec describes. The `tc_*` model below is **NOT built and will not be built as-is**. This document is retained as the original design of record and as the source for future deltas; it is annotated, not deleted.

**What actually shipped (as-built):**
- The chat/inbox surface is backed by the **`comms_*` spine** — `comms_threads`, `comms_messages`, `comms_participants`, `comms_addresses`, `comms_presence` (`packages/db/src/schema/comms.ts`) — and served by **`commsRouter`** registered as `comms` in `packages/trpc/src/root.ts`. There is **no `teamChat` router** and **no `tc_*` table anywhere** (verified: grep `tc_` in `packages/db/src/schema/` = 0 matches; no `teamChat` in `root.ts`).
- This spine is the same one D1 (unified inbox / identity) uses, so in-app DMs, email, and (future) XMPP share one threading + participant + presence model rather than the chat-only `tc_*` model.

**Why the divergence is accepted:**
- One spine (`comms_*`) unifies in-app chat with email/XMPP threading (D1's headline value prop) instead of a parallel chat-only store. A second `tc_*` model would have duplicated threading/participant/read-state and forced cross-transport merge logic that the comms spine already centralizes (`MessageRouter`).
- The `tc_*`-specific features below are **not lost** — they are reframed as **additive deltas on `comms_threads`/`comms_*`** for a future phase, not a separate table family.

**`tc_*` features → comms-spine deltas (future, owner-gated):**
| D2 `tc_*` concept | As-built location | Delta to land later (on `comms_*`) |
|---|---|---|
| `tc_conversations.kind` (`dm`/`channel`) | `comms_threads` (no channel kind) | add `kind`/`channel` flag + `slug`/`name`/`team_id` to `comms_threads` |
| `tc_conversations.visibility` (`org`/`private`) | none | add `visibility` to `comms_threads` for org-public channels |
| `tc_conversations.dm_key` DM dedupe | partial DM dedup in `MessageRouter` (see T6) | canonical sorted-pair dedup key on `comms_threads` |
| `tc_conversation_members` channel membership | `comms_participants` (DM/thread participants) | extend participants with channel `role`/`muted` for channels |
| `tc_messages` edit/delete/`kind` tombstones | `comms_messages` (no `deleted_at`/`edited_at`/`kind`) | additive `deleted_at`/`edited_at`/`kind` (see T8) |
| `tc_message_reads` | `comms` read watermark (`lastReadMessageId`) | already comparable; surface unread count (see I6/T4) |
| `tc_attachments` | Drive (D8) refs | wire `drive_file_refs` from chat (see D4) |

**Realtime:** D2 §2/§3 promise ElectricSQL live shapes for `tc_*`. The as-built comms spine does **not** use Electric live-sync — see finding I7/T5/N7 in HARDENING-AUDIT and the "Realtime model (as-built)" note there. The Electric-shapes migration for the comms spine is a deferred owner decision.

**Everything below this line is the original (un-built) `tc_*` spec, retained for reference only.**

---

### 1 Scope & user stories

**In scope (P1):** member-to-member real-time chat inside an org — *not* the existing agent-session chat (`chat_messages` is single-user agent dialogue and stays untouched).

- **Presence** — As a member I see who else is in my org/team and their live status ("12 online"), so I know who's reachable. (Powered by @rox/collab / LiveBlocks presence — WS-L.)
- **DMs** — As a member I open a 1:1 with another member by their **rox handle** (ROX-522) and exchange messages in real time.
- **Channels** — As a member I join/post in named channels scoped to my org (optionally to a `team`). Public-to-org channels + private (invite-only) channels.
- **Files** — As a member I drag a file into a message; it uploads to **Drive (D8)** and renders as an attachment (image preview / file card) that recipients can open or download.
- **Read state / unread** — As a member I see unread badges per conversation and a "last read" marker; opening a conversation clears it.
- **Threads (light)** — As a member I reply in a thread off a message to keep side-discussions tidy (reuse the proven `parent_message_id` self-reference pattern from `chat_messages`).
- **Calls** — As a member I start a voice/video call from a DM or channel (deep-link into @rox/rtc / LiveKit — WS-L; call signalling is out of D2's data model, D2 only stores a "call started" system message + room ref).
- **Mentions** — `@handle` mentions notify the mentioned member (in-app badge; email digest is D1's job, not D2).
- **Edit/delete** — Author edits or soft-deletes their own message; tombstone preserved for sync consistency.

**Out of scope (later phases):** federation / XMPP bridge (separate domain), message search ranking (graph package can index later), reactions/emoji v2, scheduled messages, message retention policies, e2e encryption, guest/external users, voice transcription (D-voice already exists in `voice.ts`).

**Non-negotiable constraints**
- **Multiplatform-first:** one tRPC contract + one Electric shape set, consumed by web (`apps/web`), desktop (`apps/desktop`, Electron IPC tRPC + Electric SQLite persistence) and mobile (`apps/mobile`, Expo). No platform-specific message model.
- **Additive schema only** — new file `packages/db/src/schema/team-chat.ts`, tables prefixed `tc_`. Never edit existing `chat_messages`. Migrations via `bunx drizzle-kit generate` (offline) only.
- **Identity = rox handle** (ROX-522). DMs/mentions resolve through the handle, FKs point at `auth.users.id`.

---

### 2 Target design

```
                         ┌──────────────────────── CLIENTS ────────────────────────┐
                         │  apps/web (Next 16)   apps/desktop (Electron)   apps/mobile │
                         │     │  TanStack DB live queries (cache-first)    (Expo)     │
                         └─────┼──────────────────────┬──────────────────────┬────────┘
              WRITES (tRPC)    │            READS (Electric SSE)              │ presence/calls
                               ▼                      ▼                      ▼
        ┌───────────────► teamChatRouter ────►  ElectricSQL shapes ◄── @rox/collab (LiveBlocks)
        │  packages/trpc/      (NEW)         (tc_* tables, org/conv-     presence "N online", typing
        │  router/team-chat/   send/edit/    scoped WHERE)              @rox/rtc (LiveKit) call rooms
        │                      delete/ack/                                     │
        │                      createConv/                                     │ (WS-L, already merged)
        │                      addMember                                       │
        │                            │                                        │
        │   file upload (presigned)  ▼                                        │
        │   ── D8 Drive ──►  tc_attachments rows ◄── packages/trpc/lib/upload.ts (exists)
        │                            │
        ▼                            ▼
   WS-E economy            packages/db/src/schema/team-chat.ts  ──► Neon Postgres
   (roxLedger/balances:    tc_conversations  tc_conversation_members
    only for paid call     tc_messages       tc_message_reads
    minutes/overage —      tc_attachments
    NOT for text)          (+ reuse auth.users / auth.organizations / auth.teams)
```

**Write/read split (matches existing Rox pattern):** mutations go through tRPC (`teamChatRouter`); reads are live via ElectricSQL shapes consumed by TanStack DB collections (exactly like `v2Workspace`, `chatSessions`, `teamMembers` in `CollectionsProvider/collections.ts` using `electricCollectionOptions` + `snakeCamelMapper`). Desktop additionally persists via `@tanstack/electron-db-sqlite-persistence` (already in use). Presence/typing/calls do **not** hit Postgres — they ride @rox/collab + @rox/rtc.

#### ERD (additive — `packages/db/src/schema/team-chat.ts`, all tables `tc_` prefixed)

Reused existing tables (NOT modified): `auth.users(id)`, `auth.organizations(id)`, `auth.teams(id)`, `auth.members`.

**`tc_conversations`** — a DM or channel.
| column | type | notes |
|---|---|---|
| id | uuid PK | defaultRandom |
| organization_id | uuid NOT NULL FK→organizations.id ON DELETE cascade | org scope (Electric shape filter) |
| kind | enum `tc_conversation_kind` {`dm`,`channel`} NOT NULL | |
| team_id | uuid NULL FK→teams.id ON DELETE set null | channel may belong to a team |
| slug | text NULL | channel handle, e.g. `general` |
| name | text NULL | display name (channels) |
| visibility | enum `tc_conversation_visibility` {`org`,`private`} NOT NULL default `private` | DMs always `private` |
| created_by | uuid NOT NULL FK→users.id ON DELETE set null | |
| dm_key | text NULL | canonical sorted `userA:userB` for DM dedupe |
| last_message_at | timestamptz NULL | denormalized for conversation-list ordering |
| created_at / updated_at | timestamptz NOT NULL | `$onUpdate` |

Indexes: `tc_conversations_org_kind_lastmsg_idx (organization_id, kind, last_message_at desc)`; `uniqueIndex tc_conversations_org_slug_uniq (organization_id, slug)` (partial-style: enforce only for channels at app layer); `uniqueIndex tc_conversations_dm_key_uniq (organization_id, dm_key)`.

**`tc_conversation_members`** — who's in a conversation (membership = read authorization + Electric shape gate).
| column | type | notes |
|---|---|---|
| id | uuid PK | |
| conversation_id | uuid NOT NULL FK→tc_conversations.id ON DELETE cascade | |
| user_id | uuid NOT NULL FK→users.id ON DELETE cascade | |
| organization_id | uuid NOT NULL FK→organizations.id ON DELETE cascade | **denormalized** for Electric shape filter (same trick as `team_members.organization_id`) |
| role | enum `tc_member_role` {`owner`,`member`} NOT NULL default `member` | |
| muted | boolean NOT NULL default false | |
| joined_at | timestamptz NOT NULL | |

Indexes: `uniqueIndex tc_conv_members_conv_user_uniq (conversation_id, user_id)`; `tc_conv_members_user_org_idx (user_id, organization_id)` (drives "my conversations" Electric shape).

**`tc_messages`** — one row per message (mirrors `chat_messages` conventions incl. `parent_message_id`).
| column | type | notes |
|---|---|---|
| id | uuid PK | |
| conversation_id | uuid NOT NULL FK→tc_conversations.id ON DELETE cascade | |
| organization_id | uuid NOT NULL FK→organizations.id ON DELETE cascade | denormalized for shape filter |
| author_id | uuid NOT NULL FK→users.id ON DELETE set null | `set null` (leaver's messages survive — note in `chat_messages` flags this as the right call for shared history) |
| parent_message_id | uuid NULL self-FK ON DELETE set null | thread root = null (same pattern as `chat_messages`) |
| kind | enum `tc_message_kind` {`text`,`system`,`call`} NOT NULL default `text` | `system`=join/leave; `call`=call-started ref |
| content | text NOT NULL default '' | |
| metadata | jsonb NOT NULL default `{}` | mentions[], call room id, edit history pointer |
| edited_at | timestamptz NULL | |
| deleted_at | timestamptz NULL | soft delete tombstone (sync-safe) |
| created_at / updated_at | timestamptz NOT NULL | |

Indexes: `tc_messages_conv_created_idx (conversation_id, created_at)` (org-leading not needed — conv is already org-scoped via membership, but keep `organization_id` for shape WHERE); `tc_messages_org_conv_created_idx (organization_id, conversation_id, created_at)`; `tc_messages_parent_idx (parent_message_id)`.

**`tc_message_reads`** — per-user read cursor (unread = messages after `last_read_message_at`).
| column | type | notes |
|---|---|---|
| id | uuid PK | |
| conversation_id | uuid NOT NULL FK→tc_conversations.id ON DELETE cascade | |
| user_id | uuid NOT NULL FK→users.id ON DELETE cascade | |
| organization_id | uuid NOT NULL FK→organizations.id | denormalized for shape filter |
| last_read_message_id | uuid NULL FK→tc_messages.id ON DELETE set null | |
| last_read_at | timestamptz NOT NULL | |

Index: `uniqueIndex tc_message_reads_conv_user_uniq (conversation_id, user_id)`.

**`tc_attachments`** — file metadata; bytes live in Drive (D8), not Postgres.
| column | type | notes |
|---|---|---|
| id | uuid PK | |
| message_id | uuid NOT NULL FK→tc_messages.id ON DELETE cascade | |
| organization_id | uuid NOT NULL FK→organizations.id | shape filter |
| drive_object_id | uuid NULL FK→(D8 drive object table) | nullable until D8 lands; interim = store key/url in `storage_key` |
| storage_key | text NOT NULL | provider object key (R2/R2-compatible) |
| file_name | text NOT NULL | |
| content_type | text NOT NULL | |
| byte_size | bigint NOT NULL | |
| width / height | integer NULL | image preview |
| created_at | timestamptz NOT NULL | |

Index: `tc_attachments_message_idx (message_id)`.

**Enums** (append to `packages/db/src/schema/enums.ts` or local to `team-chat.ts`): `tc_conversation_kind`, `tc_conversation_visibility`, `tc_member_role`, `tc_message_kind`.

> Counting: rather than a denormalized unread counter, derive unread from `tc_message_reads` vs `tc_messages` at query time (cache-first via Electric). Add a denormalized `unread_count` only if profiling shows it's needed.

---

### 3 Providers / tech choices + tradeoffs

| Concern | Choice | Why / tradeoff |
|---|---|---|
| Message persistence | **Neon Postgres + Drizzle** (new `tc_*` tables) | Single source of truth, additive, matches `chat_messages`. Tradeoff: text history grows — partition/retention is a later phase. |
| Live read sync | **ElectricSQL shapes + TanStack DB** | Already the repo's live-read backbone (`v2Workspace`, `chatSessions`). Cache-first rule (AGENTS.md #9) handles offline desktop/mobile for free. Tradeoff: shape-per-conversation can fan out; mitigate with one "my conversations + recent messages" shape scoped by `user_id+organization_id`, plus on-demand history pagination via tRPC for deep scrollback. |
| Presence / "N online" / typing | **@rox/collab (LiveBlocks)** — WS-L, merged | Don't reinvent presence in Postgres; `device_presence` is device-level telemetry, not chat presence. Tradeoff: external dependency + per-MAU cost; acceptable, presence is ephemeral. |
| Voice/video calls | **@rox/rtc (LiveKit)** — WS-L, merged | Reuse `rtc.token` router. D2 only stores a `kind=call` system message + room id. Tradeoff: LiveKit egress/minutes cost → meter via **WS-E** (`roxLedger`) for paid call minutes/overage only; text chat is free. |
| File bytes | **Drive (D8)** → object storage | D2 stores metadata (`tc_attachments`), D8 owns bytes + public share links. Provider decision is D8's; D2 is provider-agnostic (holds `storage_key`). Recommendation to D8: **Cloudflare R2** (S3-compatible, public buckets, zero egress — best fit for chat image hotlinking) unless Render object storage proves cheaper for the 10GB-free tier. |
| Upload mechanism | **Presigned PUT via `packages/trpc/src/lib/upload.ts`** (exists) | Client uploads directly to object store; server only issues the grant + records `tc_attachments`. Tradeoff: must validate content-type/size server-side before issuing grant (abuse control). |
| Realtime write fanout | **Electric handles propagation** (write to PG → shape pushes to subscribers) | No bespoke WebSocket server needed for text. `apps/relay` (Fly tunnel) stays for host/agent traffic, not chat. Tradeoff: Electric write→read latency (~sub-second) is fine for chat; sub-100ms typing indicators go through LiveBlocks instead. |
| Mentions resolution | **rox handle (ROX-522)** | `@handle` → `users.id`. Reuse identity model; no new identity store. |

**Rejected:** standalone Socket.io/WS chat server (duplicates Electric); storing presence in Postgres (write amplification, LiveBlocks exists); embedding bitchat (native Swift, no accounts/files — borrow Nostr/mesh concepts only for a future optional offline layer, not the backbone).

---

### 4 Phased tasks (bite-sized; file paths; test approach — no code)

**P1.0 — Schema (db)**
1. `packages/db/src/schema/team-chat.ts` — define `tc_conversations`, `tc_conversation_members`, `tc_messages`, `tc_message_reads`, `tc_attachments` + enums; export `Select*/Insert*` types. Mirror `chat.ts` doc-comment + index conventions.
2. `packages/db/src/schema/index.ts` — barrel-export the new module.
3. Run `bunx drizzle-kit generate --name="team_chat_tables"` (offline diff only; never migrate/push). Verify generated SQL is additive.
   - **Test:** `bun test packages/db` (schema typecheck + snapshot); assert no diff to `chat_messages`.

**P1.1 — tRPC router (server)**
4. `packages/trpc/src/router/team-chat/team-chat.ts` + `index.ts` — `teamChatRouter` with procedures: `listConversations`, `getOrCreateDm(handle)`, `createChannel`, `addMember`/`removeMember`, `sendMessage`, `editMessage`, `deleteMessage`, `markRead`, `requestAttachmentUpload` (presigned), `startCall` (writes `kind=call` msg, returns LiveKit room via `rtc.token`). All `protectedProcedure` + `requireActiveOrgMembership` (exists in `router/utils/active-org`).
5. `packages/trpc/src/root.ts` — register `teamChat: teamChatRouter` (append-only, alphabetical near `team`).
   - **Test (TDD, matches WS-L/WS-E style):** unit tests per procedure — authz (non-member can't read/post), DM dedupe via `dm_key`, soft-delete tombstone, mention parsing, presigned-grant content-type/size rejection.

**P1.2 — Electric shapes + collections (clients shared)**
6. Add `tc_*` shapes to the Electric proxy allow-list + define collections in each client's CollectionsProvider, scoped by `user_id + organization_id` (DMs/channels the user is a member of) — model on `apps/desktop/.../CollectionsProvider/collections.ts` (`electricCollectionOptions`, `snakeCamelMapper`); web + mobile mirror it.
   - **Test:** collection mapping unit tests (snake→camel), shape WHERE excludes other-org rows.

**P1.3 — Surfaces (web / desktop / mobile)**
7. `apps/web/src/app/.../chat/` — conversation list + message thread + composer + file drop; presence rail via @rox/collab; call button via @rox/rtc. Follow Rox folder structure (one component per folder, co-located tests).
8. `apps/desktop/src/renderer/routes/_authenticated/.../chat/` — same UI, IPC tRPC + Electric SQLite persistence; cache-first rendering (AGENTS.md #9 — render persisted rows before `isReady`).
9. `apps/mobile/.../chat/` — Expo screens (conversation list, thread, composer); `useLiveQuery` cache-first; native file picker → presigned upload.
   - **Test:** component tests (vitest/RTL web+desktop, RNTL mobile) for unread badge, optimistic send, attachment card, cache-first (rows show while `isReady=false`).

**P1.4 — Cross-cutting**
10. Mention notifications → in-app badge (reuse existing notification/activity surface); email digest delegated to D1 (not built here).
11. Call-minute metering hook → WS-E `roxLedger` debit on call end (only when over free allotment).
   - **Test:** integration — send across two seeded members in one org, assert recipient's Electric collection receives it; abuse test (oversized upload rejected); call message persists with room ref.

---

### 5 Effort (S/M/L + weeks) & Risks

| Phase | Size | Rough |
|---|---|---|
| P1.0 schema | S | 0.5 wk |
| P1.1 tRPC router | M | 1 wk |
| P1.2 Electric shapes/collections | M | 1 wk |
| P1.3 surfaces (web+desktop+mobile) | L | 2–2.5 wk |
| P1.4 cross-cutting (mentions/metering) | S–M | 0.5–1 wk |
| **Total** | **L** | **~5–6 wk** (1 eng; parallelizable across platforms after P1.2) |

**Risks**
- **Spam / abuse:** open-to-org channels invite spam. Mitigate: rate-limit `sendMessage` per user (token bucket), org-admin can lock channels, mention-bomb cap. Cost risk: presigned uploads → enforce per-message size + per-user daily upload quota (ties to D8 10GB + WS-E overage).
- **Security / data leak:** Electric shape mis-scoping is the #1 risk (could leak other-org/other-conv messages). Mitigate: every `tc_*` table carries denormalized `organization_id`; shapes filter on `user_id+organization_id`; membership FK gates reads; add a shape-isolation integration test as a release gate.
- **Cost:** LiveBlocks per-MAU + LiveKit minutes + R2 storage/ops. Text is cheap (Electric/PG); calls + files are the cost drivers → metered via WS-E. Presence cost is bounded (ephemeral).
- **Sync correctness:** cache-first rule (AGENTS.md #9) — must render persisted rows before `isReady`; soft-delete tombstones (`deleted_at`) instead of hard delete so Electric doesn't desync.
- **Scope creep:** reactions/search/federation explicitly deferred; resist pulling them into P1.
- **Provider lock-in (LiveBlocks/LiveKit):** acceptable for P1; presence/calls are replaceable behind @rox/collab + @rox/rtc package boundaries (already abstracted in WS-L).

---

### 6 Dependencies on other domains + Rox infra reused

**Depends on:**
- **WS-L (@rox/collab + @rox/rtc)** — presence + calls. *Already merged* (tasks #35–40). `rtc.token` router exists.
- **D8 (Drive)** — file bytes + share links + final storage provider pick (R2 recommended). D2 ships with `storage_key` so it can run before D8's object table exists; wire `drive_object_id` FK when D8 lands.
- **ROX-522 (handle/identity)** — DM-by-handle, `@mentions`.
- **WS-E (token economy)** — `roxBalances`/`roxLedger` for call-minute/overage billing only (text is free).
- **D1 (email)** — mention/unread email digests (out of D2; D2 emits the event).

**Reuses (verified in repo):**
- `auth.users`, `auth.organizations`, `auth.teams`, `auth.members`, `requireActiveOrgMembership` (`packages/trpc/src/router/utils/active-org`).
- ElectricSQL + TanStack DB live-read stack (`apps/desktop/.../CollectionsProvider/collections.ts`, `electricCollectionOptions`, `snakeCamelMapper`, `@tanstack/electron-db-sqlite-persistence`).
- `chat_messages` conventions (`parent_message_id` self-FK, jsonb `metadata`, org-leading indexes) — copied, not modified.
- `packages/trpc/src/lib/upload.ts` (presigned upload helper).
- tRPC root registration + TDD pattern from WS-L/WS-E.
- Electron IPC tRPC **observable** subscription pattern (per `apps/desktop/AGENTS.md`) if any push-style channel is needed beyond Electric.

---

### 7 Open questions for the owner

1. **Channel governance:** can any member create org-visible channels, or admin-only? (affects spam surface + `createChannel` authz).
2. **DM scope:** DMs limited to same-org members only, or cross-org once federation exists? (P1 assumes same-org only.)
3. **Free vs paid line for calls:** how many free call-minutes/MAU before WS-E overage kicks in? Needed to wire the metering hook.
4. **Attachment quota:** does chat upload count against the user's 10GB Drive quota (D8), or a separate chat allotment? (Spec assumes it shares the Drive quota.)
5. **Retention:** any message retention/deletion policy for P1, or keep-forever? (affects partitioning plan + GDPR-style delete).
6. **Mesh/offline layer:** is the bitchat-inspired optional offline mesh in scope for any later D2 phase, or a separate domain entirely? (Spec treats it as out-of-scope/separate.)

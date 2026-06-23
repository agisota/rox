# Identity & Isolation Foundation — Design Spec

> **Status:** owner-approved 2026-06-23 (brainstorming gate). Feeds `writing-plans`.
> **Slice of:** Rox Comms Suite hardening (`plans/rox-comms-suite/HARDENING-AUDIT.md`).
> **Closes findings:** I1, S1, I3/M2, S2, T1/S4, C1/S3, N1.
> **Method:** competing design candidates → adversarial judging → synthesis → verification (verdict APPROVE, all 7 findings closed, additive-safe). Load-bearing enum/schema facts independently re-verified against source.

## Summary (BLUF)

Build a single `@rox/identity` registry-of-record module that owns `provision / renameHandle / reserve / resolveAddress`, make `username@rox.one` globally unique at the DB level (matching the existing `mail_addresses` global unique), and add cross-org membership guards at every mutation seam. Base approach = **Candidate C** (registry-of-record `identity_handles`, no address-table merge, reuse `access_grants` for notes), grafting Candidate B's DB-constraint regression test + defense-in-depth members port and Candidate A's batched `assertOrgMembers`.

**Load-bearing decision:** do **not** merge `comms_addresses` and `mail_addresses` (divergent lifecycles: XMPP/mesh vs RFC mail). Instead `identity_handles` is the permanent global reservation authority both address tables reconcile against inside one transaction. All schema deltas are additive (`drizzle-kit generate` only, never `migrate`/`push` prod, never hand-edit `packages/db/drizzle/`).

## Locked decisions (owner-confirmed)

- **DQ1 (note default):** a same-org non-owner with no explicit grant is **DENIED** (owner-only). No read-only-for-org default. Matches `note_notes` owner-only model; closes N1 hard.
- **DQ2 (index kinds):** the global partial-unique covers **all** `comms_address` kinds (`email`, `xmpp`, `mesh`, `inapp`) — one live owner per `(kind, value)`.
- **DQ3 (orphaned handles):** deploy-time backfill script provisions users who have `user_profiles.handle` set but no addresses (claimed before provisioning was wired).
- **DQ4 (alias retirement):** `retireExpiredAliases` runs on the existing mail/drive cron lane, **daily**. 90-day grace (DECISIONS.md DQ4 wins over D3-spec's 30d).
- **Grantee literal:** the forbidden-on-notes grantee types are the literals **`'organization'`** and `'team'` (verified `accessGranteeTypeValues = ['user','team','organization']`) — never the shorthand `'org'`, or the filter is a silent no-op that re-opens N1.

## Slice boundary (explicitly OUT of scope)

- The broader DQ3 product refactor making **calendars / unified-inbox global per user** — separate slice. This slice keeps org-scoped surfaces org-scoped + adds the membership guard; it fixes identity/**address** globalness only.
- Cross-transport thread merge (I2) and presence (I4) — belong to the "unified inbox" slice.

## Architecture

```
            ┌──────────── @rox/identity (single writer of identity) ─────────┐
            │           provision · renameHandle · reserve · resolveAddress   │
            └────────────────────────────────────────────────────────────────┘
 claimHandle ──first claim──► provisionIdentity        inbound mail / comms ports
            └──handle change─► renameHandle             └─ resolveAddress(kind,value) GLOBAL + alias-aware
                    │
        ┌──────────────── ONE dbWs.transaction ────────────────┐
        │ 1 reserveHandle → identity_handles (PK norm. handle)   │ ◄ S1 (owner pinned forever)
        │ 2 user_profiles.handle                                 │
        │ 3 comms_addresses (email+xmpp; partial-unique GLOBAL)  │ ◄ S2
        │ 4 mail_addresses  (primary; existing global unique)    │
        │ 5 comms_keypairs + storage_quota (provision only)      │
        └────────────────────────────────────────────────────────┘

 GUARD SEAMS (cross-org membership, batched single query):
  comms.sendMessage ───────────► assertOrgMembers(org, userIds[])            ── T1/S4
  MessageRouter.resolveCounterpart ─► ports.members.assertMember (defense)   ── T1/S4
  calendar.createEvent / addAttendee ─► assertOrgMembers(org, userIds[])     ── C1/S3
  calendar.shareCalendar ──────► verifyOrgMembership(target, org)            ── C1/S3
  collab.authorizeRoom (note) ─► assertNoteAccess(noteId, org, user)         ── N1
                                  owner OR access_grants(resourceType='note', granteeType='user')
```

## Schema deltas (additive only)

**Authoring rule:** edit only `packages/db/src/schema/*.ts`, then `bunx drizzle-kit generate --name=identity_isolation_foundation` (offline diff). Never hand-edit `packages/db/drizzle/`. No `CONCURRENTLY` (repo-forbidden; plain DDL, safe on the verified-empty table). No enum reorder (append only).

| Table / object | Change | File |
|---|---|---|
| `identity_handles` (NEW) | `id uuid PK`, `normalized_handle text NOT NULL`, `current_owner_user_id uuid NOT NULL refs users` (**never cleared**), `first_owner_user_id uuid NOT NULL`, `status text NOT NULL ['active','grace']`, `reserved_at`, `created_at`, `updated_at`. `uniqueIndex identity_handles_normalized_uniq ON (normalized_handle)`. One row per handle ever active; never deleted. | `schema/identity.ts` (NEW) |
| `comms_addresses` | ADD partial `uniqueIndex comms_addresses_kind_value_primary_uniq ON (kind, value) WHERE is_alias = false` (mirrors `mail_addresses_address_uniq`; covers all kinds per DQ2). | `schema/comms.ts` |
| `comms_addresses` | ADD `handle_id uuid NULL refs identity_handles(id) ON DELETE SET NULL` (join key for resolve/rename). | `schema/comms.ts` |
| `mail_addresses` | ADD `handle_id uuid NULL refs identity_handles(id) ON DELETE SET NULL` (existing `mail_addresses_address_uniq(address)` already global, unchanged). | `schema/mail.ts` |
| `accessResourceTypeValues` | APPEND `'note'` (currently `['project','workspace','host']` → append last; ordinals preserved). | `schema/enums.ts:353` |

**Explicitly NOT done:** no new `note_access_grants` table (reuse `access_grants`); no extra `mail_addresses_localpart_primary_uniq` (would risk failing on existing mail rows); **no drop** of `comms_addresses_org_kind_value_uniq` (dropping is non-additive → deferred to a follow-up DQ3 slice); no `'retired'` mail status (does not exist — use `'disabled'`); no `handle_rename_log`.

## Identity service API

New module `@rox/identity`; tRPC re-exports a `dbWs`-backed singleton `identityService` from `packages/trpc/src/lib/identity/index.ts` (mirrors `graphService` as the sole writer of contact nodes). **Only allowed writer of `identity_handles` + the two address tables**; add a CI grep/lint forbidding direct inserts elsewhere.

| Method | Signature | Responsibility |
|---|---|---|
| `reserveHandle` | `(tx, { normalizedHandle, userId }) → { handleId, outcome: 'created'\|'owned'\|'conflict' }` | S1 primitive. `INSERT identity_handles ON CONFLICT (normalized_handle) DO NOTHING` → SELECT; if existing `current_owner_user_id !== userId` → throw `CONFLICT`. Owner pinned permanently. |
| `provisionIdentity` | `({ userId, handle, organizationId, meshPublicKey?, meshSecretRef? }, tx?) → { addresses, handleId, created }` (signature preserved) | First-time binding. `reserveHandle` first; then `comms_addresses` (email+xmpp, `handle_id` set, global partial-unique target) + `mail_addresses` primary + `comms_keypairs` + `storage_quota`. Idempotent. Wraps existing `packages/trpc/src/lib/identity/provisionIdentity.ts` logic. |
| `renameHandle` | `({ userId, fromHandle, toHandle, organizationId, graceDays=90 }, tx?) → { handleId, aliasedAddressIds, graceUntil }` | Atomic DQ4/I3/M2 flow (below). Idempotent on `(userId, toHandle)`. |
| `resolveAddress` | `({ kind, value, at? }) → { userId, handleId, isAlias, expired } \| null` | **GLOBAL** (no org filter), alias-expiry-aware, **`kind` REQUIRED**. Live primary always resolves; alias resolves to owner only while `aliasExpiresAt > at`; expired → `null` (bounce). Replaces `createCommsPorts.addresses.findByValue` on all auth-critical paths. |
| `retireExpiredAliases` | `(db, { at? }) → { retired }` | Idempotent daily sweep: disable `comms_addresses` aliases past `aliasExpiresAt`; flip `mail_addresses` past `graceUntil` to `status='disabled'`. **Never touches `identity_handles`** (permanent). Existing mail/drive cron lane. |
| `assertOrgMembers` | `(organizationId, userIds: string[]) → void` | Batched: one `members` query `WHERE org=$1 AND user_id = ANY($2)`; throw `FORBIDDEN` if returned set ≠ input set. Dedupe + skip empty. Lives beside `verifyOrgMembership` in `integration/utils.ts`. |
| `assertNoteAccess` | `(db, { noteId, organizationId, userId, min: 'viewer'\|'editor' }) → { note, role }` | Load `note_notes` by `(id, org)` → NOT_FOUND if wrong org. `role='owner'` if `note.ownerUserId === userId`, else `access_grants(resourceType='note', resourceId=noteId, granteeType='user', granteeId=userId)`. Throw FORBIDDEN if none. **Filters `granteeType='user'` only** — `'organization'`/`'team'` grants ignored on notes (DQ1). | `packages/trpc/src/lib/notes/assertNoteAccess.ts` (NEW) |

## Global uniqueness + alias coexistence

1. **`identity_handles.normalized_handle` GLOBAL unique** — the permanent reservation + global-uniqueness authority, kind-agnostic. One handle = one row forever, independent of any address row → S1 + DQ4 permanence hold even after every address row is retired.
2. **`comms_addresses` partial unique `(kind, value) WHERE is_alias = false`** — exactly one live primary per `(kind, value)` across all orgs (S2 fix, mirrors mail). Aliases excluded → a renamed user's old value coexists as an alias alongside the new owner's primary.
3. **Old `comms_addresses_org_kind_value_uniq` RETAINED** (drop is non-additive → follow-up). Stays satisfiable; strictly weaker for live rows.

**Runtime fix is the resolver swap, not the index.** `ports.findByValue` (org-scoped, ignores `isAlias`/`aliasExpiresAt`) **and** `MessageRouter.resolveCounterpart` (calls `findByValue` *without* `kind`) must both repoint to the global, expiry-aware `resolveAddress`. An index-only change that dropped the org filter without honoring expiry would resolve an **expired alias to the wrong owner**.

## Atomic renameHandle flow

ONE `dbWs.transaction` over `user_profiles` + `comms_addresses` + `mail_addresses` + `identity_handles`. **Acquire `identity_handles` first** (deadlock mitigation). Idempotent on `(userId, toHandle)`:

1. `reserveHandle(tx, toHandle, userId)` — `INSERT … ON CONFLICT DO NOTHING`; existing row owned by another user → `CONFLICT` (S1). Re-run → `'owned'` no-op.
2. `UPDATE user_profiles SET handle = toHandle WHERE userId`.
3. Each OLD primary `comms_addresses` (email+xmpp): `SET is_primary=false, is_alias=true, alias_expires_at = now()+90d` (never delete — old address keeps resolving during grace).
4. OLD `mail_addresses`: `SET kind='alias', status='grace', grace_until = now()+90d`.
5. `INSERT` new primary `comms_addresses` (email+xmpp, `is_alias=false`, `handle_id`=toHandle row) + `mail_addresses` (`kind='primary'`, `status='active'`), `onConflictDoNothing` on the global partial-unique target (re-run safety).
6. `UPDATE` old `identity_handles` row `SET status='grace'`; `current_owner_user_id` stays pinned forever.

Any throw rolls back everything — no half-aliased identity, no two live primaries. `claimHandle` delegates: `provisionIdentity` on first claim, `renameHandle` on a change; both switch the profile router from read client `db` → `dbWs`.

## Cross-org guard placement

| Procedure | Guard |
|---|---|
| `comms.sendMessage` (before building `RecipientRef[]`) | Collect `kind==='userId'` recipients → `assertOrgMembers(org, userIds)` once (batched, ≤50). `kind==='address'` → `resolveAddress` (global, alias-aware) + reject no-owner / expired. (T1/S4) |
| `MessageRouter.resolveCounterpart` (`packages/comms-core/.../MessageRouter.ts:95`) | Defense-in-depth: inject **optional** `ports.members.assertMember({ org, userId })` in the `userId` branch, wired from `comms/ports.ts`. Keeps comms-core authz-free by default (in-memory tests unaffected). (T1/S4) |
| `calendar.createEvent` (attendees) + `calendar.addAttendee` | Batch `userId`-kind attendees → `assertOrgMembers(org, userIds)` before insert. **Email-kind attendees exempt**. (C1/S3) |
| `calendar.shareCalendar` | `verifyOrgMembership(input.userId, org)` before the `calCalendarShares` upsert. (C1/S3) |
| `collab.authorizeRoom` → `authorizeRoomForMember` | Inject `db`-backed `assertNoteAccess` (N1, below). |

## Note-collab ACL fix (N1)

**Real model (verified):** `note_notes` has only `ownerUserId` (`note.ts:104`); no note ACL table. `authorizeRoom` (`packages/collab/src/auth.ts:78`) hardcodes `session.allow(roomId, FULL_ACCESS)` after only `roomOrg === org` → any org member gets full write. `authorizeRoomForMember.ports = { requireMembership, liveblocks }` — **no `db` port today** (`collab/collab.ts:23-33`). Room id = `org:{orgId}:note:{noteId}`.

Fix:
1. APPEND `'note'` to `accessResourceTypeValues` (enums, append-only).
2. Add `noteIdFromRoomId(roomId)` in `packages/collab/src/types.ts` parsing the `:note:{noteId}` segment.
3. Extend `AuthorizeRoomForMemberArgs.ports` with an **injected** `resolveRoomAccess: (roomId) => Promise<'full'|'read'|'deny'>` backed by `db` + `assertNoteAccess` from the collab tRPC router (the `ports` object has no `db` today — add explicitly).
4. In `authorizeRoom`, for a note room: `FULL_ACCESS` only if `note.ownerUserId === userId` OR an `access_grants` row (`resourceType='note'`, `resourceId=noteId`, `granteeType='user'`, `granteeId=userId`, role admin/editor); `READ_ACCESS` for role viewer; else `FORBIDDEN`. **Dashboard rooms keep the org-membership-only path** via a default `resolveRoomAccess → 'full'`; only notes tighten.
5. **DQ1:** same-org non-owner with no user-grant → DENIED. `assertNoteAccess` filters `granteeType='user'` only; `'organization'`/`'team'` grants ignored on notes (prevents an org-wide grant re-opening N1).

Reusing `access_grants` builds the sharing seam now (inherits the `verifyOrgAdmin`-gated `share.ts` grant/revoke). **Data-hygiene follow-up:** `access_grants.resourceId` is a bare uuid (no FK to `note_notes`) → deleting a note orphans grants; add grant cleanup on note delete (tracked, not a blocker).

## Migration & backfill

**PRECONDITION (runtime-gated, NOT assumed):** `provisionIdentity` has zero callers → `comms_addresses` is expected empty in prod → the global partial-unique needs no backfill. **Hard gate:** before any apply, `SELECT count(*) FROM comms_addresses;` on the Neon branch and **abort if nonzero** (then a manual dedup pass — keep one live primary per `(kind,value)`, alias the rest — is required first).

Steps:
1. Edit schema files only (`identity.ts` NEW, `comms.ts`, `mail.ts`, `enums.ts` append `'note'`).
2. `bunx drizzle-kit generate --name=identity_isolation_foundation` (offline diff). Never hand-edit `drizzle/`. Plain `CREATE INDEX`.
3. Apply on a **fresh Neon branch**, point root `.env` at it (never prod). Run unit + integration + the precondition test.
4. Backfill (DQ3): `handle_id` columns nullable, populated lazily by provision/rename. A deploy-time reconcile script calls `identityService.provisionIdentity` per existing `user_profiles.handle` with no addresses, minting the missing addresses + `identity_handles` rows.
5. Prod apply = deploy step requiring explicit owner confirmation. Reversible: drop the new index/columns/table.

## Finding → fix traceability

| Finding | How closed |
|---|---|
| **I1** | `claimHandle` delegates to `identityService.provisionIdentity` on first claim (inside tx, `dbWs`) — first real caller; every claim mints `@rox.one` comms+mail + keypair slot + quota. |
| **S1** | `identity_handles(normalized_handle PK)` permanent global registry; `current_owner_user_id` pinned forever; `reserveHandle` throws `CONFLICT` for a different claimant. Reservation outlives every address row → freed/renamed handle permanently unclaimable. |
| **I3/M2** | `renameHandle` atomically aliases old comms (`is_alias`,`alias_expires_at=+90d`) + mail (`kind='alias'`,`status='grace'`,`grace_until=+90d`) and mints new primaries in one tx. Old address keeps resolving 90d (no `no_such_handle` bounce), then `retireExpiredAliases` retires it. |
| **S2** | `comms_addresses` partial unique `(kind,value) WHERE !is_alias` matches mail; `resolveAddress` resolves GLOBALLY + honors expiry, replacing org-scoped+expiry-blind `findByValue` on all auth-critical paths. |
| **T1/S4** | `comms.sendMessage` batch `assertOrgMembers` over `userId` recipients; `resolveCounterpart` defense-in-depth members port. Cross-org → `FORBIDDEN`. |
| **C1/S3** | `createEvent`/`addAttendee` batch-verify attendee membership; `shareCalendar` verifies target. Email attendees exempt. |
| **N1** | `authorizeRoom` note branch injects `db`-backed `assertNoteAccess`; `FULL_ACCESS` only for owner or `granteeType='user'` grant. Org membership alone no longer implies write; org/team grantees forbidden on notes. |

## Test plan

**DB-constraint regression (highest-value):**
- S2 isolation under bypass: direct INSERT of a 2nd live `comms_addresses` row, same `(kind,value)`, `is_alias=false`, different org/user → must violate `comms_addresses_kind_value_primary_uniq`.
- Alias coexistence: alias row for `mark` + new owner's primary `mark` → no violation.
- No two live aliases share `(kind,value)` (service-enforced; DB can't catch).

**reserveHandle/S1:** first claim creates row; same-user re-claim → `'owned'` no-op; different user on grace/active handle → `CONFLICT`; `current_owner_user_id` never nulled after rename.

**renameHandle/I3/M2:** atomicity (mid-tx failure → full rollback, exactly one live primary); idempotency (run twice, identical state, no duplicate aliases); 90-day (`resolveAddress(old, at<expiry)` → owner, `at>expiry` → null, sweep retires alias but leaves `identity_handles`).

**provisionIdentity/I1:** `claimHandle` first claim creates comms(email+xmpp)+mail primary+keypair stub+quota+`identity_handles` in one tx; re-claim → `created=false`.

**resolveAddress/S2:** handle minted in org A resolves to A from any querying org; expiry honored; expired → null bounce (no 500); requires `kind` (no email/xmpp cross-resolution).

**T1/S4:** recipient `userId` in another org → `FORBIDDEN`, zero messages/threads/deliveries; mixed batch with one foreign id rejects whole send; single members query for 50 recipients; address recipients allowed.

**C1/S3:** `shareCalendar`/`addAttendee`/`createEvent` with non-member `userId` → `FORBIDDEN`; email attendee allowed; same-org member allowed.

**N1:** owner → FULL; same-org non-owner no grant → FORBIDDEN (DQ1); user grant editor → FULL; user grant viewer → READ; **org-wide grant on note → still FORBIDDEN**; cross-org → denied; dashboard rooms unchanged.

**Migration:** fresh Neon branch — assert `count(comms_addresses)==0`, generate diff is additive-only, indexes apply, old org index still present; full identity+rename flow green; `bun run lint < /dev/null`, typecheck, `bun test packages/comms-core packages/trpc/src/router/comms` pass.

## Implementation traps (from verification — must respect)

- **Dual-index error surface:** retaining the old org-scoped unique alongside the new global partial-unique means cross-org vs same-org collisions raise **different index names**. The `CONFLICT` mapping in `provisionIdentity`/`renameHandle` MUST catch **both** names or a cross-org mint surfaces as an unhandled 500.
- **`resolveAddress` MUST require `kind`** — `resolveCounterpart` calls `findByValue` without `kind`; a kind-less resolver could cross-resolve email/xmpp.
- **Alias-overlap** (two live aliases per `(kind,value)`) is not DB-catchable — `renameHandle` must be the sole alias writer + a test asserts the invariant.
- **Grantee literal** = `'organization'`/`'team'` (not `'org'`) or the N1 filter is a no-op.
- **Empty-table precondition** is unverifiable offline → the `count(*)` abort-gate before apply is mandatory.
- **Note-share mutation** doesn't exist yet (share.ts uses a separate `publicShareResourceType`); until a gated note-share mutation ships, only the owner can ever reach FULL_ACCESS — consistent with DQ1.

## Effort & implementation order (≈L)

| # | Workstream | Eff | Notes |
|---|---|---|---|
| 1 | Schema deltas + `drizzle-kit generate` + Neon-branch precondition verify | S | unblocks all; gate here |
| 2 | `@rox/identity`: `reserveHandle` + `provisionIdentity` rewire + `resolveAddress` + repoint `findByValue`/`resolveCounterpart` | M | S1+S2 core |
| 3 | `renameHandle` + `claimHandle` delegation (db→dbWs) + `retireExpiredAliases` cron | M | I3/M2+I1; after #2 |
| 4 | Cross-org guards: `assertOrgMembers` + 4 seams + comms-core members port | S | T1/S4+C1/S3; parallel with #3/#5 |
| 5 | N1: `assertNoteAccess` + `authorizeRoom` `db` port + `noteIdFromRoomId` | M | N1; parallel |
| 6 | Tests across all 7 + DB-constraint regression | M | verification gate |

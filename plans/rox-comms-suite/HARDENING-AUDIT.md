# Rox Comms Suite — Hardening Audit (P0–P3 shipped surfaces)

> **Method:** 7 parallel code-review/security agents, one per surface (D1 identity/inbox/presence,
> D2 chat, D3 mail, D6 calendar, D7 notes, D8/D9 drive, + cross-cutting security). Each compared
> shipped code against its `plans/rox-comms-suite/D*-spec.md` + `DECISIONS.md` (DQ1–DQ4) + AGENTS.md
> rules. All findings are evidence-backed at `file:line`. Read-only audit; no code changed.
> **Date:** 2026-06-23. Captured because the prior `🤖 from repo deep-audit` punch-list (U1–U7) was
> never committed and is lost — this replaces it.

## Executive reframe

The suite **looks** shipped (web UI exists for every domain), but several **foundational P0/P1
promises are non-functional at runtime**, and isolation rests entirely on tRPC procedure checks
(the suite is NOT on ElectricSQL — so the MASTER-PLAN's "#1 Electric shape mis-scoping" risk is
moot, but real-time delivery is also absent everywhere). "Доводка" here = make the foundation
actually work + close account-takeover/cross-org holes + reach platform parity — not polish.

Single scariest fact: **`provisionIdentity` has zero callers** → no user ever gets `@rox.one`
addresses, so the identity spine the whole suite derives from is not wired. Combined with
**handle-recycling being unenforced**, the identity layer is both inert and unsafe.

---

## TIER 0 — Foundation not actually wired (the suite's premise)

| ID | Sev | Title | Evidence | Fix | Eff |
|----|-----|-------|----------|-----|-----|
| **I1** | HIGH | `provisionIdentity` is dead code — no identity ever provisioned; every rox recipient misclassified as external email | `packages/trpc/src/lib/identity/provisionIdentity.ts:77` (only refs: own test + doc-comment); `packages/trpc/src/router/profile/identity.ts:165-173` `claimHandle` never calls it | Call `provisionIdentity({userId,handle,organizationId})` inside `claimHandle` tx after profile upsert | S |
| **I2** | HIGH | Cross-transport threading can't merge — reply-root lookup is transport-scoped; email reply spawns orphan thread instead of joining the in-app DM | `packages/trpc/src/router/comms/ports.ts:211-224` filters `eq(transport)`; `MessageRouter.ts:185`; dedup mismatch userId vs `user@rox.one` (`MessageRouter.ts:499`,`dedup.ts:37`) | Drop transport filter in `findThreadByMessageExternalId`; normalize in-app counterpart to `@rox.one` so dedup keys align | M |
| **I4** | HIGH | Presence never written → `selectTransport` is dead logic → in-app never auto-selected, always falls to email | no writer to `comms_presence` (grep: schema/mappers only); no `presence` tRPC proc (spec T5.1); `MessageRouter.ts:145-150` | Add presence aggregator + writer in comms-core, `presence` tRPC proc, `@rox/collab` bridge, TTL decay | L |
| **D1** | HIGH | DQ2 soft-meter unreachable — Drive hard-blocks at 10 GiB cap (locked-decision violation) | `schema/drive.ts:100` `overageOptIn` default false, no writer (grep); `drive.ts:300-306` throws FORBIDDEN | Add `drive.setOverageOptIn` mutation + QuotaBar toggle; opt-in routes uploads to overage path | S |

---

## TIER 1 — Security: account takeover + cross-org injection

| ID | Sev | Title | Evidence | Fix | Eff |
|----|-----|-------|----------|-----|-----|
| **S1** | CRITICAL | Handle recycling unenforced → handle takeover inherits predecessor's `@rox.one` mail + JID | `profile/identity.ts:154-173` (only live-unique check, `onConflictDoUpdate`); `comms/ports.ts:165-176` `findByValue` ignores `isAlias`/`aliasExpiresAt`; zero writers of reservation/grace (grep); schema admits gap `comms.ts:141-142`, `mail.ts:120-121` | Permanent global `handle_reservations` table (never deleted), checked in `claimHandle`/`provisionAddress`; single-tx `renameHandle` writing reservation + flipping old mail→grace / comms→alias across identity+mail+xmpp | L |
| **I3 / M2** | HIGH | DQ4 reservation + 90-day alias entirely unimplemented; handle rename loses all mail (old address bounces `no_such_handle`) | `profile/identity.ts:117-189` bare rename; `aliasExpiresAt`/`isAlias` no runtime writer; `mail.ts:128-139` only ever `kind:'primary'`, never auto-called on handle create/rename | Handle lifecycle hook: on create upsert primary mail; on rename insert new primary + flip old → `alias/grace/grace_until=+90d` in one tx | L |
| **S2** | HIGH | comms/XMPP routing ignores alias-expiry; org-scoped unique (`comms_addresses`) vs global (`mail_addresses`) lets same JID mint in two orgs | `comms/ports.ts:165-176`; `comms.ts:140-147` (org-scoped uniq) vs `mail.ts:118-120` (global uniq) | Add GLOBAL partial unique on `comms_addresses(kind,value)`; branch `findByValue` on expired alias → null | M |
| **T1 / S4** | HIGH | `comms.sendMessage` injects arbitrary/cross-org recipient — creates thread + participant + delivery for a user in another org (unsolicited-message / write-injection) | `comms/comms.ts:144-205` (caller-only `requireActiveOrgMembership`); `MessageRouter.ts:95-97` blindly stamps org on any userId | Validate every `recipient.kind==='userId'` is a member of `organizationId` before routing; FORBIDDEN otherwise | M |
| **C1 / S3** | HIGH | Calendar `addAttendee`/`shareCalendar` grant access to any `userId` with no org-membership check → out-of-org user sees event/calendar; victim's "invited-to" path surfaces foreign-org event | `calendar.ts:281-305` (share), `:512-544` (attendee); schema `:87-91,100-103` only `uuid()` | `verifyOrgMembership(targetUserId, organizationId)` before insert in both | S |
| **N1** | HIGH | Note collab room grants ANY org member FULL_ACCESS write to ANY private note (presence + Yjs content) | `collab/collab.ts:46-66` + `packages/collab/src/auth.ts:78` `FULL_ACCESS`; room id `resolveNotePresenceGate.ts:65` | Parse `:note:<id>`; verify owner OR `access_grants` editor/viewer; downgrade viewers to read-only | M |
| **S6** | MED | `chat.complete` writes model output to victim's transcript before any ownership check | `chat/chat.ts:242-291` (`onConflictDoNothing` keeps victim owner; `persistQuickChatTurns` POSTs before owner read) | Re-check `chat_sessions` ownership (`createdBy` + `organizationId`) BEFORE model call / transcript write | S |

---

## TIER 2 — Core value-prop correctness

| ID | Sev | Title | Evidence | Fix | Eff |
|----|-----|-------|----------|-----|-----|
| **M1** | HIGH | Mail D1-emit bypasses `MessageRouter`: wrong dedup key (broken threading) + unguarded global-unique insert → 500 + dropped mail when two rox users share a sender's Message-ID | `apps/api/src/lib/mail/drizzleDb.ts:128-177` (esp. `:132-133`, bare insert `:166`); global uniq `comms.ts:321-323`; no try/catch `ingest.ts:269` | Route inbound via `MessageRouter.routeInbound`; or `deriveDedupKey` + `onConflictDoNothing` + `resolveContact` | M |
| **M3** | HIGH | Outbound send quota gate is a no-op (`ensureBalance` never debits); no rate cap / kill-switch → spam cannon torches rox.one reputation | `mail.ts:233-241` (checks `<=0` only); `economy.service.ts:60-72` seeds/reads, never decrements; no disabled-address check | Debit ledger per send in tx; per-user/min rate cap; short-circuit on `status='disabled'` | M |
| **M4** | HIGH | No Resend delivery/bounce/complaint webhook → outbound status frozen at `sent`; no suppression/reputation feedback | spec T10 `/api/mail/events` absent (`find` empty); `mail_events` table unwritten; `mail.ts:307` hardcodes `sent` | Add `apps/api/.../mail/events/route.ts` (Svix verify, mirror github webhook), dedup via `mail_events_provider_evt_uniq`, update status | M |
| **D3** | HIGH | `confirmUpload` double-commit race double-counts quota (concurrent/retried confirm) | `drive.ts:368` read status → `:383` commit → `:391-394` flip; non-atomic | Atomic gate: `UPDATE ... SET status='clean' WHERE id=? AND status='pending' RETURNING`; commit only if a row returned | S |
| **D4** | HIGH | `drive_file_refs` never written + `deleteFile` ref-blind → deletes/orphans R2 object still referenced by chat/email | `schema/drive.ts:299` table, zero insert sites; `drive.ts:264-281` dedup-delete ignores refs | Insert ref on attachment-from-Drive; block hard delete/quota-reclaim while any ref exists (soft-trash) | M |
| **D5** | HIGH | No async malware/MIME scan; public `rox.one/d/<token>` can serve malware/CSAM; `quarantined`/`scanning` enums dead | `drive.ts:393` pending→clean directly; `requestDownload:404-416`/`resolveShare:540` no scan gate; enums `:776-777` unused | On confirm set `scanning`+enqueue scan → `clean|quarantined`; gate download/share on `clean`; MIME allow-list at upload | L |
| **D2** | HIGH | Overage billing cron never invoked — `accrueDailyOverage` has no caller → overage accrues but never debits ledger | `quota.ts:168` + re-export `drive.ts:565`, no external caller (grep) | Register in existing cron infra, idempotent per day | M |
| **N3** | HIGH | Notes autosave drops pending edit on note-switch; debounce can write note A's text onto note B | `NoteEditor.tsx:52-76` (`[]` deps flush only on true unmount); `NotesWorkspace.tsx:34` no remount key; closes over new `noteId` `:58` | `key={noteId}` to remount (fires flush), capture `noteId` in `pendingRef` at schedule time | S |
| **N2** | HIGH | Spec's `knowledge_documents` reuse abandoned — own `note_notes` table; backlinks/search/MDX-safety lost; `note_backlinks` dead schema | `schema/note.ts:92-140`,`:149` (unused); `notebooks.ts:267,285` FK never joined | Honor spec (back notes with `knowledge_documents type='note'`, reuse `syncOutgoingLinks`) OR formally accept divergence + implement backlinks/search; don't ship dead table | L |
| **M5** | MED | `getAttachmentUrl`/body URL missing → reader is snippet-only; full bodies + attachments in R2 unreachable | spec T9; no proc (grep); UI shows "недоступен в предпросмотре" `MailMessageCard.tsx:47-48,124-128` | Add `mail.getAttachmentUrl` + `getBodyUrl` (short-TTL presigned, owner-scoped); sanitize HTML before render | M |
| **D6** | MED | Nightly quota reconciliation unimplemented → drift permanent, mis-bills overage | spec §2.4; no reconcile job (grep) | Nightly `packages/scripts` task recompute `bytes_used` from distinct non-trashed sha256 | M |
| **D7** | MED | `requestUpload` dedup+insert TOCTOU → unique-violation 500 on concurrent identical upload | `drive.ts:312-344`; uniq `schema/drive.ts:200` | `INSERT ... ON CONFLICT DO NOTHING RETURNING`, fall back to existing row | S |
| **M6** | MED | Outbound sent mail never emitted to unified inbox (inbound-only bridge) → inbox shows half the conversation | emit only from `ingest.ts:269`; `mail.ts:298-334` no comms write | Emit outbound via `MessageRouter.routeOutbound` | M |
| **M7** | MED | Outbound `message_count` never incremented; reply without `threadId` forks a new thread (no server-side `references` reconciliation) | `drizzleDb.ts:105` bumps inbound only; `mail.ts:324-333` | Increment on outbound; derive `references_ids` server-side from parent | S |

---

## TIER 3 — Completeness / spec drift

| ID | Sev | Title | Evidence | Notes |
|----|-----|-------|----------|-------|
| **T2** | HIGH (arch) | Entire D2 `tc_*` team-chat model (channels, DM `dm_key`, visibility, threads, reads, attachments, edit/delete tombstones) never built — shipped `comms_*` spine instead; spec & code describe two systems | no `tc_*` anywhere (grep 0); `root.ts:67-99` no `teamChat` | Reconcile: supersede D2 spec with comms-spine approach OR build `tc_*`. Don't leave divergence undocumented |
| **C5** | MED | Per-occurrence overrides ("this event only") + EXDATE-from-UI missing (`cal_event_occurrences` absent) | grep 0 `recurrence_id`; EventDialog edits whole series only | Additive table + `updateOccurrence`/`cancelOccurrence` + UI choice |
| **C6** | MED | Reminders fully unimplemented (no `cal_reminders`, no scheduler, no `next_fire_at`) | grep 0 across schema/router/api | Land Phase 4 + hook automation scheduler |
| **C7** | MED | No public feed / ICS subscribe URL / `public_token` / visibility model / free-busy | schema lacks fields; only client Blob download `CalendarScreen.tsx:60` | Additive `public_token`/`visibility`/`cal_ics_feeds` + visibility-gated `text/calendar` route + `freebusy` |
| **C2** | MED | All-day event with `dtend==dtstart` invisible on grid (zero-duration overlap) | `occurrences.ts:69-75`; `EventDialog.tsx:148-150`; DB check `:160` only `>=` | Treat all-day as end-of-day in `expandEvent` or normalize `dtend=dtstart+1d` at write |
| **C3** | MED | Imported date-only EXDATE never cancels a timed instance (millisecond match) | `ics.ts:114-121` vs `occurrences.ts:47-54,127` | Match EXDATE by local calendar day |
| **C4** | MED | All-day ICS export→import→export drifts DTEND +1 day per round | `ics.ts:66-76` always `+1`, importer stores verbatim `:224-227` | On import, convert exclusive DTEND back to inclusive |
| **C8** | LOW | `@username` attendee resolution missing (email-only); timezone field is a misleading no-op vs forced-UTC math | `EventDialog.tsx:415-428,338-346`; `CalendarScreen.tsx:39-56` forces UTC; `recurrenceOptions.ts:36-49` `getUTCHours()` | Add handle→userId resolve; remove tz input or honor it end-to-end |
| **N5** | MED | Public note publish: no `assertMdxSafe`, no rate-limit (spec abuse mitigations skipped; safe today only because `<pre>` plain-text render) | `notebooks.ts:321-357`; grep 0 sanitize/ratelimit | Sanitize on publish + rate-limit + abuse kill-switch |
| **N4** | MED | Two "notes" routers: legacy unscoped `profileNotes` bound at `trpc.notes`, real D7 at `trpc.notebooks` — wrong-router footgun | `root.ts:85-86`; `notes/notes.ts:37-42` user-scope only | Rename D7 → `notes`, legacy → `profileNotes` |
| **I6 / T4** | MED | Unread count never surfaced — watermark written, never read back; no badge despite UI comments | `comms.ts:62-92` raw rows; `ThreadListItem.tsx:5-11` no badge | `listThreads` returns unread count (messages after `lastReadMessageId`) |
| **I5** | MED | Nested transaction: `resolveContact` opens `dbWs.transaction` inside outer `sendMessage` tx → pool contention/partial-failure hole | `comms/ports.ts:185` inside `comms.ts:190-192` | Reuse injected `db`/`tx` handle |
| **T3** | MED | Call metering to WS-E not wired — `CallButton` mints token only, no `rox_ledger` debit, no `kind=call` message | `CallButton.tsx:19-48`; no comms ledger consumer (grep) | Debit minutes over allotment on call end; persist call system-message |
| **I7/T5/N7/N8** | MED | Real-time/Electric drift: comms/mail/calendar/notes are tRPC `useQuery` polling, NOT Electric `useLiveQuery` → no live delivery anywhere (chat isn't realtime); schema headers promise live-sync | `useThread.ts:25`, `useThreadList.ts:17`, mobile `useNote.ts:14-41`; suite tables absent from `electric-proxy/src/table-scopes.ts:77-168` | Decide: add Electric shapes (re-audit isolation) OR document tRPC model + add polling/optimistic |
| **T6** | LOW | DM dedupe inconsistent (userId-ref vs address-ref) → same pair forks into two threads | `MessageRouter.ts:367-370,497-500` | Normalize counterpart to stable key before `deriveDedupKey` |
| **T7/I... markRead** | LOW | `markRead` accepts any `lastReadMessageId` (not validated to thread/org) | `comms.ts:208-233`; loose ref `:251` | Verify message ∈ thread+org before persisting |
| **T8** | LOW | No edit/delete + no tombstone/`kind` on `comms_messages` | `schema/comms.ts:274-329` only `created_at`/`received_at` | Additive `deleted_at`/`edited_at`/`kind` + procs |
| **M8** | LOW | Inbound `Authentication-Results` parsing is heuristic regex — brittle across providers (over/under-quarantine) | `workers/email-inbound/src/index.ts:110-140` | Tested AR parser or pin to CF authserv-id + unit tests on real headers |

---

## TIER 4 — Multiplatform parity (web-only across the board — violates North Star + spec "multiplatform-first")

| Surface | Web | Desktop | Mobile |
|---------|-----|---------|--------|
| Calendar (D6) | full (month+agenda, create/edit/delete, attendees, RSVP, ICS) | **NONE** | read + RSVP only ("create on web/desktop") |
| Notes (D7) | full (+ autosave bug N3) | **NONE** | read-only, not cache-first (N7) |
| Drive (D8) | full (browser, upload, quota, shares) | **NONE** | read + share + create-folder only (no upload) |
| Mail (D3) | inbox + compose + thread | **NONE** | **NONE** |
| Unified inbox / chat (D1/D2) | `/inbox` | **NONE** | **NONE** |

> Desktop — the North-Star target — has **zero** suite surface. Closing parity is L effort per
> surface and depends on the data-model decisions above (esp. the Electric-vs-tRPC choice, I7/T5).

---

## TIER 5 — Dependencies + email ops-gating

**Dependency CVEs** (`bun audit`, 0 critical):
- **S7** HIGH transitive: `@xmldom/xmldom <0.8.13` (XML injection/DoS, via expo/electron-builder — build/mobile tooling, not hot path); `@hono/node-server <1.19.13` (middleware bypass via repeated slashes, touches `@rox/api`+`@rox/relay` — verify auth path-prefix gating). Fix: bump + force-resolve, re-audit.
- **S8** LOW: `dompurify <=3.4.6` cluster (via posthog-js/streamdown). Risk only if untrusted mail/notes HTML rendered with it → confirm render path, pin patched, sandbox iframe + CSP.
- **S9** LOW: presigned-GET `Content-Disposition` filename not escaped (`storage/src/s3-base.ts:97-101`) → RFC 5987 encode.
- **S10** LOW: `/s/<slug>` public snapshot survives revoke in caches → `no-store` on `/s/*`, null payload on revoke.

**Email ops-gated** (code done, owner action needed before deliverability works):
- DNS on `rox.one`: MX→CF Email Routing, SPF (`include:resend include:cloudflare`), Resend DKIM CNAMEs, DMARC TXT (no `plans/.../dns/` recorded yet).
- Enable CF Email Routing catch-all `*@rox.one` → `rox-email-inbound` Worker.
- Workers Paid plan (free 10ms CPU too small for MIME+R2).
- R2 bucket `rox-mail` bound as `MAIL_BUCKET`.
- Secrets: `MAIL_INBOUND_SECRET` identical on Worker + API (API fails closed 503 until set).
- Outbound inert until `MAIL_OUTBOUND_ENABLED=true` + `RESEND_API_KEY` + Resend domain verified.
- `CF_AUTHSERV_ID` set to the exact id CF stamps (else all inbound auth reads untrusted).
- **Spec drift to resolve first:** grace window is 90d in DECISIONS/DQ4 + schema but 30d in D3 spec body — pick one before building M2.

---

## Recommended prioritization (design order)

1. **Identity & isolation foundation** (I1, S1, I3/M2, S2, T1/S4, C1/S3, N1) — most foundational
   (everything derives from identity) **and** holds the only CRITICAL (handle takeover) + the
   cross-org injection cluster. Highest severity × highest leverage.
2. **Unified inbox actually works** (I2, I4, M1, M6) — the suite's headline value prop.
3. **Drive economy + abuse safety** (D1, D2, D3, D4, D5, D6, D7) — locked-decision violation +
   billing + malware-on-public-links.
4. **Email outbound lifecycle** (M3, M4, M5, M7) — reputation/abuse + reader actually usable.
5. **Multiplatform parity** (Tier 4) — North Star; gated on the Electric-vs-tRPC decision.
6. **Calendar/notes completeness + spec-drift reconciliation** (C5/C6/C7, N2, T2) + deps/ops.

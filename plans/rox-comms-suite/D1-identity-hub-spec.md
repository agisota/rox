## D1 — Identity & Comms Hub (the spine)

> One **rox username** → `{ in-app, email username@rox.one, XMPP JID username@rox.one, mesh pubkey }`.
> A **unified inbox** where a single thread carries messages from any transport, **merged presence**, and a **transport-adapter** abstraction every other comms domain (D2 mail, D3 chat/XMPP, D4 calendar, D5 mesh, etc.) plugs into.

This is the foundational domain of the Rox Comms Suite. It does **not** ship a mail server or an XMPP server itself — it defines the identity binding, the unified message/thread model, the adapter contract, and the inbound/outbound routing fabric. The transport domains implement the adapters.

---

### 1 Scope & user stories

**In scope**
- Canonical identity mapping: rox username (`user_profiles.handle`, ROX-522) is the single key all addresses derive from.
- Address allocation + reservation: `username@rox.one` email, `username@rox.one` XMPP JID, mesh pubkey — provisioned/derived atomically when a handle is claimed or changed.
- Unified **thread** + **message** model where one thread can contain messages that arrived/left via different transports (email reply lands in the same thread as an in-app DM if it's the same conversation + same counterparties).
- **Transport-adapter interface**: a uniform `inbound → normalize → route → persist` and `compose → outbound` contract. Adapters: `inapp`, `email`, `xmpp`, `mesh` (D5, optional).
- **Routing engine**: inbound resolution (which thread? which rox user? new vs existing counterpart) and outbound fan-out (which transport(s) for this recipient, by preference + reachability).
- **Merged presence**: one presence state per rox user aggregated across transports (in-app socket, XMPP presence, last-seen email activity), exposed as a single value to consumers.
- Counterparty resolution reusing the existing `identity_links` table (D6 contact resolution) so external senders map to a contact node.

**Out of scope (owned by sibling domains, consumed here)**
- The actual SMTP/IMAP/inbound-mail processing (D2). The XMPP server runtime (D3). Calendar (D4). Mesh transport runtime (D5). Drive/storage (separate domain). Billing/quota mechanics (WS-E — referenced for per-transport overage only).

**User stories**
1. As a user, when I claim handle `mark`, I instantly own `mark@rox.one` (email + JID) and a mesh keypair, all bound to my one account — no separate signup.
2. As a user, I open **one inbox**; a reply that arrives by email to `mark@rox.one` appears in the same thread as the in-app conversation it answers.
3. As a user, I send a message to a counterparty; the hub picks the right transport (in-app if they're a rox user and online; email fallback otherwise) without me choosing.
4. As a user, my contacts see a single "online/away/offline" status for me regardless of which client I'm using.
5. As a user, if I change my handle, my old addresses keep resolving (alias) for a grace window so I don't lose mail/messages.
6. As a developer of D3 (XMPP), I implement one `TransportAdapter` and the hub handles threading, presence merge, and inbox surfacing for free.

---

### 2 Target design

#### ASCII architecture

```
                         ┌─────────────────────────────────────────────┐
                         │            IDENTITY & COMMS HUB (D1)          │
                         │            packages/comms-core               │
   inbound               │                                              │            outbound
 ┌──────────┐  raw msg   │  ┌────────────┐   ┌──────────────────────┐  │  compose  ┌──────────┐
 │ D2 email │──webhook──▶│  │  Transport │──▶│   Routing Engine      │◀─┼───────────│ in-app   │
 │ (Resend/ │            │  │  Adapter   │   │  - resolveCounterpart │  │           │ composer │
 │  CF EW)  │            │  │  Registry  │   │  - resolveThread      │  │           └──────────┘
 └──────────┘            │  │            │   │  - selectTransport    │  │  outbound      ▲
 ┌──────────┐  stanza    │  │ inapp      │   │    (prefs+reachable)  │  │  fan-out       │
 │ D3 xmpp  │──hook─────▶│  │ email      │   └──────────┬───────────┘  │────────────────┘
 │ (Prosody/│            │  │ xmpp       │              │              │
 │ ejabberd)│            │  │ mesh       │              ▼              │
 └──────────┘            │  └────────────┘   ┌──────────────────────┐ │
 ┌──────────┐  packet    │                   │  Persistence (Neon)   │ │
 │ D5 mesh  │──relay────▶│   ┌────────────┐  │  comms_threads        │ │   Electric live-sync
 │ (Nostr-  │            │   │  Presence  │  │  comms_messages       │─┼──────────────▶ web/
 │  ish)    │            │   │  Aggregator│  │  comms_participants   │ │              desktop/
 └──────────┘            │   └─────┬──────┘  │  comms_deliveries     │ │              mobile
                         │         │         └──────────────────────┘ │              inbox UI
                         └─────────┼────────────────────────────────────┘
                                   ▼
                          merged presence  ──▶  collab presence (@rox/collab, WS-L) optional surface

 Identity binding (source of truth):
   user_profiles.handle (ROX-522) ──┐
                                     ├─▶ comms_addresses (email JID mesh, derived)
   auth.users.id ────────────────────┘   identity_links (D6, external→contact)
```

#### Address derivation

```
handle "mark"  ─┬─▶ email   mark@rox.one        (kind=email)
                ├─▶ xmpp    mark@rox.one         (kind=xmpp,  JID localpart = handle)
                └─▶ mesh    npub… / ed25519 pub  (kind=mesh,  pubkey from per-user keypair)
```

#### ERD (additive to `packages/db/src/schema`, new file `packages/db/src/schema/comms.ts`, all tables prefixed `comms_`)

> All FKs `onDelete: cascade` to user/org unless noted. Multi-tenant: every table carries `organization_id` to match repo convention (`chat_messages`, `identity_links`). Reuses `auth.users`, `auth.organizations`, `user_profiles.handle`, `identity_links` (D6), `economy` (WS-E).

**`comms_addresses`** — every transport address a rox user owns, derived from handle.
| column | type | notes |
|---|---|---|
| id | uuid PK | defaultRandom |
| organization_id | uuid FK→organizations | cascade |
| user_id | uuid FK→users | cascade; owner |
| kind | enum `comms_address_kind` | `email`\|`xmpp`\|`mesh`\|`inapp` |
| value | text | normalized: email/JID lowercased; mesh = hex/npub pubkey |
| is_primary | boolean | default true; current handle-derived address |
| is_alias | boolean | default false; retained after handle change |
| verified | boolean | default false |
| created_at / updated_at | timestamptz | |

Indexes: `uniqueIndex(organization_id, kind, value)` (one address resolves to one owner per org); `index(user_id)`; `index(kind, value)` for fast inbound lookup.

**`comms_keypairs`** — mesh/E2E key material refs (private key NOT stored here; only public + pointer).
| column | type | notes |
|---|---|---|
| id | uuid PK | |
| organization_id | uuid FK | cascade |
| user_id | uuid FK | cascade |
| algo | text | `ed25519` (Nostr-style) |
| public_key | text | hex |
| secret_ref | text | pointer into secret store (Infisical/host keystore), never the raw key |
| created_at | timestamptz | |
Index: `uniqueIndex(user_id, algo)`.

**`comms_threads`** — a conversation that may span transports.
| column | type | notes |
|---|---|---|
| id | uuid PK | |
| organization_id | uuid FK | cascade |
| subject | text nullable | derived from first email subject / chat title |
| last_message_at | timestamptz | for inbox ordering (indexed) |
| dedup_key | text nullable | normalized key for cross-transport thread matching (e.g. RFC `References`/`In-Reply-To` root, or sorted-participant hash) |
| created_at / updated_at | timestamptz | |
Indexes: `index(organization_id, last_message_at)` (inbox feed, org-leading per repo convention); `index(organization_id, dedup_key)`.

**`comms_participants`** — who is in a thread (rox user OR external contact).
| column | type | notes |
|---|---|---|
| id | uuid PK | |
| organization_id | uuid FK | cascade |
| thread_id | uuid FK→comms_threads | cascade |
| user_id | uuid FK→users nullable | set when participant is a rox user |
| contact_entity_id | uuid nullable | external counterpart → `identity_links.contact_entity_id` (D6) |
| role | enum `comms_participant_role` | `owner`\|`member` |
| last_read_message_id | uuid nullable | unread tracking |
| created_at | timestamptz | |
Indexes: `uniqueIndex(thread_id, user_id)` (partial, where user_id not null); `index(thread_id)`; `index(user_id)`.

**`comms_messages`** — one row per message, regardless of transport.
| column | type | notes |
|---|---|---|
| id | uuid PK | |
| organization_id | uuid FK | cascade |
| thread_id | uuid FK→comms_threads | cascade |
| transport | enum `comms_transport` | `inapp`\|`email`\|`xmpp`\|`mesh` |
| direction | enum `comms_direction` | `inbound`\|`outbound` |
| author_user_id | uuid FK→users nullable | set if a rox user authored |
| author_contact_entity_id | uuid nullable | external author (D6 contact) |
| external_id | text nullable | provider/transport message id (email Message-ID, XMPP stanza id, Nostr event id) — for idempotent inbound dedup |
| in_reply_to_external_id | text nullable | for threading |
| body | text | normalized plaintext/markdown |
| body_html | text nullable | original email HTML if any |
| attachments | jsonb | `[{name,url,contentType,size}]`; url points at Drive/R2 |
| metadata | jsonb | headers, spam score, transport-specific extras (follows `chat_messages.metadata` pattern) |
| created_at | timestamptz | message time (provider-reported when inbound) |
| received_at | timestamptz | hub ingestion time |
Indexes: `index(organization_id, thread_id, created_at)` (thread read); `uniqueIndex(transport, external_id)` partial where external_id not null (inbound idempotency); `index(author_user_id)`.

**`comms_deliveries`** — outbound delivery attempts per recipient/transport (fan-out + status).
| column | type | notes |
|---|---|---|
| id | uuid PK | |
| organization_id | uuid FK | cascade |
| message_id | uuid FK→comms_messages | cascade |
| transport | enum `comms_transport` | chosen transport for this recipient |
| to_address | text | resolved address |
| status | enum `comms_delivery_status` | `queued`\|`sent`\|`delivered`\|`failed`\|`bounced` |
| provider_id | text nullable | provider message id once sent |
| error | text nullable | |
| attempts | integer default 0 | |
| created_at / updated_at | timestamptz | |
Indexes: `index(message_id)`; `index(organization_id, status)`.

**`comms_presence`** — merged presence, one row per rox user (last-write per transport in jsonb, aggregated state materialized).
| column | type | notes |
|---|---|---|
| user_id | uuid PK FK→users | |
| organization_id | uuid FK | cascade |
| state | enum `comms_presence_state` | `online`\|`away`\|`dnd`\|`offline` (aggregate) |
| per_transport | jsonb | `{inapp:{state,at}, xmpp:{...}, email:{lastSeenAt}}` |
| status_text | text nullable | custom status |
| updated_at | timestamptz | |
Index: `index(organization_id, state)`.

**New pgEnums** (add to `enums.ts`, value arrays + `pgEnum` in `comms.ts`): `comms_address_kind`, `comms_transport`, `comms_direction`, `comms_participant_role`, `comms_delivery_status`, `comms_presence_state`.

> Migration: edit `comms.ts` + `enums.ts`, add barrel export in `index.ts`, run `bunx drizzle-kit generate --name="comms_identity_hub"` (offline). Never `migrate`/`push` prod.

---

### 3 Providers / tech choices + tradeoffs

**Inbound email for `*@rox.one` (catch-all → webhook)** — needed so D2 can deliver into the hub.
- **Recommended: Cloudflare Email Routing + Email Workers.** Cloudflare already manages the `rox.one` DNS zone (locked fact) → MX setup is one-zone, zero new vendor. Email Workers give programmatic catch-all (`onEmail`), MIME parse (postal-mime), attachment offload to R2, and reply threading at the edge. Zero egress, scales with Workers. Fits the "R2 for Drive" decision (one Cloudflare surface).
  - *Tradeoff:* `forward()` only to verified destinations; for app ingestion we POST to our webhook (api route) instead — fine. Worker CPU/size limits on huge attachments → stream to R2, store pointer.
- **Alt: Resend inbound** (already a vendor here via `packages/email` for transactional send). Catch-all on a subdomain MX, `email.received` webhook (metadata only — must call Received API for body). Cleanest if we want one mail vendor for send+receive.
  - *Tradeoff:* root-domain MX conflicts if we ever add other MX; Resend recommends a subdomain. Two-step fetch for body.
- **Alt: Postmark inbound** — best-in-class parse + SpamAssassin scores inline in the webhook JSON. Strong spam signal out of the box.
  - *Tradeoff:* another vendor; outbound stays on Resend → split-brain.
- **Decision: Cloudflare Email Routing + Workers as primary** (zone + R2 already ours), **Resend stays for outbound transactional**, Postmark noted as fallback if spam scoring proves weak. D1 only depends on the *normalized webhook payload*, so the provider is swappable behind the email adapter.

**XMPP server (D3 runtime, referenced)** — JID = `username@rox.one`.
- **Recommended: Prosody** for v1 (single Docker service, ~50–100MB RAM, MIT, PostgreSQL backend, HTTP-upload XEP-0363 → R2, mod_rest/admin for provisioning). Lowest ops cost; deploy alongside `apps/relay` on Fly.
- **Alt: ejabberd** — REST API for user provisioning/clustering, native Matrix bridge, 400+ XEPs; better at scale (>1k users) but heavier Erlang ops.
- *Decision:* Prosody now (provision JIDs via mod_rest when a handle is claimed), upgrade path to ejabberd if federation/scale demands. D1 only needs the adapter + a provisioning hook, so this is a D3 detail.

**Realtime presence transport** — reuse **`@rox/collab` (LiveBlocks, WS-L)** presence channel as the in-app presence source feeding the aggregator, and **ElectricSQL** to live-sync `comms_*` rows into web/desktop/mobile inbox UIs (already the repo's sync fabric — see `runtime.ts` electricHandle). No new realtime stack.

**Mesh (D5, optional)** — borrow **Nostr concepts** (ed25519 keypair in `comms_keypairs`, signed events, relay fan-out). bitchat is NOT embedded (native Swift, no accounts) — concept-only. Mesh is an optional offline transport adapter, not the backbone.

**Attachments / Drive** — message attachments store pointers (`comms_messages.attachments[].url`) into the Drive domain's bucket. Per the suite's storage decision, **Cloudflare R2** (S3-compatible, public buckets for share links, zero egress) is the natural target since the zone + Email Workers are already Cloudflare; Render object storage and the self-node "aws-swiss-migration" are evaluated in the Drive spec, not here. D1 is storage-agnostic — it only holds URLs.

---

### 4 Phased tasks (bite-sized — descriptions only, no code)

**Phase 0 — schema (packages/db)**
- T0.1 Add the 6 new enums' value arrays to `packages/db/src/schema/enums.ts` (`comms_*`). Test: extend the existing enums constants test asserting array membership.
- T0.2 Create `packages/db/src/schema/comms.ts` with the 8 tables above + `relations()` blocks, mirroring `chat.ts`/`identity.ts` conventions. Test: `bun test packages/db` snapshot of inferred types.
- T0.3 Barrel-export from `packages/db/src/schema/index.ts`; run `bunx drizzle-kit generate --name="comms_identity_hub"` (offline). Verify generated SQL is additive (no drops).

**Phase 1 — identity binding (packages/comms-core, new package)**
- T1.1 New package `packages/comms-core` (mirror `packages/shared` setup). Define `deriveAddresses(handle): {email,xmpp,mesh-stub}` pure util + test.
- T1.2 `provisionIdentity(userId, handle)` service: upsert `comms_addresses` (primary), generate/store `comms_keypairs` (public only; secret_ref to keystore). Test: unit with in-memory db / mocked keystore.
- T1.3 Handle-change hook: on `user_profiles.handle` update, flip old addresses to `is_alias=true` (grace window), allocate new primaries. Test: alias retention + uniqueness.

**Phase 2 — transport-adapter contract (packages/comms-core)**
- T2.1 Define `TransportAdapter` TS interface (see §6 contract) + an `AdapterRegistry`. Test: registry resolves by `comms_transport`.
- T2.2 Implement `InAppAdapter` (compose/outbound via Electric write; inbound = direct insert). Test: round-trips a message into `comms_messages`.
- T2.3 Stub `EmailAdapter`, `XmppAdapter`, `MeshAdapter` against the interface (real impls land in D2/D3/D5). Test: contract conformance suite each adapter must pass.

**Phase 3 — routing engine (packages/comms-core)**
- T3.1 `resolveCounterpart(addressOrUserId)`: rox user via `comms_addresses`, else external via `identity_links` (find-or-create contact, D6). Test: known user, unknown email, alias hit.
- T3.2 `resolveThread(participants, dedupKey, inReplyTo)`: match existing thread by `dedup_key` / `in_reply_to_external_id`, else create + `comms_participants`. Test: email reply joins existing in-app thread.
- T3.3 `selectTransport(recipient)`: preference order (in-app if reachable+online → xmpp → email → mesh), reading `comms_presence`. Test: online rox user → inapp; offline → email.
- T3.4 `routeInbound(normalizedMsg)` and `routeOutbound(draft)` orchestrators writing `comms_messages` + `comms_deliveries` (idempotent via `(transport, external_id)`). Test: duplicate inbound webhook is a no-op.

**Phase 4 — presence aggregator (packages/comms-core)**
- T4.1 `updatePresence(userId, transport, state)` → recompute aggregate, write `comms_presence`. Test: xmpp away + inapp online → aggregate online.
- T4.2 Bridge in-app presence from `@rox/collab` (WS-L) into the aggregator. Test: collab presence event updates `per_transport.inapp`.

**Phase 5 — tRPC + inbound webhook**
- T5.1 New router `packages/trpc/src/router/comms/` (`listThreads`, `getThread`, `sendMessage`, `markRead`, `presence`), registered append-only in `root.ts` after WS-E/WS-J/WS-L. Test: TDD per procedure (follow WS-F/WS-L router test pattern).
- T5.2 Inbound email webhook route in `apps/api` (normalize Cloudflare Email Worker / Resend payload → `routeInbound`), with provider signature verification. Test: fixture webhook → message persisted once.
- T5.3 Cloudflare Email Worker (small, in `apps/relay` or a new `apps/mail-worker`) that parses MIME, offloads attachments to R2, POSTs normalized JSON to T5.2. Test: integration against a sample `.eml`.

**Phase 6 — clients (web/desktop/mobile)**
- T6.1 Electric collection for `comms_threads`/`comms_messages` (follow `v2Workspaces` collection pattern, WS-G T7), cache-first per AGENTS.md rule 9. Test: live query renders persisted rows before `isReady`.
- T6.2 Unified Inbox UI shell in `apps/web` (thread list + transport badges), reused in `apps/mobile` via shared hooks. Test: component tests (follow Tasks screen pattern).

**Phase 7 — verify + PR**
- Per phase: `bun run lint:fix` → `bun run lint < /dev/null` (exit 0) → `bun run typecheck` → targeted `bun test` → open PR. Schema phase additionally verifies generated migration is additive.

---

### 5 Effort (S/M/L + rough weeks) & Risks

| Phase | Size | Rough |
|---|---|---|
| 0 schema | M | 0.5 wk |
| 1 identity binding | M | 0.5 wk |
| 2 adapter contract | M | 0.5 wk |
| 3 routing engine | L | 1.5 wk |
| 4 presence | S | 0.5 wk |
| 5 trpc + inbound webhook + mail worker | L | 1.5 wk |
| 6 clients | M | 1 wk |
| **Total (D1 only)** | **L** | **~6 wk / 1 eng** |

(D2/D3/D5 transport runtimes are separate specs and add to this.)

**Risks**
- **Spam / abuse (high):** every user gets a public `username@rox.one` inbox → spam target. Mitigate: SpamAssassin/Postmark score in `metadata`, per-address rate limits, allowlist/blocklist, and a `verified`/greylist gate before inbox surfacing. Tie heavy inbound abuse to WS-E quota.
- **Address squatting / impersonation (high):** handle = email + JID; a freed handle re-used could receive a predecessor's mail. Mitigate: alias grace window + permanent reservation of high-value/previously-active handles; never recycle within N days.
- **Cross-transport thread mismatch (med):** wrong `dedup_key` merges unrelated conversations or splits one. Mitigate: conservative matching (RFC References root + participant-set hash), and never merge across different org tenants.
- **Identity sprawl / consistency (med):** handle change must atomically re-derive addresses; partial failure leaves dangling JID/email. Mitigate: transactional `provisionIdentity`, reconcile job.
- **Cost (med):** inbound mail + R2 attachment storage scale with users; 10GB free Drive amplifies. Mitigate: R2 zero-egress + attachment size caps + WS-E overage; CF Email Routing is free/cheap.
- **E2E key custody (med):** mesh/E2E secret_ref must live in a real keystore, never Neon. Mitigate: secret store only stores pointer; keys in Infisical/host keystore.
- **Vendor lock (low):** provider hidden behind email adapter; swappable Cloudflare↔Resend↔Postmark via normalized payload.

---

### 6 Dependencies on other domains + Rox infra reused

**Reuses (existing, merged):**
- **ROX-522 identity** — `user_profiles.handle` is THE key; `rox.one/@<handle>` route already exists. D1 derives all addresses from it.
- **`identity_links` (D6)** — external sender → contact resolution; D1's `comms_participants.contact_entity_id` points at it.
- **WS-E token economy** (`rox_balances`, `rox_ledger`, `usage_requests`) — per-transport overage / anti-abuse quota for inbound/outbound volume.
- **`@rox/collab` (WS-L, LiveBlocks)** — in-app presence feed into the aggregator.
- **ElectricSQL** — live-sync `comms_*` to clients (same fabric as `runtime.ts` shapes, `v2Workspaces`).
- **`packages/email` (Resend)** — outbound transactional path / fallback inbound vendor.
- **`apps/relay` (Fly)** — host for Prosody (D3) + Email Worker / mesh relay.
- **Cloudflare zone for `rox.one`** — MX + Email Routing/Workers + R2.
- **tRPC + `packages/db` (Neon, additive)** — APIs and schema.

**Depends on / blocks:**
- **Blocks** D2 (mail), D3 (XMPP/chat), D4 (calendar — uses participant model), D5 (mesh) — they implement adapters against D1's contract.
- **Depends on** the Drive/storage spec for the attachment URL target (R2 vs Render vs self-node) — D1 is storage-agnostic, only holds URLs.

**`TransportAdapter` contract (described, not coded):**
- `kind: comms_transport`
- `normalizeInbound(raw): NormalizedMessage` — provider payload → `{externalId, inReplyToExternalId, from, to[], subject, body, bodyHtml, attachments[], createdAt, metadata}`.
- `send(draft, delivery): Promise<{providerId}>` — outbound for one recipient/transport; updates `comms_deliveries`.
- `provisionAddress?(userId, handle)` — optional hook (XMPP creates JID, mesh creates keypair) called by `provisionIdentity`.
- `presenceFor?(userId)` — optional presence probe feeding the aggregator.
- Conformance suite (T2.3) every adapter must pass guarantees uniform threading/idempotency.

---

### 7 Open questions for the owner

1. **Handle recycling policy** — permanently reserve freed handles, or release after N days? (security vs handle scarcity). Recommendation: permanent reservation for previously-active handles, alias grace = 90 days.
2. **Inbound email vendor** — confirm Cloudflare Email Routing+Workers as primary (uses the zone + R2 we already own), or prefer one-vendor Resend for send+receive? Recommendation: Cloudflare primary.
3. **XMPP federation** — should `username@rox.one` JIDs federate with the public XMPP network (interop, but more spam/abuse surface), or stay closed/internal v1? Recommendation: closed v1, federation behind a flag.
4. **E2E encryption scope** — E2E for mesh only, or also in-app/XMPP DMs (OMEMO)? Affects key management complexity. Recommendation: mesh-only E2E v1.
5. **Org scoping of comms** — is the unified inbox per-user-global or per-organization? Schema is org-scoped (repo convention); confirm a user's personal `@rox.one` mail isn't siloed per org.
6. **Mesh priority** — is D5 mesh in the initial cut or a later phase? It's modeled as optional here.
7. **Spam gate UX** — auto-surface all inbound to the inbox with a spam folder, or greylist unknown senders behind a request-to-message wall? Recommendation: spam folder + score, greylist only above an abuse threshold.

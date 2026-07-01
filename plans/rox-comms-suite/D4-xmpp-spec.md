## D4 — XMPP / Jabber Federation (`username@rox.one` JID)

> Domain D4 of the Rox Comms Suite. Makes the locked Rox identity (`username` →
> `user_profiles.handle`) reachable on the global XMPP/Jabber network as
> `username@rox.one`, and lets in-app Rox users talk to external Jabber users
> through a bridge into the D1 in-app messaging hub.
>
> Status: SPEC (no code). Schema additions are **additive only** to
> `packages/db/src/schema`, authored via `bunx drizzle-kit generate` (offline).
> Never `migrate`/`push` prod.

---

### 1 Scope & user stories

**In scope**
- A self-hosted XMPP server that owns the `rox.one` XMPP domain and federates
  (s2s) with the public Jabber network.
- One JID per Rox user, deterministically derived from the canonical handle:
  `JID = <handle>@rox.one` (locale-folded, RFC 7622 JID-escaped).
- **External auth** of XMPP clients against the Rox DB/auth — no second password
  store. XMPP clients log in with Rox-issued credentials/tokens, not a separate
  XMPP password.
- **s2s federation** (server-to-server) with STARTTLS-required + dialback, so
  `alice@rox.one` ↔ `bob@external-jabber.org` works both directions.
- A **bridge component** that relays messages/presence between the XMPP world and
  the D1 in-app hub, so a Rox user who never opens a desktop XMPP client still
  sees external Jabber messages inside the Rox app, and vice-versa.
- JID provisioning lifecycle tied to handle create/rename/delete.
- Presence bridging (in-app online/away ↔ XMPP presence).
- Offline message queue + delivery, abuse/spam controls.

**Out of scope (other domains / later)**
- The in-app message UI and storage model itself → **D1 hub** (this domain only
  produces/consumes hub events).
- Group MUC rooms, VoIP/Jingle calls (Rox uses **@rox/rtc / LiveKit** [WS-L] for
  voice/video, not Jingle). MUC may be a Phase 4 add-on.
- Email (`username@rox.one` SMTP) → **D3 mail** domain.
- Mesh/offline Nostr layer → separate optional domain (bitchat concepts only).

**User stories**
1. As a Rox user with handle `alice`, an external contact can add `alice@rox.one`
   in Conversations/Gajim/Monal and message me; I receive it **in the Rox app**.
2. As `alice`, I reply from the Rox app and `bob@external.org` receives it in his
   Jabber client as coming from `alice@rox.one`.
3. As `alice`, I can also connect a *real* XMPP client directly to `rox.one`
   using my Rox login (token), bypassing the in-app bridge, and get the same JID.
4. As `alice`, when I'm offline, messages from external contacts are queued and
   delivered when I (or the bridge) come online; nothing is silently dropped.
5. As an operator, I can rate-limit/blocklist abusive remote domains and JIDs,
   and federation is TLS-required with no cleartext s2s.
6. As `alice`, when I rename my handle `alice → alicia`, my JID follows
   (`alicia@rox.one`) with the old JID reserved for a grace window.

---

### 2 Target design

**Topology**

```
                         rox.one XMPP domain (federated)
  ┌──────────────────────────────────────────────────────────────────────┐
  │                                                                        │
  │   External Jabber  ──s2s(5269, STARTTLS+dialback)──┐                   │
  │   (conversations,                                  ▼                   │
  │    gajim, monal)                          ┌─────────────────┐          │
  │                                           │   ejabberd      │  c2s     │
  │   Direct XMPP client ──c2s(5222 STARTTLS)─▶│  (rox.one)     │◀────────  optional power users
  │   (alice's phone)        SASL token        │                 │          │
  │                                           │  auth_method:   │          │
  │                                           │   external ─────┼──┐       │
  │                                           │  storage: SQL ──┼─┐│       │
  │                                           └────────┬────────┘ ││       │
  │                                  XEP-0114 component │ (5347)   ││       │
  │                                  trust + secret     ▼          ││       │
  │                                  ┌──────────────────────────┐  ││       │
  │                                  │  rox-xmpp-bridge          │  ││       │
  │                                  │  (component @            │  ││       │
  │                                  │   bridge.rox.one)        │  ││       │
  │                                  │  • XMPP stanza <-> D1 hub │  ││       │
  │                                  │  • presence bridge        │  ││       │
  │                                  │  • JID<->userId mapping    │  ││       │
  │                                  └─────────┬─────────────────┘  ││       │
  └────────────────────────────────────────────┼──────────────────┘│       │
                                               │                   ││
                        ┌──────────────────────▼─────┐    ┌────────▼▼──────┐
                        │  D1 in-app hub (tRPC/WS)    │    │ extauth helper │
                        │  packages/chat + Electric   │    │ (HTTP→Rox auth │
                        │  live-sync to web/mobile/   │    │  + DB verify)  │
                        │  desktop                    │    └───────┬────────┘
                        └─────────────────────────────┘            │
                                                                    ▼
                                              Neon Postgres (packages/db) —
                                              users / user_profiles.handle /
                                              xmpp_* additive tables
```

Two ingress paths converge on one identity:
- **Bridge path (default):** external XMPP ↔ `ejabberd` ↔ XEP-0114 component
  (`rox-xmpp-bridge`) ↔ D1 hub ↔ Rox app. The vast majority of users never run
  an XMPP client; the bridge is a *virtual client* for them.
- **Direct c2s path (power users):** a real XMPP client authenticates to
  `ejabberd` on 5222 using the Rox **extauth** helper. Same JID, same DB.

**Why a component, not a full custom server:** the bridge connects to ejabberd
over the standard external-component protocol (XEP-0114, port 5347, shared
secret). It owns `bridge.rox.one` and can route on behalf of any
`<handle>@rox.one`. This keeps all federation/TLS/dialback complexity inside the
battle-tested ejabberd and keeps Rox-specific logic in TypeScript.

#### ERD — additive tables (prefix `xmpp_`)

All FKs cascade with their owner. Reuses existing `users`, `user_profiles`,
`organizations`. New tables live in `packages/db/src/schema/xmpp.ts`, barrel-
exported from `index.ts`.

```
users (existing)                         user_profiles (existing)
  id  PK ─────────────┐                    user_id PK/FK→users.id
                      │                     handle  UNIQUE   ← canonical identity
                      │
                      ▼
┌───────────────────────────────────────────────────────────────────────┐
│ xmpp_accounts                — one provisioned JID per user             │
│  id              uuid PK                                                │
│  user_id         uuid FK→users.id            ON DELETE CASCADE          │
│  organization_id uuid FK→organizations.id    ON DELETE CASCADE          │
│  jid_localpart   text  NOT NULL              (folded handle, e.g.alice) │
│  domain          text  NOT NULL DEFAULT 'rox.one'                        │
│  status          xmpp_account_status NOT NULL DEFAULT 'active'          │
│                  enum: active | suspended | reserved | deleted          │
│  resource_policy text   NULL    (optional pinned resource rules)        │
│  created_at / updated_at timestamptz                                    │
│  UNIQUE (domain, jid_localpart)          ← global JID uniqueness        │
│  UNIQUE (user_id)                        ← one JID per user             │
│  INDEX  (user_id)                                                       │
└───────────────────────────────────────────────────────────────────────┘
        │ 1
        │
        │ *                                  Old handles keep their JID reserved
┌───────────────────────────────────────────────────────────────────────┐
│ xmpp_jid_aliases             — reserved/renamed localparts             │
│  id              uuid PK                                                │
│  account_id      uuid FK→xmpp_accounts.id    ON DELETE CASCADE          │
│  jid_localpart   text NOT NULL                                          │
│  reserved_until  timestamptz NULL  (grace window after rename)          │
│  created_at      timestamptz                                            │
│  UNIQUE (jid_localpart)   ← an alias can't collide with a live localpart│
└───────────────────────────────────────────────────────────────────────┘

┌───────────────────────────────────────────────────────────────────────┐
│ xmpp_roster_links     — maps a remote JID contact to a Rox contact node│
│  (bridges into identity_links / contacts; NOT a second roster store)    │
│  id               uuid PK                                               │
│  account_id       uuid FK→xmpp_accounts.id   ON DELETE CASCADE          │
│  remote_jid       text NOT NULL              (bob@external.org)         │
│  contact_entity_id uuid NULL (targets contacts.entityId, soft link)    │
│  subscription     xmpp_subscription NOT NULL DEFAULT 'none'            │
│                   enum: none | to | from | both | pending_out|pending_in│
│  created_at / updated_at                                                │
│  UNIQUE (account_id, remote_jid)                                        │
│  INDEX  (account_id)                                                    │
└───────────────────────────────────────────────────────────────────────┘

┌───────────────────────────────────────────────────────────────────────┐
│ xmpp_offline_queue   — store-and-forward for bridged users offline     │
│  id            uuid PK                                                  │
│  account_id    uuid FK→xmpp_accounts.id      ON DELETE CASCADE          │
│  direction     xmpp_direction NOT NULL  enum: inbound | outbound        │
│  from_jid      text NOT NULL                                            │
│  to_jid        text NOT NULL                                            │
│  stanza_kind   text NOT NULL  (message|presence|iq)                     │
│  stanza        jsonb NOT NULL (normalized stanza incl. body, thread,id) │
│  origin_id     text NULL  (XEP-0359 stanza-id / dedupe key)            │
│  delivered_at  timestamptz NULL                                         │
│  expires_at    timestamptz NOT NULL  (TTL, default +30d)               │
│  created_at    timestamptz                                              │
│  UNIQUE (account_id, origin_id)          ← idempotent enqueue          │
│  INDEX  (account_id, delivered_at)       ← pull undelivered            │
│  INDEX  (expires_at)                      ← TTL sweep                   │
└───────────────────────────────────────────────────────────────────────┘

┌───────────────────────────────────────────────────────────────────────┐
│ xmpp_federation_policy  — per remote-domain allow/deny + rate          │
│  id            uuid PK                                                  │
│  domain        text NOT NULL UNIQUE   (remote server domain)           │
│  policy        xmpp_fed_policy NOT NULL DEFAULT 'allow'                 │
│                enum: allow | deny | throttle                            │
│  rate_per_min  integer NULL                                            │
│  reason        text NULL                                               │
│  created_at / updated_at                                                │
└───────────────────────────────────────────────────────────────────────┘
```

Notes:
- **Message bodies are NOT primarily stored here.** Bridged conversation content
  is owned by **D1 hub** (its own tables / Electric collection). `xmpp_offline_queue`
  is a transient relay buffer only (TTL'd). This avoids duplicating the chat store.
- ejabberd's **own SQL schema** (roster, MAM, offline, vcard, etc.) lives in a
  **separate Postgres database/schema** — *not* in `packages/db`. ejabberd manages
  it with its own migrations. The `xmpp_*` Rox tables are the only Drizzle-owned
  additions and they describe the *Rox↔XMPP mapping*, not XMPP internals.
- New enums (`xmpp_account_status`, `xmpp_subscription`, `xmpp_direction`,
  `xmpp_fed_policy`) added to `packages/db/src/schema/enums.ts` following the
  existing `identityKindValues` pattern.
- Optionally extend `identityKindValues` with `"xmpp"` so a remote JID can also
  resolve to a `contact` via the existing `identity_links` mechanism (additive
  enum value — safe append).

---

### 3 Providers / tech choices + tradeoffs

#### Server: **ejabberd** (recommended) vs Prosody

| Dimension | ejabberd | Prosody |
|---|---|---|
| External auth vs Rox DB | `auth_method: external` + `extauth_program` (length-prefixed stdin/stdout protocol), mature, pooled (`extauth_pool_size`) | `mod_auth_external_insecure` — **explicitly marked unmaintained / not for production**; `mod_auth_oauth_external` is the maintained path |
| REST/admin API | Built-in `mod_http_api` (`/api`) — provision/suspend users, send stanzas, query roster | `mod_rest` community module (works, less first-party) |
| SQL backend (Postgres) | First-class; roster/offline/MAM/vcard in pgsql | Supported via `mod_storage_sql`, fewer prod deployments at scale |
| Component (bridge) | `ejabberd_service` (XEP-0114) standard | `component` standard, equivalent |
| s2s federation / dialback | `mod_s2s_dialback`, `s2s_use_starttls: required`, PKIX | Equivalent, solid |
| Scale / ops | Erlang/OTP, clusters, well-trodden at large scale | Lua, lighter, easier to hack, smaller footprint |
| Hackability | Erlang (steeper) | Lua (friendlier community modules) |

**Decision: ejabberd.** The deciding factor is **production-grade external auth +
first-party REST API + Postgres backend** — exactly the three integration points
this domain needs. Prosody's external-auth story is the weakest part of its
otherwise excellent stack (the line-based external module is unmaintained; the
maintained path forces us onto OAuth2/OIDC which Rox auth would have to fully
expose). ejabberd's `extauth_program` + `mod_http_api` give a clean, supported
seam to the Rox DB without standing up an OIDC server first. Revisit Prosody only
if we later standardize on OAuth2/OIDC for all XMPP login (then `mod_auth_oauth_external`
becomes attractive).

#### Bridge auth seam: **extauth helper** (a small long-lived process)

- ejabberd spawns/pools `extauth_program`; it speaks ejabberd's length-prefixed
  protocol on stdin/stdout: `auth:user:host:password`, `isuser:user:host`,
  `setpass`, `tryregister`, etc. → respond `0`/`1`.
- The helper validates against Rox auth: a **Rox-issued XMPP token** (short-lived,
  minted by tRPC) is the "password". The helper verifies the token signature
  (reuse the `jose` JWT pattern already in `apps/relay`) and confirms the
  localpart maps to a live `xmpp_accounts` row. **No plaintext Rox passwords ever
  touch XMPP.** `isuser` checks `xmpp_accounts` existence.
- Tradeoff: token-as-password means standard XMPP clients must paste a token, not
  their normal password. Acceptable for the power-user direct path; the *default*
  path is the bridge (no client login at all). Alternative considered: full
  OAUTHBEARER/XEP-0493 (cleaner UX, more infra) — defer to Phase 4.

#### Where it runs

| Option | Verdict |
|---|---|
| **Fly.io** (reuse `apps/relay` deploy pattern) | **Recommended.** Persistent TCP listeners (5222/5269/5347) + public IPv4/IPv6 + global anycast already proven by `@rox/relay` (`fly.toml`, `scripts/deploy.sh` fleet topology). XMPP needs long-lived inbound TCP and a stable IP with proper DNS SRV — Fly gives dedicated IPs. ejabberd runs fine in a single-region (or small cluster) Fly app. |
| Render.com | Possible for the **bridge component** (it's just an outbound TCP client + HTTP), but raw non-HTTP inbound ports (5222/5269) on Render are awkward; not ideal for the XMPP server itself. |
| Own node `aws-swiss-migration` | Viable for a pinned, sovereign deployment with full port control and predictable IP/rDNS (good for s2s reputation). Tradeoff: ops burden, single point of failure, no managed restarts. Keep as a **fallback / data-residency option**, not the default. |

**Recommendation:** ejabberd + bridge on **Fly** (mirror `apps/relay`), Neon
Postgres (separate ejabberd DB), DNS via Cloudflare. Keep `aws-swiss-migration`
documented as the sovereign fallback target.

#### DNS (Cloudflare-managed `rox.one` zone)
- `_xmpp-client._tcp.rox.one. SRV → xmpp.rox.one:5222`
- `_xmpp-server._tcp.rox.one. SRV → xmpp.rox.one:5269`
- `xmpp.rox.one A/AAAA → Fly app IPs`
- TLS cert for `rox.one` + `xmpp.rox.one` + `bridge.rox.one` (ACME via ejabberd
  `mod_acme`, or wildcard from Cloudflare). s2s requires a cert valid for `rox.one`.

---

### 4 Phased tasks (bite-sized; file paths; test approach — DO NOT write code)

**Phase 0 — Schema + identity contract (S)**
- T0.1 Add `xmpp_*` enums to `packages/db/src/schema/enums.ts` (append-only) and
  add `"xmpp"` to `identityKindValues`. Test: enum-values snapshot test in
  `packages/db` (mirror existing constants tests).
- T0.2 Author `packages/db/src/schema/xmpp.ts` with the five tables + relations;
  barrel-export from `packages/db/src/schema/index.ts`. Test: `bun test packages/db`
  type-infer assertions (`$inferSelect`/`$inferInsert`).
- T0.3 `bunx drizzle-kit generate --name="xmpp_accounts_and_bridge"` (offline diff
  only — never migrate prod). Verify generated SQL is additive (no drops).
- T0.4 Define handle→JID derivation util in `packages/shared/src/xmpp/jid.ts`
  (fold/escape per RFC 7622, reject reserved localparts). Test: unit table of
  handle→localpart cases (unicode, dots, spaces, reserved words).

**Phase 1 — Provisioning & rename lifecycle (M)**
- T1.1 tRPC router `packages/trpc/src/routers/xmpp.ts`: `provisionAccount`,
  `getAccount`, `suspend`, `mintClientToken`. Test: router unit tests (TDD,
  mirror existing `collab`/`rtc` router test style).
- T1.2 Hook handle-create and handle-rename (in the identity/profile flow) to
  call provisioning + write `xmpp_jid_aliases` with a grace `reserved_until`.
  Test: rename produces alias row + new account localpart; old JID rejected for
  new signups during grace.
- T1.3 Register `xmpp` router in `packages/trpc` root (append-only, after
  WS-L routers). Test: root router type compiles; smoke call.

**Phase 2 — ejabberd deployment + extauth (M/L)**
- T2.1 New app `apps/xmpp/` (Docker) with `ejabberd.yml` template:
  `auth_method: external`, `extauth_program`, `default_db: sql` (pgsql to a
  dedicated Neon DB), `mod_http_api`, `s2s_use_starttls: required`,
  `mod_s2s_dialback`, `mod_offline`, `mod_mam`, `mod_register` locked down.
  Test: container boots, `ejabberdctl status` healthy, `/api` reachable.
- T2.2 `apps/xmpp/extauth/` helper (TS, Bun) implementing ejabberd's
  length-prefixed protocol; verifies Rox XMPP token via `jose` (reuse relay
  pattern) + checks `xmpp_accounts`. Test: protocol-conformance unit tests
  (`auth`/`isuser`/`setpass`/malformed → `0`); integration test against a local
  ejabberd in CI (docker-compose, like host-service integration suites).
- T2.3 `apps/xmpp/fly.toml` + `scripts/deploy.sh` mirrored from `apps/relay`
  (single region first; expose 5222/5269/5347). DNS SRV records doc in
  `apps/xmpp/docs/dns.md`. Test: manual s2s check against `xmpp.net` /
  `compliance.conversations.im`; capture report as evidence.

**Phase 3 — Bridge component ↔ D1 hub (L)**
- T3.1 `apps/xmpp-bridge/` (or `packages/xmpp-bridge`) — XEP-0114 component
  connecting to ejabberd (5347, shared secret from Infisical). Translate inbound
  `<message>` → D1 hub event; subscribe to D1 outbound events → emit `<message>`
  as `<handle>@rox.one`. Test: unit tests for stanza↔hub-event mappers; integration
  with ejabberd + a stub hub.
- T3.2 Presence bridging: map Rox app online/away/offline → XMPP presence for the
  bridge's virtual sessions; map remote presence → roster/contact presence in hub.
  Test: presence state-machine unit tests.
- T3.3 Offline store-and-forward: enqueue to `xmpp_offline_queue` when target Rox
  user has no live hub session; drain on reconnect; TTL sweeper cron. Test:
  enqueue idempotency (origin_id), drain order, expiry sweep.
- T3.4 Roster sync: when a remote JID first messages a user, upsert
  `xmpp_roster_links` + resolve/create a `contact` via `identity_links`
  (kind=`xmpp`). Test: first-contact creates link; subscription state transitions.

**Phase 4 — Hardening & optional (M)**
- T4.1 Federation policy enforcement (`xmpp_federation_policy`) surfaced in admin
  (`apps/admin`) + applied via ejabberd ACL/`s2s_access` regen or component-side
  filtering. Test: deny domain blocks inbound; throttle limits rate.
- T4.2 Spam/abuse: per-JID rate limits, JOIN with Rox auth account standing,
  optional CAPTCHA on s2s message floods, drop stanzas from JIDs not in roster +
  not opted-in (message-from-stranger policy). Test: flood → throttled/dropped.
- T4.3 (Optional) MUC, OAUTHBEARER/XEP-0493 direct login, message receipts
  (XEP-0184), MAM exposure to in-app history. Spec-only stubs.

---

### 5 Effort (S/M/L + rough weeks) & Risks

| Phase | Size | Rough weeks |
|---|---|---|
| P0 schema + JID util | S | 0.5 |
| P1 provisioning/rename | M | 1 |
| P2 ejabberd + extauth + deploy | M/L | 1.5–2 |
| P3 bridge ↔ D1 hub | L | 2–3 |
| P4 hardening + optional | M | 1–1.5 |
| **Total (excl. optional MUC)** | **L** | **~6–8 weeks** |

**Risks**
- **Spam/abuse (high).** Open XMPP federation is a classic spam vector. Mitigate:
  STARTTLS-required s2s, `mod_register` locked (no public registration — JIDs only
  via Rox provisioning), per-domain `xmpp_federation_policy`, message-from-stranger
  drop, rate limits, and a blocklist seeded from known-bad domains.
- **s2s reputation / deliverability (med).** Stable IP + correct rDNS + valid
  `rox.one` cert matter for federation acceptance. Fly dedicated IP or
  `aws-swiss-migration` fallback addresses this; Cloudflare proxy must be **off**
  for XMPP records (raw TCP, gray-cloud).
- **Two data stores drift (med).** ejabberd owns its SQL; Rox owns `xmpp_*`.
  Provisioning must keep them consistent (provision in Rox → create in ejabberd
  via `mod_http_api`; reconcile job). Risk of orphan JIDs on partial failure →
  idempotent provisioning + reconcile cron.
- **Token-as-password UX (low/med).** Direct c2s clients need a Rox token, not a
  normal password. Acceptable; default path is the bridge. Document clearly.
- **Cost (low).** One small Fly machine for ejabberd + one for the bridge + a
  small Neon DB. No per-message cost. Bandwidth negligible for text. Overage in
  Drive/economy is unrelated to D4.
- **Security (med).** Component shared secret + extauth token signing keys are
  high-value — store in Infisical, never in repo. s2s TLS verify on. Bridge runs
  with least privilege (only DB + ejabberd component access).
- **Erlang ops learning curve (low).** Mitigated by treating ejabberd as a black
  box configured via YAML + `mod_http_api`; all Rox logic stays in TS.

---

### 6 Dependencies on other domains + Rox infra reused

**Reuses (existing, merged):**
- **Identity / handle** — `user_profiles.handle` ([ROX-522]) is THE source of the
  JID localpart. No new identity store.
- **`identity_links` + `contacts`** (`packages/db/src/schema/identity.ts`,
  `contact.ts`) — remote JIDs resolve to contact nodes via a new `kind="xmpp"`.
- **`apps/relay` deploy + `jose` JWT pattern** — copy the Fly `fly.toml` /
  `scripts/deploy.sh` topology and the token-signing approach for the XMPP client
  token and component auth.
- **`packages/trpc`** — provisioning/admin procedures live here, registered
  append-only after the WS-L (`collab`/`rtc`) routers.
- **`packages/db`** (Neon, Drizzle) — additive `xmpp_*` tables only.
- **Infisical** — component shared secret + extauth signing key + ejabberd DB
  creds.
- **Cloudflare** — `rox.one` DNS zone for SRV/A/AAAA (gray-cloud for XMPP).
- **`packages/email` / Resend** — reuse for "you have an unread XMPP message"
  digests if desired (optional).

**Depends on (other comms-suite domains):**
- **D1 (in-app messaging hub)** — HARD dependency. The bridge needs a stable
  contract to inject inbound messages and subscribe to outbound ones (event shape,
  per-user session presence signal). D4 cannot fully ship without D1's event API.
  Phases 0–2 can proceed in parallel; Phase 3 gates on D1.
- **D3 (mail)** — shares the same `username@rox.one` identity namespace; coordinate
  so a handle reserves *both* the email and the JID localpart atomically.
- **D6 (contacts/identity resolution)** — `identity_links` semantics owned there;
  D4 only appends a `kind`.

**bitchat note:** bitchat is **not** embeddable (native Swift, no files/accounts).
D4 borrows only the *federated identity reachability* spirit; the mesh/Nostr
offline layer is a separate optional domain and is **not** the XMPP backbone.

---

### 7 Open questions for the owner

1. **Direct c2s login UX:** are we OK with power users pasting a Rox-minted token
   as their XMPP "password" in Phase 2, deferring real OAUTHBEARER/XEP-0493 to
   Phase 4? (Recommended: yes.)
2. **Hosting target:** confirm **Fly** for ejabberd (mirror `apps/relay`), or do
   you want the sovereign **`aws-swiss-migration`** node as the primary for s2s IP
   reputation / data residency? (Recommended: Fly primary, swiss-node fallback.)
3. **Federation default posture:** open federation with blocklist (more reach,
   more spam surface) vs allowlist-only at launch (safer, less reach)? (Recommended:
   open + aggressive message-from-stranger drop + per-domain policy.)
4. **MAM / history:** should external XMPP conversation history be merged into the
   in-app D1 history (single timeline), or kept as a separate "XMPP" channel?
5. **Handle rename grace window:** how long do we reserve the old JID
   (`xmpp_jid_aliases.reserved_until`) — 30/90 days? And do we rewrite the rDNS/
   alias to forward, or just block reuse?
6. **Group chat (MUC):** in scope at all, or is all group messaging Rox-native
   (so XMPP stays 1:1 federation only)? Affects whether `mod_muc` ships.
7. **D1 hub contract readiness:** is the D1 event API frozen enough to build the
   bridge against, or should D4 ship Phases 0–2 first and gate Phase 3?

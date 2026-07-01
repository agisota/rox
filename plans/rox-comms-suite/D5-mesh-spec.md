## D5 — Mesh / Serverless Transport (offline differentiator)

> Status: SPEC (no code). Domain D5 of the Rox Comms Suite. **P-last** priority — this is a marketing/resilience *differentiator*, NOT the team backbone. The backbone is D1 (server-backed messaging over relay/Electric/tRPC). D5 plugs into D1 as one more transport adapter and degrades to "no offline mode" cleanly everywhere it is not supported.

### Honesty preamble (read first)

bitchat (`permissionlesstech/bitchat`) is **native Swift, iOS/macOS only, has no file transfer in the team sense, no accounts, Unlicense**. It **cannot be embedded** into Rox (Electron/RN/Next). We therefore **borrow concepts, not code**:

- **BORROW (portable, do this):** the Noise `XX` E2E session concept (mutual auth + forward secrecy), `identity = static keypair`, the TTL-bounded gossip relay idea, binary framed packets with fragmentation, and — most importantly — **Nostr NIP-17 gift-wrapped DMs as a portable internet fallback transport** (pure JS, runs in RN/Electron/web). This is the realistic, shippable half.
- **OPTIONAL (hard, platform-gated):** a true offline **BLE mesh** reimplementing the bitchat wire protocol. Realistic on **React Native (mobile, native BLE peripheral+central)** and **Electron (native BLE module)**. **Web is effectively impossible** for true mesh — Web Bluetooth is GATT-**client only** (cannot advertise / cannot be a GATT peripheral), is **absent on iOS/Safari entirely**, and has no reliable background scanning. Web therefore gets **Nostr-only** offline-tolerant reach, never BLE mesh.

The deliverable Rox actually monetizes/markets is the **Nostr internet fallback** (resilient delivery when Rox servers are unreachable) plus an **opt-in local BLE mesh on mobile** for true offline (conferences, transit, disaster, censored networks). Everything else is honestly labeled "not supported on this platform."

---

### 1 Scope & user stories

**In scope**
- A pluggable **transport-adapter contract** that D1 already consumes (`server` is the default adapter; D5 registers `nostr` and `ble-mesh` adapters).
- **Nostr NIP-17 fallback transport** (`@rox/mesh-nostr`): portable JS, all platforms, sends/receives gift-wrapped DMs + small group posts when the Rox backbone is unreachable, then reconciles into the server when connectivity returns.
- **Optional BLE local mesh** (`@rox/mesh-ble`): mobile (RN) first-class, Electron best-effort, web = unsupported. Implements a Rox-flavored bitchat-style binary packet, Noise XX session, TTL gossip relay, fragmentation.
- A **mesh identity = the rox username's device key** derived deterministically from the user's existing identity (ROX-522), so mesh peers map back to a real Rox `username@rox.one`.
- **Reconciliation / dedup**: messages delivered offline are idempotently merged into D1's canonical store when online (no double-send, stable message IDs).

**Out of scope (explicitly)**
- Mesh as the primary transport. Default is always the server backbone.
- File/drive transfer over BLE mesh in v1 (text + tiny payloads only; large files stay on Drive/D-drive domain).
- Web BLE mesh (technically blocked — see §3).
- Group voice/video over mesh (that's D-rtc / LiveKit, server-bound).
- Anonymous/no-account mode (Rox is account-first; bitchat's "no accounts" property is deliberately dropped).

**User stories**
1. As a Rox user at a conference with no usable internet, I open the mobile app, enable "Local mesh," and DM another nearby Rox user; the message hops over BLE and is delivered offline, then syncs to the thread when I'm back online. *(BLE, mobile)*
2. As a user whose corporate network blocks Rox's relay, my DMs still go through over **Nostr relays** (gift-wrapped, E2E) without me configuring anything. *(Nostr, all platforms)*
3. As a user on the **web app**, when the backbone is briefly down, my outgoing messages queue and flush over Nostr; I see an honest "delivered via fallback network" badge. No BLE prompt is ever shown on web. *(Nostr, web)*
4. As a recipient, a message that arrived via mesh/Nostr shows the **same author identity** (`alice@rox.one`) and is **verified E2E**, not a stranger. *(identity binding)*
5. As an admin, I can **disable mesh entirely** for an org via a feature flag (`MESH_TRANSPORT`), and it disappears from all clients. *(governance)*

---

### 2 Target design

**ASCII — transport adapter stack (D5 plugs into D1)**

```
        D1 Messaging core (server backbone — canonical store in Neon)
        ┌───────────────────────────────────────────────────────────┐
        │  MessageRouter (D1)  —  chooses transport per outbound msg  │
        │   priority:  server(relay/Electric)  >  nostr  >  ble-mesh  │
        └──────────────┬───────────────┬───────────────┬─────────────┘
                       │               │               │
           ┌───────────▼──┐   ┌────────▼───────┐  ┌────▼──────────────┐
           │ server adapter│   │ nostr adapter  │  │ ble-mesh adapter  │
           │ (default,D1)  │   │ @rox/mesh-nostr│  │ @rox/mesh-ble     │
           │ relay/tRPC    │   │ NIP-17 giftwrap│  │ Noise XX + gossip │
           └───────────────┘   └───────┬────────┘  └────┬──────────────┘
                                       │                │
                              ┌────────▼─────┐   platform-native BLE:
                              │ Nostr relays │   RN: react-native-ble (central)
                              │ (federated)  │   + peripheral module (advertise)
                              │ all platforms│   Electron: @abandonware/noble + bleno-ish
                              └──────────────┘   Web: UNSUPPORTED (GATT client only)

  Shared crypto/identity layer: @rox/mesh-identity
    rox username (ROX-522)  ->  deterministic device keypair (Ed25519 / X25519)
    -> Nostr npub  AND  Noise XX static key  (same root identity, two encodings)

  Reconciliation: offline-delivered msgs -> idempotency key -> merged into D1 Neon store
```

**Transport-adapter contract (lives with D1, listed here for completeness — D5 implements two adapters):**
```
interface MeshTransport {
  id: 'server' | 'nostr' | 'ble-mesh'
  isAvailable(): boolean                 // platform + connectivity gate
  send(env: OutboundEnvelope): Promise<DeliveryReceipt>
  subscribe(onInbound: (env: InboundEnvelope) => void): Unsubscribe
  capabilities: { maxPayloadBytes, supportsGroups, requiresPairing }
}
```

**ERD — additive Drizzle tables (Neon, `packages/db/src/schema/`).** All prefixed `mesh_*`, additive only, generated offline via `bunx drizzle-kit generate`. No table mutates existing schema; FKs reference existing `users`/`organizations` and (loosely) D1 message ids.

New file: `packages/db/src/schema/mesh.ts`

```
mesh_device_keys                         -- one row per (user, device): public mesh identity
  id                uuid pk
  organization_id   uuid  -> organizations.id (cascade)
  user_id           uuid  -> users.id (cascade)
  device_label      text                  -- "Mark's iPhone"
  noise_static_pub  text  notnull         -- X25519 static public key (base64), Noise XX
  nostr_npub        text  notnull         -- derived Nostr pubkey (bech32)
  ed25519_pub       text  notnull         -- signing key for packet signatures
  revoked           boolean default false
  created_at        timestamptz default now()
  last_seen_at      timestamptz
  INDEX (user_id), INDEX (organization_id)
  UNIQUE (organization_id, noise_static_pub)
  UNIQUE (nostr_npub)
  -- NOTE: private keys NEVER stored server-side. Live only in
  --   expo-secure-store (mobile) / OS keychain via Electron safeStorage (desktop).

mesh_relay_endpoints                     -- org-curated Nostr relay list (defaults seeded)
  id                uuid pk
  organization_id   uuid  -> organizations.id (cascade)   -- null-org = global default set
  url               text  notnull         -- wss://relay...
  enabled           boolean default true
  priority          smallint default 100
  created_at        timestamptz default now()
  UNIQUE (organization_id, url)

mesh_delivery_log                        -- audit + dedup of fallback-delivered messages
  id                uuid pk
  organization_id   uuid  -> organizations.id (cascade)
  message_id        uuid                  -- D1 canonical message id (loose ref, no FK: D1 owns it)
  idempotency_key   text  notnull         -- stable hash(sender_device, msg_uuid)
  transport         text  notnull         -- 'nostr' | 'ble-mesh'
  direction         text  notnull         -- 'outbound' | 'inbound'
  status            text  notnull         -- 'queued'|'sent'|'delivered'|'reconciled'|'failed'
  hops              smallint              -- BLE: relay hop count observed (mesh telemetry)
  created_at        timestamptz default now()
  reconciled_at     timestamptz
  UNIQUE (organization_id, idempotency_key, direction)   -- the dedup guarantee
  INDEX (message_id), INDEX (status)

mesh_peer_sightings                      -- optional telemetry: who-saw-whom on BLE (privacy-gated)
  id                uuid pk
  organization_id   uuid  -> organizations.id (cascade)
  reporter_user_id  uuid  -> users.id (cascade)
  seen_noise_pub    text  notnull         -- peer's static pub seen over BLE
  rssi              smallint
  seen_at           timestamptz default now()
  INDEX (organization_id, seen_at)
  -- DEFAULT OFF; only written when org enables mesh proximity telemetry flag.
```

Relations: `mesh_device_keys` hangs off `users` (identity = rox username via ROX-522). `mesh_delivery_log.message_id` deliberately has **no FK** to D1's message table (loose coupling — D1 owns message lifecycle, D5 only logs transport facts), mirroring how `chat_messages.session_id` is stored without an FK in `chat.ts`.

---

### 3 Providers / tech choices + tradeoffs

**Nostr fallback transport — pick: `nostr-tools` (JS), NIP-17 + NIP-44.**
- *Why:* pure JS/TS, runs identically in RN (with `react-native-get-random-values` + `expo-crypto`, both already in `apps/mobile/package.json`), Electron, and web. NIP-17 gift-wrapping gives metadata-private E2E DMs; relays are dumb, federated, free, and censorship-resistant. This is the **portable** half of bitchat's design and the realistic ship.
- *Tradeoffs:* relay reliability varies; public relays can rate-limit/spam-filter; gift-wrap adds payload overhead; group semantics are weaker than the server. Mitigate with an **org-curated relay list** (`mesh_relay_endpoints`) and optionally a **Rox-run relay** on Fly (we already run `apps/relay` — a Nostr relay could sit beside it) as a guaranteed default.
- *Rejected:* raw NIP-04 (deprecated, leaks metadata); building our own relay protocol (reinventing Nostr for no gain).

**BLE mesh transport — pick per platform:**
| Platform | Library / approach | Central (scan/connect) | Peripheral (advertise/GATT server) | Verdict |
|---|---|---|---|---|
| **iOS/Android (RN, Expo 56 dev-client)** | `react-native-ble-plx` (central) + a custom **Expo native module** (`apps/mobile/modules/`) wrapping CoreBluetooth `CBPeripheralManager` / Android `BluetoothGattServer` for advertising | yes | yes (custom module) | **Feasible, first-class.** Requires a custom dev client (already used — `expo-dev-client` present). iOS background BLE is limited but works for foreground mesh. |
| **Desktop (Electron 40)** | `@abandonware/noble` (central) + `@abandonware/bleno` (peripheral) as native deps in `apps/desktop` | yes | partial (bleno is flaky on modern macOS) | **Best-effort.** Central role solid; peripheral/advertising unreliable on current macOS. Desktop can be a mesh *relay/leaf* but not a guaranteed beacon. |
| **Web (Next.js, `apps/web`)** | Web Bluetooth | **GATT client only** | **NO** (cannot advertise, cannot be GATT server) | **Unsupported for mesh.** Also absent on iOS/Safari, no background scan, HTTPS+user-gesture only. Web gets **Nostr-only** offline reach. |

- *Why RN-first:* Expo 56 dev-client + `expo-crypto` + `react-native-get-random-values` are already in the repo, so Noise XX crypto and a custom BLE native module are tractable without leaving the current toolchain. Mobile is also where "offline at a conference/transit" actually happens.
- *Tradeoffs:* the custom Expo peripheral module is real native work (Swift + Kotlin); Apple background-BLE throttling limits true always-on mesh; battery cost; app-store review of background BLE usage. This is why D5 is **P-last** and opt-in.

**Crypto:** Noise `XX_25519_ChaChaPoly_SHA256` (matches bitchat's choice — interop-friendly, mutual auth, forward secrecy) via a JS Noise impl (e.g. `@noise-protocol`-style lib) for the BLE adapter; NIP-44 (ChaCha20-Poly1305) for Nostr. Single root identity (Ed25519/X25519) derived from the rox username so both encodings trace to one `username@rox.one`.

**Storage provider note:** D5 stores no large objects — text + tiny payloads only. Drive/object-storage provider selection (Render vs R2 vs aws-swiss-migration) is the **D-drive** domain's decision, not D5's. D5 only writes small rows to Neon.

---

### 4 Phased tasks (bite-sized; file paths; test approach — descriptions only, no code)

**Phase 0 — Contract & identity (S, foundation)**
- T0.1 Define `MeshTransport` adapter contract + envelope types in `packages/shared/src/mesh/contract.ts` (re-export from `packages/shared`). *Test:* type-level + a `FakeTransport` unit test for the contract surface (Bun test in `packages/shared`).
- T0.2 New schema `packages/db/src/schema/mesh.ts` (4 tables above) + barrel in `packages/db/src/schema/index.ts`; run `bunx drizzle-kit generate --name="mesh_transport_tables"` **offline only**. *Test:* `bun test packages/db` snapshot of generated SQL is additive; no edits under `packages/db/drizzle/`.
- T0.3 `packages/mesh-identity` (new package): derive device keypair (Ed25519/X25519 + Nostr npub) from the rox username/identity (ROX-522). Private key persists via `expo-secure-store` (mobile) and Electron `safeStorage` (desktop) — adapters injected, never in `packages/db`. *Test:* deterministic-derivation unit tests; round-trip sign/verify.

**Phase 1 — Nostr fallback (M, the shippable core)**
- T1.1 `packages/mesh-nostr`: NIP-17 gift-wrap send/receive over `nostr-tools`, relay pool from `mesh_relay_endpoints`. *Test:* unit tests against a mock relay (in-memory websocket) — encrypt→giftwrap→unwrap→decrypt round trip.
- T1.2 tRPC router `packages/trpc/.../mesh.ts`: `mesh.registerDevice`, `mesh.listRelays`, `mesh.logDelivery` (writes `mesh_delivery_log` with idempotency dedup). Register in root router **append-only** (mirror WS-L pattern). *Test:* router unit tests (TDD) incl. duplicate idempotency_key → single row.
- T1.3 D1 integration: register `nostr` adapter in D1's `MessageRouter`; fallback fires only when `server` adapter `isAvailable()===false`. *Test:* router selection test — server-down forces nostr; server-up never uses nostr.
- T1.4 Reconciliation worker: on reconnect, flush queued outbound + merge inbound into D1 canonical store by idempotency key; mark `reconciled`. *Test:* simulate offline→online, assert no dupes and stable message IDs.
- T1.5 Optional Rox-run Nostr relay beside `apps/relay` on Fly (guaranteed default endpoint). *Test:* smoke connect + publish/subscribe.

**Phase 2 — UI surface, all platforms (S)**
- T2.1 "Delivered via fallback network" badge + transport indicator in chat UI (`packages/chat` / `packages/ui`). *Test:* component test asserting badge renders for `transport='nostr'`.
- T2.2 Settings: org `MESH_TRANSPORT` feature flag gate (reuse existing flag infra) + per-user "Allow fallback delivery" toggle. *Test:* gated route hidden when flag off (mirror N7 network-filter gate test).
- T2.3 Web: ensure **no BLE prompt ever** on `apps/web`; Nostr-only path. *Test:* assert `ble-mesh` adapter `isAvailable()` is always false on web.

**Phase 3 — BLE local mesh, OPTIONAL / P-last (L, mobile-first)**
- T3.1 `packages/mesh-ble`: Rox binary packet (version/type/TTL/timestamp/optional Ed25519 sig + fragmentation) + Noise XX session state machine (lazy handshake) — protocol design borrowed from bitchat WHITEPAPER, clean-room TS impl. *Test:* packet encode/decode + fragmentation reassembly + Noise XX handshake unit tests.
- T3.2 RN central via `react-native-ble-plx` in `apps/mobile/lib/mesh/`. *Test:* mocked BLE adapter; gossip relay TTL-decrement logic unit-tested off-device.
- T3.3 RN peripheral: custom Expo native module in `apps/mobile/modules/rox-ble-peripheral/` (Swift `CBPeripheralManager` + Kotlin `BluetoothGattServer`) to advertise + serve GATT. *Test:* native module smoke on a dev-client build; manual two-device hop proof (evidence: video).
- T3.4 Electron best-effort: `@abandonware/noble` central in `apps/desktop/src/`; desktop acts as mesh leaf/relay only. *Test:* central-scan integration on a machine with BLE; peripheral marked unsupported/best-effort.
- T3.5 Telemetry (opt-in): write `mesh_peer_sightings` only when org proximity-telemetry flag on. *Test:* default-off assertion.

**Verification per phase:** `bun run lint < /dev/null` → `bun run typecheck` → targeted `bun test` (per package) → open PR (mirror existing WS-* PR cadence). BLE phases additionally require **two-device manual proof** captured as evidence (video/screens) since CI cannot exercise radios.

---

### 5 Effort (S/M/L + rough weeks) & Risks

| Phase | Size | Rough weeks |
|---|---|---|
| P0 contract + identity + schema | S | 0.5–1 |
| P1 Nostr fallback (ship target) | M | 2–3 |
| P2 UI + flags | S | 0.5–1 |
| P3 BLE mesh (optional, mobile-first) | L | 4–6 (incl. native modules + device QA) |
| **Total to "Nostr fallback shipped" (P0–P2)** | **M** | **~3–4 weeks** |
| **+ BLE differentiator (P3)** | **L** | **+4–6 weeks** |

**Risks**
- **Abuse / spam:** open Nostr relays invite spam and unsolicited DMs. *Mitigate:* only accept inbound from peers whose `nostr_npub` maps to a known `mesh_device_keys` row (i.e. real Rox users / contacts via D6 identity_links); rate-limit; org-curated relay list; default to a Rox-run relay.
- **Security:** private keys must never reach the server — enforce keychain/secure-store only; rotation + `revoked` flag in `mesh_device_keys`; verify Ed25519 signatures + Noise mutual auth before trusting a mesh peer (prevents impersonation of `alice@rox.one`).
- **Metadata leakage:** Nostr relays see envelope timing/size even with gift-wrap. Honest UX label; padding optional later.
- **BLE platform reality:** iOS background-BLE throttling and macOS `bleno` flakiness mean "always-on offline mesh" is not guaranteed — market it as foreground/opt-in, not magic.
- **Web false expectations:** Web Bluetooth cannot mesh (client-only, no iOS). Risk = promising mesh on web. *Mitigate:* spec + UI both state web = Nostr-only.
- **Cost:** Nostr relays are cheap/free; a Rox-run relay on Fly is marginal. BLE native module = real eng + app-store review cost — the main cost driver, hence P-last.
- **Duplicate delivery:** offline + online paths both deliver. *Mitigate:* `mesh_delivery_log` unique idempotency key is the dedup contract; tested in T1.4.
- **Licensing:** bitchat is Unlicense; we clean-room the protocol (concepts/wire-format), no code copy — keep an attribution note in `packages/mesh-ble/README`.

---

### 6 Dependencies on other domains + Rox infra reused

**Depends on:**
- **D1 (messaging backbone)** — D5 is an adapter plugged into D1's `MessageRouter`; D1 owns the canonical message store and message IDs. D5 cannot ship before D1's transport-adapter seam exists. *(D1 spec not yet written — flag dependency.)*
- **ROX-522 (identity)** — mesh device keys derive from the rox username; one identity → npub + Noise key.
- **D6 (contact/identity resolution, `identity_links`)** — inbound mesh peers resolve back to a real Rox contact; reuse `resolveIdentity` pattern to bind `nostr_npub`/`noise_static_pub` as new `identity_kind` values (additive enum).

**Reuses existing Rox infra:**
- `apps/relay` (Fly) — co-locate an optional Rox-run Nostr relay.
- `packages/trpc` + root router append-only registration (WS-L pattern).
- `packages/db` Neon schema (additive `mesh_*` tables, offline `drizzle-kit generate`).
- Existing **feature-flag** infra (N5/N7 pattern) for `MESH_TRANSPORT` + proximity telemetry gates.
- `apps/mobile` Expo 56 dev-client + `expo-crypto` + `expo-secure-store` + `react-native-get-random-values` (crypto + key storage already available).
- `apps/desktop` Electron 40 `safeStorage` for desktop key persistence.
- `packages/chat` / `packages/ui` for the transport badge + settings surface.

**Does NOT touch:** Drive/object storage (D-drive domain owns Render/R2/aws-swiss-migration choice); WS-E token economy (mesh sends no billable large payloads in v1); LiveKit/collab (server-bound, not mesh).

---

### 7 Open questions for the owner

1. **Ship line:** is the acceptance bar "Nostr fallback works" (P0–P2, ~3–4wk), with BLE (P3) explicitly deferred as a later marketing push? (Recommended: yes.)
2. **Rox-run Nostr relay** on Fly as a guaranteed default endpoint — approve standing up one beside `apps/relay`, or rely solely on public federated relays?
3. **Inbound trust policy:** restrict mesh/Nostr inbound to **known Rox contacts only** (recommended, anti-spam) vs allow any npub? This changes the abuse surface materially.
4. **BLE investment:** do you want the custom Expo peripheral native module (Swift+Kotlin) on the roadmap at all, or is central-only "receive/relay" mesh acceptable for v1? Full peripheral is the bulk of P3 cost.
5. **Identity encoding exposure:** OK to surface a user's `nostr_npub` as a public, shareable identifier (it must be public for Nostr to work), distinct from the private rox username? Need a product call on whether npub is shown in UI.
6. **D1 seam timing:** D1's `MessageRouter`/adapter interface is the hard prerequisite — confirm D1 owns and ships that seam so D5 isn't blocked.

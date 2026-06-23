# mesh-relay-watcher (D5) — server-escrow inbound bridge

Standalone bridge between the public **Nostr relay pool** and the rox **D1 comms
hub**. It is the mesh analogue of the D4 XMPP XEP-0114 bridge and the D3
Cloudflare email worker — a best-effort **transport-fallback** so a rox user's
DMs still arrive when the rox backbone is unreachable.

> **Trust model — read this.** Mesh is a **transport-fallback bridge, NOT an
> E2E-private product.** To decrypt inbound NIP-17 gift-wraps server-side, this
> watcher holds a **server-held escrow keypair**, so **the server CAN read mesh
> DMs** addressed to the escrow identity. The escrow **public** key is recorded in
> `mesh_escrow_keys` (auditable + rotatable); the escrow **private** key is loaded
> from Infisical/env at this process **only** and is never stored in the database
> or this repo. If you need zero-knowledge privacy, do not route through mesh.

> **Status:** the bridge **code ships and is tested** (`src/unwrap.ts` +
> `src/post.ts` + `src/index.ts`, with unit tests covering real NIP-17 unwrap and
> the signed POST). This package is intentionally **outside** the bun/turbo
> workspace (`workers/*` is not in the root `workspaces` globs) so it never runs in
> CI. A **LIVE end-to-end receive** additionally requires this process **deployed**
> and an escrow key **provisioned** on an always-on host — see *Deploy follow-up*.

## What it does

1. Subscribes the org-curated relay set (`mesh_relays`) over websockets
   (`nostr-tools` `SimplePool`).
2. Filters NIP-17 gift-wrapped DMs (**kind 1059**) whose `#p` tag is the
   server-held escrow pubkey (`mesh_escrow_keys`).
3. **Unwraps + decrypts server-side** with the escrow private key
   (`nip17.unwrapEvent`), yielding the inner kind-14 DM plaintext + the real
   sender pubkey.
4. POSTs each as a signed `RelayWatcherOutboundEvent` to `/api/mesh/inbound`
   (HMAC + timestamp + nonce via `MESH_INBOUND_SECRET`), where the existing API
   ingress (`apps/api/src/lib/mesh/**`) verifies, dedups, resolves pubkey→user,
   and emits into the unified inbox (`transport='mesh'`). A relay redelivery is a
   harmless `409 duplicate` (the `mesh_delivery_log` ledger owns dedup).

## Server side (shipped previously, reused here)

- `packages/db/src/schema/mesh.ts` — `mesh_devices` / `mesh_relays` /
  `mesh_escrow_keys` / `mesh_delivery_log` / `mesh_nonces`.
- `packages/comms-core/src/adapter/MeshAdapter.ts` — pure transport adapter
  (`normalizeInbound` feeds the ingest pipeline).
- `apps/api/src/app/api/mesh/inbound/route.ts` — the signed ingress.
- `mesh` tRPC router — device provisioning (gated by `MESH_TRANSPORT_ENABLED`).

## Env

| var | purpose |
|---|---|
| `MESH_INBOUND_SECRET` | shared HMAC secret for signing POSTs to `/api/mesh/inbound` (also set on the API). |
| `MESH_API_URL` | the rox API base url. |
| `MESH_RELAYS` | comma-separated `wss://…` relay urls to subscribe. |
| `MESH_ESCROW_NSEC` | the escrow **private** key as a bech32 `nsec1…` (Infisical-injected). |
| `MESH_ESCROW_SK_HEX` | alternative: the escrow **private** key as 64-char hex. |

The escrow private key is **never** committed; provide exactly one of
`MESH_ESCROW_NSEC` / `MESH_ESCROW_SK_HEX` from Infisical at deploy.

## Deploy follow-up (OUTSIDE CI — required for a LIVE receive)

This PR ships the runnable code + tests + honest docs only. To actually receive a
mesh DM end-to-end:

1. **Provision an escrow identity:** generate a Nostr keypair, store the
   **private** key in Infisical as `MESH_ESCROW_NSEC`, and insert the **public**
   key into `mesh_escrow_keys` (global-org row, `active=true`).
2. **Deploy the watcher** on an always-on host (Fly/relay-style), with
   `MESH_INBOUND_SECRET`, `MESH_API_URL`, `MESH_RELAYS`, and the escrow secret in
   the environment (`bun src/index.ts` / `node --experimental-strip-types`).
3. **Configure the API** with the matching `MESH_INBOUND_SECRET` and
   `MESH_TRANSPORT_ENABLED=1`.

Until that deploy lands, NO feature flag claims a live mesh receive — the gated
surface is the code path, not a running process.

## Licensing

Concepts (TTL gossip, Noise XX, NIP-17 fallback) are borrowed from
[bitchat](https://github.com/permissionlesstech/bitchat) (Unlicense). No code is
copied — clean-room TS. BLE local mesh is a separate, later wave.

**DO NOT auto-deploy.**

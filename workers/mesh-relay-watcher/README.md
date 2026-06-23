# mesh-relay-watcher (D5) — contract stub, deploy DEFERRED

Standalone bridge between the public **Nostr relay pool** and the rox **D1 comms
hub**. It is the mesh analogue of the D4 XMPP XEP-0114 bridge and the D3
Cloudflare email worker.

> **Status:** CONTRACT STUB ONLY. No live relay connections, no key signing, no
> deploy. This package is intentionally **outside** the bun/turbo workspace
> (`workers/*` is not in the root `workspaces` globs) so it can never break CI.
> The live relay subscription + key escrow are the **deploy-wave** task.

## What it will do (deploy wave)

1. Subscribe to the org-curated relay set (`mesh_relays`) over websockets.
2. Filter NIP-17 gift-wrapped DMs (kind 1059) addressed to a rox device pubkey
   present in `mesh_devices`.
3. Unwrap + decrypt the inner DM.
4. POST each as a signed `RelayWatcherOutboundEvent` to `/api/mesh/inbound`
   (HMAC + timestamp + nonce via `MESH_INBOUND_SECRET`), where the API ingress
   (`apps/api/src/lib/mesh/**`) verifies, dedups, resolves pubkey→user, and emits
   into the unified inbox (`transport='mesh'`).

## Server side (shipped in this PR)

- `packages/db/src/schema/mesh.ts` — `mesh_devices` / `mesh_relays` /
  `mesh_delivery_log` / `mesh_nonces`.
- `packages/comms-core/src/adapter/MeshAdapter.ts` — pure transport adapter
  (injected signer/publisher; no inline crypto).
- `apps/api/src/app/api/mesh/inbound/route.ts` — the signed ingress.
- `mesh` tRPC router — device provisioning (gated by `MESH_TRANSPORT_ENABLED`).

## Env (deploy wave)

| var | purpose |
|---|---|
| `MESH_INBOUND_SECRET` | shared HMAC secret for signing POSTs to `/api/mesh/inbound` (also set on the API). |
| `MESH_API_URL` | the rox API base url. |
| relay key material | per the deploy-wave key-escrow design — never in this repo. |

## Licensing

Concepts (TTL gossip, Noise XX, NIP-17 fallback) are borrowed from
[bitchat](https://github.com/permissionlesstech/bitchat) (Unlicense). No code is
copied — clean-room TS. BLE local mesh is a separate, later wave.

**DO NOT auto-deploy.**

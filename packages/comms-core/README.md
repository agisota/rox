# @rox/comms-core

Pure-TypeScript domain core for the **Identity & Comms Hub (D1)** of the Rox
Workspace Suite — the spine every comms transport (in-app, email/D2, XMPP/D3,
mesh/D5) plugs into.

It defines:

- the **`TransportAdapter`** contract (`normalizeInbound`, `send`, optional
  `provisionAddress` / `presenceFor`),
- an **`AdapterRegistry`** keyed by transport,
- a **`MessageRouter`** (counterpart resolution, cross-transport threading with
  `(transport, external_id)` dedup, presence-aware transport selection,
  inbound/outbound orchestration),
- the **`InAppAdapter`** reference implementation,
- pure identity helpers (`deriveAddresses`).

See `plans/rox-comms-suite/D1-identity-hub-spec.md` for the full design.

## Design rules

- **No database writes.** All persistence is performed through the injected
  ports in [`src/ports.ts`](./src/ports.ts) (`AddressStore`, `ContactResolver`,
  `ThreadStore`, `MessageStore`, `DeliveryStore`, `PresenceStore`). The real
  Drizzle/Neon implementation lives in the API/server layer; this package only
  depends on the contract, so it unit-tests against in-memory fakes.
- **DB-type-only dependency.** It depends on `@rox/db` for shared shapes; the
  `comms_*` enum value arrays in [`src/types.ts`](./src/types.ts) are the single
  source the eventual Drizzle `pgEnum`s must match.
- **Self-contained & additive.** Adding this package modifies no existing code.

## Layout

```
src/
├── index.ts                 # barrel
├── types.ts                 # enums, message/thread shapes, NormalizedMessage, OutboundDraft
├── ports.ts                 # injected persistence interfaces (no db client)
├── identity/
│   └── deriveAddresses.ts   # handle → { email, xmpp, mesh-stub }
├── adapter/
│   ├── TransportAdapter.ts  # the contract
│   ├── AdapterRegistry.ts   # registry by transport
│   └── InAppAdapter.ts      # reference implementation
└── router/
    ├── MessageRouter.ts     # routing fabric
    └── dedup.ts             # cross-transport dedup-key derivation
```

## Usage sketch

```ts
import {
  AdapterRegistry,
  InAppAdapter,
  MessageRouter,
} from "@rox/comms-core";

const router = new MessageRouter({
  ports,                                  // your Drizzle-backed CommsPorts impl
  adapters: new AdapterRegistry([new InAppAdapter()]),
});

// inbound webhook (already normalized by the source adapter)
await router.routeInbound(orgId, normalizedMessage); // idempotent on (transport, external_id)

// outbound compose — picks a transport per recipient by presence + preference
await router.routeOutbound({
  organizationId: orgId,
  authorUserId,
  recipients: [{ kind: "address", address: "bob@rox.one" }],
  body: "hi",
});
```

## Implementing a new transport

1. Implement `TransportAdapter` (`kind`, `normalizeInbound`, `send`; optional
   `provisionAddress` / `presenceFor`).
2. Register it: `registry.register(new MyAdapter())`.
3. The router handles threading, idempotency, fan-out, and inbox surfacing.

## Commands

```bash
bun test      # unit tests (no database required)
bun run typecheck
```

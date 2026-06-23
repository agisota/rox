# @rox/agent-state

Cross-host **agent-state** coordination for the Rox hybrid host model. A
transport-agnostic service (`core` / `host` / `client`, mirroring
`@rox/workspace-fs`) backed by a **Turso/libSQL embedded replica** that lets
multiple host-service instances (a user's desktop + their cloud sandboxes) share
a convergent view of "who is doing what" — agent presence, run progress, host
liveness — with local-speed reads and async write-back to a per-org primary.

> Scope of this package as shipped: the standalone `@rox/agent-state` package
> (core contract, libSQL schema + embedded-replica connector, host service, sync
> loop, transport-agnostic client, and the strict-claim escape hatch). The
> host-service integration seam (`runtime/agent-state`) and the additive tRPC
> sub-router are a later, separately-gated step.

## Why a third database — Electric vs. Turso

Rox already has two databases; this is a deliberate **third** concern that
belongs to neither.

| | Electric (existing) | Turso embedded-replica (this package) |
|---|---|---|
| direction | cloud Postgres → device | host ↔ host, via a Turso/libSQL primary |
| shape | org-scoped UI/graph projection | ephemeral agent runtime/coordination state |
| consumer | renderer local-db (read cache) | host-service agent runtime (read + write) |
| write path | app → cloud Postgres → Electric | writes land in the local replica, push to primary |
| latency model | shape-stream, cursor-resumable | embedded local read (`sync()`), async push |
| source of truth | cloud Postgres | Turso primary DB (per-org agent-state) |

- **Electric** is cloud→device read-sync of durable UI state. It cannot do
  machine-to-machine, bidirectionally-written, high-churn coordination.
- **`better-sqlite3`** (host-service `src/db`) is each machine's *private* truth
  (terminals, repos, worktrees). It is not shared across hosts.
- **Turso/libSQL** gives every host a local, queryable copy of *shared* agent
  state, converging asynchronously through a per-org primary.

`agent_state_entries` / `host_presence` / `agent_run_coord` carry only the
**observable, convergent** slice. NOT synced here: secrets, PTY bytes, file
contents, durable UI rows.

## Conflict model

Last-writer-wins per `(orgId, scope, scopeId, key)` using `revision` then
`updatedAt`. This is correct because entries are **owner-scoped** (a run's owner
host writes its own run row).

**Strict mutual exclusion is NOT modelled as LWW.** Single-writer claims
(e.g. "only host A may run preinstall X", "claim workspace W") are arbitrated by
the cloud Postgres registry (`runtime_services` / `v2_hosts`) via a conditional
upsert exposed by WS-C's `runtime.*` tRPC. This package routes those through the
`ClaimTransport` interface (`host/claims.ts`); until WS-C wires the real
procedure, claims resolve `{ ok: false, reason: "claims-not-wired" }` rather than
silently falling back to (incorrect) LWW.

## Layers

- `core/service.ts` — the `AgentStateService` interface + request/subscription
  maps. No I/O.
- `host/replica.ts` — `createEmbeddedReplica(...)` over libSQL `createClient`;
  offline-first (no `syncUrl` ⇒ pure-local, `sync()` is a no-op).
- `host/service.ts` — `AgentStateHostService` (LWW upsert + in-process change
  events for `subscribeScope`).
- `host/sync-loop.ts` — interval + coalesced `kick()` sync, AbortSignal-stoppable.
- `host/claims.ts` — the Postgres-arbitrated strict-claim escape hatch.
- `client/index.ts` — `createAgentStateClient(transport)`; binds any transport
  (relay / cloud / in-process) without UI branching.

## TanStack-DB adapter (future swap point)

`apps/desktop` already ships `@tanstack/db` + `@tanstack/react-db` and uses
`useLiveQuery` pervasively over Electric collections. A future **async libSQL
collection adapter** would let desktop agent panes (and, once adopted, the web
agents cabinet) subscribe to this embedded replica with the same cache-first
`useLiveQuery` ergonomics — one reactive layer over *both* Electric (UI state)
and Turso (agent state).

The host API is intentionally shaped so it can be swapped to a TanStack
collection later without renderer churn: until then, agent-state is read through
`subscribeScope` (snapshot-first, then live changes) and plain host-side queries.
The adapter is an **enhancer, not a blocker**.

## Migrations

Schema lives in `src/schema.ts`. Generate migrations **offline only**:

```bash
bun run --filter @rox/agent-state generate   # drizzle-kit generate (offline)
```

Never run `drizzle-kit migrate`/`push` (deploy step, owner-gated), and never
write into `packages/db/drizzle/`. At runtime, a freshly-opened replica
bootstraps its tables idempotently from `AGENT_STATE_DDL`.

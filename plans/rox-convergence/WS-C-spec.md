# WS-C: Relay & Remote-Hosts Productization — Spec

Read-only architect analysis + Phase-2 implementation spec. Every claim is grounded in `file:line` evidence.
Scope: `apps/relay`, `apps/electric-proxy`, the remote-hosts data path, plus the host-side tunnel client (`packages/host-service/src/tunnel`) and provisioner (`packages/host-provisioner`). Coordinates with WS-B (host capabilities / host-service surface) and WS-D (cross-host agent-state sync).

---

## 1. Findings

### 1.1 What the relay is, and how it works end to end

The relay (`apps/relay`, fly app `rox-relay`) is a **host↔client tunnel proxy**: a public WebSocket+HTTP rendezvous so a web/mobile/desktop *client* can reach a *host-service* running on a machine that has no public address (behind NAT/firewall). It is a Hono server on `@hono/node-server` + `@hono/node-ws` (`apps/relay/src/index.ts:47-49`).

Two connection classes (confirmed `apps/relay/plans/20260420-relay-hardening.md:7-11`):

1. **Host side (the tunnel).** A host-service opens `wss://relay.rox.one/tunnel?hostId=<orgId:machineId>&token=<jwt>` (`packages/host-service/src/tunnel/tunnel-client.ts:98-104`). Relay verifies the JWT and host access (`apps/relay/src/index.ts:214-224`), then `TunnelManager.register()` stores an in-memory `Map<hostId, TunnelState>` (`apps/relay/src/tunnel.ts:51,125-135`) and publishes ownership to Redis (`directory.register`, `tunnel.ts:90,150-168`).
2. **Client side (the proxy).** Clients call `/hosts/:hostId/trpc/*` (HTTP, `index.ts:277-305`) or upgrade `/hosts/:hostId/*` (WS, `index.ts:307-337`). `authMiddleware` (`index.ts:151-190`) verifies the JWT + host access, then the request is forwarded over the host-side tunnel WS.

**HTTP request flow** (`index.ts:277-305` → `tunnel.ts:367-401` → host `tunnel-client.ts:240-278`):
- Relay strips `host`/`authorization` headers (`index.ts:285-287`), assigns `crypto.randomUUID()`, registers a pending promise with a 30s timeout (`tunnel.ts:383-401`), and sends `{type:"http", id, method, path, headers, body}` down the tunnel.
- Host fetches `http://127.0.0.1:<localPort><path>` adding its own `Authorization: Bearer <hostServiceSecret>` (a PSK, `tunnel-client.ts:242-250`), then **buffers the full body** with `await response.text()` (`tunnel-client.ts:252`) and sends `{type:"http:response", id, status, headers, body}` back.
- Relay matches the pending promise by id (`tunnel.ts:444-450`) and returns the `Response`.

**WebSocket flow (terminals, chat streams):** client WS upgrade → `openWsChannel()` allocates a channel id, sends `{type:"ws:open", id, path, query}` (`tunnel.ts:403-416`); host opens a local WS to `ws://127.0.0.1:<localPort>` with the PSK as `?token=` (`tunnel-client.ts:280-292`). Frames relay bidirectionally as `{type:"ws:frame"}` with optional base64 for binary (`tunnel.ts:418-421,451-460`; host `tunnel-client.ts:307-321,339-351`).

**Liveness:** relay pings every 30s, 3 missed = close (`tunnel.ts:12-13,137-144`); host has a 75s inbound-silence watchdog (`tunnel-client.ts:15,375-391`). Pongs refresh the Redis directory heartbeat (`tunnel.ts:441-443`).

**Online state:** on register/unregister the relay debounces and writes `host.setOnline` to the API (`tunnel.ts:146,279-361`), which updates `v2_hosts.is_online` (`packages/trpc/src/router/host/host.ts:206-258`).

**ASCII — end-to-end tunnel:**
```
 Desktop/Web client                 Fly relay (rox-relay, N machines)            Host machine (NAT'd)
 ──────────────────                 ───────────────────────────────────         ───────────────────
  GET /hosts/<id>/trpc/* ──JWT────▶ authMiddleware (verifyJWT+checkHostAccess)
                                    hasTunnel? no → directory.lookup(Redis)
                                    other machine? → 200 + fly-replay header ───▶ (fly re-routes to owner)
                                    owner=us → TunnelManager.sendHttpRequest
                                       {type:http,id} ══tunnel WS══════════════▶ fetch 127.0.0.1:<port> (+PSK)
                                       resolve pending(id) ◀══{http:response}═══ await response.text()
  ◀── HTTP Response ───────────────
        (terminals: same path but ws:open / ws:frame channels)
```

### 1.2 fly-replay sticky routing, scale-out, operations

**What it is.** Each relay machine keeps tunnels *in-process* (the host-side WS lives on exactly one machine). When a client HTTP/WS lands on a machine that does NOT own the target tunnel, the machine returns an empty `200` with header `fly-replay: instance=<machineId>` or `fly-replay: region=<region>` (`apps/relay/src/index.ts:114-143`). Fly's edge proxy then re-issues the same request to the named machine/region, which handles it locally. Ownership lives in Redis (Upstash) keyed `relay:tunnel-owner <hostId> → <region>:<machineId>` (`apps/relay/src/directory.ts:5-7,27-29,47-64`).

**How it scales.** Adding fly machines adds tunnel capacity; the directory + replay route any client to the owning machine regardless of which machine its TCP landed on. Rationale and rejected alternatives (pub/sub bus, per-tunnel subdomain, consistent-hash edge) are documented in `apps/relay/plans/20260420-relay-hardening.md:30-67`. The directory writes are all-or-nothing Lua scripts (`directory.ts:40-64,70-91,119-160`) to avoid partial-write zombies; a 30s sweeper drops entries past the 90s TTL (`index.ts:341-345`, `directory.ts:9,175-183`).

**WS replay caveat.** You cannot send `fly-replay` after `Sec-WebSocket-Accept`. There is an explicit HTTP pre-flight `GET /hosts/:hostId/_whoowns` (`index.ts:257-271`) that returns the replay header before the client opens the actual WS upgrade — the documented workaround (`hardening.md:88`).

**Operate it.** Topology is asserted by `apps/relay/scripts/deploy.sh:5-16`: `fly scale count app=6 --max-per-region 1` across `sjc iad fra nrt sin gru`, then `fly deploy --strategy rolling`, then a smoke test. `fly.toml` deliberately has NO region count (`fly.toml:1-5`); `auto_stop_machines="off"`, `auto_start_machines=true`, concurrency soft 2000/hard 5000 (`fly.toml:21-27`). **Note an inconsistency:** the hardening plan's non-goal says "stay single-region `sjc`" (`hardening.md:26,155`) but `deploy.sh` already deploys 6 regions — the multi-region `fly-replay: region=` path (`index.ts:139-142`) is live. Graceful drain on SIGINT/SIGTERM sends an in-band `{type:"drain"}` then close code 4001 and clears this machine's directory entries (`index.ts:62-86`, `tunnel.ts:195-254`), so deploys don't strand tunnels.

**Maturity:** mature and battle-tested for register/route/drain (extensive race-condition handling in `tunnel.ts` and `directory.ts`). **Gaps vs. the hardening plan:** Phase 3 **streaming is NOT implemented** — both relay (`index.ts:282` `c.req.text()`) and host (`tunnel-client.ts:252` `response.text()`) buffer full bodies, so SSE / large downloads / true streaming do not pass through (plan §Phase 3, `hardening.md:104-112`). Phase 5 **observability is absent** — no `/admin/tunnels`, no `/metrics`, logs are plain strings. Phase 6 data-model fixes (the `v2_hosts.name`-per-row / UUID-as-name leak) are unfixed (`hardening.md:139-143`; `v2_hosts.name` still written on every `ensure`, `host.ts:81-92`).

### 1.3 Turning a Windows device into a remote host — what you can do/see from your Mac

**Mechanism.** Install the app / run host-service on the Windows box. It registers via `host.ensure` (`packages/host-service/src/tunnel/connect.ts:20-25`, `host.ts:65-129`) and opens its relay tunnel (`serve.ts:110-119`). From your Mac (web or desktop client) you reach it by selecting that host; every host-scoped tRPC/WS call is proxied over its tunnel.

**What you get (full host-service surface, proxied 1:1).** The local port exposes the complete host-service tRPC router (`packages/host-service/src/trpc/router/*`), so from the Mac you can drive, on the Windows machine:
- **Terminals / PTYs** — `router/terminal` + `terminal-agents`, backed by a pty-daemon (`serve.ts:36`, `startDaemonBootstrap`). Interactive shells stream over `ws:frame` channels.
- **Files** — `router/filesystem` (read/write/list).
- **Git** — `router/git`, `router/github`, `router/pull-requests`, `router/issues` (status, history, branches, PR create).
- **Workspaces / projects** — `router/workspace*`, `router/project` (git worktrees per `v2_workspaces`).
- **Agents / chat** — `router/agents`, `router/chat`, `agent-bridge` (run coding agents on the Windows box).
- **Ports** — `router/ports` (forwarded local dev servers), `router/cloud`, `router/notifications`, `router/attachments`, `router/config`, `router/settings`.

**Depth/scope:** effectively a full remote-control plane for that machine's dev environment — anything host-service can do locally, the Mac can do remotely, at the *host-service's own privilege* (the PSK `Authorization` is injected host-side, `tunnel-client.ts:247`; the client never holds it).

**Limits (concrete):**
- **No raw browser/RDP/screen.** It is an API/PTY surface, not a remote desktop. "Browser" = forwarded dev-server ports + agent browser tools, not the Windows GUI.
- **No streaming yet** (1.2) — large file downloads buffer fully host-side before any byte ships; SSE-style endpoints don't stream through the tunnel.
- **Cross-machine latency** — `sjc`-default RTT for distant hosts; interactive lag mitigated by `TCP_NODELAY` (`index.ts:393-398`).
- **One owner identity at the host PSK layer** — all authorized org users act as the single host-service process identity; no per-user OS-level scoping inside the host.
- **30s request timeout** for non-WS calls (`tunnel.ts:61`), too short for some long tRPC ops (`hardening.md:119`).

### 1.4 Multi-tenant authorization + the electric-proxy gatekeeper — assessment

**"Multi-tenant authorization" here = two independent JWT-gated planes, both scoped by org+host membership:**

- **Relay (control/RPC plane).** `verifyJWT` (jose, remote JWKS at `/api/auth/jwks`, `apps/relay/src/auth.ts:11-26`) yields `{sub, organizationIds}`. `checkHostAccess` (`access.ts:22-51`) first short-circuits on org membership (`parseHostRoutingKey` + `organizationIds.includes`), then calls `host.checkAccess` which requires a **per-host `v2_users_hosts` row** — org membership alone is NOT enough (`host.ts:179-204`). Results are LRU-cached by `(userId,hostId)` 15m allow / 30s deny (`access.ts:6-20`). Tunnel registration runs the same check (`index.ts:214-224`).
- **Electric-proxy (read/sync plane).** A Cloudflare Worker (`apps/electric-proxy/src/index.ts`) that is the **sole gateway to ElectricSQL shapes**. It verifies the JWT (`auth.ts:23-44`), then for every shape rewrites the upstream `where` clause to inject org/user scoping server-side via Drizzle-built fragments (`where.ts:68-222`), enforces org membership (`index.ts:72-79`), enforces user-scoping for `journal_entries`/`memory_*` (`index.ts:14-18,80-87`), restricts columns for sensitive tables (`electric.ts:7-11`), and strips `Authorization`/`Cookie` before hitting upstream (`index.ts:101-103`). The Electric source secret never reaches the client (`electric.ts:19-29`).

**Assessment — strengths:**
- Defense-in-depth: RPC and sync are separately gated; the client never holds the host PSK or the Electric secret.
- Server-side `where`-rewrite is the right shape for row-level tenancy; the client cannot widen its own shape.
- Per-host membership (not just org) is correct least-privilege for hosts.

**Weaknesses / failure modes (concrete):**
1. **Two auth implementations drift.** `verifyJWT` is duplicated verbatim in `apps/relay/src/auth.ts` and `apps/electric-proxy/src/auth.ts` (also `AuthContext`/`WhereClause` types). A fix in one (e.g. clock-skew tolerance, role claim) silently misses the other. **Redesign:** extract a shared `@rox/relay-auth` (or `@rox/shared/jwt-verify`) consumed by both.
2. **`where`-clause table allowlist is the only tenancy guard, and it's a giant switch.** `buildWhereClause` returns `null` → 400 for unknown tables (`where.ts:219-221`), which is fail-closed (good), but every new synced table is a manual switch arm — easy to forget user-scoping (e.g. add a per-user table to `where.ts` but forget to add it to `USER_SCOPED_TABLES` in `index.ts:14-18`). **Redesign:** make scoping declarative (a registry mapping `table → {orgColumn, userColumn?}`) so the org/user guard and the where-clause are derived from one source, eliminating the index.ts/where.ts split that can drift.
3. **JWKS cache has no refresh/jitter control.** Both proxies lazily memoize `createRemoteJWKSet` once (`auth.ts:9-16`); `jose` handles rotation, but a JWKS-endpoint outage degrades both planes simultaneously (shared dependency on `/api/auth/jwks`).
4. **Relay trusts `organizationIds` from the JWT for the cheap path.** If a user is removed from an org, their still-valid JWT (hourly rotation) keeps `checkHostAccess`'s org short-circuit passing until expiry; the DB `v2_users_hosts` check catches host-level revocation but not org-level until token refresh. Acceptable given 1h tokens, but worth documenting.
5. **`checkHostAccess` fails open to `false` on API error** (`access.ts:48-50`) — correct (fail-closed). But a transient API outage denies all *new* access checks while cached allows persist 15m — asymmetric but safe.
6. **electric-proxy `cacheEverything: true`** (`index.ts:107`) with `Vary: Authorization` (`index.ts:33`) — relies on the auth header being part of the cache key for tenant isolation at the CDN. This MUST stay correct or one tenant's shape could be served to another. **Add a test asserting the cache key includes the per-tenant scoping.**

### 1.5 The sandbox role (sandbox_images, v2_hosts sandbox fields)

**`v2_hosts` is the unified host registry** for three kinds (`packages/db/src/schema/enums.ts:57`): `local` (this device, tunnels via relay, null port), `remote` (persistent managed workspace), `sandbox` (ephemeral, TTL ~1h). `provider` ∈ `daytona|modal|e2b|self` (`enums.ts:61-68`); `port`/`protocol`/`expiresAt` populated for managed hosts (`schema.ts:552-562`).

**Provisioning path** (`packages/trpc/src/router/v2-host/v2-host.ts:413-534`): `provision` calls `getHostProvisioner(provider)` (`packages/host-provisioner/src/factory.ts:48-72`) which dispatches to Daytona/Modal/E2B/RoxSelf adapters implementing the `HostProvisioner` contract (`host-provisioner/src/types.ts:58-63`). On success it atomically inserts the `v2_hosts` row + owner `v2_users_hosts` membership; on DB failure it rolls back the external resource via `provisioner.destroy` (`v2-host.ts:528-533`). Sandboxes get `ttlMs` (default `DEFAULT_SANDBOX_TTL_MS`, `v2-host.ts:461-464`); host-service self-shuts at expiry (`packages/host-service/src/serve.ts:127-152`). A reaper sweeps expired hosts (`host-provisioner/src/index.ts:14-20`). `addServer` is the no-spend "register an endpoint I already run" path (`v2-host.ts:541-611`); `RoxSelfProvisioner` (provider `self`) spins a host-service container on a Docker box via the Docker Engine HTTP API (`host-provisioner/src/rox-self.ts:113-201`).

**`sandbox_images`** (`schema.ts:730-756`) is **per-project sandbox build config**: `baseImage`, `systemPackages[]`, `setupCommands[]`, unique per `projectId`. It is the recipe for warming a sandbox for a given project. **Maturity gap:** the table exists and is synced through electric-proxy (`where.ts` does NOT yet have a `sandbox_images` arm — confirmed: `where.ts:74-221` has no `sandbox_images` case, so it currently returns `null`/400 if a client tries to sync it). The provisioner adapters do not yet *consume* `sandbox_images` (no `baseImage`/`setupCommands` wiring in `ProvisionInput`, `types.ts:23-31`). So the recipe is modeled but not threaded into provisioning.

**Critical convergence gap (the big one).** Managed `remote`/`sandbox` hosts persist a reachable `host:port` (`v2-host.ts:486-490`), but **no client code connects to that endpoint directly.** The relay only proxies hosts that have an *in-process tunnel* (`tunnel.ts:367-377` throws "Host not connected" if `!hasTunnel`); `maybeReplay`/`authMiddleware` return 503 for any host without a live tunnel (`index.ts:172-178`). For a remote/sandbox host to be reachable today, the host-service running *inside* it must dial back out to the relay (`serve.ts:110-119`) exactly like a local host — the persisted `port`/`protocol` is currently surfaced only for display (`host-routing.ts:78-90`), with no direct-connect client. **This is the productization seam WS-C must close.**

---

## 2. Target design

**North-star (locked HYBRID HOST MODEL): one unified host abstraction.** A client attaches to a host the same way whether it is (a) the user's own desktop via relay tunnel, or (b) a cloud sandbox/remote host. `v2_hosts.kind` is already that discriminator; the relay is already the universal entry. The productization is: **make every managed host reachable through the same relay tunnel + connection UX, thread `sandbox_images` into provisioning, harden the two auth planes, and add operability.**

### 2.1 Unified connection resolution (data-flow)
```
 client picks host (v2_hosts row, any kind)
        │
        ▼
 resolveHostConnection(host):
   kind=local | (managed AND host-service dialed relay) ──▶ RELAY TUNNEL  (existing path, /hosts/:id/*)
   kind=remote|sandbox with direct endpoint + relay-bridge ─▶ RELAY (managed host-service auto-connects on boot)
        │                                                         (provisioner injects RELAY_URL + ORG + token)
        ▼
 single client transport (tunnel-client semantics) — no per-kind branching in the UI
```
Decision: **do NOT add a second client transport to `host:port` directly.** Instead, every managed host's host-service is provisioned with `RELAY_URL`/`ORGANIZATION_ID`/auth so it auto-dials the relay on boot (it already does — `serve.ts:110-119`). This keeps ONE proxy path, ONE auth model, and zero new public attack surface. The persisted `port`/`protocol` becomes optional metadata/diagnostics, not the primary connect path. (Direct-endpoint connect can be a later P2 optimization for same-VPC latency, behind the same resolver.)

### 2.2 Provisioning with sandbox_images (sequence)
```
 web "New sandbox for project P"
   → v2Host.provision({kind:sandbox, provider, projectId})
   → load sandbox_images WHERE project_id=P  (baseImage, systemPackages, setupCommands)
   → provisioner.provision({...ProvisionInput, image, setupCommands, env:{RELAY_URL,ORG_ID,bootstrap-token}})
   → provider boots host-service container; it dials relay; setOnline; reaper armed at TTL
   → v2_hosts row {kind:sandbox, provider, expiresAt}; owner membership
```

### 2.3 Auth de-duplication (ERD-ish ownership)
```
 packages/shared/src/jwt-verify.ts   ──exports── verifyRoxJwt(token, jwksUrl) → {sub,email,organizationIds}
        ▲                                   ▲
        │ imported by                       │ imported by
 apps/relay/src/auth.ts             apps/electric-proxy/src/auth.ts   (thin wrappers; no logic)
```
electric-proxy scoping becomes a declarative registry so `USER_SCOPED_TABLES` (index.ts) and the where-switch (where.ts) derive from ONE map.

---

## 3. Phase-2 implementation tasks (TDD, exact paths)

> All tasks are file-isolated to WS-C ownership (§4). Tests use Bun's `bun test`. Relay/host already have race-heavy unit suites to mirror.

### P0 — foundation & safety (no behavior change to the happy path)

**C1. Extract shared JWT verification.**
- Create `packages/shared/src/jwt-verify.ts`: `export async function verifyRoxJwt(token, jwksUrl): Promise<RoxJwtClaims|null>` + `RoxJwtClaims` type, lifting the identical logic from `apps/relay/src/auth.ts:18-51`.
- Test: `packages/shared/src/jwt-verify.test.ts` — valid token → claims; expired → null (no throw); missing `sub`/`organizationIds` → null; assert no PII logged on expiry.
- Modify `apps/relay/src/auth.ts` and `apps/electric-proxy/src/auth.ts` to re-export/wrap `verifyRoxJwt` (keep their `AuthContext` names). Behavior identical; one source of truth.
- Expected: both proxies pass existing suites unchanged.

**C2. Declarative electric-proxy table scoping.**
- Create `apps/electric-proxy/src/table-scopes.ts`: a registry `Record<table, {orgColumn?, userColumn?, columns?}>` derived from the current `where.ts` switch + `electric.ts` `COLUMN_RESTRICTIONS` + `index.ts` `USER_SCOPED_TABLES`.
- Refactor `where.ts:buildWhereClause` and `index.ts` membership/user-scope guards to read the registry (single source). Add `sandbox_images` arm: org-scoped (`{orgColumn: organization_id}`).
- Test: extend `apps/electric-proxy/src/where.test.ts` — every registry table yields a non-null where; user-scoped tables reject mismatched `userId`; `sandbox_images` org-scoped; unknown table → null.
- Expected: parity with current behavior + `sandbox_images` now syncable.

**C3. CDN cache-isolation regression test.**
- Add `apps/electric-proxy/src/cache-isolation.test.ts`: assert `Vary: Authorization` is set and that two different tokens for different orgs produce different upstream `where` params (proving tenant isolation is in the cache key path). Pure unit over `buildUpstreamUrl` + `addCorsHeaders`.

### P1 — productize managed-host reachability + provisioning

**C4. Thread `sandbox_images` into provisioning.**
- Extend `packages/host-provisioner/src/types.ts:ProvisionInput` with optional `image?: string`, `systemPackages?: string[]`, `setupCommands?: string[]`.
- Modify `v2-host.ts:provision` to accept `projectId`, load the `sandbox_images` row, and pass recipe fields into `provisioner.provision`. Wire each adapter (`daytona.ts`, `modal.ts`, `e2b.ts`, `rox-self.ts`) to apply `image`/`setupCommands` (rox-self already takes `Image` — `rox-self.ts:145-153`).
- Test: `packages/host-provisioner/test/*` with mocked `fetch` — assert recipe fields reach the provider request body; `v2-host` test asserts `sandbox_images` lookup + passthrough.

**C5. Managed host boots with relay credentials (unified connect).**
- In `v2-host.ts:provision`, pass `env: {RELAY_URL, ORGANIZATION_ID, ROX_API_URL, bootstrap auth}` into `ProvisionInput`/each adapter so the provisioned host-service auto-dials the relay (mirrors `serve.ts:110-119`). Add a short-lived bootstrap token mechanism (coordinate with WS-B for host-service auth provider).
- Test: adapter tests assert env injection; integration-style test asserts a provisioned host transitions `is_online=true` via the existing `setOnline` path (mock relay).
- Expected: a freshly provisioned sandbox becomes reachable through `/hosts/:id/*` with NO new client transport.

**C6. Streaming pass-through (hardening Phase 3).**
- Extend `packages/shared/src/tunnel-protocol.ts`: add `http:response:start|chunk|end` messages (keep `http:response` for back-compat).
- Modify `apps/relay/src/tunnel.ts` + `index.ts:277-305` to pipe chunks into a `ReadableStream` `Response` body; modify host `packages/host-service/src/tunnel/tunnel-client.ts:240-278` to stream `response.body` instead of `await response.text()`.
- Test: `apps/relay` unit — a chunked host response arrives incrementally (assert first chunk before last). Mark streaming requests exempt from the 30s timeout (`tunnel.ts:61`).
- Coordinate with WS-B (host endpoints that benefit: file download, SSE).

### P2 — operability & polish

**C7. Admin/metrics endpoints (hardening Phase 5).**
- Add `apps/relay/src/admin.ts`: `GET /admin/tunnels` (shared-secret gated, NOT user JWT) reading the Redis directory; `GET /metrics` (Prometheus text) for `relay_tunnels_current`, `relay_request_total{status}`, `relay_replay_hits_total{cross_machine}`, `relay_proxy_errors_total{reason}`.
- Test: `apps/relay/src/admin.test.ts` — secret required; metrics format; replay counter increments on cross-machine path.

**C8. Direct-endpoint connect (optional latency optimization).**
- Behind the §2.1 resolver, allow same-VPC clients to use the persisted `host:port` (`host-routing.ts:buildHostEndpoint`) instead of the relay, gated by a flag. Test the resolver chooses tunnel by default and direct only when explicitly enabled.

---

## 4. File ownership (Phase-2, this workstream only)

**Owned exclusively by WS-C (safe to modify):**
- `apps/relay/**` (all of `src/`, `scripts/`, `fly.toml`, `Dockerfile`) — relay server, scaling, drain, admin/metrics, streaming.
- `apps/electric-proxy/**` (all of `src/`, `wrangler.jsonc`) — auth de-dup wrappers, declarative scoping, cache-isolation tests, `sandbox_images` arm.
- `packages/host-provisioner/**` — provisioner contract + adapters, `sandbox_images` threading, relay-cred injection.
- `packages/host-service/src/tunnel/**` (`tunnel-client.ts`, `connect.ts`, `index.ts`, `types.ts`) — host-side streaming + provisioned-host dial.
- `apps/relay/plans/**` — plan updates.

**New files WS-C creates:**
- `packages/shared/src/jwt-verify.ts` + `jwt-verify.test.ts`
- `apps/electric-proxy/src/table-scopes.ts`, `cache-isolation.test.ts`
- `apps/relay/src/admin.ts`, `admin.test.ts`

**Shared/coordinated (do NOT unilaterally rewrite — propose diffs, coordinate):**
- `packages/shared/src/tunnel-protocol.ts` — WS-C owns the streaming additions but host+relay both consume; land the protocol change first, then both sides.
- `packages/shared/src/host-routing.ts` — read-only for WS-C (resolver consumes it); changes coordinate with WS-B.
- `packages/db/src/schema/schema.ts` + `enums.ts` — **owned by the DB/schema workstream**; WS-C only *reads* `v2_hosts`/`sandbox_images`. Any column add (e.g. `last_connected_at` from hardening Phase 6) must be requested from the schema owner.
- `packages/trpc/src/router/v2-host/v2-host.ts` and `router/host/host.ts` — **coordinate with WS-B** (host capabilities). WS-C provides the provisioning/relay-cred diff; WS-B owns the broader host router surface.

**Explicitly NOT WS-C:** any `apps/web` / `apps/desktop` UI (host picker, Add-Host dialog), the host-service capability routers (`router/terminal|filesystem|git|...`) — those are WS-B; cross-host agent-state Turso sync is WS-D.

---

## 5. Dependencies + suggested wave

- **C1, C2, C3 (P0):** no cross-workstream dependency. Pure relay/electric-proxy/shared. Ship first.
- **C4, C5 (P1):** depend on the schema workstream exposing `sandbox_images` reads (already present) and **coordinate with WS-B** on the host-service auth/bootstrap-token provider and on `v2-host` router ownership. C5's "host becomes reachable" is validated by WS-B's capability surface.
- **C6 (P1):** owns `tunnel-protocol.ts` streaming additions; **WS-B coordinates** on which host endpoints stream (downloads/SSE). Land protocol → relay → host in that order.
- **C7 (P2):** standalone.
- **C8 (P2):** depends on C5 (resolver) + WS-B host picker UI to expose the toggle.
- **WS-D coordination:** cross-host agent-state Turso sync runs at the host-service layer and will rely on hosts being reachable/online (C5). WS-C must keep the `is_online`/directory truthfulness contract stable; share the directory schema (`directory.ts`) read-only with WS-D.

**Wave assignment:** C1–C3 = **P0**; C4–C6 = **P1**; C7–C8 = **P2**.

---

## 6. Target PR

- **Branch:** `ws-c/relay-remote-hosts-productization`
- **PR title:** `WS-C: productize relay + remote hosts (shared JWT, declarative electric scoping, sandbox_images provisioning, unified managed-host reachability, streaming + operability)`
- Sub-PRs per wave recommended: `ws-c/p0-auth-dedup-electric-scoping`, `ws-c/p1-sandbox-provisioning-streaming`, `ws-c/p2-relay-observability`.

---

### Decision updates (resolved forks — see `DECISIONS.md`)

- **D7 (technical) — bootstrap-token is DESIGNED, not open.** C5's bootstrap token (presented by a
  provisioned host to the relay so it can dial in) is a **short-lived signed JWT minted by `apps/api`,
  reusing the existing better-auth JWKS / jwt plugin**, scoped to `{ hostId, userId, exp }`. No new token
  infrastructure: the relay verifies it on `/tunnel` registration with the SAME `verifyRoxJwt` /
  `packages/shared/src/jwt-verify.ts` path (C1) it already uses for every Rox JWT — no second verifier.
  Concrete C5 changes: `v2-host.ts:provision` mints this JWT (better-auth jwt plugin) and injects it as the
  host-service's `RELAY_URL`/`ORGANIZATION_ID`/bootstrap-auth env so the container auto-dials on boot
  (`serve.ts:110-119`); TTL is minutes (boot + dial window). This resolves the former "C5 bootstrap-token
  named but undesigned" flag (§7b, residual #3) and the §1.4 #1 / §4 coordination-with-WS-B item.
- **D1 (owner) — sandbox auto-provision when the desktop is OFFLINE.** The sandbox provision path
  (`v2Host.provision({kind:"sandbox",…})`, C4/C5) must be invocable as an **automatic** fallback, not only
  from an explicit "New sandbox" action: when WS-B's continue-on-web path finds the user's desktop host
  offline, it auto-provisions a sandbox **with no confirmation prompt**. WS-C keeps the provision procedure
  callable from that automatic trigger and ensures the **balance/credits check (WS-E) runs before
  provisioning** — the only gate. No new transport: the provisioned host becomes reachable through the SAME
  relay tunnel (per §2.1), so auto-provision adds no public attack surface.

---

### 7. Hardening review

Read-only verification pass (2026-06-20). Spot-checked every load-bearing `file:line` against the actual code. **Headline: the spec is unusually accurate** — the relay end-to-end flow, fly-replay, electric-proxy gatekeeper, sandbox/provisioner model, and the "managed hosts persist `host:port` but no client dials it" convergence gap all hold up against source. Corrections below are mostly precision nits, plus two real cross-spec inconsistencies and one source-comment trap the spec navigated correctly.

#### (a) Factual corrections (file:line)

1. **§54 / §1.2 — "`v2_hosts.name` still written on every `ensure`" is overstated.** `host.ts:65-91` `ensure` does `.insert({...name...}).onConflictDoNothing({target:[organizationId, machineId]})` (`host.ts:80-90`). Name is written only on the **first** insert; subsequent `ensure` calls hit the conflict target and write nothing. The Phase-6 "UUID-as-name leak" concern is still real (no `name` *update* path, and whatever the host first registered sticks), but the phrasing "written on every ensure" is inaccurate — it's "written once and never corrected." Recommend rewording to "name is set on first register and never reconciled."

2. **§1.4 / §81 — the cited source comment contradicts the spec's (correct) conclusion; flag it so a reader doesn't "fix" the spec to match the comment.** The spec correctly says `host.checkAccess` requires a per-host `v2_users_hosts` row (verified: `host.ts:186-204`, `return { allowed: !!row }`). BUT the relay-side cache wrapper carries a stale, misleading comment: `access.ts:40` reads `"// #34.1: access is granted by org membership alone — no paid-plan gate."` That comment is about the *paid-plan* removal, not the membership model, and reads as if org membership suffices. It does not — the DB query at `host.ts:188-196` ANDs `userId`+`organizationId`+`hostId`. **The spec is right; the source comment is the liability.** Suggest WS-C also fix `access.ts:40`'s comment during C1.

3. **§1.5 — minor line-range drift, all within tolerance.** `provision` procedure begins `v2-host.ts:413` ✓ but the `provisioner.provision({...ttlMs: DEFAULT_SANDBOX_TTL_MS...})` call is ~`v2-host.ts:457-468` (spec said `461-464` — close). The destroy/rollback is ~`v2-host.ts:528-533` ✓. Confirmed the `provision` **input schema has no `projectId`** (`v2-host.ts:415-431`: name/kind/provider/region/ttlMs/providerApiKey only), which *validates* C4's task to add it.

4. **§1.4 #1 — duplicate `verifyJWT` confirmed, and the drift is already live.** `apps/relay/src/auth.ts:18-51` and `apps/electric-proxy/src/auth.ts:23-44` are near-identical, BUT they have **already diverged**: relay's catch block suppresses `ERR_JWT_EXPIRED` and logs terse messages (`auth.ts:38-49`); electric-proxy's catch is a bare `catch {}` with no logging (`auth.ts:42-44`). Also relay exports only `AuthContext`; electric-proxy's `auth.ts` additionally exports `WhereClause` (`auth.ts:9-12`). So C1's "extract shared" is not hypothetical hardening — the implementations have measurably drifted. Strengthen C1's test to assert the unified expiry-logging behavior.

5. **§1.2 — uncited backpressure mechanism exists (not an error, an omission worth absorbing).** `tunnel.ts:18` defines `MAX_PENDING_REQUESTS_PER_TUNNEL = 1_000` and `sendHttpRequest` rejects with "Host overloaded" at `tunnel.ts:379-381`. The "Maturity" paragraph lists race-handling but omits this per-tunnel queue cap — relevant to C6 (streaming) since long-lived streaming requests would occupy pending slots differently; C6 should account for it.

6. **§1.1 line-precision nits (all verified, all within ±3 lines):** ping const `tunnel.ts:12` (spec said 12-13 ✓); request-timeout default is on the **constructor** `tunnel.ts:61-62` (`requestTimeoutMs = 30_000`), not a standalone const — spec's `tunnel.ts:61` citation lands correctly; `http:response` match `tunnel.ts:444-450` ✓; pong→heartbeat `tunnel.ts:441-443` ✓; drain `{type:"drain"}`+code 4001 `tunnel.ts:195,222,240` ✓; host `await response.text()` `tunnel-client.ts:252` ✓; PSK inject `tunnel-client.ts:247` ✓; 75s watchdog `tunnel-client.ts:15` ✓. fly.toml (`21-27`), deploy.sh 6-region (`5-16`), schema `sandbox_images` (`730-756`) all verified exact.

#### (b) Brief questions not fully answered

- **Windows-specific behavior (the brief asked explicitly "if I turn a *Windows* device into a remote host").** §1.3 answers the capability surface generically (terminals/files/git/ports) but never addresses Windows specifics: the host fetches `http://127.0.0.1:<localPort>` and shells via pty-daemon — does the pty-daemon/terminal router behave on Windows (ConPTY vs node-pty), and do `router/filesystem` path semantics (drive letters, separators) hold? Not verified here; flag as an open question for WS-B (capability owner), since "what can I do on the Windows box" depends on host-service portability, not the relay.
- **"At what depth/scope … browser" — partially answered.** §1.3 correctly says "no raw browser/RDP/screen; browser = forwarded dev-server ports + agent browser tools." But it doesn't confirm whether `router/ports` actually tunnels arbitrary forwarded ports through the relay or only advertises them — the WS path supports it in principle (`ws:open` to any local path) but no port-forward router code was cited/verified.
- **Operate fly-replay — runbook depth.** §1.2 covers topology/deploy/drain well, but the brief's "how to operate/use it" has no failure-runbook: what an operator does when Redis (Upstash) is down (directory lookups fail → `maybeReplay` returns null → cross-machine hosts appear 503 even though a tunnel exists on another machine). The code degrades to "same-machine only" silently; that operational consequence isn't stated.
- **Bootstrap-token mechanism (C5) is named but undesigned.** "Add a short-lived bootstrap token mechanism (coordinate with WS-B)" — no token issuer, TTL, audience, or revocation shape is specified. This is the single biggest under-specified security-relevant task and should not ship without a design.

#### (c) Merge-safety check (file-ownership overlap vs WS-A…WS-O)

Method: grepped every sibling spec's ownership section for WS-C's claimed paths (`apps/relay/**`, `apps/electric-proxy/**`, `packages/host-provisioner/**`, `packages/host-service/src/tunnel/**`, new `packages/shared/src/jwt-verify.ts`, `tunnel-protocol.ts`, `apps/electric-proxy/src/table-scopes.ts`, `apps/relay/src/admin.ts`).

**Clean (no overlap):**
- `apps/relay/**` — WS-B (§222) and WS-L (§179) both explicitly mark it **read-only → WS-C**. Sole owner confirmed.
- `apps/electric-proxy/**` — **no sibling references it at all.** WS-C is uncontested sole owner.
- `packages/host-provisioner/**` — no sibling claims it. Uncontested.
- `packages/shared/src/jwt-verify.ts` — only WS-C references it. WS-B owns the disjoint `packages/shared/src/host-client/**`. No collision.
- `packages/shared/src/tunnel-protocol.ts` — WS-B references it but **explicitly attributes ownership to WS-C** (WS-B §301: "WS-C owns `packages/shared/src/tunnel-protocol.ts`"). WS-C §213 already lists it as a coordinated shared file. Acknowledged, not a conflict.

**Overlaps / inconsistencies to resolve (flagged):**
1. **`packages/host-service/src/tunnel/**` — labeling conflict, not a real edit conflict.** WS-C §204 claims this dir exclusively. WS-B §223 routes "`packages/host-service/**` → WS-D" (over-broad). WS-D's actual ownership (§228-231) is ONLY `packages/host-service/src/{runtime,trpc/router}/agent-state/**` — it does **not** claim `src/tunnel/**`. So no two workstreams will edit the same tunnel files, but WS-B's routing note is wrong and could mislead. **Action: WS-B should correct §223 to "`packages/host-service/src/tunnel/**` → WS-C; agent-state subdirs → WS-D."**
2. **`packages/host-service/src/app.ts` — undeclared shared-edit point for WS-C.** WS-D §234 names `app.ts` as "Touched by WS-B/WS-C too → integrate last." If WS-C's C5 (provisioned-host dial) or C6 (streaming) needs to register anything in `app.ts`, WS-C's ownership section (§4) **does not mention `app.ts`** and should add it as a coordinated append-only touch point, or confirm tunnel wiring stays entirely within `src/tunnel/**`.
3. **`runtime_services` / `turso` enum schema ownership — cross-spec contradiction.** WS-D §239 asserts these are "owned by WS-C." WS-C never claims any schema (correctly defers all `schema/**` to the DB owner, §215), and the brief + WS-O (§3, §140) establish **WS-O owns `schema/**` except `economy.ts`=WS-E**. So WS-D is mis-attributing schema ownership to WS-C. **Action: WS-D should re-point `runtime_services`/`turso` to WS-O.** (No edit conflict for WS-C since WS-C touches no schema; pure documentation drift.)
4. **`v2_hosts.last_connected_at` add (hardening Phase 6) is unrouted.** WS-C §215 says any column add "must be requested from the schema owner," but WS-O's created-file list (§140) does not include a `v2_hosts` modification. The request exists in prose but isn't reflected in WS-O's plan — confirm before C-work assumes the column.

**Net merge-overlap verdict: no two workstreams will write the same file.** All friction is documentation drift (WS-B/WS-D mislabels) plus one undeclared coordinated touch point (`app.ts`).

#### (d) Confidence per major claim

| Major claim | Confidence | Basis |
|---|---|---|
| Relay = host↔client tunnel proxy; HTTP/WS flow end-to-end (§1.1) | **High** | Every cited line verified in `index.ts`, `tunnel.ts`, `tunnel-client.ts` |
| fly-replay sticky routing + scale-out + drain (§1.2) | **High** | `index.ts:114-143`, `directory.ts`, `fly.toml`, `deploy.sh` all confirmed; multi-region inconsistency vs hardening plan is real |
| Streaming NOT implemented (both sides buffer) (§1.2/§1.3) | **High** | `index.ts:282` `c.req.text()` + `tunnel-client.ts:252` `response.text()` confirmed |
| Windows remote-host capability surface (§1.3) | **Medium** | Router surface exists; Windows-specific portability (ConPTY, paths) UNVERIFIED — depends on WS-B |
| Multi-tenant authz: per-host `v2_users_hosts` row required (§1.4) | **High** | `host.ts:186-204` `allowed: !!row` confirmed (despite misleading `access.ts:40` comment) |
| electric-proxy gatekeeper: where-rewrite, strip auth, cache isolation (§1.4) | **High** | `index.ts:72-103`, `where.ts:68-221`, `electric.ts:7-50` all confirmed |
| `verifyJWT` duplicated AND drifted across relay/electric-proxy (§1.4 #1) | **High** | Confirmed divergence (expiry logging) — stronger than spec implied |
| Sandbox model + provisioner contract; `sandbox_images` modeled-not-threaded (§1.5) | **High** | `types.ts:22-31` (no image/setupCommands), `schema.ts:730-756`, `factory.ts:48-72` confirmed |
| Convergence gap: managed hosts persist `host:port` but no client dials it (§1.5) | **High** | `tunnel.ts:377` "Host not connected" + `index.ts:172-178` 503 path confirmed |
| `cacheEverything:true` + `Vary:Authorization` tenant-isolation risk (§1.4 #6) | **Medium-High** | Code confirmed (`index.ts:33,107`); the *risk* assessment is sound but unproven without the proposed test |
| C5 bootstrap-token mechanism (target design) | **Low** | Named but undesigned; cannot verify a non-existent mechanism |

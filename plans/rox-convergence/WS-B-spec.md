# WS-B: Web↔Desktop Convergence (Hybrid Host) — Spec

> Central initiative. Unify web/mobile/desktop on ONE host-client abstraction that can attach to EITHER the user's running desktop host (via `apps/relay`) OR a cloud sandbox host (`v2_hosts` remote provider + `sandbox_images`). UNIFY everything, delete nothing.

---

## 1. Findings (evidence-grounded)

### 1.1 How the web app gets terminals/git/panes/chat — and what already exists

**Surprise finding: the hybrid host plumbing is ~70% built.** The web app already reaches a real host through the relay, today, outside the `(agents)` group:

- `apps/web/src/trpc/host-client.ts:34-68` — `hostCall()` does **browser → relay → host-service** tRPC over HTTP: `${getRelayUrl()}/hosts/${routingKey}/trpc/${procedure}`, Bearer JWT, SuperJSON. This is "the same path the desktop uses" (file comment, lines 5-9). Already implements `terminal.listSessions`, `terminal.createSession`, `settings.agentConfigs.list` (`host-client.ts:70-103`).
- `apps/web/src/trpc/relay-url.ts:12-19` — `getRelayUrl()` resolves relay base from PostHog `RELAY_URL_OVERRIDE` flag payload → `env.NEXT_PUBLIC_RELAY_URL`. Mirrors desktop's `useRelayUrl`.
- `apps/web/src/app/workspaces/[workspaceId]/page.tsx` — a **working** web terminal screen: resolves org → `v2Workspace.getFromHost` → `buildHostRoutingKey(org.id, workspace.hostId)` (line 87) → lists/creates host terminals, runs agent presets, renders `<WebTerminal routingKey=…>`. Git/diff/chat panes are NOT yet wired here.
- `apps/web/src/app/workspaces/[workspaceId]/components/WebTerminal/TerminalConnection.ts` — the browser-side WS terminal client (PTY stream over relay WS).

**The relay** (`apps/relay/src/index.ts`) is a Fly-hosted Hono proxy:
- Host registers a tunnel WS at `/tunnel?hostId=…&token=…` (`index.ts:194-250`); `TunnelManager` multiplexes.
- Clients call `/hosts/:hostId/trpc/*` (HTTP, `index.ts:277-305`) and `/hosts/:hostId/*` (WS, `index.ts:307-337`), proxied through the tunnel.
- Cross-region routing via Upstash directory + `fly-replay` (`index.ts:114-143`).
- Auth: `verifyJWT` + `checkHostAccess(auth, token, hostId)` (`index.ts:151-190`) → calls back to API `host.checkAccess`.

**The host catalog** (`packages/db/src/schema/schema.ts:543-578`, `v2Hosts`) ALREADY models the hybrid:
- `kind: v2HostKind` = `["local","remote","sandbox"]` (`enums.ts:57`), default `"local"`.
- `provider: v2HostProvider` = `["daytona","modal","e2b","self"]` (`enums.ts:61-66`).
- `port`/`protocol` populated for remote hosts; `expiresAt` for ephemeral sandboxes (TTL ~1h, see `scheduleSandboxExpiry.ts`).
- `sandbox_images` table (`schema.ts:730-755`) — per-project prebuilt sandbox image, unique per project.
- `host.ts` router (`packages/trpc/src/router/host/host.ts`) exposes `list/ensure/ensureClient/checkAccess/setOnline` — `setOnline` already accepts `port`/`protocol` "reported by the relay for remote tunnels" (lines 211-213).

**Gap / maturity honesty:** the remote/sandbox *provisioning* path (Daytona/Modal/E2B spin-up that writes a `kind:"remote"|"sandbox"` row + connects a tunnel) is **declared in schema but not implemented** in the read-only surface I traced — `host.ts` only mints `kind:"local"` rows via `ensure`. There is no `host.provisionSandbox` mutation. The desktop is currently the only thing that registers a `local` host and opens a relay tunnel (`HostServiceCoordinator` + `getRelayUrl` gating in `host-service-coordinator.ts:512-517`, exposed only when `settings.exposeHostServiceViaRelay` is true). So **"attach to user's running desktop"** is feasible NOW; **"cloud sandbox host"** needs a provisioner (coordinate with WS-D).

**Conclusion:** Web gains terminals/git/panes/chat/local-db/Electric NOT by reimplementing them, but by (a) generalizing `host-client.ts` into a typed unified host-client used by all surfaces, and (b) pointing the `(agents)` screens at a real `routingKey` instead of mock data.

### 1.2 The `(agents)` cabinet is 100% MOCK today

- `apps/web/src/app/(agents)/agents/workspace/[workspaceId]/page.tsx:23` reads `getMockWorkspaceById` / `getMockMessagesForSession` / `getMockDiffFilesForSession` from `../../../mock-data`. The detail page `notFound()`s for any non-mock id.
- `apps/web/src/app/(agents)/agents/data.ts` (`loadAgentsDashboardData`, `loadAgentsSessionDetail`) is the cabinet's data layer.
- So even with the flag ON, `/agents/workspace/*` shows fabricated sessions — it is a **UI prototype**, not wired to `v2Hosts`/relay. The REAL terminal lives at the un-grouped `/workspaces/[workspaceId]`.

This is the core convergence work: **bridge the `(agents)` cabinet UI to the real host-client used by `/workspaces`.**

### 1.3 The `WEB_AGENTS_UI_ACCESS` flag — exactly what it gates and why the 404

`getAgentsUiAccess` (`apps/web/src/app/(agents)/utils/getAgentsUiAccess/getAgentsUiAccess.ts:16-45`):
1. `auth.api.getSession()`; if no user → `redirect("/sign-in")`.
2. Evaluates PostHog flag `FEATURE_FLAGS.WEB_AGENTS_UI_ACCESS` (= `"web-agents-ui-access"`, `constants.ts:109`) against `session.user.id`.
3. Returns `{ hasAgentsUiAccess, session }`. On PostHog error it logs and defaults `false` (lines 34-39) — **a PostHog outage silently downgrades everyone to the no-access layout.**

8 consumers (`grep` count = 8 files in `(agents)`). Two distinct gating behaviors:

| Route | flag OFF | flag ON |
|---|---|---|
| `(agents)/layout.tsx:12-47` | renders **legacy chrome** (`Header` + `SidebarNav` + `Footer` from `(dashboard-legacy)`), wrapping children | renders bare full-height shell `<div>{children}</div>` |
| `agents/page.tsx:6-18` | shows `AgentsCabinet` only (no `AgentsHeader`) | shows `AgentsHeader` + `AgentsCabinet` |
| `agents/pipelines/page.tsx:11-18` | `PipelinesIndex` only | `AgentsHeader` + `PipelinesIndex` |
| `agents/sessions/[sessionId]/page.tsx:13-26` | `SessionDetailDashboard` only | `AgentsHeader` + dashboard |
| **`agents/workspace/[workspaceId]/page.tsx:16-20`** | **`redirect("/")`** | renders `SessionPageContent` (mock) |
| `agents/pipelines/[pipelineId]/page.tsx:17` | (gated, same pattern) | editor |

**Why the user gets a 404 / sees only some screens:** This is a **mixed gate**, not a clean on/off:
- Index-style pages (`/agents`, `/agents/pipelines`, `/agents/sessions/:id`) **always render** regardless of the flag — the flag only toggles whether the `AgentsHeader` nav bar is shown vs. the legacy dashboard chrome. That's why the user sees the **cabinet, sessions, integrations** (motivational/quote-style cards in `AgentsCabinet.tsx`) even without access.
- The **Workspace** detail route is the ONLY one that hard-`redirect("/")` when the flag is OFF. A user without the flag who clicks into a workspace is bounced — perceived as "Workspaces don't exist / 404-like."
- `AgentsHeader` nav only lists **`Агенты` (/agents)** and **`Интеграции` (/integrations)** (`AgentsHeader.tsx:27-30`). There are **no nav links to Workspaces or Pipelines** — so even with the flag ON, Pipelines/Workspaces are reachable only by deep-link, which is why they feel hidden. Pipelines pages exist and are gated; Workspaces is reachable but its detail redirects when OFF.

So the "404 / only some screens" symptom = (a) Workspace detail redirect-when-OFF + (b) missing nav entries, not a true 404.

### 1.4 How the agents cabinet works & why it's hidden from the main app

- The cabinet (`AgentsCabinet.tsx`) is a per-user dashboard: sessions count, token spend, trace-logs (`"показываются только для текущего пользователя в активной организации"`, lines 41-44). Backed by `loadAgentsDashboardData` (`agents/data.ts`).
- It is hidden because: (1) it lives in a **separate route group** `(agents)` with its own layout (not in `(dashboard-legacy)` nav), (2) it is **PostHog-gated** to an internal cohort, (3) sub-features are **mock-only** and use a deliberately reduced nav (`AgentsHeader` omits Workspaces/Pipelines). It is an experimental "mobile-first agents UI" (flag doc-comment, `constants.ts:108`) being incubated parallel to the legacy dashboard.

### 1.5 The desktop deep-link handshake (step by step)

Scheme: `PROTOCOL_SCHEME` = `rox-dev` in workspace/dev, else `rox` (`apps/desktop/src/shared/constants.ts:20-22`, from `PROTOCOL_SCHEMES` in `@rox/shared/constants:8-11`). Registered with the OS at startup (`apps/desktop/src/main/index.ts:76-84`, `app.setAsDefaultProtocolClient`).

**Sign-in handshake (desktop → web → desktop):**
1. Desktop renderer calls `auth.signIn({provider})` tRPC (`apps/desktop/src/lib/trpc/routers/auth/index.ts:74-109`).
2. Main mints `state` (32 random bytes), stores it in `stateStore` with TTL (lines 78-85), opens the system browser to `${NEXT_PUBLIC_API_URL}/api/auth/desktop/connect?provider=&state=&protocol=${PROTOCOL_SCHEME}` (lines 87-100). On **Linux** it also adds `local_callback=http://127.0.0.1:${DESKTOP_NOTIFICATIONS_PORT}/auth/callback` because deep links are unreliable there (lines 94-98).
3. `/api/auth/desktop/connect` (API route — **not present under `apps/web/src/app/api/auth`; lives in `apps/api`/auth package**, see §gap) runs OAuth, then redirects the browser to `apps/web/src/app/auth/desktop/success/page.tsx` carrying `desktop_state`, `desktop_protocol`, `desktop_local_callback`.
4. The success page (`auth/desktop/success/page.tsx`):
   - Validates `desktop_protocol` against `/^rox(-[a-z0-9]+)?$/` (lines 27-29) — rejects `https:`/`javascript:` to stop token exfiltration.
   - Requires `state`; gets the now-authenticated web session (lines 44-68).
   - **Mints an independent desktop session token** (`crypto.randomBytes(32)`), inserts a `sessions` row (30-day expiry, `activeOrganizationId` carried) (lines 78-91). Web and desktop intentionally hold **separate sessions**.
   - Builds the deep link: `${desktop_protocol}://auth/callback?token=…&expiresAt=…&state=…` (line 92).
   - Re-validates `desktop_local_callback` via `parseDesktopLoopbackCallback` (`@rox/shared/desktop-callback`) — allow-list of loopback origins (lines 99-102) to prevent token exfiltration to an attacker host.
5. `DesktopRedirect` client component (`.../DesktopRedirect/DesktopRedirect.tsx:14-23`): prefers full-page navigate to `localCallbackUrl` (loopback, not mixed-content-blocked), else `window.location.href = url` (the `rox://` deep link).
6. OS hands the deep link back to Electron: macOS via `app.on("open-url")` (`main/index.ts:216-223`, queued if pre-ready); Windows/Linux via `second-instance` argv (`main/index.ts:391`, `findDeepLinkInArgv`).
7. `processDeepLink` (`main/index.ts:86-118`): `parseAuthDeepLink` → `handleAuthCallback` validates `state` against `stateStore`, persists the token (`auth-functions.ts`, `parsed.protocol` check at line 84), focuses the window. Non-auth `rox://…` links are sanitized to an internal path and sent to the renderer (`deep-link-navigate`).

**Reverse direction (web/marketing → open desktop):** `rox://tasks/<slug>` etc. → `processDeepLink` collapses to `/tasks/<slug>` and navigates the renderer (lines 100-117). This is the seam WS-B reuses for **"continue on desktop"** (open a workspace by deep link).

### 1.6 Start on desktop, continue on web/mobile — feasibility

**Feasible at P0 for read-through + terminal attach; P1 for full panes.** The hard parts already exist: relay tunnel, host-client, `v2Hosts` catalog, deep-link both directions, separate web session. What's missing is (a) one unified host-client abstraction, (b) the `(agents)` UI bound to real hosts, (c) a host/workspace picker that lists `local` (your desktop) + `remote`/`sandbox` hosts, (d) the sandbox provisioner (WS-D). Difficulty: **Medium** for attach-to-desktop, **Medium-High** for sandbox (provisioner + image build), **Low** for the flag/nav cleanup that unblocks the 404.

---

## 2. Target design

### 2.1 Unified host-client abstraction (shared core)

Promote the web's ad-hoc `host-client.ts` into a **transport-agnostic `HostClient`** in `packages/shared` (or a new `packages/host-client`), consumed by web, mobile, and desktop renderer. One interface, three transports:

```
                 ┌──────────────────────────────────────────────┐
                 │              HostClient (shared core)          │
                 │  terminal.* | git.* | filesystem.* | chat.*    │
                 │  workspace.* | agentConfigs.*  (typed boundary)│
                 └───────────────┬───────────────┬───────────────┘
        transport: "relay"       │               │  transport: "ipc"
        (web, mobile, desktop→remote)            │  (desktop→own local host)
                 │                               │
   ┌─────────────▼──────────────┐   ┌────────────▼─────────────┐
   │ RelayTransport             │   │ IpcTransport             │
   │ fetch/WS → relay /hosts/.. │   │ trpc-electron → main →   │
   │ (host-client.ts today)     │   │ HostServiceCoordinator   │
   └─────────────┬──────────────┘   └────────────┬─────────────┘
                 │   relay (Fly, Hono)            │ 127.0.0.1:port
                 ▼                                ▼
        ┌────────────────────────────────────────────────┐
        │ host-service (per-org child): PTYs, git, chat,   │
        │ filesystem, agent runtime, host.db (SQLite)      │
        └────────────────────────────────────────────────┘
```

Key idea: a `HostTarget = { routingKey, transport: "relay" | "ipc", kind: "local"|"remote"|"sandbox" }`. The UI never branches on transport — it asks `HostClient` for `terminal.createSession(...)`. Desktop's own host uses `ipc` (zero relay hop); web/mobile and desktop-attaching-to-another-machine use `relay`.

### 2.2 Data-flow: attach from web to running desktop

```
Browser (web)                API (tRPC)            Relay (Fly)         Desktop host-service
  │ host.list(org) ───────────►│                                              
  │◄── [{kind:local, online}] ─│                                              
  │ pick host → routingKey                                                    
  │ HostClient(relay).terminal.createSession ─────────►│ /hosts/:key/trpc ──►│ spawn PTY
  │◄────────────── terminalId ─────────────────────────│◄────────────────────│
  │ WS /hosts/:key/terminal.stream ───────────────────►│ tunnel WS ─────────►│ PTY bytes
  │◄═══════════════ live PTY frames ═══════════════════│◄════════════════════│
```

### 2.3 Sequence: "continue on mobile" without closing the computer

```
Desktop: working in workspace W on host H (local, exposeViaRelay=true)
   │ host.setOnline(H, port, protocol)  ── relay knows H is reachable
   ▼
User opens phone → app.rox.one/agents
   │ getAgentsUiAccess() → flag ON
   │ host.list(org) → [H(local,online), …]      ← NEW: cabinet lists real hosts
   │ tap H → /agents/workspace/W?host=H
   │ HostClient(relay, routingKey=key(org,H)).terminal.listSessions
   ▼
Phone shows the SAME live terminals/diff/chat as the desktop, via relay.
Desktop stays running; both clients are independent sessions on the same host.
```

### 2.4 Flag/gate redesign (kills the 404)

Replace the **mixed** gate with a single consistent rule + real nav:
- `getAgentsUiAccess` stays the access source of truth, but: (a) make Workspace detail **not hard-redirect** — instead render an "ask for access" state when OFF (consistent with the other pages), OR gate the whole `(agents)` group at `layout.tsx` with one redirect. Pick layout-level gating so behavior is uniform.
- Add **Workspaces** and **Pipelines** to `AgentsHeader` `navItems` so flag-ON users can actually navigate.
- Treat a PostHog failure as **deny with a visible banner**, not silent false.

---

## 3. Phase-2 implementation tasks (TDD, exact paths)

> WS-B owns the **web `(agents)` surface, web host-client, web proxy/flag gating, and the shared HostClient type contract**. It coordinates (does not own) relay (WS-C), host-service (WS-D), desktop screens (WS-A).

**T1 — Extract unified `HostClient` contract (shared core).**
- Create `packages/shared/src/host-client/types.ts` (interfaces: `HostTarget`, `HostTransport`, `HostTerminalSession`, `HostAgentConfig`, method signatures for `terminal/git/filesystem/chat/workspace/agentConfigs`). Move the existing interfaces out of `apps/web/src/trpc/host-client.ts:11-28`.
- Create `packages/shared/src/host-client/index.ts` barrel.
- Test: `packages/shared/src/host-client/types.test.ts` — type-level + a `satisfies` round-trip asserting the web `RelayTransport` conforms.
- Behavior: pure types + a `createHostClient(transport)` factory; no runtime change yet.

**T2 — Refactor web `host-client.ts` to a `RelayTransport` implementing the contract.**
- Modify `apps/web/src/trpc/host-client.ts` to implement `HostClient` over `RelayTransport` (keep `hostCall` internals at lines 34-68). Add `git.*` and `filesystem.*` hand-typed methods mirroring host-service `terminal.*`.
- Test: `apps/web/src/trpc/host-client.test.ts` — mock `fetch`, assert URL shape `…/hosts/:key/trpc/git.status` + SuperJSON encode/decode.

**T3 — Real host/workspace listing in the cabinet (remove mock dependency for the live path).**
- Modify `apps/web/src/app/(agents)/agents/data.ts` `loadAgentsDashboardData` to call `host.list` (`packages/trpc/src/router/host/host.ts:15`) + `v2Workspace.getFromHost`, falling back to mock ONLY when no real hosts exist (keep mock module, do not delete).
- Test: `apps/web/src/app/(agents)/agents/data.test.ts` — given hosts present, returns real rows; given none, returns mock.

**T4 — Bind Workspace detail to a real host (replace mock branch).**
- Modify `apps/web/src/app/(agents)/agents/workspace/[workspaceId]/page.tsx`: when a real `host`/`routingKey` resolves (via `host` query param + `host.checkAccess`), render a live `SessionPageContent`; otherwise fall back to existing mock. Remove the unconditional `redirect("/")` (lines 18-20) in favor of the uniform gate (T6).
- Test: `…/workspace/[workspaceId]/page.test.tsx` — real host → live; unknown → notFound; flag OFF → access state (not redirect).

**T5 — Wire live terminals/diff into the cabinet SessionPageContent.**
- Modify `apps/web/src/app/(agents)/agents/workspace/[workspaceId]/components/SessionPageContent` (+ `SessionDiff`, `SessionChat`) to accept a `HostClient` + `routingKey` and stream from the host (reuse `WebTerminal` from `apps/web/src/app/workspaces/[workspaceId]/components/WebTerminal`).
- Test: component test mocking `HostClient.terminal.stream` asserts frames render; `git.status` populates `SessionDiff`.

**T6 — Uniform `(agents)` gating + nav (the 404 fix).**
- Modify `apps/web/src/app/(agents)/layout.tsx` to do ONE access decision; render a single "request access" view when OFF instead of per-page divergence.
- Modify `apps/web/src/app/(agents)/components/AgentsHeader/AgentsHeader.tsx:27-30` to add `{label:"Рабочие области",href:"/agents/workspaces"}` and `{label:"Пайплайны",href:"/agents/pipelines"}`.
- Modify `getAgentsUiAccess` (`…/utils/getAgentsUiAccess/getAgentsUiAccess.ts:34-39`) to surface a "flag unavailable" signal rather than silent `false`.
- Test: `getAgentsUiAccess.test.ts` — PostHog throw → returns `{hasAgentsUiAccess:false, degraded:true}`; nav test asserts 4 links when ON.

**T7 — Public-route allow-list for `(agents)` deep-link continuation.**
- Modify `apps/web/src/proxy.ts:5-21` only if a public `/agents` deep-link entry is needed (e.g. `?host=`); keep auth required (the cabinet is user-scoped). Likely **no change** — documented here so WS-C/WS-A know proxy is owned by WS-B.
- Test: `apps/web/src/proxy.test.ts` — `/agents` still bounces unauthenticated to `/sign-in`.

**T8 — "Continue on desktop" deep-link emit from web cabinet.**
- Add a `apps/web/src/app/(agents)/agents/workspace/[workspaceId]/components/OpenInDesktopButton` that builds `rox://agents/workspace/${id}?host=${routingKey}` (scheme from `PROTOCOL_SCHEMES`) — consumed by desktop `processDeepLink` (`main/index.ts:100-117`, WS-A wires the renderer route).
- Test: component test asserts correct `rox://` URL; e2e deferred.

---

## 4. File ownership (WS-B owns/modifies in Phase 2)

**Owns exclusively (safe to modify):**
- `apps/web/src/app/(agents)/**` (entire route group: layout, agents, pipelines, sessions, settings, components, utils, data.ts, mock-data)
- `apps/web/src/trpc/host-client.ts`
- `apps/web/src/trpc/relay-url.ts`
- `apps/web/src/trpc/auth-token.ts`
- `apps/web/src/proxy.ts`
- `apps/web/src/app/auth/desktop/**` (handshake web side)
- `packages/shared/src/host-client/**` (NEW dir — the unified contract)

**Reuses read-only (DO NOT modify — other workstreams own):**
- `apps/web/src/app/workspaces/**` (existing live terminal — reuse `WebTerminal`/`TerminalConnection`; if it must change, coordinate)
- `apps/relay/**` → WS-C
- `packages/host-service/**` → WS-D
- `packages/trpc/src/router/host/host.ts`, `…/v2-workspace/**`, `…/pipeline/**` → API/WS-D (WS-B may need a new `host.provisionSandbox` — request from WS-D, don't author here)
- `packages/db/src/schema/**` → DB owner
- `apps/desktop/**` → WS-A

**Shared-edit coordination point:** `packages/shared/src/host-client/types.ts` is the contract WS-A/WS-D build against — land T1 FIRST and freeze the interface before parallel work.

---

## 5. Dependencies + wave

- **Depends on / coordinates with:**
  - **WS-D (host-service)** — must expose `git.*`/`filesystem.*`/`chat.*` host procedures matching the T1 contract, and (P1) a sandbox provisioner (`host.provisionSandbox` writing `kind:"remote"|"sandbox"`).
  - **WS-C (relay)** — must proxy the new host procedures + WS channels unchanged (it is path-agnostic today, low risk).
  - **WS-A (desktop screens)** — port the `(agents)` cabinet into the renderer + add the `rox://agents/workspace/:id` deep-link route; consumes the same `HostClient` via `IpcTransport`.
- **Provides to others:** the frozen `HostClient` contract (T1) — gate for WS-A/WS-D parallel work.

**Suggested wave:**
- **P0:** T1 (contract), T2 (RelayTransport), T6 (flag/nav 404 fix) — unblocks everything, ships a visible win.
- **P1:** T3, T4, T5, T8 (cabinet bound to real local-host attach + continue-on-desktop). Requires WS-D host procedures.
- **P2:** sandbox-backed hosts in the cabinet (depends on WS-D provisioner + `sandbox_images` build) and Turso cross-host agent-state surfacing (WS-D-owned).

---

## 6. Target PR

- **Branch:** `feat/ws-b-hybrid-host-web-convergence`
- **PR title:** `feat(web): unify host-client + bind agents cabinet to real hosts (hybrid host P0/P1)`

---

### Decision updates (resolved forks — see `DECISIONS.md`)

- **D1 (owner) — auto cloud-provision when desktop is OFFLINE.** When the user is on web/mobile and their
  `local` desktop host is offline (or absent), WS-B's continue-on-web path **automatically provisions a
  cloud sandbox host and continues there — NO confirmation prompt.** Adjust the flow in §2.3 / T3 / T4: when
  `host.list(org)` shows no online host for the target workspace, the cabinet calls the sandbox provision
  path (WS-C `v2Host.provision({kind:"sandbox",…})`) automatically instead of rendering an "ask for a host"
  state. The ONLY gate is the prepaid balance check — call WS-E's balance/credits check before provisioning;
  on insufficient funds, show a top-up prompt (never a "want a sandbox?" dialog). The cabinet still lists
  real hosts when one is online (T3 unchanged).
- **D5 (technical) — WS-B owns the shared HostClient transport.** The unified `HostClient` **including its
  transport** is WS-B's: `packages/shared/src/host-client/**` (T1/T2) owns `HostTarget`, the contract, AND
  the `RelayTransport` (plus any RN-compatible transport adapter the mobile bundle needs). This resolves the
  former "mobile/RN transport authorship unassigned" flag (§7b, residual #1): **WS-G (mobile) only CONSUMES
  `HostClient`** from `@rox/shared` and authors no transport. WS-B's T2 scope therefore includes making the
  RelayTransport usable from the React Native bundle (fetch/WS abstraction at the package boundary), so
  mobile imports a working client with zero transport code of its own.
- **D6 (technical) — web read path resolved.** Web has **two** read planes (resolves §7b "local-db/Electric
  powers under-specified", residual #2): (a) **host-scoped live data** (terminals, git, filesystem, chat,
  the host's local-db views, cross-host agent-state) is read **THROUGH the attached host via the relay
  transport** — the host is the single source of truth; (b) **org/account-scoped durable data** keeps the
  **existing org-level ElectricSQL subscriptions via `apps/electric-proxy`** (unchanged). Web does NOT sync
  the host's `better-sqlite3` DB or its Turso replica through Electric — it reaches them through host
  procedures over the relay. Add a `db.*` / shape-proxy namespace to the `HostClient` contract (T1) for the
  host-side reads; leave the org Electric shapes alone.

---

## 7. Hardening review

> READ-ONLY verification pass. Spot-checked every cited file:line against the live tree (commit on branch `t/marketing-landing-publish-20260619`). The spec is unusually accurate — most claims hold. Corrections below are mostly off-by-one line drift and two path errors. No claim was found to be substantively false.

### (a) Factual corrections (file:line)

1. **§1.1 — coordinator path is WRONG.** Spec cites `HostServiceCoordinator` relay gating at `host-service-coordinator.ts:512-517`. The file is actually `apps/desktop/src/main/lib/host-service-coordinator.ts` (the `/lib/` segment is missing in the spec). The gating logic is real: `exposeViaRelay = row?.exposeHostServiceViaRelay ?? false` at **line 461**, `getRelayUrl()` import at line 28, and the `if (exposeViaRelay && effectiveRelayUrl)` check at **lines 512-513**. So the *line range* coincidentally lands right, but the *path* is wrong and the function name is `HostServiceCoordinator` in a file under `/lib/`. Note the relay URL resolution is `PostHog relay-url-override → env.RELAY_URL` (comment lines 508-511), which matches the web's `relay-url.ts` mirror claim.

2. **§1.1 — `v2HostProvider` line range off by one.** Spec cites `enums.ts:61-66`; actual is **`enums.ts:61-67`** (`["daytona","modal","e2b","self"]`, closing `] as const` on 67). The values list (including `"self"`) is correct. `v2HostKindValues = ["local","remote","sandbox"]` at `enums.ts:57` — exact match.

3. **§1.5 — `PROTOCOL_SCHEME` value description imprecise.** Spec says "`rox-dev` in workspace/dev, else `rox`". Actual (`apps/desktop/src/shared/constants.ts:20-22`): `PROTOCOL_SCHEME = workspace ? \`rox-${workspace}\` : PROTOCOL_SCHEMES.PROD`. The dev/workspace scheme is `rox-<workspaceName>` (interpolated), not literally `rox-dev`. `PROTOCOL_SCHEMES` lives in `@rox/shared/constants:8` (spec said 8-11 — the object opens at 8; fine). Functional claim is correct; the literal `rox-dev` is illustrative, not exact.

4. **§1.5 — success-page line refs drift by ~1.** Verified in `apps/web/src/app/auth/desktop/success/page.tsx`: protocol regex `/^rox(-[a-z0-9]+)?$/` at **line 27** (spec: 27-29 — it's a single-line `.test()`); `crypto.randomBytes(32)` at **line 79** (spec: "lines 78-91" for the session insert block — the insert is at line 83, expiry at 81; range is approximately right); 30-day expiry confirmed as `60 * 60 * 24 * 30 * 1000` at **line 81**; `parseDesktopLoopbackCallback` at **line 99** (spec: 99-102). All substantively correct.

5. **§1.5 — `/api/auth/desktop/connect` location claim is CORRECT and now pinned.** Spec hedged ("not present under `apps/web`...lives in `apps/api`/auth package"). Confirmed: the route is `apps/api/src/app/api/auth/desktop/connect/route.ts`. It is NOT in `apps/web`. Remove the hedge — it's `apps/api`.

6. **§1.3 — `getAgentsUiAccess` line range slightly off + mechanism nuance.** Actual `getAgentsUiAccess.ts`: `cache(async () => {...})` body spans **lines 16-45** (spec: 16-45 — exact). BUT the flag is evaluated server-side via **`posthog-node`'s `PostHog.getFeatureFlag(flag, session.user.id)`** (line 28-31), not `posthog-js`. The `catch` block that defaults `hasAgentsUiAccess` to `false` is at **lines 33-39** (spec said "lines 34-39" — off by one; the `catch` opens at 33). Claim "PostHog outage silently downgrades everyone" is CORRECT — `hasAgentsUiAccess` is initialized `false` (line 24) and only set inside `try`.

7. **§1.3 table — pipelines/sessions OFF-behavior verified, with a subtlety.** `agents/pipelines/page.tsx` and `sessions/[sessionId]/page.tsx` both render their content unconditionally and only gate `{hasAgentsUiAccess && <AgentsHeader />}` — VERIFIED (matches spec rows). `agents/page.tsx` same pattern — VERIFIED (lines render `AgentsCabinet` always, `AgentsHeader` only when ON). The Workspace detail `redirect("/")` when OFF is at **lines 17-19** of `workspace/[workspaceId]/page.tsx` (spec said 16-20/18-20 — the `if (!hasAgentsUiAccess) redirect("/")` is lines 17-19). Correct in substance.

8. **§1.3 — `AgentsHeader` navItems VERIFIED exactly.** `AgentsHeader.tsx` `navItems = [{Агенты,/agents},{Интеграции,/integrations}]` — no Workspaces/Pipelines links. Spec's "404 = redirect-when-OFF + missing nav" diagnosis is sound. (The const is near the top of the file, not at the cited `:27-30`, but the *content* is exactly as described.)

9. **§1.1 — `host.ts` `ensure` mints only `kind:"local"` — VERIFIED (by omission).** `ensure` (`packages/trpc/src/router/host/host.ts:65`) inserts `{organizationId, machineId, name, createdByUserId}` with NO `kind` field → relies on the schema default. `setOnline` comment "Reachable endpoint reported by the relay for remote tunnels" at **line 211**, `port`/`protocol` inputs at **lines 213-214** (spec: 211-213 — close). `list` at line 15, `checkAccess` at 179, `ensureClient` at 131 — all match.

10. **§1.1 / Gap — `host.provisionSandbox` does NOT exist — VERIFIED.** `grep -rn "provisionSandbox"` across `packages/trpc/` and `apps/web/` returns zero hits. The "schema models hybrid but provisioner unimplemented" gap is real and correctly attributed to WS-D. **Cross-check with WS-C §4:** WS-C claims it owns the provisioning/relay-cred diff for `v2-host.ts`/`host.ts`; this conflicts slightly with the spec routing the sandbox provisioner to WS-D. See (c) merge note.

11. **§1.1 relay refs VERIFIED.** `apps/relay/src/index.ts`: `/tunnel` handler at line 195+ (host registers, `TunnelManager.register` at 231), HTTP `/hosts/:hostId/trpc` middleware path-strip at 146-148, `fly-replay` cross-region at 114-143, `verifyJWT` at 160 + `checkHostAccess` at 180. Spec's line ranges (194-250, 277-305, 307-337, 114-143, 151-190) are in the right neighborhoods; exact handler line numbers drift but every cited mechanism exists. WS-C's spec gives tighter refs (e.g. JWT verify `index.ts:214-224`) — defer to WS-C for relay-internal line precision.

### (b) Brief questions not fully answered

- **local-db / Electric "powers" are asserted but never traced.** The brief explicitly asks how web gains **local-db** and **Electric** powers. §1 lists them in the conclusion but §2 design only covers terminal/git/filesystem/chat via the HostClient. There is NO concrete mechanism for surfacing the host's SQLite (`host.db`) or Electric live-sync to the web client. The diagram (§2.1) shows `host.db (SQLite)` inside host-service but no client-side path. **Gap:** define whether web reads local-db via a `db.*`/`query.*` HostClient namespace or via Electric shape subscriptions proxied through the relay. This is the weakest-specified part vs. the brief.
- **Mobile transport unspecified.** §2.1 says mobile uses `relay` transport, but mobile (Expo/React Native) cannot use browser `fetch`/`WS` identically, and WS-G owns `apps/mobile` and lists `packages/trpc` + `apps/web` as read-only. Who authors the RN-side `HostClient` binding? Not assigned. (WS-G's spec also does not claim it.)
- **Sandbox image build pipeline** (`sandbox_images`) is named (§1.1, P2) but the build trigger/ownership is hand-waved to "WS-D provisioner + image build" without a concrete task. Acceptable for P2 but flag it.
- **Continue-on-desktop reverse seam** (§1.5/§T8): the `rox://agents/workspace/:id?host=` route does not yet exist in the desktop renderer (WS-A must add it). The spec acknowledges this but provides no contract for what the desktop does with `?host=` (attach via IpcTransport to its own host vs. relay to a different machine). Under-specified.

### (c) Merge-safety / file-ownership overlap check

Checked WS-B's exclusively-owned list (§4) against all existing sibling specs. **Note: only WS-A through WS-K exist in `plans/rox-convergence/`; WS-L/M/N/O specs are NOT present in the tree.** The harness rule "schema owned by WS-O except economy.ts=WS-E" is therefore referenced by siblings (WS-E, WS-G, WS-J cite WS-O for `packages/db/src/schema/**`) but WS-O has no spec file yet.

WS-B owned paths and their overlap status:

| WS-B owned path | Overlap? | Evidence |
|---|---|---|
| `apps/web/src/app/(agents)/**` | **NONE** | No sibling claims write access. WS-G explicitly lists "all of `apps/web`" as **read-only reference only**. WS-J lists `apps/web/**` UI as "owned by web/desktop convergence workstreams" (= WS-B). Clean. |
| `apps/web/src/trpc/host-client.ts`, `relay-url.ts`, `auth-token.ts` | **NONE** | Unique to WS-B. |
| `apps/web/src/proxy.ts` | **NONE** | No sibling touches it. |
| `apps/web/src/app/auth/desktop/**` | **NONE** | No sibling touches the web handshake side. |
| `packages/shared/src/host-client/**` (NEW) | **NONE** | New dir; no sibling claims it. WS-C owns `packages/shared/src/tunnel-protocol.ts` (different file). No conflict. |

**Coordination (not overlap) points — flagged, not blocking:**
- **`packages/trpc/src/router/host/host.ts`** — WS-B §4 correctly lists this as **read-only / not owned** (defers to API/WS-D). But **WS-C §4 says "WS-B owns the broader host router surface"** while WS-C "provides the provisioning/relay-cred diff." This is an *inconsistency in attribution* between the two specs: WS-C thinks WS-B owns host.ts; WS-B thinks it does not. **Resolve before P1:** pick one owner for `host.ts` (recommend WS-D/API, since the new `host.provisionSandbox` and `setOnline` mutations are host-lifecycle, not web). Low risk because it is append-mostly, but assign it.
- **`packages/host-service/src/app.ts` + `router.ts`** — WS-D notes WS-B and WS-C both append here. WS-B §4 lists `packages/host-service/**` as read-only (WS-D). If WS-B needs new `git.*`/`filesystem.*` host procedures (T2/T5 require them), WS-B must *request* them from WS-D, not author them — which §5 already states. Consistent. No file-write overlap as long as WS-B does not author host-service procedures.
- **`economy.ts`** — WS-B touches NO schema and NO `economy.ts`. Rule N/A. No conflict.

**Verdict on merge-safety:** WS-B's exclusive paths are genuinely conflict-free against WS-A,C,D,E,F,G,H,I,J,K. The only real action item is reconciling the `host.ts` ownership disagreement with WS-C.

### (d) Confidence rating per major claim

| Claim | Confidence | Basis |
|---|---|---|
| Hybrid-host plumbing ~70% built; web reaches real host via relay today (§1.1) | **High** | Verified `host-client.ts`, `relay-url.ts`, relay `/hosts/:key/trpc`, `v2Hosts` schema, `host.ts` router all exist as described. |
| `(agents)` cabinet is 100% mock (§1.2) | **High** | `workspace/[workspaceId]/page.tsx` imports `getMockWorkspaceById`/`getMockMessagesForSession`/`getMockDiffFilesForSession` and `notFound()`s otherwise — directly verified. |
| Flag is a "mixed gate"; 404 = workspace redirect-when-OFF + missing nav (§1.3) | **High** | All 5 page files + `AgentsHeader` navItems + `getAgentsUiAccess` read and confirmed. |
| `getAgentsUiAccess` defaults `false` on PostHog error (§1.3) | **High** | Init `false` + try/catch with no fallback in catch — verified lines 24/33-39. |
| Deep-link handshake steps (§1.5) | **High** | success page, `processDeepLink`, `setAsDefaultProtocolClient`, `open-url`/`second-instance`/`findDeepLinkInArgv` all verified in `main/index.ts` + success page; minor line drift only. |
| `host.provisionSandbox` missing; sandbox provisioning unimplemented (§1.1 gap) | **High** | Zero grep hits; `ensure` mints local-only — verified. |
| Unified HostClient design is sound & feasible (§2) | **Medium** | Architecturally coherent and grounded in real transports, but the **local-db/Electric** path is unspecified (see (b)) and the IpcTransport for desktop is asserted, not yet traced to existing `trpc-electron` wiring. |
| "Start desktop → continue web/mobile" P0 feasibility = Medium difficulty (§1.6) | **Medium** | Attach-to-desktop building blocks verified; mobile transport authorship + local-db surfacing are unproven, so the P0 estimate is optimistic for the full "panes" experience (terminal-only attach is plausibly P0). |
| File-ownership conflict-free (§4) | **High** (paths) / **Medium** (host.ts) | Cross-checked all 10 sibling specs; only the WS-C ↔ WS-B `host.ts` attribution needs reconciliation. |

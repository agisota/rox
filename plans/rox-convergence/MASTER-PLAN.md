# Rox Convergence — Master Plan (HYBRID HOST MODEL)

> Synthesis of the 15 workstream specs (`WS-A`…`WS-O`) into one phased, merge-safe execution plan.
> Read each `plans/rox-convergence/WS-<ID>-spec.md` for the full Findings / Target design / Phase-2 tasks / Hardening review behind every row here.

## Goal

Unify **web + mobile + desktop** onto ONE host-client abstraction so a user can start work on their desktop and continue it on web or mobile — by attaching either to **their own running desktop host** (via `apps/relay`) **or** to a **cloud sandbox host** (`v2_hosts` managed provider). Web reaches parity with desktop; desktop gains the web agents-cabinet and flag-gated features. **Unify, delete nothing.** Alongside the host convergence, finish the prepaid Rox token economy (remove Stripe), expand admin, light up mobile, translate emails to RU, grow docs/SDK/CLI coverage, productize the relay + remote hosts, add MCP-v2 org collaboration, and add motion/collab/RTC + infra polish.

## Architecture (one-paragraph orientation)

Bun + Turbo monorepo. Backend = Next.js 16 `apps/api` exposing a tRPC `AppRouter` (`packages/trpc`) over `/api/trpc/<proc>` (SuperJSON) + better-auth. Durable state = Neon Postgres via Drizzle (`packages/db`), streamed to clients read-only through **ElectricSQL** (gated by the `apps/electric-proxy` Cloudflare Worker). Host-side work (PTYs, git, filesystem, agents, chat) runs in **`packages/host-service`** with its OWN `better-sqlite3` DB; clients reach a host either in-process (desktop → its own host) or through the **`apps/relay`** Fly tunnel (web/mobile → any host). The NEW cross-host coordination layer (`packages/agent-state`) uses **Turso/libSQL embedded replicas** — strictly additive, never touching better-sqlite3 or the Electric read-cache. UI is React + TailwindCSS v4 + shadcn/ui (`packages/ui`), with a shared motion language in `@rox/ui/motion`.

## Tech stack

Bun · Turborepo · Next.js 16 (`proxy.ts`, never `middleware.ts`) · React + Tailwind v4 + shadcn/ui · Drizzle + Neon Postgres · ElectricSQL · better-sqlite3 (host-service) · Turso/libSQL (new agent-state only) · tRPC + better-auth · Hono (relay) · Cloudflare Workers (electric-proxy) · Expo/React Native (mobile) · Electron (desktop) · Biome.

## Sub-skill note for executors

Each Phase-2 workstream runs in its OWN isolated git worktree (one PR per workstream). Executors must: implement strictly per `plans/rox-convergence/<ID>-spec.md` sections 3 (tasks) and 4 (ownership); follow TDD; modify ONLY files in their ownership list; run `bun run lint < /dev/null` (CI treats warnings as errors — stdin MUST be redirected or `rg` hangs), `bun run typecheck`, and the relevant `bun test`; commit; open the PR with the spec's branch + title via `gh`. Agents MAY run `bunx drizzle-kit generate` (offline) but MUST NEVER run `drizzle-kit migrate`/`push` (deploy step, owner-gated). Next.js 16: use `proxy.ts`, not `middleware.ts`.

---

## Locked decisions

1. **Web↔Desktop convergence = HYBRID HOST MODEL.** Web/mobile attach to the user's own running desktop host (via relay) OR a cloud sandbox host. Web reaches parity with desktop; desktop gains the web agents-cabinet + flag-gated features. Unify everything; delete nothing.
2. **Turso/libSQL only for NEW cross-host agent-state sync** at the host-service layer. Do NOT touch `better-sqlite3` (host-service machine truth) or the Electric read-cache (`@rox/local-db`).
3. **Execution = 2 phases.** Phase 1 = discovery (the 15 specs, already done). Phase 2 = parallel implementation, ONE isolated git worktree per workstream → ONE PR per workstream; strict file-ownership for clean merges.
4. **Full master plan, phased P0 → P1 → P2.**

Carve-outs that govern the whole plan:
- `packages/db/src/schema/**` is owned by **WS-O** — **except `economy.ts`** which is owned by **WS-E**.
- Any NEW table proposed by WS-F (feature-flag overrides) or WS-J (skill libraries, dashboards) is **authored in WS-O**; WS-F/WS-J only consume.

---

## Global target architecture — the HYBRID HOST model

The single idea: a transport-agnostic **`HostClient`** (`packages/shared/src/host-client/**`, WS-B) with one interface (`terminal.* / git.* / filesystem.* / chat.* / workspace.* / agentConfigs.*`) and three transports. The UI never branches on transport — desktop's own host uses an in-process IPC transport (zero relay hop); web/mobile and desktop-attaching-to-another-machine use the relay transport. `v2_hosts.kind ∈ {local, remote, sandbox}` is the discriminator; the relay is the universal entry. Managed remote/sandbox hosts become reachable by having their host-service **dial out to the relay on boot** (same path a local host uses), so there is exactly ONE proxy path and ONE auth model (WS-C decision).

### Data-flow (attach from web/mobile to a host)

```
 UI screens (web / mobile / desktop)
        │  asks HostClient.terminal.createSession(...)   (no transport branching)
        ▼
 ┌──────────────────────────── HostClient (packages/shared, WS-B) ───────────────────────────┐
 │  HostTarget { routingKey, transport: "relay"|"ipc", kind: "local"|"remote"|"sandbox" }     │
 └───────────────┬───────────────────────────────────────────────┬───────────────────────────┘
   transport=relay│ (web, mobile, desktop→other machine)          │ transport=ipc (desktop→own host)
                  ▼                                                ▼
        apps/relay (Fly, Hono tunnel, WS-C)                 trpc-electron → main →
        /hosts/:routingKey/trpc/*  (HTTP)                   HostServiceCoordinator
        /hosts/:routingKey/*       (WS)                            │ 127.0.0.1:port
        JWT + per-host v2_users_hosts access check                 │
        fly-replay sticky routing (Upstash directory)             │
                  │  host-service dialed the tunnel out            │
                  ▼                                                ▼
 ┌────────────────────────────────────────────────────────────────────────────────────────┐
 │ packages/host-service (per-org child): PTYs (pty-daemon), git, chat, filesystem,         │
 │ agent runtime, host.db (better-sqlite3)  ── WS-D  ── + agent-state (Turso libSQL replica)│
 └────────────────────────────────────────────────────────────────────────────────────────┘
   durable UI rows: Neon Postgres ── Electric shapes ──▶ electric-proxy (WS-C) ──▶ client read-cache
   cross-host coordination: agent_state_entries / host_presence / agent_run_coord ── Turso primary (WS-D)
```

### Sequence — "start on desktop, continue on mobile/web" (relay path)

```
Desktop: working in workspace W on host H (kind=local, exposeViaRelay=true)
   │ host.setOnline(H, port, protocol)            relay now knows H is reachable
   ▼
User opens phone/web → app.rox.one/agents
   │ getAgentsUiAccess() → flag ON (WS-B uniform gate)
   │ host.list(org) → [H(local, online), …]        ← cabinet lists REAL hosts (WS-B T3)
   │ pick H → /agents/workspace/W?host=key(org,H)
   │ HostClient(relay).terminal.listSessions ─────────────────►│ relay /hosts/:key/trpc ──►│ host-service
   │◄──────────────────── sessions ─────────────────────────────│◄──────────────────────────│
   │ WS /hosts/:key/terminal.stream ───────────────────────────►│ tunnel WS ───────────────►│ PTY bytes
   │◄═══════════════════ live PTY / diff / chat ════════════════│◄══════════════════════════│
   ▼
Phone/web shows the SAME live terminals/diff/chat as the desktop. Desktop stays running.
Both clients are independent sessions on the same host (separate web/desktop auth sessions).
"Continue on desktop" reverse seam: web emits rox://agents/workspace/W?host=key (WS-B T8) → desktop processDeepLink.
```

### Sequence — cloud-sandbox host path (no desktop required)

```
Web: "New sandbox for project P"
   │ v2Host.provision({ kind:"sandbox", provider, projectId })   (WS-C C4/C5)
   │   load sandbox_images WHERE project_id=P  (baseImage, systemPackages, setupCommands)
   │   provisioner.provision({ ...recipe, env:{ RELAY_URL, ORGANIZATION_ID, bootstrap-token } })
   ▼
Provider (daytona|modal|e2b|self) boots a host-service container
   │ container host-service auto-DIALS the relay on boot (serve.ts path) → setOnline → reaper armed at TTL
   ▼
v2_hosts row { kind:"sandbox", provider, expiresAt } + owner v2_users_hosts membership
   ▼
Client reaches it through the SAME relay tunnel + same HostClient — no second transport, no new attack surface.
```

Grounding: relay tunnel + fly-replay + electric-proxy gatekeeper (WS-C §1.1–1.5); ~70% of the web→relay→host plumbing already exists (WS-B §1.1, `apps/web/src/trpc/host-client.ts`); host-service runtime/pty-daemon/workspace-fs three-layer pattern + Turso anticipation (WS-D §1.1–1.6); desktop UI surfaces that converge (WS-A §1).

---

## Workstream catalog

| ID | Title | Goal (1-line) | Wave | Owns (primary paths) | Depends on | PR branch |
|---|---|---|---|---|---|---|
| [WS-A](./WS-A-spec.md) | Desktop UI inventory & screen decomposition | Authoritative read-only inventory of desktop screens/host-coupling for downstream WS | P0 | `plans/rox-convergence/inventory/**` (docs only) | — | `t/ws-a-desktop-ui-inventory` |
| [WS-B](./WS-B-spec.md) | Web↔Desktop convergence (hybrid host) | Unified `HostClient` + bind agents cabinet to real hosts; kill the 404 gate | P0→P1→P2 | `apps/web/src/app/(agents)/**`, `apps/web/src/trpc/host-client.ts`+`relay-url.ts`+`auth-token.ts`, `apps/web/src/proxy.ts`, `apps/web/src/app/auth/desktop/**`, `packages/shared/src/host-client/**` (NEW) | WS-C, WS-D (P1 host procs) | `feat/ws-b-hybrid-host-web-convergence` |
| [WS-C](./WS-C-spec.md) | Relay & remote-hosts productization | Shared JWT, declarative electric scoping, sandbox provisioning, unified managed-host reachability, streaming, observability | P0→P1→P2 | `apps/relay/**`, `apps/electric-proxy/**`, `packages/host-provisioner/**`, `packages/host-service/src/tunnel/**`; NEW `packages/shared/src/jwt-verify.ts` | — (P0); WS-B coord (P1) | `ws-c/relay-remote-hosts-productization` |
| [WS-D](./WS-D-spec.md) | host-service internals + Turso cross-host agent-state | NEW `@rox/agent-state` (libSQL embedded replica) + host-service integration seam | P1 (pkg P0-parallel) | `packages/agent-state/**` (NEW), `packages/host-service/src/runtime/agent-state/**` (NEW), `packages/host-service/src/trpc/router/agent-state/**` (NEW) | WS-C (claim proc, P1) | `feat/ws-d-agent-state-turso-cross-host` |
| [WS-E](./WS-E-spec.md) | Economy completion + Stripe removal (#70) | Wire balance/ledger/usage + admin grant + topup + Stripe-consumer removal over prepaid Rox core | P0→P1→P2 | `packages/db/src/schema/economy.ts`, `packages/trpc/src/router/economy/**` (NEW), `apps/api/src/app/api/economy/**` (NEW), `packages/shared/src/rox-ledger-kind.ts`+`billing.ts`, `packages/scripts/src/sync-model-catalog.ts`, **Stripe tRPC consumers** (`integration/utils.ts`, `utils/active-org.ts`, `membership.ts`) | WS-O (schema drops), host WS (metering call-site) | `feat/ws-e-economy-router` (P0), `feat/ws-e-topup-webhook-stripe-removal` (P1) |
| [WS-F](./WS-F-spec.md) | Admin expansion | Per-user drilldown, feature-flag toggles, bonus topups, real revenue | P1 (read-only drilldown P0-early) | `apps/admin/**`, `packages/trpc/src/router/admin/**`, **`analytics.ts` `getRevenueTrend` body only** (T9) | WS-O (flag table+helpers, `grant`/`bonus` enum), WS-E (`economy.admin.grant`) | `ws-f/admin-expansion` |
| [WS-G](./WS-G-spec.md) | Mobile light-up (Tasks/Workspaces) | Wire 4 placeholder mobile screens onto live Electric collections | P0 (T7/T8 P1) | `apps/mobile/screens/(authenticated)/{(tasks),tasks/[id],(home)/workspaces,workspaces/[id]}/**`; `apps/mobile/lib/collections/collections.ts` (additive T7) | host WS (P1, read v2_workspaces) | `ws-g/mobile-tasks-workspaces-lightup` |
| [WS-H](./WS-H-spec.md) | Docs coverage gap | Self-host/security/economy/platform/API-reference docs (RU) | P0 (platform/api P1, rest P2) | `apps/docs/content/docs/**` (content only) | soft: impl WS (accuracy) | `docs/convergence-coverage-ws-h` |
| [WS-I](./WS-I-spec.md) | Email RU translation + refresh | Translate all 12 `@rox/email` templates to RU; deprecate Stripe billing emails | P1 | `packages/email/**` | soft: WS-E (billing-email direction; non-blocking) | `ws-i/email-ru-translation-refresh` |
| [WS-J](./WS-J-spec.md) | MCP v2 + org collaboration | Cut seeded agents to v2 MCP; org skill libraries + collaborative dashboard routers/tools | P0 (T1/T7), P1 (routers), P2 (tools) | `packages/mcp-v2/**`, `packages/mcp/**` (only if T8), `packages/trpc/src/router/{mcp,skill-library,dashboard}/**` (NEW), `packages/trpc/src/root.ts` (additive), `host-service .../setup-mcp.ts` (T1) | WS-O (tables, T2–T5) | `feat/ws-j-mcp-v2-org-collaboration` |
| [WS-K](./WS-K-spec.md) | workflow-core assessment + `.codex/commands` slash source | Add `.codex/commands` as slash source; memo workflow-core gaps | P0 | `packages/chat/src/server/desktop/slash-commands/{registry.ts,registry.test.ts,slash-commands.ts}` | — | `ws-k/chat-codex-slash-source` |
| [WS-L](./WS-L-spec.md) | UI motion language + collab (LiveBlocks) + RTC (LiveKit) | NEW `@rox/collab` + `@rox/rtc` on the shared motion language; presence/voice — **both shipped now (D3)** | P0→**P1** (was P2 for dashboard mount) | `packages/collab/**` (NEW), `packages/rtc/**` (NEW), `packages/ui/src/components/PresenceStack/**` + motion doc/test, `packages/trpc/src/router/{collab,rtc}/**` (NEW, **corrected from apps/api**), `packages/trpc/src/root.ts` (additive), `apps/web/src/env.ts` (additive) | WS-J (dashboard surface, **P1** per D3); reuse existing experimental-features gate | `feat/ws-l-collab-rtc-motion-language` |
| [WS-M](./WS-M-spec.md) | SDK + CLI explainer & roadmap | Explainer + 1:1 mirror map + parity guardrail + version single-sourcing | P2 (baseline docs P0/P1) | `packages/sdk/{EXPLAINER,MIRROR,CONTRIBUTING}.md`+`src/version.ts`+parity test, `packages/cli/{CLI_OVERVIEW.md,CLI_SPEC_CURRENT.md,cli.config.ts}`+test | host/relay WS (mirror updates) | `docs/ws-m-sdk-cli-explainer-roadmap` |
| [WS-N](./WS-N-spec.md) | Infra polish: aerials, network-filter flag, **browser-data pipeline (D4)** | Aerial video wallpapers + `NETWORK_FILTER` flag shell + **real-browser history import → local-7-day → server-upload → purge, per-workspace, with consent (D4 — bigger than original per-branch history)** | P1 | `packages/shared/src/appearance/**`, `packages/ui/**wallpaper-layer**`, desktop WallpaperSection + `settings/network-filter/**` (NEW) + `browser-history/**` + NEW `browser-data/**` IPC router + OS-history reader + upload scheduler + consent panel + BrowserPane/BrowserToolbar hooks, `packages/local-db/**` (NEW `browser_history_entries` + `browser_data_consent` tables), `constants.ts` FEATURE_FLAGS (coord). **Hands server tables → WS-O (T9), upload tRPC → trpc/api owner.** | WS-O (server history tables T9 + flag table — soft) | `t/ws-n-infra-polish-aerials-netfilter-branchbrowser` |
| [WS-O](./WS-O-spec.md) | Org data model expansion + integrations cleanup | Author skill-library/dashboard/feature-flag tables + Stripe-drop schema + integration cleanup | P0 (foundation) | `packages/db/src/schema/**` (except `economy.ts`), `packages/db/drizzle/**` (generate), `packages/db/src/feature-flags.ts`+`utils.ts` helpers, `packages/trpc/src/router/integration/**` (cleanup) | — (blocks WS-J, WS-F, WS-E schema drops) | `ws-o/org-schema-libraries-dashboards-flags` |

---

## Consolidated file-ownership matrix (the merge-safety contract)

Each top-level path/dir maps to a **single owning workstream**. Where a file is co-edited, it is marked **append-only** with an integrate-last rule and an explicit sequence. This table resolves every overlap the hardening passes flagged.

| Path / dir | Sole owner | Mode | Notes / overlap resolution |
|---|---|---|---|
| `plans/rox-convergence/inventory/**` | WS-A | create-only | Docs only; zero source overlap. |
| `apps/web/src/app/(agents)/**` | WS-B | exclusive | Cabinet route group. |
| `apps/web/src/trpc/host-client.ts`, `relay-url.ts`, `auth-token.ts` | WS-B | exclusive | |
| `apps/web/src/proxy.ts` | WS-B | exclusive | Next.js 16 `proxy.ts` (not middleware). |
| `apps/web/src/app/auth/desktop/**` | WS-B | exclusive | Web side of deep-link handshake. |
| `packages/shared/src/host-client/**` | WS-B | exclusive (NEW) | Contract frozen at T1 before WS-A/WS-D build against it. |
| **`apps/web/src/env.ts`** | WS-B (primary) | **append-only** | WS-L adds LiveBlocks/LiveKit `NEXT_PUBLIC_*` keys (optional). Keep edits additive; integrate after WS-B. |
| `apps/relay/**` | WS-C | exclusive | WS-B/others read-only. |
| `apps/electric-proxy/**` | WS-C | exclusive | Uncontested. |
| `packages/host-provisioner/**` | WS-C | exclusive | |
| `packages/host-service/src/tunnel/**` | **WS-C** | exclusive | Resolves WS-B §223 mislabel ("host-service→WS-D"). Tunnel = WS-C; agent-state subdirs = WS-D. |
| `packages/shared/src/jwt-verify.ts`, `tunnel-protocol.ts` (streaming adds) | WS-C | exclusive (NEW/coord) | WS-B references `tunnel-protocol.ts` read-only. |
| `packages/agent-state/**` | WS-D | exclusive (NEW) | incl. its OWN `drizzle/` (libSQL, NOT `packages/db/drizzle`). |
| `packages/host-service/src/runtime/agent-state/**`, `src/trpc/router/agent-state/**` | WS-D | exclusive (NEW) | |
| **`packages/host-service/src/app.ts`** | shared | **append-only, integrate LAST** | Co-edited by **WS-B** (host-attach wiring) and **WS-D** (`runtime.agentState` + dispose). Keep hunks single-line; WS-D integrates after WS-B. WS-C confirms its tunnel wiring stays inside `src/tunnel/**` (no `app.ts` edit) — if C5/C6 need `app.ts`, it joins this append-only set. |
| **`packages/host-service/src/trpc/router/router.ts`** | shared | **append-only** | WS-D registers `agentState` key; WS-J's T1 touches `setup-mcp.ts` (different file). Single-line registration; integrate last. |
| `packages/host-service/.../workspace-creation/shared/setup-mcp.ts` | WS-J | exclusive (T1) | Confirmed no host-service WS claims it; WS-J owns the v1→v2 seed cutover. |
| `packages/db/src/schema/economy.ts` | **WS-E** | exclusive | The single schema carve-out from WS-O. |
| `packages/db/src/schema/**` (all other files: `enums.ts`, `auth.ts`, `schema.ts`, `attribution.ts`, `relations.ts`, NEW `org-library.ts`/`dashboard.ts`/`feature-flags.ts`, `index.ts`) | **WS-O** | exclusive | Includes the `grant`/`bonus` ledger enum value (authored in `enums.ts`), the WS-F `user_feature_flags` table, and WS-J `skill_libraries*`/`dashboards*` tables. |
| **Stripe-removal schema drops** (`schema.ts` subscriptions, `auth.ts` stripeCustomerId, `attribution.ts` provider default, `relations.ts`) | **WS-O** | exclusive, sequenced | **WS-E authors the diff + migration intent; WS-O applies.** Sequence: WS-E consumer removal (P1 step A) → WS-O table drop (P1 step B). |
| `packages/db/drizzle/**` | WS-O | generate-only, serialized | **WS-E also emits Stripe-removal migration here.** `drizzle-kit generate` is journal-order-dependent → **WS-E and WS-O generate runs MUST be serialized** (WS-O org-tables generate first, then WS-E Stripe-removal generate). Never hand-edit. |
| **Stripe tRPC consumers**: `packages/trpc/src/router/integration/utils.ts` (`verifyOrgMembershipWithSubscription`), `packages/trpc/src/router/utils/active-org.ts` (`requireActiveOrgMembershipWithSubscription`), `packages/db/src/utils/membership.ts` (`findOrgMembershipWithSubscription`), `packages/shared/src/billing.ts` | **WS-E** | exclusive, sequenced BEFORE WS-O drop | Resolves the disputed consumer-chain. WS-E replaces these with the already-existing subscription-free `findOrgMembership` (`membership.ts:8`) BEFORE WS-O drops the `subscriptions` table. |
| `packages/db/src/feature-flags.ts` (NEW) + flag-helper exports in `packages/db/src/utils.ts` | WS-O | exclusive | `resolveUserFlag` / `upsertUserFlagOverride`. WS-F imports; PostHog fallback stays in WS-F. |
| `packages/trpc/src/router/integration/**` (cleanup: parked-status comments, shared `scope`) | WS-O | exclusive | No enum-value removal, no handler edits. |
| `apps/admin/**`, `packages/trpc/src/router/admin/**` | WS-F | exclusive | |
| **`packages/trpc/src/router/analytics/analytics.ts`** | shared | **WS-F owns `getRevenueTrend` only; MANDATORY helper extraction** | Resolves WS-F/economy overlap: WS-F extracts revenue into a WS-F-owned helper so its only edit to `analytics.ts` is one import+call swap. (Sequence WS-E economy router before WS-F so `roxTopups` reads exist.) |
| `apps/mobile/screens/(authenticated)/{(tasks),tasks/[id],(home)/workspaces*,workspaces/[id]}/**` | WS-G | exclusive | Excludes `(home)/workspaces/components/Organization*` (read-only). |
| **`apps/mobile/lib/collections/collections.ts`** | WS-G | append-only | Only WS-G extends mobile collections (adds `v2Workspaces`, T7). No competing writer. |
| `apps/docs/content/docs/**` | WS-H | exclusive (content) | `meta.json` is the only shared-risk file; only WS-H edits docs content. |
| `packages/email/**` | WS-I | exclusive | Leaf package; email subject lines at auth/marketing call-sites are NOT WS-I (handoff note only). |
| `packages/mcp-v2/**`, `packages/mcp/**` | WS-J | exclusive | |
| `packages/trpc/src/router/{mcp,skill-library,dashboard}/**` | WS-J | exclusive (NEW) | Consume WS-O tables. |
| `packages/trpc/src/router/{collab,rtc}/**` | WS-L | exclusive (NEW) | **Corrected from `apps/api/.../routers/` — routers live in `packages/trpc/src/router/`.** |
| **`packages/trpc/src/root.ts`** | shared | **append-only, ordered** | Additive router registrations by **WS-E** (`economy`), **WS-J** (`skillLibrary`/`dashboard`/`mcp`), **WS-L** (`collab`/`rtc`). WS-O does NOT edit it. WS-F edits the admin router file, not root.ts. **Order: WS-E → WS-J → WS-L** (each rebases trivially; conflicts are 2-line). |
| `packages/chat/src/server/desktop/slash-commands/{registry.ts,registry.test.ts,slash-commands.ts}` | WS-K | exclusive | Narrow subtree; no sibling claims `packages/chat`. |
| `packages/collab/**`, `packages/rtc/**`, `packages/ui/src/components/PresenceStack/**`, `packages/ui/src/motion/MOTION-LANGUAGE.md`+`tokens.contract.test.ts` | WS-L | exclusive (NEW) | `packages/ui/src/motion/**` existing files are READ-ONLY (append-only lane). |
| `packages/sdk/**`, `packages/cli/**` | WS-M | exclusive | No sibling claims either; SDK/CLI runtime resources stay read-only except `version.ts`/`cli.config.ts` single-line version edits. |
| `packages/shared/src/appearance/**`, `packages/ui/**wallpaper-layer**`, desktop `WallpaperSection/**`, `settings/network-filter/**`, `browser-history/**` + BrowserPane history hooks (incl. `.../BrowserToolbar/hooks/**` v1+v2) | WS-N | exclusive | `browserHistory` per-branch needs composite `(url, workspaceId)` unique, not just a nullable column. |
| `packages/local-db/**` (browserHistory column + local migration) | WS-N | exclusive | Local SQLite — NOT under the WS-O `packages/db` schema rule. |
| **`packages/shared/src/constants.ts` `FEATURE_FLAGS`** | shared | **append-only, single landing owner** | WS-N adds `NETWORK_FILTER` (+ optional `AUTOMATION_ACCESS`); WS-F/WS-O enumerate the same block. **Agree at wave start that WS-N lands the key add** (it is the consumer). WS-A/WS-B touch only the URL-constants region (`:17-28`), a different block — no conflict. |
| `packages/shared/src/experimental-features/**` + desktop `settings/.../env-key-groups` | unassigned (coord) | flag | **Pre-existing LiveBlocks/LiveKit provider registry + env-key map already exist** (WS-L hardening). WS-L must REUSE the existing keys (`LIVEBLOCKS_SECRET_KEY`, `NEXT_PUBLIC_LIVEBLOCKS_PUBLIC_KEY`, `LIVEKIT_API_KEY/SECRET`, `NEXT_PUBLIC_LIVEKIT_URL`) and the existing experimental-feature gate, not invent a parallel flag. Additive edits here are currently unowned — **assign to WS-L** at wave start. |

---

## Dependency graph

```
                          ┌──────────────────────────── P0 ────────────────────────────┐
                          │                                                              │
   WS-A (inventory) ──────┤  (read-only; informs B/C/D/everything; no merge edges)       │
                          │                                                              │
   WS-O (schema) ─────────┼───────────────┬──────────────┬───────────────┐              │
     blocks ▼             │               ▼              ▼               ▼               │
   WS-E.P1 schema drops   │            WS-J routers   WS-F flag      (grant/bonus enum   │
                          │             (P1)          toggle (P1)     for WS-E/WS-F)     │
   WS-C (relay P0) ───────┤                                                              │
     coord ▼              │                                                              │
   WS-B (host-client P0) ─┤── T1 contract freeze ──► WS-D client layer, WS-A ipc seam    │
                          │                                                              │
   WS-E (economy P0) ─────┤── economy.admin.grant ──► WS-F topup (P1);  roxTopups ──► WS-F revenue
                          │                                                              │
   WS-G (mobile P0)  WS-K (slash P0)  WS-H (self-host/sec/econ docs P0)  WS-L (pkgs P0)  │
   WS-J (T1 seed, T7 proxy P0)                                                           │
                          └──────────────────────────────────────────────────────────┘
                                                   │
        ┌──────────────────────────── P1 ─────────┴────────────────────────────────┐
        │ WS-B P1 (cabinet→real host) ◄ needs WS-C/WS-D host procs                   │
        │ WS-D P1 (host-service seam + claims) ◄ needs WS-C claim proc               │
        │ WS-C P1 (sandbox provisioning, streaming)                                  │
        │ WS-E P1 (topup+webhook+Stripe removal) ◄ WS-O schema drop (serialized gen) │
        │ WS-F P1 (flag toggle ◄ WS-O table; topup ◄ WS-E grant)                     │
        │ WS-J P1 (skillLibrary/dashboard routers ◄ WS-O tables)                     │
        │ WS-I P1 (email RU)   WS-N P1 (aerials/netfilter/branch-browser)            │
        │ WS-L P1 (collab/rtc server auth + tRPC mint + env + dashboard mount ◄ WS-J)│
        │ WS-G P1 (v2Workspaces collection)   WS-H P1 (platform/* + api/*)           │
        └────────────────────────────────────────────────────────────────────────┘
                                                   │
        ┌──────────────────────────── P2 ─────────┴────────────────────────────────┐
        │ WS-B P2 (sandbox-backed cabinet + Turso surfacing)                         │
        │ WS-C P2 (relay observability, direct-connect)  WS-D P2 (TanStack adapter)  │
        │ WS-E P2 (settlement poll, metering call-site)  WS-J P2 (MCP read tools)    │
        │ WS-M (parity)   (WS-L dashboard mount moved to P1 per D3)                  │
        │ WS-H P2 (remaining API domains + backfill)   WS-F P2 (audit)               │
        └────────────────────────────────────────────────────────────────────────┘
```

### Wave breakdown + ordering constraints

**P0 (foundation — land first, unblock everyone).**
- **WS-O** (schema + generate) — blocks WS-J routers, WS-F flag toggle, and provides the `grant`/`bonus` enum that WS-E/WS-F need. Highest-priority foundation.
- **WS-B T1** (freeze `HostClient` contract) + **T2** (RelayTransport) + **T6** (uniform `(agents)` gate / 404 fix) — frozen contract gates WS-A ipc-seam and WS-D client layer.
- **WS-C C1–C3** (shared JWT, declarative electric scoping, cache-isolation test) — no cross-WS dependency.
- **WS-E P0** (T1 `toLedgerKind`, T2 settlement service, T3 balance/ledger/usage router, T6 admin grant, T9 tier-decouple) — self-contained; unblocks WS-F topup contract.
- **WS-A** (docs inventory), **WS-G P0** (mobile Tasks/Workspaces), **WS-K** (slash source), **WS-J T1+T7** (v2 seed cutover, proxy degradation), **WS-H P0** (self-host/security/economy docs of shipped code), **WS-L P0** (motion doc + `@rox/collab`/`@rox/rtc` scaffolds + `PresenceStack`), **WS-D pkg** (`@rox/agent-state` T1–T6 buildable in isolation), **WS-F read-only drilldown** (T1–T4, T8, T9 needs WS-E economy router landed first for revenue), **WS-N branch-browser** (P0-able).

**P1 (host attach + product wiring).**
- **WS-B P1** (T3/T4/T5 cabinet → real local-host attach, T8 continue-on-desktop) — needs WS-C/WS-D host procedures.
- **WS-C C4–C6** (sandbox_images threading, managed-host relay dial, streaming).
- **WS-D P1** (T7 host-service seam, T8 tRPC router, T6 real claim path) — needs WS-C claim proc (ships behind `ClaimTransport` stub if late).
- **WS-E P1** (T4 topup, T5 dv.net webhook, T7 catalog sync, T8 accountOverview, **T10 Stripe removal**). **Ordering: WS-E consumer removal (step A) → WS-O table drop (step B); serialize `drizzle-kit generate` after WS-O org-tables.**
- **WS-F P1** (T5 flag toggle ◄ WS-O table+helpers; T6 topup ◄ WS-E grant).
- **WS-J P1** (T2/T3 routers ◄ WS-O tables; T6 mcpAdmin).
- **WS-L P1** (T4/T5/T7/T8 server auth + tRPC mint + env **+ T10 mount presence on the dashboard — pulled into P1 per D3 so BOTH LiveBlocks + LiveKit ship now**; sequence T10 after WS-J P1 dashboard router, else land behind the experimental-features gate), **WS-I P1** (email RU), **WS-N P1** (aerials, netfilter flag, **D4 browser-data pipeline**), **WS-G P1** (v2Workspaces collection), **WS-H P1** (platform/* + api/* after impl PRs).

**P2 (polish + advanced).**
- **WS-B P2** (sandbox-backed cabinet + Turso surfacing), **WS-C P2** (observability, direct-connect), **WS-D P2** (TanStack libSQL adapter), **WS-E P2** (settlement poll, metering call-site), **WS-J P2** (T4/T5 MCP read tools ◄ T2/T3), **WS-M** (parity test + version single-sourcing after first convergence procs), **WS-H P2** (remaining API + backfill), **WS-F P2** (audit). *(WS-L's dashboard mount moved to P1 per D3.)*

---

## Merge protocol (how Phase-2 PRs integrate without conflicts)

1. **One worktree → one PR per workstream.** Each agent writes ONLY files in its ownership row. Strict ownership means most PRs are disjoint and merge in any order.
2. **Schema-first.** WS-O (P0) merges before any consumer wires a router against new tables (WS-J, WS-F). The `grant`/`bonus` ledger enum (WS-O `enums.ts`) merges before WS-E topup and WS-F bonus-grant use it.
3. **Stripe-removal sequence (strict):** WS-E consumer edits (`integration/utils.ts`, `active-org.ts`, `membership.ts`, `billing.ts`) merge **before** WS-O drops the `subscriptions` table/columns. The two `drizzle-kit generate` runs (WS-O org-tables, then WS-E Stripe-removal) are **serialized** — concurrent generation collides on `meta/_journal.json`.
4. **Append-only shared files — integrate LAST in their wave, single-line hunks:**
   - `packages/host-service/src/app.ts` + `router.ts` — WS-D integrates after WS-B (and WS-C if it needs them). Keep each addition to one hunk.
   - `packages/trpc/src/root.ts` — order WS-E → WS-J → WS-L; each later PR rebases (trivial 2-line conflict).
   - `apps/web/src/env.ts` — WS-L adds keys after WS-B.
   - `packages/shared/src/constants.ts` `FEATURE_FLAGS` — WS-N lands the key add; WS-F/WS-O consume.
   - `apps/mobile/lib/collections/collections.ts` — WS-G additive only.
   - `apps/docs/content/docs/meta.json` — WS-H only.
5. **Helper-extraction mandates** to shrink merge surface: WS-F extracts `getRevenueTrend` into a WS-F-owned helper (its only `analytics.ts` line is an import+call). WS-D/WS-C confirm host-service tunnel wiring stays in `src/tunnel/**` so `app.ts` stays minimal.
6. **Verify per wave before next wave starts** (encoded in `phase2-implement.js`): a verify agent confirms the wave's PRs are lint/typecheck/build green.

---

## Answers index (owner's original questions → spec + section)

| Question | Answered in |
|---|---|
| External links → system browser (5 examples) | WS-A §1.1 (+ external-link-registry deliverable) |
| CommandPalette composition | WS-A §1.2 |
| WorkspaceSidebar composition | WS-A §1.3 |
| WorkspaceView / ContentView / ChangesContent / RightSidebar composition | WS-A §1.4 |
| Each screen (Tasks / Pipelines / Automations / Quick Chat / Saved Prompts) decomposition | WS-A §1.5 |
| Panes layout (`@rox/panes` vs react-mosaic v1/v2) | WS-A §1.6 |
| better-sqlite3 vs Turso (why two DBs; orthogonality) | WS-D §1.3 (host-db vs local-db) + §1.6 (Electric vs Turso table) |
| libSQL TanStack-DB adapter benefit | WS-D §1.6 (enhancer-not-blocker; desktop already ships `@tanstack/db`) |
| pty-daemon (session persistence + wire protocol; more than integrated terminal) | WS-D §1.5 |
| host-service runtime / ~133 trpc files / own SQLite / `core/host/client` layers | WS-D §1.1 (runtime), §1.2 (133 files/24 routers), §1.3 (own SQLite), §1.4 (layers) |
| companion / `WEB_AGENTS_UI_ACCESS` flag / 404 | WS-B §1.3 (the mixed gate + 404 diagnosis) + §2.4 (fix) |
| agents cabinet (what it is, why hidden, how to wire) | WS-B §1.2, §1.4 |
| deep-link handshake (desktop ↔ web) | WS-B §1.5 |
| relay / fly-replay / Windows host | WS-C §1.1 (relay), §1.2 (fly-replay ops), §1.3 (Windows remote host) |
| multi-tenant auth / electric-proxy gatekeeper | WS-C §1.4 |
| 40 routers (actual: 38 tRPC routers) | WS-H §1b#1 (router enumeration); WS-D §1.2 (host-service 24 sub-routers) |
| SDK / CLI (what they are, mirror-1:1, roadmap) | WS-M §1.1 (SDK), §1.2 (CLI), §1.3 (relationship), §1.4–1.5 (versioning/maturity) |
| workflow-core (how working) | WS-K §1.1 |
| MCP v2 / proxy / native tools / preinstall | WS-J §1.1 (v2+proxy), §1.2 (native tools), §1.3 (preinstall: remote HTTP, not local process) |
| org skill-libraries | WS-J §1.6 + §2.2 (design) → tables WS-O §2.2 |
| collab dashboard | WS-J §1.6 + §2.2 (design) → tables WS-O §2.3 |
| economy routers | WS-E §1.2 (required procedures) + §1.1 (maturity map) |
| admin drilldown / flags / balance | WS-F §1.2 (drilldown), §1.3 (flags), §1.4 (balance/topup) |
| mobile scaffold / "25 components" (actual 32 of 55) | WS-G §1.1 (scaffold), §1.2 (component count) |
| docs coverage | WS-H §1a (current coverage), §1b (gaps) |
| 12 email templates | WS-I §1.4 (verbatim copy of all 12) + §1.2 (wiring maturity) |
| motion language / LiveBlocks / LiveKit | WS-L §1.1 (motion), §1.3 (realtime stack relation), §2 (collab/rtc design) — note: providers already scaffolded (WS-L §7a#1) |
| aerials (top-30 catalog) | WS-N §1A (catalog + licenses) |
| network-filter flag (developer-id gating pattern) | WS-N §1B |
| branch browser | WS-N §1C |
| Stripe removal (#70) | WS-E §1.5 (removal plan) + WS-O Stripe-drop ownership |

---

## Resolved decisions (D1–D8) + residual risks

The 8 cross-spec forks the hardening passes raised have been **resolved by the owner/lead**. Full record:
[`DECISIONS.md`](./DECISIONS.md). Each affected spec carries a `### Decision updates` note pointing back there.

| # | Was (open fork) | Now (RESOLVED) | Where |
|---|---|---|---|
| **D1** | Web behavior when desktop offline — prompt for a sandbox? | **AUTO-provision a cloud sandbox, no prompt; only gate = balance/credits.** | WS-B, WS-C, WS-E |
| **D2** | Preserve/archive old Stripe prod data before drop? | **Just DELETE — no archive, no export.** (Still offline `generate` only; apply is a human-gated deploy.) | WS-E, WS-O |
| **D3** | LiveBlocks/LiveKit now or later (P2)? | **Do BOTH NOW — moved to P1**, mounted on the WS-J dashboard. | WS-L, WS-J |
| **D4** | Per-branch `browserHistory` column vs v1/v2 consolidation? | **Superseded — full real-browser import → local-7-day → server-upload → purge, per-workspace, with mandatory consent.** | WS-N, WS-O |
| **D5** | RN/mobile `HostClient` transport authorship unassigned. | **WS-B owns the shared HostClient incl. transport; WS-G only consumes it.** | WS-B, WS-G |
| **D6** | Web local-db/Electric read path under-specified. | **Web reads host-scoped live data THROUGH the host via relay (single source of truth); keeps org Electric subscriptions for org/account data.** | WS-B, WS-C |
| **D7** | C5 bootstrap-token named but undesigned. | **Short-lived signed JWT from apps/api (reuse better-auth JWKS/jwt), scoped {hostId,userId,exp}.** Designed. | WS-C, WS-B |
| **D8** | Serial `drizzle/` co-gen + Stripe-drop missing from WS-O + rox/rox_v2 enum kinds. | **Serialize generate (WS-O→WS-E); Stripe-drop is an explicit WS-O task; WS-J investigates rox/rox_v2 → add enum or delete dead code.** | WS-O, WS-E, WS-J |

### Remaining residuals (few)

After D1–D8, the genuinely-open items are minor and execution-local, not blocking:

1. **LiveKit deploy target (self-host SFU vs LiveKit Cloud) + `NEXT_PUBLIC_LIVEKIT_URL` source-of-truth** is an infra/cost decision, not a code blocker (WS-L §7b#3). Pick at P1 wiring time; `.optional()` env keeps builds green until set.
2. **Metering call-site placement** for `economy.settleRequest` is a thin hook the host WS adds on the agent-completion event (WS-E P2 / §1.3); the exact emit point is confirmed during host-service P1, not before.
3. **Server-side "cleaning" denylist for browser history (D4)** — the exact tracking-param strip + sensitive-host denylist is a content decision tuned during WS-N/WS-O T9 implementation, not a structural risk.

None of these block P0/P1; they are tuning decisions made in-flight with `.optional()`/stub seams already in the specs.

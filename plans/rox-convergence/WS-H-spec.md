# WS-H: Docs Coverage Gap — Spec

> Workstream WS-H of the Rox convergence master plan. Read-only discovery (Phase 1) + Phase-2 task list. Owner-locked decisions: hybrid host model, Turso for cross-host agent-state only, one-PR-per-workstream with strict file ownership, full P0→P1→P2 phasing. This workstream owns **`apps/docs/content/docs/**` only** — pure content authoring, zero source-code changes.

All docs are **Russian** (`title`/`description` frontmatter + body in RU). Any new page MUST follow the same RU convention. Components available in MDX: `<Callout>`, `<Tabs>/<Tab>`, `<DownloadButton>`, `<YouTubeVideo>`, `<DatabaseTable>`, `<ResourceGrid>/<ResourceCard>`, `<Collapsible>`, `<AsideLink>`, `<Command>` (see `apps/docs/src/mdx-components.tsx` and `apps/docs/src/components/`). Navigation is driven by `meta.json` (`apps/docs/content/docs/meta.json:1`, `cli/meta.json:1`, `sdk/meta.json:1`); `---Icon Label---` entries are section separators. The site auto-generates `/llms.mdx/*` and `/llms-full.txt` from page content (`apps/docs/src/app/llms-full.txt/route.ts:6`), so every new page automatically lands in the LLM index — no extra wiring.

---

## 1. Findings

### 1a. Page-by-page coverage of Desktop / CLI / SDK today

**Desktop (mature, user-facing, but feature-trailing).** The desktop app is the primary documented surface. Pages and depth:

| Page | File:line | Lines | Depth verdict |
|---|---|---|---|
| Обзор | `overview.mdx:1` | 29 | Thin landing; macOS-only note, requirements, install button. |
| Первое рабочее пространство | `first-workspace.mdx:1` | 35 | Adequate getting-started. |
| Рабочие пространства | `workspaces.mdx:1` | 55 | Adequate (worktree model). |
| Diff viewer | `diff-viewer.mdx:1` | 41 | Adequate. |
| Терминал | `terminal-integration.mdx:1` | 56 | Adequate. |
| Порты | `ports.mdx:1` | 67 | Adequate. |
| Браузер | `browser.mdx:1` | 36 | Thin. |
| AI-агенты | `agent-integration.mdx:1` | 73 | Lists 7 agents + chat + thinking levels; no per-agent config depth. |
| Удалённые рабочие пространства | `remote-workspaces.mdx:1` | 73 | Covers relay (Desktop toggle + CLI host). **`pro: true`.** Does NOT cover the cloud-sandbox arm of the hybrid host (v2_hosts managed providers). |
| Автоматизации | `automations.mdx:1` | 78 | Adequate. |
| MCP-сервер | `mcp.mdx:1` | 301 | **Strong**, MCP v2, per-CLI setup, capability table. |
| Guides (8): setup/teardown, IDE, Linear, providers, monorepos, presets, shortcuts, themes, customization | various | 33–172 | Provider + Linear + setup-scripts are deep; rest adequate. |
| FAQ / updater / sourcemap | `faq.mdx:1` etc. | 43–46 | Adequate. |

Desktop gap: nothing documents the **web "agents cabinet" / PostHog-flagged features** the convergence plan promises desktop will gain — but that's WS-implementation surface, so WS-H only needs to *track* it (a future "Hybrid host" page, see 1b).

**CLI (mature).** `cli/getting-started.mdx:1` (190 lines, install via desktop shim / curl / brew, login, first commands), `cli/cli-reference.mdx:1` (**1067 lines** — auth, start/stop/status, update, org, projects, hosts, workspaces, agents, terminals, tasks, automations, output modes), `cli/host-server.mdx:1` (173), `cli/env-vars.mdx:1` (22, thin). Verdict: **CLI is the best-covered surface.** Only gap: env-vars page is a 22-line stub vs. the full env surface in code.

**SDK (exists but partial).** Three pages: `sdk/getting-started.mdx:1` (149), `sdk/reference.mdx:1` (338), `sdk/advanced.mdx:1` (186). The reference is **hand-written** and covers only: `tasks`, `workspaces`, `projects`, `hosts`, `agents`, `terminals`, `automations` (`sdk/reference.mdx:29-336`). Verdict: SDK docs are real but cover ~7 of the API's domains.

### 1b. What is NOT covered — and what each missing doc must contain

The backend exposes **37 tRPC routers** (`packages/trpc/src/root.ts:44-83`) plus REST/well-known endpoints under `apps/api/src/app/api/**` and `apps/api/src/app/.well-known/**`. Docs surface only a fraction. Concrete gaps:

1. **REST / tRPC API reference — MISSING.** There is no API-reference section. 37 routers exist (`root.ts:44-83`): achievements, admin, agent, agentRole, agentSource, apiKey, analytics, automation, chat, device, executionCircuit, graph, host, integration, journal, knowledge, memory, notes, organization, pipeline, pipelineTrigger, profile, project, ranking, runtime, share, skill, support, task, team, usage, user, v2Host, v2Project, v2Workspace, voice, workflow, workspace. REST endpoints also undocumented: tRPC HTTP at `apps/api/src/app/api/trpc/[trpc]`, chat streaming `apps/api/src/app/api/chat/[sessionId]/stream`, agent MCP transports `apps/api/src/app/api/agent/[transport]` + `/api/v2/agent/[transport]`, journal generate, memory import, discord integration, desktop version/auth. The SDK reference (`sdk/reference.mdx`) is the closest thing but documents only 7 domains and is not framed as the API contract. Each API-reference page must contain: base URL (`https://api.rox.one`), auth scheme (Bearer API key — see #3), per-procedure name, input schema (from the router's `.input(z...)`), output shape, and a curl + SDK example.

2. **Self-host / deployment guide — MISSING.** Deployment is owner-knowledge only: `DEVELOPMENT.md:1` (local), `docker-compose.yml:1` (postgres 17 / neon-proxy / electric 1.4.13 / caddy), the **uncommitted** `docs/render-deploy.md:1` (Render service ids, manual deploy script, verification), and `.rox/setup.local.sh` / `.rox/tailscale-serve.sh` (referenced in AGENTS.md). README.md is **empty (0 bytes)**. None of this is in the docs site. Must contain: architecture (api/web/admin/marketing/docs + postgres+neon-proxy+electric+caddy+relay), env-var matrix, Docker-Compose self-host walkthrough, Neon vs. self-hosted Postgres, Electric live-sync setup, Render-hosted reference, relay/host-server topology for the hybrid model, upgrade/migration runbook.

3. **Auth / security model — MISSING.** better-auth lives in `packages/auth/src/server.ts:1` with magic-token (`packages/auth/src/lib/generate-magic-token.ts`), rate-limit (`lib/rate-limit.ts`), org-session resolution (`lib/resolve-session-organization-state.ts`), invitation flow (`lib/accept-invitation-endpoint.ts`), and OIDC/OAuth well-known endpoints (`apps/api/src/app/.well-known/{openid-configuration,oauth-authorization-server,oauth-protected-resource}`). API keys via `apiKeyRouter` (`packages/trpc/src/router/api-key/api-key.ts`). Desktop-connect auth at `apps/api/src/app/api/auth/desktop/connect` and `apps/web/src/app/auth/desktop`. CLI auth at `apps/web/src/app/cli/auth`. Only `remote-workspaces.mdx` touches security (the relay toggle). Must contain: auth methods (magic link, GitHub, dev local-admin), session model, organization/membership/roles, API-key lifecycle + scopes, OAuth/OIDC provider endpoints, desktop & CLI device-auth flows, relay security posture, secret-handling guidance for self-host.

4. **Billing / economy (prepaid tokens) — MISSING.** Full economy schema exists: `packages/db/src/schema/economy.ts` — `modelCatalog` (line 53), `roxTopups` (105, dv.net USDT→Rox invoices), `usageRequests` (138, per-request metered tokens/cost/trace), `roxBalances` (182, seeded **500 Rox** on create, `STARTING_BALANCE_ROX`), `roxLedger` (213, append-only deltas), enums `rox_ledger_kind` / `rox_topup_status` (46-47). Surfaced via `usageRouter` (`packages/trpc/src/router/usage/usage.ts` — `summary` public proc line 46, `recordBatch` line 115). Zero docs. Must contain: what a "Rox" prepaid token is, starting balance (500), how usage is metered per request, model catalog/pricing, top-up flow (USDT via dv.net) and statuses, ledger transparency, balance API, what happens at zero balance.

5. **Mobile app — MISSING.** `apps/mobile` is a real Expo/React-Native app: routes `app/(auth)` + `app/(authenticated)` (`apps/mobile/app/`), screens, `lib/auth`, `lib/trpc`, `lib/posthog`, `lib/collections`, device-presence hook (`hooks/useDevicePresence`), theming. Zero docs. In the hybrid-host model, mobile is a **client that attaches to a desktop or cloud host** (continue-on-mobile). Must contain: install (TestFlight/store status), sign-in, device presence, attaching to a host, mobile feature scope vs. desktop, push/notifications, limitations.

6. **Web app + hybrid host — MISSING.** `apps/web` has dashboard surfaces: `(agents)` cabinet (`apps/web/src/app/(agents)/agents`, `/settings`), `workspaces/[workspaceId]`, `tasks/[slug]`, `league`, share `s/[slug]`, profiles `u/[handle]`, oauth consent, accept-invitation. The cloud-host arm of the hybrid model exists in code: `v2_hosts` (`packages/db/src/schema/schema.ts:543`) with managed providers + `provision` proc for "persistent managed remote workspace or ephemeral sandbox" (`packages/trpc/src/router/v2-host/v2-host.ts:408-422`, `listProviders` line 398), and `sandbox_images` (`schema.ts:730`). `remote-workspaces.mdx` documents ONLY the relay/desktop arm, not the cloud-sandbox arm. Must contain: web app overview (what app.rox.one does in-browser), the two attach modes (own desktop via relay vs. cloud sandbox host), how to pick/provision a managed host, sandbox images, web↔desktop feature parity matrix, when to use which.

7. **MCP tool catalog — PARTIAL.** `mcp.mdx:1` documents MCP v2 setup + a capability *category* table (tasks, workspaces, automations, projects, hosts) but not a per-tool catalog (each tool name, args, returns). Must contain: complete per-tool reference for the v2 MCP server (`apps/api/src/app/api/v2/agent/[transport]`), grouped by domain, with arg schemas and examples.

**Honesty notes / maturity:** `docs/render-deploy.md` is uncommitted and home-dir-scoped — treat as source material, not as published docs. README.md is empty. CLI is beta (`cli/getting-started.mdx:6`). `remote-workspaces.mdx` is `pro:true` gated. The economy schema comment confirms 500-Rox seeding (`economy.ts:190`) — verify the constant name/value against `STARTING_BALANCE_ROX` at authoring time. The SDK reference is hand-maintained, so an API-reference section risks drift unless cross-linked to the SDK and ideally generated; this spec recommends hand-authored pages for P0/P1 with a P2 note to evaluate generation from Zod inputs.

---

## 2. Target design

### 2.1 Target docs IA (information architecture)

```
content/docs/
├─ meta.json                       (MODIFY — add new sections/pages)
│
├─ ---Rocket Начало работы---
│   overview, first-workspace
├─ ---Gauge Основные возможности---
│   workspaces, diff-viewer, terminal-integration, ports, browser,
│   agent-integration, remote-workspaces, automations, mcp
│
├─ ---Layers Платформа (NEW SECTION)---           [hybrid-host + clients]
│   platform/web-app            (NEW)  app.rox.one tour + agents cabinet
│   platform/hybrid-host        (NEW)  the two attach modes (relay vs cloud sandbox)
│   platform/cloud-hosts        (NEW)  managed providers, provision, sandbox images
│   platform/mobile             (NEW)  Expo app, continue-on-mobile
│
├─ ---ShieldCheck Аутентификация и безопасность (NEW)---
│   security/auth-model         (NEW)  methods, sessions, orgs/roles
│   security/api-keys           (NEW)  lifecycle, scopes
│   security/oauth-oidc         (NEW)  well-known endpoints, consent
│   security/device-auth        (NEW)  desktop + CLI device flows
│
├─ ---Coins Баланс и экономика (NEW)---
│   economy/overview            (NEW)  Rox prepaid tokens, 500 starting balance
│   economy/usage-metering      (NEW)  per-request metering, model catalog
│   economy/top-ups             (NEW)  USDT via dv.net, statuses, ledger
│
├─ ---Terminal CLI---
│   cli/getting-started, cli/cli-reference, cli/host-server, cli/env-vars
│
├─ ---Package TypeScript SDK---
│   sdk/getting-started, sdk/reference, sdk/advanced
│
├─ ---Code2 API Reference (NEW SECTION)---
│   api/overview                (NEW)  base URL, auth, tRPC-over-HTTP, errors
│   api/tasks, api/workspaces, api/projects, api/hosts, api/agents,
│   api/automations             (NEW × N — mirror documented SDK domains first)
│   api/organization, api/usage, api/chat, api/v2-host, api/integrations (NEW — P1)
│   api/mcp-tools               (NEW)  full per-tool MCP catalog
│
├─ ---Server Самостоятельный хостинг (NEW)---
│   self-host/overview          (NEW)  architecture diagram, services
│   self-host/docker-compose    (NEW)  local/self-host walkthrough
│   self-host/env-reference     (NEW)  full env matrix
│   self-host/database          (NEW)  Neon vs self-host PG, Electric, migrations
│   self-host/render            (NEW)  Render-hosted reference (from render-deploy.md)
│   self-host/upgrades          (NEW)  migration/upgrade runbook
│
├─ ---BookOpen Руководства---     (unchanged)
└─ ---CircleHelp Справка---       (unchanged)
```

### 2.2 Hybrid-host data-flow (drives platform/* and self-host/* pages)

```
                        ┌──────────────────────────┐
   Web (app.rox.one) ──▶│   Rox backend (api)      │◀── Mobile (Expo)
   Desktop (Electron) ─▶│  tRPC + better-auth      │
                        │  Neon PG · Electric sync │
                        └────────────┬─────────────┘
                                     │ attach to a HOST
                 ┌───────────────────┴───────────────────┐
                 ▼                                         ▼
        (a) OWN DESKTOP HOST                      (b) CLOUD SANDBOX HOST
        via apps/relay (continue-on-mobile)       v2_hosts managed provider
        Settings→Security toggle / CLI host       provision() persistent|ephemeral
        files·terminals·ports on user machine     sandbox_images per project
```

### 2.3 Per-page outline (every NEW page — what it must contain)

- **platform/web-app:** what app.rox.one is; agents cabinet; workspaces/tasks/league/share/profile surfaces; sign-in; relationship to desktop; current parity caveats.
- **platform/hybrid-host:** concept of a "host"; the two attach modes (diagram 2.2); decision matrix (own machine vs cloud); links to cloud-hosts + remote-workspaces.
- **platform/cloud-hosts:** managed providers (`listProviders`), provisioning persistent vs ephemeral sandbox (`provision`), sandbox images per project, lifecycle/teardown, billing tie-in to economy.
- **platform/mobile:** install status, sign-in, device presence, attach-to-host, feature scope vs desktop, limitations.
- **security/auth-model:** magic link, GitHub, dev local-admin; session + organization/membership/roles; rate limits.
- **security/api-keys:** create/list/revoke, where used (CLI, SDK, MCP, REST), scope/expiry, storage guidance.
- **security/oauth-oidc:** the three `.well-known` endpoints, OAuth consent (`apps/web/src/app/oauth/consent`), using Rox as an OAuth provider.
- **security/device-auth:** desktop connect flow, CLI auth flow, relay security posture & risks (lift from remote-workspaces callout).
- **economy/overview:** Rox token definition, 500 starting balance, balance model, zero-balance behavior.
- **economy/usage-metering:** per-request metering (tokens/cost/trace), model catalog, how cost is computed.
- **economy/top-ups:** USDT via dv.net invoice flow, top-up statuses, append-only ledger, balance API.
- **api/overview:** base URL, Bearer auth, tRPC-over-HTTP shape, error envelope, batching, links to SDK.
- **api/<domain> pages:** per-procedure name, input (from Zod), output, curl + SDK snippet.
- **api/mcp-tools:** full per-tool catalog for v2 MCP, grouped by domain.
- **self-host/overview:** service map + diagram, ports table (from AGENTS.md/docker-compose), prereqs.
- **self-host/docker-compose:** step-by-step from `docker-compose.yml` + `.rox/setup.local.sh`.
- **self-host/env-reference:** full env matrix (api/web/auth/db/electric/relay).
- **self-host/database:** Neon vs self-host PG, neon-proxy, Electric, `drizzle-kit generate` migration policy (per AGENTS.md).
- **self-host/render:** Render service reference distilled from `docs/render-deploy.md`.
- **self-host/upgrades:** version bump, migrate, rollback runbook.

---

## 3. Phase-2 implementation tasks (bite-sized, content-TDD)

"Test" for docs = (a) `bun run --filter @rox/docs build` (fumadocs/Next build) passes, (b) every `meta.json` page slug resolves to an existing `.mdx`, (c) no broken internal links, (d) `/llms-full.txt` builds. Author RU content matching existing tone. Each task = create file(s) + register in `meta.json`.

**Wave P0 (highest value, lowest drift):**
1. **self-host section.** Create `self-host/overview.mdx`, `docker-compose.mdx`, `env-reference.mdx`, `database.mdx`, `render.mdx`, `upgrades.mdx`. Source: `DEVELOPMENT.md`, `docker-compose.yml`, `docs/render-deploy.md`, AGENTS.md ports table. Add `---Server Самостоятельный хостинг---` block to `meta.json`. Verify: build + page slugs resolve.
2. **security section.** Create `security/auth-model.mdx`, `api-keys.mdx`, `oauth-oidc.mdx`, `device-auth.mdx`. Source: `packages/auth/src/server.ts`, `lib/*`, `.well-known/*` routes, api-key router. Register in `meta.json`. Verify build.
3. **economy section.** Create `economy/overview.mdx`, `usage-metering.mdx`, `top-ups.mdx`. Source: `packages/db/src/schema/economy.ts` (confirm `STARTING_BALANCE_ROX`), `usageRouter`. Use `<DatabaseTable>` for ledger/balance shapes. Register. Verify build.

**Wave P1:**
4. **platform section.** Create `platform/web-app.mdx`, `hybrid-host.mdx` (embed diagram 2.2), `cloud-hosts.mdx`, `mobile.mdx`. Source: `apps/web/src/app/**`, `apps/mobile/**`, `v2-host` router + `v2_hosts`/`sandbox_images` schema. Cross-link `remote-workspaces.mdx`. Register `---Layers Платформа---`. Verify build.
5. **api/overview + mirror SDK-covered domains.** Create `api/overview.mdx` + `api/{tasks,workspaces,projects,hosts,agents,automations}.mdx` mirroring SDK reference but framed as the HTTP/tRPC contract. Register `---Code2 API Reference---`. Verify build + cross-links to `sdk/reference`.
6. **api/mcp-tools.mdx.** Full per-tool catalog from v2 MCP transport. Register under API section. Verify build.

**Wave P2:**
7. **Remaining API domains.** `api/{organization,usage,chat,v2-host,integrations}.mdx` from their routers. Register. Verify build.
8. **Backfill thin pages + flag note.** Expand `cli/env-vars.mdx` (22→full env), `browser.mdx`, `overview.mdx` (add platform/self-host links); add a short note evaluating Zod-driven API-reference generation (decision only, no codegen — codegen would be a separate non-WS-H workstream since it touches source). Verify build.

---

## 4. File ownership (Phase-2 merge isolation)

**This workstream owns and may modify ONLY:**
- `apps/docs/content/docs/meta.json` (the ONLY shared-risk file — additive edits to `pages` array only; coordinate ordering with no other WS since only WS-H edits docs content)
- `apps/docs/content/docs/self-host/**` (NEW)
- `apps/docs/content/docs/security/**` (NEW)
- `apps/docs/content/docs/economy/**` (NEW)
- `apps/docs/content/docs/platform/**` (NEW)
- `apps/docs/content/docs/api/**` (NEW)
- `apps/docs/content/docs/cli/env-vars.mdx`, `apps/docs/content/docs/browser.mdx`, `apps/docs/content/docs/overview.mdx`, `apps/docs/content/docs/mcp.mdx` (backfill only)
- `apps/docs/content/docs/*.section meta` if sub-section `meta.json` files are added under new dirs (e.g. `self-host/meta.json`)

**Explicitly NOT owned (do not touch):** any `.ts`/`.tsx` under `apps/docs/src/**`, `apps/docs/source.config.ts`, any source code in `packages/**` or other `apps/**`, `docs/render-deploy.md` (home-dir), `README.md`, `DEVELOPMENT.md`. WS-H is content-only.

---

## 5. Dependencies & wave

- **Soft-depends on (for accuracy, not for merge):** the implementation workstreams that finalize hybrid-host (cloud sandbox provider list, web agents cabinet parity), economy (final `STARTING_BALANCE_ROX` and top-up flow), and any API surface changes. WS-H is **last-writer documentation** — it can start P0 (self-host/security/economy describe already-shipped code) immediately, but `platform/*` and `api/*` (P1) should land **after** their corresponding implementation PRs merge so docs match shipped behavior.
- **Zero file overlap** with any other workstream (content-only, isolated dir). Merges cleanly regardless of order.
- **Coordinate with:** whichever WS owns the hybrid-host (cloud/relay) implementation and the economy/billing implementation — read their final PRs before authoring `platform/*` and `economy/*`.
- **Suggested wave:** P0 = self-host + security + economy-overview (describe shipped code). P1 = platform/* + api/* (after impl PRs). P2 = remaining api domains + backfill.

---

## 6. Target PR

- **Branch:** `docs/convergence-coverage-ws-h`
- **PR title:** `docs(ws-h): add self-host, security, economy, platform/hybrid-host & API reference coverage`

---

## 7. Hardening review

Read-only verification pass against the live tree (cwd = repo root). Spot-checked every load-bearing file:line claim with Glob/Grep/Read.

### 7a. Factual corrections (with file:line)

1. **Router count is 38, not 37.** Spec §1b line 39 prose says "37 tRPC routers," but its own enumeration lists 38 names and the code confirms 38: `packages/trpc/src/root.ts:44-83` (grep `-c "Router,"` = 38). The list (achievements…workspace) is otherwise accurate and complete. **Fix:** change "37" → "38" in line 39.

2. **`<Collapsible>` and `<AsideLink>` are NOT MDX-usable — authoring hazard.** Spec intro (line 5) lists them as "Components available in MDX." They are NOT registered in `getMDXComponents()` (`apps/docs/src/mdx-components.tsx:16-31`, which exposes only `Command`, `CommandReturns`, `DatabaseTable`, `DownloadButton`, `ResourceCard`, `ResourceGrid`, `YouTubeVideo`, `Tabs`, `Tab` + `...defaultMdxComponents`). `Collapsible` exists only as site chrome (`.../TableOfContents/TableOfContents.tsx:16-19`) and `AsideLink` only in the sidebar (`.../Sidebar/Sidebar.tsx:8`). Using either in a `.mdx` body will fail to render / break the build. **Fix:** remove `<Collapsible>` and `<AsideLink>` from the MDX-available list. `<Callout>` and `<Tabs>/<Tab>` are valid — Callout comes via fumadocs `defaultMdxComponents` (`mdx-components.tsx:18`; proven by existing use in `remote-workspaces.mdx`, `cli/cli-reference.mdx`, `cli/getting-started.mdx:6`), Tab/Tabs are explicitly registered (`mdx-components.tsx:28-29`).

3. **`STARTING_BALANCE_ROX` does not live in economy.ts.** Spec §3 task 3 (line 164) and the honesty note (line 55) tell authors to "confirm `STARTING_BALANCE_ROX`" in `packages/db/src/schema/economy.ts`. The constant is actually defined in `packages/shared/src/rox-pricing.ts:17` (`= STARTING_BALANCE_USDT * ROX_PER_USDT; // 500`, asserted `=== 500` in `rox-pricing.test.ts:20`). economy.ts only references it in a comment (`economy.ts:190`) and hardcodes `.default("500")` on `balanceRox` (`economy.ts:193`). **Fix:** point authors at `packages/shared/src/rox-pricing.ts:17` for the canonical constant. (All other economy line cites verified: `modelCatalog` 53, `roxTopups` 105, `usageRequests` 138, `roxBalances` 182, `roxLedger` 213, enums 46-47 — all correct.)

4. **`docs/render-deploy.md` is git-tracked and in-repo, not "uncommitted / home-dir-scoped."** Spec line 43 + line 55 + §4 line 189 describe it as uncommitted and home-dir. `git ls-files docs/render-deploy.md` returns it (tracked); it sits at repo-relative `docs/render-deploy.md` (1759 bytes). The repo's opening `git status` snapshot listed it under `??`, but it has since been committed. **Fix:** drop "uncommitted" and "(home-dir)"; treat it as a normal in-repo source doc. (Note: it is still OUTSIDE WS-H's owned paths — see merge-safety below — so the §4 "do not touch" instruction stays correct in intent.)

5. **`provision` proc line cite is slightly off.** Spec line 51 says `v2-host.ts:408-422`. Actual: `listProviders` at `:398` (correct), `provision` at `:413` (spec wrote 408). Minor; `provision` block spans ~413+. **Fix:** `408` → `413`.

6. **SDK domain count internally inconsistent (terminals).** §1b line 35 correctly says SDK reference covers 7 domains and lists `terminals` (confirmed `sdk/reference.mdx:243`). But the IA (line 99) and P1 task 5 (line 168) mirror only `{tasks,workspaces,projects,hosts,agents,automations}` — omitting `terminals`. Either add `api/terminals.mdx` to the mirror set or note the deliberate drop. Not an error, but a gap the author should resolve.

**Verified-correct claims (no change needed):** `root.ts:44-83` enumeration; `economy.ts` table line numbers; `usageRouter` `summary` public `:46` / `recordBatch` protected `:115`; `v2Hosts` `schema.ts:543`, `sandboxImages` `schema.ts:730`; `listProviders` `:398`; well-known endpoints (`oauth-authorization-server`, `oauth-protected-resource`, `openid-configuration` all present); API route paths (`api/trpc`, `api/chat/[sessionId]/stream`, `api/agent/[transport]`, `api/v2/agent/[transport]`, `api/journal/generate`, `api/memory/import`, `api/integrations/discord`, `api/desktop/version`, `api/auth/desktop/connect`); `/llms-full.txt/route.ts:6` auto-index; README.md = 0 bytes; doc line counts (overview 29, cli-reference 1067, env-vars 22, mcp 301, sdk/reference 338, remote-workspaces 73); `remote-workspaces.mdx` `pro:true`; CLI Beta callout `cli/getting-started.mdx:6`.

### 7b. Open questions (not fully answered by the spec)

1. **Build/test command unverified.** §3 line 159 defines the docs "test" as `bun run --filter @rox/docs build`. The exact filter name (`@rox/docs`) and that this build is green today were not run (read-only pass). Author should run it once before relying on it as the DoD gate.
2. **`<DatabaseTable>` input shape.** §3 task 3 (line 164) prescribes `<DatabaseTable>` for ledger/balance shapes but the spec never documents that component's props. Author must read `apps/docs/src/components/DatabaseTable.tsx` before use.
3. **Per-section `meta.json` mechanics.** §4 line 187 allows adding `self-host/meta.json` etc., but the spec doesn't confirm whether fumadocs here uses nested `meta.json` per dir or a single root file (root `meta.json` is 41 lines; `cli/` and `sdk/` each have their own 5-line `meta.json`, suggesting nested is supported). Worth an explicit confirmation before authoring 5 new sub-section metas.
4. **economy enum *values*.** Spec names enums `rox_ledger_kind`/`rox_topup_status` but never enumerates their member values (needed to document ledger kinds and top-up statuses accurately). They live in `packages/db/src/schema/enums.ts` (`roxLedgerKindValues`, `roxTopupStatusValues`) — author must read them.
5. **Integrations breadth understated.** §1b line 41 names only "discord integration" under integrations, but the tree has discord, lark, linear, notion, telegram, fibery, slack (`apps/api/src/app/api/integrations/**`). If an integrations doc page is in scope (IA line 100 `api/integrations`), it must cover all 7, not just discord.

### 7c. Merge-safety check (file-ownership overlap vs siblings)

Sibling ownership rule per the brief: each WS owns a disjoint slice; schema is owned by **WS-O** except `economy.ts` owned by **WS-E**.

- **WS-H owned paths (§4 lines 180-188):** `apps/docs/content/docs/meta.json`, `apps/docs/content/docs/{self-host,security,economy,platform,api}/**` (all NEW), and backfill-only edits to `cli/env-vars.mdx`, `browser.mdx`, `overview.mdx`, `mcp.mdx`, plus any new sub-section `meta.json` under the new dirs. **All confined to `apps/docs/content/docs/**`.**
- **Overlap result: NONE.** No WS-H owned path is a `.ts`/`.tsx`/schema/source file. WS-H does not write `packages/db/src/schema/economy.ts` (WS-E) or any other schema (WS-O); it only *reads* them as source material. No collision with WS-A…WS-G, WS-I…WS-O on the documented ownership boundaries.
- **Watch item (not an overlap, but adjacency):** the spec repeatedly cites `docs/render-deploy.md` and `README.md`/`DEVELOPMENT.md` as *sources*. §4 line 189 correctly forbids modifying them. Since `docs/render-deploy.md` is now git-tracked, if any other WS owns top-level `docs/**` there could be a future read-vs-write question — but WS-H only reads it, so still no write overlap. Flag for the convergence lead only if a sibling claims `docs/**`.
- **`meta.json` shared-risk:** §4 line 181 calls the root `meta.json` the one shared-risk file. Confirmed only WS-H touches docs content, so additive `pages`-array edits are conflict-free **as long as** no other WS edits `apps/docs/**`. Low risk.

### 7d. Confidence per major claim

| Major claim | Confidence | Basis |
|---|---|---|
| Desktop/CLI/SDK page-by-page coverage (§1a) | High | All cited files exist; line counts re-measured and match. |
| "API reference missing; 38 routers" (§1b #1) | High (count corrected 37→38) | `root.ts:44-83` read directly. |
| "Self-host docs missing" (§1b #2) | High | No `self-host/` dir exists; README empty; sources confirmed in-repo. |
| "Auth/security model missing" (§1b #3) | Medium-High | well-known + auth/desktop/connect routes confirmed; did not open every `packages/auth/lib/*` cited. |
| "Economy missing; 500 starting balance" (§1b #4) | High | economy.ts tables + `STARTING_BALANCE_ROX===500` verified (in rox-pricing.ts, not economy.ts). |
| "Mobile app real, undocumented" (§1b #5) | Medium | Inferred from prior agent; mobile tree not re-walked this pass. |
| "Web + hybrid host; v2_hosts cloud arm" (§1b #6) | High | `v2Hosts` schema:543, `sandboxImages`:730, `provision`/`listProviders` confirmed. |
| "MCP catalog partial" (§1b #7) | Medium-High | `mcp.mdx` 301 lines + v2 transport route exist; per-tool completeness not diffed. |
| Target IA + per-page outlines (§2) | Medium | Structurally sound; depends on the corrections above (terminals, Collapsible/AsideLink) and unrun build. |
| File-ownership isolation (§4) | High | All owned paths under `apps/docs/content/docs/**`; zero source overlap. |

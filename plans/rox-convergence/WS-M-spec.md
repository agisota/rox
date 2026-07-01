# WS-M: SDK + CLI Explainer & Roadmap — Spec

> Lighter, mostly-explanatory workstream. Purpose: produce the authoritative
> reference for what `@rox_sh/sdk` and the `rox` CLI are, how they relate to the
> API, and a small roadmap for evolving them as web<->desktop convergence lands
> new tRPC procedures. This workstream OWNS documentation + a regenerable
> command/procedure inventory; it does NOT change runtime CLI/SDK behavior in P0.

---

## 1. Findings (evidence-grounded)

### 1.1 What `@rox_sh/sdk` is, why it is PUBLIC, what it exposes

- **Identity.** The package is named `@rox/sdk` internally but **publishes publicly as `@rox_sh/sdk`** via `publishConfig` (`packages/sdk/package.json:2,14-18` — `"publishConfig": { "name": "@rox_sh/sdk", "access": "public" }`). License is `Apache-2.0` (`package.json:7`), unlike the rest of the private monorepo. So it is the one deliberately public, redistributable artifact.
- **What it is.** A **typed TypeScript wrapper around the Rox public API** — "Mirrors the `rox` CLI 1:1 — same procedures, same shapes" (`packages/sdk/README.md:3`). It is a **Stainless-style generated client** structurally (the `// File generated from our OpenAPI spec by Stainless` header is on `src/client.ts:1`, `src/index.ts:1`, and every `src/internal/*` + `src/core/*` file), but **see 1.5 — it is currently hand-maintained, not live-generated.**
- **Why PUBLIC.** It is the programmatic surface for **external developers + automation/agents** to drive Rox without the CLI binary: create/list/update tasks, list workspaces/projects/hosts/automations, trigger automations off-schedule, and (relay-routed) create workspaces/agents/terminals on a developer's machine. README quickstart (`README.md:14-39`) shows the full intended consumer ergonomics.
- **What it exposes (resources → client accessors, `src/client.ts:1117-1133`):**
  - `tasks` — create / retrieve / list / update / delete + nested `tasks.statuses.list` (`resources/tasks.ts:34-121`).
  - `workspaces` — list / create / update / delete (`resources/workspaces.ts:15-118`).
  - `projects` — list (`resources/projects.ts`).
  - `hosts` — list (`resources/hosts.ts`).
  - `automations` — full CRUD + run / pause / resume / logs / prompt get|set (`resources/automations.ts:10-167`).
  - `agents` — list / create (`resources/agents.ts`).
  - `terminals` — create (`resources/terminals.ts`).
  - `organization` — nested `organization.members.list` (`resources/organization.ts`).
  - Error classes: `APIError`, `NotFoundError`, `RateLimitError`, `AuthenticationError`, etc. (`src/index.ts` error block; `client.ts:1101-1113`).
  - Top-level type exports so consumers can `import { type Task } from '@rox_sh/sdk'` (`src/index.ts:26+`).
- **Transport detail (important, honest):** the SDK does **not** speak a REST surface — it calls tRPC procedures over HTTP. `mutation()`/`query()` wrap the SuperJSON tRPC envelope `{ result: { data: { json } } }` and hit `/api/trpc/<procedure>` (`client.ts:472-500`). The `api.md` "post /api/trpc/task.create" annotations confirm the wire layer is tRPC, not idiomatic REST (`packages/sdk/api.md:13-18`).
- **Two transport paths (relay):** most calls hit `api.rox.one`; `workspaces.create/delete`, `agents.list/create`, `terminals.create` physically run on a developer machine and are routed through the **relay tunnel** via `hostMutation()/hostQuery()` to `${relayURL}/hosts/<orgId>:<hostId>/trpc/<procedure>` (`client.ts:510-571`, `README.md:74-78`). For these the SDK transparently exchanges the API key for a **short-lived JWT** (`GET /api/auth/token`, 1h TTL, cached 55m, single-flight) (`client.ts:579-619`). Relay-bound calls require `organizationId` and the host online, else `503 Host not connected` (`README.md:78`).
- **Auth model (`client.ts:351-362`):** keys prefixed `sk_live_`/`sk_test_` → `x-api-key`; anything else → `Authorization: Bearer`. Org scoping via `x-rox-organization-id`. Env defaults: `ROX_API_KEY`, `ROX_ORGANIZATION_ID`, `ROX_BASE_URL`, `ROX_RELAY_URL`, `ROX_LOG` (`client.ts:251-309`). Default `baseURL = https://api.rox.one`, `relayURL = https://relay.rox.one`.
- **Build/publish.** `scripts/build.ts` produces a publish-ready `dist/` (ESM + CJS via `bun build`, `.d.ts` via `tsc`, rewritten `dist/package.json` with the public name and empty `dependencies`), then `cd dist && npm publish --access public` (`scripts/build.ts:1-101`). **Zero runtime dependencies** — fully self-contained, web/node/edge-portable (the `internal/shims`, `detect-platform` machinery exists precisely for cross-runtime fetch).

### 1.2 The `rox` CLI purpose and command set

- **Purpose.** The `rox` CLI is the **human + agent operator surface** for Rox: authenticate, manage cloud resources (tasks, projects, automations, org), inspect hosts, manage on-machine workspaces/agents/terminals via the host service, and run the local **host service lifecycle** (`start`/`status`/`stop`) that connects a developer machine to the relay so any client (web/mobile/desktop) can reach it (`packages/cli/DISTRIBUTION.md:5-10`).
- **Command set (verified against `src/commands/**/command.ts` + `CLI_SPEC_CURRENT.md:60-108`):**
  - `agents` → `create`, `list`
  - `auth` → `login`, `logout`, `whoami`
  - `automations` → `create`, `delete`, `get`, `list`, `logs`, `pause`, `prompt {get,set}`, `resume`, `run`, `update`
  - `hosts` → `list`
  - `organization` (alias `org`) → `list`, `members list`, `switch`
  - `projects` → `create`, `list`, `setup`
  - `tasks` (alias `t`) → `create`, `delete`, `get`, `list`, `statuses list`, `update`
  - `terminals` (alias `term`) → `create`
  - `workspaces` (alias `ws`) → `create`, `delete`, `list`, `open`, `update`
  - top-level host lifecycle: `start`, `status`, `stop`; plus `deploy`, `update`
  - aliases: `auto`→automations, `org`→organization, `t`→tasks, `term`→terminals, `ws`→workspaces (`CLI_SPEC_CURRENT.md:48-56`)
- **Global options (`cli.config.ts:22-28`, `CLI_SPEC_CURRENT.md:114-134`):** `--json` (auto-on under CI/agent envs `CLAUDE_CODE|CLAUDECODE|CODEX_CLI|GEMINI_CLI|ROX_AGENT|CI|…`), `--quiet` (IDs only), `--api-key` (`ROX_API_KEY`), `--help/-h`, `--version/-v`.
- **Auth.** Browser OAuth2 + **PKCE** with loopback redirect (ports 51789-51793) and a paste-code fallback for headless/SSH (`src/lib/auth.ts:9,175-414`); refresh-token rotation (`auth.ts:245-280`). Or non-interactive via `--api-key`/`ROX_API_KEY`.
- **API transport.** The CLI talks to the API through a **real tRPC client typed against `AppRouter`** — `createTRPCClient<AppRouter>` with `httpBatchLink` + SuperJSON, same `x-api-key`/`Bearer` + org-header rule as the SDK (`src/lib/api-client.ts:1-37`). Commands call e.g. `ctx.api.task.create.mutate({...})` (`commands/tasks/create/command.ts:36`). Host-routed commands (`workspaces`, `terminals`, `agents`) resolve a host target and tunnel through relay (`src/lib/host-target/*`, `src/lib/host/*`).
- **Distribution.** Bun-compiled single binary per platform (`build:darwin-arm64`, `build:linux-x64`) plus a Node-runtime `rox-host` for native deps (`better-sqlite3`, `node-pty`) — two-runtime tarball (`DISTRIBUTION.md`). Desktop bundles the CLI into `~/.rox/bin/rox` and shares the host manifest schema so desktop- and CLI-started hosts discover each other (`CLI_SPEC_CURRENT.md:147-163`). Built on the in-house **`@rox/cli-framework`** (Bun-native command router/parser/help/build, `bin: cli-framework`, `packages/cli-framework/src/index.ts`).

### 1.3 Relationship SDK <-> CLI <-> API ("mirrors CLI 1:1")

The mirror is a **manual convention, not a generation pipeline.** Three independent clients over one tRPC `AppRouter`:

```
                         ┌──────────────────────────────────────┐
                         │  apps/api  (Next.js 16)               │
                         │  tRPC AppRouter @rox/trpc             │
                         │  /api/trpc/<procedure>   (SuperJSON)  │
                         │  /api/auth/* (better-auth, OAuth+key) │
                         └──────────────┬───────────────────────┘
            x-api-key / Bearer + x-rox-organization-id
        ┌───────────────────────────────┼───────────────────────────────┐
        │                               │                               │
┌───────▼────────┐            ┌─────────▼─────────┐           ┌─────────▼──────────┐
│ @rox_sh/sdk    │            │ rox CLI           │           │ web/mobile/desktop │
│ (PUBLIC)       │            │ @rox/cli          │           │ (typed tRPC hooks) │
│ hand-written   │            │ createTRPCClient  │           │ react-query        │
│ tRPC wrapper;  │            │ <AppRouter>;      │           │                    │
│ TRPCEnvelope   │            │ ctx.api.x.y.mutate│           │                    │
│ unwrap by hand │            │ FULLY TYPED       │           │                    │
└───────┬────────┘            └─────────┬─────────┘           └────────────────────┘
        │ relay JWT exchange            │ relay host-target
        └───────────────┬───────────────┘
              ┌──────────▼──────────┐
              │ apps/relay (Fly)    │  ${relay}/hosts/<org>:<host>/trpc/<proc>
              │ JWT-only tunnel     │──► host-service (better-sqlite3 + node-pty)
              └─────────────────────┘
```

- **"Mirrors 1:1" = a hand-kept naming map**, evidenced by the `Mirrors `rox <cmd>`` JSDoc on every SDK method (e.g. `resources/automations.ts:10,27,43,…`; `resources/hosts.ts:11`; `resources/workspaces.ts:21`). There is **no codegen step** wiring CLI → SDK.
- **SDK and CLI share the same tRPC procedure names** but reach them differently: CLI imports `AppRouter` types directly (`api-client.ts:2`, compile-time safety); the SDK **re-declares** every input/output type by hand in `resources/*.ts` and calls `client.query("task.list", …)` with **string procedure paths** (`resources/tasks.ts:91`). The SDK additionally reshapes internal wire shapes (e.g. `{ task, txid }` → clean `Task`) for external consumers (`resources/tasks.ts:10-17,48-52`).
- **The SDK is not consumed anywhere in the monorepo** — grep for `@rox/sdk`/`@rox_sh/sdk` outside `packages/sdk` returns nothing in `apps/**` or other `packages/**` (verified). It is a pure outbound public deliverable; the CLI does **not** use it.

### 1.4 How auth/versioning works today (the evolution substrate)

- **Auth surfaces are stable + shared:** `x-api-key` for `sk_live_`/`sk_test_`, `Bearer` for OAuth/JWT, `x-rox-organization-id` for scoping, and `GET /api/auth/token` to mint relay JWTs. New resources inherit auth for free.
- **Versioning today is ad-hoc with drift:** SDK `package.json` `version = 0.0.1-alpha.12` (`packages/sdk/package.json:3`) but `src/version.ts` `VERSION = 0.0.1-alpha.7` — **these disagree** and `version.ts` (which feeds the `User-Agent`, `client.ts:368-370`) is stale. Similarly CLI `package.json` `0.2.22` vs `cli.config.ts` hard-coded `VERSION = "0.2.19"` (`cli.config.ts:3`) vs `CLI_SPEC_CURRENT.md` "Built version 0.2.14". **Version is duplicated in 2 places per package and is out of sync in both** — a real maturity gap this workstream documents and fixes the *process* for.

### 1.5 Honest maturity / stubs / gaps

- **"Generated by Stainless" is aspirational, not wired.** The header sits on every file, but there is **no Stainless config, no OpenAPI spec, no generation command anywhere in the repo** (search for `*stainless*`/`openapi*` finds only worktree skill folders, not a spec). The SDK is **hand-maintained generated-style code**. CONTRIBUTING.md referenced by the header does not exist in `packages/sdk`. → If/when Stainless is adopted, hand edits will be clobbered; if it is not, the header is misleading. Decision needed (roadmap §3).
- **Version drift** (1.4) — process bug, not behavior bug.
- **No SDK tests.** `packages/sdk` has `typecheck` only; no test files (compare CLI which has `auth.test.ts`, `config.test.ts`, `host/spawn.test.ts`, `resolve-auth.test.ts`). The "mirror" invariant is **unverified by CI**.
- **CLI `TODO.md` describes a much larger intended surface** than what ships: `devices`, `chat`, UI commands (`focus`, `sidebar`, `tabs`, `panes`), pane commands (`terminal send/read`, `browser navigate/cdp-url`), `ports`, `cron` — none implemented yet (`packages/cli/TODO.md:28-34`). These are exactly the **convergence surface** other workstreams (hosts/relay/agents/terminals) will land server-side, after which CLI+SDK must catch up.
- **`docs.rox.one` is the canonical public docs** (README links), but the in-repo `apps/docs/content/docs/cli/` + `apps/docs/.../sdk/` are the source — keeping them honest with the implemented surface is unowned today (`CLI_SPEC_CURRENT.md:1-6`).

---

## 2. Target design

### 2.1 Decision: the mirror must become *enforced*, not *aspirational*

There are two coherent end states. This spec recommends **Option B**, with **Option A as the only acceptable alternative if Stainless is genuinely adopted org-wide**.

| Option | What | Pros | Cons |
|---|---|---|---|
| **A. Real Stainless pipeline** | Emit an OpenAPI/tRPC-OpenAPI spec from `AppRouter`, feed Stainless, commit generated SDK | Header becomes true; auto-mirror | Stainless account/CI cost; tRPC→OpenAPI lossy for relay-routed procs; large infra lift — out of scope for convergence |
| **B (recommended). Keep hand-written SDK, ADD a CI mirror-parity test** | A test enumerates CLI command leaves + SDK methods + `AppRouter` procedure keys and asserts the documented 1:1 map; remove/repair the misleading "Stainless" header | Cheap, true today, catches drift, no external dep | Still manual to add a new resource (but now *guarded*) |

```
Recommended steady state (Option B):

 AppRouter (source of truth for procedures)
        │  (type import)              │  (string-path call)
        ▼                            ▼
   rox CLI  ──parity test──►  @rox_sh/sdk  ──parity test──►  docs (cli/ + sdk/)
        ▲                            ▲
        └──────── single MIRROR.md map (owned here) ─────────┘
```

### 2.2 Single source: `MIRROR.md` + parity test

Author one machine-checkable map: `CLI command` ↔ `SDK method` ↔ `tRPC procedure` ↔ transport (direct/relay) ↔ docs page. A Bun test reads the CLI command tree (filesystem under `src/commands`), the SDK method list (introspect resource classes or a static manifest), and asserts every row of `MIRROR.md` resolves on all sides. New convergence procedures fail CI until SDK+CLI+docs catch up — turning "mirrors 1:1" from a comment into an invariant.

### 2.3 Version single-sourcing

Make `version.ts` / `cli.config.ts` import the version from their own `package.json` (Bun supports `import pkg from "../package.json"`), eliminating the two-place drift. One number per package, set by the release flow.

---

## 3. Phase-2 implementation tasks (bite-sized, TDD where it applies)

> This is a docs+guardrails workstream. Tasks 1-2 are explanatory deliverables; 3-5 add the cheap enforcement that makes the explainer stay true. No runtime behavior of CLI/SDK changes.

1. **`packages/sdk/EXPLAINER.md` (new).** Author the canonical "what/why/how" for the public SDK: identity (`@rox_sh/sdk`, public, Apache-2.0), purpose, resource catalog, two transport paths (direct vs relay-JWT), auth/env matrix, build/publish flow. Pull every claim from §1.1 with file refs. *Test:* none (prose); reviewed against `README.md` for consistency.

2. **`packages/cli/CLI_OVERVIEW.md` (new) + refresh `CLI_SPEC_CURRENT.md`.** Document purpose, full command tree (regenerated from `find src/commands -name command.ts`), global options, auth (OAuth+PKCE+paste, api-key), host-service lifecycle, distribution/two-runtime model, and the relationship to `@rox/cli-framework`. Update the stale "Built version" line and the 2026-05-12 date. *Test:* a `bun test` that regenerates the command list and diffs it against the doc's fenced block (fails if the tree drifts).

3. **`packages/sdk/MIRROR.md` (new) — the 1:1 map.** One table: CLI leaf · SDK method · tRPC procedure · transport · docs page, covering all current resources (tasks, workspaces, projects, hosts, automations, agents, terminals, organization). *Test approach for task 4.*

4. **`packages/sdk/src/__tests__/mirror-parity.test.ts` (new).** Bun test that (a) walks `packages/cli/src/commands/**/command.ts` to derive the CLI leaf set, (b) reads `MIRROR.md` rows, (c) asserts each SDK method named in the map exists on the instantiated `Rox` client, and (d) asserts each CLI leaf has a row. Expected behavior: green now; **red the moment a new procedure is added on only one side.** Add `"test": "bun test"` to `packages/sdk/package.json` scripts.

5. **Version single-sourcing (small, safe edits).** Change `packages/sdk/src/version.ts` to re-export `version` from `../package.json`; change `packages/cli/cli.config.ts` to read `VERSION` from `./package.json`. *Test:* a unit test asserting `VERSION === pkg.version` for each package (guards future drift). This is the only `*.ts` source touched and is intentionally trivial + reversible.

6. **`packages/sdk` header decision (doc-only in P0).** In `EXPLAINER.md` record the explicit decision: "hand-maintained, Stainless-style; the file header is historical." Add a short `packages/sdk/CONTRIBUTING.md` describing the hand-edit + parity-test workflow (the header references a CONTRIBUTING.md that does not exist). Do **not** mass-edit the generated headers in P0 (noise/merge risk); flag as a P2 cleanup.

7. **Roadmap section in `EXPLAINER.md`: convergence catch-up.** Enumerate the `TODO.md` surface (`chat`, `devices`, UI/pane/`ports`/`cron` commands) as the **forward backlog**, mapped to which convergence workstream lands the server procedure first, and the standing rule: *new public procedure ⇒ add CLI leaf + SDK method + MIRROR row + docs page in the same PR, gated by the parity test.*

### Roadmap (the "how to evolve" deliverable, condensed)

- **Adding a resource:** land tRPC procedure (other WS) → add SDK `resources/<x>.ts` (hand-written: types + `client.query/mutation` or `hostMutation` for relay-routed) → add CLI `commands/<x>/<verb>/command.ts` → add `MIRROR.md` row → add docs page → parity test must stay green.
- **Versioning:** semver per package, single-sourced from `package.json` (task 5). SDK stays `0.x` (alpha) until the procedure surface stabilizes post-convergence; bump on every published resource change. CLI bumps on command-surface changes.
- **Auth evolution:** keep the `x-api-key` vs `Bearer` discriminator and `x-rox-organization-id` scoping; new relay-routed procedures reuse `hostMutation/hostQuery` + the existing JWT exchange — no new token plumbing.
- **Publishing:** SDK via `scripts/build.ts` → `npm publish --access public` as `@rox_sh/sdk`; CLI via per-platform Bun binaries + desktop bundling (unchanged).

---

## 4. File ownership (Phase-2 merge isolation)

This workstream **owns/creates** (and may modify):

- `packages/sdk/EXPLAINER.md` *(new)*
- `packages/sdk/MIRROR.md` *(new)*
- `packages/sdk/CONTRIBUTING.md` *(new)*
- `packages/sdk/src/__tests__/mirror-parity.test.ts` *(new)*
- `packages/sdk/src/version.ts` *(small edit: single-source version)*
- `packages/sdk/package.json` *(add `test` script only)*
- `packages/cli/CLI_OVERVIEW.md` *(new)*
- `packages/cli/CLI_SPEC_CURRENT.md` *(refresh stale facts)*
- `packages/cli/cli.config.ts` *(small edit: single-source version)*
- `packages/cli/src/__tests__/command-tree-doc.test.ts` *(new, if not colocated)*
- `plans/rox-convergence/WS-M-spec.md` *(this file)*

**Explicitly NOT owned (read-only here):** any `packages/sdk/src/resources/*.ts`, `packages/sdk/src/client.ts`, `packages/cli/src/commands/**`, `packages/cli/src/lib/**`, `packages/cli-framework/**`, `apps/api/**`, `packages/trpc/**`. New SDK resources / CLI commands are added by the workstream that lands the underlying procedure (hosts/relay/agents WS), which then also updates `MIRROR.md` — coordinate via the parity test, do not author cross-resource runtime code here.

> Note: `cli.config.ts` and `version.ts` edits are the only runtime-source files touched. They are 1-3 line changes. If any other workstream also needs to touch these for a version bump, sequence WS-M last in its wave or let the release flow own the bump and drop tasks 5 from WS-M.

---

## 5. Dependencies + suggested wave

- **Depends on / coordinates with:**
  - **WS hosts/relay/agents/terminals workstreams** (the ones landing new `v2Host`/relay/`agents`/`terminals` procedures for convergence) — WS-M's `MIRROR.md` + parity test must be updated *by those workstreams* when they add a public procedure. WS-M provides the guardrail + map; it does not implement their procedures.
  - **WS-K / release-or-docs workstream** (if one owns `apps/docs/content/docs/{cli,sdk}` or the release/version flow) — align on who owns the version bump to avoid double-touching `version.ts`/`cli.config.ts`.
- **Nothing depends on WS-M to start** (no other workstream needs the explainer to compile).
- **Suggested wave: P2 (documentation + guardrail), startable in P0 for the explainer/MIRROR baseline.** The explainer + MIRROR baseline can land early (read-only research is done); the parity test should land *after* the first convergence procedures so it encodes the real target surface and doesn't churn. Recommend: baseline docs in P0/P1, enforcement test + version single-sourcing in P2.

---

## 6. Target PR

- **Branch:** `docs/ws-m-sdk-cli-explainer-roadmap`
- **PR title:** `docs(sdk,cli): explainer + 1:1 mirror map + parity guardrail and version single-sourcing (WS-M)`

---

### 7. Hardening review

Read-only verification pass against live code (HEAD on `t/marketing-landing-publish-20260619`, 2026-06-20). Every file:line cite in §1 spot-checked; merge-ownership cross-checked against all sibling specs WS-A…WS-O. The spec is **factually strong** — versions, ports, auth model, transport, build/publish, "no tests", "no Stainless config", and the TODO surface all verify. Corrections below are mostly cite-precision plus two that materially affect the §2.2 `MIRROR.md` / parity-test design.

#### (a) Factual corrections (file:line)

1. **`agents.create` calls tRPC procedure `agents.run`, NOT `agents.create` — affects MIRROR.md.** §1.1 line 24 lists "agents — list / create" and the JSDoc says `Mirrors `rox agents create``, but the SDK method maps to the host-routed procedure `agents.run`: `this._client.hostMutation<AgentCreateResult>(hostId, "agents.run", …)` (`resources/agents.ts:59`). It also does a cloud lookup first (`this._client.query<HostLookup | null>(…)`, `agents.ts:47`) to resolve `hostId`. **Impact:** the MIRROR.md row for `agents create` must record `tRPC procedure = agents.run` (+ a preceding host-lookup query), or the §2.2/§3-task-4 parity test will assert the wrong procedure name and either false-pass or false-fail. `agents.list` correctly uses `hostQuery("…")` (relay) per §1.1 — confirmed (`agents.ts:24`).

2. **`client.ts` accessor JSDoc is stale for workspaces — do NOT copy it into EXPLAINER.** §1.1 line 19 ("workspaces — list / create / update / delete") is CORRECT against the resource file (`resources/workspaces.ts:22,42,71,90` — all four exist; 256 lines). But the source-of-record JSDoc on the client accessor says only `/** Workspaces (cloud records): list, delete. */` (`client.ts:1120` region). The agents/terminals accessor comments are also terse. **Action:** EXPLAINER §resource-catalog must derive from `resources/*.ts` (authoritative), not the `client.ts` accessor comments, and the header decision (task 6) should note these stale accessor comments as part of the same "doc lagging behind code" cleanup. (Not in WS-M's write set — `client.ts` is read-only here — flag as a P2 source fix for whoever owns the SDK runtime.)

3. **Workspaces transport is MIXED, not uniformly relay — §1.1 line 30 wording is loose.** §1.1 line 30 groups "`workspaces.create/delete`, `agents.list/create`, `terminals.create`" as relay-routed. Verified per-method: `workspaces.create` → `hostMutation` (`workspaces.ts:46`, relay), `workspaces.delete` → `hostMutation` (`:103`, relay, after a cloud `HostLookup` query `:96`), but **`workspaces.update` → plain `mutation` (`:76`, DIRECT to api.rox.one)** and `workspaces.list` → `query` (`:26`, direct). README §74-78 states the relay set correctly (`workspaces.create`, `workspaces.delete`, `agents.list`, `agents.create`, `terminals.create` — `README.md:76`). So the claim is right but the MIRROR.md transport column must be **per-method** (update/list are direct even though create/delete are relay). No spec error; precision note for task 3.

4. **JWT cache nuance: effective refresh ≈50m, not 55m.** §1.1 line 30 says "1h TTL, cached 55m, single-flight." Verified: server issues 1h JWTs, `_jwtCache.expiresAt = now + 55*60_000` (`client.ts:617`), but `_getJwt` returns cache only while `expiresAt - 5*60_000 > now` (`client.ts:581`) — i.e. it proactively re-mints ~5 min before the 55m mark, so the real reuse window is ~50m. Single-flight via `_jwtInflight` confirmed (`client.ts:584-586`). Cosmetic; tighten if EXPLAINER quotes a number.

5. **CLI global-options cite is slightly over-scoped.** §1.2 line 49 attributes `--help/-h`, `--version/-v` to `cli.config.ts:22-28`. That globals block declares only `json`, `quiet`, `apiKey` (`cli.config.ts:24-28`); `--help`/`--version` are provided by `@rox/cli-framework`, not that block. `--json` auto-on/CI-env behavior and `--quiet`/`--api-key` are accurate. Minor; attribute help/version to the framework in CLI_OVERVIEW.

6. **Verified-exact (no change):** SDK `version.ts = 0.0.1-alpha.7` vs `package.json 0.0.1-alpha.12` drift ✓ (`version.ts:1`, `package.json:3`); CLI `cli.config.ts VERSION = 0.2.19` vs `package.json 0.2.22` vs `CLI_SPEC "Built version: 0.2.14"` ✓ (three-way drift real). `publishConfig {name:@rox_sh/sdk, access:public}` `package.json:14-16`, license Apache-2.0 `:7` ✓. mutation/query envelope unwrap `client.ts:472-500` ✓; hostMutation/hostQuery + relay URL `${relayURL}/hosts/${org}:${host}/trpc/${proc}` `client.ts:503-571` ✓; auth discriminator `sk_live_/sk_test_`→x-api-key else Bearer + `x-rox-organization-id` `client.ts:353-362` ✓; env defaults ROX_BASE_URL/API_KEY/ORGANIZATION_ID/RELAY_URL/LOG, default `https://api.rox.one` + `https://relay.rox.one` ✓. build.ts zero `dependencies:{}`, `publishConfig:{access:"public"}`, public-name rewrite, ESM+CJS+`.d.ts` ✓. CLI `createTRPCClient<AppRouter>` + httpBatchLink + SuperJSON + same headers `api-client.ts:2-30` ✓; `ctx.api.task.create.mutate` `tasks/create/command.ts:36` ✓; loopback ports 51789-51793 `auth.ts:9`, refresh `auth.ts:245` ✓. 41 `command.ts` leaves on disk match the §1.2 command tree exactly ✓ (incl. `deploy`, `update`, `start`/`status`/`stop`). SDK has **zero** test files ✓; CLI has auth/config/host-spawn/resolve-auth tests ✓. No Stainless config / OpenAPI spec / `CONTRIBUTING.md` in `packages/sdk` ✓ (only worktree skill folders match `*stainless*`/`openapi*`). SDK not imported anywhere outside `packages/sdk` ✓. TODO.md surface (devices/chat/UI/pane/ports/cron) at `TODO.md:28-33` ✓ (cite §1.5 line 98 "28-34" is correct). README relay section `74-78`, api.md tRPC annotations `13-18` ✓. CLI_SPEC date `2026-05-12` ✓.

#### (b) Questions not fully answered

1. **Does `agents.create`→`agents.run` mean the CLI `agents create` and SDK `agents.create` are NOT a clean 1:1 name match?** The mirror is method-name `create` ↔ CLI `create` but procedure `agents.run`. The parity test (task 4) needs an explicit policy: does it assert on **method/command name parity** (passes) or **procedure-name parity** (would need `agents.run` in the map)? Spec §2.2 says "assert every row resolves on all sides" — define which columns are keys.
2. **Is `tasks.statuses.list` (nested) enumerated as its own MIRROR row?** §1.1 lists it (`resources/tasks.ts:25`, proc `task.statuses.list`) and CLI has `tasks statuses list` (`commands/tasks/statuses/list/command.ts`). The §2.2 "CLI leaf" walker over `**/command.ts` will see it, but task 4's "each SDK method named in the map exists on the instantiated `Rox` client" must traverse **nested** accessors (`client.tasks.statuses.list`, `client.organization.members.list`, `client.automations.prompt.*`) — confirm the introspection handles 2-level nesting.
3. **What is the canonical version source the release flow writes?** Task 5 single-sources `version.ts`/`cli.config.ts` from `package.json`, but does not say whether the release flow (WS-K/release WS) bumps `package.json` directly or via a tool. If WS-M lands task 5 and a release WS also rewrites these, sequence is undefined (spec §4 note flags this but leaves the decision open).
4. **`@rox/cli-framework` ships a `cli-framework` bin (`package.json:5-6`) — is it itself a public artifact, or internal-only?** §1.2 line 52 calls it "in-house"; EXPLAINER should state whether it is part of the public SDK/CLI story or strictly a build-time dep, since it has a `bin`.

#### (c) Merge-safety check (file-ownership overlap vs WS-A…WS-O)

**Result: NO overlaps. WS-M's owned set is disjoint from every sibling.** WS-M writes only under `packages/sdk/**` (EXPLAINER.md, MIRROR.md, CONTRIBUTING.md, `src/__tests__/mirror-parity.test.ts`, `src/version.ts`, `package.json` test-script add), `packages/cli/**` (CLI_OVERVIEW.md, CLI_SPEC_CURRENT.md, `cli.config.ts`, `src/__tests__/command-tree-doc.test.ts`), and its own `plans/rox-convergence/WS-M-spec.md`. Cross-check:
- **`packages/sdk/**` and `packages/cli/**`** — claimed by NO sibling. WS-A…WS-O ownership lists touch `packages/db/schema`, `packages/trpc`, `packages/shared`, `packages/local-db`, `packages/collab|rtc|workflow-*|mcp-v2|agent-state`, `apps/{web,desktop,mobile,admin,docs,api,relay}`, host-service — none name `packages/sdk` or `packages/cli`. ✓
- **Schema rule** (schema = WS-O except `economy.ts` = WS-E): **N/A to WS-M** — WS-M authors no file under `packages/db/src/schema/**` and references `economy.ts` nowhere. ✓
- **`packages/trpc/src/root.ts`** (the one genuinely contended shared file across WS-J/WS-F/WS-O) — WS-M does NOT touch it. ✓ WS-M only *reads* `@rox/trpc`'s `AppRouter` type via the existing CLI import; the parity test reads the procedure surface read-only.
- **Self-flagged version-source coordination** (§4 note + §5) is a *sequencing* concern, not a file-ownership overlap: no sibling lists `packages/sdk/src/version.ts` or `packages/cli/cli.config.ts` in its owned set, so the only risk is a future release-WS double-touch, already correctly called out. **Low risk.**

#### (d) Confidence per major claim

| Claim | Confidence | Basis |
|---|---|---|
| `@rox_sh/sdk` identity: public, Apache-2.0, `publishConfig` rename, zero-dep self-contained | **Very High** | `package.json:7,14-16`, `build.ts` `dependencies:{}` verified verbatim |
| SDK is a hand-maintained tRPC wrapper, not live Stainless-generated | **Very High** | No stainless/openapi/CONTRIBUTING in `packages/sdk`; string-path `client.query/mutation` calls verified |
| Resource catalog (tasks/workspaces/projects/hosts/automations/agents/terminals/organization) + methods | **High** | All `resources/*.ts` read; one transport/procedure nuance corrected (agents.run, workspaces.update direct) |
| Two transport paths (direct api vs relay-JWT), JWT exchange `/api/auth/token` | **Very High** | `client.ts:503-619` verified; only the 55m-vs-50m nuance softened |
| Auth model (`sk_live_/sk_test_`→x-api-key, else Bearer, org header) shared SDK↔CLI | **Very High** | `client.ts:353-362` + `api-client.ts:21-30` identical rule |
| CLI command set (41 leaves) + aliases + host lifecycle | **Very High** | `find …/command.ts` matches §1.2 list exactly |
| CLI is real typed tRPC client over `AppRouter`; SDK re-declares types + string paths | **Very High** | `api-client.ts:2-14` + `tasks/create/command.ts:36` vs SDK string-path calls |
| "Mirrors 1:1" is a manual convention, no codegen; SDK unused in-repo | **High** | JSDoc `Mirrors` on every method; grep finds no internal importer; no generation step |
| Version drift (SDK 2-way, CLI 3-way) | **Very High** | All five version sources read directly |
| No SDK tests; mirror invariant unguarded by CI | **Very High** | `find packages/sdk/src` for tests returns empty |
| TODO.md = forward convergence surface (chat/devices/UI/pane/ports/cron) | **High** | `TODO.md:28-33` verbatim |
| File-ownership disjoint from all siblings | **Very High** | All 15 sibling ownership sections scanned; no `packages/sdk` or `packages/cli` claim |

# Rox Productization — Master Orchestration Roadmap

**Status:** active · **Created:** 2026-06-08 · **Owner:** orchestration

**Goal (verbatim):** A productized "Rox" — orchestrate swarms of CLI coding
agents, free by default, monetized via a Rox crypto-credit economy (no
Stripe/subscriptions), with first-class integrations (Telegram / Discord /
Slack / Linear / GitHub / Notion / Obsidian / Fibery / Lark), one-command
remote hosts & ephemeral sandboxes, preinstalled agents + terminal presets,
~500 Zed themes + glass UI, OpenPanel analytics end-to-end, and the
**Execution Circuit** (task = typed state transition) as the differentiating
execution core — rendered through the **MONAD / Motion-Frame** design language.
Drive every slice to 100% maturity, concurrently.

This file is the single source of truth for *what is left*, *in what order*,
and *how each slice is proven done*. Each leaf is one PR.

**Completion convention** (this file diverges from the repo's "move shipped
plans to `plans/done/`" rule *on purpose*, because it is a living program index,
not a single-shipment plan): it stays in `plans/` for the duration of the
program. Mark a landed slice by striking its id and appending the PR link —
e.g. `~~G2~~ (#55)` — in place. Move the whole file to `plans/done/` only once
every slice below is struck through.

> **Progress — 2026-06-11 (parallel orchestration session).** Gate landed via
> **#60** (G1–G4 + `@rox/shared` billing core + roadmap; absorbed #56/#59/#17).
> Closed as duplicate/stale: #51 (C1), #18, #52. **Design system C2 converged:**
> #54 landed as the motion-frame base, duplicates #40/#53 closed. Slices landed
> to `main` this session: **#61** (#29 starter presets), **#62** (#30 Linear
> tests), **#63** (#28 agent catalog), **#64** (#35 OpenPanel SDK + PII),
> **#65** (#34.3 dv.net client), **#66** (#30 GitHub tests), **#67** (#34.1
> remove-paywall pt.1). All merged green (sherif/lint/test/typecheck/build);
> only the **G5** Neon/Vercel preview-deploy job is red — repo-secret config,
> treated as non-required.

---

## 0. How to read this

- **Maturity %** = honest estimate of how much of the epic's target state is on
  `main` today (the wave merged "slice 1" of most epics).
- **Gate** = a hard dependency; do not start gated slices until the gate is green.
- **Verify** = the exact command(s) that must pass for the slice to count as done.
  CI mirrors these: `bunx sherif`, `bun run lint`, `bun run test`,
  `bun run typecheck`, `bun turbo run build --filter=@rox/desktop`.
- A slice is **not done** until its `Verify` is green *and* `main` stays green
  after merge.

> ⚠️ **Environment note:** the cloud session that authored this roadmap could
> not install dependencies (registry auth unavailable → no `node_modules`), so
> code slices below must be implemented and verified in an environment where
> `bun install --frozen` succeeds. Treat "Verify" as mandatory, not optional.
> (Confirmed again 2026-06-11: full `bun install` still times out in-session;
> verification for the slices below was driven through **CI on each PR**.)

---

## 1. GATE — get `main` green (blocks EVERYTHING)

All 4 recent `ci.yml` runs on `main` fail, including HEAD `598582a`. No feature
slice can be proven done while CI is red. Land these first, in order.

| # | Slice | Failure it fixes | Verify | Tracking |
|---|---|---|---|---|
| ~~G1~~ | ~~Sherif: order `dependencies`/`devDependencies` in `apps/*` + `packages/ui`~~ | `unordered-dependencies` | ✅ `bunx sherif` → No issues found | #56→#60 |
| ~~G2~~ | ~~Repoint symlink `plugins/rox/skills/rox` → `../../../skills/rox`~~ | Biome broken-symlink warning | ✅ `bun run lint` → exit 0 | #56→#60 |
| ~~G3~~ | ~~`@rox/desktop` typecheck heap: `cross-env NODE_OPTIONS=--max-old-space-size=8192 tsc --noEmit`~~ | exit 137 OOM (~2 GB) | ✅ CI Typecheck job | #56→#60 |
| ~~G4~~ | ~~Fix `@rox/trpc#test`~~ | unit-test failure | ✅ `bun --cwd packages/trpc test` → pass | #56→#60 |
| G5 | Make Neon/Vercel preview deploys non-gating OR wire repo deploy secrets (`project_id`, etc.) | preview deploys fail for missing secrets | preview job green or non-required | **repo config (maintainer)** — still red, treated non-required |

**G4 root cause (resolved):** not a product bug — `@rox/trpc` typecheck is clean
and each new suite passes in isolation. Bun's `mock.module("@rox/db/schema", …)`
is process-global and last-wins, so the `task`/`v2-project` mocks (which omit the
circuit/access tables) clobbered the mock `share.ts` / `executionCircuit.ts` link
their named imports against → "Export named accessGrants/executionCircuits not
found". Fixed with a shared `dbSchemaMockBase` (full union of table names) spread
into every router test's schema mock.

**Exit criterion for the gate:** a push to `main` shows all of
sherif / lint / test / typecheck / build green. ✅ **Met** (run on `main` HEAD
after #60; the only red job is G5 Deploy Database/Neon, non-code).

> Integration note: the G1–G4 work (#56) landed together with two ready CI fixes
> — #59 (`dialog` stub for partial electron mocks) and #17 (DaemonClient socket
> chunk normalization for full typecheck) — via integration PR #60.

---

## 2. CONVERGENCE — kill the duplication before it compounds

The wave produced **two** parallel implementations of two core systems. Decide a
single home for each *now*; every later UI/circuit slice depends on the choice.

### ~~C1~~ — One Execution Circuit module · **converged (realized on `main` / #56→#60)**

- On `main`: `packages/workflow-core/src/circuit/*` (used by the merged
  `executionCircuit` tRPC router + `@rox/db` tables).
- **Decision (realized):** `@rox/workflow-core` is the single home. The duplicate
  `@rox/shared/execution-circuit` PR **#51 was closed** (no code change on `main`).

### ~~C2~~ — One design system · **converged (base on `main` / #54)**

Four overlapping seeds existed: merged "Motion animation system" + `@rox/ui`
motion-frame bits, plus PRs **#40 (MONAD, `apps/desktop`)**, **#53 (Motion-Frame
plan)**, **#54 (Motion-Frame in `packages/ui`)**.

- **Decision (realized):** `packages/ui/motion-frame` is the shared home. **#54
  landed on `main`** as the base; duplicates **#40** (desktop-local MONAD) and
  **#53** (parallel `@rox/ui/motion` + plan) were **closed** (branches preserved).
- **Remaining:** fold #40's MONAD tokens/primitives + #53's plan into
  `packages/ui/motion-frame`; ensure `apps/desktop` imports motion only from
  `@rox/ui`; no `[data-monad-root]` token set duplicated across packages.

---

## 3. EPICS — remaining slices to 100%

Each numbered item is a PR. Order within an epic is top-to-bottom. Epics run
**concurrently** across branches once the Gate is green.

### #34 T-BILLING — Rox crypto-credit economy · **P0 product thesis** (XXL)

The core differentiator ("free by default + crypto credits"). Schema + pricing
core landed (PR #45); ledger/pricing/topup/models core landed (#60).

1. ~~**Remove paywall**~~ *(part 1 landed — #67)* — managed remote hosts &
   sandboxes opened to all org members; Pro/billing client gates dropped;
   `host.checkAccess` no longer joins `subscriptions`. *Pairs with PR #50
   `LOCAL_ONLY_AUTH`.* Remaining: full Stripe plugin + `billingRouter` removal;
   keep a `subscriber|free` status flag with non-paywall perks.
2. **Rox balance model** — credits ledger + `subscriber|free` status;
   debit-per-request hook. *(Pure ledger landed in #60.)* Remaining: balance
   persistence + per-request debit wired to routes. Verify: `bun --cwd packages/db typecheck`.
3. ~~**dv.net top-up**~~ *(client landed — #65)* — `$5 USDT = 500 Rox`.
   *Core (#60): `@rox/shared/rox-topup` — confirmed-only + USDT-only + idempotent
   settlement behind an injected `DvNetClient`, 8 cases. Client (#65):
   `@rox/shared/dvnet-client` — `DvNetHttpClient` (reads `DVNET_API_KEY`/`_URL` in
   one place, never logs secrets) + `buildInvoiceRequest` / `normalizeDvNetWebhook`
   / `deriveDvNetPaymentId`, 41 tests.* Remaining: tRPC route + balance persistence.
4. **Per-request pricing + models table** — ingest `models.dev`; provider
   divisors (grok/openai ÷7.5, claude ÷5.25, gemini ÷12.25, others ÷25) [^div];
   comparison columns (data-sharing/training/latency/TTFT/stability bar-charts à
   la OpenRouter). Verify: pricing pure-fn tests; snapshot of computed per-model
   Rox cost.
5. **`rox r1` FREE-FOREVER model** — groq-compound-style limits/params. Verify:
   model registry entry + limit enforcement test.
6. **Analytics cabinet** — per-request logs/traces/cost (AgentOps style),
   recommendations (stats.api.zed style), Models tab from `models.dev`. Verify:
   renders from seeded data; `apps/desktop` typecheck.

[^div]: The per-provider divisors are **placeholders** carried verbatim from the
    product owner's 2026-06-07 spec (issue #34), **not** a derived/authoritative
    rate. Before #34.4 codes billing against them, record their source (target
    margin vs. `models.dev`/OpenRouter list price + USDT→Rox peg) and a
    recalibration cadence; treat them as config, never as hardcoded constants.
    *Done (#60): `ROX_PRICE_DIVISOR_CONFIG` in `packages/shared/src/rox-pricing.ts`
    carries each divisor with `source` / `reviewCadence` / `lastReviewed`; the
    flat `ROX_PRICE_DIVISORS` hot-path map is derived from it, and a unit test
    enforces the config↔map consistency + provenance shape.*

> ⚠️ Legal/compliance: data-sharing & latency claims are factual assertions;
> dv.net is crypto compliance. Gate copy on review.

### #30 T-INTEGR — Integrations · (XL)

Framework + tRPC routers (notion/obsidian/telegram/lark/fibery) + DB providers
landed. Remaining:

1. **Discord** provider (router + OAuth/secret).
2. **Slack** provider.
3. ~~**Linear** provider~~ *(provider on `main`; router tests landed — #62)*.
4. ~~**GitHub** provider~~ *(provider on `main`; router tests landed — #66)*.
5. **OAuth/secret-store** hardening shared across providers.
6. **Connect/manage UI** in settings/integrations.

- Verify per provider: `bun --cwd packages/trpc test` for the new router;
  secret never logged; typecheck green.

### #32 T-HOSTS — Remote hosts & ephemeral sandboxes · (XL)

`v2_hosts` port/protocol + a slice landed; #67 opened managed hosts/sandboxes to
all org members (removed the paid gate). Remaining:

1. **Transport** decision + impl (SSH vs. agent) in `host-service` /
   `host-provisioner`.
2. **Add-server flow** UI (`settings/hosts`).
3. **One-command deploy** of a workspace to a host.
4. **Ephemeral sandbox** (~1 h TTL, auto-reap).
5. **Persistent remote workspace**.
6. **Time-billing** hook into #34.
7. **Security** (key handling, isolation).

- Verify: provisioner unit tests w/ mocked transport; reaper test; typecheck.

### #28 T-AGENTS — Agent bundle + Terminal Presets · (XL)

Preinstall + presets slice landed. Remaining:

1. ~~**Bundle latest** codex/claude/droid/gemini/qwen/kimi/…~~ *(landed — #63:
   preinstall catalog + per-agent update strategy + install-plan tests)*.
2. **Preset configs** (oh-my-* / hermes / openclaw / ouroboros …).
3. **Per-agent full Terminal Preset** picker.
4. **Installer size/legality audit**.

- Verify: agent-catalog tests; preset apply test; desktop build green.

### #35 T-OPENPANEL — Analytics end-to-end · (L–XL)

`packages/analytics` + a slice landed. Layers landed (#64): ~~frontend SDK in
renderer root layout~~ · ~~identify-after-login~~ · ~~product events~~ · **PII
masking** (unit-tested `redactPii`/`sanitizeEvent`, 19 tests). Remaining: server
events · workflow/agent telemetry · revenue (ties #34) · session replay (mask
sensitive) · error tracking · UTM · user-path coverage map.

- Verify: events fire in a smoke harness; PII masking unit-tested.

### #27 T-THEMES — ~500 Zed themes + glass UI · (L)

Themes/fonts slice + Victor Mono (#44) landed. Remaining:

1. **Zed→`Theme` converter** (palette → tokens) + bulk import (~500). Verify:
   converter unit tests; all imported themes get unique IDs; `theme-storage`
   localStorage migration.
2. **Electron vibrancy** (real glass/tahoe) in `BrowserWindow` (current glass is
   CSS `backdrop-filter` only). Verify: vibrancy applied on macOS; blur perf
   acceptable.

### #29 T-BOOTSTRAP — 15–20 workspace-creation presets · (M–L)

Rox Starters template (PR #47) landed. **Library landed (#61):** `@rox/shared`
`WORKSPACE_STARTER_PRESETS` — 8 documented starters (repo-init+GitHub-sync,
agents-md, agent-context scaffold `.rox/.agent/.memory`, planning-docs, ci/cd
autodeploy, deep-wiki/cold-graph, OSS baseline, everything) + per-starter
snapshot tests + a `starterAsSetupPreset` picker adapter. Remaining: grow to
15–20 starters; wire the library into the `WorkspaceSetupPresets` picker UI.

- Verify: each preset runs in a scratch workspace; snapshot of generated files.

---

## 4. CORE — Execution Circuit to product depth (differentiator)

Circuit MVP (spec/validate/prompt-compiler/DB/router) is on `main`; the UI is a
bare grey list. After **C1/C2** (both converged):

1. **Circuit panel UI** rendered via the converged Motion-Frame (`StateNode` /
   `TransitionEdge` / `ValidatorGate` map 1:1 to `ExecutionCircuitSpec`).
2. **Runtime binding** — wire `transitionRuns` + `experienceTraceEvents` to real
   agent execution.
3. **Monad completeness** surfaced in task detail.

- Verify: panel renders a seeded spec; transition run records a trace; typecheck.

---

## 5. Suggested concurrency map (branch-per-slice)

- **Now (serial):** Gate G1–G5 → then C1, C2 decisions. ✅ (G1–G4 + C1 + C2 done.)
- **Wave A (parallel, post-gate):** #34.1+#34.2 (+#50), #30.1–.4, #27.1.
- **Wave B:** #32 transport+sandbox, #35 layers, #28 bundle, #29 presets, Core.1.
- **Wave C:** #34.3–.6 (crypto+cabinet), #32 billing/security, #35 replay/revenue.

> ⚠️ **Shared-middleware rebase dependency:** #34.1 + #50 rewrite the global auth
> middleware (`protectedProcedure` / `LOCAL_ONLY_AUTH`). Every concurrent #30
> integration router is protected by that middleware, so all Wave-A/B branches
> must land #34.1+#50 first **or** stay continuously rebased on them — otherwise a
> long-lived integration branch can silently break auth on merge.

Each branch: `claude/<slice-name>`, draft PR, `Verify` green, rebase on green
`main`, merge. Keep this file's slice rows current (strike + PR link as they land).

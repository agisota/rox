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

---

## 1. GATE — get `main` green (blocks EVERYTHING)

All 4 recent `ci.yml` runs on `main` fail, including HEAD `598582a`. No feature
slice can be proven done while CI is red. Land these first, in order.

| # | Slice | Failure it fixes | Verify | Tracking |
|---|---|---|---|---|
| ~~G1~~ | ~~Sherif: order `dependencies`/`devDependencies` in `apps/*` + `packages/ui`~~ | `unordered-dependencies` | ✅ `bunx sherif` → No issues found | #56 (d0b49a2) |
| ~~G2~~ | ~~Repoint symlink `plugins/rox/skills/rox` → `../../../skills/rox`~~ | Biome broken-symlink warning | ✅ `bun run lint` → exit 0 | #56 (d0b49a2) |
| ~~G3~~ | ~~`@rox/desktop` typecheck heap: `cross-env NODE_OPTIONS=--max-old-space-size=8192 tsc --noEmit`~~ | exit 137 OOM (~2 GB) | CI Typecheck job (heap matches dev/compile) | #56 (d0b49a2) |
| ~~G4~~ | ~~Fix `@rox/trpc#test`~~ | unit-test failure | ✅ `bun --cwd packages/trpc test` → 76 pass / 0 fail | #56 (b57c522) |
| G5 | Make Neon/Vercel preview deploys non-gating OR wire repo deploy secrets (`project_id`, etc.) | preview deploys fail for missing secrets | preview job green or non-required | repo config (not code) |

**G4 root cause (resolved):** not a product bug — `@rox/trpc` typecheck is clean
and each new suite passes in isolation. Bun's `mock.module("@rox/db/schema", …)`
is process-global and last-wins, so the `task`/`v2-project` mocks (which omit the
circuit/access tables) clobbered the mock `share.ts` / `executionCircuit.ts` link
their named imports against → "Export named accessGrants/executionCircuits not
found". Fixed with a shared `dbSchemaMockBase` (full union of table names) spread
into every router test's schema mock.

**Exit criterion for the gate:** a push to `main` shows all of
sherif / lint / test / typecheck / build green.

---

## 2. CONVERGENCE — kill the duplication before it compounds

The wave produced **two** parallel implementations of two core systems. Decide a
single home for each *now*; every later UI/circuit slice depends on the choice.

### C1 — One Execution Circuit module

- On `main`: `packages/workflow-core/src/circuit/*` (used by the merged
  `executionCircuit` tRPC router + `@rox/db` tables).
- Draft (parked) PR #51: `@rox/shared/execution-circuit` — a duplicate
  types/validate/prompt-compiler whose `./execution-circuit` export isn't even
  in `packages/shared/package.json`. "Parked" here means *open as draft, awaiting
  this convergence decision* (do not merge as-is).
- **Decision (recommended):** keep `@rox/workflow-core` as the home (it already
  has consumers + DB + router). Close #51, or rebase it to add only what
  workflow-core lacks. **Verify:** one `compileTransitionPrompt`/
  `validateExecutionCircuitSpec` in the repo; `bun run typecheck` green.

### C2 — One design system

Four overlapping seeds exist: merged "Motion animation system" + `@rox/ui`
motion-frame bits, plus PRs **#40 (MONAD, `apps/desktop`)**, **#53 (Motion-Frame
plan)**, **#54 (Motion-Frame in `packages/ui`)**.

- **Decision (recommended):** `packages/ui/motion-frame` is the shared home
  (cross-app, already an `@rox/ui` export). MONAD's tokens/primitives port into
  it; `apps/desktop` consumes from `@rox/ui`, not a private copy. Land #54 as the
  base, fold #40's primitives in, close the desktop-local duplicate.
- **Verify:** `apps/desktop` imports motion primitives only from `@rox/ui`;
  `bun --cwd packages/ui test` green; no `[data-monad-root]` token set duplicated
  in two packages.

---

## 3. EPICS — remaining slices to 100%

Each numbered item is a PR. Order within an epic is top-to-bottom. Epics run
**concurrently** across branches once the Gate is green.

### #34 T-BILLING — Rox crypto-credit economy · ~15% · **P0 product thesis** (XXL)

The core differentiator ("free by default + crypto credits"). Schema + pricing
core landed (PR #45). Remaining, as the issue's own sub-ticket split:

1. **Remove paywall** — everything free by default; delete Stripe gating; keep a
   `subscriber|free` status flag with non-paywall perks. *Pairs with PR #50
   `LOCAL_ONLY_AUTH`.* Verify: no `@better-auth/stripe` gate on any feature path;
   typecheck green.
2. **Rox balance model** — credits ledger + `subscriber|free` status;
   debit-per-request hook. Verify: ledger unit tests; `bun --cwd packages/db typecheck`.
3. **dv.net top-up** — crypto on-ramp, `$5 USDT = 500 Rox`. Verify: provider
   adapter unit-tested with mocked dv.net; secret handling documented.
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

> ⚠️ Legal/compliance: data-sharing & latency claims are factual assertions;
> dv.net is crypto compliance. Gate copy on review.

### #30 T-INTEGR — Integrations · ~45% (XL)

Framework + tRPC routers (notion/obsidian/telegram/lark/fibery) + DB providers
landed. Remaining:

1. **Discord** provider (router + OAuth/secret).
2. **Slack** provider.
3. **Linear** provider (SDK already a dep).
4. **GitHub** provider.
5. **OAuth/secret-store** hardening shared across providers.
6. **Connect/manage UI** in settings/integrations.

- Verify per provider: `bun --cwd packages/trpc test` for the new router;
  secret never logged; typecheck green.

### #32 T-HOSTS — Remote hosts & ephemeral sandboxes · ~35% (XL)

`v2_hosts` port/protocol + a slice landed. Remaining:

1. **Transport** decision + impl (SSH vs. agent) in `host-service` /
   `host-provisioner`.
2. **Add-server flow** UI (`settings/hosts`).
3. **One-command deploy** of a workspace to a host.
4. **Ephemeral sandbox** (~1 h TTL, auto-reap).
5. **Persistent remote workspace**.
6. **Time-billing** hook into #34.
7. **Security** (key handling, isolation).

- Verify: provisioner unit tests w/ mocked transport; reaper test; typecheck.

### #28 T-AGENTS — Agent bundle + Terminal Presets · ~50% (XL)

Preinstall + presets slice landed. Remaining:

1. **Bundle latest** codex/claude/droid/gemini/qwen/kimi/… into the installer,
   with an update strategy.
2. **Preset configs** (oh-my-* / hermes / openclaw / ouroboros …).
3. **Per-agent full Terminal Preset** picker.
4. **Installer size/legality audit**.

- Verify: agent-catalog tests; preset apply test; desktop build green.

### #35 T-OPENPANEL — Analytics end-to-end · ~40% (L–XL)

`packages/analytics` + a slice landed. Remaining 10 layers:
frontend SDK in renderer root layout · identify-after-login · product events ·
server events · workflow/agent telemetry · revenue (ties #34) · session replay
(mask sensitive) · error tracking · UTM · user-path coverage map.

- Verify: events fire in a smoke harness; PII masking unit-tested.

### #27 T-THEMES — ~500 Zed themes + glass UI · ~40% (L)

Themes/fonts slice + Victor Mono (#44) landed. Remaining:

1. **Zed→`Theme` converter** (palette → tokens) + bulk import (~500). Verify:
   converter unit tests; all imported themes get unique IDs; `theme-storage`
   localStorage migration.
2. **Electron vibrancy** (real glass/tahoe) in `BrowserWindow` (current glass is
   CSS `backdrop-filter` only). Verify: vibrancy applied on macOS; blur perf
   acceptable.

### #29 T-BOOTSTRAP — 15–20 workspace-creation presets · ~20% (M–L)

Rox Starters template (PR #47) landed; the preset *library* did not. Remaining:
author 15–20 documented presets (repo init+GitHub sync, `agents.md` gen,
deep-wiki/cold-graph, `.rox/.agent/.memory` scaffold, CI/CD autodeploy,
`todo.md`/`spec.md` from template, …) at the workspace-scripts definition point.

- Verify: each preset runs in a scratch workspace; snapshot of generated files.

---

## 4. CORE — Execution Circuit to product depth (differentiator)

Circuit MVP (spec/validate/prompt-compiler/DB/router) is on `main`; the UI is a
bare grey list. After **C1**:

1. **Circuit panel UI** rendered via the converged Motion-Frame (`StateNode` /
   `TransitionEdge` / `ValidatorGate` map 1:1 to `ExecutionCircuitSpec`).
2. **Runtime binding** — wire `transitionRuns` + `experienceTraceEvents` to real
   agent execution.
3. **Monad completeness** surfaced in task detail.

- Verify: panel renders a seeded spec; transition run records a trace; typecheck.

---

## 5. Suggested concurrency map (branch-per-slice)

- **Now (serial):** Gate G1–G5 → then C1, C2 decisions.
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

# Finish Line — Repo Green + Motion Frame Complete

_Execution plan fixed 2026-06-11 with the orchestrator. This file is the durable
source of truth for the goal; sessions are ephemeral, the plan is not._

## Goal (S✷)

Everything started in the motion-frame workflow is carried to completion:

> All work-in-progress is merged into `main`; `main` is green on every check
> that code can fix; the Motion Frame layer is built out to the end of its
> brief; the only acceptable red (deploys) has an exact missing-secrets list
> handed to the repo owner.

## Acceptance criteria

1. **Merged** — PR #54 (motion-frame seed) is in `main`; session branches
   cleaned up. _(PR #55 already merged: d65e94d.)_
2. **Honest signal** — a push to `main` yields green Sherif, Lint, Typecheck,
   Build, Build CLI **and Test** (the `@rox/host-service` integration suite no
   longer times out / SIGKILLs the runner).
3. **Motion Frame done** — all Status boxes in
   [`plans/motion-frame/PORT-BRIEF.md`](./motion-frame/PORT-BRIEF.md) checked,
   one green PR per level, brief acceptance rules enforced (tokens-only,
   governor-gated motion, co-location, lint/typecheck = 0).
4. **Deploys** — owner has the exact secrets list (below); once set, previews
   go green. Code cannot fix this stream.

## Streams

### A — Land what's started *(done)*
- [x] Merge PR #54 — merged as `fbe0ba0` (PR run: 7/8 green; the Test red was
      the pre-existing suite, resolved upstream — see B1).
- [x] Session branches: both merged. Remote deletion is blocked by the git
      proxy (rejects deletes); cosmetic — remove via GitHub UI if desired.

### B — Main-branch health
- [x] **B1** Resolved upstream by the green-the-gate integration (#60: #56
      host-service test hardening + #59 electron dialog mock stubs + #17).
      First green `main` CI run in history: `1ab1d089`
      (run 27332886843). Watch for recurring flake; reopen if it returns.
- [ ] **B2** Owner action (not code): set repo secrets for previews.
      Preview-critical subset (from `deploy-preview.yml`): `NEON_API_KEY`,
      `VERCEL_TOKEN`, `VERCEL_ORG_ID`,
      `VERCEL_{API,WEB,MARKETING,ADMIN,DOCS}_PROJECT_ID`, plus the app env
      secrets the workflow injects (auth/Stripe/PostHog/Sentry/QStash/KV/
      Resend/Slack/Linear/GH app — full sorted list:
      `grep -rhoE 'secrets\.[A-Z_]+' .github/workflows/ | sort -u`).

### C — Motion Frame build-out (one PR per level, N+1 only after N is green)
Per [`PORT-BRIEF.md`](./motion-frame/PORT-BRIEF.md); design decisions made from
the brief + repo style (no separate PORT SPEC exists — orchestrator approved
building without it, corrections via review).
- [ ] **C1** Tier switcher UI component (PR1 remainder).
- [ ] **C2** `Reveal`, `LoopMarquee` primitives (PR2 remainder).
- [ ] **C3** Typeface themes (Blueprint / Brutalist / Docs) + persisted switcher.
- [ ] **C4** Composites: `SufficiencyPanel`, `EventTrace`, `RuntimeCard`,
      `ManifestoBlock` (PR4 remainder).
- [ ] **C5** Diagram adapters over `@xyflow/react`, `recharts`, `mermaid`,
      `shiki` inheriting tokens + governor.
- [ ] **C6** Living showcase route in `apps/docs` (all tiers × both themes).

### D — Foreign branches: inventory only (no blind merges)
- [x] Audited all 29 non-session branches — see
      [`2026-06-11-foreign-branch-inventory.md`](./2026-06-11-foreign-branch-inventory.md):
      11 merge-candidates, 6 closable, 7 need a rebase, 5 large epics for the
      owner. Acting on any of them is a separate owner decision.

## Decision log

- 2026-06-11 — Orchestrator fixed scope A+B+C in full; D = inventory +
  recommendations only; C3–C6 built from the brief without a Design PORT SPEC.
- 2026-06-09 — Option 1 chosen for #54: refresh from `main`, prove green, merge.
- 2026-06-09 — PR #55 merged (squash, d65e94d): sherif ordering, skills symlink,
  desktop typecheck heap.

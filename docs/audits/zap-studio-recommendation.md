# Zap Studio Audit — Recommendation

_Tracking: #38. Based on [`inventory`](./zap-studio-inventory.md) and
[`analysis`](./zap-studio-analysis.md)._

## Verdict: **ADOPT PARTIALLY** (retry pilot only) — otherwise **DO NOT ADOPT**

| Package | Verdict | Why |
|---|---|---|
| `@zap-studio/retry` | **Adopt partially (optional pilot)** | Only real gap — no dedicated retry lib; consolidates scattered `retries: 3` and manual loops. |
| `@zap-studio/permit` | **Defer** | Real gap (no formal authz layer) but adopting is an architecture decision vs extending better-auth roles; revisit with #31. |
| `@zap-studio/fetch` | **Do not adopt** | Duplicates the Stainless SDK + tRPC + native fetch. |
| `@zap-studio/validation` | **Do not adopt** | Zod-exclusive (196 files); zero benefit, huge churn. |
| `@zap-studio/webhooks` | **Do not adopt** | Only 2 handlers; vendor SDKs verify better. Reconsider if #30 grows webhooks. |

### Rationale against the acceptance criteria (#38)
- **SUCCESS requires** at least one package that reduces complexity, no regressions, incremental adoption. Only `retry` plausibly qualifies, and only as an optional, behind-no-flag-needed utility.
- **FAIL conditions** ("duplicates existing functionality", "migration cost exceeds benefit", "adds abstractions") apply squarely to `fetch`, `validation`, and `webhooks`.

## Recommended next step (Phase 4 — POC, optional)
If you want to validate `retry` before committing:
1. Branch `feature/zap-studio-poc`.
2. Add `@zap-studio/retry` to **`packages/shared`** only; expose one `withRetry(policy)` helper.
3. Replace 2–3 ad-hoc `retries: 3` sites in `packages/auth/src/server.ts` as a proof.
4. Add unit tests simulating 429 / timeout / network failure; verify backoff.
5. Measure: lines removed vs added, and whether the policy reads clearer than the inline literals.

Do **not** touch the generated `packages/sdk` (it has its own retry) or migrate
react-query retry config.

## Bottom line
Rox already has strong coverage for HTTP (SDK + tRPC), validation (Zod), and
webhook verification (vendor SDKs). Zap Studio's value here is narrow: a single
optional `retry` consolidation, plus `permit` as a _future_ candidate if a real
RBAC need emerges from members/teams work (#31). Nothing warrants a broad adoption.

# Zap Studio — Adoption Closeout

**Epic:** zap-studio · **Tracking:** #38, #42
**Sources:** [`zap-studio-recommendation.md`](./zap-studio-recommendation.md) · [`zap-studio-analysis.md`](./zap-studio-analysis.md) · [`zap-studio-inventory.md`](./zap-studio-inventory.md)

## Verdict summary

| Package | Decision | Rationale |
| --- | --- | --- |
| `@zap-studio/retry` | **ADOPT (pilot)** | Replaces hand-rolled retry loops with a small, dependency-free, typed policy primitive. Piloted flag-gated in `packages/shared` only. |
| `@zap-studio/permit` | **DEFER** | Authorization primitive overlaps with upcoming members/teams work (#31). Revisit once that lands so we model one permission system, not two. |
| `@zap-studio/fetch` | **DO NOT ADOPT** | Duplicates the generated Stainless SDK + tRPC client + native `fetch` already in use. No gap to fill; adds a competing HTTP path. |
| `@zap-studio/validation` | **DO NOT ADOPT** | Zod is the exclusive validation layer across 196 files. Swapping or layering a second validator is churn with zero net benefit. |
| `@zap-studio/webhooks` | **DO NOT ADOPT** | Only 2 inbound handlers, and the vendor SDKs (Stripe, QStash) already verify signatures natively. Not worth a shared abstraction. |

## Pilot scope (what shipped)

- Added `@zap-studio/retry` to **`packages/shared` only** (per guardrail).
- New helper `@rox/shared/retry` exporting `withRetry(fn, policy?)`:
  - Flag-gated by `ZAP_STUDIO_RETRY_ENABLED`. Default (unset/`!= "true"`) is a
    **true passthrough** — `fn` runs exactly once, byte-identical to pre-pilot
    behavior, zero regression risk.
  - When enabled: exponential backoff (default 3 attempts, 200ms base, 5s cap)
    with error classification — retry on 429 / 5xx / network-timeout, skip other 4xx.
- Co-located Bun tests (`withRetry.test.ts`) cover success, 429-then-success,
  network retry, exhaustion → `RetryError`, non-retryable 4xx, custom predicate,
  and flag-off passthrough.
- Proof-of-concept conversion of 3 of the 7 `qstash.publishJSON({ retries: 3 })`
  call sites in `packages/auth/src/server.ts`. The wrap retries the **publish
  handshake** (transient failures reaching QStash); QStash's own delivery
  `retries` is intentionally left in place — the two layers are orthogonal.

## Explicitly out of scope (guardrails honored)

- Generated `packages/sdk` retry (Stainless owns it) — untouched.
- react-query retry configuration — untouched.
- No DB, tRPC, or web-surface changes.

## Outcome metric

The pilot's success criterion is **readability + line delta** on the converted
retry sites and a clean flag-off path:

- 3 ad-hoc `retries: 3` publish sites now route through one shared, tested
  primitive instead of relying solely on QStash's opaque option.
- Net change is additive (a wrap + a comment per site) but consolidates retry
  semantics behind a single classifier we can tune in one place.
- Rollback is a one-line flag (`ZAP_STUDIO_RETRY_ENABLED` stays off) or full
  removal of `packages/shared/src/retry/` + the dependency.

See [`plans/20260608-zap-studio-retry-poc.md`](../../plans/20260608-zap-studio-retry-poc.md)
for the staged migration of the remaining real ad-hoc retry loops.

# Plan: @zap-studio/retry POC → incremental migration

**Date:** 2026-06-08 · **Epic:** zap-studio · **Tracking:** #38, #42
**Status:** POC landed (flag default OFF). Migration not yet started.

## Goal

Replace genuine hand-rolled retry loops with the shared `withRetry` primitive
(`@rox/shared/retry`), incrementally and flag-gated, proving no regressions
before expanding.

## What already shipped (POC)

- `@zap-studio/retry@0.3.0` added to `packages/shared` only.
- `withRetry(fn, policy?)` helper + co-located tests in
  `packages/shared/src/retry/`.
- 3 of 7 `qstash.publishJSON({ retries: 3 })` sites in
  `packages/auth/src/server.ts` wrapped (publish-handshake retry; QStash
  delivery retries untouched).

## In-scope migration targets (real ad-hoc retry loops)

Verified hand-rolled retry loops worth migrating, in priority order:

1. `packages/host-service/src/tunnel/tunnel-client.ts` — reconnect/backoff loop.
2. `packages/host-service/src/.../pr-branch-materialize.ts` — retried git
   materialization.
3. `packages/host-service/src/.../config-write.ts` — retried config writes.
4. Remaining 4 `qstash.publishJSON` sites in `packages/auth/src/server.ts`.
5. `packages/sdk` **application** call sites (hand-written wrappers only).

For each: replace the bespoke loop with `withRetry(() => op(), policy)`, choosing
a policy (attempts/backoff/`isRetryable`) that matches the existing behavior, and
preserve existing `try/catch` + logging fallbacks.

## Explicitly OUT OF SCOPE

- Generated `packages/sdk` retry (Stainless SDK owns its own retry). Do **not**
  touch generated files.
- react-query retry configuration.
- DB / tRPC / web-surface changes.

## Rollout

1. **Default OFF** — `ZAP_STUDIO_RETRY_ENABLED` unset everywhere → passthrough,
   byte-identical to today. (Current state.)
2. **Staging enable** — set `ZAP_STUDIO_RETRY_ENABLED=true` in staging only;
   migrate targets in batches behind the flag.
3. **Measure** — watch publish/reconnect success rates, latency, and error logs
   for the converted sites. Confirm no behavior change with the flag off.
4. **Expand or roll back:**
   - Expand: enable in production once staging is clean, then continue migrating
     the in-scope list.
   - Roll back: flip the flag off (instant), or fully remove
     `packages/shared/src/retry/` + the `@zap-studio/retry` dependency.

## Exit criteria

- All in-scope ad-hoc loops migrated to `withRetry`.
- Flag enabled in production with no regression over one measurement window.
- Closeout updated in `docs/audits/zap-studio-closeout.md`; this plan moved to
  `plans/done/`.

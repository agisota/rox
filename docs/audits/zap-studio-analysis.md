# Zap Studio Audit — Phase 2/3: Suitability & Integration Targets

_Evaluates `@zap-studio/{fetch,retry,validation,permit,webhooks}` against the
inventory in [`zap-studio-inventory.md`](./zap-studio-inventory.md). Tracking: #38._

Package purposes per [zapstudio.dev](https://www.zapstudio.dev/docs/getting-started)
(framework-agnostic TypeScript building blocks):

- **fetch** — type-safe HTTP with schema-validated responses
- **retry** — composable retry policies (fixed + exponential backoff)
- **validation** — Standard Schema utilities + consistent validation errors
- **permit** — declarative authorization policies / permission checks
- **webhooks** — webhook routing, signature verification, payload validation

## Per-package suitability

### @zap-studio/retry — _the one real gap_
- **Current state:** no dedicated retry lib; ad-hoc `retries: 3` in `packages/auth/src/server.ts` (7+ sites), react-query retry, and the SDK's own retry.
- **Fit:** Good for the **ad-hoc, non-SDK, non-react-query** retries — provider calls, webhook delivery, background jobs — where a small composable backoff policy would replace copy-pasted loops.
- **Cost/risk:** Low. Additive utility; no migration of the SDK or react-query needed.
- **Verdict:** **Candidate for a small pilot.**

### @zap-studio/permit — _genuine gap, but a big decision_
- **Current state:** **no formal permission layer** (0 `hasPermission`/`authorize`/`can`). Authz = tRPC `protectedProcedure` + better-auth org/team/member roles, checked inline.
- **Fit:** Declarative policies would centralize the inline checks that will multiply as #31 (members/sharing) and team-scoped features land.
- **Cost/risk:** Medium-high. better-auth already models org/member roles; adding a parallel policy engine is an **architecture decision**, not a drop-in. Risk of two competing sources of truth.
- **Verdict:** **Defer** — revisit when #31 forces a real RBAC/ABAC need; evaluate against extending better-auth roles first.

### @zap-studio/fetch — _duplicates existing_
- **Current state:** native fetch + **Stainless-generated SDK** (already type-safe, retrying, validated) + tRPC (end-to-end typed).
- **Fit:** The typed+validated niche is already filled for first-party traffic. Only raw third-party `fetch` calls remain, a minority.
- **Cost/risk:** Migrating 152 sites for marginal gain; competes with the generated SDK.
- **Verdict:** **Do not adopt.** (Acceptance "FAIL if package duplicates existing functionality.")

### @zap-studio/validation — _duplicates Zod_
- **Current state:** **Zod-exclusive** across 196 files. Zod ≥3.24 already implements Standard Schema.
- **Fit:** None additive; Zod is the standard and integrates with `@hookform/resolvers`, tRPC, drizzle-zod.
- **Cost/risk:** Enormous churn, zero benefit.
- **Verdict:** **Do not adopt.**

### @zap-studio/webhooks — _too few handlers, vendor SDKs win_
- **Current state:** 2 inbound webhooks (GitHub via `@octokit/webhooks`, Linear via Linear SDK), each doing vendor-correct signature verification, plus an idempotency table.
- **Fit:** A routing/verification abstraction adds little at N=2, and generic verification is **weaker** than the vendor SDKs already in use.
- **Cost/risk:** Re-plumbing working, verified handlers for an abstraction.
- **Verdict:** **Do not adopt** now; reconsider only if inbound webhook integrations grow substantially (note #30 integrations could change this).

## Integration targets (if piloting retry)

| Package | Location | Current | Proposed | Cost | Risk |
|---|---|---|---|---|---|
| retry | `packages/auth/src/server.ts` ad-hoc `retries: 3` | copy-pasted literals | one composable backoff policy in `packages/shared` | S | Low |
| retry | provider/webhook delivery & background polling (`setInterval` sites) | manual loops | shared policy | S–M | Low |
| permit | future members/teams authz (#31) | inline checks | declarative policies | M–L | Med (vs better-auth roles) |

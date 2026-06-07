# Zap Studio Audit — Phase 1: Inventory

_Read-only inventory of the Rox monorepo, gathered via ripgrep on `apps/**` and
`packages/**` (`.ts`/`.tsx`, excluding `node_modules`/`dist`). Tracking: #38._

Counts are approximate call-site counts, not a guarantee of zero edge cases.

## 1. HTTP clients

| Signal | Files | Matches |
|---|---|---|
| raw `fetch(` | 94 | 152 |
| `axios` / `ky` | 0 | 0 |
| `ofetch` / `got` / `undici` | 4 | 9 |

- **Native `fetch` only** — no axios/ky/got. HTTP calls are scattered across ~94 files.
- Hand-rolled client wrappers exist per surface, e.g.:
  - `packages/sdk/src/client.ts` — **Stainless-generated** typed API client (OpenAPI), with built-in `maxRetries`, backoff, `sleep`, abort handling (`packages/sdk/src/internal/request-options.ts:46`, `client.ts:175,226`).
  - `apps/relay/src/api-client.ts`, `packages/cli/src/lib/api-client.ts`, `apps/web/src/trpc/client.ts`, `packages/auth/src/client.ts`.
- Most internal app↔server traffic goes through **tRPC** (23 routers under `packages/trpc/src/router/`) and the generated SDK, not raw fetch. Raw `fetch` concentrates in third-party/provider calls and one-offs.

## 2. Retry / backoff / polling

| Signal | Files | Matches |
|---|---|---|
| `p-retry` / `async-retry` | 0 | 0 |
| `backoff` / `exponential` | 11 | 13 |
| `retry` (any) | 103 | 298 |
| `setInterval` | 34 | 47 |

- **No dedicated retry library.** Resilience is split three ways:
  1. **Generated SDK** (`packages/sdk`) — robust built-in retry/backoff (`maxRetries`).
  2. **TanStack Query** retry config (much of the 298 `retry` matches).
  3. **Ad-hoc** `retries: 3` literals, e.g. `packages/auth/src/server.ts:678,767,962,1018,1089,1118,1155` (7+ sites) and assorted `setInterval` polling.
- Net: outside the SDK and react-query, retry/backoff is **scattered and inconsistent**.

## 3. Validation

| Signal | Files | Matches |
|---|---|---|
| `zod` | 196 | 197 |
| `valibot` / `arktype` / `yup` | 0 | 0 |

- **Zod is the exclusive validation library** (196 files): tRPC input schemas, env validation, form schemas (`@hookform/resolvers/zod`), shared DTOs. No mixed validators.

## 4. Authorization / permissions

| Signal | Files | Matches |
|---|---|---|
| `protectedProcedure` | 62 | 303 |
| `publicProcedure` | 45 | 326 |
| `better-auth` | 15 | 37 |
| `hasPermission` / `authorize(` / `can(` / `checkPermission` | 0 | 0 |

- Access control is **tRPC `protectedProcedure` gates + better-auth** (organization plugin with org/team/member roles).
- **No formal policy/RBAC layer** — zero `hasPermission`/`authorize`/`can` helpers. Authorization beyond "is authenticated / is a member" is **ad-hoc**, checked inline per procedure.

## 5. Webhook handlers (inbound)

| Endpoint | File | Verification |
|---|---|---|
| GitHub | `apps/api/src/app/api/github/webhook/{route,webhooks}.ts` | `@octokit/webhooks` `Webhooks({secret})`, verifies `x-hub-signature-256` **before** persisting (`route.ts:23`) |
| Linear | `apps/api/src/app/api/integrations/linear/webhook/route.ts` | Linear SDK `webhookClient.parseData(body, signature)` (`route.ts:30`) |
| _idempotency_ | `packages/db/drizzle/0004_webhook_events_idempotency.sql` | dedupe table for webhook events |

- **No Stripe webhook handler** in app code (`constructEvent`/`stripe.webhooks` = 0) — Stripe is wired via the `@better-auth/stripe` plugin, which owns its own webhook handling.
- Only **2 hand-rolled inbound webhooks** (GitHub, Linear); each delegates signature verification to the respective vendor library and shares an idempotency table.

## Summary

- HTTP: native `fetch` (152 sites) + a generated SDK + tRPC. No third-party HTTP lib.
- Retry: **no dedicated lib**; SDK + react-query + scattered `retries: 3`.
- Validation: **Zod-exclusive** (196 files).
- Authz: tRPC + better-auth roles; **no formal permission layer**.
- Webhooks: **2 endpoints** (GitHub/Linear), vendor-verified, idempotent.

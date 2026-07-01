## WS-E: Economy completion + Stripe removal (#70) — Spec

> Read-only discovery + Phase-2 implementation spec. Every claim is grounded in `file:line`.
> Owner-locked decisions: HYBRID HOST MODEL, unify-not-delete, 2-phase parallel execution, multiplatform-first.

---

### 1. Findings

#### 1.1 Maturity map (what exists vs what is wired)

The economy is a **mature, fully-tested PURE CORE in `packages/shared` + an applied DB schema/migration, but almost ZERO wiring**. The "primitives" slices (#34 slices 1–4) are done; the "wire it into the product" slices are not.

| Layer | State | Evidence |
|---|---|---|
| DB schema (5 tables) | DONE | `packages/db/src/schema/economy.ts:53-243` (modelCatalog, roxTopups, usageRequests, roxBalances, roxLedger) |
| Migration applied | DONE | `packages/db/drizzle/0063_rox_economy_tables.sql:1-60` |
| pgEnums | DONE | `packages/db/src/schema/enums.ts:403-419` (`roxLedgerKindValues`, `roxTopupStatusValues`) |
| Pricing core | DONE + tested | `packages/shared/src/rox-pricing.ts` (`usdToRox`, `quantizeRox`, `roxSellPriceUsdPerMillion`, divisors) + `rox-pricing.test.ts` |
| Ledger arithmetic | DONE + tested | `packages/shared/src/rox-ledger.ts:73-153` (`applyTopUp`, `applyGrant`, `applyRequestCharge`) |
| Charge decision (tiered) | DONE + tested | `packages/shared/src/rox-charge.ts:63-127` (`decideRoxCharge`) |
| Settlement plan | DONE + tested | `packages/shared/src/rox-settlement.ts:48-77` (`planRequestSettlement`) |
| Top-up / on-ramp logic | DONE + tested | `packages/shared/src/rox-topup.ts` (`creditConfirmedPayment`, `settleTopUp`, `quoteTopUp`) |
| dv.net client | DONE + tested | `packages/shared/src/dvnet-client.ts` (`buildInvoiceRequest`, `normalizeDvNetWebhook`, `DvNetHttpClient`) |
| Perk/tier matrix | DONE + tested | `packages/shared/src/rox-perks.ts:24-68` (`ROX_PERKS`, `resolveTier`, `canAfford`) |
| Model catalog types + ROX_R1 | DONE | `packages/shared/src/rox-models.ts:60-176` |
| **Balance READ endpoint** | PARTIAL (read only, no router of its own) | `packages/trpc/src/router/user/user.ts:50-121` (`user.accountOverview` — seeds balance, returns balance+ledger+usage) |
| **economy tRPC router** | **MISSING** | no `packages/trpc/src/router/economy/` exists (`ls packages/trpc/src/router/` shows none) |
| **topup procedures** | **MISSING** | nothing calls `buildInvoiceRequest`/`settleTopUp` outside tests (grep: only `dvnet-client(.test)`) |
| **charge/meter write path** | **MISSING** | `planRequestSettlement`/`decideRoxCharge`/`applyRequestCharge` are **orphaned** — grep finds zero non-test callers |
| **usage_requests INSERT** | **MISSING** | only `insert(roxBalances)` (seed) exists; chat stream route `apps/api/src/app/api/chat/[sessionId]/stream/route.ts` (215 lines) emits **no** usage/token/cost (grep `usage|token|onFinish|cost` → nothing) |
| **dv.net webhook route** | **MISSING** | no route under `apps/api/src/app/api/.../dvnet|topup` (only discord/linear/telegram/slack/github webhooks exist) |
| **models tRPC router / catalog read** | **MISSING** | grep `modelCatalog|model_catalog|ROX_R1` across `packages/trpc` + `apps/api` → zero hits |
| **admin grant/bonus** | **MISSING** | `packages/trpc/src/router/admin/admin.ts:9-23` has only `listUsers`/`deleteUser` |

#### 1.2 What is needed to FINISH the tRPC routers

Create a dedicated **`economy` router** (decision: keep economy procedures together, separate from the auth-shaped `user` router; move/alias the existing `user.accountOverview` read into it). Required procedures:

- **`economy.balance`** (query, protected) — read current balance; seed 500 Rox on first read. Logic already lives at `user.ts:54-71`; lift it into a shared helper `ensureBalance(userId)`.
- **`economy.ledger`** (query, protected) — paginated ledger list (`roxLedger` ordered desc, `limit`/`cursor`). Read shape exists at `user.ts:73-85`.
- **`economy.usage`** (query, protected) — paginated `usage_requests` for the user/active org. Read shape exists at `user.ts:94-110`. (Distinct from the `usage` router's `usageDaily` per-tool aggregation in `packages/trpc/src/router/usage/usage.ts` — keep both; they are different tables.)
- **`economy.topup.createInvoice`** (mutation, protected) — input `{ usdtAmount }`; insert a `rox_topups` row (`status:'pending'`), call `buildInvoiceRequest(usdtAmount, topupId, callbackUrl)` (`dvnet-client.ts:135`), return the dv.net invoice/checkout URL. Secret read ONLY inside `DvNetHttpClient` (`dvnet-client.ts:252-276`).
- **`economy.topup.quote`** (query, public/protected) — `quoteTopUp(usdt)` (`rox-topup.ts:83`) preview, no mutation.
- **`economy.charge` / metering** — NOT a user-facing procedure; an **internal server helper** `settleRequest(tx, {userId, modelId, usage, ...})` that runs `planRequestSettlement` (`rox-settlement.ts:48`) and writes the three rows in one transaction (see 1.3). Called from the chat/agent completion path, not from a tRPC mutation.
- **`economy.models.list`** (query, public) — read `model_catalog` for the agents cabinet / model picker. Needs a sync job to populate (1.3).
- **`economy.admin.grant`** (mutation, **adminProcedure**) — see 1.4.

#### 1.3 What is needed BEYOND the schema (services, hook, webhook, jobs)

1. **Metering hook (the biggest gap).** The chat stream route (`apps/api/src/app/api/chat/[sessionId]/stream/route.ts`) does not emit usage. A completion-side hook must: read the model's `PricingFields` from `model_catalog` (or `ROX_R1` for the free model), call `planRequestSettlement({balance, usage, entry, tier, modelId})` (`rox-settlement.ts:48`), then in ONE Drizzle transaction:
   - always `insert(usageRequests)` (even free/blocked) — `rox-settlement.ts:9-11`,
   - `insert(roxLedger)` **only** when `plan.ledgerDeltaRox !== null`, with the generated `usageRequestId` (`economy.ts:224`),
   - `update(roxBalances)` **only** when `plan.newBalanceRox !== null`.
   This service belongs at the **host-service / API layer** so both web and desktop agents settle through the same path (multiplatform-first). Wave note: the exact emit point depends on the agent/host completion event — coordinate with the host workstream for the call site (this WS owns the *settlement service*, not the agent runtime).

2. **Tier resolution decoupled from Stripe.** `resolveTier` (`rox-perks.ts:49`) currently maps subscription status → tier, but `packages/auth/src/server.ts:594-597` already removed subscription lookup (`plan` is hard-coded `null`). So **every user resolves to `free` today**. Decision for #70 (no Stripe): default everyone to `subscriber`-equivalent perks OR keep `free` and rely purely on prepaid balance + top-ups. Recommended: treat all users as prepaid (`free` tier = hard-stop at 0, top-up to continue); drop the postpaid/`canSpendBelowZero` path from the live wiring (keep the pure code). This removes the last semantic dependency on subscriptions.

3. **dv.net webhook (payment-in path).** New API route `apps/api/src/app/api/economy/dvnet/webhook/route.ts`: validate body via `normalizeDvNetWebhook` (`dvnet-client.ts:179`), match `order_id`→`rox_topups.id`, run `creditConfirmedPayment(balance, payment, processedIds)` (`rox-topup.ts:107`), and on `credited:true` atomically: update topup `status:'confirmed'`+`confirmedAt`, `insert(roxLedger)` with `kind:'topup'`+`topupId`, `update(roxBalances)`. Idempotency keyed on `dvnet_invoice_id` (unique index `economy.ts:125`).

4. **Settlement/reconciliation job.** A periodic poll (`settleTopUp` via `DvNetHttpClient.getPayment`, `dvnet-client.ts:278`) for pending topups whose webhook never arrived. Optional P2.

5. **models.dev catalog sync.** A script/cron that populates `model_catalog` (provider, modelId, public prices, `pricingFamily` via `resolveProviderFamily` `rox-pricing.ts:108`, capabilities). Must upsert `ROX_R1` (`rox-models.ts:83`) as the free house model. Without this, `economy.models.list` returns empty and metering has no prices.

6. **Ledger-kind translation layer (REAL BUG).** DB enum `roxLedgerKindValues = ["topup","request_charge","adjustment","seed"]` (`enums.ts:403-408`) does NOT match shared `RoxLedgerReason = ["topup","request","grant","adjustment"]` (`rox-ledger.ts:17`). grep confirms **no translation exists anywhere**. The persistence layer MUST map: `request`→`request_charge`, `grant`→`adjustment` (or add `grant` to the enum), and use `seed` for the 500-Rox starting grant. Add a pure `toLedgerKind(reason)` mapper in shared with a test asserting exhaustiveness, so a future enum drift fails CI.

#### 1.4 Admin top-up with bonus coins

- Procedure: **`economy.admin.grant`** (mutation, `adminProcedure` — gated by `@rox.one` email, `trpc.ts:128-137`). Input `{ userId, rox: number (>0), note?: string }`.
- Logic: `ensureBalance(userId)` → `applyGrant(balance, rox, note)` (`rox-ledger.ts:90`) → in one tx: `update(roxBalances)` + `insert(roxLedger)` with `kind:'adjustment'` (the enum value for grants/bonuses; `enums.ts:406`), `deltaRox = +rox`, `note`.
- Admin UI: the admin app already calls `trpc.admin.*` (`apps/admin/src/app/(dashboard)/users/components/UsersTable/UsersTable.tsx:49`). **Coordinate with WS-F**: WS-F builds the "Grant bonus Rox" UI in the admin users table; WS-E owns the procedure + ledger semantics. Contract for WS-F: `trpc.economy.admin.grant.mutate({ userId, rox, note })` → returns `{ balanceAfter, ledgerEntryId }`.

#### 1.5 Stripe removal plan (#70)

Real Stripe coupling is **schema + relations only** — no live Stripe SDK/code (the `stripe-gradient`/`mesh-gradient` hits in `apps/*` and `packages/ui` are an unrelated Stripe *visual* library, not billing). Subscription gating was already neutralized at `auth/src/server.ts:594`.

Surfaces to remove/migrate:
- **`subscriptions` table** — `packages/db/src/schema/schema.ts:290-326`. Consumers: `packages/db/src/utils/membership.ts:6,25,43-63` (`findOrgMembershipWithSubscription`) used by `packages/trpc/src/router/integration/utils.ts` and `packages/trpc/src/router/utils/active-org.ts`, and `packages/db/src/schema/relations.ts:40,109,187`.
- **`organizations.stripeCustomerId`** — `packages/db/src/schema/auth.ts:110`.
- **`subscriptions.stripeCustomerId` / `stripeSubscriptionId` / `stripeScheduleId`** — `schema.ts:298-299,311`.
- **`attribution.paymentAttributions.provider` default `"stripe"`** — `packages/db/src/schema/attribution.ts:90` (and denormalized utm snapshot is fine to keep; just drop the stripe default).
- **`packages/shared/src/billing.ts`** — `PLAN_TIERS`/`ACTIVE_SUBSCRIPTION_STATUSES` (`billing.ts:1-17`); only `ACTIVE_SUBSCRIPTION_STATUSES` is used (by `membership.ts:50`).

Safe, reversible removal order (NOTE: `paymentAttributions`, `subscriptions`, `organizations` are owned by WS-O — WS-E authors the **schema diffs + migration intent** but coordinates the actual edits with WS-O to avoid file overlap; see §4/§5):
1. **P0 (this WS, no schema change):** add `toLedgerKind` mapper + economy router + admin grant + tier-decoupling, so the economy is self-sufficient without subscriptions.
2. **P1 step A:** delete the consumers — replace `findOrgMembershipWithSubscription` with a subscription-free `findOrgMembership` everywhere it is used (`integration/utils.ts`, `utils/active-org.ts`); update `attribution.ts:90` to drop the `"stripe"` default (set `provider` required, no default, or default `"dvnet"`).
3. **P1 step B (WS-O coordination):** drop `subscriptions` table + relations (`schema.ts:290-326`, `relations.ts:40,109,187`), drop `organizations.stripeCustomerId` (`auth.ts:110`), then `bunx drizzle-kit generate --name="remove_stripe_subscriptions"`. Two-migration safety: first migration drops FKs/indexes + columns, keeps no data dependency; table is org-billing only and unused post-step-A.
4. **P1 step C:** delete `billing.ts` `PLAN_TIERS` (keep `isActiveSubscriptionStatus` only if a non-billing consumer remains — none found, so delete the file once `membership.ts` no longer imports it).

Data-loss caution: `subscriptions` may hold historical paid rows in prod. Migration must be confirmed with the owner before `drizzle-kit migrate` (per AGENTS.md DB rules). Generation is offline and safe.

---

### 2. Target design

#### 2.1 Data flow — metering a paid request (charge path)

```
agent/chat completion (host-service or api)
        │  {userId, modelId, tokensIn, tokensOut}
        ▼
  ensureBalance(userId) ──► roxBalances (seed 500 if absent)
        │
  read PricingFields ◄── model_catalog (or ROX_R1 if free)
        │
  planRequestSettlement({balance, usage, entry, tier:'free', modelId})   [pure, rox-settlement.ts:48]
        │  → { decision, usage{...}, ledgerDeltaRox, newBalanceRox }
        ▼
  ONE Drizzle TX:
    INSERT usage_requests            (always)            economy.ts:138
    if ledgerDeltaRox !== null:
        INSERT rox_ledger (kind=toLedgerKind('request'))  economy.ts:213
        UPDATE rox_balances = newBalanceRox               economy.ts:182
```

#### 2.2 Data flow — top-up (payment-in)

```
client ── economy.topup.createInvoice({usdtAmount}) ──►
    INSERT rox_topups(status='pending')                     economy.ts:105
    buildInvoiceRequest(usdt, topupId, callbackUrl)         dvnet-client.ts:135
    return dv.net checkout URL
                       ⋮ (user pays) ⋮
dv.net ── POST /api/economy/dvnet/webhook ──►
    normalizeDvNetWebhook(body)                             dvnet-client.ts:179
    match order_id → rox_topups.id
    creditConfirmedPayment(balance, payment, processedIds)  rox-topup.ts:107
    if credited: TX { UPDATE topup confirmed; INSERT ledger kind='topup'; UPDATE balance }
```

#### 2.3 Admin grant

```
admin (UI, WS-F) ── economy.admin.grant({userId, rox, note}) [adminProcedure] ──►
    ensureBalance(userId)
    applyGrant(balance, rox, note)                          rox-ledger.ts:90
    TX { UPDATE rox_balances; INSERT rox_ledger kind='adjustment', delta=+rox, note }
    → { balanceAfter, ledgerEntryId }
```

#### 2.4 Ledger-kind mapping (fixes §1.3.6 drift)

```
RoxLedgerReason (shared)   →   rox_ledger_kind (db enum)
  "topup"                  →   "topup"
  "request"                →   "request_charge"
  "grant"                  →   "adjustment"
  "adjustment"             →   "adjustment"
  (starting seed)          →   "seed"
```

---

### 3. Phase-2 implementation tasks (TDD, bite-sized)

**T1 — `toLedgerKind` mapper (shared).**
- Create `packages/shared/src/rox-ledger-kind.ts` exporting `toLedgerKind(reason: RoxLedgerReason | "seed"): RoxLedgerKind`.
- Test `rox-ledger-kind.test.ts`: assert each mapping in §2.4 + an exhaustiveness/`never` guard so adding a `RoxLedgerReason` without mapping fails typecheck.
- Behavior: pure, no I/O. Import `RoxLedgerKind` from `@rox/db/enums`.

**T2 — `ensureBalance` + `settleRequest` server service (trpc lib).**
- Create `packages/trpc/src/router/economy/economy.service.ts`: `ensureBalance(userId)` (lift `user.ts:54-71`), and `settleRequest(args)` that runs `planRequestSettlement` + the §2.1 transaction using `toLedgerKind`.
- Test `economy.service.test.ts`: stub Drizzle; assert (a) free request inserts only usage, no ledger/balance; (b) paid affordable request inserts usage+ledger(`request_charge`)+balance; (c) the `usageRequestId` is back-filled into the ledger row.

**T3 — `economy` router skeleton (balance/ledger/usage).**
- Create `packages/trpc/src/router/economy/economy.ts` + `index.ts`; register in `packages/trpc/src/root.ts` (`economy: economyRouter`).
- Procedures `balance`, `ledger` (cursor pagination), `usage` (cursor pagination) reusing the read shapes at `user.ts:73-110`.
- Test `economy.test.ts`: balance seeds 500 on first call; ledger/usage respect limit + ordering.

**T4 — top-up procedures.**
- In `economy.ts`: `topup.quote` (`quoteTopUp`), `topup.createInvoice` (insert pending `rox_topups`, `buildInvoiceRequest`, return URL).
- Test: invoice row created with `status:'pending'`; `createInvoice` rejects non-positive `usdtAmount` (mirror `DvNetInvoiceError`).

**T5 — dv.net webhook route (api).**
- Create `apps/api/src/app/api/economy/dvnet/webhook/route.ts`: `normalizeDvNetWebhook` → match order_id → `creditConfirmedPayment` → confirm+credit TX.
- Test `route.test.ts` (mirror `telegram/webhook/route.test.ts` style): confirmed credits once; duplicate is a no-op; bad body → 400; unsupported asset → skip.

**T6 — admin grant procedure.**
- In `economy.ts`: `admin.grant` (`adminProcedure`), `applyGrant` → TX with `kind:'adjustment'`, return `{balanceAfter, ledgerEntryId}`.
- Test: non-`@rox.one` user → FORBIDDEN; grant credits + appends ledger; `rox<=0` rejected.

**T7 — models catalog read + sync seed.**
- In `economy.ts`: `models.list` reading `model_catalog`.
- Create `packages/scripts/src/sync-model-catalog.ts` (offline upsert incl. `ROX_R1`); test the pure transform (models.dev row → `InsertModelCatalog` via `resolveProviderFamily`).

**T8 — migrate `user.accountOverview` → economy.**
- Keep `user.accountOverview` as a thin re-export/deprecation that calls the new economy procedures so `AccountUsagePanel.tsx:155` keeps working; OR update the desktop panel to call `trpc.economy.*` (coordinate with WS that owns desktop settings). Minimal: keep `user.accountOverview` delegating to shared `ensureBalance`/read helpers to avoid touching desktop UI in this WS.

**T9 — tier decoupling.**
- In `economy.service.ts`, hardcode `tier:'free'` (prepaid hard-stop) until subscriptions removed; add TODO referencing #70. No subscription read in the charge path.

**T10 — Stripe removal (P1, sequenced after T1–T9).**
- Replace `findOrgMembershipWithSubscription` callers (`integration/utils.ts`, `utils/active-org.ts`) with subscription-free membership; coordinate the schema drops (`subscriptions`, `organizations.stripeCustomerId`, `attribution.provider` default) with **WS-O**, then `bunx drizzle-kit generate --name="remove_stripe_subscriptions"`.
- Test: membership/active-org tests pass without subscription join; `paymentAttributions` insert no longer defaults `provider="stripe"`.

---

### 4. File ownership (Phase-2, this workstream)

**WS-E OWNS (may create/modify freely):**
- `packages/db/src/schema/economy.ts` (locked owner per task brief)
- `packages/shared/src/rox-ledger-kind.ts` (+ `.test.ts`) — NEW
- `packages/shared/src/billing.ts` (delete after consumers migrated; coordinate timing)
- `packages/trpc/src/router/economy/**` — NEW (economy.ts, economy.service.ts, index.ts, tests)
- `packages/trpc/src/router/admin/admin.ts` (add nothing here — grant lives in economy router; only touch if WS-F prefers `admin.grantRox`, decide jointly)
- `apps/api/src/app/api/economy/**` — NEW (dvnet webhook route + test)
- `packages/scripts/src/sync-model-catalog.ts` (+ test) — NEW
- Migration generation output for economy/Stripe-removal under `packages/db/drizzle/**` (auto-generated only; never hand-edit per AGENTS.md)

**WS-E MODIFIES (single-line registrations — low conflict, declare in PR):**
- `packages/trpc/src/root.ts` (add `economy` import + registration; lines ~34/75 region)
- `packages/trpc/src/router/user/user.ts` (T8: make `accountOverview` delegate to economy helpers)

**WS-E does NOT own (coordinate — see §5):**
- `packages/db/src/schema/schema.ts` (subscriptions), `auth.ts` (stripeCustomerId), `attribution.ts`, `relations.ts` → **WS-O**
- `packages/db/src/utils/membership.ts`, `integration/utils.ts`, `utils/active-org.ts` → confirm with WS-O whether these belong to WS-E (consumers) or WS-O (schema). Proposal: **WS-E owns the consumer edits, WS-O owns the table drops**, sequenced.
- Admin UI (`apps/admin/**`) → **WS-F**

---

### 5. Dependencies + wave

- **Depends on / coordinates with WS-O** (other schema files): Stripe-removal schema drops in `schema.ts`/`auth.ts`/`attribution.ts`/`relations.ts`. WS-E provides the exact diff + migration intent; WS-O applies to avoid file overlap. The economy-router work (T1–T9) has **no WS-O dependency** and can ship first.
- **Coordinates with WS-F** (admin UI): contract `trpc.economy.admin.grant({userId, rox, note})`. WS-E ships the procedure; WS-F consumes it.
- **Coordinates with host/agent workstream** for the metering call site (where `settleRequest` is invoked on completion). WS-E owns the service; the call-site wiring is a thin hook the host WS adds.

**Wave:**
- **P0:** T1, T2, T3, T6, T9 (mapper, settlement service, balance/ledger/usage read router, admin grant, tier decouple) — self-contained, unblocks WS-F.
- **P1:** T4, T5, T7, T8 (top-up + webhook + catalog sync + accountOverview migration) + **T10 Stripe removal** (after WS-O sync).
- **P2:** settlement/reconciliation poll job; metering call-site integration with host WS.

---

### 6. Target PR

- Branch (P0): `feat/ws-e-economy-router`
- PR title (P0): `feat(economy): wire balance/ledger/usage + admin grant tRPC router over the prepaid Rox core`
- Branch (P1): `feat/ws-e-topup-webhook-stripe-removal`
- PR title (P1): `feat(economy): dv.net top-up + webhook, model catalog sync, and Stripe subscriptions removal (#70)`

---

### Decision updates (resolved forks — see `DECISIONS.md`)

- **D2 (owner) — just DELETE old Stripe data; no archive.** Stripe removal (#70) is a **straight drop**: no
  `*_archive` table, no export-before-drop, no preservation step. This **closes Q5** of §7b (the "prod-data
  preservation" open question) — there is nothing to preserve. T10 + §1.5 drop the `subscriptions` table,
  `organizations.stripe_customer_id`, and the `attribution.payment_attributions.provider` stripe default
  outright. **Still offline-only at plan time:** author the migration with `bunx drizzle-kit generate` ONLY;
  NEVER run `drizzle-kit migrate`/`push` — applying the drop to production is a separate human-gated deploy.
- **D8 (technical) — serial migration generation + WS-O owns the explicit Stripe-drop task.** WS-E and WS-O
  both write `packages/db/drizzle/`, and `drizzle-kit generate` is journal-order-dependent, so the two runs
  are **serialized: WS-O generates first (org tables), THEN WS-E rebases and regenerates the Stripe-removal
  drop.** Strict order for T10: (step A) WS-E consumer removal — replace `verifyOrgMembershipWithSubscription`
  (`integration/utils.ts:54`), `requireActiveOrgMembershipWithSubscription` (`active-org.ts:46`), and
  `findOrgMembershipWithSubscription` (`membership.ts:33`) with the EXISTING subscription-free
  `findOrgMembership` (`membership.ts:8`), and delete `billing.ts`; (step B) **WS-O** applies the schema drop
  (now an explicit WS-O task per D8) and generates first; (step C) WS-E runs
  `bunx drizzle-kit generate --name="remove_stripe_subscriptions"` AFTER WS-O's generate. WS-E owns the
  consumer/tRPC edits (`integration/utils.ts`, `active-org.ts`, `membership.ts`, `billing.ts`); WS-O owns the
  `schema.ts`/`auth.ts`/`attribution.ts`/`relations.ts` drops. This resolves residuals #4 (serial co-gen) and
  #6 (Stripe-drop now scheduled in WS-O).

---

### 7. Hardening review

> Read-only verification pass (2026-06-20). Spot-checked every `file:line` claim against current `main`-branch source. The core spec is **factually strong** — schema, shared core, and "what's missing" maturity map are accurate. Corrections below are mostly precision fixes on the Stripe-removal consumer chain; one of them is load-bearing for completeness.

#### (a) Factual corrections (with file:line)

1. **CORRECTION (load-bearing) — Stripe consumer chain is one layer deeper than stated.** §1.5 step 78/86 and T10 (line 193) say `findOrgMembershipWithSubscription` is "used by `integration/utils.ts` and `utils/active-org.ts`". Verified: only **`integration/utils.ts:58`** calls `findOrgMembershipWithSubscription` directly. `utils/active-org.ts` does **not** import it — it imports **`verifyOrgMembershipWithSubscription`** (a wrapper defined at `packages/trpc/src/router/integration/utils.ts:54`) at `active-org.ts:6`, and exposes it via `requireActiveOrgMembershipWithSubscription` (`active-org.ts:46-58`). So the actual call graph is: `active-org.ts` → `verifyOrgMembershipWithSubscription` (integration/utils.ts:54) → `findOrgMembershipWithSubscription` (membership.ts:33). **The removal in T10 must also retire/replace the `verifyOrgMembershipWithSubscription` wrapper and `requireActiveOrgMembershipWithSubscription`**, not only `findOrgMembershipWithSubscription`, or the build breaks / dead Stripe path survives.

2. **CORRECTION — membership.ts line range.** §1.5 line 78 cites `membership.ts:6,25,43-63`. Verified: `findOrgMembershipWithSubscription` spans **membership.ts:33-64** (decl at 33, returns at 63); the subscription import is `membership.ts:6`; `ACTIVE_SUBSCRIPTION_STATUSES` use is `membership.ts:50`. There is also a clean **subscription-free `findOrgMembership` already exported at `membership.ts:8`** — the spec proposes "create a subscription-free `findOrgMembership`" (line 86) but it **already exists**; T10 should reuse it, not create it.

3. **CORRECTION — billing.ts surface is wider than the 1-17 cite, but the "only ACTIVE used" verdict holds.** §1.5 line 82 cites `billing.ts:1-17` and says "only `ACTIVE_SUBSCRIPTION_STATUSES` is used (by membership.ts:50)". Verified: file also exports `PLAN_TIERS`, `isPaidPlan`, `isActiveSubscriptionStatus` (the cited range 1-17 stops short of `isActiveSubscriptionStatus`). Grep confirms **zero non-test consumers** of `PLAN_TIERS`, `isPaidPlan`, `isActiveSubscriptionStatus` — so the "delete the file after membership.ts migrates" plan is correct; just note all four exports go, not the two named.

4. **CONFIRMED — `resolveTier` line cite slightly off.** §1.3.2 cites `rox-perks.ts:49`. Verified `resolveTier` is at **rox-perks.ts:49-53** (correct). The claim "every user resolves to `free` today" is verified-by-inference: `resolveTier` keys on `subscriptionStatus`, and `auth/src/server.ts` hard-codes `plan = null` (verified at **server.ts:595-596**, comment "#34.1: plan tiers removed"; spec cited 594-597 — within ±1). Accurate.

5. **CONFIRMED — schema/enum/dvnet/settlement cites all accurate.** economy.ts table+line cites (modelCatalog 53, roxTopups 105, usageRequests 138, roxBalances 182, roxLedger 213, usageRequestId FK 224, dvnet unique index 125) all verified exact. `roxLedgerKindValues = ["topup","request_charge","adjustment","seed"]` at **enums.ts:403-408** and `RoxLedgerReason = ["topup","request","grant","adjustment"]` at **rox-ledger.ts:17** — the §1.3.6 enum-drift bug is **real and correctly diagnosed**. dvnet-client cites (buildInvoiceRequest 135, normalizeDvNetWebhook 179, DvNetHttpClient 252, getPayment 278) and rox-topup cites (quoteTopUp 83, creditConfirmedPayment 107, settleTopUp 154) verified. `planRequestSettlement` at rox-settlement.ts:48 with `ledgerDeltaRox`/`newBalanceRox` null-gating at :74-75 verified.

6. **CONFIRMED — "zero wiring" maturity map is accurate.** Verified by grep: no `packages/trpc/src/router/economy/` dir; `adminRouter` has only `listUsers`/`deleteUser` (admin.ts:10,16); chat stream route exists (215 lines) with **0** matches for `usage|token|onFinish|cost`; **zero** `insert(usageRequests)`/`insert(roxLedger)`/`insert(roxTopups)` non-test callers anywhere; zero `modelCatalog|model_catalog|ROX_R1` references in trpc/api. The orphaned-core claim is fully substantiated.

7. **MINOR — `accountOverview` seed mechanism.** §1.2 says `economy.balance` should "seed 500 Rox on first read … logic already lives at `user.ts:54-71`". Verified: the 500 seed is the **column default** `balanceRox.default("500")` (economy.ts:193) — the app code (`user.ts:54-61`) only does `insert(...).onConflictDoNothing()`; it does not pass an amount. `ensureBalance` must keep relying on the column default (or pass `STARTING_BALANCE_ROX` explicitly) — don't assume app-side seeding exists today.

8. **MINOR — attribution/subscriptions line cites.** `attribution.paymentAttributions.provider` default `"stripe"` verified at **attribution.ts:90** (exact). `subscriptions` table is **schema.ts:290-323** (spec said 290-326 — off by 3, table closes at 323). `organizations.stripeCustomerId` at **auth.ts:110** (exact). `relations.ts` subscription refs at 40/109/187 (exact). adminProcedure gate verified at **trpc.ts:128-137**, gated on `COMPANY.EMAIL_DOMAIN = "@rox.one"` (constants.ts:17).

#### (b) Brief questions not fully answered

- **Q1 — `usage_requests.organizationId` semantics on free/personal requests.** The metering hook (§2.1) writes `usageRequests` always, but the FK is nullable and `economy.usage` filters by active org (`user.ts:87-92`). What org is stamped for a desktop/personal-context request with no active org? Spec doesn't define the null-org charge path.
- **Q2 — Concurrency/locking on `roxBalances` during settle.** §2.1 "ONE Drizzle TX" reads balance then writes `newBalanceRox` computed in pure code. Under concurrent requests this is a lost-update race (read-modify-write without `SELECT … FOR UPDATE` or an atomic `balance = balance - cost`). Spec should state the locking strategy.
- **Q3 — `verifyOrgMembershipWithSubscription` replacement contract.** Given correction (a)(1), what do callers of `requireActiveOrgMembershipWithSubscription` (`active-org.ts:46`) get post-removal — does the return type drop `subscription`, and who owns updating those call sites? Not assigned.
- **Q4 — `topup.createInvoice` callbackUrl source.** §1.2 passes `callbackUrl` to `buildInvoiceRequest` but never defines where it comes from (env? per-app base URL?). Multiplatform (web vs desktop) implies different callback origins — unspecified.
- **Q5 — Migration data-handling for `subscriptions` prod rows.** §1.5 flags the data-loss caution but gives no archival/export step before drop. "Confirm with owner" is stated but no concrete preservation plan.

#### (c) Merge-safety check — file-ownership overlap vs siblings (WS-A…WS-O)

Without the sibling specs in-hand I check against the brief's ownership rule: **schema owned by WS-O except `economy.ts`=WS-E**, admin UI=WS-F. Findings:

- **OK (no overlap)** — WS-E's NEW files are uncontested: `packages/shared/src/rox-ledger-kind.ts`, `packages/trpc/src/router/economy/**`, `apps/api/src/app/api/economy/**`, `packages/scripts/src/sync-model-catalog.ts`. None are schema files; none are admin UI.
- **OK** — `packages/db/src/schema/economy.ts` is explicitly WS-E-owned per brief; no conflict with WS-O.
- **FLAG (declared, low risk)** — `packages/trpc/src/root.ts` and `packages/trpc/src/router/user/user.ts` are MODIFY targets (§4). These are likely also touched by whichever WS adds other routers / owns the user router. The spec already flags them as "single-line registrations — declare in PR". Acceptable but must be coordinated; root.ts registration line region cited as ~34/75 is **accurate** (imports end ~34, registrations ~46-75).
- **FLAG (real overlap, correctly self-identified)** — `packages/db/src/schema/{schema.ts,auth.ts,attribution.ts,relations.ts}` are **WS-O-owned**, and WS-E's T10 needs edits there. The spec correctly assigns the table drops to WS-O and keeps only "diff + migration intent" with WS-E. **No unilateral overlap as written** — but see next.
- **FLAG (new overlap surfaced by correction (a)(1))** — `packages/trpc/src/router/integration/utils.ts` and `packages/trpc/src/router/utils/active-org.ts` are the *consumer* edits for Stripe removal. The spec (§4 line 216) lists `integration/utils.ts` and `active-org.ts` as "confirm with WS-O whether WS-E or WS-O." Since the wrapper `verifyOrgMembershipWithSubscription` (integration/utils.ts:54) AND `membership.ts` AND `billing.ts` all participate, **ownership of these tRPC/consumer files must be nailed down** — they are tRPC-layer, not schema, so most naturally WS-E, but if a sibling owns the `integration` router this collides. **Recommend: WS-E explicitly claims `integration/utils.ts` + `active-org.ts` + `membership.ts` + `billing.ts` consumer edits, sequenced before WS-O's table drop.**
- **Cannot fully verify** — exact WS-A/B/C/D/G/H/I/J/K/L/M/N file lists were not provided to this pass; overlap with those is **unconfirmed**. The only schema file WS-E touches (`economy.ts`) is brief-sanctioned, so schema-side collision risk with WS-O is contained to the four Stripe files, which are already coordinated.

#### (d) Confidence per major claim

| Claim | Confidence | Basis |
|---|---|---|
| Economy schema + shared core DONE+tested, zero wiring | **High** | every cite verified; grep confirms no callers |
| Required tRPC procedures list (balance/ledger/usage/topup/charge/models/admin) | **High** | matches existing read shapes + missing-router evidence |
| Metering hook is the biggest gap (chat route emits nothing) | **High** | route verified, 0 usage/cost matches |
| Ledger-kind enum drift is a real bug needing `toLedgerKind` | **High** | both enums read directly; mismatch exact |
| Admin grant via `economy.admin.grant` + `adminProcedure` + `kind:'adjustment'` | **High** | adminProcedure gate + enum value verified |
| Stripe coupling is schema/relations only (no live SDK) | **Medium-High** | no billing SDK found; full app-wide SDK sweep not exhaustively run here |
| Stripe-removal consumer list (integration/active-org/membership/billing) | **Medium** | corrected — wrapper layer + existing `findOrgMembership` change the edit set |
| Migration drop order is safe/reversible | **Medium** | generate is offline+safe; prod-data preservation step still undefined (Q5) |
| No file-ownership overlap with siblings | **Medium** | WS-E-internal files clean; only Stripe-4 + tRPC consumers need WS-O/WS-F coordination; sibling specs not seen |

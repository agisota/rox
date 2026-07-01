# WS-F: Admin Expansion — Spec

> Workstream owner: Admin app (`apps/admin`) + admin/analytics tRPC surface.
> Phase 1 (this doc) = read-only discovery + spec. Phase 2 = implementation in an isolated worktree → one PR.
> All claims grounded in file:line as of branch `t/marketing-landing-publish-20260619`.

---

## 1. Findings

### 1.1 How real is the current admin?

**Verdict: the admin is half-real. Analytics is real-but-PostHog-only; the Users surface is a thin stub; revenue is a hardcoded zero stub; there is NO per-user drilldown, NO feature-flag management, NO balance/topup.**

**Auth gate (real, but coarse):**
- `apps/admin/src/app/(dashboard)/layout.tsx:26-43` — server component gate: requires a session, requires `session.user.email` to end with `COMPANY.EMAIL_DOMAIN` (`@rox.one`, `packages/shared/src/constants.ts:17`), then loads `trpc.user.me`. Redirects to `NEXT_PUBLIC_WEB_URL` otherwise.
- Server-side procedures are independently gated by `adminProcedure` (`packages/trpc/src/trpc.ts:128-137`) — same `@rox.one` email check. So the layout gate is convenience; the real enforcement is per-procedure. Good.
- **Gap:** gate is binary email-domain. There is no role column, no "developer-id" concept yet. The owner's later developer-id gating (automation flag + network-filter flag) has **no storage or check today** — confirmed: `grep` for `isDeveloper|developerId|role` in trpc/shared returns only the org `members.role` (`packages/db/src/schema/auth.ts:135`), unrelated to admin/developer gating.

**Analytics router (real, PostHog-backed — NOT stubs, with two exceptions):**
- `packages/trpc/src/router/analytics/analytics.ts`. Every dashboard chart is wired in `apps/admin/src/app/(dashboard)/page.tsx:32-74`.
- Data source = **PostHog**, not our Postgres, for almost everything:
  - `getActivationFunnel` (`analytics.ts:112-150`) and `getMarketingFunnel` (`:152-181`) → `executeFunnelQuery` against PostHog events (`desktop_opened`, `auth_completed`, `project_opened`, `workspace_created`, `$pageview`, `download_clicked`). Real, depends on events actually being emitted.
  - `getWAUTrend` (`:183-239`) and `getSignupsTrend` (`:321-357`) → raw **HogQL** via `executeHogQLQuery` over the PostHog `events` table. Real.
  - `getRetention` (`:241-265`) → `executeRetentionQuery` (`auth_completed` → `terminal_opened`, weekly, 5 intervals). Real.
  - `getTrafficSources` (`:359-404`) → PostHog `TrendsQuery` with `$referring_domain` breakdown. Real.
  - `getWorkspacesLeaderboard` (`:267-320`) → **hybrid**: HogQL pulls top `distinct_id`s, then `db.query.users.findMany(inArray(...))` joins names/emails from Postgres. Real, but silently drops any distinct_id not matched to a DB user (`:307` `if (!user) return null`).
- **Stub #1 — Revenue:** `getRevenueTrend` (`:406-431`) returns a date-filled array of `{ revenue: 0, mrr: 0 }`. **Pure placeholder.** With Stripe removed and the Rox token economy live (`packages/db/src/schema/economy.ts`), this should be re-sourced from `roxTopups` (USDT→Rox invoices) and/or `usageRequests.usdCost`.
- **PostHog client maturity:** `packages/trpc/src/lib/posthog-client.ts` is a real HTTP client with a KV cache layer (`posthog-client.ts:5-6`: `CACHE_PREFIX`, `isKVConfigured` via `KV_REST_API_URL/TOKEN`). So analytics quality degrades to "uncached" without KV but still functions. Event emission is via `captureEvent` (`analytics.ts:58-92`) dual-emitting PostHog + OpenPanel.

**Is the data actually being collected?** Yes — events are emitted from desktop/web via `analytics.captureEvent` and the renderer PostHog providers (e.g. `apps/desktop/src/renderer/providers/PostHogProvider/`, `apps/web/src/components/PostHogUserIdentifier/`). The funnel/retention queries reference real event names that exist in the emit paths. Caveat: correctness depends entirely on PostHog ingestion + on those exact event names continuing to be emitted — there is no DB-side cross-check today, and the admin shows nothing if PostHog is down.

**Users surface (stub — barely functional):**
- `apps/admin/src/app/(dashboard)/users/page.tsx` → renders `<UsersTable/>` only.
- `UsersTable` (`apps/admin/src/app/(dashboard)/users/components/UsersTable/UsersTable.tsx`) calls `trpc.admin.listUsers` (`:48-50`) and `trpc.admin.deleteUser` (`:58-71`). Table shows **only** avatar, name, email, joined-relative-time, and a destructive "Delete Permanently" action (`:151-198`). No pagination, no search, no row → detail navigation, no balance, no usage, no flags.
- `packages/trpc/src/router/admin/admin.ts` is **23 lines, 2 procedures**: `listUsers` (`findMany orderBy createdAt`, no pagination/limit — will not scale) and `deleteUser` (hard delete). That is the entire admin server surface today.

### 1.2 Per-user drilldown — current state

**Does not exist.** No `users/[userId]` route under `apps/admin/src/app/(dashboard)/users/`. No `admin.getUser` procedure. All the underlying data exists and is queryable:
- Profile/orgs: `users` (`packages/db/src/schema/auth.ts:16-26`), `members` + `organizations` (joinable as in `user.ts:38-48`).
- Balance + ledger + usage: `roxBalances`, `roxLedger`, `usageRequests` (`economy.ts:182-243`) — already aggregated for the *self* user in `user.accountOverview` (`packages/trpc/src/router/user/user.ts:50-121`); that exact query shape is the template for an admin per-user version.
- Sessions: `sessions` table (`auth.ts:40`).
- Token usage history: `usageDaily` (`packages/db/src/schema/profiles.ts`, queried in `usage.summary`, `usage.ts:45-113`).

### 1.3 Per-user feature flags — current state

**No per-user override storage exists.** Confirmed: `grep feature_flags|featureFlags|user_flags` across `packages/db/src/schema/` returns **nothing**. Flags today are 100% PostHog-evaluated:
- Flag keys are centralized in `FEATURE_FLAGS` (`packages/shared/src/constants.ts:105-132`): `ELECTRIC_TASKS_ACCESS`, `WEB_AGENTS_UI_ACCESS`, `GITHUB_INTEGRATION_ACCESS`, `CLOUD_ACCESS`, `DISABLE_REMOTE_AGENT`, `SLACK_MCP_V2`, `RELAY_URL_OVERRIDE`.
- Read paths: web server reads via `posthog.getFeatureFlag(...)` (`apps/web/src/app/(agents)/utils/getAgentsUiAccess/getAgentsUiAccess.ts:28-33`); desktop/web clients read via the PostHog browser SDK; CLI/server-without-SDK reads via `analytics.featureFlagPayload` (`analytics.ts:98-110`, calls `posthog.getFeatureFlagPayload`).
- **Implication:** toggling a surface per-user today means logging into PostHog and editing a flag rollout — there is no admin UI and no DB override. The owner wants an admin toggle that (a) persists in our DB and (b) is read by the apps. This requires a **new override table** (owned by WS-O schema) and a **read layer** that resolves DB-override-first, PostHog-fallback.

### 1.4 Balance + admin topup — current state

- Read side exists for self only: `user.accountOverview` reads `roxBalances`/`roxLedger`/`usageRequests` (`user.ts:50-121`). Balance is seeded to `500` Rox on first read via `onConflictDoNothing` insert (`user.ts:54-61`, default `economy.ts:191-193`).
- **No admin write path.** There is **no economy/topup router** — confirmed: `grep` for `econom|wallet|balance|topup` in `packages/trpc/src/router/` returns nothing; the only writers of `roxBalances`/`roxLedger` are in `user.ts`. `rox_topups` is for dv.net USDT invoices (`economy.ts:105-129`); a *bonus/admin grant* is a different ledger `kind` (see `roxLedgerKindValues` in `enums.ts`).
- **Coordination with WS-E:** the admin "top up bonus coins" action must call a WS-E-owned mutation (e.g. `economy.adminGrant`) that atomically (1) upserts `roxBalances`, (2) appends a `roxLedger` row with a bonus/grant `kind`. WS-F owns the **admin UI + the `admin.*` read procedures**; WS-E owns the **balance-mutating procedure**. WS-F must NOT write `roxBalances`/`roxLedger` directly (single writer = WS-E economy service) to avoid two code paths racing on the same row.

### 1.5 What else is missing / how to grow admin

- **No pagination/search** in `listUsers` (`admin.ts:10-14`) — loads all users; breaks at scale.
- **Revenue is fake** (`getRevenueTrend` returns zeros) — re-source from economy tables.
- **No org admin** — orgs/members are invisible in admin despite rich schema.
- **No host/sandbox visibility** — v2-hosts (`v2-host.ts`) and sandbox usage are unmonitored from admin; relevant to the convergence host model (cross-cutting with WS-G/host workstreams).
- **No audit trail** for admin actions (deleteUser, future topups, flag toggles) — high-blast-radius actions with zero accountability today.
- **No support/impersonation** linkage even though a `support` router exists.
- **DemoCountdown** (`page.tsx:83`) suggests the dashboard was built for a demo deadline, not steady-state ops.

---

## 2. Target design

### 2.1 Component / data-flow

```
                         apps/admin (Next.js 16, server gate @rox.one)
   ┌──────────────────────────────────────────────────────────────────────┐
   │  (dashboard)/users/page.tsx        → UsersTable (list + search + page) │
   │  (dashboard)/users/[userId]/page.tsx → UserDetail                      │
   │     ├─ ProfileCard      (admin.getUser)                                │
   │     ├─ OrgsCard         (admin.getUser → orgs/members)                 │
   │     ├─ BalanceCard      (admin.getUserBalance)  + TopUpDialog          │
   │     ├─ UsageCard        (admin.getUserUsage)                           │
   │     ├─ SessionsCard     (admin.getUserSessions)                        │
   │     └─ FeatureFlagsCard (admin.getUserFlags)  + FlagToggleRow          │
   └──────────────────────────────────────────────────────────────────────┘
                 │ tRPC (adminProcedure, @rox.one gate)
                 ▼
   packages/trpc/src/router/admin/admin.ts  (WS-F owns)
     listUsers(paginated+search) · getUser · getUserBalance · getUserUsage
     getUserSessions · getUserFlags · setUserFlag(→ delegates to flag service)
                 │                         │
   READ Postgres │                         │ WRITE (delegated)
                 ▼                         ▼
   users/members/orgs/sessions   ┌─ economy.adminGrant   (WS-E owns mutation)
   roxBalances/roxLedger (READ)  └─ flag override upsert  (WS-O owns table; WS-F calls)
   usageRequests / usageDaily
```

### 2.2 Feature-flag resolution (DB-override-first, PostHog fallback)

```
app surface needs flag X for user U
        │
        ▼
resolveFlag(X, U):
   override = SELECT value FROM user_feature_flags        ← WS-O table
              WHERE user_id=U AND key=X
   if override is not null:  return override.value        ← admin DB toggle wins
   else:                     return posthog.getFeatureFlag(X, U)   ← today's path
```

Admin toggle = upsert/delete a row in `user_feature_flags`. Three states per (user,key): **force-on**, **force-off**, **inherit** (= no row → PostHog decides). This naturally accommodates the owner's future flags: an `automation-enabled` flag and a `network-filter` flag are just two more keys in `FEATURE_FLAGS`, gated additionally by a developer-id check the owner adds later (the override table is key-agnostic, so no schema change needed for new flags).

### 2.3 Admin topup (sequence)

```
Admin clicks "Top up 500 bonus"
  → admin UI calls economy.adminGrant({ userId, amountRox, reason })   [WS-E]
       ↳ adminProcedure guard
       ↳ tx: upsert roxBalances (+amount); insert roxLedger {kind:'bonus', delta:+amount}
       ↳ (optional) insert admin_audit row                            [WS-J/WS-O]
  → returns new balance
  → admin UI invalidates admin.getUserBalance query → BalanceCard refreshes
```

### 2.4 ERD (new, owned by WS-O — WS-F consumes)

```
user_feature_flags
  id           uuid pk
  user_id      uuid fk users.id (cascade)
  key          text            ← matches FEATURE_FLAGS values
  value        boolean         ← force-on / force-off (absence = inherit)
  updated_by   uuid fk users.id (the admin)
  updated_at   timestamptz
  UNIQUE (user_id, key)
```

---

## 3. Phase-2 implementation tasks (TDD, bite-sized)

> WS-F implements the admin app + admin read procedures. It **consumes** a flag-override read helper (WS-O) and an `economy.adminGrant` mutation (WS-E). Until those land, WS-F builds against agreed interfaces (Section 5) and can ship the read-only drilldown first.

**T1 — Paginate + search `admin.listUsers`.**
- Modify `packages/trpc/src/router/admin/admin.ts`: add input `{ q?: string; limit: number(<=100) default 50; cursor?: string }`; return `{ users, nextCursor }`. Filter by `ilike(users.email|name, %q%)`; keyset on `createdAt,id`.
- Test: `apps/admin`-adjacent or `packages/trpc/src/router/admin/admin.test.ts` — seed 3 users, assert limit, cursor, and `q` filter. Mock `db` like existing trpc tests.
- Behavior: large user counts no longer all-load; existing `UsersTable` keeps working (additive input, all optional except defaults).

**T2 — `admin.getUser` procedure (profile + orgs).**
- Add to `admin.ts`: input `{ userId: z.string().uuid() }`; return user row + memberships (`members` with `organization`) mirroring `user.myOrganizations` (`user.ts:38-48`).
- Test: assert NOT_FOUND for unknown id; returns orgs for a member.

**T3 — `admin.getUserBalance` (read-only mirror of accountOverview for an arbitrary user).**
- Add to `admin.ts`: input `{ userId }`; return `{ balance, ledger(limit 100), }`. Reuse the read shape of `user.accountOverview` (`user.ts:50-121`) but **READ-ONLY** — do NOT seed/insert `roxBalances` here (avoid admin reads mutating user state); return `balanceRox: row?.balanceRox ?? "500"` if no row.
- Test: user with no balance row → returns "500", empty ledger; user with ledger → returns rows desc.

**T4 — `admin.getUserUsage` + `admin.getUserSessions`.**
- `getUserUsage`: input `{ userId }` → `usageRequests` (last 500, like `user.ts:94-110`) + optionally `usageDaily` rollup (reuse `usage.summary` aggregation logic, `usage.ts:51-113`).
- `getUserSessions`: input `{ userId }` → `sessions` rows (active/expiry) from `auth.ts:40`.
- Test: counts + ordering.

**T5 — `admin.getUserFlags` + `admin.setUserFlag` (consumes WS-O table + helper).**
- `getUserFlags`: returns, for each key in `FEATURE_FLAGS`, `{ key, description, override: boolean|null, effective: boolean }` where `override` = row in `user_feature_flags`, `effective` = `resolveFlag` (override ?? PostHog). Uses WS-O read helper `resolveUserFlag(userId,key)`.
- `setUserFlag`: input `{ userId, key: z.enum(Object.values(FEATURE_FLAGS)), value: boolean | null }`; `null` = clear override (inherit). Delegates the upsert/delete to WS-O helper `upsertUserFlagOverride(...)`. Validates `key` against `FEATURE_FLAGS` so unknown keys are rejected.
- Test: set force-on → effective true regardless of PostHog (mock posthog false); set null → falls back to PostHog mock.

**T6 — Admin topup wiring (consumes WS-E `economy.adminGrant`).**
- WS-F does NOT add the mutation; it calls `trpc.economy.adminGrant` from the UI. WS-F adds nothing to economy code. If `economy.adminGrant` is not yet merged, gate the TopUp button behind a feature presence check / leave the dialog calling the agreed procedure name.

**T7 — User detail route + components.**
- Create `apps/admin/src/app/(dashboard)/users/[userId]/page.tsx` (server component; reuse layout gate) → renders `UserDetail` client component.
- Create components under `.../users/[userId]/components/`: `ProfileCard/`, `OrgsCard/`, `BalanceCard/` (+ `TopUpDialog/`), `UsageCard/`, `SessionsCard/`, `FeatureFlagsCard/` (+ `FlagToggleRow/`) — each its own folder with `index.ts`, per AGENTS.md structure. Use existing `@rox/ui` primitives (Card, Table, Dialog, Switch/Badge) as in `UsersTable.tsx`.
- Tests: co-located `*.test.tsx` for `FeatureFlagsCard` (renders three states) and `TopUpDialog` (calls mutation with parsed amount). Mock tRPC like `UsersTable` patterns.

**T8 — Make rows navigable + search box.**
- Modify `UsersTable.tsx`: wrap row in a link/onClick → `/users/${user.id}`; add a search input bound to T1 input; add "Top up" + "Manage flags" quick actions in the existing dropdown menu (`UsersTable.tsx:173-195`). Keep the existing delete action.
- Test: clicking a row navigates (assert href); typing filters (assert query input).

**T9 — Real revenue (re-source `getRevenueTrend`).**
- Replace the zero-stub in `analytics.ts:406-431` with a Postgres query over `roxTopups` (confirmed `usdtAmount`, `confirmedAt`, `status='confirmed'`, `economy.ts:113-122`) grouped by day for `revenue`, and an MRR approximation (or explicitly return `mrr: null` with a comment if MRR is undefined under prepaid). Date-fill identical to current shape.
- Test: seed two confirmed topups on two days → assert per-day revenue; pending topups excluded.

**T10 — Admin audit (lightweight, coordinate WS-O/WS-J).**
- If WS-O ships an `admin_audit` table, wire `deleteUser`, `setUserFlag`, and topup to append an audit row. If not in scope this wave, leave a `// TODO(WS-O audit)` and a single helper seam so it's a one-line add later. Do not block on it.

---

## 4. File ownership (Phase-2 merge isolation)

**WS-F owns / may modify exclusively:**
- `apps/admin/**` — entire admin app (all routes, components, the new `users/[userId]/**` tree, `UsersTable`, dashboard `page.tsx` revenue display).
- `packages/trpc/src/router/admin/admin.ts` and `packages/trpc/src/router/admin/index.ts` — the admin router (all new `getUser*`/`setUserFlag` procedures + paginated `listUsers`).
- `packages/trpc/src/router/admin/admin.test.ts` — new test file (WS-F creates).
- `packages/trpc/src/router/analytics/analytics.ts` — **only the `getRevenueTrend` body** (T9). To avoid contention, prefer extracting revenue into a small helper that WS-F owns; if editing in place, this is the single line-range WS-F touches in this file.

**WS-F must NOT modify (reads/calls only):**
- `packages/db/src/schema/**` — all schema changes (incl. `user_feature_flags`, optional `admin_audit`) are deferred to **WS-O**.
- `packages/trpc/src/router/user/user.ts`, `.../usage/usage.ts` — read patterns are templates; do not edit.
- `packages/shared/src/constants.ts` `FEATURE_FLAGS` — adding new flag keys (automation/network-filter) is owner/WS-O scope.
- Any economy mutation — `economy.adminGrant` is **WS-E**.
- Flag-override read/write helpers (`resolveUserFlag`, `upsertUserFlagOverride`) — **WS-O** provides; WS-F imports.

---

## 5. Dependencies + suggested wave

**Hard dependencies:**
- **WS-O (schema)** — must ship `user_feature_flags` table + `resolveUserFlag`/`upsertUserFlagOverride` helpers before T5; optional `admin_audit` before T10. **Blocks T5, T10.**
- **WS-E (economy)** — must expose `economy.adminGrant({ userId, amountRox, reason })` (atomic balance upsert + ledger `bonus` row) before T6/TopUp goes live. **Blocks T6 wiring.**

**Soft coordination:**
- **WS-J** — if it owns the audit/automation/network-filter flag-gating logic, align on the `admin_audit` shape and on whether developer-id gating lives in `adminProcedure` or a new `developerProcedure`.

**Interface contracts to agree at wave start (so WS-F can build in parallel):**
1. `resolveUserFlag(userId: string, key: string): Promise<boolean | null>` (null = no override).
2. `upsertUserFlagOverride(userId, key, value: boolean | null, updatedBy)` (null = delete row).
3. `economy.adminGrant` input `{ userId: uuid, amountRox: number|string, reason: string }` → `{ balanceRox: string }`.

**Suggested wave: P1.**
- WS-F **read-only drilldown (T1–T4, T7 partial, T8, T9)** can start in **P0/early-P1** since it only needs existing Postgres tables — no dependency.
- **Flag toggle (T5) and topup (T6)** land in **P1**, gated on WS-O and WS-E respectively. Sequence: WS-O + WS-E schema/mutations (P0/early-P1) → WS-F consumes (P1).
- Audit (T10) in **P1/P2**.

---

## 6. Target PR

- **Branch:** `ws-f/admin-expansion`
- **PR title:** `feat(admin): per-user drilldown, feature-flag toggles, bonus topups + real revenue`

---

### 7. Hardening review

> Read-only verification pass against branch `t/marketing-landing-publish-20260619`. Each claim spot-checked in source. Line numbers below are freshly re-read, not copied from §1.

#### (a) Factual corrections (file:line)

1. **`bonus` ledger `kind` does NOT exist — BLOCKING for T6 design.** §1.4 says "a *bonus/admin grant* is a different ledger `kind` (see `roxLedgerKindValues` in `enums.ts`)" and §2.3 prescribes `insert roxLedger {kind:'bonus', delta:+amount}`. Actual values at `packages/db/src/schema/enums.ts:403-408` are exactly `["topup","request_charge","adjustment","seed"]` — **there is no `bonus` kind.** An admin grant must either reuse `"adjustment"` (the natural fit, already present) OR WS-O must add a `"bonus"`/`"grant"` value to `roxLedgerKindValues` (enum change = WS-O schema scope, NOT WS-F, NOT WS-E). **Action:** update §1.4/§2.3 to say `kind:'adjustment'` (no schema change, unblocks T6 immediately) or explicitly route a new enum value through WS-O. As written, T6/economy.adminGrant would fail an enum constraint at runtime.

2. **`adminProcedure` line range off by one.** §1 cites `packages/trpc/src/trpc.ts:128-137`. Actual definition spans `trpc.ts:128-137` for the body but the email check is at `:129`; the cited range is acceptable but the gate is `protectedProcedure.use(...)` checking `ctx.session.user.email.endsWith(COMPANY.EMAIL_DOMAIN)` — confirmed accurate, no role/developer dimension. Claim stands.

3. **`usage.summary` is `publicProcedure`, not a clean admin/self read.** §1.2 and T4 call `usage.summary` a template at "`usage.ts:45-113`". Actual: `summary` starts at `packages/trpc/src/router/usage/usage.ts:46` and is a `publicProcedure` guarded by `assertCanReadUsage(input.userId, ctx.session?.user.id)` (`:49`). T4's `getUserUsage` should reuse the aggregation loop but NOT inherit `publicProcedure`; keep it under `adminProcedure`. Also note `usageDaily` columns are `tool`/`model`/`date`/`inputTokens`/`outputTokens` (`profiles.ts:51-78`) — there is **no `usdCost`/`roxCost` on `usageDaily`**; USD/Rox cost lives only on `usageRequests` (`economy.ts:156-161`). §1.2 conflates the two sources; T4 must pick `usageRequests` for cost and `usageDaily` for token rollup.

4. **`accountOverview` seeding claim is correct and is a real footgun for T3.** §1.4/T3 warn that `user.accountOverview` inserts a `roxBalances` row on read (`user.ts:54-61`, `.onConflictDoNothing()`). Verified exactly. T3's "READ-ONLY, do not seed" guidance is correct and important — admin viewing a user must not materialize a balance row. Confirmed default `"500"` at `economy.ts:191-193` and the fallback string `"500"` at `user.ts:115`. Claim stands, keep the warning.

5. **`COMPANY.EMAIL_DOMAIN` / `FEATURE_FLAGS` line cites correct.** `EMAIL_DOMAIN: "@rox.one"` at `constants.ts:17` ✓; `FEATURE_FLAGS` block opens at `constants.ts:105` ✓ and contains the 7 keys listed (`:105-132` range is accurate). Claim stands.

6. **Leaderboard silent-drop line cite correct.** `if (!user) return null` at `analytics.ts:307` ✓; hybrid HogQL→`db.query.users.findMany(inArray(...))` at `:298-302` ✓. Claim stands.

7. **`getRevenueTrend` zero-stub confirmed verbatim.** `analytics.ts:406-431` returns date-filled `{revenue:0, mrr:0}` ✓. T9 re-source from `roxTopups` is sound; note correct columns are `usdtAmount`/`roxAmount`/`status`/`confirmedAt` (`economy.ts:113-122`) — the enum default status is `"pending"` (`:117`); §1.5/T9 assume a `"confirmed"` status value — **verify `roxTopupStatusValues` actually contains `"confirmed"`** (not re-checked here; flagged in (b)).

8. **`role` columns exist but are org-scoped (claim correct).** `members.role` at `auth.ts:135` (`default("member")`) and a second `role` at `auth.ts:208` (invitations). Neither is an admin/developer gate. §1 claim that there's no developer-id concept holds; `grep isDeveloper|developerId|developer_id` across trpc/shared/schema returns **NONE** ✓.

9. **Negative-existence claims all verified.** No flag-override table (`grep feature_flags|featureFlags|user_flags` in `packages/db/src/schema/` → NONE) ✓; no economy/topup router (only hit is `roxLedger.topupId` read in `user.ts:79` and a comment in `profile/stats.ts:54`) ✓; `support` router DOES exist at `packages/trpc/src/router/support/support.ts` (§1.5 "a `support` router exists" ✓). PostHog KV cache at `posthog-client.ts:5-6` ✓; flag read via `posthog.getFeatureFlag` in `getAgentsUiAccess.ts` ✓.

#### (b) Unanswered / under-specified questions

1. **Does `roxTopupStatusValues` contain `"confirmed"`?** T9 filters `status='confirmed'` but only `"pending"` (the default) was observed. If the enum is `pending|confirmed|failed` the query is fine; if it's `pending|paid|expired` T9 is wrong. Not verified — confirm against `enums.ts` before T9.
2. **Which ledger `kind` for admin grant?** Tied to correction (1) — spec must pick `"adjustment"` vs a new WS-O enum value. Currently ambiguous and the chosen value blocks WS-E's `adminGrant` contract (§5 interface 3 omits `kind`).
3. **Should `deleteUser` stay a hard delete?** §1.5 flags no audit but T-series never proposes soft-delete; high-blast-radius `db.delete` at `admin.ts:20` survives the redesign. Decide: soft-delete column (WS-O) vs audit-only.
4. **Flag override granularity.** §2.4 table keys on `(user_id, key)` boolean, but `RELAY_URL_OVERRIDE` is a *payload* flag (`{url}`), not boolean (`constants.ts` comment). The boolean override model cannot represent payload flags — T5's `setUserFlag(value: boolean|null)` can't toggle `RELAY_URL_OVERRIDE`. Either exclude payload flags from the admin toggle or extend the table to a `jsonb value`.
5. **Org/member drilldown depth** (§1.5 "no org admin") is listed as a gap but no T-task addresses it; confirm it's out of scope for this wave.

#### (c) Merge-safety / file-ownership overlap check

WS-F's exclusive-ownership list (§4): `apps/admin/**`, `packages/trpc/src/router/admin/{admin.ts,index.ts,admin.test.ts}`, and a **shared** edit to `packages/trpc/src/router/analytics/analytics.ts` (`getRevenueTrend` body only).

- `apps/admin/**` — no sibling claims the admin app. **No overlap.**
- `packages/trpc/src/router/admin/**` — admin-router-exclusive to WS-F. **No overlap.**
- **`packages/trpc/src/router/analytics/analytics.ts` (T9) — POTENTIAL OVERLAP / FLAG.** This is a shared file in `packages/trpc`. If any sibling (e.g. an analytics/economy workstream) also touches `analytics.ts`, two PRs collide on the same file. §4 already proposes the mitigation (extract `getRevenueTrend` into a WS-F-owned helper rather than editing in place). **Recommendation: make the helper-extraction mandatory, not optional**, so WS-F's only line-level change to `analytics.ts` is a single import + call swap, minimizing merge surface with WS-E (economy owns `roxTopups`, which T9 now reads) and WS-O.
- **Schema boundary — CLEAN per the rule** (schema owned by WS-O except `economy.ts`=WS-E): WS-F's §4 correctly defers ALL of `packages/db/src/schema/**` to WS-O and does not write `economy.ts` (WS-E). The `user_feature_flags` + optional `admin_audit` tables are assigned to WS-O ✓. **But:** correction (1) means an admin grant needs a ledger `kind` value living in `enums.ts` (WS-O territory) — if a new `"bonus"`/`"grant"` enum value is chosen, that is a WS-O edit WS-F/WS-E depend on; add it to §5 hard dependencies. The `roxLedgerKindValues` edit must NOT be done by WS-E even though `economy.ts` is WS-E's, because the enum array lives in `enums.ts` (WS-O).
- **WS-E coordination — single-writer rule sound.** §1.4/§2.3 correctly forbid WS-F from writing `roxBalances`/`roxLedger` directly and route all mutation through `economy.adminGrant`. The only current writers are in `user.ts` (`accountOverview` seed) — WS-F adds zero writers. **No overlap**, contract is clean except the missing `kind` field in §5 interface 3.

**Net overlap verdict: one real merge risk — `analytics.ts` (T9) shared edit.** Mitigation already in spec; upgrade it to mandatory. All other ownership boundaries are non-overlapping with WS-A…WS-O.

#### (d) Confidence per major claim

| Claim | Confidence | Basis |
|---|---|---|
| Admin is "half-real" (PostHog real, Users stub, revenue zero-stub) | **High** | All 3 files read end-to-end; `getRevenueTrend` zero-stub verbatim |
| Analytics queries hit real PostHog (not stubs) | **High** | HogQL/funnel/retention bodies + real client at `posthog-client.ts` |
| Event data actually collected | **Medium** | Emit paths exist, but runtime PostHog ingestion not observable from repo; correctness depends on live PostHog |
| No per-user drilldown / `getUser` | **High** | `users/` tree has only `components/UsersTable`; `admin.ts` is 23 lines, 2 procs |
| No flag-override storage; flags 100% PostHog | **High** | schema grep NONE; read path confirmed in `getAgentsUiAccess.ts` |
| No admin topup / economy router; single-writer is `user.ts` | **High** | router grep NONE beyond reads |
| Ledger `kind:'bonus'` exists | **Refuted (High)** | enum is `topup/request_charge/adjustment/seed` only |
| File-ownership non-overlap (except analytics.ts) | **High** | schema deferred to WS-O, economy mutation to WS-E, admin app exclusive |
| `roxTopupStatus` has `"confirmed"` (T9 filter) | **Low / unverified** | not checked; see (b)1 |
| Feature-flag toggle covers all 7 keys as booleans | **Refuted (Medium)** | `RELAY_URL_OVERRIDE` is a payload flag, not boolean |

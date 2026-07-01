# Rox Convergence — Resolved Decisions (D1–D8)

> The product owner resolved the 8 open forks the hardening passes raised across the
> 15 workstream specs. This file is the single, plainly-worded record of each decision:
> **what** was decided, **which workstreams** it touches, and the **concrete change** it
> implies. Every implementation agent MUST read this file first and obey it alongside
> its own `WS-<ID>-spec.md`. Where this file and a spec disagree, **this file wins** —
> the affected specs carry a `### Decision updates` note pointing back here.

Resolved: 2026-06-20. Owner = product owner; technical decisions = lead.

---

## D1 — Web continues automatically on a cloud sandbox when the desktop is OFFLINE (owner)

**Decision.** When a user is on web/mobile and their desktop host is offline, **automatically
provision a cloud sandbox host and continue their work there — no prompt, no manual
confirmation step.** Work continues seamlessly on the sandbox. The only gate is the usual
**balance/credits check** (prepaid Rox economy): if the user cannot afford it, the auto-provision
is refused with a top-up prompt — but there is never a "do you want a sandbox? yes/no" dialog.

**Affects.** WS-B (the continue-on-web path), WS-C (the sandbox auto-provision trigger), WS-E
(balance/credits must be checked before auto-provisioning).

**Concrete change.**
- WS-B: when `host.list(org)` shows the user's `local` desktop host as offline (or absent) and the
  user opens a workspace on web, the cabinet calls the sandbox provision path automatically instead
  of showing an "ask for a host" state. No confirmation UI.
- WS-C: `v2Host.provision({ kind:"sandbox", … })` becomes callable as an automatic fallback (not only
  an explicit "New sandbox" action). The provisioner must be invocable from the offline-continue path.
- Both: respect the prepaid economy — call the WS-E balance check (`canAfford` / `ensureBalance`)
  before provisioning; on insufficient balance, surface a top-up prompt, not a sandbox prompt.

---

## D2 — Delete old Stripe payment data outright; no archive table (owner)

**Decision.** The historical Stripe payment data in production (the `subscriptions` table,
`organizations.stripe_customer_id`, the `stripe` default on payment attribution) is **just deleted.**
No archive table, no export-before-drop, no preservation step.

**Affects.** WS-E (Stripe removal #70), WS-O (owns the schema drops).

**Concrete change.**
- The Stripe removal is a **straight DROP**: drop the `subscriptions` table, drop the
  `organizations.stripe_customer_id` column, drop the `stripe` default on
  `attribution.payment_attributions.provider`. No `*_archive` table is created.
- This **closes the earlier "preserve prod rows / data-loss caution"** open question in WS-E §1.5
  (Q5 of its hardening review): there is nothing to preserve.
- **Still offline-only at plan time.** Migrations are authored with `bunx drizzle-kit generate`
  (offline schema-vs-snapshot diff) ONLY. Agents NEVER run `drizzle-kit migrate`/`push`. Actually
  applying the drop to production is a separate, human-gated deploy step (per AGENTS.md).

---

## D3 — Do BOTH LiveBlocks and LiveKit NOW; move them to P1 (owner)

**Decision.** Realtime collaboration ships **now, in this plan**: **LiveBlocks**
(collaborative editing, shared cursors, presence) **and LiveKit** (voice/calls) — both,
end to end, not deferred. They move from **P2 to P1** in WS-L.

**Affects.** WS-L (collab + RTC), WS-J (the collaborative org/project dashboard they feed).

**Concrete change.**
- WS-L: LiveBlocks (`@rox/collab`) and LiveKit (`@rox/rtc`) are **P1** deliverables. Tasks cover
  both end to end — package + env + client provider + server auth + tRPC mint (`collab.authRoom`,
  `rtc.token`) + the shared `PresenceStack` UI + mounting presence on the dashboard.
- WS-L reuses the **already-existing** experimental-features provider registry + env-key names
  (`LIVEBLOCKS_SECRET_KEY`, `NEXT_PUBLIC_LIVEBLOCKS_PUBLIC_KEY`, `LIVEKIT_API_KEY`,
  `LIVEKIT_API_SECRET`, `NEXT_PUBLIC_LIVEKIT_URL`) — it does NOT invent a parallel flag.
- Routers live in `packages/trpc/src/router/{collab,rtc}/**` (NOT `apps/api`), registered in
  `packages/trpc/src/root.ts` (additive, order after WS-E/WS-J).
- WS-J: the collaborative dashboard (`dashboards`/`dashboard_sections`/`dashboard_entries`) is the
  surface LiveBlocks presence/cursors mount on; durable content stays in the WS-J/WS-O tables,
  LiveBlocks is the ephemeral layer only.

---

## D4 — In-app browser history is a full import → local-7-day → server-upload → purge pipeline, with consent (owner)

**Decision.** The in-app ("branch") browser history feature is **much bigger** than the original
per-branch-history-column spec. New requirement, end to end:
1. **Import** the user's full browsing history/data from their REAL working browser
   (Chrome / Arc / Safari / etc.) into the in-app browser.
2. **Sync + store it locally** for ~7 days.
3. **Every 3–7 days, upload** that data to OUR server via the API.
4. **After upload, purge** it from the user's machine so we don't clutter their local sessions.
5. **Long-term (>7 days) we keep OUR OWN cleaned, PER-WORKSPACE history server-side.**

**CRITICAL:** because we upload a user's browsing data to our servers, this requires an **explicit
consent + privacy/opt-in flow.** No import, no local capture, and no upload happens until the user
opts in. Consent is revocable; revocation stops capture/upload and purges local data.

**Affects.** WS-N (owns the in-app browser + local-db history), WS-O (owns the new server-side
per-workspace history tables + upload tRPC procedure schema), WS-E (none directly, but sandbox/credit
rules unaffected). The cloud upload procedure is authored under `packages/trpc` / `apps/api`.

**Concrete change.**
- This **supersedes** the earlier "nullable `workspaceId` column vs composite `(url, workspaceId)`
  unique" question (WS-N §7a#1 / WS-N residual #7): history is **per-workspace both locally and
  server-side**, so the local table is per-workspace and the server table is per-workspace.
- WS-N fully re-specs the branch-browser section (its WS-N-spec.md §1C/§2C/§3 branch-browser track,
  §4 ownership) to deliver: real-browser import (per-OS/source, Electron main process), local 7-day
  retention, a 3–7-day upload pipeline (new API endpoint + tRPC mutation called via the desktop
  cloud `apiTrpcClient`), local purge after upload, and the mandatory consent/opt-in + privacy flow.
- WS-N **proposes** the server-side per-workspace history tables and **hands them to WS-O** to author
  in `packages/db/src/schema/**` and generate (WS-N never edits `packages/db` schema).
- The aerials and network-filter-flag sections of WS-N are unchanged.

Grounding (live code, read-only):
- Local store: `browser_history` table is global today (`packages/local-db/src/schema/schema.ts:448-466`),
  PK `id`, `url` `.notNull().unique()` (line 454) — **no workspace/user column.** local-db is its own
  Drizzle/SQLite toolchain (`packages/local-db/drizzle.config.ts`, generate via
  `packages/local-db/package.json:22`), applied at runtime in
  `apps/desktop/src/main/lib/local-db/index.ts:110`.
- History router: `apps/desktop/src/lib/trpc/routers/browser-history/index.ts` — `getAll` (limit 500,
  :9-16), `search` (:18-34), `upsert` (`onConflictDoUpdate` on `url`, :36-64), `clear` (:66-68).
- Webview: partition `persist:rox` (v1 `usePersistentWebview.ts:209`, v2 `browserRuntimeRegistry.ts:192`),
  upsert on `did-stop-loading` (v1 ~:263-269 / v2 ~:254-260) and on favicon update.
- OS-browser path discovery already exists for extensions, reusable for history import:
  `getChromiumUserDataDirs()` covers Chrome/Arc/Brave (`apps/desktop/src/main/lib/extensions/index.ts:41-79`);
  Safari history is `~/Library/Safari/History.db` behind Full Disk Access
  (`apps/desktop/src/lib/trpc/routers/permissions/full-disk-access.ts:5-10`). **No history-import code exists today.**
- Cloud upload pattern: desktop calls OUR API via `apiTrpcClient.<router>.<proc>.mutate(...)` with a
  Bearer token (`apps/desktop/src/renderer/lib/api-trpc-client.ts:12-25`,
  `apps/desktop/src/renderer/lib/auth-client.ts`).

---

## D5 — WS-B owns the shared HostClient transport; WS-G (mobile) only consumes it (technical)

**Decision.** The shared `HostClient` abstraction **including its transport** is owned by **WS-B**
and lives in `packages/shared/src/host-client/**`. **WS-G (mobile) only CONSUMES it** — mobile does
not author any HostClient transport.

**Affects.** WS-B (owns the abstraction + transport), WS-G (consumer only).

**Concrete change.**
- Resolves the "RN/mobile HostClient transport authorship is unassigned" flag (MASTER-PLAN residual #1,
  WS-B §7b "Mobile transport unspecified"). The RelayTransport (and any RN-compatible transport
  adapter the mobile bundle needs) is authored under `packages/shared/src/host-client/**` by **WS-B**.
- WS-G imports and uses `HostClient` from `@rox/shared`; it adds no transport code and keeps
  `packages/shared`/`packages/trpc`/`apps/web` read-only as its spec already states.

---

## D6 — Web reads live data THROUGH the attached host via the relay transport; org/account data stays on Electric (technical)

**Decision.** The web app's live read path is resolved: web reads **live host data (terminals,
git, filesystem, chat, the host's local-db/agent state) THROUGH the attached host via the relay
transport** — the host is the single source of truth for host-scoped data. Web **also keeps its
existing org-level ElectricSQL subscriptions** (via `apps/electric-proxy`) for org/account-scoped
durable data (tasks, members, organizations, etc.).

**Affects.** WS-B (documents this as the web read-path resolution), WS-C (electric-proxy continues
to gate org-level shapes), WS-D (host-side agent-state is reached over the same relay/host path).

**Concrete change.**
- Resolves the "web local-db / Electric powers mechanism under-specified" flag (MASTER-PLAN residual #2,
  WS-B §7b). There are **two** read planes, not one:
  - **Host-scoped live data** → relay transport → the attached host (`HostClient`, single source of
    truth from the host). This includes the host's SQLite-backed views and cross-host agent-state.
  - **Org/account durable data** → existing Electric shape subscriptions through `electric-proxy`
    (unchanged).
- Web does NOT try to sync the host's `better-sqlite3` DB or the host Turso replica via Electric;
  it reads them through host procedures over the relay.

---

## D7 — bootstrap-token = short-lived signed JWT from apps/api (reuse better-auth JWKS/jwt), scoped to {hostId, userId, exp} (technical)

**Decision.** The C5 bootstrap-token (presented by a provisioned desktop/host to the relay so it
can dial in) is a **short-lived signed JWT minted by `apps/api`, reusing the existing better-auth
JWKS / jwt plugin**, scoped to `{ hostId, userId, exp }`. The desktop/host presents it to the relay.
C5 is now **designed, not open.**

**Affects.** WS-C (C5 — mints/consumes the token), WS-B (coordinates the host-service auth provider).

**Concrete change.**
- Resolves the "C5 bootstrap-token mechanism is named but undesigned" flag (MASTER-PLAN residual #3,
  WS-C §7b). No new token infrastructure: reuse better-auth's JWKS endpoint (`/api/auth/jwks`) and
  jwt plugin that the relay already verifies via `verifyRoxJwt` / shared `jwt-verify.ts`.
- Token claims: `hostId` (the provisioned host's routing key), `userId` (the provisioning user),
  `exp` (short TTL — minutes, enough to boot + dial). The relay verifies it on `/tunnel` registration
  exactly like any other Rox JWT; no separate verifier.
- WS-C C5 is marked **designed**; WS-C ships the mint call inside `v2-host.ts:provision` env injection
  and the relay-side verification path.

---

## D8 — Serialize migration generation (WS-O first, then WS-E); add the missing Stripe-drop task to WS-O; investigate rox/rox_v2 agent-source kinds in WS-J (technical)

**Decision (three linked items).**

1. **Serial migration generation.** WS-O and WS-E both write into `packages/db/drizzle/`.
   `drizzle-kit generate` is journal-order-dependent, so the two runs are **serialized: WS-O generates
   first (org tables), then WS-E rebases and regenerates (Stripe-removal drop).** Never concurrent.

2. **Add the Stripe-drop schema task to WS-O's own task list.** The hardening pass found WS-O owns the
   Stripe-drop files (`schema.ts` subscriptions, `auth.ts` stripe_customer_id, `attribution.ts`
   provider default, `relations.ts`) but never enumerated the work in its §3 tasks. **Explicitly add it**
   as a WS-O task, fed by WS-E's consumer-removal diff and sequenced after it.

3. **Investigate the in-memory `rox`/`rox_v2` agent-source kinds (WS-J).** `IN_MEMORY_KINDS = {rox, rox_v2}`
   are not valid `agent_source_kind` enum values. During implementation WS-J must determine whether they
   are referenced on a live path: **if referenced, add the enum values in WS-O's `enums.ts`; if not,
   remove the dead code.** Captured as a WS-J task.

**Affects.** WS-O (serial-generate ordering + the explicit Stripe-drop task + possible enum add),
WS-E (rebases/regenerates after WS-O), WS-J (the rox/rox_v2 investigation task).

**Concrete change.**
- Resolves MASTER-PLAN residuals #4 (serial co-generation), #6 (WS-E Stripe-drop absent from WS-O's
  task list), and #8 (rox/rox_v2 enum kinds).
- Ordering constraint (encoded in the merge protocol + `phase2-implement.js` `seq`): **WS-O `generate`
  → WS-E consumer removal → WS-E `generate` (Stripe drop).** WS-E's `seq` already includes WS-O.
- WS-O gains an explicit "Stripe-drop schema" task: drop `subscriptions` table + `organizations.stripe_customer_id`
  column + `attribution.payment_attributions.provider` stripe default + the `relations.ts` references,
  then `bunx drizzle-kit generate --name="remove_stripe_subscriptions"` (offline; never migrate/push).
  Per D2 this is a straight drop with no archive.
- WS-J gains an explicit task to investigate `rox`/`rox_v2` and either add the enum values (handed to
  WS-O `enums.ts`) or delete the dead code.

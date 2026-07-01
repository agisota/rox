## WS-O: Org data model expansion + integrations cleanup — Spec

> Read-only discovery complete. This workstream is the **single owner of `packages/db/src/schema/**` (except `economy.ts`) + `packages/db/drizzle` migration generation + integration tRPC router cleanup**. All other workstreams (WS-F flags, WS-J libraries/dashboards) hand their table designs here. **WS-O only ever runs `bunx drizzle-kit generate` (OFFLINE schema-vs-snapshot diff). It NEVER runs `drizzle-kit migrate` or `drizzle-kit push` — applying migrations is a deploy step gated on owner confirmation per AGENTS.md.**

### 1. Findings

#### 1.1 Integrations domain audit (table-backed vs handler-backed vs stub)

**The integration data model is a single shared spine, not per-provider tables.** Every provider stores its connection in one table `integration_connections` (`packages/db/src/schema/schema.ts:194-256`) keyed by `provider` (pgEnum `integration_provider`, `enums.ts:26-38`: `linear, github, slack, telegram, discord, notion, obsidian, fibery, lark`). Inbound webhook dedup is `integration_inbound_events` (`schema.ts:266-300`). Per-provider config is typed jsonb (`IntegrationConfig`, `schema/types.ts`). **So there are NO orphan per-provider tables to drop — provider "removal" = dropping a value from the `integration_provider` enum + deleting that vertical's router/handlers, not dropping a table.**

The real maturity question is **handler depth behind each enum value**. Verified against `packages/trpc/src/router/integration/**` and `apps/api/src/app/api/integrations/**`:

| Provider | tRPC router | API handler | Verdict | Recommendation |
|---|---|---|---|---|
| **linear** | full (`linear/linear.ts` 165L, `refresh.ts` 203L, tests 324L) | webhook + callback + 3 jobs (initial-sync/sync-task/refresh-tokens) | **Real, production** | Keep |
| **github** | full (`github/github.ts` 244L, tests 420L) + dedicated `github.ts` schema | app-install backed | **Real, production** | Keep |
| **slack** | full (`slack/slack.ts` 57L + `utils.ts`) | events/interactions/link/callback/connect + process-* jobs + `run-agent` | **Real, production** | Keep |
| **telegram** | real (`telegram/telegram.ts` 132L) | webhook (`route.ts` 133L) + process-message job (69L) + `telegram-client` | **Real** | Keep |
| **notion** | **stub** (`notion/notion.ts` 6L = bare `createProviderConnectionRouter("notion")`) | sync job exists (`notion/jobs/sync/route.ts` 339L) + `notion-client.ts` | **Connect-only UI + a real sync job, no connect→sync trigger wiring in router** | Park — keep enum + job, leave router as connect baseline; do not expand this wave |
| **fibery** | **stub** (`fibery/fibery.ts` 6L) | sync job exists (`fibery/jobs/sync/route.ts` 204L) | Same shape as notion | Park — keep enum + job |
| **discord** | thin (`discord/discord.ts` 27L = baseline + `getInteractionsEndpoint`) | interactions route (113L) verifies Ed25519 sig + 200 ACK, but **agent run is `TODO(discord PR-2)`** (`discord/interactions/route.ts:105`) | **Half-wired: signature verified, no agent dispatch** | Park (keep enum); do not remove — PR-2 is planned |
| **lark** | thin (`lark/lark.ts` 26L = baseline + `getEventEndpoint`) | events route (132L) verifies sig + 200 ACK, but **agent run + AES event mode is `TODO(lark PR-2)`** (`lark/events/route.ts:128`, `lark/parse-event.ts:11`) | **Half-wired** | Park (keep enum) |
| **obsidian** | real-ish (`obsidian/obsidian.ts` 115L + `parse-note.ts` 176L + tests) | no API webhook (obsidian is a vault-import/parse vertical, not a server callback) | **Real parsing, no inbound webhook by design** | Keep |

**Net:** there is **no integration table with nothing behind it** — the audit's premise ("which tables have no real integration") resolves to: one shared table, fully used. The genuine gaps are *handler completeness* (discord/lark TODO PR-2) and *router thinness* (notion/fibery connect-only). **Recommendation = remove nothing; the only WS-O integration-router cleanup in scope is (a) consolidating duplicated zod scope objects into `integration/shared/`, (b) NOT touching enum values (removing one is a destructive migration on a live enum + breaks `integration_connections.provider` rows). Keep all 9 providers; mark discord/lark/notion/fibery as "parked" in code comments pointing at their PR-2/sync-trigger follow-ups.** Provider removal is explicitly out of scope and would need owner sign-off because it is a non-reversible enum mutation against production data.

#### 1.2 Org data model — current state (what exists, what's missing)

- **Org/team spine is solid**: `organizations` (`auth.ts:101`), `members` (`:125`, has `role`), `teams` (`:147`), `team_members` (`:170`, with **denormalized `organization_id` populated by a BEFORE INSERT trigger** from migration 0049 — `auth.ts:180-186`, the canonical Electric shape-filter pattern), `invitations` (`:200`). `sessions.activeTeamId` exists (`:56`).
- **Skills exist but are FLAT**: `skills` / `skill_versions` / `skill_bindings` (`workflow.ts:247/307/382`). A skill is org+optional-project scoped with `visibility`, `currentVersionId`, and exposure surfaces via `skill_bindings`. **There is NO library grouping and NO library→team assignment** (grep `skillLibrar|teamSkill` in `schema/` = empty). Confirmed independently in WS-J §1.6.
- **No feature-flag override storage**: grep `feature_flags|featureFlags|user_flags` across `packages/db/src/schema/` = **nothing** (confirmed in WS-F §1.3). Flags today are 100% PostHog-evaluated; toggling per-user means editing PostHog. `FEATURE_FLAGS` keys live in `packages/shared/src/constants.ts:105`.
- **No collaborative dashboard tables**: grep `dashboard` in `schema/` = empty. Closest existing "shared artifacts" surface is `knowledge_documents` / `knowledge_links` (`knowledge.ts:64/117`) — the dashboard MUST reuse these as its MDX substrate, not duplicate them (WS-J §1.6 design rule).
- **Conventions to match** (verified): `app`-schema tables use `pgTable` + `pgEnum` (`schema.ts:43-49`); `auth`-schema tables use `authSchema.table` (`auth.ts:16`). New org-collaboration tables = `pgTable` (app schema) referencing `organizations`/`users`/`teams` from `./auth`. `drizzle.config.ts` has `casing: "snake_case"`, so camelCase TS keys auto-map to snake_case columns. timestamptz columns use `timestamp(name,{withTimezone:true})` (knowledge.ts/workflow.ts pattern). Electric shape-filtering requires a **real `organization_id` column** on every join/leaf table (denormalize, like `team_members`).

#### 1.3 Migration tooling (honest scope statement)

`packages/db/package.json` exposes only `push`/`migrate`/`studio` scripts (`:42-44`) — **there is no `generate` script**, so WS-O runs `bunx drizzle-kit generate --name="..."` directly (offline; diffs `src/schema/index.ts` against `drizzle/meta` snapshot, emits SQL into `drizzle/`). Current head = `0049_add_teams.sql` (`drizzle/`, 79 SQL files counting splits). **WS-O authors schema TS only + runs `generate`. Generated SQL + `meta/_journal.json` + snapshots are committed but NEVER hand-edited (AGENTS.md "NEVER manually edit files in `packages/db/drizzle/`"). Applying = owner-run deploy step.**

### 2. Target design

#### 2.1 New enum (enums.ts) + new schema files

```
enums.ts (append-only):
  dashboardSectionKindValues = [config, recommendation, note, priority, artifact, product, reference, log]
  + dashboardSectionKindEnum / DashboardSectionKind   (WS-J §2.2)

NEW schema file: packages/db/src/schema/org-library.ts   (skill libraries)
NEW schema file: packages/db/src/schema/dashboard.ts     (collaborative board)
NEW schema file: packages/db/src/schema/feature-flags.ts (per-user flag overrides)
index.ts: add 3 `export *` lines (alpha order: dashboard, feature-flags, org-library)
```

(New files chosen over appending to `schema.ts`/`workflow.ts` to keep merge-isolation clean and follow the one-domain-per-file convention of `knowledge.ts`.)

#### 2.2 ERD — skill libraries (from WS-J §2.2)

```
organizations 1───* skill_libraries
   skill_libraries: id, org_id(cascade,idx), v2_project_id?(set-null), slug, name, description?, created_by_user_id?(set-null), ts
   UNIQUE(org_id, slug)

skill_libraries 1───* skill_library_items        (membership; a skill can sit in many libs)
   item: id, library_id(cascade), skill_id -> skills.id(cascade), organization_id(denorm,cascade,idx), position int, ts
   UNIQUE(library_id, skill_id)

skill_libraries 1───* skill_library_team_assignments
   assign: id, library_id(cascade), team_id -> teams.id(cascade), organization_id(denorm,cascade,idx), ts
   UNIQUE(library_id, team_id)
```

#### 2.3 ERD — collaborative dashboard (from WS-J §2.2, reuses knowledge_documents)

```
organizations 1───* dashboards
   dashboards: id, org_id(cascade,idx), v2_project_id?(set-null), slug, name, created_by_user_id?(set-null), ts
   UNIQUE(org_id, slug)

dashboards 1───* dashboard_sections
   section: id, dashboard_id(cascade), organization_id(denorm,cascade,idx), kind dashboard_section_kind, title?, position int, ts

dashboard_sections 1───* dashboard_entries
   entry: id, section_id(cascade), dashboard_id(denorm,cascade), organization_id(denorm,cascade,idx),
          body jsonb, knowledge_document_id?(-> knowledge_documents, set-null),   ← REUSE notebook MDX
          status text?, priority text?, created_by_user_id?(set-null), position int, ts
```

#### 2.4 ERD — per-user feature flags (from WS-F §2.4)

```
user_feature_flags
   id uuid pk, user_id -> users.id(cascade,idx), key text (matches FEATURE_FLAGS values),
   value boolean (force-on/force-off; absence-of-row = inherit→PostHog),
   updated_by -> users.id(set-null), updated_at timestamptz
   UNIQUE(user_id, key)
```

WS-O ALSO ships the read/write helpers WS-F imports (so the helper signatures are owned next to the table):

```
packages/db/src/utils.ts (or new packages/db/src/feature-flags.ts):
  resolveUserFlag(userId, key): Promise<boolean | null>     // null = inherit
  upsertUserFlagOverride({userId, key, value, updatedBy})    // value=null => DELETE row
```

(WS-F §2.2 resolution: DB-override-first, PostHog fallback. WS-O owns only the DB half + the upsert/delete; PostHog fallback stays in WS-F's read layer.)

#### 2.5 Sequence — flag resolution (ownership boundary)

```
app surface needs flag X for user U
        │
   WS-F read layer ── resolveUserFlag(U,X) ──▶ [WS-O] SELECT value FROM user_feature_flags WHERE user_id=U AND key=X
        │                                            └─ row? return boolean : return null
        ▼
   null ──▶ WS-F: posthog.getFeatureFlag(X)   (PostHog fallback — NOT WS-O)
```

### 3. Phase-2 implementation tasks (TDD, bite-sized)

> All tasks are schema-TS authoring + `drizzle-kit generate`. Tests are **schema-shape / zod tests** (DB-free) plus a `generate` dry-run that must produce SQL with zero diff drift. No `migrate`/`push`.

**T1 — Append `dashboard_section_kind` enum.** Edit `packages/db/src/schema/enums.ts`: add `dashboardSectionKindValues = [config, recommendation, note, priority, artifact, product, reference, log] as const`, `dashboardSectionKindEnum`, type export, placed near the knowledge-layer enums (append-only, never reorder). Test: add to existing enum unit test (or a new `enums.test.ts`) asserting the 8 values and stable order.

**T2 — `org-library.ts`** (skill libraries). Create `packages/db/src/schema/org-library.ts` with `skillLibraries`, `skillLibraryItems`, `skillLibraryTeamAssignments` per §2.2. Import `organizations`, `users`, `teams` from `./auth`; `skills` from `./workflow`; `v2Projects` from `./schema`. Every table: org cascade FK + `organization_id` index; denormalize `organization_id` onto items + assignments (Electric); the two `UNIQUE`s. Export `Insert*`/`Select*` types. Test: `org-library.test.ts` — assert `$inferSelect` keys, FK columns present, unique indexes named.

**T3 — `dashboard.ts`** (collaborative board). Create `packages/db/src/schema/dashboard.ts` with `dashboards`, `dashboardSections`, `dashboardEntries` per §2.3. `dashboardSections.kind` uses the T1 enum; `dashboardEntries.knowledgeDocumentId` → `knowledgeDocuments` (`./knowledge`) `onDelete:"set null"`. Denormalize `organization_id` (+ `dashboard_id` on entries). Export types. Test: `dashboard.test.ts` — keys, the knowledge FK is nullable set-null, section-kind column wired to enum.

**T4 — `feature-flags.ts`** (per-user overrides). Create `packages/db/src/schema/feature-flags.ts` with `userFeatureFlags` per §2.4 (`authSchema.table` since it joins `users` in the `auth` schema — match `auth.ts` style; or `pgTable` referencing `users` — pick `pgTable` app-schema to keep flag-admin data out of the auth domain, FK to `users` is cross-schema-legal). `UNIQUE(user_id, key)` + `user_id` index. Export types. Test: `feature-flags.test.ts` — unique on (user_id,key), `value` boolean nullable false, `updated_by` set-null.

**T5 — Flag helpers.** Add `resolveUserFlag` + `upsertUserFlagOverride` to `packages/db/src/feature-flags.ts` (new) and re-export from `packages/db/src/utils.ts` (the file WS-F imports from — verified `verifyOrgMembership` already pulls `findOrgMembership` from `@rox/db/utils`). `upsertUserFlagOverride` with `value:null` ⇒ `DELETE`; else `INSERT ... ON CONFLICT (user_id,key) DO UPDATE`. Test: helper unit tests with an injected `db` mock (mirror existing `packages/db` util test style) — assert delete-on-null, upsert-on-boolean.

**T6 — Barrel + generate.** Edit `packages/db/src/schema/index.ts`: add `export * from "./dashboard"`, `"./feature-flags"`, `"./org-library"`. Run `bunx drizzle-kit generate --name="org_libraries_dashboards_feature_flags"` from `packages/db/`. Commit generated SQL + `meta/_journal.json` + snapshot UNEDITED. Test: re-run `generate` ⇒ must report "No schema changes" (idempotent proof). **Do NOT run `migrate`/`push`.**

**T7 — Integration router cleanup (non-destructive).** In `packages/trpc/src/router/integration/`: (a) add parked-status doc-comments to `notion/notion.ts`, `fibery/fibery.ts`, `discord/discord.ts`, `lark/lark.ts` pointing at their sync-trigger / PR-2 follow-ups (from §1.1); (b) if the `scope` zod object is duplicated across verticals, lift one shared `scope`/`connectInput` into `integration/shared/schema.ts` and import it (no behavior change). **No enum-value removal, no handler edits.** Test: existing `provider-router.test.ts` + per-vertical tests still green; add a router-shape test asserting all 9 providers still mount in `integrationRouter` (`integration.ts:18-46`).

**T8 — Stripe-drop schema (NEW, per D8 — fed by WS-E, sequenced after WS-E consumer removal).** The
hardening pass found these drops are WS-O-owned files but were missing from WS-O's task list. Per **D2** this
is a **straight drop, no archive**. After WS-E's consumer-removal PR (step A) merges, edit the WS-O-owned
schema files: drop the `subscriptions` table (`schema.ts:290-323`) + its relations (`relations.ts:40,109,187`),
drop `organizations.stripeCustomerId` (`auth.ts:110`), and drop the `"stripe"` default on
`attribution.paymentAttributions.provider` (`attribution.ts:90`; make it required or default `"dvnet"`).
Then run `bunx drizzle-kit generate --name="remove_stripe_subscriptions"` from `packages/db/` —
**offline only; NEVER migrate/push** (applying the drop is a human-gated deploy). **Serial-generate
ordering (D8):** WS-O's org-tables generate (T6) runs FIRST; THIS Stripe-drop generate runs as a SECOND,
separate WS-O generate AFTER WS-E's consumer edits; WS-E then rebases its own generate after this. Test: the
schema no longer exports `subscriptions`; `generate` re-run reports no further diff. (If WS-F needs a `bonus`
ledger enum value, reuse `adjustment` — no enum add — unless the owner asks otherwise; per Q2.)

**T9 — Server-side per-workspace browser history tables (NEW, per D4 — proposed by WS-N).** Author the
server tables WS-N handed off for the D4 browser-data pipeline (`DECISIONS.md` D4, WS-N §2D): a new schema
file `packages/db/src/schema/browser-history.ts` (or fold into an existing app-schema file) with
`workspaceBrowserHistory` (cleaned, long-term, per-workspace: `organization_id` denorm + idx, `v2_workspace_id`
cascade + idx, `user_id` cascade, `url`, `title`, `favicon_url`, `visited_at`, `visit_count`, `first_seen_at`,
`last_seen_at`; `UNIQUE(v2_workspace_id, user_id, url)`) and `browserDataConsents` (`organization_id`,
`user_id`, `accepted` bool, `accepted_at`, `revoked_at`; server record of consent). Denormalize
`organization_id` for Electric shape-filtering (the `team_members` pattern). Add the barrel export; this
table set rides the SAME serialized generate (after T6/T8, never concurrent). The cloud
`browserHistory.upload` tRPC mutation that writes these tables is owned by the trpc/api owner, NOT WS-O —
WS-O ships only the tables + types. Test: `$inferSelect` keys, FK targets, the composite unique, denorm
`organization_id` index.

### 4. File ownership (WS-O owns/modifies in Phase 2 — merge isolation)

**Exclusive ownership (no other workstream may touch):**
- `packages/db/src/schema/**` — ALL files **EXCEPT `packages/db/src/schema/economy.ts`** (WS-E owns economy). Specifically created/modified: `enums.ts` (append T1), NEW `org-library.ts`, NEW `dashboard.ts`, NEW `feature-flags.ts`, NEW `browser-history.ts` (T9, per D4), the Stripe-drop edits to `schema.ts`/`auth.ts`/`attribution.ts`/`relations.ts` (T8, per D8 — fed by WS-E), `index.ts` (added exports).
- `packages/db/drizzle/**` — the generated migration set(s) from T6 + T8 + T9 (`bunx drizzle-kit generate`); generated, never hand-edited. **Serialized (D8):** T6 org-tables generate FIRST, then T8 Stripe-drop generate, then WS-E rebases its own generate. T9's browser-history tables ride the same serial chain (never concurrent with WS-E).
- `packages/db/src/feature-flags.ts` (NEW) + the flag-helper exports appended to `packages/db/src/utils.ts`.
- `packages/trpc/src/router/integration/**` — cleanup only (T7): doc-comments + optional shared `scope` extraction. NEW `integration/shared/schema.ts` if extracted.

**Explicitly NOT owned (defer / hand off):**
- `packages/db/src/schema/economy.ts` → **WS-E**.
- `packages/shared/src/constants.ts` `FEATURE_FLAGS` keys → owner/product.
- `packages/trpc/src/router/skill-library/**`, `dashboard/**`, `mcp/**` (consumers of WS-O tables) → **WS-J**.
- `apps/admin/**` admin UI + `admin.*` read procedures → **WS-F**.
- `packages/trpc/src/root.ts` (additive router registration) → touched by WS-J/WS-F, **not** WS-O.

### 5. Dependencies + wave

- **WS-O is a P0 foundation workstream — it depends on NOBODY and BLOCKS two consumers.**
- **Blocks WS-J** (T2–T5 of WS-J need `skill_libraries*`, `dashboards*` tables + `dashboard_section_kind` enum). WS-J authored the table proposal (its §2.2) and handed it here; WS-O implements + generates.
- **Blocks WS-F** (its T5/T10 need `user_feature_flags` + `resolveUserFlag`/`upsertUserFlagOverride` helpers).
- **Coordinates with WS-E** on schema-file boundary: WS-O owns all of `schema/**` except `economy.ts`; the only possible collision is `index.ts` ordering — WS-O appends its 3 exports; WS-E (if it adds files) appends `economy`-adjacent exports. Resolve by alpha-ordered, append-only edits to `index.ts` (low collision risk; if both touch it, trivial merge).
- **Coordinates with WS-J/WS-F on `root.ts`**: WS-O does NOT register routers; consumers do. No shared-file collision from WS-O.
- **Suggested wave: P0.** Schema + generate land first so WS-J (P1 routers) and WS-F (P1 flag toggle) unblock. Sequence: **WS-O (P0) → WS-J routers + WS-F admin flag toggle (P1) → MCP tools / audit polish (P2).**

### 6. Target PR

- **Branch:** `ws-o/org-schema-libraries-dashboards-flags`
- **PR title:** `feat(db): org skill libraries, collaborative dashboards, per-user feature-flag overrides + integration router cleanup`

### Decision updates (resolved forks — see `DECISIONS.md`)

- **D2 (owner) — Stripe drop has no archive.** The T8 Stripe-drop is a straight DROP (no `*_archive` table,
  no preservation). Closes the §7b Q1 gap that the Stripe-removal work was WS-O-owned but unplanned —
  it is now an explicit task (T8).
- **D8 (technical) — serial generate + explicit Stripe-drop task.** WS-O and WS-E both write
  `packages/db/drizzle/`; `drizzle-kit generate` is journal-order-dependent, so the runs are **serialized:
  WS-O generates first (T6 org tables), then the T8 Stripe-drop generate, then WS-E rebases and regenerates.**
  T8 is now explicitly in WS-O's task list (resolves residuals #4 and #6, and §7b Q1/Q3). The 3 util files
  (`membership.ts`, `integration/utils.ts`, `active-org.ts`) are **WS-E's** consumer edits (sequenced BEFORE
  T8); WS-O owns only the schema-file drops. Per §7b Q2, no `bonus` ledger enum value is added — WS-F reuses
  `adjustment` — unless the owner asks otherwise.
- **D8 (technical) — rox/rox_v2 enum coordination.** WS-J will investigate the in-memory `rox`/`rox_v2`
  agent-source kinds during implementation; **if** they are on a live path, WS-J hands the enum-value add to
  WS-O's `enums.ts` (append-only `agent_source_kind`); if not, WS-J deletes the dead code and WS-O does
  nothing. WS-O only acts on a confirmed request from WS-J.
- **D4 (owner) — server-side per-workspace browser history.** WS-O authors the `workspace_browser_history` +
  `browser_data_consents` tables WS-N proposed for the D4 browser-data pipeline (now T9). WS-O ships the
  tables + types only; the `browserHistory.upload` tRPC mutation is the trpc/api owner's.

### 7. Hardening review

Read-only verification pass against live code (HEAD on `t/marketing-landing-publish-20260619`). Each factual claim spot-checked; merge-ownership cross-checked against all sibling specs WS-A…WS-N.

#### (a) Factual corrections (file:line)

1. **Migration head is WRONG.** §1.3 says *"Current head = `0049_add_teams.sql`"*. Actual head = `packages/db/drizzle/0077_superapp_graph_runtime.sql` (latest by number; `0049_add_teams.sql` exists but is far from head). The teams **trigger** does live in 0049 (the §1.2 trigger claim is correct), but 0049 is not the migration head. The *"79 SQL files"* count is correct (verified `ls drizzle/*.sql | wc -l` = 79). **Impact:** cosmetic for the design, but the `--name` collision risk and "current head" baseline are stated wrong; the generated file will be `0078_*`, not `0050_*`.

2. **pgEnum vs zod-enum conflation.** §1.1 (line 9) says the provider column is *"pgEnum `integration_provider`, `enums.ts:26-38`"*. Two distinct objects exist: the **DB column** uses the real `pgEnum` defined at `packages/db/src/schema/schema.ts:45` (`integrationProvider = pgEnum("integration_provider", …)`, used at `schema.ts:210` and `:270`). The reference at `enums.ts:26-37` is a **parallel zod `z.enum`** (`integrationProviderValues`/`integrationProviderEnum`, NOT a pgEnum). The 9 provider values match in both. **Impact on §1.1 removal-cost argument:** correct conclusion (removing a value is a destructive live-enum migration) but the cited location of "the enum" is the wrong file — the DB enum to mutate is in `schema.ts:45`, and there is a *second* zod copy in `enums.ts` that would also need editing. Any future removal touches both.

3. **`integration_connections` line range.** §1.1 cites `schema.ts:194-256`; actual table body is `schema.ts:194-252` (types at 254-257). `integration_inbound_events` cited `266-300`; actual `262-287`. Minor drift, claim substance correct.

4. **`IntegrationConfig` location — CORRECT.** §1.1 says `schema/types.ts`; verified `packages/db/src/schema/types.ts:71`. ✓

5. **Router line counts — ALL EXACT.** Verified verbatim: linear 165, github 244, slack 57, telegram 132, notion 6, fibery 6, discord 27, lark 26, obsidian 115. ✓ The notion/fibery 6-line stubs, discord/lark thin baselines all confirmed.

6. **TODO markers — ALL CORRECT verbatim.** `discord/interactions/route.ts:105` = `TODO(discord PR-2): enqueue job -> runDiscordAgent…`. `lark/events/route.ts:128` = `TODO(lark PR-2): enqueue job -> runLarkAgent; AES-encrypted event mode.`; AES out-of-scope note at `lark/parse-event.ts:11`. ✓ (line 105/128 match the spec exactly).

7. **`integration/shared/` already exists.** §4/T7 proposes a NEW `integration/shared/schema.ts`. The dir already holds `provider-router.ts` + `provider-router.test.ts` (no `schema.ts`). The §1.1/T7 reference to `provider-router.test.ts` is valid (file exists); the new `schema.ts` filename is free. Note the canonical baseline factory is `createProviderConnectionRouter` from `shared/provider-router.ts`, not a path the spec names — minor.

8. **auth.ts org-spine lines — ALL CORRECT.** organizations:101, members:125, teams:147, team_members:170, invitations:200, sessions.activeTeamId:56, team_members denormalized org_id + BEFORE-INSERT-trigger comment at 180-186 citing migration 0049. ✓

9. **skills/knowledge anchors — CORRECT.** `skills` workflow.ts:247, `skill_versions`:307, `skill_bindings`:382; `knowledge_documents` knowledge.ts:64, `knowledge_links`:117. ✓

10. **Negative-existence claims — CONFIRMED.** `grep -rn 'skillLibrar|teamSkill|feature_flags|featureFlags|user_flags|dashboard' packages/db/src/schema/` returns nothing. So library/flag/dashboard tables genuinely do not exist. ✓

11. **package.json scripts — CORRECT.** `push`/`migrate`/`studio` exist (`:42-44`), **no `generate` script** — so `bunx drizzle-kit generate` direct-invocation is the right call. ✓ (drizzle-kit 0.31.8, drizzle-orm 0.45.2.)

12. **index.ts is pure `export *` alpha-ordered.** Verified. The T6 alpha-insert plan holds: `dashboard` slots after `contact`, `feature-flags`(or `feature_flags`) after `entity`/before `github`, `org-library` after `memory`/before `pipeline`. **Caveat:** file basenames with hyphens (`feature-flags`) sort differently from the camelCase used elsewhere; pick a basename whose alpha position the author actually verifies (hyphen `-` sorts before letters in ASCII), or the "alpha order" claim self-violates.

#### (b) Questions not fully answered

- **Q1 (biggest).** §4 claims WS-O is *"single owner of all `schema/**` except economy.ts"* and lists only the NEW tables + enum append as its edits. But **WS-E §4/§5 explicitly hands WS-O the Stripe-removal edits** to `schema.ts` (`subscriptions`), `auth.ts` (`stripeCustomerId`), `attribution.ts`, `relations.ts` (WS-E-spec.md:215, :255-258). WS-O's task list (T1–T7) does **not** include any Stripe-drop work. So: does WS-O accept and schedule the Stripe-removal schema diffs WS-E is blocking on, or is that a separate task? As written the work is owned by WS-O but unplanned in WS-O — a silent gap.
- **Q2.** WS-F §6 (item 241) needs an admin-grant ledger kind; `roxLedgerKindValues` (`enums.ts:403-408`) is `["topup","request_charge","adjustment","seed"]` — no `bonus`. Adding a value is WS-O enum scope. WS-F's own fallback is to reuse `adjustment` (no schema change). WS-O spec is silent. Confirm: no new enum value needed (use `adjustment`), or WS-O adds `bonus`?
- **Q3.** WS-E §4 also flags `packages/db/src/utils/membership.ts`, `integration/utils.ts`, `utils/active-org.ts` as "confirm with WS-O whether table-drops vs consumer edits". WS-O §4 owns `utils.ts` (flag helpers) but says nothing about these utils or about owning the `subscriptions` *table drop*. Boundary on these 3 util files is unresolved between WS-E and WS-O.
- **Q4.** §2.4 `user_feature_flags` table: spec leaves `pgTable` (app schema) vs `authSchema.table` open in T4 ("pick `pgTable`"). The denormalized-`organization_id`-for-Electric rule (§1.2) is NOT applied to this table (it's user-scoped, not org-scoped) — is per-user flag data meant to sync via Electric at all? If yes it needs an org column; if no, state it's API-only. Unstated.
- **Q5.** §2.3 dashboard `body jsonb` + optional `knowledge_document_id`: when both are present, which wins / what's the precedence? Not specified.

#### (c) Merge-safety — file-ownership overlap check

Cross-checked WS-O's §4 ownership (`schema/**` except `economy.ts`; `drizzle/**` generate; `packages/db/src/feature-flags.ts` + `utils.ts` flag helpers; `router/integration/**` cleanup) against WS-A…WS-N.

| Sibling | Touches WS-O-owned path? | Verdict |
|---|---|---|
| WS-A | No schema/integration writes (A:229 "touches no schema files") | **No overlap** |
| WS-B, WS-C, WS-G | Only **read** `schema.ts`/`enums.ts` (host catalog, statuses) | **No overlap** |
| WS-D | Migrations under `packages/agent-state/**`'s OWN `drizzle/`, explicitly NOT `packages/db/drizzle/` (D:220) | **No overlap** |
| **WS-E** | OWNS `economy.ts` (carve-out, expected). **BUT hands `schema.ts`/`auth.ts`/`attribution.ts`/`relations.ts` Stripe-removal edits to WS-O** (E:215) + asks WS-O to own `subscriptions` table-drop; 3 util files unresolved (E:255-258) | **OVERLAP / unowned-work gap** — files are WS-O's, the edits are real and WS-E-blocking, but absent from WS-O's task list. Also `index.ts` is co-edited (WS-E may add an export region near `economy`; WS-O appends 3) — low-risk append merge but a shared file. |
| WS-F | Defers ALL schema (incl. `user_feature_flags`) to WS-O (F:199); consumer-only. Needs possible `bonus` enum value via WS-O (F:241) | **No file overlap** (clean handoff). One enum-coordination item (see Q2). |
| WS-H, WS-I | **Read-only** source material; H:242 "Overlap result: NONE", I deprecates email components only (no schema writes) | **No overlap** |
| **WS-J** | Defers ALL new tables/enums to WS-O (J:183). Authored the lib/dashboard designs WS-O implements. Will write `router/skill-library/**`, `router/dashboard/**` (NOT `router/integration/**`) | **No file overlap** — but a **design-dependency**: WS-O must implement exactly J's §2.2 shapes or WS-J routers break. |
| WS-K, WS-L, WS-M, WS-N | No `schema/**`, `drizzle/**`, or `router/integration/**` write claims found | **No overlap** |

**Flagged overlaps:**
- **WS-E (HIGH):** Stripe-removal edits to `schema.ts`/`auth.ts`/`attribution.ts`/`relations.ts` are WS-O-owned files but unscheduled in WS-O. Must be added to WS-O's plan or explicitly re-assigned. The `subscriptions` table-drop + the 3 util files (`membership.ts`, `integration/utils.ts`, `active-org.ts`) ownership is unresolved.
- **`index.ts` (LOW):** co-touched by WS-O (3 appends) and potentially WS-E (economy region). Append-only alpha edits → trivial merge, but declare in both PRs.
- **`router/integration/**`:** no sibling writes it → WS-O is sole writer. **Clean.**
- **`drizzle/**`:** WS-E also emits generated migration output here (E:204 "Stripe-removal under `packages/db/drizzle/**`"). **Two workstreams generating into the same migration dir** = sequential-only (`drizzle-kit generate` is order-dependent on the journal). Must serialize WS-E and WS-O `generate` runs; concurrent generation will conflict on `meta/_journal.json`. **MEDIUM risk.**

#### (d) Confidence per major claim

| Claim | Confidence | Basis |
|---|---|---|
| One shared `integration_connections` spine, no orphan per-provider tables | **High** | Read schema.ts:194-287 directly; only 2 integration tables exist |
| Handler-depth verdicts per provider (linear/github/slack/telegram real; notion/fibery park; discord/lark half-wired) | **High** | Router line counts + TODO markers verified verbatim |
| "Remove nothing; provider removal out of scope" recommendation | **High** | Destructive live-enum + FK-data argument is sound |
| Org spine + skills-are-flat + no library/flag/dashboard tables | **High** | All anchors + negative greps confirmed |
| New-table ERDs (§2.2-2.4) are implementable as drawn | **Medium** | Designs are internally consistent and match conventions, but inherited from WS-J/WS-F unverified-against-consumer-code; FK targets exist |
| `generate`-only, never migrate/push; offline-safe | **High** | package.json confirms no generate script; AGENTS.md rule explicit |
| §4 ownership is collision-free | **Medium-Low** | WS-E Stripe handoff + shared `drizzle/`+`index.ts` are real coordination points the spec doesn't surface |
| Migration baseline / "current head 0049" | **Low (wrong)** | Head is 0077; corrected above |

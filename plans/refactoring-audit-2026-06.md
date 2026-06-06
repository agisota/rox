# Refactoring Audit & Plan — June 2026

Generated from a 5-agent read-only static-analysis sweep of the monorepo (~362K non-test LOC across `apps/**` + `packages/**`).

## Guiding principle

The repo is **mid v1→v2 migration**; two parallel stacks coexist:

- **v1 (legacy, still LIVE** behind `useIsV2CloudEnabled()`): `renderer/stores/tabs/**`, `screens/main/WorkspaceView/**`, `routes/.../workspace(s)`, the desktop-embedded tRPC routers, `packages/mcp`, `packages/trpc` v1 routers.
- **v2 (active, hot churn — 40–60 commits/file/90d)**: `packages/panes`, `routes/.../v2-workspace*`, `usePaneRegistry`, `packages/host-service`.

→ **Do not** deep-refactor v1 (it gets deleted at cutover) or v2-hot files (merge-conflict risk). Target **neutral** zones, mechanical de-duplication, and verified dead-code removal. Most v1-side "god-file" line-count problems resolve by **deletion, not refactoring**.

Type-safety hygiene is already good (≈10 `as any` in renderer, near-zero `@ts-ignore`); the real liabilities are god-files, duplication, and missing tests on the most complex modules.

---

## Tier 1 — Quick wins (low risk, do first)

1. **Delete orphaned dead code (~600–700 LOC).** Each verified zero live importers:
   - Stores: `renderer/stores/file-explorer.ts`, `search-dialog-state.ts`, `v2-workspace-local-meta.ts`, `v2-section-local-meta.ts` (+ their `.test.ts`).
   - Dead barrel: `renderer/stores/tabs/index.ts`.
   - Helpers: `react-query/workspaces/useImportExternalWorktrees.ts`, `screens/main/.../StartView/ActionCard.tsx`, `.../useSubmitWorkspace/mapLinkedContext.ts`, `tasks/$taskId/utils/buildAgentCommand.ts`, `main/terminal-host/test-helpers.ts`, `packages/chat/.../openai-oauth-debug.ts`, `packages/email/src/emails/welcome.tsx`.
   - Deprecated shims: `packages/shared/src/claude-command.ts` (+ its `package.json` export block), `removeAppEnvVars` in `main/lib/terminal/env.ts` (+ its test block).
   - Risk: Low. Verify: grep + `bun run typecheck`.
2. **Consolidate `getErrorMessage` (D1) — highest-ROI dedup.** ~158 hand-rolled `err instanceof Error ? err.message : String(err)` copies across every app/package → one `packages/shared/src/error.ts`; replace the 3 existing local helpers (`ChatInputFooter/utils/getErrorMessage.ts` ×2, `workspace-fs/src/error-message.ts`). Risk: Low (mechanical codemod).
3. **Consolidate `githubAvatarUrl` (D3).** 3–4 inconsistent copies (only one `encodeURIComponent`s) → `packages/shared/src/github-remote.ts` (already hosts `parseGitHubRemote`). Risk: Low.
4. **Share web/admin tRPC boilerplate (D2).** `apps/web/src/trpc/{react,server,query-client}` are ≈byte-identical to `apps/admin/src/trpc/*` → a `@superset/trpc/next` export (`createReactTRPC`/`createServerCaller`/`createQueryClient`). Risk: Low.
5. **Add a shared `sleep`/async util (D7/F7).** `packages/shared/src/async.ts` (`sleep`, `withTimeout`); replace hand-rolled copies in `workspace-fs/src/fs.ts` and the host-service profile script. Skip the Stainless-generated sdk copy. Risk: Low.

## Tier 2 — Structural god-file splits (neutral, higher value)

6. **Split `git.ts` (1885) → `git/{worktree,branches,remote,status-parser,pr}.ts` + re-export barrel.** Flagship structural refactor: **52 existing tests** make it low-risk; precedent already set by the extracted `git-client.ts`. `status-parser`/`branches` slices are runtime-agnostic and survive v2 even if worktree/PR slices later get deleted. Risk: Low–Med.
7. **Split `projects.ts` (1799, NEUTRAL — not v1).** Follow the `workspaces/procedures/` pattern → `procedures/{github,branches,crud,bootstrap}.ts`; lift inline `.mutation`/`.query` closure bodies into testable `utils/*` services. No tests today → add characterization tests first. Risk: Med.
8. **Extract a typed `gh` CLI client (F4).** 19 ad-hoc `execWithShellEnv("gh", …)` + inline `JSON.parse` sites → `github/gh-client.ts` `ghJson<T>(args,{cwd})` with centralized error normalization. Risk: Low.
9. **De-dup branch enumeration (F3).** 3 procedures (~488 LOC) repeat the same `for-each-ref` → `Map` build → extract `buildBranchMap()` + `BranchInfo` mapper. Risk: Low.
10. **Typed git/gh error classifier (F9).** Replace fragile `stderr.includes("not a git repository")`-style control flow with `classifyGitError()`/`classifyGhError()` returning a typed enum. Risk: Low.
11. **Collapse `settings/index.ts` boilerplate (F11).** 46 near-identical get/set procedures (each `getSettings() ?? DEFAULT` + identical upsert) → a declarative `makeSettingProcedures({key,column,default,schema})` table; ~700 LOC → a map. Leave the non-trivial preset procedures. Risk: Low.

## Tier 3 — Test-enabling (unlock safe future refactors)

12. **Add `fuzzy-scorer.test.ts` (F2) — safest win.** 903-line pure algorithm (ported from VS Code), zero direct tests, isolated/neutral. Characterization tests (ranking, match positions, prefix/CamelCase/path cases) unlock confident cleanup of the inlined helpers. Risk: Low.
13. **Characterization tests before splitting the untested god-modules:** `main/lib/terminal-host/client.ts` (1687), `projects.ts` (1799), `workspaces/procedures/create.ts` (1101). Converts later splits Med→Low risk.
14. **cli-framework typing + tests (F8).** 19 `as any` in the fluent builder defeat its purpose; 0 tests despite ~45 consumers. Type the `clone<TNext>()` transitions; add `option.test.ts`. Risk: Low.

## Tier 4 — Migration convergence (bigger; do BEFORE deleting v1)

15. **Lift chat message renderers into `packages/chat` (D5) — biggest LOC reduction available.** 30+ v1/v2 copy-paste `.tsx` (some byte-identical: `ToolPreviewMessage`, `UserMessageText`) between `screens/main/.../ChatPane` and `v2-workspace/.../ChatPane` → shared provider-agnostic renderers. Risk: Med.
16. **De-dup ChatPaneInterface utils/hooks (F1).** 5 byte-identical + 2 near-identical helper files across v1/v2 → existing shared `components/Chat/ChatInterface/{utils,hooks}` base (consumed by both today). Survives migration; typecheck-verifiable. Risk: Low.
17. **Extract shared zod contracts (D4).** Filesystem/terminal/ports/settings input schemas re-declared in the desktop-embedded vs host-service router trees → `packages/shared` (or `packages/trpc/contracts`). Risk: Med (live IPC).
18. **Unify terminal-env primitives (D6).** Locale/default-shell/env-sanitize duplicated across `desktop/main/lib/terminal/env.ts` (498L) and `host-service/.../env.ts` + `clean-shell-env.ts`. Risk: Med (correctness-sensitive).

---

## Avoid / defer

- **v1-legacy deep refactors** (deleted at cutover — track, don't rebuild): `stores/tabs/store.ts` (2369), `ChangesView.tsx` (855), `useTerminalLifecycle.ts` (859), `editorCoordinator.ts` (731), v1 `PromptGroup.tsx` (1392). v2 already re-implemented these cleanly.
- **v2-hot churn** (rebase risk — touch only in tight branches): `usePaneRegistry.tsx`, `CollectionsProvider/collections.ts`, `host-service-coordinator.ts`, `terminal-host/client.ts`, `packages/panes`.
- **Generated code (off-limits):** `packages/sdk/**` (Stainless — edit the OpenAPI spec, not the output), `packages/db/drizzle/**`.
- **Blocked-on-cutover deletions** (remove only after v1→v2 completes): bulk v1 (`stores/tabs`, `WorkspaceView`, `/workspace` routes — `stores/tabs/store.ts` still has 46 importers), `packages/mcp` (still backs the `/agent` API route + Slack), `packages/trpc` v1 `workspace`/`project`/`host` routers (mounted alongside `v2-*` in `root.ts`).
- **UI-kit pruning (team judgment call):** 17 unused `packages/ui` `ai-elements`/`ui` components are provably unreferenced — largest single LOC cut, but a shared UI package may intentionally keep the full kit. Confirm before removing.

## Recommended sequence

Tier 1 #1 (dead code) → #2 (`getErrorMessage`) for immediate, safe, verifiable wins and momentum → Tier 2 #6 (`git.ts` split) as the flagship structural refactor (its 52 tests make it safe) → Tier 3 #12 (`fuzzy-scorer` tests). Land each as its own small PR with `bun run typecheck` + `bun run lint` + `bun test` green before the next.

---

## Execution status — autonomous run (2026-06-06)

Executed on branch `refactor/audit-2026-06` in an **isolated git worktree** (a concurrent "OMC" agent was building `packages/workflow-*` on the main checkout; the worktree kept the two streams from colliding). Every commit verified with `typecheck` + `biome check` + targeted `bun test`.

**Shipped (10 refactor/test commits):**
1. remove orphaned dead code — 12 files, 649 lines
2. consolidate `getErrorMessage` — 142 copies → `@superset/shared/error` (76 files)
3. consolidate `githubAvatarUrl` — 4 copies → `@superset/shared/github-remote`
4. add shared `sleep()` — 9 copies → `@superset/shared/async`
5. extract pure porcelain-status parser — `git.ts` 1881→1687
6. extract tested error classifier (`git-errors.ts`) — `git.ts` →1618
7. extract + test pure PR-parsing helpers from `projects.ts`
8. extract + test `extractRepoName` from `projects.ts`
9. fuzzy-scorer characterization tests (16)
10. cli-framework: 17 `as any` → 0 via one typed `clone()` + tests (7)

Final state: biome clean over all 99 changed source files; 11 touched packages typecheck green; suites pass (shared 637, desktop-touched 124, workspace-fs 23, cli-framework 7, cli 12).

**Deferred — assessed, need an app-runnable environment to verify safely:**
- **#5** web/admin tRPC boilerplate — `packages/trpc` is server-only; no clean shared home and the RSC/`"use client"` boundary is runtime-unverifiable here.
- **#8 (deep) / #9 gh client / #10 branch dedup / #12 settings collapse** — tRPC procedure bodies doing git/gh I/O across divergent sites with no existing tests; behavior-preservation can't be confirmed by typecheck alone.
- **Tier 4** migration convergence (chat renderers, zod contracts, terminal-env) — Med-risk, hot v2 zone, large live UI.

Pick these up with the desktop/Next apps runnable for verification.

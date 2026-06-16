# Rox Release Train Receipt - 2026-06-16

## Current State

- Worktree: `.worktrees/share-auth-branding`
- Branch: `issue/share-auth-branding`
- PR: `https://github.com/agisota/rox/pull/142`
- Base: `origin/main` at `1c7b425a90faf2ce21922ccd819c2d25a484e6fd`
- Lane state: share/auth/branding lane has product code for public share management, artifact share publishing from desktop settings, public share revocation, and anonymous `/s/:slug` rendering proof.
- Receipt state: this file travels with the lane PR because the separate release-train receipt worktree was not present in the active checkout.

## Target State

- Public chat/artifact snapshots are shareable through `public_shares` without exposing live private resources.
- Owners can list/copy/revoke their shares; org admins can manage org public shares.
- Desktop exposes a settings surface for public links and artifact sharing.
- Anonymous visitors can open only non-revoked snapshots on `/s/:slug`.
- The lane is reviewable as a single PR with local, targeted, and browser-visible evidence.

## Gap / Transformation

- `packages/trpc` now exposes `share.listPublic` and `share.revokePublic`, with creator/admin scoping and revoked-link filtering.
- Desktop settings now has a `shares` section, settings search metadata, sidebar entry, and `SharesSettings` UI for list/copy/revoke plus artifact publish/copy actions.
- Desktop collections now include read-only org-scoped `artifacts` so the share UI can operate on existing artifact snapshots.
- Local smoke seeds one immutable `public_shares` row and verifies the public web route renders the serialized snapshot through portless.

## Share Lane Verification Proof

- `./.rox/setup.local.sh`: passed; created ignored local `.env`, started `rox-share-auth-branding` Docker DB stack, applied local migrations, seeded `admin@local.test`.
- Seeded local `public_shares` row:
  - slug: `rox-share-smoke-20260616-mqg3da8s`
  - resource type: `chat_session`
  - title: `Rox Share Smoke 2026-06-16`
- Portless route:
  - command: `PORTLESS_TLD=t portless --name rox-share-smoke --app-port 3020 bun run --cwd apps/web dev`
  - verified URL: `https://rox-share-smoke.t/s/rox-share-smoke-20260616-mqg3da8s`
  - evidence: `curl -k -sS -o /tmp/rox-share-smoke.html https://rox-share-smoke.t/s/rox-share-smoke-20260616-mqg3da8s`
  - status: `200`
  - content checks: `Rox Share Smoke 2026-06-16`, `rox-share-smoke-20260616-mqg3da8s`, `Browser-visible share smoke request`, and `Rox share smoke response visible through /s/:slug` were present in `/tmp/rox-share-smoke.html`.
  - browser-visible proof: `open https://rox-share-smoke.t/s/rox-share-smoke-20260616-mqg3da8s` exited 0 and opened the verified local portless URL in the default browser.

## Automated Verification

- `bunx @biomejs/biome@2.4.2 check --write --unsafe <touched share files>`: passed, 13 files, no fixes.
- `bun test packages/trpc/src/router/share/share.test.ts`: passed, 11 tests, 23 expects.
- `bun test apps/desktop/src/renderer/routes/_authenticated/settings/utils/settings-search/settings-search.test.ts`: passed, 8 tests, 13 expects.
- `bun test apps/desktop/src/renderer/routes/_authenticated/settings/shares/components/SharesSettings/share-artifacts.test.ts`: passed, 3 tests, 5 expects.
- `bun run generate:routes` from `apps/desktop`: passed.
- `bun run typecheck` from `packages/trpc`: passed.
- `bun run typecheck` from `apps/web`: passed.
- `bun run typecheck` from `apps/desktop`: passed.
- `bun run lint` from repo root: passed, 5044 files, no fixes.

## Remaining Blockers

- #27, #28, #29, #30, and #32 still require their own lane receipts and PRs.
- #34/#35 remain gated until billing interfaces stabilize.
- This lane did not run full `bun test` or `bun run build`; those are reserved for the final integration train gate after all lane PRs settle.
- Local DB migrations were applied only to the per-worktree Docker database. No production database or remote deployment was touched.

---

## #29 Lane - T-BOOTSTRAP Workspace Starter Presets

### Current State

- Worktree: `.worktrees/issue-29-bootstrap`
- Branch: `issue/29-bootstrap`
- Base: `origin/main` at `070155433`
- Scope inspected: workspace creation UI in `AddRepositoryModals`, shared setup/starter preset catalogs, host-service project creation handlers, setup config resolution, and project `rox/config.json` handling.
- Existing code already had 27 single-effect workspace setup presets after `origin/main` advanced, plus a merged starter catalog union of 27 composite starters. The visible picker in this lane renders composite starter ids, and project creation now accepts and applies selected starter ids.

### Target State

- Workspace creation exposes a starter preset picker with explanations.
- Starter presets provide a named composite catalog in the release-train target range or a documented superset when `origin/main` contributes additional presets.
- Selecting starter presets during project creation resolves into scaffold files and setup commands.
- Generated files/scripts are deterministic, skip existing files, and write setup commands to canonical `rox/config.json`.
- This lane remains local-only: no production DB, deploy, #34/#35, or unrelated refactor.

### Gap / Transformation

- Convert the creation picker from single-effect setup presets to composite starter presets so users choose starter outcomes instead of low-level file/command atoms.
- Add host-service materialization for selected starter ids: resolve each starter via `@rox/shared`, write missing scaffold files into the repo, and append unique setup commands to `rox/config.json`.
- Thread `starterPresetIds` through `project.create` for empty, clone, importLocal, and template project creation modes.
- Keep the existing setup runner contract intact: workspace setup still reads canonical `rox/config.json` through `loadSetupConfig`.

### Tasks as State Transitions

- Given the branch had only 8 composite starters and the target requires at least 15, expand `WORKSPACE_STARTER_PRESETS` and preserve the `origin/main` starter additions, leaving a 27-starter merged catalog.
- Given the picker displayed low-level setup presets and the target requires starter explanations in creation flow, switch `WorkspaceSetupPresets` to render `WORKSPACE_STARTER_PRESETS` and embed it in `NewProjectModal`.
- Given project creation ignored selected presets and the target requires generated files/scripts, add `applyWorkspaceStarterPresets` and call it before persisting created projects.
- Given scaffold writes can touch existing repos, preserve existing files and de-duplicate setup commands so bootstrap is additive and reversible.

### Verification Proof

- RED: `bun test packages/shared/src/workspace-starter-presets.test.ts` failed because starter count was 8 while the new test required at least 15.
- GREEN before merge: `bun test packages/shared/src/workspace-starter-presets.test.ts packages/shared/src/workspace-setup-presets.test.ts packages/host-service/src/trpc/router/project/utils/starter-presets.test.ts` passed: 19 tests, 237 expects.
- Merge resolution: merged `origin/main` at `070155433` into `issue/29-bootstrap`, resolved `WorkspaceSetupPresets.tsx` and `workspace-starter-presets.test.ts`, preserved the starter-id UI contract for `starterPresetIds`, and kept the merged 27-starter catalog.
- GREEN after merge: `bun test packages/shared/src/workspace-starter-presets.test.ts packages/shared/src/workspace-setup-presets.test.ts packages/host-service/src/trpc/router/project/utils/starter-presets.test.ts` passed: 26 tests, 310 expects.
- GREEN: `bun run --cwd packages/shared typecheck` passed.
- GREEN: `bun run --cwd packages/host-service typecheck` passed.
- GREEN: `bun run --cwd apps/desktop typecheck` passed.
- GREEN: `bun run lint` passed: Biome checked 5053 files with no fixes applied.
- GREEN: `git diff --check` passed after conflict resolution.

### Remaining Blockers / Follow-Ups

- This subset does not claim full #29 epic closure. It materially closes the starter preset catalog, visible creation selection, and file/script materialization path.
- Full end-to-end UI/browser proof was not collected in this lane; desktop typecheck and unit tests prove the wired code path, but visual smoke should run in the final integration gate.
- Full `bun test` and `bun run build` were not run for the monorepo; this lane used targeted tests plus typecheck for touched scopes.
- A full host-service app integration test was attempted after `bun install`, but this local worktree produced a broken isolated `better-sqlite3` dependency symlink. The final test was converted to a pure materializer test that avoids the native DB harness and verifies the bootstrap behavior directly.
- PR #147 is mergeable after commit `c5b096878`, but GitHub CI/checks restarted and must finish green before merge.

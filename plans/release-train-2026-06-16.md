# Rox Release Train Receipt - 2026-06-16

## Share/Auth/Branding Lane

- Worktree: `.worktrees/share-auth-branding`
- Branch: `issue/share-auth-branding`
- PR: `https://github.com/agisota/rox/pull/142`
- State: merged to `main`
- Base at lane verification: `origin/main` at `1c7b425a90faf2ce21922ccd819c2d25a484e6fd`

### Current State

- Share/auth/branding lane has product code for public share management, artifact share publishing from desktop settings, public share revocation, and anonymous `/s/:slug` rendering proof.
- The lane receipt traveled with PR #142 because the separate release-train receipt worktree was not present in the active checkout.

### Target State

- Public chat/artifact snapshots are shareable through `public_shares` without exposing live private resources.
- Owners can list/copy/revoke their shares; org admins can manage org public shares.
- Desktop exposes a settings surface for public links and artifact sharing.
- Anonymous visitors can open only non-revoked snapshots on `/s/:slug`.
- The lane is reviewable as a single PR with local, targeted, and browser-visible evidence.

### Gap / Transformation

- `packages/trpc` now exposes `share.listPublic` and `share.revokePublic`, with creator/admin scoping and revoked-link filtering.
- Desktop settings now has a `shares` section, settings search metadata, sidebar entry, and `SharesSettings` UI for list/copy/revoke plus artifact publish/copy actions.
- Desktop collections now include read-only org-scoped `artifacts` so the share UI can operate on existing artifact snapshots.
- Local smoke seeds one immutable `public_shares` row and verifies the public web route renders the serialized snapshot through portless.

### Share Lane Verification Proof

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

### Share Lane Automated Verification

- `bunx @biomejs/biome@2.4.2 check --write --unsafe <touched share files>`: passed, 13 files, no fixes.
- `bun test packages/trpc/src/router/share/share.test.ts`: passed, 11 tests, 23 expects.
- `bun test apps/desktop/src/renderer/routes/_authenticated/settings/utils/settings-search/settings-search.test.ts`: passed, 8 tests, 13 expects.
- `bun test apps/desktop/src/renderer/routes/_authenticated/settings/shares/components/SharesSettings/share-artifacts.test.ts`: passed, 3 tests, 5 expects.
- `bun run generate:routes` from `apps/desktop`: passed.
- `bun run typecheck` from `packages/trpc`: passed.
- `bun run typecheck` from `apps/web`: passed.
- `bun run typecheck` from `apps/desktop`: passed.
- `bun run lint` from repo root: passed, 5044 files, no fixes.

## Issue #27 Themes Lane

- Worktree: `.worktrees/issue-27-themes`
- Branch: `issue/27-themes`
- PR: `https://github.com/agisota/rox/pull/143`
- Base after receipt merge: `origin/main` at `b8b42aa15`
- Scope: verify the Zed-derived theme library, preserve dark/glass defaults, and lock Electron glass/vibrancy behavior with desktop tests.

### Current State

- Zed theme conversion and generated library tests already cover conversion, unique non-reserved IDs, and generated dataset color validity.
- Desktop persisted app defaults select the built-in dark theme and enable glass at `0.3` opacity.
- Electron window creation uses `getGlassWindowOptions`, but the helper had no focused unit test coverage and `main.ts` had a stale comment saying the glass toggle defaulted off.

### Target State

- Zed library import remains verified through generated-dataset tests.
- Default desktop state is explicitly verified as dark theme + glass enabled + `0.3` window opacity.
- macOS vibrancy helper behavior is verified, while non-mac platforms continue to fall back to an opaque background.

### Verification Proof

- `bun test apps/desktop/src/shared/themes/zed/convert.test.ts apps/desktop/src/shared/themes/zed/base16.test.ts`: 10 pass, 2795 expects.
- `bun test apps/desktop/src/main/lib/app-state/schemas.test.ts apps/desktop/src/main/lib/glass-window.test.ts`: 7 pass, 12 expects.
- `bun run --cwd apps/desktop typecheck`: passed after `generate:icons` and `generate:routes`.
- `bun run lint`: passed, checked 5047 files with no fixes after merging current `origin/main`.

## Remaining Blockers

- #28, #29, #30, and #32 still require their own lane receipts and PRs.
- #34/#35 remain gated until billing interfaces stabilize.
- Full desktop app visual vibrancy smoke is still a final release-train gate, not claimed by #27.
- Full monorepo `bun test` / `bun run build` are reserved for the final integration train gate after all lane PRs settle.
- Local DB migrations for share smoke were applied only to the per-worktree Docker database. No production database or remote deployment was touched.

## #28 T-AGENTS Lane Receipt

### Current State

- Worktree: `.worktrees/issue-28-agents`
- Branch: `issue/28-agents`
- Base: `origin/main` at `b8b42aa15`
- Scope state: Rox already had built-in terminal-agent config rows, a v2 Terminal Preset quick-add picker that links presets to host agent config ids, optional harness catalog entries for `oh-my-*`, `hermes`, `openclaw`, and `ouroboros`, and a host-service preinstall catalog built from shared agent/harness definitions.
- Gap state: the harness catalog had no typed release receipt for installer source, license/size risk, or Terminal Preset support strategy, so the preinstall catalog could not prove which harnesses were installable, optional, or only supported through their base agent preset.

### Target State

- The #28 lane should materially close the catalog/receipt part of T-AGENTS without pretending the full XL epic is complete.
- Harnesses must carry auditable metadata for installer source, license, size risk, and Terminal Preset support strategy.
- The host-service preinstall catalog must preserve that metadata for CLI/runtime receipt consumers.
- Built-in Rox chat must remain separate from terminal-only harness/preset handling.

### Gap / Transformation

- Added `HarnessAuditReceipt` to `packages/shared/src/agent-harness-presets.ts`.
- Marked `oh-my-claudecode` and `oh-my-codex` as MIT npm harnesses with known size risk from the local package manifests.
- Marked `oh-my-openagent`, `hermes`, `openclaw`, and `ouroboros` as optional/unknown installer surfaces whose current Terminal Preset support is through their base agents (`opencode`, `claude`, `claude`, `codex`).
- Added `getHarnessTerminalPresetBaseAgentIds()` so the base-agent Terminal Preset strategy is programmatically checkable.
- Propagated harness audit receipts into `PreinstallCatalogItem.audit` in `packages/host-service/src/runtime/agent-preinstall/install-plan.ts`.

### Verification Proof

- `bun install`: passed; restored workspace package aliases and native Electron modules in this clean worktree.
- `bun test packages/shared/src/agent-harness-presets.test.ts`: passed, 8 tests, 64 expects.
- `bun test src/runtime/agent-preinstall/install-plan.test.ts src/trpc/router/settings/agent-configs.test.ts` from `packages/host-service`: passed, 41 tests, 349 expects.
- `bun test apps/desktop/src/renderer/routes/_authenticated/components/AgentHooks/hooks/useDefaultV2TerminalPresets/default-v2-terminal-presets.test.ts apps/desktop/src/renderer/lib/agent-launch-command.test.ts packages/shared/src/agent-settings.test.ts`: passed, 26 tests, 72 expects.
- `bun run typecheck` from `packages/shared`: passed.
- `bun run typecheck` from `packages/host-service`: passed.
- `bun run lint` from repo root: passed, 5045 files, no fixes.

### Remaining Blockers

- This PR does not honestly close all of #28. It closes the catalog receipt/audit subset and preserves the existing per-agent Terminal Preset picker contract.
- Full installer size verification for `oh-my-openagent`, `hermes`, `openclaw`, and `ouroboros` is still blocked by missing verified upstream install/package metadata in this branch; they remain optional with `unknown` license/size risk.
- This PR does not add a new UI flow for multiple harness presets on the same base agent, because the current v2 preset architecture links one preset row to one host agent config id and already resolves live commands through that link.
- Full release-train gate still needs broader final integration checks after #27/#29/#30/#32 settle.

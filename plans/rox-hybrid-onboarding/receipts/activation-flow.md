# Activation Flow Receipt

Status: DONE_WITH_CONCERNS
Worktree: /Users/marklindgreen/.git-worktrees/rox/feat/rox-onboarding-activation
Branch: feat/rox-onboarding-activation

Changed:
- `apps/desktop/src/renderer/routes/_authenticated/onboarding/layout.tsx`: expanded activation steps to provider, project, workspace, and first agent action; provider continue/skip now records intended activation progress and no longer completes onboarding.
- `apps/desktop/src/renderer/routes/_authenticated/onboarding/page.tsx`: added concise provider limitation copy for continuing without Claude Code/Codex.
- `apps/desktop/src/renderer/routes/_authenticated/onboarding/project/page.tsx`: project selection now records project activation progress and routes to `/onboarding/workspace`; removed `completeOnboarding` from project selection.
- `apps/desktop/src/renderer/routes/_authenticated/onboarding/onboarding-progress.ts`: added renderer activation progress helpers using intended `user.updateOnboardingProgress` API plus a small local id draft bridge.
- `apps/desktop/src/renderer/routes/_authenticated/onboarding/workspace/page.tsx`: added first workspace step with the required suggested prompt, existing new workspace modal opening, project preselection/prompt prefill, and manual continue path when no workspace callback is available.
- `apps/desktop/src/renderer/routes/_authenticated/onboarding/first-agent-action/page.tsx`: added first agent action step with suggested prompt and `Я получил первый ответ` fallback that calls intended `user.completeActivation`, refetches session, and routes to `/v2-workspaces`.
- `apps/desktop/src/renderer/lib/persistent-hash-history/persistent-hash-history.ts`: added new onboarding static routes to the cold-restore allow-list.

Verified:
- `bun run --cwd apps/desktop generate:routes`: passed; generated route tree includes `/onboarding/workspace` and `/onboarding/first-agent-action`.
- `bunx @biomejs/biome@2.4.2 check --write apps/desktop/src/renderer/routes/_authenticated/onboarding/layout.tsx apps/desktop/src/renderer/routes/_authenticated/onboarding/page.tsx apps/desktop/src/renderer/routes/_authenticated/onboarding/project/page.tsx apps/desktop/src/renderer/routes/_authenticated/onboarding/onboarding-progress.ts apps/desktop/src/renderer/routes/_authenticated/onboarding/workspace/page.tsx apps/desktop/src/renderer/routes/_authenticated/onboarding/first-agent-action/page.tsx apps/desktop/src/renderer/lib/persistent-hash-history/persistent-hash-history.ts`: passed; fixed formatting in 3 files.
- `bunx @biomejs/biome@2.4.2 check --write apps/desktop/src/renderer/routes/_authenticated/onboarding/first-agent-action/page.tsx apps/desktop/src/renderer/routes/_authenticated/onboarding/workspace/page.tsx apps/desktop/src/renderer/routes/_authenticated/onboarding/onboarding-progress.ts`: passed; no fixes applied after icon correction.
- `bun run typecheck --filter=@rox/desktop`: failed on Lane A dependencies only: `@rox/shared/onboarding` missing, `apiTrpcClient.user.updateOnboardingProgress` missing, and `apiTrpcClient.user.completeActivation` missing.

Integration notes:
- Merge after or with Lane A state/API so `@rox/shared/onboarding`, `user.updateOnboardingProgress`, and `user.completeActivation` exist in the typed AppRouter.
- The current new workspace modal store can open with a preselected project but does not expose a workspace-created callback to this route. The workspace step therefore offers a manual workspace id/continue path and records only `currentStep: "workspace"` when no workspace id is known.
- `_authenticated/layout.tsx` still gates non-onboarded users away from dashboard routes; this lane did not edit that file because it is outside the owned write scope.

Risks / gaps:
- Desktop typecheck remains blocked until Lane A shared/API contracts merge.
- Automatic activation completion on actual first agent response/run result is not wired in this lane; the fallback confirmation button completes activation through the intended API.

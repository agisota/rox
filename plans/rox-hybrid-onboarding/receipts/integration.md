# Integration Receipt

Status: DONE_WITH_CONCERNS
Worktree: /Users/marklindgreen/.git-worktrees/rox/feat/rox-onboarding-integration
Branch: feat/rox-onboarding-integration

Changed:
- `packages/db/src/schema/auth.ts`: added nullable `auth.users.onboarding_progress` JSONB storage.
- `packages/db/drizzle/0113_add_onboarding_progress.sql`, `packages/db/drizzle/meta/0113_snapshot.json`, and `packages/db/drizzle/meta/_journal.json`: generated the current-main Drizzle migration artifact for `onboarding_progress`.
- `apps/desktop/src/renderer/routes/_authenticated/components/OnboardingTourProvider/OnboardingTourProvider.tsx`: replaced the isolated fallback provider with the canonical registry-backed runtime, server progress read/write, pause/resume persistence, analytics events, route-aware step selection, and resume-button percent state.
- `apps/desktop/src/renderer/routes/_authenticated/components/OnboardingTourProvider/components/OnboardingOverlay/OnboardingOverlay.tsx`: made anchor lookup choose the first visible target, added MutationObserver-based late-anchor retry, and added keyboard dialog semantics/focus trapping.
- `apps/desktop/src/renderer/routes/_authenticated/components/OnboardingTourProvider/onboardingTourRegistry.ts`: aligned tour ids with `@rox/shared/onboarding` canonical `SurfaceTourId` and `REQUIRED_SURFACE_TOURS`.
- `apps/desktop/src/renderer/stores/onboarding-tour/store.ts`: aligned persisted local tour state with canonical shared `SurfaceTourId`.
- `apps/desktop/src/renderer/stores/onboarding-tour/index.ts`: removed the local fallback tour id export.
- `apps/desktop/src/renderer/stores/onboarding-tour/store.test.ts`: updated tests to use canonical surface tour ids.
- `apps/desktop/src/renderer/lib/persistent-hash-history/persistent-hash-history.ts`: added the new static onboarding routes to the restorable route allowlist.
- `apps/desktop/src/renderer/lib/streamdown-mermaid.ts` and mermaid renderer call sites: centralized the `@streamdown/mermaid` plugin adapter so desktop typecheck is stable under Bun's isolated linker.

Verified:
- `bunx drizzle-kit generate --config drizzle.config.ts --name add_onboarding_progress` in `packages/db`: PASS, created `drizzle/0113_add_onboarding_progress.sql`.
- `sed -n '1,80p' packages/db/drizzle/0113_add_onboarding_progress.sql`: PASS, SQL is exactly `ALTER TABLE "auth"."users" ADD COLUMN "onboarding_progress" jsonb;`.
- `git diff origin/main -- packages/db/drizzle/meta/_journal.json` and `rg -n 'onboarding_progress|0113_add_onboarding_progress' packages/db/drizzle/meta/0113_snapshot.json packages/db/drizzle/meta/_journal.json`: PASS, journal registers `0113_add_onboarding_progress` and the snapshot includes `auth.users.onboarding_progress`.
- `bun run --cwd apps/desktop generate:routes`: PASS, `tsr generate` completed.
- `bun test apps/desktop/src/renderer/lib/persistent-hash-history/persistent-hash-history.test.ts packages/shared/src/onboarding/types.test.ts apps/desktop/src/renderer/stores/onboarding-tour/store.test.ts apps/desktop/src/renderer/routes/_authenticated/components/OnboardingTourProvider/onboardingTourRegistry.test.ts`: PASS, 45 tests / 195 assertions.
- `bun run typecheck --filter=@rox/desktop --filter=@rox/shared --filter=@rox/analytics --filter=@rox/db --filter=@rox/trpc`: PASS, 5 packages successful.
- `bun run lint < /dev/null`: PASS, checked 7694 files, no fixes applied.
- `git diff --cached --check origin/main`: PASS, no whitespace errors.

Integration notes:
- Merge order was state/API, surface tours, activation flow, overlay provider. Post-merge cleanup replaced overlay lane's local fallback list with the surface-tour registry and shared state model.
- `users.onboarded_at` remains the activation gate for compatibility; full surface-tour completion is stored in `onboarding_progress.tours`.
- Surface-tour runtime starts a visible current-route step when possible, falls back to the next incomplete step, and keeps the bottom-left resume affordance visible while required tours remain incomplete.
- Current `origin/main` no longer ships `/quick-chat`, so `quick_chat` is not included in `REQUIRED_SURFACE_TOURS`.
- Production database migration was not applied; this worktree only generated the migration artifact.

Risks / gaps:
- No Electron visual smoke or screenshot was captured in this lane; verification is route generation, focused behavior tests, TypeScript, lint, and migration diff proof.
- The first-agent activation step still uses an explicit confirmation fallback rather than a real agent-run completion signal.
- Workspace activation records completion from the onboarding page flow, but the workspace creation modal still lacks a callback to attach the exact new workspace id.

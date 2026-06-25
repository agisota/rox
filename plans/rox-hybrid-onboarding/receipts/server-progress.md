# Lane A Server Progress Receipt

Status: DONE
Worktree: /Users/marklindgreen/.git-worktrees/rox/feat/rox-onboarding-state
Branch: feat/rox-onboarding-state

Changed:
- `packages/db/src/schema/auth.ts`: Added nullable `auth.users.onboarding_progress` JSONB field typed as `OnboardingStatus`; preserved `users.onboardedAt`.
- `packages/trpc/src/router/user/user.ts`: Added onboarding patch schema, merge helper, `onboardingProgress`, `updateOnboardingProgress`, and `completeActivation` endpoints.
- `packages/trpc/src/router/user/user.ts`: Updated legacy `completeOnboarding` to set `onboardedAt` and sync `activation.completedAt` / `first_agent_action` progress.

Verified:
- `bun test packages/shared/src/onboarding/types.test.ts`: PASS, 2 tests / 3 assertions.
- `bun run typecheck --filter=@rox/shared --filter=@rox/analytics --filter=@rox/db --filter=@rox/trpc`: PASS, 4 packages successful.

Integration notes:
- `onboardingProgress` read path backfills activation completion from `users.onboardedAt` when a legacy user has no progress JSON yet.
- `updateOnboardingProgress` accepts partial activation/tour records with Zod 4 `partialRecord`, so clients can patch one step or one tour without sending every enum key.
- `completeActivation` and legacy `completeOnboarding` both keep `users.onboardedAt` as the activation compatibility marker.

Risks / gaps:
- Runtime DB column does not exist until an offline Drizzle migration is generated and applied in a later deploy lane; no production DB action was taken.

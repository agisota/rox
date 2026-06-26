# Lane A State Model Receipt

Status: DONE
Worktree: /Users/marklindgreen/.git-worktrees/rox/feat/rox-onboarding-state
Branch: feat/rox-onboarding-state

Changed:
- `packages/shared/src/onboarding/types.ts`: Added canonical activation steps, required surface tour ids, onboarding status shape, defaults, normalization, and percent-complete helper.
- `packages/shared/src/onboarding/index.ts`: Added onboarding shared module barrel.
- `packages/shared/src/onboarding/types.test.ts`: Added focused normalization and progress tests.
- `packages/shared/src/constants.ts`: Added canonical onboarding activation and tour analytics event names.
- `packages/shared/package.json`: Added `./onboarding` package export so other workspace packages can import the new shared API.
- `packages/analytics/src/events.ts`: Added typed payloads for activation and surface-tour analytics events.

Verified:
- `bun test packages/shared/src/onboarding/types.test.ts`: PASS, 2 tests / 3 assertions.
- `bun run typecheck --filter=@rox/shared --filter=@rox/analytics --filter=@rox/db --filter=@rox/trpc`: PASS, 4 packages successful.

Integration notes:
- `packages/shared/package.json` changed outside the initial owned file list because the repo uses explicit package `exports`; without `./onboarding`, `@rox/shared/onboarding` is not a valid import for analytics/db/trpc.
- New analytics names preserve existing `ONBOARDING_COMPLETED` compatibility event.

Risks / gaps:
- No migration SQL generated; Drizzle migration generation remains a separate offline step.

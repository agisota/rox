# Overlay Provider Receipt

## Changed files

- `apps/desktop/src/renderer/stores/onboarding-tour/store.ts` — added persisted local pause/resume UI store with `activeTourId`, `activeStepId`, `pausedAt`, `lastRoute`, and `setActiveStep`, `pause`, `resume`, `clear` actions.
- `apps/desktop/src/renderer/stores/onboarding-tour/index.ts` — exported the onboarding tour store and local fallback types.
- `apps/desktop/src/renderer/stores/onboarding-tour/store.test.ts` — covered `setActiveStep`, `pause`, `resume`, and `clear`.
- `apps/desktop/src/renderer/routes/_authenticated/components/OnboardingTourProvider/OnboardingTourProvider.tsx` — added shell-mounted provider with a minimal import-safe fallback tour list, pause/resume wiring, missing-target fallback, and next-step behavior.
- `apps/desktop/src/renderer/routes/_authenticated/components/OnboardingTourProvider/index.ts` — exported provider.
- `apps/desktop/src/renderer/routes/_authenticated/components/OnboardingTourProvider/components/OnboardingOverlay/OnboardingOverlay.tsx` — added target lookup by `data-onboarding-anchor`, dim/highlight overlay, guide card, pause/next controls, and resize/scroll recalculation.
- `apps/desktop/src/renderer/routes/_authenticated/components/OnboardingTourProvider/components/OnboardingOverlay/index.ts` — exported overlay and step type.
- `apps/desktop/src/renderer/routes/_authenticated/components/OnboardingTourProvider/components/OnboardingResumeButton/OnboardingResumeButton.tsx` — added bottom-left `Продолжить onboarding · {percent}%` button.
- `apps/desktop/src/renderer/routes/_authenticated/components/OnboardingTourProvider/components/OnboardingResumeButton/index.ts` — exported resume button.
- `apps/desktop/src/renderer/routes/_authenticated/layout.tsx` — mounted `OnboardingTourProvider` after auth, organization, and activation gates around the authenticated shell UI.

## Commands run

- `bun test apps/desktop/src/renderer/stores/onboarding-tour/store.test.ts`
  - Result: pass, 4 tests, 8 assertions.
- `bunx biome check apps/desktop/src/renderer/stores/onboarding-tour/store.ts apps/desktop/src/renderer/stores/onboarding-tour/index.ts apps/desktop/src/renderer/stores/onboarding-tour/store.test.ts apps/desktop/src/renderer/routes/_authenticated/components/OnboardingTourProvider/OnboardingTourProvider.tsx apps/desktop/src/renderer/routes/_authenticated/components/OnboardingTourProvider/index.ts apps/desktop/src/renderer/routes/_authenticated/components/OnboardingTourProvider/components/OnboardingOverlay/OnboardingOverlay.tsx apps/desktop/src/renderer/routes/_authenticated/components/OnboardingTourProvider/components/OnboardingOverlay/index.ts apps/desktop/src/renderer/routes/_authenticated/components/OnboardingTourProvider/components/OnboardingResumeButton/OnboardingResumeButton.tsx apps/desktop/src/renderer/routes/_authenticated/components/OnboardingTourProvider/components/OnboardingResumeButton/index.ts apps/desktop/src/renderer/routes/_authenticated/layout.tsx`
  - Result: pass, no fixes needed after scoped `--write` formatting pass.
- `bun run typecheck --filter=@rox/desktop`
  - Integrated result: pass; see `receipts/integration.md`.

## Unresolved risks

- Full surface tour registry and dashboard anchors are owned by the tours lane and were not present in this worktree. This lane intentionally includes only a minimal fallback list with expected anchor ids so the shell provider compiles and degrades safely.
- Server-backed progress/state APIs are owned by the state/API lane. This provider uses local persisted pause/resume UI state only and does not mark durable step or tour completion.
- No browser smoke was run in this lane; the verification proof is store behavior, formatting/lint shape, and integrated checks in `receipts/integration.md`.

## Integration notes

- Replace the fallback step list in `OnboardingTourProvider.tsx` with the centralized tours registry when Task 5 lands.
- Wire durable completion/progress once the state/API lane exposes the final progress query/mutation surface.
- Missing anchors do not crash the provider; the overlay returns `null` and the bottom-left resume button remains available.

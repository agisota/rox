# Surface Tours Receipt

Status: DONE_WITH_CONCERNS
Worktree: /Users/marklindgreen/.git-worktrees/rox/feat/rox-onboarding-tours
Branch: feat/rox-onboarding-tours

Changed:
- `apps/desktop/src/renderer/routes/_authenticated/components/OnboardingTourProvider/onboardingTourRegistry.ts`: added centralized Russian `ONBOARDING_TOURS` copy for all required surface tours and local required id/type definitions for this isolated lane.
- `apps/desktop/src/renderer/routes/_authenticated/components/OnboardingTourProvider/onboardingTourRegistry.test.ts`: added registry coverage for required ids, required steps, and non-empty title/body/action/anchor/route fields.
- `apps/desktop/src/renderer/routes/_authenticated/_dashboard/components/DashboardSidebar/components/DashboardSidebarHeader/DashboardSidebarHeader.tsx`: added stable nav anchors for expanded and collapsed workspaces, automations, pipelines, tasks/PR, and skills library controls.
- `apps/desktop/src/renderer/routes/_authenticated/_dashboard/components/DashboardSidebar/DashboardSidebar.tsx`: added stable nav anchors for memory and settings controls in the lower sidebar.
- `apps/desktop/src/renderer/components/Chat/ChatInterface/ChatPaneShell/ChatPaneShell.tsx`: added `workspace-chat` to the shared chat shell used by workspace chat panes.
- `apps/desktop/src/renderer/routes/_authenticated/_dashboard/tasks/components/TasksView/components/TasksTopBar/TasksTopBar.tsx`: added `tasks-create` to the new task button.
- `apps/desktop/src/renderer/routes/_authenticated/_dashboard/automations/page.tsx`: added `automation-create` to the new automation button.
- `apps/desktop/src/renderer/routes/_authenticated/_dashboard/pipelines/components/PipelinesIndex/PipelinesIndex.tsx`: added `pipeline-template` to the pipeline template chooser.
- `apps/desktop/src/renderer/routes/_authenticated/_dashboard/skills-library/components/SkillsLibraryView/components/SkillsSidebar/SkillsSidebar.tsx`: added `skill-search` to the skills search field.
- `apps/desktop/src/renderer/routes/_authenticated/_dashboard/memory/components/SearchHeader/SearchHeader.tsx`: added `memory-search` to the concrete memory search input.
- `packages/shared/src/onboarding/types.ts` and `apps/desktop/src/renderer/routes/_authenticated/components/OnboardingTourProvider/onboardingTourRegistry.ts`: removed `quick_chat` from required tours because current `origin/main` no longer ships `/quick-chat`.

Verified:
- `bun test apps/desktop/src/renderer/routes/_authenticated/components/OnboardingTourProvider/onboardingTourRegistry.test.ts`: passed, 2 tests, 88 expects.
- `bunx @biomejs/biome@2.4.2 check <changed Lane D files>`: passed after formatting one registry file.
- Integrated desktop typecheck is now covered by `receipts/integration.md`; current full `@rox/desktop` typecheck is blocked by non-onboarding files outside this PR diff.
- `rg -n "data-onboarding-anchor=\"...\" apps/desktop/src/renderer/routes/_authenticated`: confirmed all required nav and inner anchor names are present.

Integration notes:
- State/API lane should replace or align the local `SurfaceTourId` and `REQUIRED_SURFACE_TOUR_IDS` definitions with the canonical `@rox/shared/onboarding` exports when merging shared onboarding types.
- Overlay lane can consume `ONBOARDING_TOURS` directly; each step has route and anchor fields.
- `memory-search` is a page-level fallback because the concrete memory search/import controls live behind `renderer/screens/memory/MemoryView`, outside this lane's narrow `_dashboard` surface scope.

Risks / gaps:
- No current duplicate `pipeline-template` anchors remain in the PR diff; the canonical anchor is on the template chooser inside `PipelinesIndex`.
- No current quick-chat tour is shipped because the route is absent from current `origin/main`.

# Surface Tours Receipt

Status: DONE_WITH_CONCERNS
Worktree: /Users/marklindgreen/.git-worktrees/rox/feat/rox-onboarding-tours
Branch: feat/rox-onboarding-tours

Changed:
- `apps/desktop/src/renderer/routes/_authenticated/components/OnboardingTourProvider/onboardingTourRegistry.ts`: added centralized Russian `ONBOARDING_TOURS` copy for all required surface tours and local required id/type definitions for this isolated lane.
- `apps/desktop/src/renderer/routes/_authenticated/components/OnboardingTourProvider/onboardingTourRegistry.test.ts`: added registry coverage for required ids, required steps, and non-empty title/body/action/anchor/route fields.
- `apps/desktop/src/renderer/routes/_authenticated/_dashboard/components/DashboardSidebar/components/DashboardSidebarHeader/DashboardSidebarHeader.tsx`: added stable nav anchors for expanded and collapsed workspaces, automations, pipelines, tasks/PR, quick chat, and skills library controls.
- `apps/desktop/src/renderer/routes/_authenticated/_dashboard/components/DashboardSidebar/DashboardSidebar.tsx`: added stable nav anchors for memory and settings controls in the lower sidebar.
- `apps/desktop/src/renderer/routes/_authenticated/_dashboard/quick-chat/components/QuickChatView/QuickChatView.tsx`: added `quick-chat-input` to the quick chat textarea.
- `apps/desktop/src/renderer/routes/_authenticated/_dashboard/v2-workspace/$workspaceId/page.tsx`: added `workspace-chat` to the main workspace content container.
- `apps/desktop/src/renderer/routes/_authenticated/_dashboard/tasks/components/TasksView/components/TasksTopBar/TasksTopBar.tsx`: added `tasks-create` to the new task button.
- `apps/desktop/src/renderer/routes/_authenticated/_dashboard/automations/page.tsx`: added `automation-create` to the new automation button.
- `apps/desktop/src/renderer/routes/_authenticated/_dashboard/pipelines/components/PipelinesIndex/PipelinesIndex.tsx`: added `pipeline-template` to the pipeline template chooser.
- `apps/desktop/src/renderer/routes/_authenticated/_dashboard/pipelines/components/PipelinesEmptyState/components/PipelineTemplateCard/PipelineTemplateCard.tsx`: added `pipeline-template` to empty-state template cards.
- `apps/desktop/src/renderer/routes/_authenticated/_dashboard/skills-library/components/SkillsLibraryView/SkillsLibraryView.tsx`: added `skill-search` to the skills search field.
- `apps/desktop/src/renderer/routes/_authenticated/_dashboard/memory/page.tsx`: added page-level `memory-search` fallback anchor around `MemoryView`.

Verified:
- `bun test apps/desktop/src/renderer/routes/_authenticated/components/OnboardingTourProvider/onboardingTourRegistry.test.ts`: passed, 2 tests, 100 expects.
- `bunx @biomejs/biome@2.4.2 check <changed Lane D files>`: passed after formatting one registry file.
- `bun run typecheck --filter=@rox/desktop`: passed, 1 successful task, `tsc --noEmit` completed.
- `rg -n "data-onboarding-anchor=\"...\" apps/desktop/src/renderer/routes/_authenticated`: confirmed all required nav and inner anchor names are present.

Integration notes:
- State/API lane should replace or align the local `SurfaceTourId` and `REQUIRED_SURFACE_TOUR_IDS` definitions with the canonical `@rox/shared/onboarding` exports when merging shared onboarding types.
- Overlay lane can consume `ONBOARDING_TOURS` directly; each step has route and anchor fields.
- `memory-search` is a page-level fallback because the concrete memory search/import controls live behind `renderer/screens/memory/MemoryView`, outside this lane's narrow `_dashboard` surface scope.

Risks / gaps:
- `memory-search` should be moved to the concrete memory search/import control by the memory surface owner or integration lane for better overlay placement.
- Multiple `pipeline-template` anchors can exist when both dialog and empty-state cards are mounted; runtime should use the first visible target or visibility filtering.

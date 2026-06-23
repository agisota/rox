# Agent Pipelines UX Polish Receipt

Date: 2026-06-17
Branch: `feat/agent-pipelines-ux-polish`
Worktree: `/Users/marklindgreen/.git-worktrees/set/ux-polish`

## Current State

The merged Agent Pipelines desktop UI was functionally present, but several visible controls were fragile in dense desktop layouts:

- index header and create dialog controls could crowd or clip under constrained height/width;
- template cards and pipeline cards lacked explicit pressed/target labels and consistent keyboard focus rings;
- editor toolbar/status controls could crowd the title area;
- canvas add-node controls had no explicit labels and could exceed available canvas width;
- side panels had truncation and action-label gaps for long roles, trigger names, and run-history rows.

## Target State

Keep the existing Agent Pipelines behavior and data model unchanged while improving visible desktop usability:

- responsive wrapping where toolbar/header controls can crowd;
- explicit accessible labels for icon/action controls;
- stable panel/canvas dimensions and bounded overflow;
- truncation/title handling for long pipeline, role, trigger, and run labels;
- small reversible renderer-only diff with no runtime, release, version, or publish file changes.

## Gap / Transformation

Given that the UI was already wired to cloud tRPC and workflow state, the change stays at the renderer presentation boundary only. No workflow-core runtime files, schema files, release files, version files, or publish files were touched.

## Changed Files

- `apps/desktop/src/renderer/routes/_authenticated/_dashboard/pipelines/components/PipelinesIndex/PipelinesIndex.tsx`
  - wrapped the index header, constrained the create button, bounded dialog height, added template/card labels, `aria-pressed`, focus rings, and truncation.
- `apps/desktop/src/renderer/routes/_authenticated/_dashboard/pipelines/components/PipelineEditor/PipelineEditor.tsx`
  - wrapped toolbar/status controls, preserved title space, bounded side panel width, fixed tab-list height, and changed save status to live `output`.
- `apps/desktop/src/renderer/routes/_authenticated/_dashboard/pipelines/components/PipelineEditor/PipelineCanvas/PipelineCanvas.tsx`
  - added canvas and add-node labels, constrained/wrapped the top-left add-node panel.
- `apps/desktop/src/renderer/routes/_authenticated/_dashboard/pipelines/components/PipelineEditor/RoleLibraryPanel/RoleLibraryPanel.tsx`
  - wrapped header actions and made add-role labels contextual.
- `apps/desktop/src/renderer/routes/_authenticated/_dashboard/pipelines/components/PipelineEditor/TriggerConfigPanel/TriggerConfigPanel.tsx`
  - added selected-node title text, trigger truncation, and contextual switch/delete labels.
- `apps/desktop/src/renderer/routes/_authenticated/_dashboard/pipelines/components/PipelineEditor/RunMonitorPanel/RunMonitorPanel.tsx`
  - extracted a run-history button with `aria-pressed`, contextual label, focus ring, and truncation.

## Commands

- `bunx @biomejs/biome@2.4.2 check --write --unsafe apps/desktop/src/renderer/routes/_authenticated/_dashboard/pipelines/components/PipelinesIndex/PipelinesIndex.tsx apps/desktop/src/renderer/routes/_authenticated/_dashboard/pipelines/components/PipelineEditor/PipelineEditor.tsx apps/desktop/src/renderer/routes/_authenticated/_dashboard/pipelines/components/PipelineEditor/PipelineCanvas/PipelineCanvas.tsx apps/desktop/src/renderer/routes/_authenticated/_dashboard/pipelines/components/PipelineEditor/RoleLibraryPanel/RoleLibraryPanel.tsx apps/desktop/src/renderer/routes/_authenticated/_dashboard/pipelines/components/PipelineEditor/TriggerConfigPanel/TriggerConfigPanel.tsx apps/desktop/src/renderer/routes/_authenticated/_dashboard/pipelines/components/PipelineEditor/RunMonitorPanel/RunMonitorPanel.tsx`
  - result: fixed formatting only.
- `bunx @biomejs/biome@2.4.2 check apps/desktop/src/renderer/routes/_authenticated/_dashboard/pipelines/components/PipelinesIndex/PipelinesIndex.tsx apps/desktop/src/renderer/routes/_authenticated/_dashboard/pipelines/components/PipelineEditor/PipelineEditor.tsx apps/desktop/src/renderer/routes/_authenticated/_dashboard/pipelines/components/PipelineEditor/PipelineCanvas/PipelineCanvas.tsx apps/desktop/src/renderer/routes/_authenticated/_dashboard/pipelines/components/PipelineEditor/RoleLibraryPanel/RoleLibraryPanel.tsx apps/desktop/src/renderer/routes/_authenticated/_dashboard/pipelines/components/PipelineEditor/TriggerConfigPanel/TriggerConfigPanel.tsx apps/desktop/src/renderer/routes/_authenticated/_dashboard/pipelines/components/PipelineEditor/RunMonitorPanel/RunMonitorPanel.tsx`
  - result: `Checked 6 files ... No fixes applied.`
- `bun test apps/desktop/src/renderer/routes/_authenticated/_dashboard/pipelines/components/PipelineEditor/graph-adapter.test.ts`
  - result: `4 pass`, `0 fail`, `18 expect() calls`.
- `git diff --check`
  - result: passed.
- `bun run --cwd apps/desktop typecheck`
  - result: file icons/routes generated, `tsc --noEmit` passed.
- `bun run lint`
  - result: `Checked 5409 files ... No fixes applied.`

## Screenshot / Evidence

- Temporary portless harness URL: `https://rox-pipeline-ux.t`
- Screenshot: `/Users/marklindgreen/.ai-agent-hub/evidence/playwright-smoke/agent-pipelines-ux-polish/agent-pipelines-harness-2026-06-17.png`
- Browser evidence:
  - rendered real `PipelinesIndex` and `PipelineEditor` components with mocked router/cloud-tRPC boundary data;
  - `bodyText.length`: `1116`;
  - `Пайплайны агентов` visible: `true`;
  - `Proof Review Pipeline With Long Name` visible: `true`;
  - create button width: `119.75px`;
  - tabs list display: `grid`, columns: `51.5px 51.5px 51.5px`.

Full desktop-shell screenshot was attempted first, but standalone Vite proof was blocked by unrelated eager dashboard/code-editor imports and persistent hash-history boot behavior. The accepted screenshot is therefore a scoped component harness, not a packaged app or full desktop shell proof.

## Remaining Risks

- Screenshot proof uses a temporary component harness with mocked router/cloud-tRPC data; it proves the touched renderer components render with the final classes, but it does not prove the entire authenticated desktop shell.
- No runtime or workflow-core behavior was changed or revalidated beyond the existing graph-adapter test.
